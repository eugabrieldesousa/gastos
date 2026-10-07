"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { emptyFinanceData, localToday, type FinanceData } from "@/lib/finance";
import {
  LocalFinanceRepository,
  STORAGE_KEY,
  StorageConflictError,
} from "@/lib/repository";
import { RemoteFinanceRepository } from "@/lib/remote-repository";

export function useFinance(userId?: string) {
  const repository = useMemo(() => userId ? new RemoteFinanceRepository() : new LocalFinanceRepository(), [userId]);
  const [data, setData] = useState<FinanceData>(emptyFinanceData);
  const [loading, setLoading] = useState(true);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [today, setToday] = useState("");
  const lock = useRef(false);
  const current = useRef(data);
  const generation = useRef(0);
  const channel = useRef<BroadcastChannel | null>(null);
  const mounted = useRef(false);
  const [localAvailable, setLocalAvailable] = useState(false);

  const accept = useCallback((next: FinanceData) => {
    current.current = next;
    setData(next);
    setReady(true);
    setError(null);
  }, []);

  const reload = useCallback(async () => {
    if (lock.current) return;
    const requestGeneration = ++generation.current;
    try {
      const next = await repository.read();
      if (mounted.current && requestGeneration === generation.current) accept(next);
    } catch (cause) {
      if (!mounted.current || requestGeneration !== generation.current) return;
      setError(
        cause instanceof Error
          ? cause.message
          : "Não foi possível carregar seus dados.",
      );
      setReady(false);
    } finally {
      if (mounted.current && requestGeneration === generation.current) {
        setToday(localToday());
        setLoading(false);
        if (userId) {
          try { setLocalAvailable(window.localStorage.getItem(STORAGE_KEY) !== null); } catch { /* Local transfer is optional. */ }
        }
      }
    }
  }, [accept, repository, userId]);

  useEffect(() => {
    mounted.current = true;
    let active = true;
    const requestGeneration = ++generation.current;
    void repository.read().then(
      (next) => {
        if (!active || requestGeneration !== generation.current) return;
        accept(next);
        setToday(localToday());
        setLoading(false);
        if (userId) {
          try { setLocalAvailable(window.localStorage.getItem(STORAGE_KEY) !== null); } catch { /* Local transfer is optional. */ }
        }
      },
      (cause: unknown) => {
        if (!active || requestGeneration !== generation.current) return;
        setError(
          cause instanceof Error
            ? cause.message
            : "Não foi possível carregar seus dados.",
        );
        setReady(false);
        setToday(localToday());
        setLoading(false);
      },
    );
    const onStorage = (event: StorageEvent) => {
      if (!userId && (event.key === STORAGE_KEY || event.key === null)) void reload();
    };
    const refresh = () => {
      if (userId && document.visibilityState === "visible") void reload();
    };
    const timer = userId ? window.setInterval(refresh, 30_000) : undefined;
    if (userId && typeof BroadcastChannel !== "undefined") {
      channel.current = new BroadcastChannel("mes.finance.account");
      channel.current.onmessage = (event) => {
        if (event.data?.userId === userId) refresh();
      };
    }
    window.addEventListener("focus", refresh);
    window.addEventListener("online", refresh);
    document.addEventListener("visibilitychange", refresh);
    window.addEventListener("storage", onStorage);
    return () => {
      active = false;
      mounted.current = false;
      window.clearInterval(timer);
      channel.current?.close();
      channel.current = null;
      window.removeEventListener("focus", refresh);
      window.removeEventListener("online", refresh);
      document.removeEventListener("visibilitychange", refresh);
      window.removeEventListener("storage", onStorage);
    };
  }, [accept, reload, repository, userId]);

  const commit = async (
    change: (previous: FinanceData) => FinanceData,
    message: string,
    options?: { silent?: boolean },
  ): Promise<boolean> => {
    if (lock.current || !ready) return false;
    lock.current = true;
    generation.current++;
    setBusy(true);
    try {
      const next = await repository.write(
        change(current.current),
        current.current.revision,
      );
      accept(next);
      channel.current?.postMessage({ userId });
      if (!options?.silent) toast.success(message);
      return true;
    } catch (cause) {
      const message =
        cause instanceof Error
          ? cause.message
          : "Não foi possível salvar seus dados.";
      setError(message);
      if (!options?.silent) toast.error(message);
      if (userId || cause instanceof StorageConflictError) setReady(false);
      return false;
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };

  const restore = async (backup: FinanceData): Promise<boolean> => {
    if (lock.current) return false;
    lock.current = true;
    generation.current++;
    setBusy(true);
    try {
      // A cloud restore must not overwrite changes that this device has not read.
      accept(await (userId ? repository.write(backup, current.current.revision) : repository.restore(backup)));
      channel.current?.postMessage({ userId });
      toast.success("Backup restaurado.");
      return true;
    } catch (cause) {
      const message =
        cause instanceof Error
          ? cause.message
          : "Não foi possível restaurar o backup.";
      setError(message);
      toast.error(message);
      if (userId) setReady(false);
      return false;
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };

  const transferLocal = async () => {
    if (!userId || current.current.revision !== 0) return false;
    const local = await new LocalFinanceRepository().read();
    return commit((previous) => {
      if (previous.revision !== 0) throw new StorageConflictError();
      return { ...local, revision: 0 };
    }, "Dados transferidos para sua conta.");
  };

  return { data, loading, ready, busy, error, today, reload, commit, restore, localAvailable, transferLocal, getData: () => current.current };
}
