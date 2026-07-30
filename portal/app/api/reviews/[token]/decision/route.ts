import {
  CHANNELS,
  dispatchApproval,
  getPortalEnv,
  jsonError,
  reviewByToken,
  type Channel,
} from "@/lib/editorial";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ token: string }> };
type Decision = "approved" | "changes_requested" | "rejected";

export async function POST(
  request: Request,
  context: Context,
): Promise<Response> {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) {
    return jsonError("Ungültiger Ursprung.", 403);
  }
  const { token } = await context.params;
  const review = await reviewByToken(token);
  if (!review) return jsonError("Freigabelink nicht gefunden.", 404);
  if (review.status !== "pending") {
    return jsonError("Für diese Version wurde bereits entschieden.", 409);
  }

  const body = (await request.json().catch(() => null)) as {
    decision?: unknown;
    channels?: unknown;
    note?: unknown;
  } | null;
  const decision = body?.decision as Decision;
  if (!["approved", "changes_requested", "rejected"].includes(decision)) {
    return jsonError("Ungültige Entscheidung.", 400);
  }
  const note = typeof body?.note === "string" ? body.note.trim() : "";
  if (note.length > 1_000) {
    return jsonError("Der Hinweis darf höchstens 1.000 Zeichen enthalten.", 400);
  }

  const pkg = JSON.parse(review.package_json) as {
    availableChannels: Channel[];
  };
  let channels: Channel[] = [];
  if (decision === "approved") {
    if (
      !Array.isArray(body?.channels) ||
      body.channels.length === 0 ||
      body.channels.some(
        (channel) =>
          typeof channel !== "string" ||
          !CHANNELS.includes(channel as Channel) ||
          !pkg.availableChannels.includes(channel as Channel),
      )
    ) {
      return jsonError("Die Kanalauswahl ist ungültig.", 400);
    }
    channels = [...new Set(body.channels as Channel[])];
    if (!channels.includes("website")) {
      return jsonError(
        "Die Website muss für jede Social-Veröffentlichung freigegeben sein.",
        400,
      );
    }
  }

  const decidedAt = new Date().toISOString();
  const portalEnv = getPortalEnv();
  const updated = await portalEnv.DB.prepare(
    `UPDATE reviews
     SET status = ?, approved_channels_json = ?, decision_note = ?, decision_at = ?
     WHERE id = ? AND status = 'pending'`,
  )
    .bind(
      decision,
      decision === "approved" ? JSON.stringify(channels) : null,
      note || null,
      decidedAt,
      review.id,
    )
    .run();
  if (!updated.meta.changes) {
    return jsonError("Die Freigabe wurde bereits parallel entschieden.", 409);
  }

  if (decision === "approved") {
    await portalEnv.DB.batch(
      channels.map((channel) =>
        portalEnv.DB.prepare(
          `INSERT OR IGNORE INTO publications (review_id, channel, status)
           VALUES (?, ?, 'pending')`,
        ).bind(review.id, channel),
      ),
    );
    try {
      await dispatchApproval(review.id);
    } catch (error) {
      await portalEnv.DB.prepare(
        "UPDATE reviews SET dispatch_status = 'failed', dispatch_error = ? WHERE id = ?",
      )
        .bind(
          error instanceof Error
            ? error.message.slice(0, 300)
            : "Unbekannter Dispatch-Fehler",
          review.id,
        )
        .run();
    }
  }

  return Response.json(
    {
      id: review.id,
      status: decision,
      approvedChannels: channels,
      decidedAt,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
