import { env } from "cloudflare:workers";
import {
  canonicalJson,
  constantTimeEqual,
  hmacToken,
  parseBearer,
  sha256,
} from "./security";

export const CHANNELS = [
  "website",
  "facebook",
  "instagram",
  "linkedin",
] as const;

export type Channel = (typeof CHANNELS)[number];
export type ReviewStatus =
  | "pending"
  | "approved"
  | "changes_requested"
  | "rejected"
  | "expired"
  | "archived";

type PortalEnv = {
  DB: D1Database;
  EDITORIAL_ASSETS: R2Bucket;
  PORTAL_INGEST_SECRET?: string;
  GITHUB_DISPATCH_TOKEN?: string;
  GITHUB_REPOSITORY?: string;
};

export type ApprovalPackage = {
  schemaVersion: 1;
  brand: "fuehrungsmandat";
  slug: string;
  version: number;
  contentHash: string;
  packageHash: string;
  title: string;
  description: string;
  cluster?: string;
  audience: string;
  riskLevel: string;
  canonicalUrl: string;
  imagePath: string;
  sourceUrls: string[];
  createdAt: string;
  availableChannels: Channel[];
  publicationRules: {
    websiteFirst: true;
    selectedChannelsOnly: true;
    ambiguousResult: "manual_check_required";
  };
  payload: {
    summary: string;
    evidenceNote: string;
    article: { markdown: string };
    facebook: { text: string };
    instagram: { caption: string; altText: string };
    linkedin: { text: string };
  };
};

export type ReviewRecord = {
  id: string;
  slug: string;
  version: number;
  content_hash: string;
  package_hash: string;
  title: string;
  description: string;
  package_json: string;
  image_key: string;
  token_hash: string;
  status: ReviewStatus;
  approved_channels_json: string | null;
  decision_note: string | null;
  created_at: string;
  expires_at: string;
  decision_at: string | null;
};

export function getPortalEnv(): PortalEnv {
  return env as unknown as PortalEnv;
}

let schemaReady: Promise<void> | null = null;

export async function ensureSchema(): Promise<void> {
  if (schemaReady) return schemaReady;
  const { DB } = getPortalEnv();
  schemaReady = (async () => {
    await DB.batch([
      DB.prepare(`
        CREATE TABLE IF NOT EXISTS reviews (
          id TEXT PRIMARY KEY,
          idempotency_key TEXT NOT NULL UNIQUE,
          brand TEXT NOT NULL,
          slug TEXT NOT NULL,
          version INTEGER NOT NULL,
          content_hash TEXT NOT NULL,
          package_hash TEXT NOT NULL,
          title TEXT NOT NULL,
          description TEXT NOT NULL,
          package_json TEXT NOT NULL,
          image_key TEXT NOT NULL,
          token_hash TEXT NOT NULL UNIQUE,
          status TEXT NOT NULL DEFAULT 'pending',
          approved_channels_json TEXT,
          decision_note TEXT,
          created_at TEXT NOT NULL,
          expires_at TEXT NOT NULL,
          decision_at TEXT,
          mail_status TEXT NOT NULL DEFAULT 'pending',
          mail_message_id TEXT,
          dispatch_status TEXT NOT NULL DEFAULT 'pending',
          dispatch_error TEXT
        )
      `),
      DB.prepare(`
        CREATE TABLE IF NOT EXISTS publications (
          review_id TEXT NOT NULL,
          channel TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'pending',
          claim_token_hash TEXT,
          claimed_at TEXT,
          workflow_run_id TEXT,
          external_id TEXT,
          url TEXT,
          published_at TEXT,
          reason TEXT,
          PRIMARY KEY (review_id, channel),
          FOREIGN KEY (review_id) REFERENCES reviews(id)
        )
      `),
      DB.prepare(
        "CREATE INDEX IF NOT EXISTS reviews_token_hash_idx ON reviews(token_hash)",
      ),
      DB.prepare(
        "CREATE INDEX IF NOT EXISTS reviews_status_idx ON reviews(status)",
      ),
    ]);
  })().catch((error) => {
    schemaReady = null;
    throw error;
  });
  return schemaReady;
}

export function validatePackage(value: unknown): ApprovalPackage {
  const pkg = value as Partial<ApprovalPackage>;
  const hash = /^[a-f0-9]{64}$/u;
  const slug = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;
  if (
    pkg?.schemaVersion !== 1 ||
    pkg.brand !== "fuehrungsmandat" ||
    !slug.test(String(pkg.slug || "")) ||
    !Number.isInteger(pkg.version) ||
    Number(pkg.version) < 1 ||
    !hash.test(String(pkg.contentHash || "")) ||
    !hash.test(String(pkg.packageHash || "")) ||
    typeof pkg.title !== "string" ||
    pkg.title.trim().length < 4 ||
    typeof pkg.description !== "string" ||
    typeof pkg.payload?.article?.markdown !== "string" ||
    !Array.isArray(pkg.availableChannels) ||
    pkg.availableChannels.some(
      (channel) => !CHANNELS.includes(channel as Channel),
    ) ||
    !pkg.availableChannels.includes("website") ||
    pkg.publicationRules?.websiteFirst !== true ||
    pkg.publicationRules?.selectedChannelsOnly !== true
  ) {
    throw new Error("Das Freigabepaket ist unvollständig oder ungültig.");
  }
  const { packageHash, ...contents } = pkg as ApprovalPackage;
  return { ...(contents as Omit<ApprovalPackage, "packageHash">), packageHash };
}

export async function verifyPackageHash(
  pkg: ApprovalPackage,
): Promise<boolean> {
  const { packageHash, ...contents } = pkg;
  return constantTimeEqual(packageHash, await sha256(canonicalJson(contents)));
}

export async function authorizeService(request: Request): Promise<boolean> {
  const expected = getPortalEnv().PORTAL_INGEST_SECRET?.trim();
  const supplied =
    request.headers.get("x-fuehrungsmandat-secret")?.trim() ||
    parseBearer(request);
  if (!expected || !supplied) return false;
  return constantTimeEqual(expected, supplied);
}

export async function reviewByToken(
  token: string,
): Promise<ReviewRecord | null> {
  if (!/^[A-Za-z0-9_-]{32,128}$/u.test(token)) return null;
  await ensureSchema();
  const tokenHash = await sha256(token);
  const result = await getPortalEnv()
    .DB.prepare(
      `SELECT id, slug, version, content_hash, package_hash, title, description,
        package_json, image_key, token_hash, status, approved_channels_json,
        decision_note, created_at, expires_at, decision_at
       FROM reviews WHERE token_hash = ?`,
    )
    .bind(tokenHash)
    .first<ReviewRecord>();
  if (!result) return null;
  if (result.status === "pending" && Date.parse(result.expires_at) <= Date.now()) {
    await getPortalEnv()
      .DB.prepare("UPDATE reviews SET status = 'expired' WHERE id = ?")
      .bind(result.id)
      .run();
    result.status = "expired";
  }
  return result;
}

export async function createReview(
  pkg: ApprovalPackage,
  image: Uint8Array,
  origin: string,
): Promise<{
  id: string;
  version: number;
  reviewUrl: string;
  expiresAt: string;
}> {
  await ensureSchema();
  const portalEnv = getPortalEnv();
  const portalSecret = portalEnv.PORTAL_INGEST_SECRET?.trim();
  if (!portalSecret) {
    throw new Error("Die serverseitige Portal-Authentifizierung fehlt.");
  }
  const idempotencyKey = await sha256(
    [
      pkg.brand,
      pkg.slug,
      pkg.version,
      pkg.contentHash,
      pkg.packageHash,
    ].join("\u0000"),
  );
  const existing = await portalEnv.DB.prepare(
    `SELECT id, version, expires_at, token_hash, status
     FROM reviews WHERE idempotency_key = ?`,
  )
    .bind(idempotencyKey)
    .first<{
      id: string;
      version: number;
      expires_at: string;
      token_hash: string;
      status: ReviewStatus;
    }>();
  if (existing) {
    const token = await hmacToken(portalSecret, `review:${idempotencyKey}`);
    if (!constantTimeEqual(await sha256(token), existing.token_hash)) {
      throw new Error("Die vorhandene Freigabe ist kryptografisch inkonsistent.");
    }
    return {
      id: existing.id,
      version: existing.version,
      reviewUrl: `${origin}/review/${token}`,
      expiresAt: existing.expires_at,
    };
  }

  const id = `review_${crypto.randomUUID().replaceAll("-", "")}`;
  const token = await hmacToken(portalSecret, `review:${idempotencyKey}`);
  const tokenHash = await sha256(token);
  const createdAt = new Date().toISOString();
  const expiresAt = new Date(Date.now() + 7 * 86_400_000).toISOString();
  const imageKey = `reviews/${id}/social-card.jpg`;

  await portalEnv.EDITORIAL_ASSETS.put(imageKey, image, {
    httpMetadata: {
      contentType: "image/jpeg",
      cacheControl: "private, no-store",
    },
    customMetadata: {
      reviewId: id,
      packageHash: pkg.packageHash,
    },
  });

  try {
    await portalEnv.DB.prepare(
      `INSERT INTO reviews (
        id, idempotency_key, brand, slug, version, content_hash, package_hash,
        title, description, package_json, image_key, token_hash, status,
        created_at, expires_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)`,
    )
      .bind(
        id,
        idempotencyKey,
        pkg.brand,
        pkg.slug,
        pkg.version,
        pkg.contentHash,
        pkg.packageHash,
        pkg.title.trim(),
        pkg.description.trim(),
        JSON.stringify(pkg),
        imageKey,
        tokenHash,
        createdAt,
        expiresAt,
      )
      .run();
  } catch (error) {
    await portalEnv.EDITORIAL_ASSETS.delete(imageKey);
    throw error;
  }

  return {
    id,
    version: pkg.version,
    reviewUrl: `${origin}/review/${token}`,
    expiresAt,
  };
}

export async function dispatchApproval(reviewId: string): Promise<void> {
  const portalEnv = getPortalEnv();
  const token = portalEnv.GITHUB_DISPATCH_TOKEN?.trim();
  const repository =
    portalEnv.GITHUB_REPOSITORY?.trim() || "TomMindset/fuehrungsmandat";
  if (!token) {
    await portalEnv.DB.prepare(
      `UPDATE reviews
       SET dispatch_status = 'scheduled_poll', dispatch_error = NULL
       WHERE id = ?`,
    )
      .bind(reviewId)
      .run();
    return;
  }
  const response = await fetch(
    `https://api.github.com/repos/${repository}/dispatches`,
    {
      method: "POST",
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "User-Agent": "Fuehrungsmandat-Freigabeportal",
        "X-GitHub-Api-Version": "2022-11-28",
      },
      body: JSON.stringify({
        event_type: "fuehrungsmandat-review-approved",
        client_payload: { review_id: reviewId },
      }),
    },
  );
  if (response.ok) {
    await portalEnv.DB.prepare(
      "UPDATE reviews SET dispatch_status = 'sent', dispatch_error = NULL WHERE id = ?",
    )
      .bind(reviewId)
      .run();
    return;
  }
  const detail = `GitHub HTTP ${response.status}`.slice(0, 300);
  await portalEnv.DB.prepare(
    "UPDATE reviews SET dispatch_status = 'failed', dispatch_error = ? WHERE id = ?",
  )
    .bind(detail, reviewId)
    .run();
}

export function jsonError(message: string, status: number): Response {
  return Response.json(
    { error: { message } },
    {
      status,
      headers: {
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    },
  );
}
