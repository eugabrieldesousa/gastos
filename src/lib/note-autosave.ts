import { z } from "zod";
import { noteSchema, saveNote, type FinanceData, type Note } from "./finance";

type Access = {
  getData: () => FinanceData;
  commit: (change: (data: FinanceData) => FinanceData, message: string, options?: { silent?: boolean }) => Promise<boolean>;
  readDraft?: () => unknown;
  writeDraft?: (draft: unknown | null) => void;
};
type Snapshot = {
  draft: Note | null;
  dirty: boolean;
  status: "saved" | "pending" | "saving" | "error" | "conflict";
  remote: Note | null;
};
const sameNote = (a: Note | null, b: Note | null) => JSON.stringify(a) === JSON.stringify(b);

/** A single editor owns its draft; repository refreshes never replace unsaved text. */
export class NoteAutosave {
  private state: Snapshot = { draft: null, dirty: false, status: "saved", remote: null };
  private base: Note | null = null;
  private listeners = new Set<() => void>();
  private timer?: ReturnType<typeof setTimeout>;
  private saving?: Promise<boolean>;
  private generation = 0;
  private recovered = false;
  private suspended = false;

  constructor(private access: () => Access) {}
  setAccess(access: () => Access) { this.access = access; }
  getSnapshot = () => this.state;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };
  private publish(update: Partial<Snapshot>) {
    this.state = { ...this.state, ...update };
    try { this.access().writeDraft?.(this.state.dirty ? { version: 1, base: this.base, ...this.state } : null); }
    catch { this.state = { ...this.state, status: this.state.status === "conflict" ? "conflict" : "error" }; }
    this.listeners.forEach((listener) => listener());
  }
  recoverDraft() {
    if (this.recovered) return;
    this.recovered = true;
    try {
      const raw = this.access().readDraft?.();
      if (!raw) return;
      const saved = z.object({ version: z.literal(1), base: noteSchema.nullable(), draft: noteSchema.nullable(),
        dirty: z.boolean(), status: z.enum(["saved", "pending", "saving", "error", "conflict"]), remote: noteSchema.nullable() }).strict().parse(raw);
      this.base = saved.base;
      this.publish({ draft: saved.draft, dirty: saved.dirty, status: saved.status === "conflict" ? "conflict" : "pending", remote: saved.remote });
      this.observe(this.access().getData());
      if (this.state.status !== "conflict") this.schedule();
    } catch {
      // An unreadable draft must remain available for recovery, not be removed.
      this.state = { ...this.state, status: "error" };
      this.listeners.forEach((listener) => listener());
    }
  }
  async suspend() { this.suspended = true; this.cancelTimer(); await this.saving; }
  resume() { this.suspended = false; if (this.state.dirty && this.state.status !== "conflict") this.schedule(); }
  private cancelTimer() { clearTimeout(this.timer); this.timer = undefined; }
  dispose() { this.cancelTimer(); }
  clearAfterDelete() {
    this.cancelTimer();
    this.generation++;
    this.suspended = false;
    this.base = null;
    this.publish({ draft: null, dirty: false, status: "saved", remote: null });
  }

  async select(note: Note | null): Promise<boolean> {
    if (!await this.flush()) return false;
    this.base = note ? this.access().getData().notes.find((item) => item.id === note.id) ?? null : null;
    this.generation++;
    this.publish({ draft: this.base ?? note, dirty: Boolean(note && !this.base), status: note && !this.base ? "pending" : "saved", remote: null });
    if (note && !this.base) this.schedule();
    return true;
  }
  edit(changes: Pick<Note, "title"> | Pick<Note, "content">) {
    if (!this.state.draft) return;
    this.generation++;
    this.publish({ draft: { ...this.state.draft, ...changes }, dirty: true,
      status: this.state.status === "conflict" ? "conflict" : this.saving ? "saving" : "pending" });
    if (this.state.status !== "conflict") this.schedule();
  }
  private schedule() {
    this.cancelTimer();
    if (this.suspended) return;
    this.timer = setTimeout(() => { void this.flush(); }, 1200);
  }
  observe(data: FinanceData) {
    if (!this.state.draft || this.saving || this.suspended) return;
    const remote = data.notes.find((note) => note.id === this.state.draft!.id) ?? null;
    if (sameNote(remote, this.base)) return;
    if (this.state.dirty || !remote) {
      this.cancelTimer();
      this.publish({ dirty: true, status: "conflict", remote });
    } else {
      this.base = remote;
      this.publish({ draft: remote, remote: null });
    }
  }
  /** Explicit review retains the draft, then compares future writes with the reviewed version. */
  keepDraftAfterReview() {
    if (this.state.status !== "conflict") return;
    this.base = this.state.remote;
    this.publish({ status: "pending", remote: null });
    this.schedule();
  }
  useSavedVersion() {
    if (this.state.status !== "conflict") return;
    this.base = this.state.remote;
    this.publish({ draft: this.base, dirty: false, status: "saved", remote: null });
  }
  flush = (): Promise<boolean> => {
    this.cancelTimer();
    if (this.saving) return this.saving;
    if (this.suspended) return Promise.resolve(true);
    if (this.state.status === "conflict") return Promise.resolve(false);
    if (!this.state.dirty) return Promise.resolve(true);
    // Start on a microtask so this.saving is assigned before commit/observers run.
    this.saving = Promise.resolve().then(() => this.save()).finally(() => {
      this.saving = undefined;
      this.observe(this.access().getData());
    });
    return this.saving;
  };
  private async save(): Promise<boolean> {
    while (this.state.dirty && this.state.draft && !this.suspended) {
      const generation = this.generation;
      const base = this.base;
      const draft = this.state.draft;
      const note = { ...draft, updatedAt: [new Date().toISOString(), draft.createdAt, draft.updatedAt].sort().at(-1)! };
      let conflict = false;
      this.publish({ status: "saving" });
      let success = false;
      try {
        success = await this.access().commit((data) => {
          const remote = data.notes.find((item) => item.id === note.id) ?? null;
          if (!sameNote(remote, base)) {
            conflict = true;
            throw new Error("Esta nota mudou em outro dispositivo. Recarregue e revise antes de salvar.");
          }
          return saveNote(data, note);
        }, "Nota salva.", { silent: true });
      } catch { /* Keep the draft even when the caller rejects unexpectedly. */ }
      if (!success) {
        this.publish({ status: conflict ? "conflict" : "error", remote: this.access().getData().notes.find((item) => item.id === note.id) ?? null });
        return false;
      }
      this.base = note;
      if (generation === this.generation) this.publish({ draft: note, dirty: false, status: "saved" });
    }
    return true;
  }
}
