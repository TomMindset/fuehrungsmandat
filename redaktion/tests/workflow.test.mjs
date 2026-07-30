import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("Publikationsworkflow trennt Website und Meta-Kanäle", async () => {
  const workflow = await readFile(
    new URL("../../.github/workflows/editorial-publish.yml", import.meta.url),
    "utf8"
  );

  assert.match(workflow, /^\s{2}website:\s*$/mu);
  assert.match(workflow, /^\s{2}facebook:\s*$/mu);
  assert.match(workflow, /^\s{2}instagram:\s*$/mu);
  assert.match(workflow, /--channel facebook/u);
  assert.match(workflow, /--channel instagram/u);
  assert.match(workflow, /retry_channels:/u);
  assert.match(workflow, /confirm_manual_retry:/u);
  assert.match(workflow, /dry_run:/u);
  assert.doesNotMatch(workflow, /^\s{2}linkedin:\s*$/mu);
});
