// Tests für den gemeinsamen Token-Zähler in der Lobby („Der Raum schreibt den Prompt“).
// Ausführen: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  MAX_BATCH, MIN_GAP_MS, accept, batchSize, emptyEnergy, promptWords, stageOf, stageProgress, stageTargets, wordsFor,
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

test("Leinwand: eine Person schafft keine Stufe allein (40 %)", () => {
  const s = emptyEnergy(); // 5 Leute → Stufe 1 = 300 Tokens, Anteil höchstens 120
  let t = 0;
  for (let i = 0; i < 50; i++, t += MIN_GAP_MS) accept(s, { pid: "a", n: 24 }, ids, 5, t);
  assert.equal(s.total, 120);
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
