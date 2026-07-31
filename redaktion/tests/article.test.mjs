import assert from "node:assert/strict";
import test from "node:test";
import {
  approvalChannels,
  contentHash,
  objectHash,
  parseFrontmatter,
  slugify,
  validateSocialCopy
} from "../scripts/lib/article.mjs";
import { berlinCalendarDay } from "../scripts/lib/dates.mjs";
import { socialSchema } from "../scripts/lib/social-schema.mjs";

test("slugify erhält deutsche Umschrift", () => {
  assert.equal(
    slugify("Führung ohne Rückendeckung"),
    "fuehrung-ohne-rueckendeckung"
  );
});

test("Frontmatter wird von Artikelinhalt getrennt", () => {
  const parsed = parseFrontmatter(`---
title: "Ein Titel"
draft: true
riskLevel: "low"
---

# Ein Titel

Text.`);
  assert.equal(parsed.data.title, "Ein Titel");
  assert.equal(parsed.data.draft, true);
  assert.match(parsed.body, /^# Ein Titel/u);
});

test("Inhalts-Hash ist unabhängig von Windows-Zeilenenden", () => {
  assert.equal(contentHash("A\r\nB\r\n"), contentHash("A\nB\n"));
});

test("Veröffentlichungstag folgt dem Berliner Kalender", () => {
  assert.equal(
    berlinCalendarDay("2026-07-30T22:30:00.000Z"),
    "2026-07-31"
  );
});

test("Paket-Hash ist unabhängig von der Reihenfolge der JSON-Schlüssel", () => {
  assert.equal(
    objectHash({ b: 2, a: { d: 4, c: 3 } }),
    objectHash({ a: { c: 3, d: 4 }, b: 2 })
  );
});

test("pausierte Kanäle werden nicht zur Freigabe angeboten", () => {
  assert.deepEqual(
    approvalChannels({
      channels: {
        website: { approvalEnabled: true },
        facebook: { approvalEnabled: true },
        instagram: { approvalEnabled: true },
        linkedin: { approvalEnabled: false }
      }
    }),
    ["website", "facebook", "instagram"]
  );
});

test("valide kanalgetrennte Social-Fassungen werden akzeptiert", () => {
  const result = validateSocialCopy({
    summary:
      "Der Beitrag klärt, wie Verantwortung und tatsächliche Rückendeckung vor einer schwierigen Entscheidung voneinander unterschieden werden können.",
    evidenceNote:
      "Der Forschungsbefund wird im Artikel vorsichtig eingeordnet. Er belegt keine konkrete Handlungsempfehlung und wird nicht auf einzelne Organisationen verallgemeinert.",
    audience: "Führungskräfte in Veränderungssituationen",
    facebook: {
      text: "Verantwortung zu übernehmen heißt nicht, jede offene Erwartung stillschweigend zum eigenen Mandat zu machen. Gerade vor schwierigen Entscheidungen lohnt sich die Unterscheidung: Was ist beauftragt, was ist durch die Rolle gedeckt und wer trägt die Folgen im Konfliktfall mit? Der Beitrag bietet dafür vier ruhige Fragen, ohne aus einer komplexen Situation ein Patentrezept zu machen."
    },
    instagram: {
      caption: "Unklare Rückendeckung lässt sich nicht durch noch mehr Entschlossenheit ersetzen.\n\nVor einer schwierigen Entscheidung helfen drei Unterscheidungen: Auftrag, Entscheidungsspielraum und Rückspielpflicht. Sie machen sichtbar, was in der eigenen Rolle liegt und was vor dem nächsten Schritt nach oben geklärt werden sollte.\n\n#Führungsmandat #Rollenklärung #Führung",
      altText: "Typografische Führungsmandat-Karte auf warmem Off-White mit graphitfarbener Überschrift, petrolfarbenen Flächen und zurückhaltenden kupferfarbenen Linien."
    },
    linkedin: {
      text: "Ein Auftrag kann eindeutig klingen und im Konfliktfall trotzdem ohne belastbare Rückendeckung bleiben.\n\nDann ist nicht mehr Entschlossenheit gefragt, sondern eine genauere Führungsfrage: Was ist tatsächlich beauftragt? Welche Entscheidung ist durch die Rolle gedeckt? Und wer steht sichtbar ein, wenn die Entscheidung Widerstand auslöst?\n\nDer Beitrag trennt Verantwortung von stillschweigend übernommenen Erwartungen und verdichtet die Klärung in vier Fragen für das Gespräch nach oben."
    }
  });
  assert.match(result.linkedin.text, /Gespräch nach oben/u);
});

test("OpenAI-Schema erzwingt dieselben Social-Längen wie die Validierung", () => {
  assert.deepEqual(socialSchema.properties.summary, {
    type: "string",
    minLength: 80,
    maxLength: 800
  });
  assert.deepEqual(socialSchema.properties.evidenceNote, {
    type: "string",
    minLength: 80,
    maxLength: 1000
  });
  assert.deepEqual(socialSchema.properties.audience, {
    type: "string",
    minLength: 5,
    maxLength: 160
  });
  assert.deepEqual(socialSchema.properties.facebook.properties.text, {
    type: "string",
    minLength: 250,
    maxLength: 1200
  });
  assert.deepEqual(socialSchema.properties.instagram.properties.caption, {
    type: "string",
    minLength: 250,
    maxLength: 1800
  });
  assert.deepEqual(socialSchema.properties.instagram.properties.altText, {
    type: "string",
    minLength: 80,
    maxLength: 600
  });
  assert.deepEqual(socialSchema.properties.linkedin.properties.text, {
    type: "string",
    minLength: 300,
    maxLength: 2200
  });
});

test("Längenfehler nennen nur die erhaltene Zeichenanzahl", () => {
  assert.throws(
    () =>
      validateSocialCopy({
        summary: "x".repeat(100),
        evidenceNote: "x".repeat(100),
        audience: "x".repeat(161),
        facebook: { text: "x".repeat(260) },
        instagram: {
          caption: "x".repeat(260),
          altText: "x".repeat(100)
        },
        linkedin: { text: "x".repeat(320) }
      }),
    /Zielgruppe muss 5 bis 160 Zeichen haben \(erhalten: 161\)/u
  );
});

test("vorweggenommene URLs werden blockiert", () => {
  assert.throws(
    () =>
      validateSocialCopy({
        summary: "x".repeat(100),
        evidenceNote: "x".repeat(100),
        audience: "Führungskräfte",
        facebook: { text: `${"x".repeat(260)} https://example.com` },
        instagram: {
          caption: "x".repeat(260),
          altText: "x".repeat(100)
        },
        linkedin: { text: "x".repeat(320) }
      }),
    /Ziel-URL/u
  );
});
