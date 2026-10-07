"use client";

import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import { NoteAutosave } from "@/lib/note-autosave";
import type { useFinance } from "./use-finance";

export function useNotes(finance: ReturnType<typeof useFinance>) {
  const tabId = useRef<string | null>(null);
  const lastReset = useRef<number | null>(null);
  const draftKey = () => {
    if (!tabId.current) {
      try {
        tabId.current = sessionStorage.getItem("orbt.notes.tab") ?? crypto.randomUUID();
        sessionStorage.setItem("orbt.notes.tab", tabId.current);
      } catch { tabId.current = "shared"; }
    }
    return `${finance.draftKey}.${tabId.current}`;
  };
  const access = () => ({ ...finance,
    readDraft: () => {
      const raw = localStorage.getItem(draftKey());
      if (!raw) return null;
      const saved = JSON.parse(raw);
      if (!saved || !Number.isSafeInteger(saved.resetGeneration) || saved.resetGeneration < 0 || !("draft" in saved)) throw new Error("Rascunho inválido.");
      if (saved.resetGeneration !== finance.draftGeneration) { localStorage.removeItem(draftKey()); return null; }
      return saved.draft;
    },
    writeDraft: (value: unknown | null) => {
      if (value === null) localStorage.removeItem(draftKey());
      else localStorage.setItem(draftKey(), JSON.stringify({ resetGeneration: finance.draftGeneration, draft: value }));
    },
  });
  const [editor] = useState(() => new NoteAutosave(access));
  useLayoutEffect(() => { editor.setAccess(access); finance.setBeforeSync(editor.flush); });
  const snapshot = useSyncExternalStore(editor.subscribe, editor.getSnapshot, editor.getSnapshot);
  useLayoutEffect(() => {
    if (!finance.ready) return;
    const reset = finance.draftGeneration;
    if (lastReset.current !== null && reset !== lastReset.current) {
      void editor.suspend().then(() => editor.clearAfterDelete());
    }
    lastReset.current = reset;
  }, [editor, finance.draftGeneration, finance.ready]);
  useEffect(() => { if (finance.ready) { editor.recoverDraft(); editor.observe(finance.data); } }, [editor, finance.data, finance.ready]);
  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (!editor.getSnapshot().dirty) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", beforeUnload);
    return () => { editor.dispose(); window.removeEventListener("beforeunload", beforeUnload); };
  }, [editor]);
  return { editor, ...snapshot };
}
