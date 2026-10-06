// Tests für die Prüf-Helfer der KI-Antworten. Ausführen: node --test scripts/
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseSpotlight, parseThemen, stripNames, allowCall } from "../src/lib/ai-shared.ts";

test("Spotlight: gültige Antwort wird übernommen, auf drei Kriterien gekürzt", () => {
  const r = parseSpotlight(JSON.stringify({ pitch: "Eine App für Mensa-Tipps.", kriterien: ["a", "b", "c", "d"] }));
  assert.deepEqual(r, { pitch: "Eine App für Mensa-Tipps.", kriterien: ["a", "b", "c"] });
});

test("Spotlight: weniger als drei Kriterien, kaputtes JSON oder falsche Typen ergeben null", () => {
  assert.equal(parseSpotlight(JSON.stringify({ pitch: "x", kriterien: ["a", "b"] })), null);
  assert.equal(parseSpotlight("{kaputt"), null);
  assert.equal(parseSpotlight({ pitch: 3, kriterien: ["a", "b", "c"] }), null);
  assert.equal(parseSpotlight({ pitch: "  ", kriterien: ["a", "b", "c"] }), null);
});

test("Spotlight: zu lange Kriterien werden auf 140 Zeichen gekürzt", () => {
  const lang = "x".repeat(200);
  const r = parseSpotlight({ pitch: "p", kriterien: [lang, "b", "c"] });
  assert.equal(r.kriterien[0].length, 140);
  assert.ok(r.kriterien[0].endsWith("…"));
});

test("Themen: unbekannte IDs fallen weg, doppelte zählen einmal, Rest landet in „Weitere Ideen“", () => {
  const r = parseThemen({ themen: [
    { titel: "Lernen", ids: ["a", "b", "zz"] },
    { titel: "Campus", ids: ["b", "c"] },
  ] }, ["a", "b", "c", "d"]);
  assert.deepEqual(r, [
    { titel: "Lernen", ids: ["a", "b"] },
    { titel: "Campus", ids: ["c"] },
    { titel: "Weitere Ideen", ids: ["d"] },
  ]);
});

test("Themen: nur ein Thema ist keine Landkarte – null", () => {
  assert.equal(parseThemen({ themen: [{ titel: "Alles", ids: ["a", "b"] }] }, ["a", "b"]), null);
  assert.equal(parseThemen("nope", ["a"]), null);
});

test("Namen werden ersetzt, Wortteile bleiben", () => {
  assert.equal(stripNames("Eine App für Lena und lena", ["Lena"]), "Eine App für jemand und jemand");
  assert.equal(stripNames("Kalenderblatt", ["Lena"]), "Kalenderblatt");
  assert.equal(stripNames("Jörg sagt hi", ["Jörg"]), "jemand sagt hi");
});

test("Bremse: höchstens max Aufrufe pro Minute und Route", () => {
  const t = 1_000_000;
  assert.equal(allowCall("test", 2, t), true);
  assert.equal(allowCall("test", 2, t + 1), true);
  assert.equal(allowCall("test", 2, t + 2), false);
  assert.equal(allowCall("test", 2, t + 61_000), true);
});
