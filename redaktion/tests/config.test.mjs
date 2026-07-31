import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

test("Freigabe und Mail sind aktiv; Veröffentlichungen bleiben gesperrt", async () => {
  const config = JSON.parse(
    await readFile(path.join(process.cwd(), "redaktion", "config.json"), "utf8")
  );
  assert.equal(config.approval.live, true);
  assert.equal(config.mail.live, true);
  assert.equal(config.publishing.live, false);
  for (const channel of ["website", "facebook", "instagram", "linkedin"]) {
    assert.equal(config.channels[channel].live, false);
  }
});

test("Mail, Freigabekanäle und bestätigte Meta-IDs sind vollständig gesetzt", async () => {
  const config = JSON.parse(
    await readFile(path.join(process.cwd(), "redaktion", "config.json"), "utf8")
  );
  assert.equal(config.approval.reviewerAddress, "thoffmann2015@gmail.com");
  assert.equal(
    config.mail.senderAddress,
    "fuehrungsmandat.publishing@gmail.com"
  );
  assert.equal(config.mail.recipientAddress, "thoffmann2015@gmail.com");
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
