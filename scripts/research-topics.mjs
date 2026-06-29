import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const configPath = path.join(root, "research-config.json");
const rulesPath = path.join(root, "content-rules", "fuehrungsmandat-style.md");
const systemPromptPath = path.join(root, "prompts", "topic-research-system.md");
const userPromptPath = path.join(root, "prompts", "topic-research-user.md");
const outputDir = path.join(root, "research");
const sourcesPath = path.join(outputDir, "openalex-sources.json");
const ideasPath = path.join(root, "content-ideas.json");

const args = new Set(process.argv.slice(2));
const dryRun = args.has("--dry-run");
const collectOnly = args.has("--collect-only");

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

function invertAbstractIndex(index) {
  if (!index) return "";

  const words = [];
  for (const [word, positions] of Object.entries(index)) {
    for (const position of positions) {
      words[position] = word;
    }
  }

  return words.filter(Boolean).join(" ");
}

function compactAuthors(authorships = []) {
  return authorships
    .slice(0, 4)
    .map((entry) => entry.author?.display_name)
    .filter(Boolean);
}

function compactTopics(topics = []) {
  return topics
    .slice(0, 5)
    .map((topic) => topic.display_name)
    .filter(Boolean);
}

function normalizeWork(work, queryConfig) {
  const url = work.doi ? `https://doi.org/${work.doi.replace(/^https?:\/\/doi\.org\//i, "")}` : work.id;

  return {
    openAlexId: work.id,
    title: work.title,
    year: work.publication_year,
    doi: work.doi ?? null,
    url,
    type: work.type,
    citedByCount: work.cited_by_count ?? 0,
    openAccess: work.open_access?.is_oa ?? null,
    source: work.primary_location?.source?.display_name ?? null,
    authors: compactAuthors(work.authorships),
    topics: compactTopics(work.topics),
    abstract: invertAbstractIndex(work.abstract_inverted_index).slice(0, 1200),
    matchedQuery: queryConfig.query,
    queryId: queryConfig.id,
    clusterHint: queryConfig.cluster,
    intentHint: queryConfig.intent
  };
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
    if (idea.sourcePolicy !== "approved-external") {
      failures.push(`ideas[${index}].sourcePolicy muss approved-external sein`);
    }
  }

  if (failures.length > 0) {
    throw new Error(`Themenrecherche nicht gültig:\n${failures.join("\n")}`);
  }
}

async function fetchOpenAlexWorks(queryConfig, config, fromYear) {
  const url = new URL("https://api.openalex.org/works");
  const filter = [
    `publication_year:${fromYear}-`,
    "type:article|book|book-chapter",
    `cited_by_count:>${config.minCitationCount ?? 0}`
  ].join(",");

  url.searchParams.set("search", queryConfig.query);
  url.searchParams.set("filter", filter);
  url.searchParams.set("per_page", String(config.perQuery ?? 8));
  url.searchParams.set(
    "select",
    [
      "id",
      "title",
      "publication_year",
      "doi",
      "type",
      "cited_by_count",
      "open_access",
      "primary_location",
      "authorships",
      "topics",
      "abstract_inverted_index"
    ].join(",")
  );

  if (process.env.OPENALEX_API_KEY) {
    url.searchParams.set("api_key", process.env.OPENALEX_API_KEY);
  }

  const response = await fetch(url, {
    headers: {
      "User-Agent": "Fuehrungsmandat research bot (mailto:anfrage@mandat-wirkung.de)"
    }
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`OpenAlex API Fehler ${response.status}: ${body}`);
  }

  const data = await response.json();
  return (data.results ?? []).map((work) => normalizeWork(work, queryConfig));
}

function dedupeWorks(works) {
  const byId = new Map();

  for (const work of works) {
    const key = work.doi ?? work.openAlexId;
    const existing = byId.get(key);
    if (!existing) {
      byId.set(key, work);
    }
  }

  return [...byId.values()];
}

function renderSourcesForPrompt(works) {
  return works
    .slice(0, 35)
    .map((work, index) => {
      const authors = work.authors.length > 0 ? work.authors.join(", ") : "Autorenschaft nicht im Datensatz";
      const abstract = work.abstract ? `\nAbstract-Auszug: ${work.abstract}` : "";

      return [
        `Quelle ${index + 1}: ${work.title}`,
        `Jahr: ${work.year ?? "unbekannt"}`,
        `Autorinnen/Autoren: ${authors}`,
        `Publikation: ${work.source ?? "unbekannt"}`,
        `DOI: ${work.doi ?? "null"}`,
        `URL: ${work.url}`,
        `Zitationen laut OpenAlex: ${work.citedByCount}`,
        `Cluster-Hinweis: ${work.clusterHint}`,
        `Recherchefrage: ${work.matchedQuery}${abstract}`
      ].join("\n");
    })
    .join("\n\n");
}

const config = JSON.parse(await readFile(configPath, "utf8"));
const now = new Date();
const generatedAt = now.toISOString();
const fromYear = now.getUTCFullYear() - Number(config.yearsBack ?? 6);
const researchWindow = `${fromYear}-${now.getUTCFullYear()}`;

if (dryRun) {
  console.log(`Dry run Themenrecherche: ${config.queries.length} OpenAlex-Abfragen`);
  console.log(`Zeitraum: ${researchWindow}`);
  for (const query of config.queries) {
    console.log(`- ${query.id}: ${query.query}`);
  }
  process.exit(0);
}

const batches = [];
for (const queryConfig of config.queries) {
  batches.push(await fetchOpenAlexWorks(queryConfig, config, fromYear));
}

const works = dedupeWorks(batches.flat());

await mkdir(outputDir, { recursive: true });
await writeFile(
  sourcesPath,
  `${JSON.stringify(
    {
      generatedAt,
      source: "OpenAlex",
      researchWindow,
      queryCount: config.queries.length,
      works
    },
    null,
    2
  )}\n`,
  "utf8"
);

if (collectOnly) {
  console.log(`OpenAlex-Quellen gesammelt: ${works.length}`);
  console.log(`Datei: ${sourcesPath}`);
  process.exit(0);
}

if (!process.env.OPENAI_API_KEY) {
  throw new Error("OPENAI_API_KEY fehlt. Für Themenverdichtung setzen oder --collect-only verwenden.");
}

const model = process.env.OPENAI_MODEL || "gpt-4.1";
const [styleRules, systemPrompt, userPromptTemplate] = await Promise.all([
  readFile(rulesPath, "utf8"),
  readFile(systemPromptPath, "utf8"),
  readFile(userPromptPath, "utf8")
]);

const userPrompt = renderTemplate(userPromptTemplate, {
  styleRules,
  researchWindow,
  generatedAt,
  sources: renderSourcesForPrompt(works)
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
    temperature: 0.35,
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

await writeFile(ideasPath, `${JSON.stringify(ideas, null, 2)}\n`, "utf8");
console.log(`Themenideen erstellt: ${ideasPath}`);
console.log(`OpenAlex-Quellen: ${sourcesPath}`);
