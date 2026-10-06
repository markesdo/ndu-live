"use client";
import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, MotionConfig, motion } from "motion/react";
import { QRCodeSVG } from "qrcode.react";
import { useSession } from "@/lib/useSession";
import { STEPS } from "@/lib/steps";

export default function PresentClient({ code }: { code: string }) {
  const { step, participants, answers, reactions, error, live } = useSession(code);
  const [key, setKey] = useState("");
  const [origin, setOrigin] = useState("");

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setOrigin(window.location.origin);
    try { setKey(localStorage.getItem("ndu-presenter-key") ?? ""); } catch {}
  }, []);

  const joinUrl = `${origin}/join/${code}`;
  const current = step === null ? null : STEPS[step] ?? STEPS[0];
  const stepAnswers = useMemo(() => answers.filter((a) => a.step === step), [answers, step]);
  const byName = useMemo(() => Object.fromEntries(participants.map((p) => [p.id, p])), [participants]);

  async function go(next: number) {
    if (next < 0 || next >= STEPS.length) return;
    const res = await fetch("/api/step", { method: "POST", body: JSON.stringify({ code, step: next, key }) });
    if (res.status === 401) {
      const k = prompt("Presenter-Key:") ?? "";
      setKey(k);
      try { localStorage.setItem("ndu-presenter-key", k); } catch {}
      if (k) fetch("/api/step", { method: "POST", body: JSON.stringify({ code, step: next, key: k }) });
    }
  }
  async function reset() {
    if (!confirm("Session zurücksetzen? Alle Teilnehmer und Antworten werden gelöscht.")) return;
    await fetch("/api/reset", { method: "POST", body: JSON.stringify({ code, key }) });
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (step === null) return;
      if (e.key === "ArrowRight" || e.key === " ") go(step + 1);
      if (e.key === "ArrowLeft") go(step - 1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, key]);

  if (error) return <div className="grid min-h-screen place-items-center text-muted">{error}</div>;
  if (!current || step === null) return <div className="grid min-h-screen place-items-center text-muted">Verbinde …</div>;

  return (
    <MotionConfig reducedMotion="user">
    <main className="relative flex min-h-screen flex-col overflow-hidden px-10 py-8">
      {/* Kopf */}
      <header className="flex items-center justify-between text-sm text-muted">
        <span className="font-mono text-xs uppercase tracking-[0.14em]">NDU Coding 2026 · Live</span>
        <span className="flex items-center gap-3">
          <span className="flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1 font-mono text-fg">
            <span className={`h-2 w-2 rounded-full ${live ? "live-dot bg-ok" : "bg-muted"}`} aria-hidden />
            <AnimatePresence mode="popLayout" initial={false}>
              <motion.span key={participants.length} initial={{ y: 10, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: -10, opacity: 0 }}
                transition={{ type: "spring", stiffness: 500, damping: 30 }} className="inline-block tabular-nums">{participants.length}</motion.span>
            </AnimatePresence>
            dabei
          </span>
          <span className="font-mono">{joinUrl.replace(/^https?:\/\//, "")}</span>
        </span>
      </header>

      {/* Inhalt */}
      <section className="flex flex-1 items-center">
        <AnimatePresence mode="wait">
          <motion.div key={step} initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -30 }} transition={{ duration: 0.35 }} className="w-full">
            {current.kind === "lobby" && (
              <div className="grid items-center gap-12 lg:grid-cols-[1fr_auto]">
                <div>
                  <h1 className="mb-4 text-6xl font-bold leading-[1.05]">Scannen.<br />Vorname.<br />Dabei sein.</h1>
                  <p className="mb-8 font-mono text-2xl text-muted">{joinUrl.replace(/^https?:\/\//, "")}</p>
                  <div className="flex flex-wrap gap-2">
                    <AnimatePresence>
                      {participants.map((p) => (
                        <motion.span key={p.id} initial={{ scale: 0, rotate: -20, y: 20 }} animate={{ scale: 1, rotate: 0, y: 0 }} transition={{ type: "spring", stiffness: 500, damping: 12 }}
                          className="rounded-full border border-border bg-card px-5 py-3 text-2xl">{p.emoji} {p.name}</motion.span>
                      ))}
                    </AnimatePresence>
                  </div>
                </div>
                <div className="rounded-3xl bg-white p-6 shadow-2xl">
                  {origin && <QRCodeSVG value={joinUrl} size={360} level="M" />}
                </div>
              </div>
            )}

            {current.kind === "poll" && (
              <div>
                <h1 className="mb-10 text-5xl font-bold">{current.title}</h1>
                <div className="grid gap-5">
                  {current.options.map((o, i) => {
                    const n = stepAnswers.filter((a) => a.value === o).length;
                    const pct = stepAnswers.length ? Math.round((100 * n) / stepAnswers.length) : 0;
                    const colors = ["bg-accent", "bg-accent-2", "bg-blue", "bg-emerald-400"];
                    return (
                      <div key={o}>
                        <div className="mb-2 flex justify-between text-2xl"><span>{o}</span><span className="text-muted">{n} · {pct}%</span></div>
                        <div className="h-8 overflow-hidden rounded-full bg-card">
                          <motion.div className={`h-full rounded-full ${colors[i % colors.length]}`} initial={{ width: 0 }} animate={{ width: `${Math.max(pct, n ? 3 : 0)}%` }} transition={{ type: "spring", stiffness: 80, damping: 20 }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
                <p className="mt-8 text-xl text-muted">{stepAnswers.length} von {participants.length} haben geantwortet</p>
              </div>
            )}

            {current.kind === "text" && (
              <div>
                <h1 className="mb-8 text-5xl font-bold">{current.title}</h1>
                <div className="flex flex-wrap gap-4">
                  <AnimatePresence>
                    {stepAnswers.map((a, i) => (
                      <motion.div key={a.id} initial={{ opacity: 0, scale: 0.6, x: -80, y: 80 }} animate={{ opacity: 1, scale: 1, x: 0, y: 0 }} transition={{ type: "spring", stiffness: 260, damping: 20 }}
                        style={{ rotate: ((i * 7) % 5) - 2 }}
                        className="max-w-sm rounded-2xl border border-border bg-card px-5 py-4 shadow-lg">
                        <p className="text-xl leading-snug">„{a.value}“</p>
                        <p className="mt-2 text-sm text-muted">{byName[a.participant_id]?.emoji} {byName[a.participant_id]?.name}</p>
                      </motion.div>
                    ))}
                  </AnimatePresence>
                  {stepAnswers.length === 0 && <p className="text-2xl text-muted">Tippt auf euren Handys …</p>}
                </div>
              </div>
            )}

            {current.kind === "finale" && (
              <div className="text-center">
                <motion.h1 initial={{ scale: 0.9 }} animate={{ scale: 1 }} className="mb-6 text-6xl font-bold leading-tight">{current.title}</motion.h1>
                <p className="font-mono text-2xl uppercase tracking-[0.12em] text-muted">Next.js · Supabase Realtime · Vercel · Claude Code</p>
                <p className="mt-10 text-2xl">Am Ende dieser drei Tage baut ihr so etwas selbst.</p>
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      </section>

      {/* Reaktionen steigen auf */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <AnimatePresence>
          {reactions.slice(-25).map((r) => (
            <motion.span key={r.id} initial={{ opacity: 1, y: "100vh", x: `${(parseInt(r.id.slice(0, 6), 16) % 90) + 5}vw` }} animate={{ opacity: 0, y: "-10vh" }} transition={{ duration: 3.5, ease: "easeOut" }}
              className="absolute text-5xl">{r.emoji}</motion.span>
          ))}
        </AnimatePresence>
      </div>

      {/* Steuerung (dezent) */}
      <footer className="flex items-center justify-between text-sm text-muted opacity-40 transition hover:opacity-100">
        <span>{step + 1} / {STEPS.length} · ← → zum Blättern</span>
        <span className="flex gap-2">
          <button onClick={() => go(step - 1)} className="rounded-lg border border-border px-3 py-1">Zurück</button>
          <button onClick={() => go(step + 1)} className="rounded-lg border border-border px-3 py-1">Weiter</button>
          <button onClick={reset} className="rounded-lg border border-border px-3 py-1">Reset</button>
        </span>
      </footer>
    </main>
    </MotionConfig>
  );
}
