import assert from "node:assert/strict";
import test from "node:test";
import { portalAuthHeaders } from "../scripts/lib/http.mjs";

test("Portal-Header trennen Ingest- und privaten Sites-Zugriff", () => {
  const previous = process.env.FUEHRUNGSMANDAT_PORTAL_BYPASS_TOKEN;
  process.env.FUEHRUNGSMANDAT_PORTAL_BYPASS_TOKEN = "sites-private-token";

  try {
    assert.deepEqual(portalAuthHeaders("portal-ingest-secret"), {
      Authorization: "Bearer portal-ingest-secret",
      "X-Fuehrungsmandat-Secret": "portal-ingest-secret",
      "OAI-Sites-Authorization": "Bearer sites-private-token"
    });
  } finally {
    if (previous === undefined) {
      delete process.env.FUEHRUNGSMANDAT_PORTAL_BYPASS_TOKEN;
    } else {
      process.env.FUEHRUNGSMANDAT_PORTAL_BYPASS_TOKEN = previous;
    }
  }
});

test("Portal-Header funktionieren ohne privaten Sites-Zugriff", () => {
  const previous = process.env.FUEHRUNGSMANDAT_PORTAL_BYPASS_TOKEN;
  delete process.env.FUEHRUNGSMANDAT_PORTAL_BYPASS_TOKEN;

  try {
    assert.deepEqual(portalAuthHeaders("portal-ingest-secret"), {
      Authorization: "Bearer portal-ingest-secret",
      "X-Fuehrungsmandat-Secret": "portal-ingest-secret"
    });
  } finally {
    if (previous !== undefined) {
      process.env.FUEHRUNGSMANDAT_PORTAL_BYPASS_TOKEN = previous;
    }
  }
});
