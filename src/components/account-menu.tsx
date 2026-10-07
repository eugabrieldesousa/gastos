"use client";

import { useState } from "react";
import { History, LogIn, LogOut, RefreshCw, Upload, UserRound } from "lucide-react";
import { toast } from "sonner";
import { loginWithGitHub, logout } from "@/app/account-actions";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";

export type FinanceAccount = { id: string; name: string };

export function AccountMenu({ account, enabled, busy, canTransfer, reload, transfer, historyUrl, beforeLeave }: {
  account?: FinanceAccount;
  enabled: boolean;
  busy: boolean;
  canTransfer: boolean;
  reload: () => Promise<void>;
  transfer: () => Promise<boolean>;
  historyUrl?: string;
  beforeLeave?: () => Promise<boolean>;
}) {
  const [notice, setNotice] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [transferring, setTransferring] = useState(false);

  async function transferConfirmed() {
    setTransferring(true);
    try {
      if (await transfer()) setConfirm(false);
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "Não foi possível transferir os dados.");
    } finally { setTransferring(false); }
  }

  if (!account) return <>
    {enabled ? <form action={async () => { if (!beforeLeave || await beforeLeave()) await loginWithGitHub(); }}>
      <Button className="account-button" type="submit" title="Entrar com GitHub" aria-label="Entrar com GitHub">
        <LogIn aria-hidden="true" /><span className="account-button-label">Entrar com GitHub</span>
      </Button>
    </form> : <Button className="account-button" title="Entrar com GitHub" aria-label="Entrar com GitHub" onClick={() => setNotice(true)}>
      <LogIn aria-hidden="true" /><span className="account-button-label">Entrar com GitHub</span>
    </Button>}
    <Dialog open={notice} onOpenChange={setNotice}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Login em preparação</DialogTitle>
          <DialogDescription>O salvamento na conta ainda precisa ser ativado. Por enquanto, seus dados ficam apenas neste navegador. Continue exportando backups para guardá-los.</DialogDescription>
        </DialogHeader>
      </DialogContent>
    </Dialog>
  </>;

  return <>
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" className="account-button" aria-label="Sua conta" title="Sua conta"><UserRound aria-hidden="true" /><span className="account-button-label">Conta</span></Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="account-menu">
        <div className="account-summary"><strong>{account.name}</strong><span>Conta conectada ao GitHub</span></div>
        <DropdownMenuSeparator />
        <DropdownMenuItem disabled={busy} onSelect={() => void reload()}><RefreshCw />Atualizar dados da conta</DropdownMenuItem>
        {historyUrl && <DropdownMenuItem asChild><a href={historyUrl} target="_blank" rel="noopener noreferrer"><History />Ver histórico no GitHub</a></DropdownMenuItem>}
        {canTransfer && <DropdownMenuItem disabled={busy} onSelect={() => setConfirm(true)}><Upload />Transferir dados deste navegador</DropdownMenuItem>}
        <DropdownMenuSeparator />
        <form action={async () => { if (!beforeLeave || await beforeLeave()) await logout(); }}><Button disabled={busy} type="submit" variant="ghost" className="w-full justify-start"><LogOut />Sair da conta</Button></form>
      </DropdownMenuContent>
    </DropdownMenu>
    <AlertDialog open={confirm} onOpenChange={(open) => { if (!transferring) setConfirm(open); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Transferir para {account.name}?</AlertDialogTitle>
          <AlertDialogDescription>Seus gastos, cartões e demais dados deste navegador serão copiados para esta conta, que ainda não possui dados salvos. Depois, estarão disponíveis ao entrar com o mesmo GitHub em outros dispositivos. A cópia local será preservada.</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={transferring}>Cancelar</AlertDialogCancel>
          <Button disabled={busy || transferring || !canTransfer} onClick={() => void transferConfirmed()}>{transferring ? "Transferindo…" : "Transferir para minha conta"}</Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </>;
}
