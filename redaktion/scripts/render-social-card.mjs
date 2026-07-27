import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { fileURLToPath } from "node:url";
import { argument } from "./lib/args.mjs";

function escapeXml(value) {
  return String(value)
    .replace(/&/gu, "&amp;")
    .replace(/</gu, "&lt;")
    .replace(/>/gu, "&gt;")
    .replace(/"/gu, "&quot;")
    .replace(/'/gu, "&apos;");
}

export function wrapTitle(title, maxCharacters = 22, maxLines = 6) {
  const words = String(title).trim().split(/\s+/u);
  const lines = [];
  let current = "";

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length <= maxCharacters || current.length === 0) {
      current = candidate;
      continue;
    }
    lines.push(current);
    current = word;
  }
  if (current) lines.push(current);

  if (lines.length <= maxLines) return lines;
  const result = lines.slice(0, maxLines);
  result[maxLines - 1] = `${result[maxLines - 1].replace(/[.,;:!?-]+$/u, "")} …`;
  return result;
}

export function cardSvg(pkg, width = 1080, height = 1350) {
  const title = pkg?.title;
  const cluster = pkg?.cluster;
  if (!title || !cluster) throw new Error("Titel oder Cluster für die Social-Karte fehlt.");

  const lines = wrapTitle(title);
  const lineHeight = lines.length > 4 ? 86 : 94;
  const fontSize = lines.length > 4 ? 70 : 78;
  const titleStart = 400 - Math.max(0, lines.length - 4) * 18;
  const text = lines
    .map(
      (line, index) =>
        `<tspan x="92" y="${titleStart + index * lineHeight}">${escapeXml(line)}</tspan>`
    )
    .join("");

  return `
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect width="${width}" height="${height}" fill="#F4F0E8"/>
  <path d="M0 0 H1080 V210 L815 0 Z" fill="#0E2D33"/>
  <path d="M0 1185 L250 1225 H1080 V1350 H0 Z" fill="#172027"/>
  <path d="M620 0 L1080 460 M720 0 L1080 360 M0 945 L405 1350 M0 1045 L305 1350" fill="none" stroke="#B57B57" stroke-width="3" opacity=".72"/>
  <path d="M740 135 L994 135 M740 164 L944 164" fill="none" stroke="#F4F0E8" stroke-width="2" opacity=".7"/>
  <rect x="92" y="230" width="112" height="8" fill="#B57B57"/>
  <text x="92" y="298" fill="#6A5B50" font-family="Arial, Helvetica, sans-serif" font-size="27" font-weight="700" letter-spacing="4">${escapeXml(cluster.toUpperCase())}</text>
  <text fill="#172027" font-family="Georgia, 'Times New Roman', serif" font-size="${fontSize}" font-weight="700">${text}</text>
  <line x1="92" y1="1032" x2="988" y2="1032" stroke="#172027" stroke-width="2" opacity=".18"/>
  <text x="92" y="1100" fill="#172027" font-family="Arial, Helvetica, sans-serif" font-size="34" font-weight="700" letter-spacing="1.5">FÜHRUNGSMANDAT</text>
  <text x="92" y="1152" fill="#5C6970" font-family="Arial, Helvetica, sans-serif" font-size="25">Notizen zu Rolle, Verantwortung und Wirkung</text>
  <text x="92" y="1302" fill="#F4F0E8" font-family="Arial, Helvetica, sans-serif" font-size="25" font-weight="700" letter-spacing="2">FUEHRUNGSMANDAT.DE</text>
</svg>`.trim();
}

export async function renderSocialCard(pkg, outputPath, options = {}) {
  const width = Number(options.width || 1080);
  const height = Number(options.height || 1350);
  const quality = Number(options.quality || 92);
  if (width !== 1080 || height !== 1350) {
    throw new Error("Die freigegebene Kartenform ist auf 1080 × 1350 Pixel festgelegt.");
  }

  await mkdir(path.dirname(outputPath), { recursive: true });
  const svg = cardSvg(pkg, width, height);
  await sharp(Buffer.from(svg, "utf8"))
    .flatten({ background: "#F4F0E8" })
    .jpeg({ quality, chromaSubsampling: "4:4:4" })
    .toFile(outputPath);

  const metadata = await sharp(outputPath).metadata();
  if (
    metadata.format !== "jpeg" ||
    metadata.width !== width ||
    metadata.height !== height
  ) {
    throw new Error("Die erzeugte Social-Karte hat ein unerwartetes Format.");
  }
  return metadata;
}

async function main() {
  const packagePath = argument("--package", { required: true });
  const outputPath = argument("--output", { required: true });
  const pkg = JSON.parse(await readFile(path.resolve(packagePath), "utf8"));
  await renderSocialCard(pkg, path.resolve(outputPath));
  console.log(`Social-Karte erzeugt: ${path.resolve(outputPath)}`);
}

const isEntryPoint = process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isEntryPoint) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : "Unbekannter Fehler.");
    process.exitCode = 1;
  });
}
