import { NextResponse } from "next/server";
import { SPOTLIGHT_SCHEMA, parseSpotlight } from "@/lib/ai-shared";
import { aiError, askJson, gate } from "@/lib/ai-server";

// Spotlight: Aus einer Idee wird ein Ein-Satz-Pitch mit drei Akzeptanzkriterien.
// Gesendet wird nur der Ideentext (Namen entfernt die Leinwand vorher). Zeitlimit 7 s.
const SYSTEM = `Du hilfst in einem Uni-Kurs, in dem Studierende ohne Programmiererfahrung mit einem KI-Coding-Agenten Web-Apps bauen.
Du bekommst eine App-Idee in einem Satz. Formuliere daraus:
- pitch: einen deutschen Satz, was die App für wen tut (höchstens 120 Zeichen).
- kriterien: genau drei Akzeptanzkriterien im Format „Gegeben …, wenn …, dann …“, je höchstens 110 Zeichen, konkret und im Browser prüfbar, für eine erste kleine Version; eines davon ist ein Negativfall (was passiert, wenn etwas fehlt oder nicht erlaubt ist).
Sprich die Studierenden nicht an, erfinde keine Namen.`;

export async function POST(req: Request) {
  const g = await gate(req, "spotlight", 20);
  if (!g.ok) return g.res;
  const text = typeof g.body.text === "string" ? g.body.text.trim().slice(0, 200) : "";
  if (!text) return NextResponse.json({ error: "Kein Text" }, { status: 400 });
  try {
    const raw = await askJson({ system: SYSTEM, user: text, schema: SPOTLIGHT_SCHEMA, timeoutMs: 15000, maxTokens: 2000 });
    const result = parseSpotlight(raw);
    if (!result) return NextResponse.json({ error: "KI-Antwort unbrauchbar" }, { status: 502 });
    return NextResponse.json(result);
  } catch (err) {
    return aiError(err);
  }
}
