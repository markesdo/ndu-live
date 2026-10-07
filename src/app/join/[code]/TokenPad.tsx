"use client";
// „Der Raum schreibt den Prompt“ – Handy-Seite: eine große Taste, jeder Tipp ist ein Token.
// Tipps werden gezählt und höchstens alle 2 s gebündelt per Broadcast (REST, ohne Kanal-Beitritt) an die
// Leinwand geschickt. Kein Schreiben in die Datenbank, keine Vibration pro Tipp. Sobald die Leinwand
// weiterblättert, verschwindet die Taste und es geht nichts mehr raus – auch nicht der Rest im Zähler.
import { useEffect, useRef, useState, type RefObject } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { supabase } from "@/lib/supabase";
import { FLUSH_MS, batchSize, promptWords } from "@/lib/energy";

const SPRING = { type: "spring", stiffness: 500, damping: 30 } as const;
const WORDS = promptWords(0).filter((w) => !/^\d/.test(w));

function buzz(pattern: number | number[]) {
  try { navigator.vibrate?.(pattern); } catch {}
}

// Stufe kommt per Broadcast von der Leinwand: 0..2 laufend, 3 = fertig, null = noch nichts gehört.
const LABEL = ["Tippen = Token", "Agent arbeitet …", "Deployen …", "✓ Deployed"];
const BORDER = ["border-border", "border-accent-2", "border-blue", "border-ok"];

export default function TokenPad({ code, pid, stage, stepRef, padStep }: {
  code: string; pid: string; stage: number | null;
  // Schritt der Session als Ref: Die Taste lebt beim Weiterblättern noch kurz in der Ausblende-Animation –
  // über die Ref merkt sie sofort, dass sie nichts mehr senden darf.
  stepRef: RefObject<number | null>; padStep: number;
}) {
  const reduce = useReducedMotion();
  const [mine, setMine] = useState(0);
  const [chips, setChips] = useState<{ id: number; word: string }[]>([]);
  const pending = useRef(0);
  const seq = useRef(0);
  const sending = useRef(false);
  const tapCount = useRef(0);
  const done = stage !== null && stage >= 3;
  const doneRef = useRef(done);
  useEffect(() => { doneRef.current = done; }, [done]);

  // Bei jedem Stufenwechsel einmal vibrieren (nicht beim ersten Hören).
  const lastStage = useRef<number | null>(null);
  useEffect(() => {
    if (stage === null) return;
    if (lastStage.current !== null && stage > lastStage.current) buzz([30, 40, 60]);
    lastStage.current = stage;
  }, [stage]);

  useEffect(() => {
    // Nur zum Senden, nie abonniert – sonst bekäme jedes Handy alle Nachrichten aller anderen.
    const channel = supabase.channel(`energy-${code}`);
    let stopped = false;
    const flush = async () => {
      if (stopped || sending.current) return;
      if (stepRef.current !== padStep || doneRef.current) { pending.current = 0; return; }
      if (typeof navigator !== "undefined" && navigator.onLine === false) { pending.current = batchSize(pending.current); return; }
      const n = batchSize(pending.current);
      if (n === 0) return;
      pending.current = 0; // was über 24 hinausgeht, verfällt (Deckel gegen Autoklicker)
      sending.current = true;
      seq.current += 1;
      try {
        await channel.httpSend("tokens", { pid, n, seq: seq.current });
      } catch {
        // Netz weg: einmal wieder vormerken, gedeckelt – beim nächsten Takt neu versuchen.
        if (!stopped) pending.current = batchSize(pending.current + n);
      } finally {
        sending.current = false;
      }
    };
    const timer = setInterval(flush, FLUSH_MS);
    return () => {
      stopped = true;
      clearInterval(timer);
      pending.current = 0; // nie beim Abbauen nachsenden
      supabase.removeChannel(channel);
    };
  }, [code, pid, stepRef, padStep]);

  function tap() {
    if (done || stepRef.current !== padStep) return;
    pending.current += 1;
    tapCount.current += 1;
    setMine((m) => m + 1);
    if (!reduce && tapCount.current % 12 === 0) {
      const id = tapCount.current;
      const word = WORDS[(id / 12 - 1) % WORDS.length];
      setChips((c) => [...c.slice(-3), { id, word }]);
      setTimeout(() => setChips((c) => c.filter((x) => x.id !== id)), 600);
    }
  }

  const s = stage === null ? 0 : Math.min(stage, 3);
  return (
    <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ ...SPRING, delay: 0.15 }} className="mt-4">
      <p className="mb-3 text-[15px] leading-snug text-muted">
        Der Raum schreibt gerade seinen ersten Prompt – jeder Tipp ist ein Token. Schau auf die Leinwand.
      </p>
      <div className="relative">
        <motion.button type="button" onClick={tap} disabled={done} aria-label={done ? "Fertig – Deployed" : "Token senden"}
          whileTap={done ? undefined : { scale: 0.96 }} transition={SPRING}
          className={`flex min-h-[160px] w-full flex-col items-center justify-center gap-2 rounded-2xl border-2 bg-card px-4 text-center transition-colors duration-500 ${BORDER[s]} disabled:cursor-default`}>
          <span className="flex items-center gap-3 font-display text-[22px] font-bold" aria-live="polite">
            {!done && <TapMark count={mine} reduce={!!reduce} />}
            <span className={done ? "text-ok" : ""}>{LABEL[s]}</span>
          </span>
          {done
            ? <span className="text-[15px] text-muted">Fertig. Die echte App bauen wir in 60 Minuten.</span>
            : <span className="font-mono text-[15px] tabular-nums text-muted">{mine} {mine === 1 ? "Token" : "Tokens"}{s > 0 ? " · weiter tippen" : ""}</span>}
          {stage !== null && !done && <span className="font-mono text-[12px] uppercase tracking-[0.12em] text-muted">{s + 1}/3</span>}
        </motion.button>
        <div className="pointer-events-none absolute inset-x-0 top-0 flex justify-center" aria-hidden>
          <AnimatePresence>
            {chips.map((c) => (
              <motion.span key={c.id} initial={{ opacity: 0, y: 0 }} animate={{ opacity: 1, y: -36 }} exit={{ opacity: 0, y: -56 }}
                transition={{ duration: 0.5, ease: [0.2, 0, 0, 1] }}
                className="absolute rounded-full bg-blue/20 px-3 py-1 font-mono text-[13px] text-blue">+„{c.word}“</motion.span>
            ))}
          </AnimatePresence>
        </div>
      </div>
    </motion.div>
  );
}

// Kleiner Cursor-Block, der bei jedem Tipp kurz blau aufleuchtet (nur Deckkraft – ruhig, wenn niemand tippt).
function TapMark({ count, reduce }: { count: number; reduce: boolean }) {
  return (
    <motion.span key={reduce ? "static" : count} initial={reduce ? false : { opacity: 1 }} animate={{ opacity: 0.35 }}
      transition={{ duration: 0.35 }} className="inline-block h-[0.9em] w-[0.5em] bg-blue" aria-hidden />
  );
}
