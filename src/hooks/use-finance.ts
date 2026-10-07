"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { emptyFinanceData, localToday, type FinanceData } from "@/lib/finance";
import { LocalFinanceRepository, STORAGE_KEY, StorageConflictError } from "@/lib/repository";
import { AccountFinanceRepository, type AccountCache } from "@/lib/account-repository";

export type SyncStatus = "idle" | "syncing" | "synced" | "pending" | "error" | "conflict";

export function useFinance(userId?: string) {
  const repository = useMemo(() => userId ? new AccountFinanceRepository(userId) : new LocalFinanceRepository(), [userId]);
  const [data, setData] = useState<FinanceData>(emptyFinanceData);
  const [loading, setLoading] = useState(true);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [today, setToday] = useState("");
  const [cache, setCache] = useState<AccountCache | null>(null);
  const [localResetGeneration, setLocalResetGeneration] = useState(0);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>("idle");
  const [localAvailable, setLocalAvailable] = useState(false);
  const lock = useRef(false);
  const current = useRef(data);
  const mounted = useRef(false);
  const channel = useRef<BroadcastChannel | null>(null);
  const syncing = useRef<Promise<boolean> | null>(null);
  const generation = useRef(0);
  const beforeSync = useRef<(() => Promise<boolean>) | null>(null);
  const resetKey = `${STORAGE_KEY}.reset-generation`;
  const markLocalReset = (revision: number) => {
    try { localStorage.setItem(resetKey, String(revision)); }
    catch { toast.warning("Dados salvos, mas não foi possível avisar outras abas sobre a substituição. Feche as outras abas do app."); }
    setLocalResetGeneration(revision);
  };

  const accept = useCallback((next: FinanceData) => {
    const nextCache = repository instanceof AccountFinanceRepository ? repository.getCache() : null;
    const latest = nextCache?.data ?? next;
    current.current = latest;
    if (!mounted.current) return;
    setData(latest); setReady(true); setLoading(false); setToday(localToday()); setError(null);
    if (repository instanceof AccountFinanceRepository) {
      setCache(nextCache);
      if (!syncing.current) setSyncStatus(nextCache?.conflict ? "conflict" : nextCache?.pending ? "pending" : "synced");
    } else {
      try {
        const reset = Number(localStorage.getItem(`${STORAGE_KEY}.reset-generation`) ?? 0);
        setLocalResetGeneration(Number.isSafeInteger(reset) && reset >= 0 ? reset : 0);
      } catch { /* Document read reports storage errors. */ }
    }
  }, [repository]);

  const notify = useCallback(() => { channel.current?.postMessage({ userId }); }, [userId]);

  const sync = useCallback((manual = false): Promise<boolean> => {
    if (!(repository instanceof AccountFinanceRepository)) return Promise.resolve(true);
    if (syncing.current) return syncing.current;
    // Assign before flushing notes: a note commit may also request synchronization.
    syncing.current = Promise.resolve().then(async () => {
      if (mounted.current) setSyncStatus("syncing");
      try {
        const draftSaved = !beforeSync.current || await beforeSync.current();
        await repository.read();
        const result = await repository.synchronize();
        const latest = repository.getCache()!;
        accept(latest.data); notify();
        setSyncStatus(latest.conflict ? "conflict" : latest.pending ? "pending" : "synced");
        if (result.status === "conflict") {
          if (manual) toast.error("Os dados mudaram em outro aparelho. Revise as duas versões.");
          return false;
        }
        if (manual) {
          if (!draftSaved) toast.warning("Conta atualizada. O rascunho da nota foi preservado e ainda precisa de revisão.");
          else toast.success(latest.pending ? "Dados salvos neste aparelho; ainda há alterações para enviar." : "Dados da conta atualizados com sucesso.");
        }
        return !latest.pending;
      } catch (cause) {
        const message = cause instanceof Error ? cause.message : "Não foi possível sincronizar sua conta.";
        if (mounted.current) {
          setError(message); setSyncStatus("error");
          try {
            const latest = repository.getCache();
            if (latest) { current.current = latest.data; setData(latest.data); setCache(latest); setReady(true); }
          } catch { setReady(false); }
          setLoading(false); setToday(localToday());
        }
        if (manual) toast.error(message);
        return false;
      }
    }).finally(() => { syncing.current = null; });
    return syncing.current;
  }, [accept, notify, repository]);

  const reload = useCallback(async (): Promise<void> => {
    if (repository instanceof AccountFinanceRepository) { await sync(); return; }
    if (lock.current) return;
    const request = ++generation.current;
    try {
      const next = await repository.read();
      if (mounted.current && request === generation.current) accept(next);
    } catch (cause) {
      if (mounted.current && request === generation.current) {
        setError(cause instanceof Error ? cause.message : "Não foi possível carregar seus dados.");
        setReady(false); setLoading(false); setToday(localToday());
      }
    }
  }, [accept, repository, sync]);

  useEffect(() => {
    mounted.current = true;
    let active = true;
    const request = ++generation.current;
    void repository.read().then((next) => {
      if (!active || request !== generation.current) return;
      accept(next);
      if (userId) {
        try { setLocalAvailable(localStorage.getItem(STORAGE_KEY) !== null); } catch { /* Optional transfer. */ }
        void sync();
      }
    }, (cause: unknown) => {
      if (!active || request !== generation.current) return;
      setError(cause instanceof Error ? cause.message : "Não foi possível carregar seus dados.");
      setReady(false); setLoading(false); setToday(localToday());
    });
    const readWorkingCopy = () => {
      if (lock.current) return;
      if (repository instanceof AccountFinanceRepository) {
        try { const latest = repository.getCache(); if (latest) accept(latest.data); }
        catch (cause) { setError(cause instanceof Error ? cause.message : "Cópia local inválida."); setReady(false); }
      } else void reload();
    };
    const onStorage = (event: StorageEvent) => {
      if (event.key === (repository instanceof AccountFinanceRepository ? repository.key : STORAGE_KEY) || event.key === null) readWorkingCopy();
      if (!userId && event.key === `${STORAGE_KEY}.reset-generation`) readWorkingCopy();
    };
    const refresh = () => { if (userId && document.visibilityState === "visible") void sync(); };
    const timer = userId ? window.setInterval(refresh, 30_000) : undefined;
    if (userId && typeof BroadcastChannel !== "undefined") {
      channel.current = new BroadcastChannel("mes.finance.account");
      channel.current.onmessage = (event) => { if (event.data?.userId === userId) readWorkingCopy(); };
    }
    window.addEventListener("focus", refresh); window.addEventListener("online", refresh);
    document.addEventListener("visibilitychange", refresh); window.addEventListener("storage", onStorage);
    return () => {
      active = false; mounted.current = false; window.clearInterval(timer);
      channel.current?.close(); channel.current = null;
      window.removeEventListener("focus", refresh); window.removeEventListener("online", refresh);
      document.removeEventListener("visibilitychange", refresh); window.removeEventListener("storage", onStorage);
    };
  }, [accept, reload, repository, sync, userId]);

  const commit = async (change: (previous: FinanceData) => FinanceData, message: string,
    options?: { silent?: boolean; operation?: AccountCache["operation"] }): Promise<boolean> => {
    if (lock.current || !ready) return false;
    lock.current = true; generation.current++; setBusy(true);
    try {
      const next = change(current.current);
      const saved = repository instanceof AccountFinanceRepository
        ? await repository.write(next, current.current.revision, options?.operation)
        : await repository.write(next, current.current.revision);
      if (!userId && (options?.operation === "clear" || options?.operation === "restore")) markLocalReset(saved.revision);
      if (options?.operation === "clear") {
        const prefix = `${repository instanceof AccountFinanceRepository ? repository.key : STORAGE_KEY}.note-draft.`;
        try { for (const key of Object.keys(localStorage)) if (key.startsWith(prefix)) localStorage.removeItem(key); }
        catch { toast.warning("Dados limpos, mas não foi possível remover alguns rascunhos deste navegador."); }
      }
      accept(saved); notify();
      if (!options?.silent) toast.success(userId ? `${message} Salvo neste aparelho.` : message);
      if (userId) void sync();
      return true;
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "Não foi possível salvar seus dados.";
      setError(message);
      if (!options?.silent) toast.error(message);
      if (cause instanceof StorageConflictError) setReady(false);
      return false;
    } finally { lock.current = false; setBusy(false); }
  };

  const restore = async (backup: FinanceData): Promise<boolean> => {
    if (repository instanceof AccountFinanceRepository) return commit(() => backup, "Backup restaurado.", { operation: "restore" });
    if (lock.current) return false;
    lock.current = true; generation.current++; setBusy(true);
    try { const saved = await repository.restore(backup); markLocalReset(saved.revision); accept(saved); toast.success("Backup restaurado."); return true; }
    catch (cause) { const message = cause instanceof Error ? cause.message : "Não foi possível restaurar o backup."; setError(message); toast.error(message); return false; }
    finally { lock.current = false; setBusy(false); }
  };

  const transferLocal = async () => {
    if (!(repository instanceof AccountFinanceRepository) || repository.getCache()?.base.revision !== 0 || repository.getCache()?.pending) return false;
    const local = await new LocalFinanceRepository().read();
    return commit(() => local, "Dados transferidos para sua conta.");
  };

  const resolveConflict = async (choice: "local" | "remote", reviewed: FinanceData): Promise<boolean> => {
    if (!(repository instanceof AccountFinanceRepository) || lock.current) return false;
    if (syncing.current) await syncing.current;
    if (lock.current) return false;
    lock.current = true; setBusy(true); setSyncStatus("syncing");
    try {
      const result = await repository.resolveConflict(choice, reviewed);
      accept(repository.getCache()!.data); notify();
      if (result.status === "conflict") { toast.error("A conta mudou novamente. Revise a nova versão."); return false; }
      toast.success("Conflito resolvido. Dados da conta atualizados."); return true;
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "Não foi possível resolver o conflito.";
      try { const latest = repository.getCache(); if (latest) accept(latest.data); } catch { setReady(false); }
      setError(message); setSyncStatus("error"); toast.error(message); return false;
    } finally { lock.current = false; setBusy(false); }
  };

  const draftKey = `${repository instanceof AccountFinanceRepository ? repository.key : STORAGE_KEY}.note-draft`;
  return { data, loading, ready, busy, error, today, reload, commit, restore, localAvailable, transferLocal,
    sync, syncStatus, cache, resolveConflict, draftKey, draftGeneration: cache?.resetGeneration ?? localResetGeneration, getData: () => current.current,
    setBeforeSync: (callback: (() => Promise<boolean>) | null) => { beforeSync.current = callback; } };
}
