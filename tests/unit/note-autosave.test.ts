import { afterEach, describe, expect, it, vi } from "vitest";
import { emptyFinanceData, type FinanceData, type Note } from "../../src/lib/finance";
import { NoteAutosave } from "../../src/lib/note-autosave";

const note = (): Note => ({ id: crypto.randomUUID(), title: "Ideia", content: "Original", createdAt: "2026-10-07T12:00:00.000Z", updatedAt: "2026-10-07T12:00:00.000Z" });
function setup() {
  let data: FinanceData = emptyFinanceData();
  const commit = vi.fn(async (change: (previous: FinanceData) => FinanceData) => {
    data = { ...change(data), revision: data.revision + 1 };
    return true;
  });
  const editor = new NoteAutosave(() => ({ getData: () => data, commit }));
  return { editor, commit, getData: () => data, setData: (next: FinanceData) => { data = next; editor.observe(data); } };
}
afterEach(() => { vi.useRealTimers(); });
describe("salvamento automático de notas", () => {
  it("recupera rascunho persistido após recarregar, sem perder o texto", async () => {
    let stored: unknown = null;
    let data = emptyFinanceData();
    const access = () => ({ getData: () => data,
      commit: async (change: (previous: FinanceData) => FinanceData) => { data = change(data); return true; },
      writeDraft: (value: unknown) => { stored = structuredClone(value); }, readDraft: () => stored });
    const first = new NoteAutosave(access); await first.select(note()); first.edit({ content: "Texto ainda não enviado" }); first.dispose();
    expect(stored).toBeTruthy();
    const reopened = new NoteAutosave(access); reopened.recoverDraft();
    expect(reopened.getSnapshot().draft?.content).toBe("Texto ainda não enviado"); expect(reopened.getSnapshot().dirty).toBe(true);
    await reopened.flush(); expect(data.notes[0].content).toBe("Texto ainda não enviado"); expect(stored).toBeNull(); reopened.dispose();
  });
  it("suspende autosave antes da limpeza e não recria uma nota excluída", async () => {
    vi.useFakeTimers(); const { editor, commit, getData, setData } = setup();
    await editor.select(note()); editor.edit({ content: "Excluir também este rascunho" });
    await editor.suspend(); setData(emptyFinanceData()); editor.clearAfterDelete();
    await vi.advanceTimersByTimeAsync(5000); expect(commit).not.toHaveBeenCalled(); expect(getData().notes).toEqual([]); expect(editor.getSnapshot().draft).toBeNull(); editor.dispose();
  });
  it("aguarda salvamento em andamento antes de limpar", async () => {
    const context = setup(); const original = context.commit.getMockImplementation()!;
    let finish!: () => void;
    context.commit.mockImplementationOnce(async (change) => { await new Promise<void>((resolve) => { finish = resolve; }); return original(change); });
    await context.editor.select(note()); const pending = context.editor.flush(); await Promise.resolve();
    const suspended = context.editor.suspend(); finish(); await suspended; await pending;
    context.setData(emptyFinanceData()); context.editor.clearAfterDelete();
    expect(context.getData().notes).toEqual([]); expect(await context.editor.flush()).toBe(true); expect(context.commit).toHaveBeenCalledTimes(1); context.editor.dispose();
  });
  it("aguarda 1,2 segundo, reinicia ao digitar e salva silenciosamente", async () => {
    vi.useFakeTimers();
    const { editor, commit, getData } = setup();
    await editor.select(note());
    editor.edit({ title: "Freelas" });
    await vi.advanceTimersByTimeAsync(1000);
    expect(commit).not.toHaveBeenCalled();
    editor.edit({ content: "Planejar" });
    await vi.advanceTimersByTimeAsync(1199);
    expect(commit).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(commit).toHaveBeenCalledTimes(1);
    expect(commit.mock.calls[0]).toHaveLength(3);
    expect(getData().notes[0]).toMatchObject({ title: "Freelas", content: "Planejar" });
    expect(editor.getSnapshot()).toMatchObject({ dirty: false, status: "saved" });
    editor.dispose();
  });
  it("serializa gravações e salva digitação feita durante uma requisição", async () => {
    const context = setup();
    const original = context.commit.getMockImplementation()!;
    let finish!: () => void;
    context.commit.mockImplementationOnce(async (change) => {
      await new Promise<void>((resolve) => { finish = resolve; });
      return original(change);
    });
    await context.editor.select(note());
    context.editor.edit({ content: "Primeira edição" });
    const pending = context.editor.flush();
    await Promise.resolve();
    context.editor.edit({ content: "Texto final" });
    expect(context.editor.flush()).toBe(pending);
    finish();
    expect(await pending).toBe(true);
    expect(context.commit).toHaveBeenCalledTimes(2);
    expect(context.getData().notes[0].content).toBe("Texto final");
    context.editor.dispose();
  });
  it("preserva texto e bloqueia troca e saída quando o salvamento falha", async () => {
    const { editor, commit, getData } = setup();
    await editor.select(note());
    editor.edit({ content: "Não perder" });
    commit.mockResolvedValue(false);
    expect(await editor.select(null)).toBe(false);
    expect(editor.getSnapshot()).toMatchObject({ dirty: true, status: "error", draft: { content: "Não perder" } });
    expect(getData().notes).toHaveLength(0);
    editor.dispose();
  });
  it("mantém rascunho em conflito e exige revisão explícita", async () => {
    const { editor, getData, setData, commit } = setup();
    const initial = note();
    setData({ ...getData(), notes: [initial] });
    await editor.select(initial);
    editor.edit({ content: "Meu rascunho" });
    const remote = { ...initial, content: "Outro dispositivo", updatedAt: "2026-10-07T13:00:00.000Z" };
    setData({ ...getData(), notes: [remote] });
    expect(editor.getSnapshot()).toMatchObject({ status: "conflict", draft: { content: "Meu rascunho" }, remote });
    expect(await editor.flush()).toBe(false);
    expect(commit).not.toHaveBeenCalled();
    editor.keepDraftAfterReview();
    expect(await editor.flush()).toBe(true);
    expect(getData().notes[0].content).toBe("Meu rascunho");
    editor.dispose();
  });
  it("atualiza nota limpa, aceita mudança financeira durante rascunho e detecta exclusão remota", async () => {
    const { editor, getData, setData } = setup();
    const initial = note();
    setData({ ...getData(), notes: [initial] });
    await editor.select(initial);
    setData({ ...getData(), notes: [{ ...initial, title: "Novo título" }] });
    expect(editor.getSnapshot().draft?.title).toBe("Novo título");
    editor.edit({ content: "Pendente" });
    setData({ ...getData(), salaries: { "2026-10": 100000 } });
    expect(await editor.flush()).toBe(true);
    expect(getData().salaries["2026-10"]).toBe(100000);
    setData({ ...getData(), notes: [] });
    expect(editor.getSnapshot()).toMatchObject({ status: "conflict", dirty: true, remote: null });
    editor.useSavedVersion();
    expect(editor.getSnapshot().draft).toBeNull();
    editor.dispose();
  });
});
