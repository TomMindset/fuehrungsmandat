import {
  authorizeService,
  ensureSchema,
  getPortalEnv,
  jsonError,
} from "@/lib/editorial";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

export async function POST(
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
  const body = (await request.json().catch(() => null)) as {
    confirmNoExternalPublication?: unknown;
    reason?: unknown;
  } | null;
  const reason = typeof body?.reason === "string" ? body.reason.trim() : "";
  if (
    body?.confirmNoExternalPublication !== true ||
    reason.length < 10 ||
    reason.length > 1_000
  ) {
    return jsonError(
      "Archivierung verlangt Bestätigung und einen nachvollziehbaren Grund.",
      400,
    );
  }

  await ensureSchema();
  const portalEnv = getPortalEnv();
  const review = await portalEnv.DB.prepare(
    "SELECT status FROM reviews WHERE id = ?",
  )
    .bind(id)
    .first<{ status: string }>();
  if (!review) return jsonError("Freigabe nicht gefunden.", 404);
  if (review.status === "archived") {
    return Response.json(
      { id, status: "archived", archivedPublications: 0 },
      { headers: { "Cache-Control": "no-store" } },
    );
  }
  if (review.status !== "approved") {
    return jsonError(
      "Nur eine freigegebene, noch nicht gestartete Version kann archiviert werden.",
      409,
    );
  }

  const summary = await portalEnv.DB.prepare(
    `SELECT COUNT(*) AS total,
      SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) AS pending
     FROM publications WHERE review_id = ?`,
  )
    .bind(id)
    .first<{ total: number; pending: number | null }>();
  const total = Number(summary?.total || 0);
  const pending = Number(summary?.pending || 0);
  if (total < 1 || pending !== total) {
    return jsonError(
      "Die Freigabe wurde bereits beansprucht oder veröffentlicht und darf nicht archiviert werden.",
      409,
    );
  }

  const [publicationResult, reviewResult] = await portalEnv.DB.batch([
    portalEnv.DB.prepare(
      `UPDATE publications
       SET status = 'archived', reason = ?, claim_token_hash = NULL,
         claimed_at = NULL, workflow_run_id = NULL
       WHERE review_id = ? AND status = 'pending'
         AND EXISTS (
           SELECT 1 FROM reviews
           WHERE id = ? AND status = 'approved'
         )
         AND NOT EXISTS (
           SELECT 1 FROM publications locked
           WHERE locked.review_id = ? AND locked.status <> 'pending'
         )`,
    ).bind(reason, id, id, id),
    portalEnv.DB.prepare(
      `UPDATE reviews
       SET status = 'archived', dispatch_status = 'archived',
         dispatch_error = NULL
       WHERE id = ? AND status = 'approved'
         AND NOT EXISTS (
           SELECT 1 FROM publications
           WHERE review_id = ? AND status <> 'archived'
         )`,
    ).bind(id, id),
  ]);

  if (
    Number(publicationResult.meta.changes || 0) !== total ||
    Number(reviewResult.meta.changes || 0) !== 1
  ) {
    return jsonError(
      "Die Freigabe wurde parallel verändert und nicht vollständig archiviert.",
      409,
    );
  }

  return Response.json(
    { id, status: "archived", archivedPublications: total },
    {
      headers: {
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    },
  );
}
