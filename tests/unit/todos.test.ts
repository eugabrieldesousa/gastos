import { describe, expect, it } from "vitest";
import { emptyFinanceData, financeSchema, parseBackup, todoSchema } from "../../src/lib/finance";
import { financialReport } from "../../src/lib/finance-report";

const todo = { id: crypto.randomUUID(), text: "  Fazer compras  ", completed: false, createdAt: "2026-10-07T12:00:00.000Z", updatedAt: "2026-10-07T12:00:00.000Z" };
describe("tarefas e documentos v6", () => {
  it("migra v5 preservando finanças e notas e iniciando tarefas vazias", () => {
    const { todos: _todos, ...old } = emptyFinanceData(); void _todos;
    const note = { id: crypto.randomUUID(), title: "Ideias", content: "Guardar", createdAt: todo.createdAt, updatedAt: todo.updatedAt };
    const original = { ...old, version: 5, revision: 99, salaries: { "2026-10": 12345 }, notes: [note] };
    expect(parseBackup(JSON.stringify(original))).toEqual({ ...original, version: 6, todos: [] });
  });
  it("tarefas entram no backup com conclusão e não entram no relatório financeiro", () => {
    const data = financeSchema.parse({ ...emptyFinanceData(), todos: [todo] });
    expect(parseBackup(JSON.stringify(data))).toEqual(data); expect(data.todos[0].text).toBe("Fazer compras");
    expect(JSON.stringify(financialReport(data, "2026-10", "2026-10-07"))).not.toContain("Fazer compras");
  });
  it("valida texto, datas, limites e identificadores únicos", () => {
    expect(todoSchema.safeParse({ ...todo, text: "   " }).success).toBe(false);
    expect(todoSchema.safeParse({ ...todo, text: "a".repeat(501) }).success).toBe(false);
    expect(todoSchema.safeParse({ ...todo, updatedAt: "2025-01-01T00:00:00.000Z" }).success).toBe(false);
    expect(financeSchema.safeParse({ ...emptyFinanceData(), todos: [todo, todo] }).success).toBe(false);
    expect(financeSchema.safeParse({ ...emptyFinanceData(), todos: Array.from({ length: 10001 }, () => ({ ...todo, id: crypto.randomUUID() })) }).success).toBe(false);
  });
});
