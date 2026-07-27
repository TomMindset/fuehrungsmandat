import { readFile } from "node:fs/promises";
import path from "node:path";
import { argument } from "./lib/args.mjs";

async function main() {
  const packagePath = path.resolve(argument("--package", { required: true }));
  const pkg = JSON.parse(await readFile(packagePath, "utf8"));
  const timeoutSeconds = Number(argument("--timeout-seconds") || 600);
  if (!Number.isFinite(timeoutSeconds) || timeoutSeconds < 30 || timeoutSeconds > 1800) {
    throw new Error("Live-Wartezeit muss zwischen 30 und 1.800 Sekunden liegen.");
  }

  const deadline = Date.now() + timeoutSeconds * 1000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(pkg.canonicalUrl, {
        headers: { "Cache-Control": "no-cache" },
        redirect: "follow"
      });
      if (response.ok) {
        const html = await response.text();
        if (
          html.includes(pkg.title) &&
          html.includes(pkg.imagePath) &&
          html.includes('property="og:type" content="article"')
        ) {
          console.log(`Artikel und freigegebene Social-Karte sind live: ${pkg.canonicalUrl}`);
          return;
        }
      }
    } catch {
      // Deployment kann während des Pollings kurzzeitig nicht erreichbar sein.
    }
    await new Promise((resolve) => setTimeout(resolve, 10000));
  }
  throw new Error("Artikel war innerhalb des Zeitfensters nicht eindeutig live.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Unbekannter Fehler.");
  process.exitCode = 1;
});
