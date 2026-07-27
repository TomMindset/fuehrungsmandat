import { timingSafeEqual } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { argument } from "./lib/args.mjs";
import { loadArticle, objectHash, validateSocialCopy } from "./lib/article.mjs";
import {
  githubOutput,
  portalJson,
  requiredEnv,
  safeBaseUrl
} from "./lib/http.mjs";

const allowedChannels = new Set([
  "website",
  "facebook",
  "instagram",
  "linkedin"
]);

function sameHash(left, right) {
  if (
    typeof left !== "string" ||
    typeof right !== "string" ||
    !/^[a-f0-9]{64}$/u.test(left) ||
    !/^[a-f0-9]{64}$/u.test(right)
  ) {
    return false;
  }
  return timingSafeEqual(Buffer.from(left, "hex"), Buffer.from(right, "hex"));
}

async function main() {
  const reviewId = argument("--review-id", { required: true });
  const outputDir = path.resolve(argument("--output-dir", { required: true }));
  if (!/^[A-Za-z0-9_-]{8,128}$/u.test(reviewId)) {
    throw new Error("Ungültige Freigabe-ID.");
  }

  const config = JSON.parse(
    await readFile(path.join(process.cwd(), "redaktion", "config.json"), "utf8")
  );
  if (
    config.approval?.live !== true ||
    config.publishing?.live !== true ||
    config.channels?.website?.live !== true
  ) {
    throw new Error("Freigabe oder Veröffentlichung ist in config.json gesperrt.");
  }

  const portalBaseUrl = safeBaseUrl(
    process.env.FUEHRUNGSMANDAT_PORTAL_URL ||
      config.approval.portalBaseUrl ||
      "",
    "FUEHRUNGSMANDAT_PORTAL_URL"
  );
  const secret = requiredEnv("FUEHRUNGSMANDAT_PORTAL_SECRET");
  const { body: approval } = await portalJson(
    portalBaseUrl,
    secret,
    `/api/editorial/reviews/${encodeURIComponent(reviewId)}/publication-package`
  );

  if (approval.status !== "approved") {
    throw new Error(`Freigabestatus ist "${approval.status || "unbekannt"}".`);
  }
  if (!approval.package || typeof approval.package !== "object") {
    throw new Error("Das freigegebene Paket fehlt.");
  }
  const pkg = approval.package;
  if (pkg.brand !== "fuehrungsmandat" || pkg.schemaVersion !== 1) {
    throw new Error("Das Paket gehört nicht zur Führungsmandat-Automation.");
  }
  if (
    approval.version !== pkg.version ||
    !sameHash(approval.contentHash, pkg.contentHash) ||
    !sameHash(approval.packageHash, pkg.packageHash)
  ) {
    throw new Error(
      "Version, Inhalts-Hash oder Paket-Hash der Portalentscheidung weicht ab."
    );
  }
  const { packageHash, ...packageContents } = pkg;
  if (!sameHash(packageHash, objectHash(packageContents))) {
    throw new Error("Der Paket-Hash schützt nicht die ausgelieferten Kanalfassungen.");
  }
  validateSocialCopy({
    summary: pkg.payload?.summary,
    evidenceNote: pkg.payload?.evidenceNote,
    audience: pkg.audience,
    facebook: pkg.payload?.facebook,
    instagram: pkg.payload?.instagram,
    linkedin: pkg.payload?.linkedin
  });

  const channels = approval.approvedChannels;
  if (
    !Array.isArray(channels) ||
    channels.length === 0 ||
    channels.some((channel) => !allowedChannels.has(channel))
  ) {
    throw new Error("Die freigegebenen Kanäle sind ungültig.");
  }
  if (!channels.includes("website")) {
    throw new Error("Website-Freigabe fehlt; Social-Veröffentlichung ist gesperrt.");
  }
  for (const channel of channels) {
    if (config.channels?.[channel]?.live !== true) {
      throw new Error(`Der freigegebene Kanal ${channel} ist lokal noch gesperrt.`);
    }
  }
  if (
    channels.includes("facebook") &&
    !/^\d+$/u.test(String(config.channels.facebook.pageId || ""))
  ) {
    throw new Error("Facebook-Seiten-ID ist in config.json nicht festgelegt.");
  }
  if (
    channels.includes("facebook") &&
    process.env.META_PAGE_ID?.trim() !== String(config.channels.facebook.pageId)
  ) {
    throw new Error("META_PAGE_ID stimmt nicht mit config.json überein.");
  }
  if (
    channels.includes("instagram") &&
    !/^\d+$/u.test(String(config.channels.instagram.accountId || ""))
  ) {
    throw new Error("Instagram-Konto-ID ist in config.json nicht festgelegt.");
  }
  if (
    channels.includes("instagram") &&
    process.env.META_INSTAGRAM_ACCOUNT_ID?.trim() !==
      String(config.channels.instagram.accountId)
  ) {
    throw new Error("META_INSTAGRAM_ACCOUNT_ID stimmt nicht mit config.json überein.");
  }
  if (
    (channels.includes("facebook") || channels.includes("instagram")) &&
    !/^v\d+\.\d+$/u.test(process.env.META_GRAPH_API_VERSION?.trim() || "")
  ) {
    throw new Error("META_GRAPH_API_VERSION fehlt oder ist ungültig.");
  }
  if (channels.includes("linkedin")) {
    const urn = String(config.channels.linkedin.authorUrn || "");
    const mode = config.channels.linkedin.mode;
    if (
      !/^urn:li:(person|organization):[A-Za-z0-9_-]+$/u.test(urn) ||
      !["personal", "organization"].includes(mode) ||
      (mode === "personal" && !urn.startsWith("urn:li:person:")) ||
      (mode === "organization" && !urn.startsWith("urn:li:organization:"))
    ) {
      throw new Error("LinkedIn-Ziel ist in config.json nicht eindeutig festgelegt.");
    }
    if (process.env.LINKEDIN_AUTHOR_URN?.trim() !== urn) {
      throw new Error("LINKEDIN_AUTHOR_URN stimmt nicht mit config.json überein.");
    }
    if (!/^\d{6}$/u.test(process.env.LINKEDIN_VERSION?.trim() || "")) {
      throw new Error("LINKEDIN_VERSION fehlt oder ist ungültig.");
    }
  }

  const article = await loadArticle(process.cwd(), pkg.slug);
  if (!sameHash(article.hash, pkg.contentHash)) {
    throw new Error(
      "Der lokale Artikel entspricht nicht mehr dem freigegebenen Inhalts-Hash."
    );
  }

  const expectedUrl = `${String(config.brand.siteUrl).replace(/\/+$/u, "")}/notizen/${pkg.slug}`;
  if (pkg.canonicalUrl !== expectedUrl) {
    throw new Error("Die freigegebene Artikel-URL stimmt nicht mit der Site überein.");
  }
  const expectedImagePath = `${config.socialCard.pathPrefix}/${pkg.slug}.jpg`;
  if (pkg.imagePath !== expectedImagePath) {
    throw new Error("Der freigegebene Bildpfad ist ungültig.");
  }

  await mkdir(outputDir, { recursive: true });
  const outputPath = path.join(outputDir, "approved-package.json");
  const verified = {
    ...pkg,
    approval: {
      id: reviewId,
      approvedAt: approval.approvedAt,
      channels
    }
  };
  await writeFile(outputPath, `${JSON.stringify(verified, null, 2)}\n`, "utf8");

  await githubOutput("package_path", outputPath);
  await githubOutput("slug", pkg.slug);
  await githubOutput("article_url", pkg.canonicalUrl);
  await githubOutput("image_path", pkg.imagePath);
  await githubOutput("channels", channels.join(","));
  await githubOutput("review_id", reviewId);
  console.log(`Freigabe ${reviewId} für ${pkg.slug} wurde kryptografisch zugeordnet.`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Unbekannter Fehler.");
  process.exitCode = 1;
});
