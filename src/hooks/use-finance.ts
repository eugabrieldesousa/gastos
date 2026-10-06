"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { emptyFinanceData, localToday, type FinanceData } from "@/lib/finance";
import {
  LocalFinanceRepository,
  STORAGE_KEY,
  StorageConflictError,
} from "@/lib/repository";

const repository = new LocalFinanceRepository();

export function useFinance() {
  const [data, setData] = useState<FinanceData>(emptyFinanceData);
  const [loading, setLoading] = useState(true);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [today, setToday] = useState("");
  const lock = useRef(false);
  const current = useRef(data);

  const accept = useCallback((next: FinanceData) => {
    current.current = next;
    setData(next);
    setReady(true);
    setError(null);
  }, []);

  const reload = useCallback(async () => {
    try {
      accept(await repository.read());
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Não foi possível carregar seus dados.",
      );
      setReady(false);
    } finally {
      setToday(localToday());
      setLoading(false);
    }
  }, [accept]);

  useEffect(() => {
    let active = true;
    void repository.read().then(
      (next) => {
        if (!active) return;
        accept(next);
        setToday(localToday());
        setLoading(false);
      },
      (cause: unknown) => {
        if (!active) return;
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
      if (event.key === STORAGE_KEY || event.key === null) void reload();
    };
    window.addEventListener("storage", onStorage);
    return () => {
      active = false;
      window.removeEventListener("storage", onStorage);
    };
  }, [accept, reload]);

  const commit = async (
    change: (previous: FinanceData) => FinanceData,
    message: string,
  ): Promise<boolean> => {
    if (lock.current || !ready) return false;
    lock.current = true;
    setBusy(true);
    try {
      const next = await repository.write(
        change(current.current),
        current.current.revision,
      );
      accept(next);
      toast.success(message);
      return true;
    } catch (cause) {
      const message =
        cause instanceof Error
          ? cause.message
          : "Não foi possível salvar seus dados.";
      setError(message);
      toast.error(message);
      if (cause instanceof StorageConflictError) setReady(false);
      return false;
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };

  const restore = async (backup: FinanceData): Promise<boolean> => {
    if (lock.current) return false;
    lock.current = true;
    setBusy(true);
    try {
      accept(await repository.restore(backup));
      toast.success("Backup restaurado.");
      return true;
    } catch (cause) {
      const message =
        cause instanceof Error
          ? cause.message
          : "Não foi possível restaurar o backup.";
      setError(message);
      toast.error(message);
      return false;
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };

  return { data, loading, ready, busy, error, today, reload, commit, restore };
}
