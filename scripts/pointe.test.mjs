// Pointe zur Respekt-Frage: Sie nennt nur, was wirklich gewählt wurde.
// Ausführen: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { RESPEKT, respektPointe } from "../src/lib/pointe.ts";
import { STEPS } from "../src/lib/steps.ts";

const NACHSATZ = "Am Ende von Tag 1 ist der Respekt davor kleiner.";
const { terminal, fehler, kaputt, nichts } = RESPEKT;

test("eine Person, nur „Fehlermeldungen“: kein „Alle drei“", () => {
  assert.equal(respektPointe({ [fehler]: 1 }), `Heute kommen Fehlermeldungen dran. ${NACHSATZ}`);
});

test("ein Thema", () => {
  assert.equal(respektPointe({ [terminal]: 2, [nichts]: 1 }), `Heute kommt das Terminal dran. ${NACHSATZ}`);
  assert.equal(respektPointe({ [kaputt]: 1 }), `Heute machen wir absichtlich etwas kaputt – und holen es zurück. ${NACHSATZ}`);
});

test("zwei Themen", () => {
  assert.equal(respektPointe({ [terminal]: 1, [fehler]: 1 }), `Heute kommen das Terminal und Fehlermeldungen dran. ${NACHSATZ}`);
  assert.equal(respektPointe({ [terminal]: 1, [kaputt]: 3 }), `Heute kommt das Terminal dran – und wir machen absichtlich etwas kaputt. ${NACHSATZ}`);
  assert.equal(respektPointe({ [fehler]: 1, [kaputt]: 1 }), `Heute kommen Fehlermeldungen dran – und wir machen absichtlich etwas kaputt. ${NACHSATZ}`);
});

test("alle drei Themen gewählt: „Alle drei“", () => {
  assert.equal(respektPointe({ [terminal]: 1, [fehler]: 1, [kaputt]: 1 }), `Alle drei kommen heute dran. ${NACHSATZ}`);
});

test("nur „Gar nichts“: keine Behauptung über Respekt", () => {
  assert.equal(respektPointe({ [nichts]: 3 }), "Gut so. Heute kommen trotzdem das Terminal und Fehlermeldungen dran – und wir machen absichtlich etwas kaputt.");
});

test("keine Stimme: neutral", () => {
  assert.equal(respektPointe({}), "Heute kommen das Terminal und Fehlermeldungen dran – und wir machen absichtlich etwas kaputt.");
});

test("die Respekt-Frage bietet genau die Optionen, die die Pointe kennt", () => {
  const frage = STEPS.find((s) => s.kind === "poll" && s.punchline === respektPointe);
  assert.ok(frage, "keine Umfrage mit respektPointe in STEPS");
  assert.deepEqual([...frage.options].sort(), Object.values(RESPEKT).sort());
});
