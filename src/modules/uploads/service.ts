import "server-only";

import { randomUUID } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import { fileTypeFromBuffer } from "file-type";

import { getUploadConfig, type UploadConfig } from "./config";
import {
  createUploadServiceCore,
  validateUploadRelativePath,
  type UploadStorage,
} from "./service-core";

export class UploadStoragePathError extends Error {
  constructor() {
    super("Caminho de upload inválido.");
    this.name = "UploadStoragePathError";
  }
}

export function createLocalUploadStorage(uploadDir: string): UploadStorage {
  const uploadRoot = path.resolve(uploadDir);

  if (uploadDir.trim().length === 0) {
    throw new UploadStoragePathError();
  }

  return {
    async deleteFile(relativePath) {
      const targetPath = resolvePathUnderUploadRoot(uploadRoot, relativePath);
      await rm(targetPath);
    },
    async readFile(relativePath) {
      const targetPath = resolvePathUnderUploadRoot(uploadRoot, relativePath);
      return readFile(targetPath);
    },
    async writeFile(relativePath, bytes) {
      const targetPath = resolvePathUnderUploadRoot(uploadRoot, relativePath);
      await mkdir(path.dirname(targetPath), { recursive: true });
      await writeFile(targetPath, bytes, { flag: "wx" });
    },
  };
}

export function createUploadService(config: UploadConfig = getUploadConfig()) {
  return createUploadServiceCore({
    config,
    detectFileType: fileTypeFromBuffer,
    randomUUID,
    storage: createLocalUploadStorage(config.uploadDir),
  });
}

let uploadServiceSingleton: ReturnType<typeof createUploadService> | null = null;

export function getUploadService() {
  uploadServiceSingleton ??= createUploadService();

  return uploadServiceSingleton;
}

export const uploadService = {
  deleteStoredFile(relativePath) {
    return getUploadService().deleteStoredFile(relativePath);
  },
  readStoredImage(relativePath) {
    return getUploadService().readStoredImage(relativePath);
  },
  storeImage(input) {
    return getUploadService().storeImage(input);
  },
} satisfies ReturnType<typeof createUploadService>;

function resolvePathUnderUploadRoot(uploadRoot: string, relativePath: string) {
  const parsedPath = validateUploadRelativePath(relativePath);

  if (!parsedPath.ok) {
    throw new UploadStoragePathError();
  }

  const targetPath = path.resolve(uploadRoot, parsedPath.data.relativePath);

  if (!isPathInside(uploadRoot, targetPath)) {
    throw new UploadStoragePathError();
  }

  return targetPath;
}

function isPathInside(rootPath: string, targetPath: string) {
  const relativePath = path.relative(rootPath, targetPath);

  return (
    relativePath.length === 0 ||
    (!relativePath.startsWith("..") && !path.isAbsolute(relativePath))
  );
}
