"use client";
// „Schwarm“ – Handy-Seite: ein runder Daumen-Pad, der Knopf ist das eigene Emoji. Die Richtung geht höchstens alle
// 500 ms und nur bei Änderung per Broadcast (REST, ohne Kanal-Beitritt) an die Leinwand; beim Loslassen einmal (0,0).
// Im Leerlauf geht nichts raus. Sobald die Leinwand weiterblättert, verschwindet der Pad und es geht nichts mehr raus.
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type RefObject } from "react";
import { motion, useReducedMotion } from "motion/react";
import { supabase } from "@/lib/supabase";
import { ringColor } from "@/lib/avatar";
import { quantise, shouldSend, type Vec } from "@/lib/swarm";

const SPRING = { type: "spring", stiffness: 500, damping: 30 } as const;
const PAD = 160; // px Durchmesser
const KNOB = 64;
const TAP_MS = 220; // kurzer Tipp am Rand = Anstupsen in diese Richtung
const NUDGE_MS = 700;

export default function SwarmPad({ code, pid, emoji, name, stepRef, padStep }: {
  code: string; pid: string; emoji: string; name: string;
  // Schritt der Session als Ref: Der Pad lebt beim Weiterblättern noch kurz in der Ausblende-Animation –
  // über die Ref merkt er sofort, dass er nichts mehr senden darf.
  stepRef: RefObject<number | null>; padStep: number;
}) {
  const reduce = useReducedMotion();
  const [knob, setKnob] = useState<Vec>({ x: 0, y: 0 }); // −1..1 (Anzeige)
  const want = useRef<Vec>({ x: 0, y: 0 }); // aktuelle Richtung (gerundet)
  const sent = useRef<Vec | null>(null);
  const sentAt = useRef(-Infinity);
  // Steigt auch über ein Neuladen hinweg (Startwert = Uhrzeit, gesetzt beim ersten Senden), damit nie zwei
  // Nachrichten dieselbe Nummer tragen.
  const seq = useRef(0);
  const sending = useRef(false);
  const down = useRef<{ t: number; moved: boolean } | null>(null);
  const nudge = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const pad = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Nur zum Senden, nie abonniert – sonst bekäme jedes Handy die Steuerung aller anderen.
    const channel = supabase.channel(`swarm-${code}`);
    let stopped = false;
    const tick = async () => {
      if (stopped || sending.current) return;
      if (stepRef.current !== padStep) return;
      const now = performance.now();
      const next = want.current;
      if (!shouldSend(sent.current, next, now - sentAt.current)) return;
      sending.current = true;
      seq.current = Math.max(seq.current + 1, Date.now());
      sentAt.current = now;
      try {
        // Neueste Richtung zählt: Geht etwas verloren, wird nichts nachgeschickt – die nächste Änderung ersetzt es.
        const res = await channel.httpSend("stick", { pid, x: next.x, y: next.y, seq: seq.current });
        if (!stopped && res.success) sent.current = next;
      } catch {
        // Netz weg: nichts vormerken.
      } finally {
        sending.current = false;
      }
    };
    const timer = setInterval(tick, 100);
    return () => {
      stopped = true;
      clearInterval(timer);
      clearTimeout(nudge.current);
      supabase.removeChannel(channel);
    };
  }, [code, pid, stepRef, padStep]);

  const vectorFrom = (e: ReactPointerEvent) => {
    const r = pad.current!.getBoundingClientRect();
    const v = { x: (e.clientX - (r.left + r.width / 2)) / (r.width / 2 - KNOB / 4), y: (e.clientY - (r.top + r.height / 2)) / (r.height / 2 - KNOB / 4) };
    return quantise(v);
  };
  const set = (v: Vec) => { want.current = v; setKnob(v); };

  const onDown = (e: ReactPointerEvent) => {
    if (stepRef.current !== padStep) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    clearTimeout(nudge.current);
    down.current = { t: performance.now(), moved: false };
    set(vectorFrom(e));
  };
  const onMove = (e: ReactPointerEvent) => {
    if (!down.current) return;
    down.current.moved = true;
    set(vectorFrom(e));
  };
  const onUp = (e: ReactPointerEvent) => {
    const d = down.current;
    down.current = null;
    const v = vectorFrom(e);
    // Kurzer Tipp ohne Ziehen: kurz in diese Richtung stupsen, dann loslassen.
    if (d && !d.moved && performance.now() - d.t < TAP_MS && Math.hypot(v.x, v.y) > 0.3) {
      const len = Math.hypot(v.x, v.y);
      set({ x: Math.round((v.x / len) * 100) / 100, y: Math.round((v.y / len) * 100) / 100 });
      nudge.current = setTimeout(() => set({ x: 0, y: 0 }), NUDGE_MS);
      return;
    }
    set({ x: 0, y: 0 });
  };

  const ring = ringColor(name);
  const travel = PAD / 2 - KNOB / 2;
  return (
    <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ ...SPRING, delay: 0.15 }} className="mt-6">
      <p className="mb-4 text-[15px] leading-snug text-muted">Steuer deinen Avatar. Findet zusammen in den Ring – auf der Leinwand.</p>
      <div className="flex justify-center">
        <div ref={pad} role="application" aria-label="Steuerfläche: ziehen, um deinen Avatar zu lenken"
          onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}
          className="relative select-none rounded-full border-2 border-border bg-card"
          style={{ width: PAD, height: PAD, touchAction: "none" }}>
          <span className="pointer-events-none absolute inset-[18%] rounded-full border border-dashed border-border" aria-hidden />
          <motion.span aria-hidden
            animate={{ x: knob.x * travel, y: knob.y * travel }}
            transition={reduce ? { duration: 0 } : { type: "spring", stiffness: 700, damping: 35 }}
            className="pointer-events-none absolute grid place-items-center rounded-full bg-card-2 text-[30px] shadow-lg"
            style={{ width: KNOB, height: KNOB, left: PAD / 2 - KNOB / 2 - 2, top: PAD / 2 - KNOB / 2 - 2, boxShadow: `inset 0 0 0 3px ${ring}` }}>
            {emoji}
          </motion.span>
        </div>
      </div>
    </motion.div>
  );
}
