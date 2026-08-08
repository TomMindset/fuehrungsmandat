import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { argument } from "./lib/args.mjs";
import { githubOutput, optionalEnv } from "./lib/http.mjs";
import { loadArticle } from "./lib/article.mjs";
import { scheduledApprovalSlugs } from "./lib/approval-schedule.mjs";

const execFileAsync = promisify(execFile);
const root = process.cwd();

function slugFromPath(file) {
  const normalized = String(file).replace(/\\/gu, "/");
  const match = normalized.match(/^src\/content\/notes\/([a-z0-9-]+)\.md$/u);
  return match?.[1] || null;
}

async function changedSlugs(before, after) {
  if (!before || !after || /^0+$/u.test(before)) return [];
  const { stdout } = await execFileAsync(
    "git",
    ["diff", "--name-only", before, after, "--", "src/content/notes"],
    { cwd: root, windowsHide: true }
  );
  return [...new Set(stdout.split(/\r?\n/u).map(slugFromPath).filter(Boolean))];
}

async function main() {
  if (optionalEnv("EDITORIAL_AUTOMATION_ENABLED") !== "true") {
    await githubOutput("should_continue", "false");
    console.log("Mehrkanal-Automation ist über EDITORIAL_AUTOMATION_ENABLED gesperrt.");
    return;
  }

  const explicitSlug = argument("--slug");
  const dueDay = argument("--due-day");
  if (explicitSlug && dueDay) {
    throw new Error(
      "Slug und Fälligkeitstag dürfen nicht gemeinsam angegeben werden."
    );
  }

  let candidates;
  if (explicitSlug) {
    candidates = [explicitSlug];
  } else if (dueDay) {
    const plan = JSON.parse(
      await readFile(path.join(root, "content-plan.json"), "utf8")
    );
    candidates = scheduledApprovalSlugs(plan, dueDay);
  } else {
    candidates = await changedSlugs(argument("--before"), argument("--after"));
  }

  const ready = [];
  for (const slug of candidates) {
    try {
      await loadArticle(root, slug);
      ready.push(slug);
    } catch (error) {
      if (explicitSlug) throw error;
      console.log(`${slug} ist kein freigabereifer Draft und wird übersprungen.`);
    }
  }

  if (ready.length === 0) {
    await githubOutput("should_continue", "false");
    console.log(
      dueDay
        ? `Kein freigabereifer Artikel-Draft ist für ${dueDay} terminiert.`
        : "Kein geänderter freigabereifer Artikel-Draft gefunden."
    );
    return;
  }
  if (ready.length > 1) {
    throw new Error(
      `Mehr als ein freigabereifer Draft wurde geändert: ${ready.join(", ")}`
    );
  }

  await githubOutput("should_continue", "true");
  await githubOutput("slug", ready[0]);
  console.log(`Freigabepaket wird für ${ready[0]} vorbereitet.`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Unbekannter Fehler.");
  process.exitCode = 1;
});
