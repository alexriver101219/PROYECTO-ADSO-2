import { mkdir } from "node:fs/promises";
import { basename, extname } from "node:path";
import { randomUUID } from "node:crypto";

export const ALLOWED_ATTACHMENT_MIME_TYPES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
]);

export async function ensureDirectory(path: string) {
  await mkdir(path, { recursive: true });
}

export function sanitizeFilename(filename: string) {
  return basename(filename).replace(/[^a-zA-Z0-9._-]/g, "_");
}

export function buildStoredFilename(requestId: string, originalName: string) {
  const extension = extname(originalName);
  return `${requestId}-${randomUUID()}${extension}`;
}
