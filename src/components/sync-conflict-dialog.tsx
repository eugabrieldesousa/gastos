"use client";

import { useState } from "react";
import { Button } from "./ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "./ui/dialog";
import { AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "./ui/alert-dialog";
import type { FinanceData } from "@/lib/finance";

function counts(data: FinanceData) { return `${data.expenses.length} gastos, ${data.incomes.length} ganhos, ${data.notes.length} notas, ${data.todos.length} tarefas`; }

export function SyncConflictDialog({ local, remote, open, onOpenChange, busy, download, resolve }: {
  local: FinanceData; remote: FinanceData | null; open: boolean; onOpenChange: (open: boolean) => void; busy: boolean;
  download: (data: FinanceData, filename: string) => void;
  resolve: (choice: "local" | "remote", reviewed: FinanceData) => Promise<boolean>;
}) {
  const [choice, setChoice] = useState<{ side: "local" | "remote"; reviewed: FinanceData } | null>(null);
  return <>
    <Dialog open={open && Boolean(remote)} onOpenChange={onOpenChange}><DialogContent className="sync-conflict-dialog">
      <DialogHeader><DialogTitle>Revisar conflito de sincronização</DialogTitle><DialogDescription>Este aparelho e a conta têm alterações diferentes. As duas versões foram preservadas. Compare os backups antes de escolher qual usar; essa escolha substitui o documento completo.</DialogDescription></DialogHeader>
      <div className="sync-versions"><section><h3>Neste aparelho</h3><p>{counts(local)}</p>
        <Button variant="outline" onClick={() => download(local, "orbt-conflito-aparelho.json")}>Baixar versão deste aparelho</Button>
        <Button disabled={busy || !remote} onClick={() => remote && setChoice({ side: "local", reviewed: remote })}>Manter dados deste aparelho</Button>
      </section><section><h3>Na conta</h3><p>{remote ? counts(remote) : ""}</p>
        <Button variant="outline" onClick={() => remote && download(remote, "orbt-conflito-conta.json")}>Baixar versão da conta</Button>
        <Button disabled={busy || !remote} onClick={() => remote && setChoice({ side: "remote", reviewed: remote })}>Usar dados da conta</Button>
      </section></div>
    </DialogContent></Dialog>
    <AlertDialog open={Boolean(choice)} onOpenChange={(value) => { if (!value && !busy) setChoice(null); }}><AlertDialogContent>
      <AlertDialogHeader><AlertDialogTitle>Confirmar versão escolhida?</AlertDialogTitle><AlertDialogDescription>
        {choice?.side === "local" ? "Os dados deste aparelho substituirão os dados da conta." : "Os dados da conta substituirão as alterações deste aparelho."} Uma cópia recuperável da versão substituída ficará disponível em Conta → Backups de conflitos.
      </AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel disabled={busy}>Cancelar</AlertDialogCancel>
        <Button disabled={busy} onClick={async () => {
          if (!choice) return;
          const success = await resolve(choice.side, choice.reviewed);
          setChoice(null); if (success) onOpenChange(false);
        }}>{busy ? "Sincronizando…" : "Confirmar substituição"}</Button>
      </AlertDialogFooter>
    </AlertDialogContent></AlertDialog>
  </>;
}
