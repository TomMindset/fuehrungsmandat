import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { argument } from "./lib/args.mjs";

async function main() {
  const slug = argument("--slug", { required: true });
  const publishedAt = argument("--published-at", { required: true });
  const planPath = path.join(process.cwd(), "content-plan.json");
  const plan = JSON.parse(await readFile(planPath, "utf8"));
  const expectedPath = `src/content/notes/${slug}.md`;
  let found = false;
  const updated = plan.map((entry) => {
    if (entry.draftPath !== expectedPath) return entry;
    found = true;
    return {
      ...entry,
      status: "published",
      publishedAt
    };
  });
  if (!found) {
    throw new Error(`Kein Redaktionsplan-Eintrag für ${expectedPath} gefunden.`);
  }
  await writeFile(planPath, `${JSON.stringify(updated, null, 2)}\n`, "utf8");
  console.log(`Redaktionsplan auf published gesetzt: ${slug}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Unbekannter Fehler.");
  process.exitCode = 1;
});
