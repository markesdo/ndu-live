// Umfragen für kleine Gruppen: wann die Leinwand auflöst, was → tut, was Handys zeigen.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  SMALL_MAX, isSmall, answeredCount, allAnswered, revealed, pollAdvance, countLabel, phoneWaiting, revealStepOf,
  nextRevealStep,
} from "../src/lib/poll-small.ts";

test("klein heißt 1 bis 6 Personen", () => {
  assert.equal(SMALL_MAX, 6);
  assert.equal(isSmall(0), false);
  assert.equal(isSmall(1), true);
  assert.equal(isSmall(6), true);
  assert.equal(isSmall(7), false);
});

test("answeredCount zählt nur Anwesende, jede Person einmal, nur diesen Schritt", () => {
  const answers = [
    { participant_id: "a", step: 1 }, { participant_id: "a", step: 1 }, // doppelt
    { participant_id: "b", step: 1 },
    { participant_id: "c", step: 2 }, // anderer Schritt
    { participant_id: "weg", step: 1 }, // nicht mehr da
  ];
  assert.equal(answeredCount(answers, ["a", "b", "c", "d"], 1), 2);
  // Eigene Antwort, die noch nicht zurück ist, zählt mit – aber nicht doppelt.
  assert.equal(answeredCount(answers, ["a", "b", "c", "d"], 1, "d"), 3);
  assert.equal(answeredCount(answers, ["a", "b", "c", "d"], 1, "a"), 2);
  assert.equal(answeredCount(answers, ["a", "b"], 1, "fremd"), 2);
});

test("allAnswered braucht mindestens eine Person", () => {
  assert.equal(allAnswered(0, 0), false);
  assert.equal(allAnswered(3, 4), false);
  assert.equal(allAnswered(4, 4), true);
});

test("kleine Gruppe: aufgelöst erst wenn alle geantwortet haben oder früher per →", () => {
  assert.equal(revealed(2, 4, false), false);
  assert.equal(revealed(3, 4, false), false);
  assert.equal(revealed(4, 4, false), true);
  assert.equal(revealed(3, 4, true), true);
  assert.equal(revealed(0, 6, false), false);
  assert.equal(revealed(6, 6, false), true);
});

test("große Gruppe: immer sofort sichtbar wie bisher", () => {
  assert.equal(revealed(0, 7, false), true);
  assert.equal(revealed(3, 22, false), true);
});

test("→ auf einer Umfrage: auflösen, dann Pointe, dann weiter", () => {
  assert.equal(pollAdvance(false, true, false), "reveal");
  assert.equal(pollAdvance(true, true, false), "punch");
  assert.equal(pollAdvance(true, true, true), "next");
  assert.equal(pollAdvance(false, false, false), "reveal");
  assert.equal(pollAdvance(true, false, false), "next");
});

test("Zahlen statt Prozent in kleinen Gruppen", () => {
  assert.equal(countLabel(2, 4, 4), "2");
  assert.equal(countLabel(0, 0, 4), "0");
  assert.equal(countLabel(11, 21, 22), "11 · 52%");
  assert.equal(countLabel(0, 0, 22), "0 · 0%");
});

test("Handy wartet in kleiner Gruppe, bis alle geantwortet haben", () => {
  assert.equal(phoneWaiting(2, 4, 3, null), "Gesendet · warten auf die anderen (2 von 4)");
  assert.equal(phoneWaiting(4, 4, 3, null), null);
  assert.equal(phoneWaiting(3, 22, 3, null), null);
});

test("Handy zeigt das Ergebnis, sobald die Leinwand diesen Schritt früh aufgelöst hat", () => {
  // eine Person hat den Tab geschlossen, die Leitung löst mit → auf: 3 von 4, aber reveal für Schritt 3
  assert.equal(phoneWaiting(3, 4, 3, 3), null);
  // reveal für einen anderen Schritt zählt nicht
  assert.equal(phoneWaiting(3, 4, 3, 2), "Gesendet · warten auf die anderen (3 von 4)");
  assert.equal(phoneWaiting(3, 4, 4, 3), "Gesendet · warten auf die anderen (3 von 4)");
  // große Gruppe: unverändert sofort
  assert.equal(phoneWaiting(1, 22, 3, null), null);
});

test("revealStepOf nimmt nur ganze Schritt-Nummern aus der Nachricht", () => {
  assert.equal(revealStepOf({ step: 3, run: "x" }), 3);
  assert.equal(revealStepOf({ step: 0 }), 0);
  for (const bad of [null, undefined, {}, { step: "3" }, { step: -1 }, { step: 1.5 }, { step: NaN }, 3]) {
    assert.equal(revealStepOf(bad), null, JSON.stringify(bad));
  }
});

test("nextRevealStep folgt der Leinwand: aufgelöst merken, verdeckt vergessen", () => {
  assert.equal(nextRevealStep(null, { step: 2, run: "x", shown: true }), 2);
  assert.equal(nextRevealStep(null, { step: 2, run: "x" }), 2); // alte Leinwand ohne shown
  // Leinwand zeigt Schritt 2 wieder verdeckt (zurückgenommen oder N → N+1 → N): vergessen
  assert.equal(nextRevealStep(2, { step: 2, run: "x", shown: false }), null);
  // verdeckt für einen anderen Schritt: gemerkten Schritt nicht anfassen
  assert.equal(nextRevealStep(2, { step: 3, run: "x", shown: false }), 2);
  assert.equal(nextRevealStep(null, { step: 3, run: "x", shown: false }), null);
  // Kaputtes ändert nichts
  assert.equal(nextRevealStep(2, null), 2);
  assert.equal(nextRevealStep(2, { step: "2", shown: false }), 2);
});

