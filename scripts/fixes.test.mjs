// Tests zu den Review-Befunden von PR #2 (Spotlight-Warteschlange, Nachladen, Zugang zur KI).
// Ausführen: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { mergeRows, backoffMs, createLoader } from "../src/lib/session-merge.ts";
import { requestSpot, doneSpot, ideaTextForAi } from "../src/lib/spot-queue.ts";
import { checkAccess } from "../src/lib/ai-shared.ts";

// Befund 3: Ein Nachladen darf Zeilen, die währenddessen per Realtime kamen, nicht verwerfen.
test("Nachladen: Realtime-Zeile nach Ladebeginn bleibt, gelöschte Zeile fällt weg", () => {
  const prev = [{ id: "a" }, { id: "b" }, { id: "neu" }];
  const snapshot = [{ id: "a" }]; // b wurde gelöscht, „neu“ kam per Realtime nach dem Laden
  const out = mergeRows(snapshot, prev, new Set(["neu"]));
  assert.deepEqual(out.map((r) => r.id), ["a", "neu"]);
});

test("Nachladen: Snapshot-Zeilen gewinnen, keine Doppelten", () => {
  const out = mergeRows([{ id: "a", v: 2 }], [{ id: "a", v: 1 }], new Set(["a"]));
  assert.deepEqual(out, [{ id: "a", v: 2 }]);
});

// Befund 4: Wiederholen mit wachsendem Abstand, gedeckelt.
test("Backoff: 1 s, 2 s, 4 s … höchstens 15 s", () => {
  assert.deepEqual([0, 1, 2, 3, 4, 10].map(backoffMs), [1000, 2000, 4000, 8000, 15000, 15000]);
});

// Befund 1: Eine verdrängte wartende Idee darf nicht ewig „loading“ bleiben.
test("Spotlight-Warteschlange: zuletzt angeforderte Idee gewinnt, verdrängte wird gemeldet", () => {
  let q = { busy: null, wanted: null };
  let r = requestSpot(q, "A"); q = r.q;
  assert.equal(r.start, "A");
  r = requestSpot(q, "B"); q = r.q;
  assert.equal(r.start, null);
  assert.equal(r.dropped, null);
  r = requestSpot(q, "C"); q = r.q;
  assert.equal(r.dropped, "B");
  const d = doneSpot(q);
  assert.equal(d.start, "C");
  assert.deepEqual(d.q, { busy: "C", wanted: null });
  assert.deepEqual(doneSpot(d.q), { q: { busy: null, wanted: null }, start: null });
});

test("Spotlight-Warteschlange: dieselbe Idee nochmal anfordern startet nichts doppelt", () => {
  const r = requestSpot({ busy: "A", wanted: null }, "A");
  assert.equal(r.start, null);
  assert.deepEqual(r.q, { busy: "A", wanted: null });
});

// Befund 2: Text für die KI mit dem AKTUELLEN Stand – auch spät dazugekommene Namen und Ideen.
test("Text für die KI: Idee und Namen aus dem aktuellen Stand, später Beigetretene werden ersetzt", () => {
  const answers = [{ id: "i1", value: "App für Jonas und Lena" }];
  const people = [{ name: "Lena" }, { name: "Jonas" }]; // Jonas kam nach dem Start der ersten Anfrage
  assert.equal(ideaTextForAi("i1", answers, people), "App für jemand und jemand");
  assert.equal(ideaTextForAi("fehlt", answers, people), null);
});

// Befund 10: Nur die Leinwand mit PRESENTER_KEY darf KI auslösen; ohne API-Key ist sie aus.
test("Zugang zur KI: falscher oder fehlender Key 401, ohne API-Key 503, sonst frei", () => {
  const env = { PRESENTER_KEY: "geheim", ANTHROPIC_API_KEY: "x" };
  assert.equal(checkAccess({ key: "falsch" }, env), 401);
  assert.equal(checkAccess({}, env), 401);
  assert.equal(checkAccess(null, env), 401);
  assert.equal(checkAccess({ key: "" }, { ...env, PRESENTER_KEY: "" }), 401);
  assert.equal(checkAccess({ key: "geheim" }, { PRESENTER_KEY: "geheim" }), 503);
  assert.equal(checkAccess({ key: "geheim" }, env), null);
});

// Re-Review: Lade-Logik von useSession (createLoader) – Zusammenfassen, Wiederholen, Realtime-Ankünfte.

function harness() {
  const calls = { fetch: 0, applied: [], fails: [], timers: [], cleared: [] };
  const pending = [];
  const loader = createLoader({
    fetchAll: () => { calls.fetch++; return new Promise((res) => pending.push(res)); },
    apply: (data, lateP) => calls.applied.push({ data, lateP: [...lateP] }),
    onFail: (info) => calls.fails.push(info),
    setTimer: (fn, ms) => { const t = { fn, ms }; calls.timers.push(t); return t; },
    clearTimer: (t) => { if (t) calls.cleared.push(t); },
  });
  const resolveNext = async (r) => { pending.shift()(r); await new Promise((x) => setTimeout(x, 0)); };
  return { loader, calls, resolveNext };
}
const OK = (ids = []) => ({ ok: true, data: { step: 0, participants: ids.map((id) => ({ id })), answers: [] } });

test("Loader: Realtime-Ankunft während des Ladens wird an apply weitergegeben", async () => {
  const { loader, calls, resolveNext } = harness();
  loader.load();
  loader.arrivedParticipant("neu");
  await resolveNext(OK(["a"]));
  assert.deepEqual(calls.applied[0].lateP, ["neu"]);
});

test("Loader: fünf Ladewünsche während eines Ladens ergeben genau ein weiteres Laden", async () => {
  const { loader, calls, resolveNext } = harness();
  loader.load();
  for (let i = 0; i < 5; i++) loader.load();
  assert.equal(calls.fetch, 1);
  await resolveNext(OK());
  assert.equal(calls.fetch, 2);
  await resolveNext(OK());
  assert.equal(calls.fetch, 2);
});

test("Loader: Fehler → Wiederholen nach 1 s, 2 s; Erfolg löscht den wartenden Timer", async () => {
  const { loader, calls, resolveNext } = harness();
  loader.load();
  await resolveNext({ ok: false, notFound: false });
  assert.equal(calls.timers[0].ms, 1000);
  assert.equal(loader.firstLoadFailed, true);
  calls.timers[0].fn();
  await resolveNext({ ok: false, notFound: false });
  assert.equal(calls.timers[1].ms, 2000);
  loader.load(); // z. B. visibilitychange, bevor der Timer feuert
  await resolveNext(OK());
  assert.ok(calls.cleared.includes(calls.timers[1]));
  assert.equal(loader.firstLoadFailed, false);
});

test("Loader: falscher Code nur beim ersten Laden endgültig, danach wird erneut versucht", async () => {
  const first = harness();
  first.loader.load();
  await first.resolveNext({ ok: false, notFound: true });
  assert.equal(first.calls.timers.length, 0);
  assert.equal(first.calls.fails[0].notFound && first.calls.fails[0].firstLoad, true);

  const later = harness();
  later.loader.load();
  await later.resolveNext(OK());
  later.loader.load();
  await later.resolveNext({ ok: false, notFound: true });
  assert.equal(later.calls.timers.length, 1);
  assert.equal(later.calls.fails[0].firstLoad, false);
});
