import { NextResponse, type NextRequest } from "next/server";

import { getUploadService } from "@/modules/uploads/service";
import {
  UPLOAD_ERROR_MESSAGES,
  UPLOAD_FAILURE_STATUS,
  type UploadFailureCode,
} from "@/modules/uploads/service-core";

export const runtime = "nodejs";

const SAFE_UPLOAD_HEADERS = {
  "X-Content-Type-Options": "nosniff",
} as const;
const SAFE_SCOPE_SEGMENT_PATTERN = /^[0-9A-Za-z][0-9A-Za-z_-]{0,127}$/u;
const SAFE_FILENAME_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(png|jpg|webp)$/iu;

type UploadRouteContext = {
  params: Promise<{ path?: string[] }>;
};

export async function GET(_request: NextRequest, context: UploadRouteContext) {
  const { path } = await context.params;
  const relativePath = toSafeRelativePath(path);

  if (!relativePath) {
    return uploadFailureJson("PATH_TRAVERSAL");
  }

  try {
    const result = await getUploadService().readStoredImage(relativePath);

    if (!result.ok) {
      return uploadFailureJson(result.code);
    }

    const body = new Blob([result.data.bytes as BlobPart], {
      type: result.data.mediaType,
    });

    return new NextResponse(body, {
      headers: {
        ...SAFE_UPLOAD_HEADERS,
        "Cache-Control": "public, max-age=31536000, immutable",
        "Content-Length": String(result.data.sizeBytes),
        "Content-Type": result.data.mediaType,
      },
      status: 200,
    });
  } catch {
    return uploadFailureJson("CONFIG_INVALID");
  }
}

function toSafeRelativePath(pathSegments: string[] | undefined) {
  if (!pathSegments || pathSegments.length < 2) {
    return null;
  }

  const filename = pathSegments.at(-1);
  const scopeSegments = pathSegments.slice(0, -1);

  if (!filename || !SAFE_FILENAME_PATTERN.test(filename)) {
    return null;
  }

  if (!scopeSegments.every(isSafeScopeSegment)) {
    return null;
  }

  return [...scopeSegments, filename.toLowerCase()].join("/");
}

function isSafeScopeSegment(segment: string) {
  return (
    segment.trim() === segment &&
    SAFE_SCOPE_SEGMENT_PATTERN.test(segment) &&
    segment !== "." &&
    segment !== ".."
  );
}

function uploadFailureJson(code: UploadFailureCode) {
  return NextResponse.json(
    {
      ok: false,
      code,
      message: UPLOAD_ERROR_MESSAGES[code],
    },
    {
      headers: SAFE_UPLOAD_HEADERS,
      status: UPLOAD_FAILURE_STATUS[code],
    },
  );
}
