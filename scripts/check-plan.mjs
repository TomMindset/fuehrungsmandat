import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const planPath = path.join(root, "content-plan.json");
const candidatesPath = path.join(root, "content-plan-candidates.json");

const allowedClusters = new Set([
  "Führungsmandat",
  "Rollenklärung",
  "Laterale Führung",
  "Führung in Transformation",
  "Stakeholder und Wirkung",
  "KI und Führung"
]);
const allowedRiskLevels = new Set(["low", "medium", "high"]);
const allowedStatuses = new Set(["planned", "drafted", "reviewed", "published", "archived"]);
const allowedCandidateDecisions = new Set(["proposed", "approved", "promoted", "rejected", "parked"]);
const allowedSourcePolicies = new Set(["none", "internal", "approved-external"]);

function normalize(value) {
  return String(value ?? "").trim().toLowerCase();
}

function isIsoDate(value) {
  if (typeof value !== "string") return false;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;

  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function checkPlanEntry(entry, label, failures) {
  const required = ["topic", "cluster", "intent", "primaryKeyword", "format", "riskLevel", "status"];

  for (const key of required) {
    if (!entry?.[key]) failures.push(`${label}: ${key} fehlt`);
  }

  if (entry?.cluster && !allowedClusters.has(entry.cluster)) {
    failures.push(`${label}: unbekannter Cluster "${entry.cluster}"`);
  }

  if (entry?.riskLevel && !allowedRiskLevels.has(entry.riskLevel)) {
    failures.push(`${label}: riskLevel "${entry.riskLevel}" ist nicht erlaubt`);
  }

  if (entry?.status && !allowedStatuses.has(entry.status)) {
    failures.push(`${label}: status "${entry.status}" ist nicht erlaubt`);
  }

  if (!Array.isArray(entry?.internalLinks) || entry.internalLinks.length === 0) {
    failures.push(`${label}: internalLinks[] fehlt oder ist leer`);
  }

  if (entry?.sourcePolicy && !allowedSourcePolicies.has(entry.sourcePolicy)) {
    failures.push(`${label}: sourcePolicy "${entry.sourcePolicy}" ist nicht erlaubt`);
  }

  if (entry?.sourcePolicy === "approved-external") {
    if (!Array.isArray(entry.sources) || entry.sources.length === 0) {
      failures.push(`${label}: sourcePolicy approved-external braucht sources[]`);
    } else {
      for (const [index, source] of entry.sources.entries()) {
        if (!source.title) failures.push(`${label}: sources[${index}].title fehlt`);
        if (!source.url && !source.doi) failures.push(`${label}: sources[${index}] braucht url oder doi`);
      }
    }
  }

  if (entry?.riskLevel === "high" && entry?.status === "planned") {
    failures.push(`${label}: riskLevel high darf nicht automatisch als planned verarbeitet werden`);
  }

  if (entry?.draftAfter && !isIsoDate(entry.draftAfter)) {
    failures.push(`${label}: draftAfter muss ein Datum im Format YYYY-MM-DD sein`);
  }

  if (entry?.publishOn && !isIsoDate(entry.publishOn)) {
    failures.push(`${label}: publishOn muss ein Datum im Format YYYY-MM-DD sein`);
  }

  if (entry?.publishOn && !entry?.draftAfter) {
    failures.push(`${label}: publishOn darf nur mit draftAfter gesetzt werden`);
  }

  if (entry?.draftAfter && entry?.publishOn && entry.publishOn < entry.draftAfter) {
    failures.push(`${label}: publishOn darf nicht vor draftAfter liegen`);
  }
}

function findDuplicateValues(values) {
  const seen = new Set();
  const duplicates = new Set();

  for (const value of values) {
    const normalized = normalize(value);
    if (!normalized) continue;
    if (seen.has(normalized)) duplicates.add(value);
    seen.add(normalized);
  }

  return [...duplicates];
}

const failures = [];
const plan = JSON.parse(await readFile(planPath, "utf8"));

if (!Array.isArray(plan)) {
  failures.push("content-plan.json muss ein Array sein");
} else {
  for (const [index, entry] of plan.entries()) {
    checkPlanEntry(entry, `content-plan[${index}] "${entry?.topic ?? "ohne Thema"}"`, failures);
  }

  for (const topic of findDuplicateValues(plan.map((entry) => entry.topic))) {
    failures.push(`content-plan: doppeltes Thema "${topic}"`);
  }
}

if (existsSync(candidatesPath)) {
  const candidates = JSON.parse(await readFile(candidatesPath, "utf8"));

  if (!Array.isArray(candidates)) {
    failures.push("content-plan-candidates.json muss ein Array sein");
  } else {
    for (const [index, candidate] of candidates.entries()) {
      const label = `candidate[${index}] "${candidate?.id ?? "ohne ID"}"`;

      if (!candidate?.id) failures.push(`${label}: id fehlt`);
      if (!candidate?.decision) failures.push(`${label}: decision fehlt`);
      if (candidate?.decision && !allowedCandidateDecisions.has(candidate.decision)) {
        failures.push(`${label}: decision "${candidate.decision}" ist nicht erlaubt`);
      }
      if (!candidate?.planEntry) failures.push(`${label}: planEntry fehlt`);
      if (candidate?.planEntry) checkPlanEntry(candidate.planEntry, label, failures);
    }

    for (const id of findDuplicateValues(candidates.map((candidate) => candidate.id))) {
      failures.push(`content-plan-candidates: doppelte id "${id}"`);
    }
  }
}

if (failures.length > 0) {
  console.error(failures.join("\n"));
  process.exit(1);
}

console.log("Redaktionsplan und Kandidaten geprüft.");
