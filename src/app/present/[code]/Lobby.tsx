"use client";
import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { QRCodeSVG } from "qrcode.react";
import type { Participant } from "@/lib/useSession";
import { ARRIVE, ARRIVE_FROM, ARRIVE_TO, Glyph, T } from "./parts";
import EnergyMeter, { useEnergy } from "./EnergyMeter";

// Lobby: Zähler als Held, Wand aller Namen, die neueste Person kurz groß („Hallo, Lea“).
export default function Lobby({ code, participants, joinUrl, showQr, preview = false }: {
  code: string; participants: Participant[]; joinUrl: string; showQr: boolean; preview?: boolean;
}) {
  const newest = useArrivals(participants);
  const energy = useEnergy(code, participants, preview);
  // Sobald der Raum tippt, rückt die Überschrift auf eine Zeile – sonst passt der Zähler bei 1280×720 nicht mehr.
  const many = participants.length > 8 || energy > 0;
  const dense = participants.length > 16;
  const url = joinUrl.replace(/^https?:\/\//, "");
  return (
    <div className="grid items-center gap-[4vw] lg:grid-cols-[1fr_auto]">
      <div className="min-w-0">
        <motion.h2 layout className={`${many ? "text-[clamp(32px,3vw,56px)]" : T.h2} mb-6 font-extrabold leading-[1.05] tracking-[-0.03em] text-muted`}>
          {many ? "Scannen. Vorname. Dabei sein." : <>Scannen.<br />Vorname.<br />Dabei sein.</>}
        </motion.h2>
        <div className="mb-8 flex items-baseline gap-5">
          <span className="relative inline-block overflow-hidden align-bottom">
            <AnimatePresence mode="popLayout" initial={false}>
              <motion.span key={participants.length} initial={{ y: "60%", opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: "-60%", opacity: 0 }}
                transition={ARRIVE} className="inline-block font-display text-[clamp(96px,11vw,200px)] font-extrabold leading-[0.9] tabular-nums">
                {participants.length}
              </motion.span>
            </AnimatePresence>
          </span>
          <span className={`${T.option} font-semibold text-muted`}>dabei</span>
        </div>

        {dense ? (
          <div className="flex flex-wrap gap-2">
            {participants.slice(0, 48).map((p, i) => (
              <motion.span key={p.id} initial={ARRIVE_FROM} animate={ARRIVE_TO} transition={{ ...ARRIVE, delay: newest === p.id ? 0 : Math.min(i * 0.01, 0.3) }}>
                <Glyph p={p} size="md" />
              </motion.span>
            ))}
            {participants.length > 48 && <span className={`${T.meta} self-center text-muted`}>+{participants.length - 48}</span>}
          </div>
        ) : (
          <div className="flex flex-wrap gap-3">
            {participants.map((p) => (
              <motion.span key={p.id} initial={ARRIVE_FROM} animate={ARRIVE_TO} transition={ARRIVE}
                className="flex items-center gap-3 rounded-full bg-card py-2 pl-2 pr-5 text-[clamp(20px,1.8vw,32px)]">
                <Glyph p={p} size="sm" /> {p.name}
              </motion.span>
            ))}
          </div>
        )}
        {/* Gemeinsamer Token-Zähler: erscheint erst mit dem ersten Tipp, links unter den Namen – nie beim QR-Code. */}
        <EnergyMeter code={code} participants={participants} preview={preview} total={energy} />
      </div>

      {showQr && (
        <div className="flex flex-col items-center gap-4">
          <div className="rounded-[48px] bg-white p-[clamp(16px,1.6vw,28px)] shadow-2xl ring-8 ring-accent/20">
            <QRCodeSVG value={joinUrl} size={360} level="M" className="h-[clamp(240px,24vw,420px)] w-[clamp(240px,24vw,420px)]" />
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
