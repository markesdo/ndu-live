// Pointe zur Frage „Wovor hast du am meisten Respekt?“ – passend zu dem, was wirklich gewählt wurde.
// counts: Stimmen je Option, in der Reihenfolge der Optionen: die ersten drei sind die Respekt-Themen,
// die vierte ist „Gar nichts – los geht's“. Vorher stand fest „Alle drei …“, auch wenn nur eine Option gewählt war.
const THEMEN = [
  { anfang: "Das Terminal", mitte: "das Terminal", plural: false },
  { anfang: "Fehlermeldungen", mitte: "Fehlermeldungen", plural: true },
  { anfang: "Etwas kaputt machen", mitte: "etwas kaputt machen", plural: false },
];
const NACHSATZ = "Am Ende von Tag 1 ist der Respekt davor kleiner.";

export function respektPointe(counts: number[]): string {
  if (counts.every((n) => !n)) return "Das Terminal, Fehlermeldungen, etwas kaputt machen – alles kommt heute vor.";
  const gewaehlt = THEMEN.filter((_, i) => (counts[i] ?? 0) > 0);
  if (gewaehlt.length === 0) {
    return "Gut so – das Terminal, Fehlermeldungen und etwas kaputt machen kommen heute trotzdem vor.";
  }
  if (gewaehlt.length === THEMEN.length) return `Alle drei kommen heute vor. ${NACHSATZ}`;
  if (gewaehlt.length === 1) {
    const [t] = gewaehlt;
    return `${t.anfang} ${t.plural ? "kommen" : "kommt"} heute vor. ${NACHSATZ}`;
  }
  const [a, b] = gewaehlt;
  return `${a.anfang} und ${b.mitte} kommen heute vor. ${NACHSATZ}`;
}
