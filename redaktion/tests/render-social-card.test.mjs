import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import sharp from "sharp";
import {
  cardSvg,
  renderSocialCard,
  wrapTitle
} from "../scripts/render-social-card.mjs";

test("lange Titel werden auf höchstens sechs Zeilen begrenzt", () => {
  const lines = wrapTitle(
    "Wenn Verantwortung wächst und das tatsächliche Führungsmandat im entscheidenden Konflikt trotzdem unklar bleibt"
  );
  assert.ok(lines.length <= 6);
});

test("Karteninhalt wird XML-sicher gerendert", () => {
  const svg = cardSvg({
    title: "Rolle & Wirkung < Mandat?",
    cluster: "Führungsmandat"
  });
  assert.match(svg, /Rolle &amp; Wirkung/u);
  assert.doesNotMatch(svg, /Rolle & Wirkung </u);
});

test("Social-Karte ist ein JPEG mit 1080 mal 1350 Pixeln", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "fuehrungsmandat-card-"));
  const output = path.join(directory, "card.jpg");
  try {
    await renderSocialCard(
      {
        title: "Wenn Rückendeckung unklar ist",
        cluster: "Führungsmandat"
      },
      output
    );
    const metadata = await sharp(output).metadata();
    assert.equal(metadata.format, "jpeg");
    assert.equal(metadata.width, 1080);
    assert.equal(metadata.height, 1350);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
