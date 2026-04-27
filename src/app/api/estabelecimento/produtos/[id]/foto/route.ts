import { revalidatePath } from "next/cache";
import { NextResponse, type NextRequest } from "next/server";

import { readSessionCookieValue } from "@/modules/auth/cookies";
import { requireMerchantSession } from "@/modules/auth/guards";
import {
  createProductPhotoUploadCore,
  createProductPhotoUploadFailure,
  getProductPhotoContentLengthSizeFailure,
  parseProductPhotoContentLength,
  PRODUCT_PHOTO_UPLOAD_FAILURE_STATUS,
  PRODUCT_PHOTO_UPLOAD_MESSAGES,
  type ProductPhotoUploadResult,
} from "@/modules/products/photo-upload-core";
import { productService } from "@/modules/products/service";
import { getUploadConfig } from "@/modules/uploads/config";
import {
  UPLOAD_ERROR_MESSAGES,
  UPLOAD_FAILURE_STATUS,
} from "@/modules/uploads/service-core";
import { uploadService } from "@/modules/uploads/service";

export const runtime = "nodejs";

type ProductPhotoRouteContext = {
  params: Promise<{ id: string }>;
};

export async function POST(
  request: NextRequest,
  context: ProductPhotoRouteContext,
) {
  const sizePrecheck = getContentLengthFailure(request);

  if (sizePrecheck) {
    return productPhotoJson(sizePrecheck);
  }

  let formData: FormData;

  try {
    formData = await request.formData();
  } catch {
    return productPhotoJson(
      createProductPhotoUploadFailure(
        "MALFORMED_MULTIPART",
        PRODUCT_PHOTO_UPLOAD_FAILURE_STATUS.MALFORMED_MULTIPART,
        PRODUCT_PHOTO_UPLOAD_MESSAGES.MALFORMED_MULTIPART,
      ),
    );
  }

  const { id: productId } = await context.params;
  const core = createProductPhotoUploadCore({
    productService,
    readSessionCookie: readSessionCookieValue,
    requireMerchantSession,
    revalidatePath,
    uploadService,
  });
  const result = await core.uploadProductPhoto(productId, formData);

  return productPhotoJson(result);
}

function getContentLengthFailure(
  request: NextRequest,
): ProductPhotoUploadResult | null {
  const parsedContentLength = parseProductPhotoContentLength(
    request.headers.get("content-length"),
  );

  if (!parsedContentLength.ok) {
    return parsedContentLength.failure;
  }

  if (parsedContentLength.contentLength === null) {
    return null;
  }

  try {
    const config = getUploadConfig();

    return getProductPhotoContentLengthSizeFailure(
      parsedContentLength.contentLength,
      config.maxBytes,
    );
  } catch {
    return createProductPhotoUploadFailure(
      "CONFIG_INVALID",
      UPLOAD_FAILURE_STATUS.CONFIG_INVALID,
      UPLOAD_ERROR_MESSAGES.CONFIG_INVALID,
    );
  }
}

function productPhotoJson(result: ProductPhotoUploadResult) {
  if (!result.ok) {
    return NextResponse.json(
      {
        ok: false,
        code: result.code,
        message: result.message,
      },
      { status: result.status },
    );
  }

  return NextResponse.json(
    {
      ok: true,
      code: result.code,
      message: result.message,
      data: result.data,
    },
    { status: result.status },
  );
}
