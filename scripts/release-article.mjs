import { readFile, writeFile, readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const notesDir = path.join(root, "src", "content", "notes");
const args = process.argv.slice(2);
const slugArg = args.find((arg) => arg.startsWith("--slug="));
const confirmArg = args.find((arg) => arg.startsWith("--confirm="));
const dryRun = args.includes("--dry-run");

function frontmatterValue(content, key) {
  const match = content.match(new RegExp(`\\n${key}:\\s*(.+)`));
  return match?.[1]?.trim().replace(/^["']|["']$/g, "");
}

function replaceFrontmatterValue(content, key, value) {
  const pattern = new RegExp(`(\\n${key}:\\s*).+`);
  if (!pattern.test(content)) {
    throw new Error(`${key} fehlt im Frontmatter.`);
  }

  return content.replace(pattern, `$1${value}`);
}

function removeDraftH1(content, title) {
  const lines = content.split("\n");
  let frontmatterEnd = -1;
  let frontmatterDelimiters = 0;

  for (let index = 0; index < lines.length; index += 1) {
    if (lines[index] === "---") {
      frontmatterDelimiters += 1;
      if (frontmatterDelimiters === 2) {
        frontmatterEnd = index;
        break;
      }
    }
  }

  if (frontmatterEnd === -1) throw new Error("Frontmatter-Ende nicht gefunden.");

  const h1Indexes = [];
  for (let index = frontmatterEnd + 1; index < lines.length; index += 1) {
    if (/^#\s+/.test(lines[index])) h1Indexes.push(index);
  }

  if (h1Indexes.length === 0) return content;
  if (h1Indexes.length > 1) throw new Error("Mehr als eine Markdown-H1 gefunden.");

  const h1 = lines[h1Indexes[0]].replace(/^#\s+/, "").trim();
  if (title && h1 !== title) {
    throw new Error(`Markdown-H1 "${h1}" entspricht nicht dem Frontmatter-Title "${title}".`);
  }

  lines.splice(h1Indexes[0], 1);
  return lines.join("\n").replace(/\n{3,}/g, "\n\n");
}

function assertReleaseReady(content, file) {
  const failures = [];
  const h1Count = (content.match(/^#\s+/gm) || []).length;
  const h2Count = (content.match(/^##\s+/gm) || []).length;
  const riskLevel = frontmatterValue(content, "riskLevel");

  if (!content.startsWith("---\n")) failures.push("Frontmatter fehlt");
  if (!frontmatterValue(content, "title")) failures.push("title fehlt");
  if (!frontmatterValue(content, "description")) failures.push("description fehlt");
  if (!frontmatterValue(content, "date")) failures.push("date fehlt");
  if (!frontmatterValue(content, "author")) failures.push("author fehlt");
  if (!frontmatterValue(content, "cluster")) failures.push("cluster fehlt");
  if (!riskLevel) failures.push("riskLevel fehlt");
  if (riskLevel === "high") failures.push("riskLevel high darf nicht direkt veröffentlicht werden");
  if (!/\ndraft:\s*false\b/.test(content)) failures.push("draft: false wurde nicht gesetzt");
  if (h1Count !== 0) failures.push("veröffentlichte Artikel dürfen keine Markdown-H1 enthalten");
  if (h2Count < 3) failures.push("veröffentlichter Artikel braucht mindestens drei H2-Abschnitte");
  if (!content.includes("Mandat & Wirkung")) failures.push("Brücke zu Mandat & Wirkung fehlt");

  if (failures.length > 0) {
    throw new Error(`${file} ist nicht veröffentlichungsreif:\n${failures.join("\n")}`);
  }
}

if (!slugArg) {
  throw new Error("Bitte --slug=<artikel-slug> angeben.");
}

const slug = slugArg.slice("--slug=".length);
const expectedConfirm = `Freigegeben für Veröffentlichung: ${slug}`;
const confirm = confirmArg?.slice("--confirm=".length);

if (confirm !== expectedConfirm) {
  throw new Error(`Exakte Freigabe fehlt. Erwartet: --confirm="${expectedConfirm}"`);
}

const file = `${slug}.md`;
const articlePath = path.join(notesDir, file);

if (!existsSync(articlePath)) {
  const available = (await readdir(notesDir)).filter((entry) => entry.endsWith(".md")).join(", ");
  throw new Error(`Artikel nicht gefunden: ${file}\nVerfügbare Artikel: ${available}`);
}

const original = await readFile(articlePath, "utf8");

if (/\ndraft:\s*false\b/.test(original)) {
  console.log(`${file} ist bereits veröffentlicht.`);
  process.exit(0);
}

if (!/\ndraft:\s*true\b/.test(original)) {
  throw new Error(`${file}: draft: true fehlt. Veröffentlichung wird abgebrochen.`);
}

const title = frontmatterValue(original, "title");
let updated = replaceFrontmatterValue(original, "draft", "false");
updated = removeDraftH1(updated, title);
assertReleaseReady(updated, file);

if (dryRun) {
  console.log(`Dry run: ${file} würde veröffentlicht.`);
  process.exit(0);
}

await writeFile(articlePath, `${updated.trim()}\n`, "utf8");
console.log(`Artikel freigegeben: ${articlePath}`);
