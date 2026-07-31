import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("Publikationsworkflow trennt Website und Meta-Kanäle", async () => {
  const [workflow, approvalMail] = await Promise.all([
    readFile(
      new URL("../../.github/workflows/editorial-publish.yml", import.meta.url),
      "utf8"
    ),
    readFile(
      new URL("../templates/freigabe-mail.html", import.meta.url),
      "utf8"
    )
  ]);

  assert.match(workflow, /^\s{2}website:\s*$/mu);
  assert.match(workflow, /^\s{2}facebook:\s*$/mu);
  assert.match(workflow, /^\s{2}instagram:\s*$/mu);
  assert.match(workflow, /--channel facebook/u);
  assert.match(workflow, /--channel instagram/u);
  assert.match(workflow, /retry_channels:/u);
  assert.match(workflow, /confirm_manual_retry:/u);
  assert.match(workflow, /dry_run:/u);
  assert.doesNotMatch(workflow, /^\s{2}linkedin:\s*$/mu);
  assert.doesNotMatch(approvalMail, /Instagram und LinkedIn/u);
});

test("SMTP-Smoke-Test ist manuell und von Veröffentlichungen isoliert", async () => {
  const [workflow, mailScript] = await Promise.all([
    readFile(
      new URL(
        "../../.github/workflows/editorial-mail-smoke-test.yml",
        import.meta.url
      ),
      "utf8"
    ),
    readFile(
      new URL("../scripts/send-approval-mail.py", import.meta.url),
      "utf8"
    )
  ]);

  assert.match(workflow, /^on:\s*\n\s{2}workflow_dispatch:\s*$/mu);
  assert.doesNotMatch(
    workflow,
    /^\s{2}(push|schedule|repository_dispatch):/mu
  );
  assert.match(workflow, /FUEHRUNGSMANDAT_GMAIL_APP_PASSWORD/u);
  assert.match(workflow, /--smoke-test/u);
  assert.doesNotMatch(
    workflow,
    /META_|FUEHRUNGSMANDAT_PORTAL|editorial-publish/u
  );
  assert.match(mailScript, /def build_smoke_message\(/u);
  assert.match(mailScript, /Technischer Versandtest/u);
});

test("Dry Run darf die älteste offene Freigabe sicher abrufen", async () => {
  const workflow = await readFile(
    new URL("../../.github/workflows/editorial-publish.yml", import.meta.url),
    "utf8"
  );

  assert.match(
    workflow,
    /review_id:\s*\n\s+description:.*Dry Run.*\n\s+required: false\s*\n\s+default: ""/u
  );
  assert.match(workflow, /REQUESTED_REVIEW_ID:.*inputs\.review_id/u);
  assert.match(workflow, /DRY_RUN:.*inputs\.dry_run/u);
  assert.match(
    workflow,
    /"\$DRY_RUN" != "true".*"\$REQUESTED_REVIEW_ID"/u
  );
  assert.match(
    workflow,
    /Ein manueller Publikationslauf benötigt eine konkrete review_id\./u
  );
});

test("Portalwartung archiviert nur eine explizit bestätigte Testfreigabe", async () => {
  const [workflow, archiveScript] = await Promise.all([
    readFile(
      new URL(
        "../../.github/workflows/editorial-review-maintenance.yml",
        import.meta.url
      ),
      "utf8"
    ),
    readFile(
      new URL("../scripts/archive-review.mjs", import.meta.url),
      "utf8"
    )
  ]);

  assert.match(workflow, /^on:\s*\n\s{2}workflow_dispatch:/mu);
  assert.doesNotMatch(workflow, /^\s{2}(push|schedule|repository_dispatch):/mu);
  assert.match(workflow, /ARCHIVE_TEST_REVIEW/u);
  assert.match(workflow, /EDITORIAL_AUTOMATION_ENABLED/u);
  assert.match(workflow, /archive-review\.mjs/u);
  assert.doesNotMatch(workflow, /META_|LINKEDIN_|contents:\s*write/u);
  assert.match(archiveScript, /confirmNoExternalPublication: true/u);
  assert.match(archiveScript, /body\?\.status !== "archived"/u);
});
