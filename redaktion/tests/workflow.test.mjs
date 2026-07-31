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
