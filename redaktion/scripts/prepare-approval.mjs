import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { argument } from "./lib/args.mjs";
import {
  loadArticle,
  objectHash,
  validateSocialCopy
} from "./lib/article.mjs";
import {
  githubOutput,
  portalAuthHeaders,
  requiredEnv,
  requestJson,
  safeBaseUrl
} from "./lib/http.mjs";
import { renderSocialCard } from "./render-social-card.mjs";

const root = process.cwd();

function responseOutputText(response) {
  if (typeof response.output_text === "string" && response.output_text.trim()) {
    return response.output_text;
  }
  return (response.output || [])
    .filter((item) => item.type === "message")
    .flatMap((item) => item.content || [])
    .filter((item) => item.type === "output_text")
    .map((item) => item.text || "")
    .join("");
}

const socialSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "summary",
    "evidenceNote",
    "audience",
    "facebook",
    "instagram",
    "linkedin"
  ],
  properties: {
    summary: { type: "string" },
    evidenceNote: { type: "string" },
    audience: { type: "string" },
    facebook: {
      type: "object",
      additionalProperties: false,
      required: ["text"],
      properties: { text: { type: "string" } }
    },
    instagram: {
      type: "object",
      additionalProperties: false,
      required: ["caption", "altText"],
      properties: {
        caption: { type: "string" },
        altText: { type: "string" }
      }
    },
    linkedin: {
      type: "object",
      additionalProperties: false,
      required: ["text"],
      properties: { text: { type: "string" } }
    }
  }
};

async function createSocialCopy(article, styleRules) {
  const apiKey = requiredEnv("OPENAI_API_KEY");
  const model = process.env.OPENAI_TEXT_MODEL?.trim() || "gpt-5.6";
  const instructions = `
Du bereitest aus einem bereits redigierten Fachartikel drei eigenständige
Social-Fassungen für Fuehrungsmandat.de vor. Der Artikel ist die einzige
inhaltliche Quelle. Ergänze keine neue Studie, Zahl, Person, Organisation,
Kundensituation, Beratungsaussage oder biografische Information.

Sprache und Positionierung:
- Deutsch, ruhig, präzise, erwachsen und businessnah.
- Coaching- und Reflexionsraum, keine Unternehmensberatung.
- Keine laute Verkaufsrhetorik und keine Coaching-Floskeln.
- Trenne Forschungsbefund, Einordnung und Praxistransfer.
- Die Social-Fassungen dürfen die Aussage nicht zuspitzen, wenn der Artikel
  Grenzen oder Unsicherheit benennt.
- Keine URL in die Texte schreiben; sie wird beim Versand ergänzt.
- Maximal fünf zurückhaltende Hashtags pro Plattform.

Kanäle:
- Facebook: 250 bis 1.200 Zeichen, verständlicher Einstieg, Kerngedanke,
  zwei bis vier Reflexionsfragen oder konkrete Beobachtungen.
- Instagram: 250 bis 1.800 Zeichen, kurze Absätze, höchstens fünf Hashtags.
  Die einzelne Markenkarte zeigt nur den Artikeltitel. Der Alt-Text beschreibt
  exakt eine typografische Karte in Off-White, Graphit, Petrol und Kupfer.
- LinkedIn: 300 bis 2.200 Zeichen, eigenständiger fachlicher Einstieg,
  klare Führungsfrage und zurückhaltender Hinweis auf den vollständigen Text.
  Kein Engagement-Bait.

Gib ausschließlich das strukturierte JSON aus.
`.trim();

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model,
      reasoning: { effort: "medium" },
      input: [
        {
          role: "system",
          content: [{ type: "input_text", text: instructions }]
        },
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: `Verbindliche Stilregeln:\n${styleRules}\n\nFreigeprüfter Artikel-Draft:\n${article.markdown}`
            }
          ]
        }
      ],
      text: {
        format: {
          type: "json_schema",
          name: "fuehrungsmandat_social_package",
          strict: true,
          schema: socialSchema
        }
      }
    })
  });
  if (!response.ok) {
    throw new Error(`OpenAI-Aufruf fehlgeschlagen (HTTP ${response.status}).`);
  }
  const parsed = JSON.parse(responseOutputText(await response.json()));
  return { ...validateSocialCopy(parsed), model };
}

function validateReviewResponse(result, portalBaseUrl) {
  const reviewUrl = new URL(String(result.reviewUrl || ""));
  const portalUrl = new URL(portalBaseUrl);
  if (
    reviewUrl.protocol !== "https:" ||
    reviewUrl.host !== portalUrl.host ||
    !/^\/review\/[A-Za-z0-9_-]{32,128}$/u.test(reviewUrl.pathname) ||
    reviewUrl.search ||
    reviewUrl.hash
  ) {
    throw new Error("Das Portal lieferte keine gültige Freigabe-URL.");
  }
  if (!result.id || !result.expiresAt) {
    throw new Error("Die Portalantwort ist unvollständig.");
  }
}

async function main() {
  const slug = argument("--slug", { required: true });
  const outputDir = path.resolve(argument("--output-dir", { required: true }));
  const version = Number(argument("--version") || 1);
  if (!Number.isInteger(version) || version < 1) {
    throw new Error("Die Freigabeversion muss eine positive Ganzzahl sein.");
  }

  const [config, styleRules, article] = await Promise.all([
    readFile(path.join(root, "redaktion", "config.json"), "utf8").then(JSON.parse),
    readFile(
      path.join(root, "content-rules", "fuehrungsmandat-style.md"),
      "utf8"
    ),
    loadArticle(root, slug)
  ]);
  if (config.approval?.live !== true || config.mail?.live !== true) {
    throw new Error(
      "Freigabeportal und Freigabemail sind in redaktion/config.json noch gesperrt."
    );
  }

  const portalBaseUrl = safeBaseUrl(
    process.env.FUEHRUNGSMANDAT_PORTAL_URL ||
      config.approval.portalBaseUrl ||
      "",
    "FUEHRUNGSMANDAT_PORTAL_URL"
  );
  const portalSecret = requiredEnv("FUEHRUNGSMANDAT_PORTAL_SECRET");
  const social = await createSocialCopy(article, styleRules);
  const articleUrl = `${String(config.brand.siteUrl).replace(/\/+$/u, "")}/notizen/${slug}`;
  const imagePath = `${config.socialCard.pathPrefix}/${slug}.jpg`;
  const packageContents = {
    schemaVersion: 1,
    brand: "fuehrungsmandat",
    slug,
    version,
    contentHash: article.hash,
    title: article.data.title,
    description: article.data.description,
    cluster: article.data.cluster,
    audience: social.audience,
    riskLevel: article.data.riskLevel,
    canonicalUrl: articleUrl,
    imagePath,
    sourceUrls: article.sourceUrls,
    createdAt: new Date().toISOString(),
    createdByModel: social.model,
    availableChannels: ["website", "facebook", "instagram", "linkedin"],
    publicationRules: {
      websiteFirst: true,
      selectedChannelsOnly: true,
      ambiguousResult: "manual_check_required"
    },
    payload: {
      summary: social.summary,
      evidenceNote: social.evidenceNote,
      article: {
        markdown: article.markdown
      },
      facebook: social.facebook,
      instagram: social.instagram,
      linkedin: social.linkedin
    }
  };
  const pkg = {
    ...packageContents,
    packageHash: objectHash(packageContents)
  };

  await mkdir(outputDir, { recursive: true });
  const packagePath = path.join(outputDir, "approval-package.json");
  const imageFile = path.join(outputDir, "social-card.jpg");
  await writeFile(packagePath, `${JSON.stringify(pkg, null, 2)}\n`, "utf8");
  await renderSocialCard(pkg, imageFile, config.socialCard);

  const image = await readFile(imageFile);
  const form = new FormData();
  form.set("package", JSON.stringify(pkg));
  form.set("image", new Blob([image], { type: "image/jpeg" }), `${slug}.jpg`);
  const { body: result } = await requestJson(
    `${portalBaseUrl}/api/editorial/reviews`,
    {
      method: "POST",
      headers: portalAuthHeaders(portalSecret),
      body: form
    },
    "Freigabekarte"
  );
  validateReviewResponse(result, portalBaseUrl);

  const reviewPath = path.join(outputDir, "review-result.json");
  await writeFile(reviewPath, `${JSON.stringify(result, null, 2)}\n`, "utf8");
  await githubOutput("package_path", packagePath);
  await githubOutput("image_path", imageFile);
  await githubOutput("review_path", reviewPath);
  await githubOutput("review_id", result.id);
  await githubOutput("title", pkg.title);
  console.log("Freigabepaket und kanalgenaue Freigabekarte wurden erstellt.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Unbekannter Fehler.");
  process.exitCode = 1;
});
