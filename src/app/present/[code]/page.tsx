import PresentClient from "./PresentClient";
import PreviewClient from "./PreviewClient";

// ?vorschau=lobby|poll|poll2|text|finale zeigt einen Schritt mit erfundenen Daten – nur in der Entwicklung
// (Allowlist development/test; alles andere, auch ein fehlender Wert, bekommt die echte Leinwand).
const PREVIEW_ALLOWED = process.env.NODE_ENV === "development" || process.env.NODE_ENV === "test";

export default async function PresentPage({ params, searchParams }: PageProps<"/present/[code]">) {
  const { code } = await params;
  const { vorschau } = await searchParams;
  if (PREVIEW_ALLOWED && typeof vorschau === "string") return <PreviewClient code={code} vorschau={vorschau} />;
  return <PresentClient code={code} />;
}
