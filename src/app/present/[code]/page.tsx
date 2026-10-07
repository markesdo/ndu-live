import PresentClient from "./PresentClient";
import PreviewClient from "./PreviewClient";

// ?vorschau=lobby|poll|poll2|text|themen|tokens|finale (&n=4 für eine kleine Gruppe) zeigt einen Schritt mit erfundenen Daten – nur in der Entwicklung
// (Allowlist development/test; alles andere, auch ein fehlender Wert, bekommt die echte Leinwand).
const PREVIEW_ALLOWED = process.env.NODE_ENV === "development" || process.env.NODE_ENV === "test";

export default async function PresentPage({ params, searchParams }: PageProps<"/present/[code]">) {
  const { code } = await params;
  const { vorschau, n } = await searchParams;
  // n = Zahl der Teilnehmenden (1–22), z. B. ?vorschau=poll&n=4 für die kleine Gruppe.
  const people = typeof n === "string" && /^\d+$/.test(n) ? Math.min(22, Math.max(1, Number(n))) : undefined;
  if (PREVIEW_ALLOWED && typeof vorschau === "string") return <PreviewClient code={code} vorschau={vorschau} n={people} />;
  return <PresentClient code={code} />;
}
