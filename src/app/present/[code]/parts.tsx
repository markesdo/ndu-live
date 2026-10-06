"use client";
import { useEffect, useRef } from "react";
import { animate, motion, useReducedMotion } from "motion/react";
import { ringColor } from "@/lib/avatar";
import type { Participant } from "@/lib/useSession";

// Die eine Bewegung der App: „Ankommen“. Alles kommt von unten, schwingt einmal über und setzt sich.
export const ARRIVE = { type: "spring", stiffness: 260, damping: 22, mass: 0.9 } as const;
export const ARRIVE_FROM = { opacity: 0, y: 24, scale: 0.85 };
export const ARRIVE_TO = { opacity: 1, y: 0, scale: 1 };
// Die ganze Welle dauert nie länger als 600 ms, egal wie viele kommen.
export const stagger = (i: number, n: number) => i * Math.min(0.04, 0.6 / Math.max(n, 1));
// Avatar fliegt aus dem Wartebereich in seine Zeile: langsamer, damit man es aus der letzten Reihe sieht.
export const FLY = { type: "spring", stiffness: 200, damping: 26 } as const;

// Projektor-Schriftgrößen (Leinwand hat genau ein Fenster – vw ist hier Absicht)
// Größen hängen auch an der Höhe (vh): Beamer mit 1280×720 sollen nicht abschneiden.
export const T = {
  h1: "text-[clamp(44px,min(6.5vw,11vh),120px)] font-extrabold leading-[1.02] tracking-[-0.03em]",
  h2: "text-[clamp(40px,4.4vw,80px)] font-extrabold leading-[1.05] tracking-[-0.03em]",
  option: "text-[clamp(22px,min(2.8vw,4.2vh),48px)]",
  meta: "font-mono text-[clamp(14px,1.2vw,22px)]",
};

// Avatar mit Ringfarbe aus dem Namen.
export function Glyph({ p, size = "md", me = false }: { p: Participant; size?: "sm" | "md" | "lg"; me?: boolean }) {
  const dim = size === "lg" ? "h-[clamp(56px,4.6vw,88px)] w-[clamp(56px,4.6vw,88px)] text-[clamp(30px,2.6vw,48px)]"
    : size === "md" ? "h-[clamp(40px,3.2vw,60px)] w-[clamp(40px,3.2vw,60px)] text-[clamp(22px,1.8vw,34px)]"
    : "h-9 w-9 text-lg";
  return (
    <span className={`grid shrink-0 place-items-center rounded-full bg-card ${dim}`}
      style={{ boxShadow: `inset 0 0 0 ${me ? 3 : 2}px ${ringColor(p.name)}` }} title={p.name}>
      <span aria-hidden>{p.emoji}</span>
    </span>
  );
}

// Zahl, die hochzählt. Bei reduzierter Bewegung steht sofort die Endzahl da.
export function CountUp({ to, delay = 0, className = "" }: { to: number; delay?: number; className?: string }) {
  const reduce = useReducedMotion();
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || reduce) return;
    el.textContent = "0";
    const c = animate(0, to, {
      duration: 1.2, delay, ease: [0.2, 0, 0, 1],
      onUpdate: (v) => { el.textContent = Math.round(v).toLocaleString("de-AT"); },
    });
    return () => c.stop();
  }, [to, delay, reduce]);
  return (
    <span ref={ref} className={`tabular-nums ${className}`} aria-label={String(to)}>
      {to.toLocaleString("de-AT")}
    </span>
  );
}

// Kopfzeile mit Live-Punkt und nachrückender Zahl
export function LivePill({ count, live, reconnecting }: { count: number; live: boolean; reconnecting: boolean }) {
  return (
    <span className={`flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-fg ${T.meta}`}>
      <span className={`h-2.5 w-2.5 rounded-full ${live && !reconnecting ? "live-dot bg-ok" : "bg-accent-2"}`} aria-hidden />
      {reconnecting && <span className="text-accent-2">verbinde neu ·</span>}
      <span className="relative inline-block overflow-hidden align-bottom tabular-nums">
        <motion.span key={count} initial={{ y: "100%", opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ type: "spring", stiffness: 500, damping: 30 }} className="inline-block">
          {count}
        </motion.span>
      </span>
      dabei
    </span>
  );
}
