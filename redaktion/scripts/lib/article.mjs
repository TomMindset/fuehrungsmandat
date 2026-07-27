import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";

const forbiddenTerms = [
  "Potenzial entfalten",
  "Herzensweg",
  "Purpose Journey",
  "Transformation leben",
  "neue Horizonte entdecken",
  "ganzheitliche Begleitung",
  "Mindset-Reise",
  "innere Reise",
  "Jetzt durchstarten",
  "Kostenloses Erstgespräch sichern"
];

export function slugify(value) {
  return String(value)
    .toLowerCase()
    .replace(/ä/gu, "ae")
    .replace(/ö/gu, "oe")
    .replace(/ü/gu, "ue")
    .replace(/ß/gu, "ss")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/gu, "")
    .replace(/[^a-z0-9]+/gu, "-")
    .replace(/^-+|-+$/gu, "");
}

export function parseFrontmatter(markdown) {
  const match = String(markdown).match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/);
  if (!match) throw new Error("Frontmatter fehlt oder ist ungültig.");

  const values = {};
  for (const line of match[1].split(/\r?\n/u)) {
    const separator = line.indexOf(":");
    if (separator < 1) continue;
    const key = line.slice(0, separator).trim();
    const raw = line.slice(separator + 1).trim();
    if (raw === "true" || raw === "false") {
      values[key] = raw === "true";
    } else {
      values[key] = raw.replace(/^["']|["']$/gu, "");
    }
  }

  return {
    data: values,
    body: String(markdown).slice(match[0].length).trim()
  };
}

export function markdownToPlainText(markdown) {
  return String(markdown)
    .replace(/!\[[^\]]*\]\([^)]+\)/gu, "")
    .replace(/\[([^\]]+)\]\([^)]+\)/gu, "$1")
    .replace(/^#{1,6}\s+/gmu, "")
    .replace(/[*_`>]/gu, "")
    .replace(/\s+/gu, " ")
    .trim();
}

export function extractHttpsLinks(markdown) {
  const matches = String(markdown).matchAll(/\[[^\]]+\]\((https:\/\/[^)\s]+)\)/gu);
  return [...new Set([...matches].map((match) => match[1]))];
}

export function contentHash(markdown) {
  return createHash("sha256")
    .update(String(markdown).replace(/\r\n/gu, "\n").trim(), "utf8")
    .digest("hex");
}

export function canonicalJson(value) {
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalJson(item)).join(",")}]`;
  }
  if (value && typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

export function objectHash(value) {
  return createHash("sha256").update(canonicalJson(value), "utf8").digest("hex");
}

export function assertApprovalReady(article, expectedSlug) {
  const failures = [];
  const { data, body, markdown, slug } = article;

  if (slug !== expectedSlug) failures.push("Artikel-Slug stimmt nicht überein");
  if (!data.title) failures.push("title fehlt");
  if (!data.description) failures.push("description fehlt");
  if (!data.date) failures.push("date fehlt");
  if (!data.author) failures.push("author fehlt");
  if (!data.cluster) failures.push("cluster fehlt");
  if (!data.riskLevel) failures.push("riskLevel fehlt");
  if (data.author !== "Thomas Hoffmann") failures.push("author ist nicht Thomas Hoffmann");
  if (data.draft !== true) failures.push("nur draft: true darf zur Freigabe");
  if (data.riskLevel === "high") failures.push("riskLevel high ist gesperrt");
  if ((body.match(/^#\s+/gmu) || []).length !== 1) {
    failures.push("Freigabe-Draft braucht genau eine Markdown-H1");
  }
  if ((body.match(/^##\s+/gmu) || []).length < 3) {
    failures.push("Artikel braucht mindestens drei H2-Abschnitte");
  }
  if (!body.includes("Mandat & Wirkung")) {
    failures.push("Brücke zu Mandat & Wirkung fehlt");
  }

  for (const term of forbiddenTerms) {
    if (markdown.toLocaleLowerCase("de").includes(term.toLocaleLowerCase("de"))) {
      failures.push(`unzulässiger Begriff "${term}"`);
    }
  }

  if (failures.length > 0) {
    throw new Error(`Artikel ist nicht freigabereif:\n${failures.join("\n")}`);
  }
}

export async function loadArticle(root, slug) {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(slug)) {
    throw new Error("Ungültiger Artikel-Slug.");
  }

  const file = path.join(root, "src", "content", "notes", `${slug}.md`);
  const markdown = await readFile(file, "utf8");
  const parsed = parseFrontmatter(markdown);
  const article = {
    ...parsed,
    file,
    markdown,
    slug,
    hash: contentHash(markdown),
    sourceUrls: extractHttpsLinks(markdown),
    plainText: markdownToPlainText(parsed.body)
  };
  assertApprovalReady(article, slug);
  return article;
}

export function validateSocialCopy(value) {
  const failures = [];
  const facebook = String(value?.facebook?.text || "").trim();
  const instagram = String(value?.instagram?.caption || "").trim();
  const altText = String(value?.instagram?.altText || "").trim();
  const linkedin = String(value?.linkedin?.text || "").trim();
  const summary = String(value?.summary || "").trim();
  const evidenceNote = String(value?.evidenceNote || "").trim();
  const audience = String(value?.audience || "").trim();

  if (summary.length < 80 || summary.length > 800) {
    failures.push("Kurzfassung muss 80 bis 800 Zeichen haben");
  }
  if (evidenceNote.length < 80 || evidenceNote.length > 1000) {
    failures.push("Evidenzhinweis muss 80 bis 1.000 Zeichen haben");
  }
  if (audience.length < 5 || audience.length > 160) {
    failures.push("Zielgruppe muss 5 bis 160 Zeichen haben");
  }
  if (facebook.length < 250 || facebook.length > 1200) {
    failures.push("Facebook-Text muss 250 bis 1.200 Zeichen haben");
  }
  if (instagram.length < 250 || instagram.length > 1800) {
    failures.push("Instagram-Caption muss 250 bis 1.800 Zeichen haben");
  }
  if (altText.length < 80 || altText.length > 600) {
    failures.push("Instagram-Alt-Text muss 80 bis 600 Zeichen haben");
  }
  if (linkedin.length < 300 || linkedin.length > 2200) {
    failures.push("LinkedIn-Text muss 300 bis 2.200 Zeichen haben");
  }

  const all = [facebook, instagram, linkedin].join("\n");
  for (const term of forbiddenTerms) {
    if (all.toLocaleLowerCase("de").includes(term.toLocaleLowerCase("de"))) {
      failures.push(`Social-Fassung enthält "${term}"`);
    }
  }
  if (/https?:\/\//u.test(all)) {
    failures.push("Social-Fassungen dürfen die Ziel-URL nicht vorwegnehmen");
  }

  if (failures.length > 0) {
    throw new Error(`Social-Fassungen sind nicht gültig:\n${failures.join("\n")}`);
  }
  return {
    summary,
    evidenceNote,
    audience,
    facebook: { text: facebook },
    instagram: { caption: instagram, altText },
    linkedin: { text: linkedin }
  };
}
