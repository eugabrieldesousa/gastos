"use client";

import { useEffect, useLayoutEffect, useState, useSyncExternalStore } from "react";
import { NoteAutosave } from "@/lib/note-autosave";
import type { useFinance } from "./use-finance";

export function useNotes(finance: ReturnType<typeof useFinance>) {
  const [editor] = useState(() => new NoteAutosave(() => finance));
  useLayoutEffect(() => { editor.setAccess(() => finance); });
  const snapshot = useSyncExternalStore(editor.subscribe, editor.getSnapshot, editor.getSnapshot);
  useEffect(() => { editor.observe(finance.data); }, [editor, finance.data]);
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
