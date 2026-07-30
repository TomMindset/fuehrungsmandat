import {
  authorizeService,
  ensureSchema,
  getPortalEnv,
  jsonError,
} from "@/lib/editorial";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

export async function GET(
  request: Request,
  context: Context,
): Promise<Response> {
  if (!(await authorizeService(request))) {
    return jsonError("Nicht autorisiert.", 401);
  }
  const { id } = await context.params;
  if (!/^[A-Za-z0-9_-]{8,128}$/u.test(id)) {
    return jsonError("Ungültige Freigabe-ID.", 400);
  }
  await ensureSchema();
  const review = await getPortalEnv()
    .DB.prepare(
      `SELECT id, status, version, content_hash, package_hash, decision_at,
        approved_channels_json, package_json
       FROM reviews WHERE id = ?`,
    )
    .bind(id)
    .first<{
      id: string;
      status: string;
      version: number;
      content_hash: string;
      package_hash: string;
      decision_at: string | null;
      approved_channels_json: string | null;
      package_json: string;
    }>();
  if (!review) return jsonError("Freigabe nicht gefunden.", 404);
  if (review.status !== "approved" || !review.approved_channels_json) {
    return jsonError("Diese Version ist nicht zur Veröffentlichung freigegeben.", 409);
  }
  const publicationResult = await getPortalEnv()
    .DB.prepare(
      `SELECT channel, status, external_id, url, published_at, reason
       FROM publications WHERE review_id = ? ORDER BY channel`,
    )
    .bind(id)
    .all<{
      channel: string;
      status: string;
      external_id: string | null;
      url: string | null;
      published_at: string | null;
      reason: string | null;
    }>();
  return Response.json(
    {
      id: review.id,
      status: review.status,
      version: review.version,
      contentHash: review.content_hash,
      packageHash: review.package_hash,
      approvedAt: review.decision_at,
      approvedChannels: JSON.parse(review.approved_channels_json),
      publications: publicationResult.results.map((publication) => ({
        channel: publication.channel,
        status: publication.status,
        externalId: publication.external_id,
        url: publication.url,
        publishedAt: publication.published_at,
        reason: publication.reason,
      })),
      package: JSON.parse(review.package_json),
    },
    {
      headers: {
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    },
  );
}
