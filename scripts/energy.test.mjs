// Tests für den gemeinsamen Token-Zähler in der Lobby („Der Raum schreibt den Prompt“).
// Ausführen: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  MAX_BATCH, MIN_GAP_MS, accept, batchSize, emptyEnergy, nextPhoneStage, RUN_SWITCH_MS, promptWords, stageOf, stageProgress, stageTargets, wordsFor,
} from "../src/lib/energy.ts";

test("Handy: Bündel ist auf 24 gedeckelt, 0 und Unsinn schicken nichts", () => {
  assert.equal(batchSize(0), 0);
  assert.equal(batchSize(-3), 0);
  assert.equal(batchSize(Number.NaN), 0);
  assert.equal(batchSize(5), 5);
  assert.equal(batchSize(24), 24);
  assert.equal(batchSize(500), MAX_BATCH);
  assert.equal(MAX_BATCH, 24);
});

test("Stufen wachsen mit dem Raum (1×, 2×, 3× base), mindestens 300", () => {
  assert.deepEqual(stageTargets(1), [300, 900, 1800]);
  assert.deepEqual(stageTargets(20), [800, 2400, 4800]);
  assert.equal(stageOf(0, stageTargets(20)), 0);
  assert.equal(stageOf(799, stageTargets(20)), 0);
  assert.equal(stageOf(800, stageTargets(20)), 1);
  assert.equal(stageOf(4800, stageTargets(20)), 3);
  assert.equal(stageProgress(400, stageTargets(20)), 0.5);
  assert.equal(stageProgress(1600, stageTargets(20)), 0.5);
});

test("Prompt ist am Ende von Stufe 1 fertig geschrieben", () => {
  const t = stageTargets(20), w = promptWords(20).length;
  assert.equal(wordsFor(0, t, w), 0);
  assert.equal(wordsFor(1, t, w), 1);
  assert.equal(wordsFor(t[0], t, w), w);
  assert.equal(wordsFor(t[0] * 5, t, w), w);
  assert.ok(promptWords(20).join(" ").includes("20 Leute"));
});

const ids = new Set(["a", "b", "c", "d", "e"]);

test("Leinwand: unbekannte Person und kaputte Nachricht zählen nicht", () => {
  const s = emptyEnergy();
  assert.equal(accept(s, { pid: "fremd", n: 10 }, ids, 5, 0), 0);
  assert.equal(accept(s, { pid: 42, n: 10 }, ids, 5, 0), 0);
  assert.equal(accept(s, { pid: "a", n: "10" }, ids, 5, 0), 0);
  assert.equal(s.total, 0);
});

test("Leinwand: mehr als 24 pro Nachricht wird gedeckelt", () => {
  const s = emptyEnergy();
  assert.equal(accept(s, { pid: "a", n: 1000 }, ids, 5, 0), 24);
  assert.equal(s.total, 24);
});

test("Leinwand: zweite Nachricht derselben Person zu früh wird verworfen", () => {
  const s = emptyEnergy();
  accept(s, { pid: "a", n: 10 }, ids, 5, 0);
  assert.equal(accept(s, { pid: "a", n: 10 }, ids, 5, MIN_GAP_MS - 1), 0);
  assert.equal(accept(s, { pid: "a", n: 10 }, ids, 5, MIN_GAP_MS), 10);
  assert.equal(accept(s, { pid: "b", n: 10 }, ids, 5, MIN_GAP_MS), 10); // andere Person: eigener Takt
  assert.equal(s.total, 30);
});

test("Leinwand: eine Person schafft keine Stufe allein (höchstens 60 %, solange sie allein tippt)", () => {
  const s = emptyEnergy(); // 5 Leute → Stufe 1 = 300 Tokens; allein tippend gilt der Deckel für zwei Aktive: 180
  let t = 0;
  for (let i = 0; i < 50; i++, t += MIN_GAP_MS) accept(s, { pid: "a", n: 24 }, ids, 5, t);
  assert.equal(s.total, 180);
  assert.equal(stageOf(s.total, stageTargets(5)), 0);
});

test("Leinwand: bei Probe allein gibt es keinen Anteil-Deckel", () => {
  const s = emptyEnergy();
  let t = 0;
  for (let i = 0; i < 20; i++, t += MIN_GAP_MS) accept(s, { pid: "a", n: 24 }, new Set(["a"]), 1, t);
  assert.equal(s.total, 480); // 20 × 24, kein Deckel
  assert.equal(stageOf(s.total, stageTargets(1)), 1);
});

test("Leinwand: der Anteil gilt pro Stufe neu, nach „Deployed“ zählt nichts mehr", () => {
  const s = emptyEnergy();
  let t = 0;
  const people = ["a", "b", "c", "d", "e"];
  while (stageOf(s.total, stageTargets(5)) < 3 && t < 1e7) {
    for (const p of people) accept(s, { pid: p, n: 24 }, ids, 5, t);
    t += MIN_GAP_MS;
  }
  assert.equal(stageOf(s.total, stageTargets(5)), 3);
  const before = s.total;
  assert.equal(accept(s, { pid: "a", n: 24 }, ids, 5, t + MIN_GAP_MS), 0);
  assert.equal(s.total, before);
});

// Review-Befunde PR #5
test("Leinwand: Stufe geht nicht zurück, wenn jemand dazukommt (minStage)", () => {
  const s = emptyEnergy();
  s.total = stageTargets(20)[2]; // 20 Leute: fertig
  // 21. Person: Schwellen wachsen, ohne minStage würde wieder gezählt
  assert.equal(accept(s, { pid: "a", n: 10 }, ids, 21, 0, 3), 0);
  assert.equal(accept(emptyEnergy(), { pid: "a", n: 10 }, ids, 21, 0, 0), 10);
  assert.equal(stageProgress(stageTargets(20)[0], stageTargets(21), 1), 0); // unter der Schwelle der erreichten Stufe
});

test("Handy: gleicher Durchlauf nur nach oben, neuer Durchlauf erst, wenn der alte schweigt", () => {
  let p = nextPhoneStage(null, { run: "r1", stage: 1 }, 0);
  assert.deepEqual(p, { run: "r1", stage: 1, heard: 0 });
  p = nextPhoneStage(p, { run: "r1", stage: 0 }, 1000);
  assert.equal(p.stage, 1); // verspätete alte Nachricht
  p = nextPhoneStage(p, { run: "r1", stage: 3 }, 3000);
  assert.equal(p.stage, 3);
  // zweite Leinwand offen, alte sendet noch: nicht wechseln
  assert.deepEqual(nextPhoneStage(p, { run: "r2", stage: 0 }, 3000 + RUN_SWITCH_MS - 1), p);
  // alte Leinwand schweigt (neu geladen): neu anfangen
  const q = nextPhoneStage(p, { run: "r2", stage: 0 }, 3000 + RUN_SWITCH_MS);
  assert.deepEqual(q, { run: "r2", stage: 0, heard: 3000 + RUN_SWITCH_MS });
  assert.deepEqual(nextPhoneStage(q, { run: "r2", stage: 7 }, 99999), q);
  assert.deepEqual(nextPhoneStage(q, { stage: 2 }, 99999), q);
  assert.deepEqual(nextPhoneStage(q, null, 99999), q);
});

test("Leinwand: zwei Bündel einer Person dicht hintereinander (Netz schwankt) zählen beide", () => {
  const s = emptyEnergy();
  assert.equal(accept(s, { pid: "a", n: 20 }, ids, 5, 1900), 20);
  assert.equal(accept(s, { pid: "a", n: 20 }, ids, 5, 2100 + MIN_GAP_MS - 200 + 100), 20);
  assert.ok(MIN_GAP_MS <= 500);
});

test("Leinwand: zwei Tippende schaffen eine Stufe, auch wenn mehr beigetreten sind (Review #5)", () => {
  const s = emptyEnergy();
  const ids = new Set(["a", "b", "c", "d", "e", "f", "g", "h", "i", "j"]);
  const [ziel] = stageTargets(10);
  let t = 0;
  for (let i = 0; i < 60; i++, t += MIN_GAP_MS) {
    accept(s, { pid: "a", n: 24 }, ids, 10, t);
    accept(s, { pid: "b", n: 24 }, ids, 10, t);
  }
  assert.ok(s.total >= ziel, `Stufe 1 erreicht: ${s.total} >= ${ziel}`);
});

test("Leinwand: kommen mitten im Spiel Leute dazu, bleibt die Stufe nicht hängen (Review #5, zweite Runde)", () => {
  const s = emptyEnergy();
  const ids = new Set(Array.from({ length: 30 }, (_, i) => `p${i}`));
  const tapper = ["p0", "p1", "p2"];
  let t = 0, reached = 0;
  const run = (participants, rounds) => {
    for (let r = 0; r < rounds; r++, t += MIN_GAP_MS) {
      for (const p of tapper) accept(s, { pid: p, n: 24 }, ids, participants, t, reached);
      reached = Math.max(reached, stageOf(s.total, stageTargets(participants)));
    }
  };
  // genau bis Stufe 1 mit 10 Leuten (Ziel 400), dann kommen 20 dazu (Ziele 1200/3600/7200)
  while (reached < 1) run(10, 1);
  assert.equal(reached, 1);
  run(30, 400);
  assert.ok(reached >= 2, `nach dem Zuwachs auf 30 weiter: Stufe ${reached}, Stand ${s.total}`);
});

test("Leinwand: Einmal-Tipper blockieren die Dauertipper nicht (Review #5, dritte Runde)", () => {
  const s = emptyEnergy();
  const ids = new Set(Array.from({ length: 20 }, (_, i) => `p${i}`));
  const [ziel] = stageTargets(20);
  let t = 0;
  accept(s, { pid: "p2", n: 1 }, ids, 20, t);
  accept(s, { pid: "p3", n: 1 }, ids, 20, t);
  for (let r = 0; r < 2000 && s.total < ziel; r++, t += MIN_GAP_MS) {
    accept(s, { pid: "p0", n: 24 }, ids, 20, t);
    accept(s, { pid: "p1", n: 24 }, ids, 20, t);
  }
  assert.ok(s.total >= ziel, `Stufe 1 erreicht: ${s.total} >= ${ziel}`);
});
