import {
  authorizeService,
  createReview,
  jsonError,
  validatePackage,
  verifyPackageHash,
} from "@/lib/editorial";
import { jpegDimensions } from "@/lib/security";

export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  if (!(await authorizeService(request))) {
    return jsonError("Nicht autorisiert.", 401);
  }

  try {
    const form = await request.formData();
    const packageValue = form.get("package");
    const imageValue = form.get("image");
    if (typeof packageValue !== "string" || !(imageValue instanceof File)) {
      return jsonError("Freigabepaket und Bilddatei sind erforderlich.", 400);
    }
    if (
      imageValue.type !== "image/jpeg" ||
      imageValue.size < 10_000 ||
      imageValue.size > 5_000_000
    ) {
      return jsonError("Die Freigabekarte muss ein JPEG bis 5 MB sein.", 400);
    }

    const pkg = validatePackage(JSON.parse(packageValue));
    if (!(await verifyPackageHash(pkg))) {
      return jsonError("Der Paket-Hash stimmt nicht mit dem Inhalt überein.", 400);
    }

    const image = new Uint8Array(await imageValue.arrayBuffer());
    const dimensions = jpegDimensions(image);
    if (dimensions?.width !== 1080 || dimensions.height !== 1350) {
      return jsonError(
        "Die Freigabekarte muss exakt 1080 × 1350 Pixel groß sein.",
        400,
      );
    }

    const origin = new URL(request.url).origin;
    return Response.json(await createReview(pkg, image, origin), {
      status: 201,
      headers: {
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    const message =
      error instanceof SyntaxError
        ? "Das Freigabepaket enthält kein gültiges JSON."
        : error instanceof Error
          ? error.message
          : "Die Freigabe konnte nicht angelegt werden.";
    return jsonError(message, 400);
  }
}
