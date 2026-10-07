// Pointe zur Frage „Wovor hast du am meisten Respekt?“ – passend zu dem, was wirklich gewählt wurde.
// Vorher stand fest „Alle drei …“, auch wenn nur eine Option gewählt war.
// Zuordnung über den Text der Option, nicht über die Position: Umsortieren in steps.ts verschiebt nichts.
export const RESPEKT = {
  terminal: "Das Terminal",
  fehler: "Fehlermeldungen",
  kaputt: "Dass ich etwas kaputt mache",
  nichts: "Gar nichts – los geht's",
};
const NACHSATZ = "Am Ende von Tag 1 ist der Respekt davor kleiner.";

// votes: Stimmen je Optionstext.
export function respektPointe(votes: Record<string, number>): string {
  const hat = (o: string) => (votes[o] ?? 0) > 0;
  const nomen = [
    hat(RESPEKT.terminal) && { text: "das Terminal", plural: false },
    hat(RESPEKT.fehler) && { text: "Fehlermeldungen", plural: true },
  ].filter((x): x is { text: string; plural: boolean } => !!x);
  const kaputt = hat(RESPEKT.kaputt);

  if (!nomen.length && !kaputt) {
    const alles = "das Terminal und Fehlermeldungen dran – und wir machen absichtlich etwas kaputt.";
    return hat(RESPEKT.nichts) ? `Gut so. Heute kommen trotzdem ${alles}` : `Heute kommen ${alles}`;
  }
  if (nomen.length === 2 && kaputt) return `Alle drei kommen heute dran. ${NACHSATZ}`;
  if (!nomen.length) return `Heute machen wir absichtlich etwas kaputt – und holen es zurück. ${NACHSATZ}`;

  const verb = nomen.length > 1 || nomen[0].plural ? "kommen" : "kommt";
  const satz = `Heute ${verb} ${nomen.map((n) => n.text).join(" und ")} dran`;
  return `${satz}${kaputt ? " – und wir machen absichtlich etwas kaputt" : ""}. ${NACHSATZ}`;
}
