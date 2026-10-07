// Tests für das Lobby-Spiel „Schwarm“ (reine Logik in src/lib/swarm.ts).
// Ausführen: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ACTIVE_MS, HEARTBEAT_MS, HOLD_MS, MIN_GAP_MS, SEND_MS, STALE_MS, acceptStick, currentTarget, boidAlpha, isActive, lerpStick, quantise, ringNeeded, ringSpot, ringStep, shouldSend, spawnPoint,
} from "../src/lib/swarm.ts";

const ids = new Set(["a", "b"]);

test("Handy: Richtung wird auf Länge 1 begrenzt und gerundet, Unsinn wird 0", () => {
  assert.deepEqual(quantise({ x: 3, y: 4 }), { x: 0.6, y: 0.8 });
  assert.deepEqual(quantise({ x: 0.123, y: -0.456 }), { x: 0.12, y: -0.46 });
  assert.deepEqual(quantise({ x: Number.NaN, y: 1 }), { x: 0, y: 0 });
  assert.deepEqual(quantise({ x: -0.001, y: 0 }), { x: 0, y: 0 });
});

test("Handy: höchstens alle 500 ms und nur bei merklicher Änderung", () => {
  assert.equal(shouldSend(null, { x: 1, y: 0 }, SEND_MS - 1), false);
  assert.equal(shouldSend(null, { x: 1, y: 0 }, SEND_MS), true);
  assert.equal(shouldSend(null, { x: 0, y: 0 }, SEND_MS), false); // nichts im Leerlauf
  assert.equal(shouldSend({ x: 1, y: 0 }, { x: 0.98, y: 0.02 }, 1000), false); // kleine Änderung, vor dem Herzschlag
  assert.equal(shouldSend({ x: 1, y: 0 }, { x: 0, y: 0 }, SEND_MS), true); // Loslassen geht raus
});

test("Leinwand: unbekannte Person und kaputte Zahlen werden verworfen", () => {
  const m = new Map();
  assert.equal(acceptStick(m, { pid: "fremd", x: 1, y: 0, seq: 1 }, ids, 0), false);
  assert.equal(acceptStick(m, { pid: 42, x: 1, y: 0 }, ids, 0), false);
  assert.equal(acceptStick(m, { pid: "a", x: "1", y: 0 }, ids, 0), false);
  assert.equal(acceptStick(m, { pid: "a", x: Number.NaN, y: 0 }, ids, 0), false);
  assert.equal(acceptStick(m, null, ids, 0), false); // kaputter Broadcast darf die Leinwand nicht abstürzen lassen
  assert.equal(acceptStick(m, "x", ids, 0), false);
  assert.equal(acceptStick(m, { pid: "a", x: Infinity, y: 0 }, ids, 0), false);
  assert.equal(m.size, 0);
});

test("Leinwand: Mindestabstand und Reihenfolge (seq) pro Person, Richtung gedeckelt", () => {
  const m = new Map();
  assert.equal(acceptStick(m, { pid: "a", x: 5, y: 0, seq: 1 }, ids, 0), true);
  assert.deepEqual(m.get("a").target, { x: 1, y: 0 });
  assert.equal(acceptStick(m, { pid: "a", x: 0, y: 1, seq: 2 }, ids, MIN_GAP_MS - 1), false);
  assert.equal(acceptStick(m, { pid: "a", x: 0, y: 1, seq: 1 }, ids, MIN_GAP_MS), false); // Doppel/verspätet
  assert.equal(acceptStick(m, { pid: "a", x: 0, y: 1, seq: 2 }, ids, MIN_GAP_MS), true);
  assert.equal(acceptStick(m, { pid: "b", x: 0, y: 1, seq: 1 }, ids, MIN_GAP_MS), true); // andere Person: eigener Takt
});

test("Leinwand: Loslassen (0,0) zählt nicht als neue Aktivität", () => {
  const m = new Map();
  acceptStick(m, { pid: "a", x: 1, y: 0, seq: 1 }, ids, 0);
  acceptStick(m, { pid: "a", x: 0, y: 0, seq: 2 }, ids, 10_000);
  assert.equal(m.get("a").input, 0);
  assert.equal(isActive(m.get("a"), ACTIVE_MS - 1), true);
  assert.equal(isActive(m.get("a"), ACTIVE_MS), false);
  assert.equal(boidAlpha(m.get("a"), ACTIVE_MS), 0.4);
  assert.equal(boidAlpha(undefined, 0), 1);
});

test("Leinwand: Richtung wird geglättet und erreicht das Ziel", () => {
  const half = lerpStick({ x: 0, y: 0 }, { x: 1, y: 0 }, 250);
  assert.ok(half.x > 0.6 && half.x < 0.65); // 1 − e^−1 ≈ 0,632
  assert.deepEqual(lerpStick({ x: 0.3, y: 0 }, { x: 1, y: 0 }, 0), { x: 0.3, y: 0 });
  assert.ok(lerpStick({ x: 0, y: 0 }, { x: 1, y: 0 }, 5000).x > 0.999);
});

test("Ring: 60 % der Aktiven, bei bis zu drei Aktiven reichen zwei", () => {
  assert.equal(ringNeeded(0), 0);
  assert.equal(ringNeeded(1), 1);
  assert.equal(ringNeeded(2), 2);
  assert.equal(ringNeeded(3), 2);
  assert.equal(ringNeeded(4), 3);
  assert.equal(ringNeeded(10), 6);
});

test("Ring: platzt erst nach 1,5 s mit genug Leuten, sonst zurück auf null", () => {
  let r = { heldMs: 0, round: 0 };
  let out = ringStep(r, 6, 6, HOLD_MS - 1);
  assert.equal(out.burst, false);
  r = out.ring;
  out = ringStep(r, 5, 6, 10); // eine fällt raus → Zeit von vorn
  assert.equal(out.ring.heldMs, 0);
  out = ringStep(out.ring, 6, 6, HOLD_MS);
  assert.equal(out.burst, true);
  assert.equal(out.ring.round, 1);
  assert.equal(ringStep({ heldMs: 0, round: 0 }, 0, 0, HOLD_MS).burst, false); // niemand da: kein Platzen
});

test("Neue Person kommt vom QR-Code her, neuer Ring nie über Text", () => {
  const qr = { x: 1400, y: 300, w: 400, h: 400 };
  const p = spawnPoint(1920, 1080, qr, 500);
  assert.ok(p.x <= qr.x && p.y > qr.y && p.y < qr.y + qr.h);
  let k = 0;
  const rand = () => ((k = (k * 9301 + 49297) % 233280) / 233280);
  const avoid = [{ x: 0, y: 0, w: 900, h: 500 }, qr];
  for (let i = 0; i < 20; i++) {
    const s = ringSpot(1920, 1080, 150, avoid, rand);
    assert.ok(!avoid.some((a) => s.x > a.x - 90 && s.x < a.x + a.w + 90 && s.y > a.y - 90 && s.y < a.y + a.h + 90), `Ring bei ${s.x},${s.y}`);
  }
});

test("Leinwand: gefälschte riesige seq sperrt das echte Handy nicht aus", () => {
  const m = new Map();
  assert.equal(acceptStick(m, { pid: "a", x: 1, y: 0, seq: 1e15 }, ids, 0), true); // Fälschung
  assert.equal(acceptStick(m, { pid: "a", x: 0, y: 1, seq: 7 }, ids, MIN_GAP_MS), true); // echtes Handy, kleine seq
  assert.deepEqual(m.get("a").target, { x: 0, y: 1 });
});

test("Leinwand: riesige oder unendliche Zahlen werden gedeckelt oder verworfen, Zustand bleibt so groß wie die Lobby", () => {
  const m = new Map();
  assert.equal(acceptStick(m, { pid: "a", x: 1e300, y: -1e300, seq: 1 }, ids, 0), true);
  const t = m.get("a").target;
  assert.ok(Math.hypot(t.x, t.y) <= 1.01, `gedeckelt: ${t.x},${t.y}`); // Rundung auf 2 Stellen
  assert.equal(acceptStick(m, { pid: "b", x: 0, y: 0, seq: Infinity }, ids, 0), true); // kaputte seq zählt als „keine“
  for (let i = 0; i < 1000; i++) acceptStick(m, { pid: `fremd${i}`, x: 1, y: 0, seq: i }, ids, i * 1000);
  assert.equal(m.size, 2);
});

test("Handy: hält der Daumen still, geht alle 2 s ein Herzschlag raus – losgelassen nichts", () => {
  assert.equal(shouldSend({ x: 1, y: 0 }, { x: 1, y: 0 }, HEARTBEAT_MS - 1), false);
  assert.equal(shouldSend({ x: 1, y: 0 }, { x: 1, y: 0 }, HEARTBEAT_MS), true);
  assert.equal(shouldSend({ x: 0, y: 0 }, { x: 0, y: 0 }, 60_000), false);
});

test("Leinwand: Loslassen wird auch dicht nach der letzten Richtung angenommen (Review #6)", () => {
  const m = new Map();
  acceptStick(m, { pid: "a", x: 1, y: 0, seq: 1 }, ids, 0);
  assert.equal(acceptStick(m, { pid: "a", x: 0, y: 0, seq: 2 }, ids, 70), true);
  assert.deepEqual(m.get("a").target, { x: 0, y: 0 });
});

test("Leinwand: ohne Nachricht gilt die Person nach 3,5 s als losgelassen (gesperrter Bildschirm, Neuladen)", () => {
  const m = new Map();
  acceptStick(m, { pid: "a", x: 1, y: 0, seq: 1 }, ids, 0);
  assert.deepEqual(currentTarget(m.get("a"), STALE_MS), { x: 1, y: 0 });
  assert.deepEqual(currentTarget(m.get("a"), STALE_MS + 1), { x: 0, y: 0 });
  // Herzschlag hält die Richtung und die Aktivität frisch
  acceptStick(m, { pid: "a", x: 1, y: 0, seq: 2 }, ids, 3000);
  assert.deepEqual(currentTarget(m.get("a"), 5000), { x: 1, y: 0 });
  assert.equal(isActive(m.get("a"), 3000 + ACTIVE_MS - 1), true);
});

test("Leinwand: verspätete ältere Nachricht überschreibt das Loslassen nicht (Review #6)", () => {
  const m = new Map();
  const t0 = 1_800_000_000_000; // seq = Uhrzeit des Handys
  acceptStick(m, { pid: "a", x: 0, y: 0, seq: t0 + 600 }, ids, 0); // Loslassen kommt zuerst an
  assert.equal(acceptStick(m, { pid: "a", x: 1, y: 0, seq: t0 }, ids, 300), false); // alte Richtung, verspätet
  assert.deepEqual(m.get("a").target, { x: 0, y: 0 });
});
