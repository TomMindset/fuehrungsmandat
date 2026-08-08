import assert from "node:assert/strict";
import test from "node:test";
import {
  assertIsoDay,
  scheduledApprovalSlugs
} from "../scripts/lib/approval-schedule.mjs";

test("fällige Drafts werden am vorgesehenen Berliner Kalendertag aufgelöst", () => {
  const plan = [
    {
      topic: "Fälliger Artikel",
      status: "drafted",
      draftPath: "src/content/notes/faelliger-artikel.md",
      date: "2026-08-08",
      draftAfter: "2026-08-08"
    },
    {
      topic: "Späterer Artikel",
      status: "drafted",
      draftPath: "src/content/notes/spaeterer-artikel.md",
      date: "2026-08-11"
    },
    {
      topic: "Nur geplant",
      status: "planned",
      draftPath: "src/content/notes/nur-geplant.md",
      date: "2026-08-08"
    }
  ];

  assert.deepEqual(scheduledApprovalSlugs(plan, "2026-08-08"), [
    "faelliger-artikel"
  ]);
});

test("publishOn hat Vorrang vor date und draftAfter", () => {
  const plan = [
    {
      topic: "Vorbereiteter Artikel",
      status: "drafted",
      draftPath: "src/content/notes/vorbereiteter-artikel.md",
      date: "2026-08-11",
      draftAfter: "2026-08-08",
      publishOn: "2026-08-12"
    }
  ];

  assert.deepEqual(scheduledApprovalSlugs(plan, "2026-08-08"), []);
  assert.deepEqual(scheduledApprovalSlugs(plan, "2026-08-11"), []);
  assert.deepEqual(scheduledApprovalSlugs(plan, "2026-08-12"), [
    "vorbereiteter-artikel"
  ]);
});

test("date hat Vorrang; draftAfter bleibt Fallback fuer alte Planeintraege", () => {
  const plan = [
    {
      topic: "Artikel mit Erscheinungsdatum",
      status: "drafted",
      draftPath: "src/content/notes/mit-datum.md",
      date: "2026-08-11",
      draftAfter: "2026-08-08"
    },
    {
      topic: "Älterer Planeintrag",
      status: "drafted",
      draftPath: "src/content/notes/altbestand.md",
      draftAfter: "2026-08-08"
    }
  ];

  assert.deepEqual(scheduledApprovalSlugs(plan, "2026-08-08"), [
    "altbestand"
  ]);
  assert.deepEqual(scheduledApprovalSlugs(plan, "2026-08-11"), ["mit-datum"]);
});

test("ungültige Freigabetage und Draft-Pfade werden blockiert", () => {
  assert.throws(() => assertIsoDay("2026-02-30"), /Kalenderdatum/u);
  assert.throws(
    () =>
      scheduledApprovalSlugs(
        [
          {
            topic: "Ungültiger Pfad",
            status: "drafted",
            draftPath: "../artikel.md",
            date: "2026-08-08"
          }
        ],
        "2026-08-08"
      ),
    /draftPath/u
  );
});
