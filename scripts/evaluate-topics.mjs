import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const planPath = path.join(root, "content-plan.json");
const candidatesPath = path.join(root, "content-plan-candidates.json");
const ideasPath = path.join(root, "content-ideas.json");
const webIdeasPath = path.join(root, "content-ideas-web.json");
const schemaPath = path.join(root, "evaluation", "topic-scoring-schema.json");
const outputDir = path.join(root, "research", "evaluations");

const args = new Set(process.argv.slice(2));
const dryRun = args.has("--dry-run");

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

async function readJsonIfExists(filePath, fallback) {
  if (!existsSync(filePath)) return fallback;
  return JSON.parse(await readFile(filePath, "utf8"));
}

function textOf(value) {
  if (!value) return "";
  if (Array.isArray(value)) return value.map(textOf).join(" ");
  if (typeof value === "object") return Object.values(value).map(textOf).join(" ");
  return String(value);
}

function includesAny(text, words) {
  const value = text.toLowerCase();
  return words.some((word) => value.includes(word.toLowerCase()));
}

function countMatches(text, words) {
  const value = text.toLowerCase();
  return words.reduce((count, word) => count + (value.includes(word.toLowerCase()) ? 1 : 0), 0);
}

function clampScore(value) {
  return Math.max(1, Math.min(5, Number(value.toFixed(1))));
}

function normalizeTopic(value) {
  return String(value ?? "").trim().toLowerCase();
}

function topicEntryFromPlan(entry) {
  return {
    id: `plan:${normalizeTopic(entry.topic)}`,
    origin: "content-plan",
    status: entry.status ?? "planned",
    decision: null,
    entry
  };
}

function topicEntryFromCandidate(candidate) {
  return {
    id: `candidate:${candidate.id}`,
    origin: "candidate",
    status: candidate.planEntry?.status ?? "planned",
    decision: candidate.decision ?? "proposed",
    candidateId: candidate.id,
    entry: candidate.planEntry
  };
}

function topicEntryFromIdea(idea, origin, index) {
  return {
    id: `${origin}:${index}:${normalizeTopic(idea.title)}`,
    origin,
    status: idea.status ?? "research_idea",
    decision: null,
    entry: {
      topic: idea.title,
      cluster: idea.cluster,
      intent: idea.intent,
      primaryKeyword: idea.primaryKeyword,
      format: idea.format,
      briefing: idea.briefing,
      mustInclude: idea.mustInclude,
      avoid: idea.avoid,
      sourcePolicy: idea.sourcePolicy,
      sources: idea.evidenceBasis,
      internalLinks: idea.internalLinks,
      riskLevel: idea.riskLevel
    }
  };
}

function collectTopics(plan, candidates, ideas, webIdeas) {
  const all = [
    ...plan.map(topicEntryFromPlan),
    ...candidates.map(topicEntryFromCandidate),
    ...(ideas.ideas ?? []).map((idea, index) => topicEntryFromIdea(idea, "content-ideas", index)),
    ...(webIdeas.ideas ?? []).map((idea, index) => topicEntryFromIdea(idea, "content-ideas-web", index))
  ];

  const seen = new Set();
  return all.filter((item) => {
    const key = `${item.origin}:${normalizeTopic(item.entry?.topic)}`;
    if (seen.has(key) || !item.entry?.topic) return false;
    seen.add(key);
    return true;
  });
}

const targetWords = [
  "führung",
  "führungskraft",
  "manager",
  "management",
  "mittleres management",
  "bereich",
  "abteilung",
  "team",
  "projekt",
  "programm",
  "stakeholder",
  "transformation",
  "matrix",
  "laterale",
  "rolle",
  "rollenklärung",
  "rückendeckung",
  "stimme",
  "ki",
  "digital"
];

const mandateWords = [
  "mandat",
  "rolle",
  "rollen",
  "verantwortung",
  "auftrag",
  "erwartung",
  "wirkung",
  "rückendeckung",
  "entscheidungsspielraum",
  "klarheit",
  "führungssignal",
  "stimme",
  "schweigen",
  "voice",
  "silence"
];

const coachingWords = [
  "klären",
  "schärfen",
  "sortieren",
  "einordnen",
  "reflexion",
  "sparring",
  "führungsfrage",
  "kommunikation",
  "vorbereiten",
  "gespräch",
  "souverän",
  "orientierung",
  "rückendeckung",
  "vertraulich",
  "coaching",
  "wirkung"
];

const consultingRiskWords = [
  "roadmap",
  "strategie entwickeln",
  "organisation optimieren",
  "data governance",
  "toolauswahl",
  "implementierung",
  "beratung"
];

function scoreTopic(item, schema) {
  const entry = item.entry;
  const positiveEntry = { ...entry, avoid: "" };
  const allText = textOf(positiveEntry);
  const clusterOk = schema.coreThemes.includes(entry.cluster);
  const sourceCount = Array.isArray(entry.sources) ? entry.sources.length : 0;
  const internalLinks = Array.isArray(entry.internalLinks) ? entry.internalLinks : [];
  const riskLevel = entry.riskLevel ?? "medium";

  const targetScore = clampScore(1.6 + countMatches(allText, targetWords) * 0.55);
  const mandateScore = clampScore(1.2 + countMatches(allText, mandateWords) * 0.42);
  const architectureScore = clampScore((clusterOk ? 3.6 : 2.2) + (internalLinks.length > 0 ? 0.5 : 0) + (entry.format ? 0.3 : 0));
  const intentScore = clampScore(1.8 + (entry.intent ? 1 : 0) + (entry.primaryKeyword ? 0.7 : 0) + (/[?]|wenn|warum|wie|was/i.test(`${entry.topic} ${entry.intent}`) ? 0.8 : 0));
  const coachingScore = clampScore(1.8 + countMatches(allText, coachingWords) * 0.45 - countMatches(allText, consultingRiskWords) * 0.55);
  const evidenceScore = clampScore(
    entry.sourcePolicy === "approved-external"
      ? 3.2 + Math.min(sourceCount, 3) * 0.65
      : sourceCount > 0
        ? 2.6 + Math.min(sourceCount, 2) * 0.6
        : entry.riskLevel === "low"
          ? 3.2
          : 2.2
  );
  const conversionScore = clampScore(
    2.2 +
      (includesAny(allText, ["Mandat & Wirkung", "mandat-wirkung", "mandat-wirkung.de"]) ? 1.2 : 0) +
      (entry.ctaType ? 0.7 : 0) +
      (internalLinks.some((link) => String(link).includes("mandat-wirkung.de")) ? 0.8 : 0)
  );
  const riskScore = clampScore(
    riskLevel === "low"
      ? 4.7
      : riskLevel === "medium"
        ? 3.8 + (Array.isArray(entry.avoid) && entry.avoid.length > 0 ? 0.4 : 0)
        : 2.0
  );

  const criteriaScores = {
    zielgruppenpassung: targetScore,
    mandatskern: mandateScore,
    themenarchitektur: architectureScore,
    such_und_leserintention: intentScore,
    coachingnaehe: coachingScore,
    quellen_und_evidenz: evidenceScore,
    conversion_passung: conversionScore,
    risiko_und_klarheit: riskScore
  };

  const total = schema.criteria.reduce((sum, criterion) => sum + criteriaScores[criterion.id] * criterion.weight, 0);
  const roundedTotal = clampScore(total);
  const recommendation = schema.recommendations.find((item) => roundedTotal >= item.minScore) ?? schema.recommendations.at(-1);

  const strengths = [];
  const gaps = [];

  if (mandateScore >= 4.3) strengths.push("starker Mandatskern");
  if (targetScore >= 4.2) strengths.push("hohe Zielgruppenpassung");
  if (evidenceScore >= 4) strengths.push("gute Quellenbasis");
  if (coachingScore >= 4) strengths.push("coachingnah formulierbar");
  if (intentScore < 3.4) gaps.push("Suchintention schärfen");
  if (evidenceScore < 3.5) gaps.push("Quellenbasis prüfen");
  if (conversionScore < 3.5) gaps.push("Mandat-&-Wirkung-Brücke stärken");

  return {
    ...item,
    scores: criteriaScores,
    total: roundedTotal,
    grade: recommendation.label,
    recommendation: recommendation.decision,
    rationale: [...strengths, ...gaps].join("; ") || "solide, aber redaktionell weiter schärfen"
  };
}

function markdownTable(rows) {
  const header = [
    "Rang",
    "Thema",
    "Quelle",
    "Status",
    "Cluster",
    "Zielgruppe",
    "Mandat",
    "Coaching",
    "Evidenz",
    "Gesamt",
    "Empfehlung",
    "Begründung"
  ];

  const lines = [
    `| ${header.join(" | ")} |`,
    `| ${header.map(() => "---").join(" | ")} |`
  ];

  rows.forEach((row, index) => {
    lines.push(
      `| ${index + 1} | ${escapeCell(row.entry.topic)} | ${row.origin}${row.candidateId ? `:${row.candidateId}` : ""} | ${row.decision ?? row.status} | ${row.entry.cluster ?? ""} | ${row.scores.zielgruppenpassung} | ${row.scores.mandatskern} | ${row.scores.coachingnaehe} | ${row.scores.quellen_und_evidenz} | ${row.total} | ${row.grade} - ${row.recommendation} | ${escapeCell(row.rationale)} |`
    );
  });

  return lines.join("\n");
}

function escapeCell(value) {
  return String(value ?? "")
    .replace(/\|/g, "\\|")
    .replace(/\n/g, " ");
}

const [schema, plan, candidates, ideas, webIdeas] = await Promise.all([
  readJsonIfExists(schemaPath, null),
  readJsonIfExists(planPath, []),
  readJsonIfExists(candidatesPath, []),
  readJsonIfExists(ideasPath, { ideas: [] }),
  readJsonIfExists(webIdeasPath, { ideas: [] })
]);

if (!schema) {
  throw new Error("evaluation/topic-scoring-schema.json fehlt.");
}

const evaluated = collectTopics(plan, candidates, ideas, webIdeas)
  .map((item) => scoreTopic(item, schema))
  .sort((a, b) => b.total - a.total || a.entry.topic.localeCompare(b.entry.topic, "de"));

const date = todayIso();
const output = [
  "# Fuehrungsmandat Themenbewertung",
  "",
  `Datum: ${date}`,
  "",
  "## Bewertungsschema",
  "",
  "Skala: 1 bis 5. Gesamtwert ist gewichtet nach Zielgruppenpassung, Mandatskern, Themenarchitektur, Such-/Leserintention, Coachingnähe, Quellen/Evidenz, Mandat-&-Wirkung-Brücke und Risiko/Klarheit.",
  "",
  "## Sortierte Bewertung",
  "",
  markdownTable(evaluated),
  "",
  "## Empfehlung",
  "",
  "- A: priorisieren",
  "- B: einplanen",
  "- C: schärfen",
  "- D: parken",
  "",
  "## Technische Notiz",
  "",
  "Diese Bewertung ist ein regelbasierter Redaktions-Check. Sie ersetzt nicht die fachliche Freigabe, macht aber Prioritäten und Lücken sichtbar."
].join("\n");

const jsonOutput = {
  generatedAt: new Date().toISOString(),
  schemaVersion: schema.version,
  topics: evaluated.map((row, index) => ({
    rank: index + 1,
    topic: row.entry.topic,
    origin: row.origin,
    candidateId: row.candidateId ?? null,
    status: row.status,
    decision: row.decision,
    cluster: row.entry.cluster,
    scores: row.scores,
    total: row.total,
    grade: row.grade,
    recommendation: row.recommendation,
    rationale: row.rationale
  }))
};

if (dryRun) {
  console.log(output);
  process.exit(0);
}

await mkdir(outputDir, { recursive: true });
await writeFile(path.join(outputDir, `${date}-topic-evaluation.md`), `${output}\n`, "utf8");
await writeFile(path.join(outputDir, `${date}-topic-evaluation.json`), `${JSON.stringify(jsonOutput, null, 2)}\n`, "utf8");

console.log(`Themenbewertung erstellt: ${path.join(outputDir, `${date}-topic-evaluation.md`)}`);
