// Ringfarbe pro Person, aus dem Namen berechnet: Zwei 🪐 bleiben unterscheidbar, ohne dass jemand
// eine Farbe wählen muss. Handy und Leinwand rechnen dasselbe – nichts davon steht in der Datenbank.
// Zwölf Töne aus der Familie der Kursfarben (Koralle, Bernstein, Blau, Grün und Nachbarn).
export const RING_COLORS = [
  "#ff6a4d", "#ff8f6b", "#ffb03b", "#ffd166",
  "#6b8cff", "#8fa8ff", "#5ec2ff", "#4ade80",
  "#7ee0a3", "#2dd4bf", "#f472b6", "#c4a1ff",
];

// FNV-1a: klein, schnell, stabil über Browser hinweg.
function hash(s: string) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export function ringColor(name: string) {
  return RING_COLORS[hash(name.trim().toLowerCase()) % RING_COLORS.length];
}
