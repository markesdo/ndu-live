// Die Schritte der Live-Session. Reihenfolge = active_step in der Tabelle sessions.
export type Step =
  | { kind: "lobby"; title: string }
  | { kind: "poll"; title: string; options: string[] }
  | { kind: "text"; title: string; placeholder: string }
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
    title: "Was macht dir beim Thema Coding am meisten Respekt?",
    options: ["Das Terminal", "Fehlermeldungen", "Dass ich nichts verstehe", "Gar nichts – los geht's"],
  },
  {
    kind: "text",
    title: "Was würdest du bauen, wenn du es könntest?",
    placeholder: "Eine App, die …",
  },
  { kind: "finale", title: "Diese App: 60 Minuten, keine Zeile Code." },
];

export const EMOJIS = ["🚀", "🔥", "💡", "🎉", "🤯", "❤️", "👏", "🤖"];
export const AVATARS = ["🦊", "🐼", "🦉", "🐙", "🦄", "🐸", "🐧", "🦋", "🐝", "🦁", "🐨", "🦖"];
