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
    messageId?: unknown;
    status?: unknown;
  } | null;
  if (
    body?.status !== "sent" ||
    typeof body.messageId !== "string" ||
    body.messageId.trim().length < 1 ||
    body.messageId.length > 500
  ) {
    return jsonError("Ungültiger Versandstatus.", 400);
  }
  await ensureSchema();
  const result = await getPortalEnv()
    .DB.prepare(
      "UPDATE reviews SET mail_status = 'sent', mail_message_id = ? WHERE id = ?",
    )
    .bind(body.messageId.trim(), id)
    .run();
  if (!result.meta.changes) return jsonError("Freigabe nicht gefunden.", 404);
  return Response.json(
    { id, status: "sent" },
    { headers: { "Cache-Control": "no-store" } },
  );
}
