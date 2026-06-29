import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const planPath = path.join(root, "content-plan.json");
const candidatesPath = path.join(root, "content-plan-candidates.json");

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const idArg = args.find((arg) => arg.startsWith("--id="));
const approveAll = args.includes("--approved");

function normalizeTopic(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase();
}

function assertPlanEntry(candidate) {
  const entry = candidate.planEntry;
  const failures = [];

  if (!candidate.id) failures.push("candidate.id fehlt");
  if (!entry?.topic) failures.push("planEntry.topic fehlt");
  if (!entry?.cluster) failures.push("planEntry.cluster fehlt");
  if (!entry?.intent) failures.push("planEntry.intent fehlt");
  if (!entry?.primaryKeyword) failures.push("planEntry.primaryKeyword fehlt");
  if (!entry?.format) failures.push("planEntry.format fehlt");
  if (!entry?.riskLevel) failures.push("planEntry.riskLevel fehlt");
  if (!Array.isArray(entry?.internalLinks)) failures.push("planEntry.internalLinks fehlt");
  if (entry?.status !== "planned") failures.push("planEntry.status muss planned sein");

  if (entry?.sourcePolicy === "approved-external" && !Array.isArray(entry?.sources)) {
    failures.push("approved-external braucht sources[]");
  }

  if (failures.length > 0) {
    throw new Error(`Kandidat ${candidate.id ?? "ohne-id"} ist nicht gültig:\n${failures.join("\n")}`);
  }
}

const plan = JSON.parse(await readFile(planPath, "utf8"));
const candidates = JSON.parse(await readFile(candidatesPath, "utf8"));

const selected = candidates.filter((candidate) => {
  if (idArg) return candidate.id === idArg.slice("--id=".length);
  if (approveAll) return candidate.decision === "approved";
  return false;
});

if (!idArg && !approveAll) {
  console.log("Keine Übernahme ausgeführt.");
  console.log("Nutzen Sie --id=<candidate-id> für eine einzelne explizite Übernahme.");
  console.log("Nutzen Sie --approved, um alle Kandidaten mit decision: approved zu übernehmen.");
  process.exit(0);
}

if (selected.length === 0) {
  if (approveAll) {
    console.log("Keine Kandidaten mit decision: approved gefunden.");
    process.exit(0);
  }

  throw new Error("Kein passender Kandidat gefunden.");
}

const existingTopics = new Set(plan.map((entry) => normalizeTopic(entry.topic)));
const promotedIds = new Set();
const promotedEntries = [];

for (const candidate of selected) {
  assertPlanEntry(candidate);

  const topicKey = normalizeTopic(candidate.planEntry.topic);
  if (existingTopics.has(topicKey)) {
    console.log(`Übersprungen, Thema existiert bereits: ${candidate.planEntry.topic}`);
    continue;
  }

  promotedIds.add(candidate.id);
  promotedEntries.push(candidate.planEntry);
  existingTopics.add(topicKey);
}

if (promotedEntries.length === 0) {
  console.log("Keine neuen Einträge für content-plan.json.");
  process.exit(0);
}

const updatedPlan = [...plan, ...promotedEntries];
const updatedCandidates = candidates.map((candidate) =>
  promotedIds.has(candidate.id)
    ? {
        ...candidate,
        decision: "promoted",
        promotedAt: new Date().toISOString()
      }
    : candidate
);

if (dryRun) {
  console.log("Dry run: folgende Kandidaten würden übernommen:");
  for (const entry of promotedEntries) {
    console.log(`- ${entry.topic}`);
  }
  process.exit(0);
}

await writeFile(planPath, `${JSON.stringify(updatedPlan, null, 2)}\n`, "utf8");
await writeFile(candidatesPath, `${JSON.stringify(updatedCandidates, null, 2)}\n`, "utf8");

console.log("Übernommen in content-plan.json:");
for (const entry of promotedEntries) {
  console.log(`- ${entry.topic}`);
}
