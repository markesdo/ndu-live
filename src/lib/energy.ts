// „Der Raum schreibt den Prompt“: Jeder Tipp auf dem Handy ist ein Token. Die Handys schicken ihre Tipps
// gebündelt (alle 2 s eine Nachricht) per Realtime-Broadcast; nur die Leinwand hört zu und zählt.
// Hier steht die reine Logik – ohne React, ohne Netz –, damit sie sich testen lässt.

export const FLUSH_MS = 2000; // Handy: höchstens eine Nachricht alle 2 s
export const MAX_BATCH = 24; // 12 Tipps pro Sekunde – wer schneller ist, klickt automatisch
// Leinwand: pro Person höchstens eine Nachricht in diesem Abstand. Handys senden alle 2 s, schwankende
// Netzlaufzeit kann zwei Nachrichten aber dicht hintereinander ankommen lassen – deshalb großzügig.
export const MIN_GAP_MS = 500;
export const STAGE_EVERY_MS = 3000; // Leinwand meldet ihren Stand regelmäßig – auch für Nachzügler und verlorene Nachrichten
export const SHARE_CAP = 0.4; // Leinwand: niemand trägt mehr als 40 % einer Stufe – eine Person allein schafft es nicht

export const STAGES = ["Prompt schreiben", "Agent arbeitet …", "Deployen …"] as const;

// Der Prompt, den der Raum schreibt. Er beschreibt die App, in der alle gerade sitzen.
export const promptWords = (n: number) =>
  `Baue eine App, mit der ${n} Leute im Hörsaal live abstimmen, Ideen teilen und am Ende jubeln.`.split(" ");

// Handy: Wie viele Tipps gehen in die nächste Nachricht? 0 → keine Nachricht.
export function batchSize(pending: number): number {
  if (!Number.isFinite(pending) || pending <= 0) return 0;
  return Math.min(Math.floor(pending), MAX_BATCH);
}

// Stufen wachsen mit dem Raum: Länge der Stufen 1×, 2×, 3× base. Ergebnis: Summen-Schwellen.
export function stageTargets(participants: number): [number, number, number] {
  const base = Math.max(300, 40 * Math.max(0, participants));
  return [base, base * 3, base * 6];
}

// 0, 1, 2 = laufende Stufe; 3 = fertig („Deployed“).
export function stageOf(total: number, targets: readonly number[]): number {
  let s = 0;
  while (s < targets.length && total >= targets[s]) s++;
  return s;
}

// Fortschritt innerhalb einer Stufe, 0..1 (ohne Angabe: die laufende Stufe). Die Leinwand übergibt ihre
// erreichte Stufe – nach einem Nachzügler kann die Summe kurz unter deren Schwelle liegen, dann zeigt sie 0.
export function stageProgress(total: number, targets: readonly number[], stage = stageOf(total, targets)): number {
  const s = stage;
  if (s >= targets.length) return 1;
  const from = s === 0 ? 0 : targets[s - 1];
  return Math.min(1, Math.max(0, (total - from) / (targets[s] - from)));
}

// Wie viele Wörter des Prompts schon stehen: Der Prompt ist am Ende von Stufe 1 fertig geschrieben.
export function wordsFor(total: number, targets: readonly number[], wordCount: number): number {
  if (total <= 0) return 0;
  return Math.min(wordCount, Math.ceil((total / targets[0]) * wordCount));
}

export type Msg = { pid: unknown; n: unknown; seq?: unknown };
type Person = { last: number; stage: number; inStage: number };
export type EnergyState = { total: number; people: Map<string, Person> };

export const emptyEnergy = (): EnergyState => ({ total: 0, people: new Map() });

// Leinwand: eine Nachricht prüfen und zählen. Ändert den Zustand an Ort und Stelle (wird bis zu 12×/s
// aufgerufen) und gibt zurück, wie viele Tokens gezählt wurden. Die Leinwand ist der einzige vertrauenswürdige Ort.
// Bekannte Grenze: Die Person-ID kommt vom Handy. Wer per Skript fremde IDs schickt, umgeht den Anteil-Deckel –
// für ein Spiel in der Lobby in Kauf genommen (es geht um nichts, und der Deckel pro Nachricht bleibt).
// minStage: Stufen gehen auf der Leinwand nie zurück, auch wenn später jemand dazukommt und die Schwellen wachsen.
// Wie viele Personen tragen in dieser Stufe schon bei (die sendende mitgezählt)?
function activeInStage(state: EnergyState, stage: number, pid: string): number {
  let n = 0;
  for (const [id, p] of state.people) if (id === pid || (p.stage === stage && p.inStage > 0)) n++;
  return state.people.has(pid) ? n : n + 1;
}

// Höchstanteil pro Person: mindestens SHARE_CAP, bei wenigen Aktiven so viel, dass sie die Stufe gemeinsam schaffen.
export function shareCap(active: number): number {
  return Math.min(1, Math.max(SHARE_CAP, 1 / Math.max(1, active) + 0.1));
}

export function accept(state: EnergyState, msg: Msg, knownIds: ReadonlySet<string>, participants: number, now: number, minStage = 0): number {
  if (typeof msg.pid !== "string" || !knownIds.has(msg.pid)) return 0;
  const raw = typeof msg.n === "number" ? msg.n : Number.NaN;
  let n = batchSize(raw);
  if (n === 0) return 0;

  const targets = stageTargets(participants);
  const stage = Math.max(stageOf(state.total, targets), minStage);
  if (stage >= targets.length) return 0; // fertig: nichts mehr zählen

  const person = state.people.get(msg.pid) ?? { last: -Infinity, stage, inStage: 0 };
  if (now - person.last < MIN_GAP_MS) return 0;
  if (person.stage !== stage) { person.stage = stage; person.inStage = 0; }

  // Anteil pro Person und Stufe begrenzen. Maßstab sind die Personen, die in dieser Stufe wirklich tippen
  // (nicht die Beigetretenen): Tippen nur zwei, darf jede 60 % – sonst bliebe die Stufe bei 80 % hängen.
  // Probe allein (≤ 2 Beigetretene): eine Person darf alles.
  const len = targets[stage] - (stage === 0 ? 0 : targets[stage - 1]);
  // Mindestens zwei Aktive annehmen, sobald mehr als zwei beigetreten sind – eine Person allein schafft nie eine Stufe.
  const active = Math.max(activeInStage(state, stage, msg.pid), participants > 2 ? 2 : 1);
  const cap = shareCap(active);
  if (cap < 1) n = Math.min(n, Math.max(0, Math.floor(len * cap) - person.inStage));
  person.last = now;
  state.people.set(msg.pid, person);
  if (n <= 0) return 0;
  person.inStage += n;
  state.total += n;
  return n;
}

// Handy: Stand der Leinwand übernehmen. Gleicher Durchlauf (run) → Stufe nur nach oben; neuer Durchlauf
// (Leinwand neu geladen, zurück in die Lobby) → neu anfangen, damit kein Handy auf „Deployed“ hängen bleibt.
// Ein fremder Durchlauf wird erst übernommen, wenn der bisherige eine Weile schweigt – sonst springen die Handys
// hin und her, falls versehentlich zwei Leinwände offen sind (z. B. Laptop und zweiter Tab).
export const RUN_SWITCH_MS = STAGE_EVERY_MS * 2 + 1000;
export type PhoneStage = { run: string; stage: number; heard: number };
export function nextPhoneStage(prev: PhoneStage | null, msg: unknown, now: number): PhoneStage | null {
  const m = msg as { run?: unknown; stage?: unknown } | null;
  if (!m || typeof m.run !== "string" || typeof m.stage !== "number" || !Number.isInteger(m.stage) || m.stage < 0 || m.stage > 3) return prev;
  if (!prev) return { run: m.run, stage: m.stage, heard: now };
  if (prev.run !== m.run) return now - prev.heard >= RUN_SWITCH_MS ? { run: m.run, stage: m.stage, heard: now } : prev;
  return { run: prev.run, stage: Math.max(prev.stage, m.stage), heard: now };
}
