import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const configPath = path.join(root, "web-research-config.json");
const rulesPath = path.join(root, "content-rules", "fuehrungsmandat-style.md");
const systemPromptPath = path.join(root, "prompts", "web-topic-research-system.md");
const userPromptPath = path.join(root, "prompts", "web-topic-research-user.md");
const outputDir = path.join(root, "research");
const rawResponsePath = path.join(outputDir, "openai-web-search-response.json");
const ideasPath = path.join(root, "content-ideas-web.json");

const args = new Set(process.argv.slice(2));
const dryRun = args.has("--dry-run");

function renderTemplate(template, values) {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => values[key] ?? "");
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
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
}

function renderQueries(queries) {
  return queries
    .map((query, index) =>
      [
        `Suchauftrag ${index + 1}: ${query.query}`,
        `Cluster: ${query.cluster}`,
        `Redaktionelle Intention: ${query.intent}`
      ].join("\n")
    )
    .join("\n\n");
}

function assertIdeasJson(value) {
  const failures = [];

  if (!value || typeof value !== "object") failures.push("JSON ist kein Objekt");
  if (!Array.isArray(value?.ideas)) failures.push("ideas[] fehlt");
  if ((value?.ideas ?? []).length < 3) failures.push("zu wenige Themenideen");

  for (const [index, idea] of (value?.ideas ?? []).entries()) {
    if (!idea.title) failures.push(`ideas[${index}].title fehlt`);
    if (!idea.cluster) failures.push(`ideas[${index}].cluster fehlt`);
    if (!idea.mandateQuestion) failures.push(`ideas[${index}].mandateQuestion fehlt`);
    if (!Array.isArray(idea.evidenceBasis) || idea.evidenceBasis.length === 0) {
      failures.push(`ideas[${index}].evidenceBasis fehlt`);
    }
    if (!idea.evidenceBasis?.some((source) => source.url)) {
      failures.push(`ideas[${index}].evidenceBasis braucht mindestens eine URL`);
    }
    if (idea.sourcePolicy !== "approved-external") {
      failures.push(`ideas[${index}].sourcePolicy muss approved-external sein`);
    }
  }

  if (failures.length > 0) {
    throw new Error(`Web-Themenrecherche nicht gültig:\n${failures.join("\n")}`);
  }
}

const config = JSON.parse(await readFile(configPath, "utf8"));
const generatedAt = new Date().toISOString();
const model = process.env.OPENAI_WEB_SEARCH_MODEL || process.env.OPENAI_MODEL || "gpt-4.1";

if (dryRun) {
  console.log(`Dry run Web-Themenrecherche: ${config.queries.length} Suchaufträge`);
  console.log(`Model: ${model}`);
  for (const query of config.queries) {
    console.log(`- ${query.id}: ${query.query}`);
  }
  process.exit(0);
}

if (!process.env.OPENAI_API_KEY) {
  throw new Error("OPENAI_API_KEY fehlt. Für Web-Recherche bitte als GitHub Secret oder lokale Umgebungsvariable setzen.");
}

const [styleRules, systemPrompt, userPromptTemplate] = await Promise.all([
  readFile(rulesPath, "utf8"),
  readFile(systemPromptPath, "utf8"),
  readFile(userPromptPath, "utf8")
]);

const userPrompt = renderTemplate(userPromptTemplate, {
  styleRules,
  generatedAt,
  queries: renderQueries(config.queries)
});

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
    tools: [{ type: "web_search" }],
    tool_choice: "required",
    include: ["web_search_call.action.sources"],
    temperature: 0.25,
    max_output_tokens: 7000
  })
});

if (!response.ok) {
  const body = await response.text();
  throw new Error(`OpenAI API Fehler ${response.status}: ${body}`);
}

const responseJson = await response.json();
const ideas = JSON.parse(stripCodeFence(extractOutputText(responseJson)));

assertIdeasJson(ideas);

await mkdir(outputDir, { recursive: true });
await writeFile(rawResponsePath, `${JSON.stringify(responseJson, null, 2)}\n`, "utf8");
await writeFile(ideasPath, `${JSON.stringify(ideas, null, 2)}\n`, "utf8");

console.log(`Web-Themenideen erstellt: ${ideasPath}`);
console.log(`Rohantwort gespeichert: ${rawResponsePath}`);
