// „Schwarm“ – Spiel in der Lobby: Jede Person steuert ihren Avatar mit dem Daumen, alle zusammen fliegen als
// Schwarm über die Leinwand. Ziel: ein Ring, in dem sich die Mehrheit der Aktiven sammeln muss.
// Die Handys schicken nur ihre Steuerrichtung (höchstens alle 500 ms, nur bei Änderung) per Realtime-Broadcast;
// nur die Leinwand hört zu und rechnet. Hier steht die reine Logik – ohne React, ohne Netz, ohne Canvas –,
// damit sie sich testen lässt.

export const SEND_MS = 500; // Handy: höchstens eine Nachricht alle 500 ms (2 Hz)
export const MIN_DELTA = 0.05; // Handy: nur senden, wenn sich die Richtung merklich geändert hat
export const MIN_GAP_MS = 200; // Leinwand: pro Person höchstens eine Nachricht in diesem Abstand
export const ACTIVE_MS = 20_000; // so lange gilt jemand nach der letzten Eingabe als aktiv (danach gedimmt)
export const AUTONOMOUS_MS = 10_000; // so lange ohne jede Eingabe → der Schwarm fliegt allein zum Ring
export const HOLD_MS = 1500; // so lange müssen genug im Ring sein, bis er platzt
export const STICK_TAU_MS = 250; // Glättung der Steuerrichtung (2-Hz-Sprünge verschwinden)
export const HEARTBEAT_MS = 2000; // Handy: hält der Daumen still, trotzdem alle 2 s den Stand schicken
export const SEQ_WINDOW_MS = 2_000; // Leinwand: nur innerhalb dieses Abstands gilt „ältere seq = verspätet“
export const SEQ_AHEAD_MS = 5_000; // seq weiter als das in der Zukunft (Leinwand-Uhr) wird ignoriert, nie gespeichert
export const STALE_MS = 3500; // Leinwand: so lange ohne Nachricht → Richtung gilt als losgelassen (Bildschirm gesperrt, Nachricht verloren)

export type Vec = { x: number; y: number };
export type StickMsg = { pid: unknown; x: unknown; y: unknown; seq?: unknown };

// Handy: Richtung auf Einheitslänge begrenzen und auf zwei Stellen runden (kleinere Nachricht, weniger Rauschen).
export function quantise(v: Vec): Vec {
  if (!Number.isFinite(v.x) || !Number.isFinite(v.y)) return { x: 0, y: 0 };
  const len = Math.hypot(v.x, v.y);
  const k = len > 1 ? 1 / len : 1;
  const r = (n: number) => Math.round(n * k * 100) / 100 || 0; // || 0: kein -0
  return { x: r(v.x), y: r(v.y) };
}

// Handy: Muss die neue Richtung raus? Nur nach SEND_MS und nur bei Änderung > MIN_DELTA (gegenüber dem zuletzt Gesendeten).
// Hält der Daumen gelenkt still, geht alle HEARTBEAT_MS der Stand erneut raus – so weiß die Leinwand, dass noch
// jemand lenkt, und eine verlorene Nachricht wird von selbst ersetzt.
export function shouldSend(lastSent: Vec | null, next: Vec, sinceLastMs: number): boolean {
  if (sinceLastMs < SEND_MS) return false;
  const moving = Math.hypot(next.x, next.y) > MIN_DELTA;
  if (lastSent === null) return moving;
  if (Math.hypot(next.x - lastSent.x, next.y - lastSent.y) > MIN_DELTA) return true;
  return moving && sinceLastMs >= HEARTBEAT_MS;
}

export type Pilot = { target: Vec; cur: Vec; seq: number; last: number; input: number };
export type SwarmInput = Map<string, Pilot>;

// Leinwand: eine Nachricht prüfen und als Ziel-Richtung übernehmen. true = angenommen.
// Unbekannte Person, verspätete/doppelte Nachricht (seq, siehe unten), zu kurzer Abstand (außer Loslassen)
// oder kaputte Zahlen → verworfen.
// Bekannte Grenze (wie beim Token-Zähler in energy.ts): Die Person-ID kommt vom Handy, und die IDs aller sehen alle.
// Wer mit dem öffentlichen Schlüssel selbst Broadcasts schickt, kann einen fremden Avatar lenken – für ein Spiel in der
// Lobby in Kauf genommen. Schaden kann es nicht: Nur bekannte IDs zählen (Zustand höchstens so groß wie die Lobby),
// Richtung auf Länge 1 gedeckelt, höchstens eine Richtung pro 200 ms und Person, und aus der Nachricht wird nur x/y gelesen –
// Namen und Emojis auf der Leinwand kommen aus der Teilnehmer-Tabelle, nie aus einer Nachricht.
export function acceptStick(input: SwarmInput, msg: StickMsg, knownIds: ReadonlySet<string>, now: number, wall: number = Date.now()): boolean {
  if (!msg || typeof msg !== "object") return false;
  if (typeof msg.pid !== "string" || !knownIds.has(msg.pid)) return false;
  if (typeof msg.x !== "number" || typeof msg.y !== "number" || !Number.isFinite(msg.x) || !Number.isFinite(msg.y)) return false;
  // seq zählt nur, wenn sie plausibel ist: endlich und nicht weiter als SEQ_AHEAD_MS vor der Leinwand-Uhr (wall).
  const seq = typeof msg.seq === "number" && Number.isFinite(msg.seq) && msg.seq <= wall + SEQ_AHEAD_MS ? msg.seq : null;
  const p = input.get(msg.pid);
  const release = Math.hypot(msg.x, msg.y) <= MIN_DELTA;
  if (p) {
    // Loslassen nie wegen des Abstands verwerfen: Kommt es dicht nach der letzten Richtung an (Netz-Schwankung),
    // flöge der Avatar sonst weiter, bis die Person wieder lenkt.
    if (!release && now - p.last < MIN_GAP_MS) return false;
    // seq des Handys ist eine Uhrzeit in ms. Eine verspätete ältere Nachricht (z. B. eine Richtung, die nach dem
    // Loslassen ankommt) wird nur innerhalb von SEQ_WINDOW_MS verworfen. Gefälschte seq in der Zukunft werden gar nicht
    // gespeichert (siehe wall unten) – so kann eine Fälschung ein echtes Handy höchstens 2 s blockieren, nicht minutenlang.
    if (seq !== null && seq <= p.seq && p.seq - seq < SEQ_WINDOW_MS) return false;
  }
  const t = quantise({ x: msg.x, y: msg.y });
  const pilot: Pilot = p ?? { target: { x: 0, y: 0 }, cur: { x: 0, y: 0 }, seq: -1, last: -Infinity, input: -Infinity };
  pilot.target = t;
  pilot.last = now;
  if (seq !== null) pilot.seq = seq;
  // „Eingabe“ heißt: jemand lenkt. Ein Loslassen (0,0) zählt nicht als neue Aktivität.
  if (Math.hypot(t.x, t.y) > MIN_DELTA) pilot.input = now;
  input.set(msg.pid, pilot);
  return true;
}

// Leinwand: Welche Richtung gilt gerade? Ohne Nachricht seit STALE_MS (Bildschirm gesperrt, App im Hintergrund,
// Seite neu geladen, Nachricht verloren) gilt die Person als losgelassen – lenkt sie weiter, kommt der Herzschlag.
export function currentTarget(p: Pilot | undefined, now: number): Vec {
  if (!p || now - p.last > STALE_MS) return { x: 0, y: 0 };
  return p.target;
}

// Leinwand: Richtung exponentiell zur Ziel-Richtung ziehen (Zeitkonstante tau).
export function lerpStick(cur: Vec, target: Vec, dtMs: number, tauMs = STICK_TAU_MS): Vec {
  if (dtMs <= 0) return cur;
  const a = 1 - Math.exp(-dtMs / tauMs);
  return { x: cur.x + (target.x - cur.x) * a, y: cur.y + (target.y - cur.y) * a };
}

// Wer zählt als aktiv? Eingabe innerhalb von ACTIVE_MS.
export const isActive = (p: Pilot | undefined, now: number) => !!p && now - p.input < ACTIVE_MS;

// Wie viele müssen im Ring sein? 60 % der Aktiven, aufgerundet – bei bis zu drei Aktiven also zwei (eine allein: eine).
// Ohne Aktive (Schwarm fliegt allein) zählen alle.
export function ringNeeded(active: number): number {
  if (active <= 0) return 0;
  return Math.ceil(active * 0.6);
}

// Deckkraft eines Avatars: voll, solange aktiv oder noch nie gelenkt; danach gedimmt.
export function boidAlpha(p: Pilot | undefined, now: number): number {
  if (!p || p.input === -Infinity) return 1;
  return now - p.input < ACTIVE_MS ? 1 : 0.4;
}

// Ring-Zustand: Wie lange sind schon genug drin? Platzt er? (rein, ohne Zeichnen)
export type RingState = { heldMs: number; round: number };
export function ringStep(ring: RingState, inside: number, needed: number, dtMs: number): { ring: RingState; burst: boolean } {
  if (needed > 0 && inside >= needed) {
    const heldMs = ring.heldMs + dtMs;
    if (heldMs >= HOLD_MS) return { ring: { heldMs: 0, round: ring.round + 1 }, burst: true };
    return { ring: { heldMs, round: ring.round }, burst: false };
  }
  return { ring: { heldMs: 0, round: ring.round }, burst: false };
}

// Rechteck, das der Schwarm meidet (QR-Code, Zähler, Überschrift …), in Pixeln der Leinwand.
export type Rect = { x: number; y: number; w: number; h: number };

// Neue Person: fliegt vom QR-Code her ein (oder vom rechten Rand), leicht gestreut.
export function spawnPoint(w: number, h: number, qr: Rect | null, seed: number): Vec {
  const jitter = ((seed % 1000) / 1000 - 0.5) * Math.min(h * 0.3, 240);
  if (qr) return { x: Math.max(0, qr.x - 20), y: Math.min(h - 40, Math.max(40, qr.y + qr.h / 2 + jitter)) };
  return { x: w - 40, y: Math.min(h - 40, Math.max(40, h / 2 + jitter)) };
}

// Liegt ein Punkt in einem (um margin vergrößerten) Rechteck?
export function inRect(p: Vec, r: Rect, margin = 0): boolean {
  return p.x > r.x - margin && p.x < r.x + r.w + margin && p.y > r.y - margin && p.y < r.y + r.h + margin;
}

// Überdeckt ein Ring (Mittelpunkt p, Radius r) eine Sperrzone? Der ganze Kreis muss frei sein, plus etwas Luft.
export function ringBlocked(p: Vec, r: number, avoid: Rect[]): boolean {
  return avoid.some((a) => inRect(p, a, r + 12));
}

// Schub weg von einer Sperrzone: vom nächsten Punkt des Rechtecks nach außen, stärker je näher (0 außerhalb von reach).
// Liegt der Punkt drin, geht es zur nächsten Kante hinaus.
export function pushFrom(p: Vec, a: Rect, reach: number): Vec {
  const nx = Math.min(Math.max(p.x, a.x), a.x + a.w), ny = Math.min(Math.max(p.y, a.y), a.y + a.h);
  const inside = nx === p.x && ny === p.y;
  if (inside) {
    const dl = p.x - a.x, dr = a.x + a.w - p.x, dt = p.y - a.y, db = a.y + a.h - p.y;
    const m = Math.min(dl, dr, dt, db);
    return m === dl ? { x: -1, y: 0 } : m === dr ? { x: 1, y: 0 } : m === dt ? { x: 0, y: -1 } : { x: 0, y: 1 };
  }
  const dx = p.x - nx, dy = p.y - ny, d = Math.hypot(dx, dy);
  if (d >= reach) return { x: 0, y: 0 };
  const k = 1 - d / reach;
  return { x: dx / d * k, y: dy / d * k };
}

// Neuer Ring-Platz: zufällig, aber nicht über Text/QR und nicht am Rand. rand: () => [0,1).
export function ringSpot(w: number, h: number, r: number, avoid: Rect[], rand: () => number): Vec {
  for (let i = 0; i < 40; i++) {
    const p = { x: r + 20 + rand() * Math.max(1, w - 2 * r - 40), y: r + 20 + rand() * Math.max(1, h - 2 * r - 40) };
    if (!ringBlocked(p, r, avoid)) return p;
  }
  return { x: w * 0.4, y: h * 0.7 };
}
