import { getCollection } from "astro:content";
import { site } from "@data/site";

const staticPaths = [
  "/",
  "/notizen",
  "/themen",
  "/thomas-hoffmann",
  "/impressum",
  "/datenschutz"
];

export async function GET() {
  const notes = (await getCollection("notes"))
    .filter((note) => !note.data.draft)
    .map((note) => `/notizen/${note.id.replace(/\.mdx?$/, "").replace(/\/index$/, "")}`);

  const urls = [...staticPaths, ...notes]
    .map((path) => {
      const loc = new URL(path, site.url).toString();
      return `<url><loc>${loc}</loc></url>`;
    })
    .join("");

  return new Response(`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls}</urlset>`, {
    headers: {
      "Content-Type": "application/xml; charset=utf-8"
    }
  });
}
