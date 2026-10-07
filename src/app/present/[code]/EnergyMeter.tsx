"use client";
// „Der Raum schreibt den Prompt“ – Leinwand-Seite. Einziger Zuhörer des Kanals energy-<code>: zählt die
// gebündelten Tipps der Handys (geprüft in accept()), schreibt Wort für Wort den Prompt und füllt drei Stufen:
// Prompt schreiben → Agent arbeitet → Deployen. Jede neue Stufe meldet die Leinwand per Broadcast an die Handys.
import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { supabase } from "@/lib/supabase";
import type { Participant } from "@/lib/useSession";
import { STAGES, STAGE_EVERY_MS, accept, emptyEnergy, promptWords, stageOf, stageProgress, stageTargets, wordsFor, type Msg } from "@/lib/energy";
import { ARRIVE, T } from "./parts";

export function useEnergy(code: string, participants: Participant[], preview: boolean) {
  const state = useRef(emptyEnergy());
  const known = useRef<Set<string>>(new Set());
  const count = useRef(0);
  const reached = useRef(0); // höchste erreichte Stufe – geht nie zurück
  const [total, setTotal] = useState(0);
  const [stage, setStage] = useState(0);
  useEffect(() => {
    known.current = new Set(participants.map((p) => p.id));
    count.current = participants.length;
  }, [participants]);

  useEffect(() => {
    const take = (msg: Msg, now: number) => { accept(state.current, msg, known.current, count.current, now, reached.current); };
    // Anzeige höchstens 10× pro Sekunde neu zeichnen – auch wenn 20 Handys gleichzeitig senden.
    const render = setInterval(() => {
      reached.current = Math.max(reached.current, stageOf(state.current.total, stageTargets(count.current)));
      setTotal((t) => (t === state.current.total ? t : state.current.total));
      setStage((s) => (s === reached.current ? s : reached.current));
    }, 100);

    if (preview) {
      // Vorschau ohne Netz: erfundene Tipps der erfundenen Leute.
      let i = 0;
      const fake = setInterval(() => {
        const ids = [...known.current];
        if (!ids.length) return;
        take({ pid: ids[i++ % ids.length], n: 6 + (i % 7) }, performance.now());
      }, 120);
      return () => { clearInterval(render); clearInterval(fake); };
    }

    const channel = supabase
      .channel(`energy-${code}`)
      .on("broadcast", { event: "tokens" }, ({ payload }) => take(payload as Msg, Date.now()))
      .subscribe();

    // Stand regelmäßig an die Handys (über den Session-Kanal, den die Leinwand ohnehin offen hat): so holen
    // Nachzügler, neu geladene Handys und verlorene Nachrichten auf. Jede Leinwand-Sitzung hat einen eigenen
    // Durchlauf (run) – nach einem Neuladen fangen die Handys mit ihr von vorn an statt auf „Deployed“ zu hängen.
    // randomUUID gibt es nur über HTTPS oder localhost – auf einer LAN-Adresse im Dev-Betrieb nicht.
    const run = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
    const session = supabase.channel(`session-${code}`);
    let lastSent = -1;
    const announce = () => { lastSent = reached.current; session.send({ type: "broadcast", event: "stage", payload: { run, stage: reached.current } }).catch(() => {}); };
    const beat = setInterval(announce, STAGE_EVERY_MS);
    const onStage = setInterval(() => { if (reached.current !== lastSent) announce(); }, 250);
    announce();
    return () => { clearInterval(render); clearInterval(beat); clearInterval(onStage); supabase.removeChannel(channel); };
  }, [code, preview]);

  return { total, stage };
}

// Der Zähler selbst läuft in der Lobby (useEnergy), damit sie ihre Überschrift kleiner machen kann, sobald er erscheint.
export default function EnergyMeter({ participants, total, stage }: { participants: Participant[]; total: number; stage: number }) {
  const reduce = useReducedMotion();
  const n = participants.length;
  const targets = stageTargets(n);
  const done = stage >= targets.length;
  const words = promptWords(n);
  const shown = stage > 0 ? words.length : wordsFor(total, targets, words.length);

  if (total === 0) return null;
  return (
    <motion.div initial={reduce ? { opacity: 0 } : { opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={ARRIVE}
      className="mt-[3vh] max-w-[60vw]">
      <p className="font-mono text-[clamp(18px,min(2.2vw,3.6vh),40px)] leading-snug">
        <span className="text-accent">› </span>
        {reduce
          ? words.slice(0, shown).join(" ")
          : words.slice(0, shown).map((w, i) => (
            <motion.span key={i} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.2 }}>{i ? " " : ""}{w}</motion.span>
          ))}
        {!done && <span className="caret ml-1 inline-block h-[0.9em] w-[0.5em] translate-y-[0.1em] bg-accent" aria-hidden />}
      </p>
      <div className="mt-4 flex items-center gap-4">
        <div className="h-[6px] flex-1 overflow-hidden rounded-full bg-card-2" aria-hidden>
          <div className={`h-full origin-left rounded-full transition-transform duration-300 ${done ? "bg-ok" : stage === 1 ? "bg-accent-2" : stage === 2 ? "bg-blue" : "bg-accent"}`}
            style={{ transform: `scaleX(${stageProgress(total, targets, stage)})` }} />
        </div>
        <span className={`${T.meta} shrink-0 uppercase tracking-[0.12em] ${done ? "text-ok" : "text-muted"}`} aria-live="polite">
          {done ? "✓ Deployed" : `${stage + 1}/3 · ${STAGES[stage]}`}
        </span>
      </div>
      <Rockets show={done && !reduce} />
    </motion.div>
  );
}

// Einmaliger Jubel bei „Deployed“: ein paar Raketen steigen auf (lokal, ohne Datenbank).
function Rockets({ show }: { show: boolean }) {
  return (
    <div className="pointer-events-none fixed inset-0 z-20 overflow-hidden" aria-hidden>
      <AnimatePresence>
        {show && Array.from({ length: 12 }, (_, i) => (
          <motion.span key={i} className="absolute bottom-0 text-[clamp(32px,3.4vw,56px)]" style={{ left: `${6 + ((i * 37) % 88)}vw` }}
            initial={{ y: "10vh", opacity: 1 }} animate={{ y: "-110vh", opacity: [1, 1, 0] }}
            transition={{ duration: 2.6, delay: i * 0.08, ease: [0.2, 0, 0, 1] }}>🚀</motion.span>
        ))}
      </AnimatePresence>
    </div>
  );
}
