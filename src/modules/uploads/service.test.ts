import { describe, expect, it } from "vitest";

import {
  UploadConfigError,
  parseUploadConfig,
  type UploadConfig,
} from "./config";
import {
  createUploadServiceCore,
  type UploadFailure,
  type UploadResult,
  type UploadStorage,
} from "./service-core";

const UUID = "11111111-1111-4111-8111-111111111111";
const PNG_BYTES = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=",
  "base64",
);
const JPEG_BYTES = Buffer.from([
  0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01,
  0x01, 0x01, 0x00, 0x48, 0x00, 0x48, 0x00, 0x00, 0xff, 0xd9,
]);
const WEBP_BYTES = Buffer.from([
  0x52, 0x49, 0x46, 0x46, 0x1a, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50,
  0x56, 0x50, 0x38, 0x20, 0x0e, 0x00, 0x00, 0x00,
]);
const GIF_BYTES = Buffer.from("GIF89a fake image body", "utf8");
const SVG_BYTES = Buffer.from("<svg><script>alert(1)</script></svg>", "utf8");
const TEXT_BYTES = Buffer.from("not actually a png", "utf8");

const validConfig: UploadConfig = {
  driver: "local",
  uploadDir: "/safe/upload-root",
  publicBasePath: "/uploads",
  publicBaseUrl: "https://cdn.example.test/uploads",
  maxBytes: 1024,
};

describe("parseUploadConfig", () => {
  it("parses upload env with local defaults from .env.example", () => {
    expect(parseUploadConfig({})).toEqual({
      driver: "local",
      uploadDir: "./uploads",
      publicBasePath: "/uploads",
      publicBaseUrl: "http://localhost:3000/uploads",
      maxBytes: 5_242_880,
    });

    expect(
      parseUploadConfig({
        UPLOAD_DRIVER: " local ",
        UPLOAD_DIR: " ./var/uploads ",
        UPLOAD_PUBLIC_BASE_URL: "https://cdn.example.test/uploads/",
        UPLOAD_MAX_BYTES: "2048",
      }),
    ).toEqual({
      driver: "local",
      uploadDir: "./var/uploads",
      publicBasePath: "/uploads",
      publicBaseUrl: "https://cdn.example.test/uploads",
      maxBytes: 2048,
    });
  });

  it("reports invalid upload config by key name only", () => {
    const secretLikePath = "/srv/uploads/DATABASE_URL/password";

    try {
      parseUploadConfig({
        UPLOAD_DRIVER: "s3",
        UPLOAD_DIR: " ",
        UPLOAD_PUBLIC_BASE_URL: "ftp://example.test/private",
        UPLOAD_MAX_BYTES: "0",
        LEAK_SENTINEL: secretLikePath,
      });
    } catch (error) {
      expect(error).toBeInstanceOf(UploadConfigError);
      const message = (error as Error).message;
      expect(message).toContain("UPLOAD_DRIVER");
      expect(message).toContain("UPLOAD_DIR");
      expect(message).toContain("UPLOAD_PUBLIC_BASE_URL");
      expect(message).toContain("UPLOAD_MAX_BYTES");
      expect(message).not.toContain("s3");
      expect(message).not.toContain("ftp://example.test/private");
      expect(message).not.toContain(secretLikePath);
      return;
    }

    throw new Error("Expected invalid upload configuration to throw.");
  });
});

describe("upload service core", () => {
  it("stores valid PNG images under scoped UUID filenames and builds stable public URLs", async () => {
    const storage = createFakeStorage();
    const service = createTestUploadService(storage);

    const stored = expectOk(
      await service.storeImage({
        bytes: PNG_BYTES,
        clientMimeType: "image/png",
        originalFilename: "../../evil-logo.png",
        scope: ["establishments", "est-a", "logos"],
      }),
    );

    expect(stored).toEqual({
      relativePath: `establishments/est-a/logos/${UUID}.png`,
      publicPath: `/uploads/establishments/est-a/logos/${UUID}.png`,
      publicUrl: `https://cdn.example.test/uploads/establishments/est-a/logos/${UUID}.png`,
      mediaType: "image/png",
      extension: "png",
      sizeBytes: PNG_BYTES.byteLength,
    });
    expect(storage.writes).toEqual([
      {
        relativePath: `establishments/est-a/logos/${UUID}.png`,
        bytes: PNG_BYTES,
      },
    ]);
    expect(JSON.stringify(stored)).not.toContain("evil-logo");
    expect(JSON.stringify(stored)).not.toContain("..");
  });

  it("accepts JPEG and WebP magic bytes without trusting client extensions", async () => {
    const storage = createFakeStorage();
    const service = createTestUploadService(storage);

    const jpg = expectOk(
      await service.storeImage({
        bytes: JPEG_BYTES,
        clientMimeType: "image/jpeg",
        originalFilename: "foto.png",
        scope: "products/prod-a/photos",
      }),
    );
    const webp = expectOk(
      await service.storeImage({
        bytes: WEBP_BYTES,
        clientMimeType: "image/webp",
        originalFilename: "foto.jpeg",
        scope: "products/prod-a/photos",
      }),
    );

    expect(jpg.relativePath).toBe(`products/prod-a/photos/${UUID}.jpg`);
    expect(webp.relativePath).toBe(`products/prod-a/photos/${UUID}.webp`);
  });

  it("rejects empty and oversized files before storage", async () => {
    const storage = createFakeStorage();
    const service = createTestUploadService(storage, { maxBytes: 8 });

    expectFailure(
      await service.storeImage({
        bytes: Buffer.alloc(0),
        clientMimeType: "image/png",
        scope: "establishments/est-a/logos",
      }),
      "EMPTY_FILE",
    );
    expectFailure(
      await service.storeImage({
        bytes: Buffer.alloc(9),
        clientMimeType: "image/png",
        scope: "establishments/est-a/logos",
      }),
      "FILE_TOO_LARGE",
    );
    expect(storage.writes).toEqual([]);
  });

  it("rejects MIME spoofing, unsupported images, and client MIME mismatches", async () => {
    const service = createTestUploadService(createFakeStorage());

    expectFailure(
      await service.storeImage({
        bytes: TEXT_BYTES,
        clientMimeType: "image/png",
        originalFilename: "fake.png",
        scope: "establishments/est-a/logos",
      }),
      "UNSUPPORTED_MIME",
    );
    expectFailure(
      await service.storeImage({
        bytes: GIF_BYTES,
        clientMimeType: "image/gif",
        originalFilename: "animated.gif",
        scope: "establishments/est-a/logos",
      }),
      "UNSUPPORTED_MIME",
    );
    expectFailure(
      await service.storeImage({
        bytes: SVG_BYTES,
        clientMimeType: "image/svg+xml",
        originalFilename: "vector.svg",
        scope: "establishments/est-a/logos",
      }),
      "UNSUPPORTED_MIME",
    );
    expectFailure(
      await service.storeImage({
        bytes: PNG_BYTES,
        clientMimeType: "image/jpeg",
        originalFilename: "mismatch.jpg",
        scope: "establishments/est-a/logos",
      }),
      "CLIENT_MIME_MISMATCH",
    );
  });

  it("rejects traversal in scoped paths and rollback delete paths before disk access", async () => {
    const storage = createFakeStorage();
    const service = createTestUploadService(storage);

    expectFailure(
      await service.storeImage({
        bytes: PNG_BYTES,
        clientMimeType: "image/png",
        scope: "../establishments/est-a/logos",
      }),
      "PATH_TRAVERSAL",
    );
    expectFailure(
      await service.storeImage({
        bytes: PNG_BYTES,
        clientMimeType: "image/png",
        scope: ["establishments", "..", "logos"],
      }),
      "PATH_TRAVERSAL",
    );
    expectFailure(await service.deleteStoredFile("../escape.png"), "PATH_TRAVERSAL");
    expectFailure(
      await service.readStoredImage(
        `establishments/est-a/logos/${UUID}.gif`,
      ),
      "PATH_TRAVERSAL",
    );
    expect(storage.writes).toEqual([]);
    expect(storage.deletes).toEqual([]);
  });

  it("reads and deletes stored files for rollback through the safe relative path", async () => {
    const storage = createFakeStorage();
    const service = createTestUploadService(storage);
    const stored = expectOk(
      await service.storeImage({
        bytes: PNG_BYTES,
        clientMimeType: "image/png",
        scope: "establishments/est-a/logos",
      }),
    );

    const read = expectOk(await service.readStoredImage(stored.relativePath));
    const deleted = expectOk(await service.deleteStoredFile(stored.relativePath));

    expect(read).toEqual({
      bytes: PNG_BYTES,
      mediaType: "image/png",
      sizeBytes: PNG_BYTES.byteLength,
    });
    expect(deleted).toEqual({ deleted: true });
    expect(storage.deletes).toEqual([stored.relativePath]);
    expect(storage.files.has(stored.relativePath)).toBe(false);
  });

  it("returns safe storage failures without leaking filesystem details", async () => {
    const failingWrite = createFakeStorage({ failWrite: true });
    const failingDelete = createFakeStorage({ failDelete: true });
    const writeService = createTestUploadService(failingWrite);
    const deleteService = createTestUploadService(failingDelete);

    const writeFailure = expectFailure(
      await writeService.storeImage({
        bytes: PNG_BYTES,
        clientMimeType: "image/png",
        scope: "establishments/est-a/logos",
      }),
      "STORAGE_ERROR",
    );
    const deleteFailure = expectFailure(
      await deleteService.deleteStoredFile(
        `establishments/est-a/logos/${UUID}.png`,
      ),
      "STORAGE_ERROR",
    );

    for (const failure of [writeFailure, deleteFailure]) {
      expect(JSON.stringify(failure)).not.toContain("/safe/upload-root");
      expect(JSON.stringify(failure)).not.toContain("DATABASE_URL");
      expect(JSON.stringify(failure)).not.toContain("EACCES");
    }
  });
});

type FakeStorage = UploadStorage & {
  deletes: string[];
  files: Map<string, Uint8Array>;
  writes: Array<{ relativePath: string; bytes: Uint8Array }>;
};

type FakeStorageOptions = {
  failDelete?: boolean;
  failWrite?: boolean;
};

function createTestUploadService(
  storage: FakeStorage,
  configOverrides: Partial<UploadConfig> = {},
) {
  return createUploadServiceCore({
    config: { ...validConfig, ...configOverrides },
    detectFileType: detectFixtureType,
    randomUUID: () => UUID,
    storage,
  });
}

function createFakeStorage(options: FakeStorageOptions = {}): FakeStorage {
  const files = new Map<string, Uint8Array>();
  const writes: FakeStorage["writes"] = [];
  const deletes: string[] = [];

  return {
    deletes,
    files,
    writes,
    async deleteFile(relativePath) {
      deletes.push(relativePath);

      if (options.failDelete) {
        throw new Error("EACCES /safe/upload-root DATABASE_URL");
      }

      files.delete(relativePath);
    },
    async readFile(relativePath) {
      const bytes = files.get(relativePath);

      if (!bytes) {
        throw Object.assign(new Error("ENOENT /safe/upload-root DATABASE_URL"), {
          code: "ENOENT",
        });
      }

      return bytes;
    },
    async writeFile(relativePath, bytes) {
      if (options.failWrite) {
        throw new Error("EACCES /safe/upload-root DATABASE_URL");
      }

      writes.push({ relativePath, bytes });
      files.set(relativePath, bytes);
    },
  };
}

async function detectFixtureType(bytes: Uint8Array) {
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47])) {
    return { ext: "png", mime: "image/png" };
  }

  if (startsWith(bytes, [0xff, 0xd8, 0xff])) {
    return { ext: "jpg", mime: "image/jpeg" };
  }

  if (
    startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return { ext: "webp", mime: "image/webp" };
  }

  if (startsWith(bytes, [0x47, 0x49, 0x46])) {
    return { ext: "gif", mime: "image/gif" };
  }

  return undefined;
}

function startsWith(bytes: Uint8Array, prefix: readonly number[]) {
  return prefix.every((byte, index) => bytes[index] === byte);
}

function expectOk<TData>(result: UploadResult<TData>) {
  expect(result.ok).toBe(true);

  if (!result.ok) {
    throw new Error(`Expected success, got ${result.code}`);
  }

  return result.data;
}

function expectFailure<TData>(
  result: UploadResult<TData>,
  code: UploadFailure["code"],
) {
  expect(result.ok).toBe(false);

  if (result.ok) {
    throw new Error("Expected failure, got success.");
  }

  expect(result.code).toBe(code);
  expect(result.message).not.toContain("DATABASE_URL");
  expect(result.message).not.toContain("/safe/upload-root");
  expect(result.message).not.toContain("Prisma");
  expect(result.message).not.toContain("Error:");

  return result;
}
