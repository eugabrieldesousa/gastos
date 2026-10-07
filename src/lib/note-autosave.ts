import { saveNote, type FinanceData, type Note } from "./finance";

type Access = {
  getData: () => FinanceData;
  commit: (change: (data: FinanceData) => FinanceData, message: string, options?: { silent?: boolean }) => Promise<boolean>;
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

  constructor(private access: () => Access) {}
  setAccess(access: () => Access) { this.access = access; }
  getSnapshot = () => this.state;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };
  private publish(update: Partial<Snapshot>) {
    this.state = { ...this.state, ...update };
    this.listeners.forEach((listener) => listener());
  }
  private cancelTimer() { clearTimeout(this.timer); this.timer = undefined; }
  dispose() { this.cancelTimer(); }
  clearAfterDelete() {
    this.cancelTimer();
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
    this.timer = setTimeout(() => { void this.flush(); }, 1200);
  }
  observe(data: FinanceData) {
    if (!this.state.draft || this.saving) return;
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
    while (this.state.dirty && this.state.draft) {
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
