"use client";
import { useCallback, useEffect, useRef, useState } from "react";

// Kurzer Hinweis, der nach `ms` wieder verschwindet. Der Timer wird beim Verlassen der Seite aufgeräumt.
// set() setzt einen Hinweis ohne Ablaufzeit (z. B. „Ordne Ideen …“) oder löscht ihn mit null.
export function useFlash(ms = 3000) {
  const [message, setMessage] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  const flash = useCallback((m: string) => {
    setMessage(m);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setMessage(null), ms);
  }, [ms]);
  const set = useCallback((m: string | null) => { clearTimeout(timer.current); setMessage(m); }, []);
  return { message, flash, set };
}
