import { revalidatePath } from "next/cache";
import { NextResponse, type NextRequest } from "next/server";

import { readSessionCookieValue } from "@/modules/auth/cookies";
import { requireMerchantSession } from "@/modules/auth/guards";
import {
  createLogoUploadFailure,
  createMerchantLogoUploadCore,
  MERCHANT_LOGO_UPLOAD_FAILURE_STATUS,
  MERCHANT_LOGO_UPLOAD_MESSAGES,
  type MerchantLogoUploadResult,
} from "@/modules/merchant/logo-upload-core";
import { merchantService } from "@/modules/merchant/service";
import { getUploadConfig } from "@/modules/uploads/config";
import {
  UPLOAD_ERROR_MESSAGES,
  UPLOAD_FAILURE_STATUS,
} from "@/modules/uploads/service-core";
import { uploadService } from "@/modules/uploads/service";

export const runtime = "nodejs";

const MERCHANT_PANEL_PATH = "/estabelecimento";
const MULTIPART_OVERHEAD_BYTES = 64 * 1024;

export async function POST(request: NextRequest) {
  const sizePrecheck = getContentLengthFailure(request);

  if (sizePrecheck) {
    return logoJson(sizePrecheck);
  }

  let formData: FormData;

  try {
    formData = await request.formData();
  } catch {
    return logoJson(
      createLogoUploadFailure(
        "MALFORMED_MULTIPART",
        MERCHANT_LOGO_UPLOAD_FAILURE_STATUS.MALFORMED_MULTIPART,
        MERCHANT_LOGO_UPLOAD_MESSAGES.MALFORMED_MULTIPART,
      ),
    );
  }

  const core = createMerchantLogoUploadCore({
    merchantService,
    readSessionCookie: readSessionCookieValue,
    requireMerchantSession,
    uploadService,
  });
  const result = await core.uploadMerchantLogo(formData);

  if (!result.ok) {
    return logoJson(result);
  }

  try {
    revalidatePath(MERCHANT_PANEL_PATH);
  } catch {
    return logoJson(
      createLogoUploadFailure(
        "REVALIDATION_FAILED",
        MERCHANT_LOGO_UPLOAD_FAILURE_STATUS.REVALIDATION_FAILED,
        MERCHANT_LOGO_UPLOAD_MESSAGES.REVALIDATION_FAILED,
      ),
    );
  }

  return logoJson(result);
}

function getContentLengthFailure(
  request: NextRequest,
): MerchantLogoUploadResult | null {
  const rawContentLength = request.headers.get("content-length");

  if (!rawContentLength) {
    return null;
  }

  const contentLength = Number(rawContentLength);

  if (!Number.isSafeInteger(contentLength) || contentLength < 0) {
    return createLogoUploadFailure(
      "MALFORMED_MULTIPART",
      MERCHANT_LOGO_UPLOAD_FAILURE_STATUS.MALFORMED_MULTIPART,
      MERCHANT_LOGO_UPLOAD_MESSAGES.MALFORMED_MULTIPART,
    );
  }

  try {
    const config = getUploadConfig();
    const maxMultipartBytes = config.maxBytes + MULTIPART_OVERHEAD_BYTES;

    if (contentLength > maxMultipartBytes) {
      return createLogoUploadFailure(
        "FILE_TOO_LARGE",
        UPLOAD_FAILURE_STATUS.FILE_TOO_LARGE,
        UPLOAD_ERROR_MESSAGES.FILE_TOO_LARGE,
      );
    }
  } catch {
    return createLogoUploadFailure(
      "CONFIG_INVALID",
      UPLOAD_FAILURE_STATUS.CONFIG_INVALID,
      UPLOAD_ERROR_MESSAGES.CONFIG_INVALID,
    );
  }

  return null;
}

function logoJson(result: MerchantLogoUploadResult) {
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
