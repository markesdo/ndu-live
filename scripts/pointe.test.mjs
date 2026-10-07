// Pointe zur Respekt-Frage: Sie nennt nur, was wirklich gewählt wurde.
// Ausführen: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { respektPointe } from "../src/lib/pointe.ts";
import { STEPS } from "../src/lib/steps.ts";

const NACHSATZ = "Am Ende von Tag 1 ist der Respekt davor kleiner.";

test("eine Person, nur „Fehlermeldungen“: kein „Alle drei“", () => {
  assert.equal(respektPointe([0, 1, 0, 0]), `Fehlermeldungen kommen heute vor. ${NACHSATZ}`);
});

test("ein Thema im Singular", () => {
  assert.equal(respektPointe([2, 0, 0, 1]), `Das Terminal kommt heute vor. ${NACHSATZ}`);
  assert.equal(respektPointe([0, 0, 1, 0]), `Etwas kaputt machen kommt heute vor. ${NACHSATZ}`);
});

test("zwei Themen, in der Reihenfolge der Optionen", () => {
  assert.equal(respektPointe([1, 0, 3, 0]), `Das Terminal und etwas kaputt machen kommen heute vor. ${NACHSATZ}`);
  assert.equal(respektPointe([0, 1, 1, 0]), `Fehlermeldungen und etwas kaputt machen kommen heute vor. ${NACHSATZ}`);
});

test("alle drei Themen gewählt: „Alle drei“", () => {
  assert.equal(respektPointe([1, 1, 1, 0]), `Alle drei kommen heute vor. ${NACHSATZ}`);
});

test("nur „Gar nichts“: keine Behauptung über Respekt", () => {
  assert.equal(respektPointe([0, 0, 0, 3]), "Gut so – das Terminal, Fehlermeldungen und etwas kaputt machen kommen heute trotzdem vor.");
});

test("keine Stimme: neutral", () => {
  assert.equal(respektPointe([0, 0, 0, 0]), "Das Terminal, Fehlermeldungen, etwas kaputt machen – alles kommt heute vor.");
});

test("die Respekt-Frage hat genau diese vier Optionen in dieser Reihenfolge", () => {
  const frage = STEPS.find((s) => s.kind === "poll" && s.title === "Wovor hast du am meisten Respekt?");
  assert.deepEqual(frage.options, ["Das Terminal", "Fehlermeldungen", "Dass ich etwas kaputt mache", "Gar nichts – los geht's"]);
  assert.equal(typeof frage.punchline, "function");
});
