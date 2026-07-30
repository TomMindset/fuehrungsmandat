import { readFile } from "node:fs/promises";
import path from "node:path";
import { argument } from "./lib/args.mjs";
import {
  optionalEnv,
  portalJson,
  requiredEnv,
  safeBaseUrl
} from "./lib/http.mjs";

async function main() {
  const packagePath = path.resolve(argument("--package", { required: true }));
  const pkg = JSON.parse(await readFile(packagePath, "utf8"));
  const config = JSON.parse(
    await readFile(path.join(process.cwd(), "redaktion", "config.json"), "utf8")
  );
  const portalBaseUrl = safeBaseUrl(
    process.env.FUEHRUNGSMANDAT_PORTAL_URL ||
      config.approval.portalBaseUrl ||
      "",
    "FUEHRUNGSMANDAT_PORTAL_URL"
  );
  const secret = requiredEnv("FUEHRUNGSMANDAT_PORTAL_SECRET");
  const reviewId = pkg.approval?.id;
  if (!reviewId) throw new Error("Freigabe-ID fehlt im Paket.");

  const { body: claim } = await portalJson(
    portalBaseUrl,
    secret,
    `/api/editorial/reviews/${encodeURIComponent(reviewId)}/publications/website/claim`,
    {
      method: "POST",
      body: JSON.stringify({
        version: pkg.version,
        contentHash: pkg.contentHash,
        packageHash: pkg.packageHash,
        workflowRunId: optionalEnv("GITHUB_RUN_ID") || "local"
      })
    }
  );
  if (claim.status === "already_published") {
    console.log("Website-Veröffentlichung war bereits bestätigt.");
    return;
  }
  if (claim.status !== "claimed" || !claim.claimToken) {
    throw new Error("Website-Veröffentlichung konnte nicht reserviert werden.");
  }
  await portalJson(
    portalBaseUrl,
    secret,
    `/api/editorial/reviews/${encodeURIComponent(reviewId)}/publications/website/complete`,
    {
      method: "POST",
      body: JSON.stringify({
        claimToken: claim.claimToken,
        externalId: pkg.contentHash,
        url: pkg.canonicalUrl,
        publishedAt: new Date().toISOString()
      })
    }
  );
  console.log("Live-Website wurde im Portal bestätigt.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Unbekannter Fehler.");
  process.exitCode = 1;
});
