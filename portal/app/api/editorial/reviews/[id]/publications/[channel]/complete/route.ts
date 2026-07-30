import { authorizeService, jsonError } from "@/lib/editorial";
import {
  completePublication,
  validatePublicationContext,
} from "@/lib/publication";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string; channel: string }> };

export async function POST(
  request: Request,
  routeContext: Context,
): Promise<Response> {
  if (!(await authorizeService(request))) {
    return jsonError("Nicht autorisiert.", 401);
  }
  const params = await routeContext.params;
  const context = validatePublicationContext(params.id, params.channel);
  if (context instanceof Response) return context;
  const body = await request.json().catch(() => ({}));
  return completePublication(context, body);
}
