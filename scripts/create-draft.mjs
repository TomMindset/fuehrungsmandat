import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const planPath = path.join(root, "content-plan.json");
const notesDir = path.join(root, "src", "content", "notes");

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

const plan = JSON.parse(await readFile(planPath, "utf8"));
const item = plan.find((entry) => {
  if (entry.status !== "planned") return false;

  const slug = slugify(entry.topic);
  return !existsSync(path.join(notesDir, `${slug}.md`));
});

if (!item) {
  console.log("Keine geplanten Themen gefunden.");
  process.exit(0);
}

const slug = slugify(item.topic);
const outputPath = path.join(notesDir, `${slug}.md`);

if (existsSync(outputPath)) {
  throw new Error(`Draft existiert bereits: ${outputPath}`);
}

const today = new Date().toISOString().slice(0, 10);
const description = `${item.topic}: eine ruhige Einordnung zu Rolle, Mandat und Wirkung in anspruchsvollen Führungssituationen.`;

const draft = `---
title: "${item.topic.replace(/"/g, "'")}"
description: "${description.replace(/"/g, "'")}"
date: ${today}
author: "Thomas Hoffmann"
cluster: "${item.cluster}"
tags: ["${item.primaryKeyword}"]
featured: false
riskLevel: "${item.riskLevel}"
draft: true
---

Dieser Entwurf ist automatisch aus dem Redaktionsplan erzeugt. Er ist noch nicht veröffentlichungsreif.

## Ausgangslage

Beschreiben Sie die konkrete Führungssituation ruhig und präzise. Keine erfundenen Kundenbeispiele verwenden.

## Woran das Mandat unklar wird

Unterscheiden Sie Auftrag, Erwartung, Rückendeckung, Entscheidungsspielraum und Wirkung.

## Was zu klären ist

- Welche Verantwortung ist ausdrücklich beauftragt?
- Welche Erwartungen wirken zusätzlich?
- Welche Entscheidung braucht Rückendeckung?
- Welche Stakeholder prägen die Wirkung?

## Was das für Führung bedeutet

Leiten Sie eine klare, businessnahe Konsequenz für Kommunikation, Entscheidung oder Rollenklärung ab.

## Verbindung zu Mandat & Wirkung

Wenn aus dieser Frage eine konkrete Führungs- oder Veränderungssituation wird, bietet Mandat & Wirkung einen vertraulichen Coaching-Rahmen.
`;

await mkdir(notesDir, { recursive: true });
await writeFile(outputPath, draft, "utf8");

const updatedPlan = plan.map((entry) =>
  entry === item
    ? {
        ...entry,
        status: "drafted",
        draftPath: `src/content/notes/${slug}.md`,
        draftedAt: today
      }
    : entry
);

await writeFile(planPath, `${JSON.stringify(updatedPlan, null, 2)}\n`, "utf8");
console.log(`Draft erstellt: ${outputPath}`);
