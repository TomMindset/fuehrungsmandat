import {
  githubOutput,
  portalJson,
  requiredEnv,
  safeBaseUrl
} from "./lib/http.mjs";

const idPattern = /^[A-Za-z0-9_-]{8,128}$/u;

async function main() {
  const requested = process.env.REQUESTED_REVIEW_ID?.trim() || "";
  if (requested) {
    if (!idPattern.test(requested)) {
      throw new Error("Die angeforderte Freigabe-ID ist ungültig.");
    }
    await githubOutput("review_id", requested);
    await githubOutput("should_continue", "true");
    console.log("Explizit angeforderte Freigabe wird verarbeitet.");
    return;
  }

  const portalBaseUrl = safeBaseUrl(
    requiredEnv("FUEHRUNGSMANDAT_PORTAL_URL"),
    "FUEHRUNGSMANDAT_PORTAL_URL"
  );
  const secret = requiredEnv("FUEHRUNGSMANDAT_PORTAL_SECRET");
  const { response, body } = await portalJson(
    portalBaseUrl,
    secret,
    "/api/editorial/reviews/next-approved"
  );
  if (response.status === 204) {
    await githubOutput("should_continue", "false");
    console.log("Keine offene Freigabe zur Veröffentlichung.");
    return;
  }
  if (!idPattern.test(String(body.id || ""))) {
    throw new Error("Das Portal lieferte keine gültige offene Freigabe-ID.");
  }
  await githubOutput("review_id", body.id);
  await githubOutput("should_continue", "true");
  console.log("Älteste offene Freigabe wird verarbeitet.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Unbekannter Fehler.");
  process.exitCode = 1;
});
