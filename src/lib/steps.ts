// Die Schritte der Live-Session. Reihenfolge = active_step in der Tabelle sessions.
// Zwischenzustände wie Pointe, Spotlight oder Kurs-Hinweis leben nur auf der Leinwand –
// die Handys sehen sie nie.
export type Step =
  | { kind: "lobby"; title: string }
  | { kind: "poll"; title: string; options: string[]; punchline?: string }
  | { kind: "text"; title: string; placeholder: string; after: string }
  | { kind: "tokens"; title: string; hint: string }
  | { kind: "finale"; title: string };

export const STEPS: Step[] = [
  { kind: "lobby", title: "Scannen & dabei sein" },
  {
    kind: "poll",
    title: "Wie viel hast du schon programmiert?",
    options: ["Noch nie", "Ein bisschen HTML/Excel-Formeln", "Mal einen Kurs gemacht", "Ich kann's eigentlich"],
  },
  {
    kind: "poll",
    title: "Wovor hast du am meisten Respekt?",
    options: ["Das Terminal", "Fehlermeldungen", "Dass ich nichts verstehe", "Gar nichts – los geht's"],
    punchline: "Alle drei kommen heute vor. Alle drei sind am Ende von Tag 1 kleiner.",
  },
  {
    kind: "text",
    title: "Was würdest du bauen, wenn du es könntest?",
    placeholder: "Eine App, die …",
    after: "Gespeichert. Am Tag 2 holst du dir deine Idee hier wieder ab.",
  },
  // Gemeinsames Mini-Spiel vor dem Finale: jeder Tipp ist ein Token, der Raum schreibt den Prompt bis „Deployed“.
  { kind: "tokens", title: "Jetzt baut der Raum.", hint: "Tippt auf euren Handys – jeder Tipp ist ein Token." },
  { kind: "finale", title: "Diese App: 180 Minuten, keine Zeile Code." },
];

// Zahlen für die Enthüllung im Finale. Vor dem Kurs aktualisieren:
//   Zeilen:  find src -name '*.ts' -o -name '*.tsx' -o -name '*.css' | xargs cat | wc -l
//   Commits: git rev-list --count HEAD
// (Nicht beim Build berechnen: Vercel klont nur flach, die Commit-Zahl wäre falsch.)
export const STACK = { minuten: 180, zeilen: 3764, commits: 76 }; // Stand 7.10.2026; Commits inkl. dieses PRs und seines Merge-Commits

// Kurs-Website für den Abschluss: NEXT_PUBLIC_COURSE_URL (auf Vercel setzen). Ohne Variable nur lokal
// ein Ersatz – derselbe Rechner, Port 4321. Online ohne Variable gibt es keinen Link (null).
export function courseUrl(hostname: string): string | null {
  if (process.env.NEXT_PUBLIC_COURSE_URL) return process.env.NEXT_PUBLIC_COURSE_URL;
  const local = hostname === "localhost" || hostname === "127.0.0.1" || /^\d{1,3}(\.\d{1,3}){3}$/.test(hostname);
  return local ? `http://${hostname}:4321/tag-1` : null;
}

// Für die Leinwand: dieselbe Website, aber die öffentliche Startseite /start im Beamer-Modus (Auftakt-Animation,
// dann „Weiter“ → Login → Tag 1) – so geht es nach dem Finale nahtlos auf der Kurs-Website weiter.
export function projectorCourseUrl(url: string): string {
  try {
    const u = new URL(url);
    return `${u.origin}/start?beamer`;
  } catch {
    return url;
  }
}

export const EMOJIS = ["🚀", "🔥", "💡", "🎉", "🤯", "❤️", "👏", "🤖"];
export const EMOJI_NAMES: Record<string, string> = {
  "🚀": "Rakete", "🔥": "Feuer", "💡": "Glühbirne", "🎉": "Konfetti",
  "🤯": "Kopf explodiert", "❤️": "Herz", "👏": "Applaus", "🤖": "Roboter",
};

// „Such dir deinen Vibe“: Tiere und Dinge mit Haltung. Alte Avatare aus früheren Runden werden weiter angezeigt.
export const AVATARS = ["🦊", "🐙", "🦉", "🦖", "🚀", "🔮", "🌵", "🍕", "🎧", "🛹", "🧃", "🪐", "⚡", "🧠", "🌶️", "🎲"];
export const AVATAR_NAMES: Record<string, string> = {
  "🦊": "Fuchs", "🐙": "Krake", "🦉": "Eule", "🦖": "Dinosaurier", "🚀": "Rakete", "🔮": "Kristallkugel",
  "🌵": "Kaktus", "🍕": "Pizza", "🎧": "Kopfhörer", "🛹": "Skateboard", "🧃": "Saftpackerl", "🪐": "Planet",
  "⚡": "Blitz", "🧠": "Gehirn", "🌶️": "Chili", "🎲": "Würfel",
};
