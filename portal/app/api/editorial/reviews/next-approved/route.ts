import {
  authorizeService,
  ensureSchema,
  getPortalEnv,
  jsonError,
} from "@/lib/editorial";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  if (!(await authorizeService(request))) {
    return jsonError("Nicht autorisiert.", 401);
  }
  await ensureSchema();
  const review = await getPortalEnv()
    .DB.prepare(
      `SELECT r.id
       FROM reviews r
       WHERE r.status = 'approved'
         AND EXISTS (
           SELECT 1
           FROM publications p
           WHERE p.review_id = r.id
             AND p.status = 'pending'
         )
       ORDER BY r.decision_at ASC, r.created_at ASC
       LIMIT 1`,
    )
    .first<{ id: string }>();

  if (!review) {
    return new Response(null, {
      status: 204,
      headers: { "Cache-Control": "no-store" },
    });
  }
  return Response.json(review, {
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
