"use client";
import { useEffect, useState } from "react";
import { motion } from "motion/react";

// Gestalteter Dialog statt prompt()/confirm(): gleiche Schrift und Farben wie die Bühne, Esc schließt.
export function Dialog({ label, title, onCancel, children }: { label: string; title: string; onCancel: () => void; children: React.ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onCancel(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);
  return (
    <motion.div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-6 backdrop-blur-sm"
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onCancel}>
      <motion.div role="dialog" aria-modal="true" aria-labelledby="dlg-title" onClick={(e) => e.stopPropagation()}
        initial={{ y: 24, scale: 0.97, opacity: 0 }} animate={{ y: 0, scale: 1, opacity: 1 }} exit={{ y: 12, opacity: 0 }}
        transition={{ type: "spring", stiffness: 420, damping: 32 }}
        className="w-full max-w-md rounded-3xl border border-border bg-card p-8 shadow-2xl">
        <p className="mb-2 font-mono text-xs uppercase tracking-[0.14em] text-muted">{label}</p>
        <h2 id="dlg-title" className="mb-4 text-3xl font-bold">{title}</h2>
        {children}
      </motion.div>
    </motion.div>
  );
}

export function KeyDialog({ onSubmit, onCancel }: { onSubmit: (k: string) => Promise<boolean>; onCancel: () => void }) {
  const [value, setValue] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [wrong, setWrong] = useState(0);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!value || busy) return;
    setBusy(true);
    const ok = await onSubmit(value).catch(() => false);
    setBusy(false);
    if (!ok) setWrong((n) => n + 1);
  }

  return (
    <Dialog label="Presenter" title="Steuerung freischalten" onCancel={onCancel}>
      <p className="mb-6 text-lg text-muted">Der Key steht in <span className="font-mono text-fg">.env.local</span> unter <span className="font-mono text-fg">PRESENTER_KEY</span>. Einmal eingeben – dieser Browser merkt ihn sich.</p>
      <form onSubmit={submit}>
        <motion.div key={wrong} animate={wrong ? { x: [0, -8, 8, -5, 5, 0] } : undefined} transition={{ duration: 0.3 }}
          className="mb-2 flex items-center rounded-xl border-2 border-border bg-bg focus-within:border-accent">
          <input autoFocus type={show ? "text" : "password"} value={value} onChange={(e) => setValue(e.target.value)}
            aria-label="Presenter-Key" autoComplete="off" spellCheck={false}
            className="w-full bg-transparent px-4 py-3 font-mono text-lg ring-im-rahmen outline-none" />
          <button type="button" onClick={() => setShow((s) => !s)} className="px-4 text-sm text-muted hover:text-fg">{show ? "Verbergen" : "Zeigen"}</button>
        </motion.div>
        <p className="mb-6 h-5 text-sm text-accent" aria-live="polite">{wrong ? "Falscher Key – nochmal versuchen." : ""}</p>
        <div className="flex justify-end gap-3">
          <button type="button" onClick={onCancel} className="rounded-xl border border-border px-5 py-3 text-lg">Abbrechen</button>
          <button type="submit" disabled={!value || busy} aria-busy={busy}
            className="rounded-xl bg-accent px-5 py-3 text-lg font-semibold text-accent-ink disabled:bg-card-2 disabled:text-muted">
            {busy ? "Prüfe …" : "Freischalten"}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
