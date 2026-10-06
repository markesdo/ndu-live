// „Der Raum schreibt den Prompt“: Jeder Tipp auf dem Handy ist ein Token. Die Handys schicken ihre Tipps
// gebündelt (alle 2 s eine Nachricht) per Realtime-Broadcast; nur die Leinwand hört zu und zählt.
// Hier steht die reine Logik – ohne React, ohne Netz –, damit sie sich testen lässt.

export const FLUSH_MS = 2000; // Handy: höchstens eine Nachricht alle 2 s
export const MAX_BATCH = 24; // 12 Tipps pro Sekunde – wer schneller ist, klickt automatisch
export const MIN_GAP_MS = 1200; // Leinwand: pro Person höchstens eine Nachricht in diesem Abstand
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

// Fortschritt innerhalb der laufenden Stufe, 0..1.
export function stageProgress(total: number, targets: readonly number[]): number {
  const s = stageOf(total, targets);
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
export function accept(state: EnergyState, msg: Msg, knownIds: ReadonlySet<string>, participants: number, now: number): number {
  if (typeof msg.pid !== "string" || !knownIds.has(msg.pid)) return 0;
  const raw = typeof msg.n === "number" ? msg.n : Number.NaN;
  let n = batchSize(raw);
  if (n === 0) return 0;

  const targets = stageTargets(participants);
  const stage = stageOf(state.total, targets);
  if (stage >= targets.length) return 0; // fertig: nichts mehr zählen

  const person = state.people.get(msg.pid) ?? { last: -Infinity, stage, inStage: 0 };
  if (now - person.last < MIN_GAP_MS) return 0;
  if (person.stage !== stage) { person.stage = stage; person.inStage = 0; }

  // Anteil pro Person und Stufe begrenzen – außer bei ganz kleinen Runden (Probe allein oder zu zweit).
  if (participants > 2) {
    const len = targets[stage] - (stage === 0 ? 0 : targets[stage - 1]);
    const room = Math.max(0, Math.floor(len * SHARE_CAP) - person.inStage);
    n = Math.min(n, room);
  }
  person.last = now;
  state.people.set(msg.pid, person);
  if (n <= 0) return 0;
  person.inStage += n;
  state.total += n;
  return n;
}
