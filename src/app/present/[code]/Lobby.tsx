"use client";
import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { QRCodeSVG } from "qrcode.react";
import type { Participant } from "@/lib/useSession";
import { ARRIVE, Glyph, T } from "./parts";

// Lobby: Zähler als Held, die neueste Person kurz groß („Hallo, Lea“). Die Namen fliegen als Schwarm über die Bühne
// (Swarm.tsx, Canvas dahinter) – Text und QR-Code sind mit data-swarm-meiden markiert, der Schwarm weicht ihnen aus.
export default function Lobby({ participants, joinUrl, showQr }: { participants: Participant[]; joinUrl: string; showQr: boolean }) {
  const newest = useArrivals(participants);
  const url = joinUrl.replace(/^https?:\/\//, "");
  // Sobald jemand da ist, rückt alles in ein schmales Band oben (Text links, kleinerer QR-Code rechts) – darunter
  // bleibt eine große freie Fläche für den Schwarm und den Ring. Vorher steht die große Begrüßung.
  const compact = participants.length > 0;
  const counter = (
    <span className="relative inline-block overflow-hidden align-bottom">
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span key={participants.length} initial={{ y: "60%", opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: "-60%", opacity: 0 }}
          transition={ARRIVE}
          className={`inline-block font-display ${compact ? "text-[clamp(56px,min(6.5vw,12vh),132px)]" : "text-[clamp(96px,11vw,200px)]"} font-extrabold leading-[0.9] tabular-nums`}>
          {participants.length}
        </motion.span>
      </AnimatePresence>
    </span>
  );
  return (
    <div className={`relative z-10 grid gap-[4vw] lg:grid-cols-[1fr_auto] ${compact ? "items-start" : "items-center"}`}>
      <div className="min-w-0">
        <motion.h2 layout data-swarm-meiden className={`w-fit ${compact ? "text-[clamp(26px,min(2.6vw,4.6vh),52px)]" : T.h2} font-extrabold leading-[1.05] tracking-[-0.03em] text-muted ${compact ? "mb-[1.5vh]" : "mb-6"}`}>
          {compact ? "Scannen. Vorname. Dabei sein." : <>Scannen.<br />Vorname.<br />Dabei sein.</>}
        </motion.h2>
        <div data-swarm-meiden className={`flex w-fit items-baseline gap-5 ${compact ? "mb-[1vh]" : "mb-6"}`}>
          {counter}
          <span className={`${compact ? "text-[clamp(20px,min(2vw,3.6vh),40px)]" : T.option} font-semibold text-muted`}>dabei</span>
        </div>
        <p data-swarm-meiden className={`w-fit ${compact ? "text-[clamp(18px,min(1.8vw,3.2vh),34px)]" : T.option} text-muted`}>Steuer deinen Avatar. Findet zusammen in den Ring.</p>
      </div>

      {showQr && (
        <div data-swarm-meiden data-swarm-qr className={`flex flex-col items-center ${compact ? "gap-2" : "gap-4"}`}>
          <div className={`bg-white shadow-2xl ring-8 ring-accent/20 ${compact ? "rounded-[28px] p-[clamp(10px,1.2vh,18px)]" : "rounded-[48px] p-[clamp(16px,1.6vw,28px)]"}`}>
            {/* Kompakt bleibt der Code ≥ 24vh groß – aus der letzten Reihe noch scannbar. */}
            <QRCodeSVG value={joinUrl} size={360} level="M"
              className={compact ? "h-[clamp(170px,26vh,300px)] w-[clamp(170px,26vh,300px)]" : "h-[clamp(240px,24vw,420px)] w-[clamp(240px,24vw,420px)]"} />
          </div>
          <span className={`${T.meta} text-muted`}>{url}</span>
        </div>
      )}

      <Toast participants={participants} newest={newest} />
    </div>
  );
}

// Wer zuletzt dazukam – mit Warteschlange: jede Begrüßung steht 1,5 s (also mehr als 800 ms Abstand),
// bei Ansturm (> 3 wartend) zählt nur die neueste. Wer schon beim Laden da war, bekommt keine Begrüßung.
function useArrivals(participants: Participant[]) {
  const seen = useRef<Set<string> | null>(null);
  const queue = useRef<string[]>([]);
  const showing = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [current, setCurrent] = useState<string | null>(null);

  useEffect(() => {
    if (seen.current === null) { seen.current = new Set(participants.map((p) => p.id)); return; }
    const fresh = participants.filter((p) => !seen.current!.has(p.id)).map((p) => p.id);
    if (!fresh.length) return;
    fresh.forEach((id) => seen.current!.add(id));
    queue.current.push(...fresh);
    if (queue.current.length > 3) queue.current = queue.current.slice(-1);
    const next = () => {
      const id = queue.current.shift();
      showing.current = !!id;
      setCurrent(id ?? null);
      if (id) timer.current = setTimeout(next, 1500);
    };
    if (!showing.current) { showing.current = true; timer.current = setTimeout(next, 0); }
  }, [participants]);

  useEffect(() => () => clearTimeout(timer.current), []);
  return current;
}

function Toast({ participants, newest }: { participants: Participant[]; newest: string | null }) {
  const reduce = useReducedMotion();
  const p = participants.find((x) => x.id === newest);
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-[12vh] z-20 flex justify-center" aria-live="polite">
      <AnimatePresence>
        {p && (
          <motion.div key={p.id}
            initial={reduce ? { opacity: 0 } : { opacity: 0, y: 60, scale: 0.8 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, y: -30, scale: 0.9 }}
            transition={ARRIVE}
            className="flex items-center gap-5 rounded-full border border-border bg-card-2 py-3 pl-3 pr-10 shadow-2xl">
            <Glyph p={p} size="lg" />
            <span className="font-display text-[clamp(32px,3.4vw,64px)] font-extrabold tracking-[-0.02em]">Hallo, {p.name}</span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
