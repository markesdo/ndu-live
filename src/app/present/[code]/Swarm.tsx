"use client";
// „Schwarm“ – Leinwand-Seite. Einziger Zuhörer des Kanals swarm-<code>: nimmt die Steuerrichtungen der Handys
// (geprüft in acceptStick) und rechnet daraus einen Schwarm (Reynolds-Boids + Steuerung). Die Avatare sind die
// Namen der Lobby; ein pulsierender Ring wandert über die Bühne – sind genug Aktive drin, platzt er in ihren Farben.
// Zeichnet auf ein Canvas hinter dem Lobby-Text; QR-Code, Zähler und Überschrift sind Sperrzonen.
// Vertrauen: Aus Broadcasts wird nur die Richtung gelesen (geprüft in acceptStick, dort auch die bekannte Grenze
// „fremden Avatar lenken“). Name und Emoji jedes Avatars stammen aus der Teilnehmer-Tabelle, nie aus einer Nachricht.
import { useEffect, useRef } from "react";
import { useReducedMotion } from "motion/react";
import { supabase } from "@/lib/supabase";
import type { Participant } from "@/lib/useSession";
import { hash, ringColor } from "@/lib/avatar";
import {
  AUTONOMOUS_MS, HOLD_MS, acceptStick, avatarRadius, boidAlpha, currentTarget, escapeRect, isActive, labelGap, lerpStick, mergeRects, pushFrom, ringBlocked, ringNeeded, ringSpot, ringStep, spawnPoint,
  type Rect, type RingState, type StickMsg, type SwarmInput, type Vec,
} from "@/lib/swarm";

type Boid = { id: string; name: string; emoji: string; color: string; x: number; y: number; vx: number; vy: number; trail: Vec[]; wander: number; sprite: HTMLCanvasElement | null; spriteR: number; labelW: number };
type Particle = { x: number; y: number; vx: number; vy: number; life: number; color: string };

const MAX_PARTICLES = 80;

// Ein Kanal pro Code, einmal abonniert und nie abgebaut: Blättert die Leinwand zurück in die Lobby, hängt sich
// das Spiel nur wieder an den Zuhörer. (supabase.channel() gäbe sonst den gerade schließenden Kanal zurück,
// dessen subscribe() nichts tut – dann käme nach dem Zurückblättern keine Steuerung mehr an.)
let listener: ((payload: StickMsg) => void) | null = null;
const channels = new Set<string>();
function ensureChannel(code: string) {
  if (channels.has(code)) return;
  channels.add(code);
  supabase
    .channel(`swarm-${code}`)
    .on("broadcast", { event: "stick" }, ({ payload }) => { if (payload && typeof payload === "object") listener?.(payload as StickMsg); })
    .subscribe();
}

export default function Swarm({ code, participants, preview, avoidSelector }: {
  code: string; participants: Participant[]; preview: boolean;
  // Elemente, die der Schwarm meidet (QR, Zähler, Überschrift); werden regelmäßig neu vermessen.
  avoidSelector: string;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const reduce = useReducedMotion();
  const people = useRef<Participant[]>(participants);
  const known = useRef<Set<string>>(new Set());
  useEffect(() => {
    people.current = participants;
    known.current = new Set(participants.map((p) => p.id));
  }, [participants]);
  const reduceRef = useRef(!!reduce);
  useEffect(() => { reduceRef.current = !!reduce; }, [reduce]);

  useEffect(() => {
    const cv = canvas.current;
    if (!cv) return;
    const ctx = cv.getContext("2d");
    if (!ctx) return;
    const input: SwarmInput = new Map();
    const boids = new Map<string, Boid>();
    let particles: Particle[] = [];
    let ring: RingState = { heldMs: 0, round: 0 };
    let ringPos: Vec | null = null;
    let lastInputAt = -Infinity;
    let avoid: Rect[] = [];
    let qr: Rect | null = null;
    let w = 0, h = 0, dpr = 1, unit = 1;
    let fontBody = "sans-serif";
    let raf = 0;
    let last = performance.now();
    let acc = 0;
    let seed = 1;
    const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

    const take = (msg: StickMsg, now: number) => {
      if (acceptStick(input, msg, known.current, now)) {
        const p = input.get(msg.pid as string);
        if (p && p.input === now) lastInputAt = now;
      }
    };

    // Größe und Sperrzonen: bei Größenänderung und jede Sekunde (Toast, Zähler und Schriften ändern sich).
    const measure = () => {
      const r = cv.getBoundingClientRect();
      dpr = Math.min(2, window.devicePixelRatio || 1);
      if (Math.round(r.width) !== w || Math.round(r.height) !== h) {
        w = Math.round(r.width); h = Math.round(r.height);
        cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
        unit = Math.max(0.5, Math.min(w / 1920, h / 1080) * 1.0);
        boids.forEach((b) => { b.sprite = null; }); // Größe neu
      }
      const root = cv.parentElement;
      avoid = [];
      qr = null;
      root?.querySelectorAll<HTMLElement>(avoidSelector).forEach((el) => {
        const e = el.getBoundingClientRect();
        if (e.width === 0 || e.height === 0) return;
        const rect = { x: e.left - r.left, y: e.top - r.top, w: e.width, h: e.height };
        // QR-Code: Sperrzone bis zum rechten Rand – sonst bleiben Avatare im schmalen Streifen dahinter hängen.
        // Über den Rand hinaus verlängert, damit der Ausweg nie zur Bildschirmkante zeigt.
        if (el.dataset.swarmQr !== undefined) { rect.w = w + 1000 - rect.x; qr = rect; }
        avoid.push(rect);
      });
      fontBody = getComputedStyle(document.body).fontFamily || "sans-serif";
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(cv);
    const remeasure = setInterval(measure, 1000);

    // Avatar ≈ 96 px bei 1080p für bis zu 5 Leute (Kurs 2026: 3 + 1), sonst 76 px.
    const radius = () => avatarRadius(boids.size, unit);
    const sprite = (b: Boid) => {
      const r = radius();
      if (b.sprite && b.spriteR === r) return b.sprite;
      const size = Math.ceil((r * 2 + 8) * dpr);
      const s = document.createElement("canvas");
      s.width = size; s.height = size;
      const g = s.getContext("2d")!;
      g.scale(dpr, dpr);
      const c = size / dpr / 2;
      g.fillStyle = "#1b1b22";
      g.beginPath(); g.arc(c, c, r, 0, Math.PI * 2); g.fill();
      g.lineWidth = Math.max(3, 4 * unit);
      g.strokeStyle = b.color;
      g.beginPath(); g.arc(c, c, r - g.lineWidth / 2, 0, Math.PI * 2); g.stroke();
      g.font = `${Math.round(r * 1.05)}px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif`;
      g.textAlign = "center"; g.textBaseline = "middle";
      g.fillText(b.emoji, c, c + r * 0.06);
      b.sprite = s;
      b.spriteR = r;
      return s;
    };

    const burst = (x: number, y: number, colors: string[], count: number) => {
      if (reduceRef.current) count = Math.min(count, 12);
      for (let i = 0; i < count && particles.length < MAX_PARTICLES; i++) {
        const a = rand() * Math.PI * 2;
        const sp = (120 + rand() * 260) * unit * (reduceRef.current ? 0.5 : 1);
        particles.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 1, color: colors[i % colors.length] ?? "#ff6a4d" });
      }
    };

    // Teilnehmende ↔ Boids abgleichen: Neue fliegen vom QR-Code her ein, Gelöschte platzen.
    const sync = (now: number) => {
      const ids = new Set(people.current.map((p) => p.id));
      for (const p of people.current) {
        if (boids.has(p.id)) continue;
        const s = spawnPoint(w, h, qr, hash(p.id) + now);
        boids.set(p.id, { id: p.id, name: p.name, emoji: p.emoji, color: ringColor(p.name), x: s.x, y: s.y, vx: -180 * unit, vy: 0, trail: [], wander: rand() * Math.PI * 2, sprite: null, spriteR: 0, labelW: 0 });
      }
      for (const [id, b] of boids) {
        if (ids.has(id)) continue;
        burst(b.x, b.y, [b.color], 14);
        boids.delete(id);
        input.delete(id);
      }
    };

    const ringRadius = () => radius() * 3.4; // zwei, drei Avatare passen bequem hinein
    const step = (dtMs: number, now: number) => {
      const dt = dtMs / 1000;
      const slow = reduceRef.current ? 0.5 : 1;
      const maxSpeed = 260 * unit * slow;
      const R = radius();
      const perception = R * 5;
      const list = [...boids.values()];
      const autonomous = list.length >= 2 && now - lastInputAt > AUTONOMOUS_MS;
      // Harte Sperrzonen einmal pro Schritt zusammenfassen. Dieselbe Liste gilt für das Wegschieben der Avatare UND für
      // die Platzierung des Rings – sonst landet der Ring in einer Lücke, die kein Avatar erreichen kann (Review #6).
      const blocked = mergeRects(avoid, R, R * 1.7, R);
      // Ring erst setzen, wenn die Sperrzonen vermessen sind. Maßgeblich ist, dass die MITTE für Avatare erreichbar ist
      // (Abstand ringMargin zu jeder Sperrzone) – der Kreis selbst darf hinter Text liegen. Den ganzen Kreis frei zu
      // verlangen, ließ bei wenig Platz nur den Notfall-Ort übrig, mitten auf der Hinweiszeile (Review #6).
      const ringMargin = R * 1.6;
      if (blocked.length && (!ringPos || ringBlocked(ringPos, ringMargin, blocked))) ringPos = ringSpot(w, h, ringMargin, blocked, rand);

      for (const b of list) {
        const pilot = input.get(b.id);
        if (pilot) pilot.cur = lerpStick(pilot.cur, currentTarget(pilot, now), dtMs);
        let ax = 0, ay = 0, n = 0, cx = 0, cy = 0, avx = 0, avy = 0, sx = 0, sy = 0;
        for (const o of list) {
          if (o === b) continue;
          const dx = o.x - b.x, dy = o.y - b.y;
          const d = Math.hypot(dx, dy);
          if (d > perception || d === 0) continue;
          n++; cx += o.x; cy += o.y; avx += o.vx; avy += o.vy;
          if (d < R * 2.6) { const k = (R * 2.6 - d) / (R * 2.6); sx -= dx / d * k; sy -= dy / d * k; }
          // Namen nebeneinander: etwa auf einer Höhe brauchen sie in x so viel Platz wie die Namen breit sind.
          if (Math.abs(dy) < R * 2.4) {
            const gap = labelGap(b.labelW, o.labelW, R, unit);
            if (Math.abs(dx) < gap) { const k = (gap - Math.abs(dx)) / gap; sx -= Math.sign(dx || 1) * k; }
          }
        }
        if (n) {
          ax += ((cx / n - b.x) * 0.8 + (avx / n - b.vx) * 0.5) * 0.6; // Zusammenhalt + Ausrichtung
          ay += ((cy / n - b.y) * 0.8 + (avy / n - b.vy) * 0.5) * 0.6;
        }
        ax += sx * maxSpeed * 9; ay += sy * maxSpeed * 9; // Abstand halten (stärker als Lenken – keine Knäuel)
        const steering = pilot && Math.hypot(pilot.cur.x, pilot.cur.y) > 0.05;
        if (steering) {
          ax += (pilot.cur.x * maxSpeed - b.vx) * 2.5;
          ay += (pilot.cur.y * maxSpeed - b.vy) * 2.5;
        } else if (autonomous && ringPos) {
          // Niemand lenkt: Der Schwarm sucht den Ring selbst – die Bühne sieht nie kaputt aus.
          ax += (ringPos.x - b.x) * 0.9; ay += (ringPos.y - b.y) * 0.9;
        } else {
          b.wander += (rand() - 0.5) * 2 * dt;
          ax += Math.cos(b.wander) * maxSpeed * 0.6; ay += Math.sin(b.wander) * maxSpeed * 0.6;
        }
        // Sperrzonen (QR, Text) und Ränder: sanft wegdrücken.
        for (const a of avoid) {
          const f = pushFrom(b, a, R * 2.2);
          ax += f.x * maxSpeed * 14; ay += f.y * maxSpeed * 14;
        }
        // Ränder: ab 2 Radien sanft, dann kräftig zur Mitte – Ecken werden so keine Falle.
        const m = R * 2.2;
        const edge = (d: number) => Math.max(0, (m - d) / m) * maxSpeed * 10;
        ax += edge(b.x) - edge(w - b.x);
        ay += edge(b.y) - edge(h - b.y);

        b.vx += ax * dt; b.vy += ay * dt;
        const sp = Math.hypot(b.vx, b.vy);
        if (sp > maxSpeed) { b.vx *= maxSpeed / sp; b.vy *= maxSpeed / sp; }
        b.vx *= 0.995; b.vy *= 0.995;
        b.x += b.vx * dt; b.y += b.vy * dt;
        // Harte Sperrzonen (Überschrift, Zähler, Hinweis, QR-Code, Kopf- und Fußzeile): Avatar samt Namen nie darüber.
        for (const a of blocked) {
          const q = escapeRect(b, a, R, R * 1.7, { w, h });
          if (q.x !== b.x) b.vx = 0;
          if (q.y !== b.y) b.vy = 0;
          b.x = q.x; b.y = q.y;
        }
        b.x = Math.min(w - R, Math.max(R, b.x)); b.y = Math.min(h - R * 1.6, Math.max(R, b.y)); // ganz sichtbar, Name inklusive
        if (!reduceRef.current) { b.trail.push({ x: b.x, y: b.y }); if (b.trail.length > 10) b.trail.shift(); } else b.trail.length = 0;
      }

      // Ring: Wer zählt? Aktive; ohne Aktive (Schwarm fliegt allein) alle.
      if (ringPos) {
        const active = list.filter((b) => isActive(input.get(b.id), now));
        const pool = active.length ? active : list;
        const rr = ringRadius();
        const inside = pool.filter((b) => Math.hypot(b.x - ringPos!.x, b.y - ringPos!.y) < rr);
        const out = ringStep(ring, inside.length, ringNeeded(pool.length), dtMs);
        ring = out.ring;
        if (out.burst) {
          cv.dataset.runde = String(ring.round); // Zahl der geplatzten Ringe – für Tests und zum Nachsehen
          burst(ringPos.x, ringPos.y, inside.map((b) => b.color), 60);
          ringPos = ringSpot(w, h, R * 1.6, blocked, rand);
        }
      }

      particles = particles.filter((p) => p.life > 0);
      for (const p of particles) {
        p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 0.97; p.vy *= 0.97; p.life -= dt / 1.2;
      }
    };

    const draw = (now: number) => {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      const R = radius();
      // Ring mit Fortschrittsbogen
      if (ringPos) {
        const rr = ringRadius();
        const pulse = reduceRef.current ? 0 : Math.sin(now / 400) * 6 * unit;
        ctx.lineWidth = 3 * unit;
        ctx.strokeStyle = "rgba(255,176,59,0.55)";
        ctx.setLineDash([10 * unit, 10 * unit]);
        ctx.beginPath(); ctx.arc(ringPos.x, ringPos.y, rr + pulse, 0, Math.PI * 2); ctx.stroke();
        ctx.setLineDash([]);
        const prog = Math.min(1, ring.heldMs / HOLD_MS);
        if (prog > 0) {
          ctx.lineWidth = 8 * unit;
          ctx.strokeStyle = "#ffb03b";
          ctx.beginPath(); ctx.arc(ringPos.x, ringPos.y, rr + pulse, -Math.PI / 2, -Math.PI / 2 + prog * Math.PI * 2); ctx.stroke();
        }
        ctx.fillStyle = "rgba(255,176,59,0.07)";
        ctx.beginPath(); ctx.arc(ringPos.x, ringPos.y, rr + pulse, 0, Math.PI * 2); ctx.fill();
      }
      // Spuren
      for (const b of boids.values()) {
        for (let i = 0; i < b.trail.length; i++) {
          const t = b.trail[i];
          ctx.globalAlpha = (i / b.trail.length) * 0.25 * boidAlpha(input.get(b.id), now);
          ctx.fillStyle = b.color;
          ctx.beginPath(); ctx.arc(t.x, t.y, R * 0.35, 0, Math.PI * 2); ctx.fill();
        }
      }
      ctx.globalAlpha = 1;
      // Avatare mit Namen
      ctx.font = `600 ${Math.round(18 * unit + 6)}px ${fontBody}`;
      ctx.textAlign = "center"; ctx.textBaseline = "top";
      for (const b of boids.values()) {
        const a = boidAlpha(input.get(b.id), now);
        ctx.globalAlpha = a;
        const s = sprite(b);
        const size = s.width / dpr;
        ctx.drawImage(s, b.x - size / 2, b.y - size / 2, size, size);
        ctx.fillStyle = "#f4f4f8";
        b.labelW = ctx.measureText(b.name).width;
        ctx.fillText(b.name, b.x, b.y + R + 6 * unit);
      }
      ctx.globalAlpha = 1;
      for (const p of particles) {
        ctx.globalAlpha = Math.max(0, p.life);
        ctx.fillStyle = p.color;
        ctx.beginPath(); ctx.arc(p.x, p.y, 5 * unit, 0, Math.PI * 2); ctx.fill();
      }
      ctx.globalAlpha = 1;
    };

    // Feste 16-ms-Schritte, gezeichnet einmal pro Bild.
    const frame = (t: number) => {
      const now = performance.now();
      acc += Math.min(250, t - last);
      last = t;
      sync(now);
      while (acc >= 16) { step(16, now); acc -= 16; }
      draw(now);
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);

    let cleanup = () => {};
    if (preview) {
      // Vorschau ohne Netz: erfundene Daumen – einige lenken zum Ring, andere kreisen.
      let k = 0;
      const fake = setInterval(() => {
        const now = performance.now();
        k++;
        for (const [i, b] of [...boids.values()].entries()) {
          if (i % 4 === 3) continue; // ein Viertel bleibt untätig (wird gedimmt)
          let v: Vec;
          if (ringPos && (k + i) % 10 < 7) {
            const dx = ringPos.x - b.x, dy = ringPos.y - b.y; const d = Math.hypot(dx, dy) || 1;
            v = d < ringRadius() * 0.5 ? { x: 0, y: 0 } : { x: dx / d, y: dy / d };
          } else {
            const a = k * 0.4 + i;
            v = { x: Math.cos(a), y: Math.sin(a) };
          }
          take({ pid: b.id, x: v.x, y: v.y, seq: k }, now);
        }
      }, 500);
      cleanup = () => clearInterval(fake);
    } else {
      listener = (payload) => take(payload, performance.now());
      ensureChannel(code);
      cleanup = () => { listener = null; };
    }

    return () => {
      cancelAnimationFrame(raf);
      clearInterval(remeasure);
      ro.disconnect();
      cleanup();
    };
  }, [code, preview, avoidSelector]);

  return <canvas ref={canvas} aria-hidden className="pointer-events-none absolute inset-0 z-0 h-full w-full" />;
}
