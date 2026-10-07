"use client";

import { useState } from "react";
import { ArrowLeft, FileText, Plus, Trash2 } from "lucide-react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "./ui/alert-dialog";
import type { useNotes } from "@/hooks/use-notes";
import type { FinanceData, Note } from "@/lib/finance";

const statusLabels = { saved: "Salvo", pending: "Alterações pendentes", saving: "Salvando…", error: "Não foi possível salvar. Seu texto foi preservado.", conflict: "Esta nota mudou em outro dispositivo. Seu rascunho foi preservado." };

export function NotesPanel({ notes, editor, draft, status, remote, ready, busy, reload, commit }: ReturnType<typeof useNotes> & {
  notes: Note[]; ready: boolean; busy: boolean; reload: () => Promise<void>;
  commit: (change: (data: FinanceData) => FinanceData, message: string) => Promise<boolean>;
}) {
  const [deleting, setDeleting] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  const ordered = [...notes].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || a.id.localeCompare(b.id));
  const listed = draft && !notes.some((note) => note.id === draft.id) ? [draft, ...ordered] : ordered;
  async function create() {
    const now = new Date().toISOString();
    if (await editor.select({ id: crypto.randomUUID(), title: "", content: "", createdAt: now, updatedAt: now })) setReviewing(false);
  }
  return <div className={`notes-panel ${draft ? "note-open" : ""}`}>
    <section className="panel notes-list" aria-label="Lista de notas">
      <div className="panel-heading"><h2><FileText size={18} />Suas notas</h2><Button size="sm" disabled={!ready || busy} onClick={() => void create()}><Plus />Nova nota</Button></div>
      <div className="panel-scroll">{listed.length ? listed.map((note) => <button key={note.id} className="note-list-item" aria-current={draft?.id === note.id ? "true" : undefined}
        onClick={async () => { if (draft?.id !== note.id && await editor.select(note)) setReviewing(false); }}>
        <strong>{(draft?.id === note.id ? draft.title : note.title).trim() || "Sem título"}</strong>
        <span>{(draft?.id === note.id ? draft.content : note.content).slice(0, 100) || "Nota vazia"}</span>
        <small>{new Date(note.updatedAt).toLocaleDateString("pt-BR")}</small>
      </button>) : <p className="small-empty">Crie sua primeira nota para guardar ideias e lembretes.</p>}</div>
    </section>
    <section className="panel note-editor" aria-label="Editor de nota">
      {draft ? <>
        <div className="panel-heading"><Button className="notes-back" variant="ghost" size="sm" onClick={() => void editor.select(null)}><ArrowLeft />Voltar às notas</Button>
          <span className={`note-status note-status-${status}`} role="status" aria-live="polite">{statusLabels[status]}</span>
          <Button variant="ghost" size="icon" aria-label="Excluir nota" disabled={!ready || busy} onClick={() => setDeleting(true)}><Trash2 size={16} /></Button></div>
        {(status === "error" || status === "conflict") && <div className="note-recovery">
          <Button size="sm" variant="outline" disabled={busy} onClick={async () => { await reload(); setReviewing(true); }}>Recarregar e revisar</Button>
          {status === "error" && <Button size="sm" disabled={!ready || busy} onClick={() => void editor.flush()}>Tentar salvar novamente</Button>}
          {status === "conflict" && reviewing && <div className="note-conflict-review">
            <strong>Versão salva</strong><p>{remote?.title.trim() || (remote ? "Sem título" : "Nota excluída")}</p><pre>{remote?.content ?? "Esta nota foi excluída em outro dispositivo."}</pre>
            <Button size="sm" disabled={!ready || busy} onClick={() => { editor.keepDraftAfterReview(); setReviewing(false); }}>{remote ? "Salvar meu rascunho sobre esta versão" : "Restaurar meu rascunho"}</Button>
            <Button size="sm" variant="outline" disabled={!ready || busy} onClick={() => { editor.useSavedVersion(); setReviewing(false); }}>Usar versão salva e descartar rascunho</Button>
          </div>}
        </div>}
        <div className="note-fields">
          <Label htmlFor="note-title">Título</Label><Input id="note-title" placeholder="Sem título" maxLength={120} disabled={busy} value={draft.title} onChange={(event) => editor.edit({ title: event.target.value })} />
          <Label htmlFor="note-content">Conteúdo</Label><textarea id="note-content" placeholder="Escreva sua nota…" maxLength={100000} disabled={busy} value={draft.content} onChange={(event) => editor.edit({ content: event.target.value })} />
          <small>Salvamento automático após uma pausa na digitação.</small>
        </div>
      </> : <div className="empty-state"><FileText /><h2>Um espaço para suas ideias</h2><p>Selecione uma nota ou crie uma nova.</p><Button disabled={!ready || busy} onClick={() => void create()}><Plus />Criar nota</Button></div>}
    </section>
    <AlertDialog open={deleting} onOpenChange={(open) => { if (!busy) setDeleting(open); }}><AlertDialogContent>
      <AlertDialogHeader><AlertDialogTitle>Excluir nota?</AlertDialogTitle><AlertDialogDescription>A nota {draft?.title.trim() || "Sem título"} será excluída.</AlertDialogDescription></AlertDialogHeader>
      <AlertDialogFooter><AlertDialogCancel disabled={busy}>Cancelar</AlertDialogCancel><Button variant="destructive" disabled={!ready || busy} onClick={async () => {
        if (!draft || !await editor.flush()) return;
        if (await commit((data) => ({ ...data, notes: data.notes.filter((note) => note.id !== draft.id) }), "Nota excluída.")) {
          editor.clearAfterDelete(); setDeleting(false);
        }
      }}>Excluir nota</Button></AlertDialogFooter>
    </AlertDialogContent></AlertDialog>
  </div>;
}
