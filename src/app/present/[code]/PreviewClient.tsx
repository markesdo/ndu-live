"use client";
// Nur für die Entwicklung (page.tsx lässt die Vorschau nur bei NODE_ENV development/test zu):
// zeigt jeden Schritt mit erfundenen Teilnehmenden, ohne die Datenbank anzufassen.
import { useEffect, useMemo, useState } from "react";
import { STEPS, EMOJIS, AVATARS } from "@/lib/steps";
import type { Spotlight, Thema } from "@/lib/ai-shared";
import type { Answer, Participant, Reaction } from "@/lib/useSession";
import Stage, { type StageAi } from "./Stage";

const NAMES = ["Lena", "Jonas", "Sara", "Max", "Aylin", "Paul", "Mia", "Lukas", "Hannah", "Felix", "Emma", "Tobias",
  "Sophie", "David", "Laura", "Elias", "Nina", "Moritz", "Julia", "Simon", "Clara", "Ben"];
const PEOPLE: Participant[] = NAMES.map((name, i) => ({ id: `p${i}`, name, emoji: AVATARS[(i * 5) % AVATARS.length] }));

const POLL1 = [11, 6, 3, 1];
const POLL2 = [6, 7, 5, 2];
const IDEAS = [
  "Eine App, die zeigt, wo in der Bibliothek noch Plätze frei sind",
  "Mitfahrbörse für den Weg zur Uni",
  "Lerngruppen finden nach Kurs und Uhrzeit",
  "Mensa-Menü mit Bewertungen und Wartezeit",
  "WG-Putzplan, der sich selbst gerecht verteilt",
  "Flohmarkt für Lehrbücher am Campus",
  "Erinnerung an Abgaben mit Countdown",
  "Events am Campus mit einem Klick zusagen",
  "Gemeinsam kochen: wer hat was im Kühlschrank",
];
// Für ?vorschau=themen: so viele Ideen wie in einem vollen Hörsaal, damit die Themen-Ansicht unter Last zu sehen ist.
const MORE_IDEAS = [
  "Second-Hand-Börse für Uni-Kleidung", "Schlafplatz-Tausch für Gastvorträge", "Sport-Partner für Laufen und Klettern",
  "Prüfungs-Countdown mit Lernplan", "Raumbuchung für Gruppenarbeiten", "Anonyme Fragen an Vortragende",
  "Rezepte aus Mensa-Resten", "Fahrrad-Reparatur unter Studierenden", "Sprachtandem finden",
  "Abstimmung über das nächste Semesterfest", "Spinde teilen und tauschen", "Nachhilfe gegen Kaffee",
  "Bibliotheks-Lärmampel", "Pflanzen-Gießdienst im Wohnheim", "Fundbüro am Campus", "Druckerstatus in Echtzeit",
];

// Vorschau-Namen → Schritt, nach Art statt Nummer (die Reihenfolge in STEPS darf sich ändern).
const idx = (kind: string, nth = 0) => STEPS.map((s, i) => (s.kind === kind ? i : -1)).filter((i) => i >= 0)[nth] ?? 0;
const KINDS: Record<string, number> = {
  lobby: idx("lobby"), poll: idx("poll"), poll2: idx("poll", 1), text: idx("text"), themen: idx("text"), tokens: idx("tokens"), finale: idx("finale"),
};

function answersFor(many = false): Answer[] {
  const out: Answer[] = [];
  const addPoll = (step: number, counts: number[]) => {
    let p = 0;
    counts.forEach((c, oi) => { for (let k = 0; k < c; k++, p++) out.push({ id: `a${step}-${p}`, participant_id: PEOPLE[p].id, step, value: (STEPS[step] as { options: string[] }).options[oi] }); });
  };
  addPoll(KINDS.poll, POLL1);
  addPoll(KINDS.poll2, POLL2);
  (many ? [...IDEAS, ...MORE_IDEAS] : IDEAS).forEach((value, i) => out.push({ id: `idea${i}`, participant_id: PEOPLE[(i * 2) % PEOPLE.length].id, step: KINDS.text, value }));
  return out;
}


export default function PreviewClient({ code, vorschau }: { code: string; vorschau: string }) {
  const [step, setStep] = useState(KINDS[vorschau] ?? 0);
  const all = useMemo(() => answersFor(vorschau === "themen"), [vorschau]);
  // Ankünfte und Stimmen nach und nach, damit Begrüßung und Schwarm zu sehen sind.
  const [tick, setTick] = useState(0);
  useEffect(() => { const t = setInterval(() => setTick((n) => n + 1), 700); return () => clearInterval(t); }, []);
  // Lobby: höchstens 10 wie im echten Kurs, nach und nach ankommend (Begrüßung, Schwarm).
  const people = step === 0 ? PEOPLE.slice(0, Math.min(10, 3 + tick)) : PEOPLE;
  const answers = all.filter((a) => {
    if (a.step !== step || STEPS[step].kind !== "poll") return true;
    return Number(a.id.split("-")[1]) < tick * 2;
  });
  const reactions: Reaction[] = STEPS[step].kind === "finale"
    ? Array.from({ length: Math.min(tick, 25) }, (_, i) => ({ id: `${(tick - i).toString(16).padStart(6, "0")}${i}`, emoji: EMOJIS[(tick - i) % EMOJIS.length], created_at: "" }))
    : [];

  const ai: StageAi = useMemo(() => ({
    spotlight: async (text): Promise<Spotlight> => {
      await new Promise((r) => setTimeout(r, 900));
      return {
        pitch: `Eine Web-App für Studierende: ${text.replace(/^Eine App, die /, "")}.`,
        kriterien: [
          "Gegeben ich öffne die Seite, wenn ich lade, dann sehe ich die Liste",
          "Gegeben ein Eintrag ist voll, wenn ich ihn ansehe, dann ist er grau",
          "Gegeben ich bin nicht angemeldet, wenn ich speichere, dann kommt die Anmeldung",
        ],
      };
    },
    themen: async (ideen): Promise<Thema[]> => {
      await new Promise((r) => setTimeout(r, 900));
      const ids = ideen.map((i) => i.id);
      if (ids.length > 12) {
        // Volle Last: sechs Themen, drei Ideen bleiben übrig („Neu dazu“).
        const titel = ["Lernen", "Campus-Leben", "Wohnen & Alltag", "Essen", "Mobilität", "Gemeinschaft"];
        return titel.map((t, k) => ({ titel: t, ids: ids.slice(0, 22).filter((_, i) => i % 6 === k) }));
      }
      return [
        { titel: "Lernen", ids: ids.filter((_, i) => [0, 2, 6].includes(i)) },
        { titel: "Campus-Leben", ids: ids.filter((_, i) => [3, 5, 7].includes(i)) },
        { titel: "Wohnen & Alltag", ids: ids.filter((_, i) => [1, 4, 8].includes(i)) },
      ];
    },
  }), []);

  return (
    <Stage code={code} step={step} participants={people} answers={answers} reactions={reactions} live reconnecting={false}
      go={(n) => { if (n >= 0 && n < STEPS.length) { setStep(n); setTick(0); } }} onReset={() => setTick(0)} dialogOpen={false} ai={ai} preview />
  );
}
