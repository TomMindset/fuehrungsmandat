import { readFile, writeFile, mkdir, readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const planPath = path.join(root, "content-plan.json");
const rulesPath = path.join(root, "content-rules", "fuehrungsmandat-style.md");
const notesDir = path.join(root, "src", "content", "notes");
const systemPromptPath = path.join(root, "prompts", "article-system.md");
const userPromptPath = path.join(root, "prompts", "article-user.md");

const args = new Set(process.argv.slice(2));
const dryRun = args.has("--dry-run");

function slugify(value) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function renderTemplate(template, values) {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => values[key] ?? "");
}

function renderScientificSources(item) {
  const sources = item.sources ?? item.evidenceBasis ?? [];

  if (!Array.isArray(sources) || sources.length === 0) {
    return "Keine freigegebenen externen Quellen. Keine Studienbehauptungen formulieren.";
  }

  return sources
    .map((source, index) => {
      const parts = [
        `Quelle ${index + 1}: ${source.title ?? "Ohne Titel"}`,
        `Jahr: ${source.year ?? "unbekannt"}`,
        `DOI: ${source.doi ?? "null"}`,
        `URL: ${source.url ?? source.openAlexId ?? "null"}`
      ];

      if (source.note) parts.push(`Redaktionelle Notiz: ${source.note}`);
      return parts.join("\n");
    })
    .join("\n\n");
}

function extractOutputText(responseJson) {
  if (typeof responseJson.output_text === "string") return responseJson.output_text;

  const chunks = [];
  for (const item of responseJson.output ?? []) {
    for (const content of item.content ?? []) {
      if (content.type === "output_text" && typeof content.text === "string") {
        chunks.push(content.text);
      }
    }
  }

  return chunks.join("\n").trim();
}

function stripCodeFence(value) {
  return value
    .trim()
    .replace(/^```(?:markdown|md)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
}

function assertGeneratedArticle(markdown, item) {
  const failures = [];

  if (!markdown.startsWith("---\n")) failures.push("Frontmatter fehlt");
  if (!/\ndraft:\s*true\b/.test(markdown)) failures.push("draft: true fehlt");
  if (!/\nauthor:\s*["']Thomas Hoffmann["']/.test(markdown)) failures.push("author ist nicht Thomas Hoffmann");
  if (!/\ncluster:\s*/.test(markdown)) failures.push("cluster fehlt");
  if (!/\nriskLevel:\s*/.test(markdown)) failures.push("riskLevel fehlt");
  if ((markdown.match(/^#\s+/gm) || []).length !== 1) failures.push("Artikel braucht genau eine H1");
  if ((markdown.match(/^##\s+/gm) || []).length < 3) failures.push("Artikel braucht mindestens drei H2-Abschnitte");
  if (!markdown.includes(item.cluster)) failures.push("Cluster kommt im Artikel nicht vor");
  if (!markdown.includes("Mandat & Wirkung")) failures.push("Brücke zu Mandat & Wirkung fehlt");
  if (!item.internalLinks.some((link) => markdown.includes(link))) {
    failures.push("Keiner der geplanten internen Links wurde eingebaut");
  }

  if (failures.length > 0) {
    throw new Error(`Generierter Artikel nicht gültig:\n${failures.join("\n")}`);
  }
}

async function loadReferenceArticles(limit = 3) {
  if (!existsSync(notesDir)) return "";

  const files = (await readdir(notesDir))
    .filter((file) => file.endsWith(".md"))
    .slice(0, limit);

  const excerpts = [];
  for (const file of files) {
    const content = await readFile(path.join(notesDir, file), "utf8");
    excerpts.push(`--- ${file} ---\n${content.slice(0, 2200)}`);
  }

  return excerpts.join("\n\n");
}

const plan = JSON.parse(await readFile(planPath, "utf8"));
const item = plan.find((entry) => {
  if (entry.status !== "planned") return false;
  if (entry.riskLevel === "high") return false;

  const slug = slugify(entry.topic);
  return !existsSync(path.join(notesDir, `${slug}.md`));
});

if (!item) {
  console.log("Keine geplanten Themen gefunden.");
  process.exit(0);
}

const slug = slugify(item.topic);
const outputPath = path.join(notesDir, `${slug}.md`);
const today = new Date().toISOString().slice(0, 10);
const model = process.env.OPENAI_MODEL || "gpt-4.1";

const [styleRules, systemPrompt, userPromptTemplate, referenceArticles] = await Promise.all([
  readFile(rulesPath, "utf8"),
  readFile(systemPromptPath, "utf8"),
  readFile(userPromptPath, "utf8"),
  loadReferenceArticles()
]);

const userPrompt = renderTemplate(userPromptTemplate, {
  ...item,
  targetLength: String(item.targetLength ?? 1000),
  internalLinks: (item.internalLinks ?? []).map((link) => `- ${link}`).join("\n"),
  scientificSources: renderScientificSources(item),
  styleRules,
  referenceArticles
});

if (dryRun) {
  console.log(`Dry run für: ${item.topic}`);
  console.log(`Slug: ${slug}`);
  console.log(`Model: ${model}`);
  console.log(`Prompt-Zeichen: ${systemPrompt.length + userPrompt.length}`);
  process.exit(0);
}

if (!process.env.OPENAI_API_KEY) {
  throw new Error("OPENAI_API_KEY fehlt. Bitte als GitHub Secret oder lokale Umgebungsvariable setzen.");
}

const response = await fetch("https://api.openai.com/v1/responses", {
  method: "POST",
  headers: {
    Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
    "Content-Type": "application/json"
  },
  body: JSON.stringify({
    model,
    instructions: systemPrompt,
    input: userPrompt,
    temperature: 0.45,
    max_output_tokens: 5000
  })
});

if (!response.ok) {
  const body = await response.text();
  throw new Error(`OpenAI API Fehler ${response.status}: ${body}`);
}

const responseJson = await response.json();
const markdown = stripCodeFence(extractOutputText(responseJson));

assertGeneratedArticle(markdown, item);

await mkdir(notesDir, { recursive: true });
await writeFile(outputPath, `${markdown}\n`, "utf8");

const updatedPlan = plan.map((entry) =>
  entry === item
    ? {
        ...entry,
        status: "drafted",
        draftPath: `src/content/notes/${slug}.md`,
        draftedAt: today,
        generatedWith: model
      }
    : entry
);

await writeFile(planPath, `${JSON.stringify(updatedPlan, null, 2)}\n`, "utf8");
console.log(`Artikel-Draft erstellt: ${outputPath}`);
