import assert from "node:assert/strict";
import test from "node:test";
import { createPublicationPlan } from "../scripts/lib/publication-plan.mjs";

const config = {
  channels: {
    website: { approvalEnabled: true },
    facebook: { approvalEnabled: true },
    instagram: { approvalEnabled: true },
    linkedin: { approvalEnabled: false }
  }
};

test("ein manueller Facebook-Status blockiert Instagram nicht", () => {
  const result = createPublicationPlan({
    approvedChannels: ["website", "facebook", "instagram"],
    publications: [
      { channel: "website", status: "published" },
      { channel: "facebook", status: "manual_check_required" },
      { channel: "instagram", status: "pending" }
    ],
    config
  });

  assert.deepEqual(result.channels, ["instagram"]);
  assert.match(result.notices.join(" "), /facebook bleibt/u);
});

test("ein manueller Retry verlangt die ausdrückliche Prüfbestätigung", () => {
  const input = {
    approvedChannels: ["website", "facebook"],
    publications: [
      { channel: "website", status: "published" },
      { channel: "facebook", status: "manual_check_required" }
    ],
    config,
    retryChannels: ["facebook"]
  };

  assert.throws(() => createPublicationPlan(input), /ausdrücklich bestätigte/u);
  assert.deepEqual(
    createPublicationPlan({ ...input, confirmManualRetry: true }).channels,
    ["facebook"]
  );
});

test("LinkedIn bleibt auch bei offenem Portalzustand pausiert", () => {
  const result = createPublicationPlan({
    approvedChannels: ["website", "linkedin"],
    publications: [
      { channel: "website", status: "published" },
      { channel: "linkedin", status: "pending" }
    ],
    config
  });

  assert.deepEqual(result.channels, []);
  assert.match(result.notices.join(" "), /linkedin ist pausiert/u);
});
