"use client";

import { useState } from "react";
import { ListTodo, Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "./ui/alert-dialog";
import { todoSchema, type FinanceData, type Todo } from "@/lib/finance";

export function TodosPanel({ todos, disabled, commit }: {
  todos: Todo[]; disabled: boolean;
  commit: (change: (data: FinanceData) => FinanceData, message: string) => Promise<boolean>;
}) {
  const [text, setText] = useState("");
  const [editing, setEditing] = useState<Todo | null>(null);
  const [deleting, setDeleting] = useState<Todo | null>(null);
  const ordered = todos.map((todo, index) => ({ todo, index })).sort((a, b) => Number(a.todo.completed) - Number(b.todo.completed)
    || a.todo.createdAt.localeCompare(b.todo.createdAt) || a.index - b.index);
  async function save() {
    if (disabled || !text.trim()) return;
    const now = new Date().toISOString();
    const todo = todoSchema.parse(editing ? { ...editing, text, updatedAt: [now, editing.updatedAt].sort().at(-1)! }
      : { id: crypto.randomUUID(), text, completed: false, createdAt: now, updatedAt: now });
    if (await commit((data) => {
      if (editing && !data.todos.some((item) => item.id === editing.id)) throw new Error("Esta tarefa foi excluída. Atualize a lista antes de editar.");
      return { ...data, todos: editing ? data.todos.map((item) => item.id === todo.id ? { ...item, text: todo.text, updatedAt: todo.updatedAt } : item) : [...data.todos, todo] };
    }, editing ? "Tarefa atualizada." : "Tarefa adicionada.")) { setText(""); setEditing(null); }
  }
  return <section className="panel todos-panel" aria-label="Lista de tarefas">
    <div className="panel-heading"><h2><ListTodo size={18} />Coisas a fazer</h2><span>{todos.filter((todo) => !todo.completed).length} pendentes</span></div>
    <form className="todo-form" onSubmit={(event) => { event.preventDefault(); void save(); }}>
      <Label htmlFor="todo-text">{editing ? "Editar tarefa" : "Nova tarefa"}</Label>
      <div className="todo-form-actions"><Input id="todo-text" maxLength={500} placeholder="O que você precisa fazer?" value={text} disabled={disabled} onChange={(event) => setText(event.target.value)} />
        <Button disabled={disabled || !text.trim()} type="submit"><Plus />{editing ? "Salvar tarefa" : "Adicionar"}</Button>
        {editing && <Button type="button" variant="outline" onClick={() => { setEditing(null); setText(""); }}>Cancelar edição</Button>}
      </div>
    </form>
    <div className="panel-scroll">{ordered.length ? <ul className="todo-list">{ordered.map(({ todo }) => <li key={todo.id} className={todo.completed ? "todo-completed" : ""}>
      <label className="todo-check"><input type="checkbox" checked={todo.completed} disabled={disabled} onChange={(event) => {
        const completed = event.target.checked;
        void commit((data) => ({ ...data, todos: data.todos.map((item) => item.id === todo.id ? { ...item, completed,
          updatedAt: [new Date().toISOString(), item.updatedAt].sort().at(-1)! } : item) }), completed ? "Tarefa concluída." : "Tarefa reaberta.");
      }} /><span>{todo.text}</span></label>
      <Button size="icon" variant="ghost" aria-label={`Editar tarefa: ${todo.text}`} disabled={disabled} onClick={() => { setEditing(todo); setText(todo.text); document.getElementById("todo-text")?.focus(); }}><Pencil size={16} /></Button>
      <Button size="icon" variant="ghost" aria-label={`Excluir tarefa: ${todo.text}`} disabled={disabled} onClick={() => setDeleting(todo)}><Trash2 size={16} /></Button>
    </li>)}</ul> : <p className="small-empty">Adicione sua primeira tarefa. Marque o checkbox quando terminar.</p>}</div>
    <AlertDialog open={Boolean(deleting)} onOpenChange={(open) => { if (!open && !disabled) setDeleting(null); }}><AlertDialogContent>
      <AlertDialogHeader><AlertDialogTitle>Excluir tarefa?</AlertDialogTitle><AlertDialogDescription>A tarefa “{deleting?.text}” será excluída.</AlertDialogDescription></AlertDialogHeader>
      <AlertDialogFooter><AlertDialogCancel disabled={disabled}>Cancelar</AlertDialogCancel><Button variant="destructive" disabled={disabled} onClick={async () => {
        if (deleting && await commit((data) => ({ ...data, todos: data.todos.filter((todo) => todo.id !== deleting.id) }), "Tarefa excluída.")) {
          if (editing?.id === deleting.id) { setEditing(null); setText(""); } setDeleting(null);
        }
      }}>Excluir tarefa</Button></AlertDialogFooter>
    </AlertDialogContent></AlertDialog>
  </section>;
}
