import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const notesDir = path.join(root, "src", "content", "notes");
const forbidden = [
  "Potenzial entfalten",
  "Herzensweg",
  "Purpose Journey",
  "Transformation leben",
  "neue Horizonte entdecken",
  "ganzheitliche Begleitung",
  "Mindset-Reise",
  "innere Reise",
  "Jetzt durchstarten",
  "Kostenloses Erstgespräch sichern"
];

const files = (await readdir(notesDir)).filter((file) => file.endsWith(".md"));
const failures = [];

function frontmatterValue(content, key) {
  const match = content.match(new RegExp(`\\n${key}:\\s*(.+)`));
  return match?.[1]?.trim().replace(/^["']|["']$/g, "");
}

for (const file of files) {
  const fullPath = path.join(notesDir, file);
  const content = await readFile(fullPath, "utf8");
  const h1Count = (content.match(/^#\s+/gm) || []).length;
  const h2Count = (content.match(/^##\s+/gm) || []).length;
  const isDraft = /\ndraft:\s*true\b/.test(content);

  if (!content.startsWith("---\n")) failures.push(`${file}: Frontmatter fehlt`);
  if (!frontmatterValue(content, "title")) failures.push(`${file}: title fehlt`);
  if (!frontmatterValue(content, "description")) failures.push(`${file}: description fehlt`);
  if (!frontmatterValue(content, "date")) failures.push(`${file}: date fehlt`);
  if (!frontmatterValue(content, "author")) failures.push(`${file}: author fehlt`);
  if (!frontmatterValue(content, "cluster")) failures.push(`${file}: cluster fehlt`);
  if (!frontmatterValue(content, "riskLevel")) failures.push(`${file}: riskLevel fehlt`);
  if (h1Count > 1) failures.push(`${file}: mehr als eine H1`);

  for (const term of forbidden) {
    if (content.toLowerCase().includes(term.toLowerCase())) {
      failures.push(`${file}: verbotener Begriff "${term}"`);
    }
  }

  const forbiddenClaims = [
    "Wir entwickeln Ihre KI-Strategie",
    "Wir optimieren Ihre Organisation",
    "Wir bauen Ihre Data Governance auf",
    "Wir liefern eine Transformationsroadmap"
  ];

  for (const claim of forbiddenClaims) {
    if (content.includes(claim)) failures.push(`${file}: unzulässiges Beratungsversprechen "${claim}"`);
  }

  if (content.includes("Dieser Entwurf ist automatisch aus dem Redaktionsplan erzeugt")) {
    failures.push(`${file}: enthält noch Skeleton-Platzhalter`);
  }

  if (!isDraft) {
    if (h1Count !== 0) failures.push(`${file}: veröffentlichte Artikel nutzen die Layout-H1, keine Markdown-H1`);
    if (h2Count < 3) failures.push(`${file}: veröffentlichter Artikel braucht mindestens drei H2-Abschnitte`);
    if (!content.includes("Mandat & Wirkung")) failures.push(`${file}: Brücke zu Mandat & Wirkung fehlt`);
  }

  if (isDraft && h1Count !== 1) {
    failures.push(`${file}: Draft braucht genau eine Markdown-H1`);
  }
}

if (failures.length > 0) {
  console.error(failures.join("\n"));
  process.exit(1);
}

console.log(`${files.length} Content-Dateien geprüft.`);
