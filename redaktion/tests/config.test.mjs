import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

test("alle externen Veröffentlichungen sind standardmäßig gesperrt", async () => {
  const config = JSON.parse(
    await readFile(path.join(process.cwd(), "redaktion", "config.json"), "utf8")
  );
  assert.equal(config.approval.live, false);
  assert.equal(config.mail.live, false);
  assert.equal(config.publishing.live, false);
  for (const channel of ["website", "facebook", "instagram", "linkedin"]) {
    assert.equal(config.channels[channel].live, false);
  }
});

test("nur bestätigte Meta-IDs sind gesetzt; Mail und LinkedIn bleiben offen", async () => {
  const config = JSON.parse(
    await readFile(path.join(process.cwd(), "redaktion", "config.json"), "utf8")
  );
  assert.equal(config.mail.senderAddress, null);
  assert.equal(config.mail.recipientAddress, null);
  assert.equal(config.channels.facebook.pageId, "1302500569602973");
  assert.equal(config.channels.instagram.accountId, "17841439839407567");
  assert.equal(config.channels.website.approvalEnabled, true);
  assert.equal(config.channels.facebook.approvalEnabled, true);
  assert.equal(config.channels.instagram.approvalEnabled, true);
  assert.equal(config.channels.linkedin.approvalEnabled, false);
  assert.equal(config.channels.linkedin.authorUrn, null);
  assert.equal(config.channels.linkedin.mode, null);
  assert.equal(config.publishing.facebookDelayMinutes, 15);
  assert.equal(config.publishing.instagramDelayMinutes, 20);
});
