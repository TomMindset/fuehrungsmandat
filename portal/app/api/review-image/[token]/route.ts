import { getPortalEnv, jsonError, reviewByToken } from "@/lib/editorial";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ token: string }> };

export async function GET(
  _request: Request,
  context: Context,
): Promise<Response> {
  const { token } = await context.params;
  const review = await reviewByToken(token);
  if (!review) return jsonError("Freigabekarte nicht gefunden.", 404);
  const object = await getPortalEnv().EDITORIAL_ASSETS.get(review.image_key);
  if (!object) return jsonError("Freigabekarte nicht gefunden.", 404);
  return new Response(object.body, {
    headers: {
      "Cache-Control": "private, no-store",
      "Content-Type": object.httpMetadata?.contentType || "image/jpeg",
      "Content-Disposition": "inline",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; sandbox",
    },
  });
}
