import {
  CHANNELS,
  ensureSchema,
  getPortalEnv,
  jsonError,
  type Channel,
} from "./editorial";
import { constantTimeEqual, randomToken, sha256 } from "./security";

export type PublicationContext = {
  reviewId: string;
  channel: Channel;
};

export function validatePublicationContext(
  id: string,
  channel: string,
): PublicationContext | Response {
  if (!/^[A-Za-z0-9_-]{8,128}$/u.test(id)) {
    return jsonError("Ungültige Freigabe-ID.", 400);
  }
  if (!CHANNELS.includes(channel as Channel)) {
    return jsonError("Ungültiger Veröffentlichungskanal.", 400);
  }
  return { reviewId: id, channel: channel as Channel };
}

export async function claimPublication(
  context: PublicationContext,
  body: {
    version?: unknown;
    contentHash?: unknown;
    packageHash?: unknown;
    workflowRunId?: unknown;
    confirmManualRetry?: unknown;
  },
): Promise<Response> {
  await ensureSchema();
  const portalEnv = getPortalEnv();
  const review = await portalEnv.DB.prepare(
    `SELECT status, version, content_hash, package_hash, approved_channels_json
     FROM reviews WHERE id = ?`,
  )
    .bind(context.reviewId)
    .first<{
      status: string;
      version: number;
      content_hash: string;
      package_hash: string;
      approved_channels_json: string | null;
    }>();
  if (!review) return jsonError("Freigabe nicht gefunden.", 404);
  const approvedChannels = review.approved_channels_json
    ? (JSON.parse(review.approved_channels_json) as Channel[])
    : [];
  if (
    review.status !== "approved" ||
    !approvedChannels.includes(context.channel) ||
    body.version !== review.version ||
    typeof body.contentHash !== "string" ||
    typeof body.packageHash !== "string" ||
    !constantTimeEqual(body.contentHash, review.content_hash) ||
    !constantTimeEqual(body.packageHash, review.package_hash)
  ) {
    return jsonError("Freigabe, Version oder Hash stimmen nicht überein.", 409);
  }
  const workflowRunId =
    typeof body.workflowRunId === "string" ? body.workflowRunId.trim() : "";
  if (!workflowRunId || workflowRunId.length > 200) {
    return jsonError("Workflow-Laufkennung fehlt oder ist ungültig.", 400);
  }

  const publication = await portalEnv.DB.prepare(
    "SELECT status FROM publications WHERE review_id = ? AND channel = ?",
  )
    .bind(context.reviewId, context.channel)
    .first<{ status: string }>();
  if (!publication) {
    return jsonError("Der Kanal ist nicht freigegeben.", 409);
  }
  if (publication.status === "published") {
    return Response.json(
      { status: "already_published" },
      { headers: { "Cache-Control": "no-store" } },
    );
  }
  const confirmManualRetry = body.confirmManualRetry === true;
  if (
    publication.status !== "pending" &&
    !(publication.status === "manual_check_required" && confirmManualRetry)
  ) {
    return jsonError(
      publication.status === "manual_check_required"
        ? "Der Kanal ist bis zur manuellen Prüfung gesperrt."
        : "Der Kanal wurde bereits für einen Veröffentlichungslauf reserviert.",
      409,
    );
  }
  const claimableStatus =
    publication.status === "manual_check_required"
      ? "manual_check_required"
      : "pending";

  const claimToken = randomToken(32);
  const claimTokenHash = await sha256(claimToken);
  const claimedAt = new Date().toISOString();
  const result = await portalEnv.DB.prepare(
    `UPDATE publications
     SET status = 'claimed', claim_token_hash = ?, claimed_at = ?,
       workflow_run_id = ?, reason = NULL
     WHERE review_id = ? AND channel = ? AND status = ?`,
  )
    .bind(
      claimTokenHash,
      claimedAt,
      workflowRunId,
      context.reviewId,
      context.channel,
      claimableStatus,
    )
    .run();
  if (!result.meta.changes) {
    return jsonError("Der Kanal wurde bereits parallel reserviert.", 409);
  }
  return Response.json(
    { status: "claimed", claimToken },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function completePublication(
  context: PublicationContext,
  body: {
    claimToken?: unknown;
    externalId?: unknown;
    url?: unknown;
    publishedAt?: unknown;
  },
): Promise<Response> {
  const claim = await verifiedClaim(context, body.claimToken);
  if (claim instanceof Response) return claim;
  const externalId =
    typeof body.externalId === "string" ? body.externalId.trim() : "";
  const url = typeof body.url === "string" ? body.url.trim() : "";
  const publishedAt =
    typeof body.publishedAt === "string" ? body.publishedAt.trim() : "";
  if (
    !externalId ||
    externalId.length > 500 ||
    !publishedAt ||
    !Number.isFinite(Date.parse(publishedAt))
  ) {
    return jsonError("Veröffentlichungsnachweis ist unvollständig.", 400);
  }
  if (url) {
    try {
      const parsed = new URL(url);
      if (parsed.protocol !== "https:") throw new Error("not https");
    } catch {
      return jsonError("Die Beitrags-URL ist ungültig.", 400);
    }
  }
  const result = await getPortalEnv()
    .DB.prepare(
      `UPDATE publications
       SET status = 'published', external_id = ?, url = ?, published_at = ?,
         claim_token_hash = NULL, reason = NULL
       WHERE review_id = ? AND channel = ? AND status = 'claimed'
         AND claim_token_hash = ?`,
    )
    .bind(
      externalId,
      url || null,
      new Date(publishedAt).toISOString(),
      context.reviewId,
      context.channel,
      claim.hash,
    )
    .run();
  if (!result.meta.changes) {
    return jsonError("Der Claim ist nicht mehr gültig.", 409);
  }
  return Response.json(
    { status: "published" },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function flagManualCheck(
  context: PublicationContext,
  body: { claimToken?: unknown; reason?: unknown },
): Promise<Response> {
  const claim = await verifiedClaim(context, body.claimToken);
  if (claim instanceof Response) return claim;
  const reason = typeof body.reason === "string" ? body.reason.trim() : "";
  if (!reason || reason.length > 1_000) {
    return jsonError("Ein Prüfgrund bis 1.000 Zeichen ist erforderlich.", 400);
  }
  const result = await getPortalEnv()
    .DB.prepare(
      `UPDATE publications
       SET status = 'manual_check_required', reason = ?, claim_token_hash = NULL
       WHERE review_id = ? AND channel = ? AND status = 'claimed'
         AND claim_token_hash = ?`,
    )
    .bind(reason, context.reviewId, context.channel, claim.hash)
    .run();
  if (!result.meta.changes) {
    return jsonError("Der Claim ist nicht mehr gültig.", 409);
  }
  return Response.json(
    { status: "manual_check_required" },
    { headers: { "Cache-Control": "no-store" } },
  );
}

async function verifiedClaim(
  context: PublicationContext,
  rawToken: unknown,
): Promise<{ hash: string } | Response> {
  await ensureSchema();
  if (
    typeof rawToken !== "string" ||
    !/^[A-Za-z0-9_-]{32,128}$/u.test(rawToken)
  ) {
    return jsonError("Ungültiger Claim-Token.", 400);
  }
  const hash = await sha256(rawToken);
  const result = await getPortalEnv()
    .DB.prepare(
      `SELECT status, claim_token_hash FROM publications
       WHERE review_id = ? AND channel = ?`,
    )
    .bind(context.reviewId, context.channel)
    .first<{ status: string; claim_token_hash: string | null }>();
  if (
    !result ||
    result.status !== "claimed" ||
    !result.claim_token_hash ||
    !constantTimeEqual(hash, result.claim_token_hash)
  ) {
    return jsonError("Der Claim ist ungültig oder abgelaufen.", 409);
  }
  return { hash };
}
