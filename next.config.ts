import { networkInterfaces } from "node:os";
import type { NextConfig } from "next";

// Lokal testen mit Handys im selben WLAN: Next blockiert Dev-Ressourcen, wenn die Seite über die
// Netzwerk-IP statt localhost geöffnet wird – die Join-Seite bliebe bei „Verbinde …“ hängen.
// Die IPv4-Adressen des Laptops werden beim Start gelesen, damit es auch im Hörsaal-WLAN klappt.
const lanAddresses = Object.values(networkInterfaces())
  .flat()
  .filter((i) => i && i.family === "IPv4" && !i.internal)
  .map((i) => i!.address);

const nextConfig: NextConfig = {
  allowedDevOrigins: lanAddresses,
};

export default nextConfig;
