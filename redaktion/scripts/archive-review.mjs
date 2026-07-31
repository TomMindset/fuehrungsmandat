import { argument } from "./lib/args.mjs";
import {
  portalAuthHeaders,
  requiredEnv,
  requestJson,
  safeBaseUrl
} from "./lib/http.mjs";

async function main() {
  const reviewId = argument("--review-id", { required: true });
  const reason = argument("--reason", { required: true }).trim();
  if (!/^[A-Za-z0-9_-]{8,128}$/u.test(reviewId)) {
    throw new Error("Die Freigabe-ID ist ungültig.");
  }
  if (reason.length < 10 || reason.length > 1_000) {
    throw new Error("Der Archivierungsgrund muss 10 bis 1.000 Zeichen haben.");
  }

  const portalBaseUrl = safeBaseUrl(
    requiredEnv("FUEHRUNGSMANDAT_PORTAL_URL"),
    "FUEHRUNGSMANDAT_PORTAL_URL"
  );
  const secret = requiredEnv("FUEHRUNGSMANDAT_PORTAL_SECRET");
  const { body } = await requestJson(
    `${portalBaseUrl}/api/editorial/reviews/${reviewId}/archive`,
    {
      method: "POST",
      headers: {
        ...portalAuthHeaders(secret),
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        confirmNoExternalPublication: true,
        reason
      })
    },
    "Archivierung"
  );
  if (body?.id !== reviewId || body?.status !== "archived") {
    throw new Error("Das Portal hat die Archivierung nicht eindeutig bestätigt.");
  }
  console.log("Freigabe wurde sicher archiviert.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Unbekannter Fehler.");
  process.exitCode = 1;
});
