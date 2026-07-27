import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

test("paketiert Portal, Bindungen und Migration", async () => {
  const [page, layout, hosting, migration] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../dist/.openai/hosting.json", import.meta.url), "utf8"),
    readFile(
      new URL("../dist/.openai/drizzle/0000_curved_spacker_dave.sql", import.meta.url),
      "utf8",
    ),
    access(new URL("../dist/server/index.js", import.meta.url)),
  ]);

  assert.match(page, /Freigabe mit klarer Bindung\./);
  assert.match(page, /Website zuerst/);
  assert.match(page, /Keine Veröffentlichung ohne gültige Freigabe/);
  assert.match(layout, /lang="de"/);
  assert.match(layout, /index:\s*false/);
  assert.deepEqual(JSON.parse(hosting), {
    project_id: "appgprj_6a67ca6d2950819187278fe61a96eab2",
    d1: "DB",
    r2: "EDITORIAL_ASSETS",
  });
  assert.match(migration, /CREATE TABLE `reviews`/);
  assert.match(migration, /CREATE TABLE `publications`/);
  assert.doesNotMatch(page, /react-loading-skeleton|Your site is taking shape/i);
});

test("hält Freigabeoberfläche und Sicherheitsregeln im Quellstand", async () => {
  const [decision, layout, config, robots] = await Promise.all([
    readFile(
      new URL("../app/review/[token]/ReviewDecision.tsx", import.meta.url),
      "utf8",
    ),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../next.config.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/robots.ts", import.meta.url), "utf8"),
  ]);

  assert.match(decision, /initialApprovedChannels/);
  assert.match(decision, /channel === "website"/);
  assert.match(decision, /Ausgewählte Kanäle freigeben/);
  assert.match(layout, /new URL\("\/og\.png", metadataBase\)/);
  assert.match(config, /X-Frame-Options/);
  assert.match(config, /Cache-Control/);
  assert.match(robots, /disallow:\s*"\/"/);
});
