import { access } from "node:fs/promises";
import { createReadStream, createWriteStream } from "node:fs";
import { join } from "node:path";
import { pipeline } from "node:stream/promises";

import type { FastifyPluginAsync } from "fastify";
import { Role } from "@prisma/client";

import {
  ALLOWED_ATTACHMENT_MIME_TYPES,
  buildStoredFilename,
  sanitizeFilename,
} from "../../lib/files";
import { AppError } from "../../lib/errors";
import { attachmentSchema } from "../requests/schemas";
import { serializeAttachment } from "../requests/serializers";

interface RequestParams {
  id: string;
}

interface AttachmentParams {
  id: string;
}

const attachmentSelect = {
  id: true,
  requestId: true,
  originalName: true,
  mimeType: true,
  size: true,
  createdAt: true,
  uploadedBy: {
    select: {
      id: true,
      name: true,
      email: true,
    },
  },
} as const;

const errorSchema = {
  type: "object",
  required: ["message"],
  properties: {
    message: { type: "string" },
    code: { type: "string" },
    details: {},
  },
} as const;

export const attachmentRoutes: FastifyPluginAsync = async (app) => {
  app.post<{ Params: RequestParams }>(
    "/requests/:id/attachments",
    {
      preHandler: app.requireAdmin,
      schema: {
        consumes: ["multipart/form-data"],
        tags: ["attachments"],
        summary: "Upload an attachment to a request",
        security: [{ bearerAuth: [] }],
        params: {
          type: "object",
          required: ["id"],
          properties: {
            id: { type: "string" },
          },
        },
        response: {
          201: attachmentSchema,
          400: errorSchema,
          404: errorSchema,
        },
      },
    },
    async (request, reply) => {
      const serviceRequest = await app.prisma.request.findUnique({
        where: { id: request.params.id },
        select: {
          id: true,
        },
      });

      if (!serviceRequest) {
        throw new AppError(404, "Request not found.", "REQUEST_NOT_FOUND");
      }

      const file = await request.file();

      if (!file) {
        throw new AppError(400, "A file is required.", "FILE_REQUIRED");
      }

      if (!ALLOWED_ATTACHMENT_MIME_TYPES.has(file.mimetype)) {
        file.file.resume();
        throw new AppError(
          400,
          "Unsupported file type. Use PDF or image files.",
          "INVALID_FILE_TYPE",
        );
      }

      const originalName = sanitizeFilename(file.filename);
      const storedName = buildStoredFilename(request.params.id, originalName);
      const storedPath = join(app.appConfig.uploadDir, storedName);

      await pipeline(file.file, createWriteStream(storedPath));

      const attachment = await app.prisma.attachment.create({
        data: {
          requestId: request.params.id,
          uploadedByUserId: request.user.id,
          originalName,
          storedName,
          mimeType: file.mimetype,
          size: file.file.bytesRead,
        },
        select: attachmentSelect,
      });

      return reply.code(201).send(serializeAttachment(attachment));
    },
  );

  app.get<{ Params: AttachmentParams }>(
    "/attachments/:id/download",
    {
      preHandler: app.authenticate,
      schema: {
        tags: ["attachments"],
        summary: "Download an attachment",
        security: [{ bearerAuth: [] }],
        params: {
          type: "object",
          required: ["id"],
          properties: {
            id: { type: "string" },
          },
        },
        response: {
          404: errorSchema,
        },
      },
    },
    async (request, reply) => {
      const attachment = await app.prisma.attachment.findUnique({
        where: { id: request.params.id },
        include: {
          request: {
            select: {
              userId: true,
            },
          },
        },
      });

      if (!attachment) {
        throw new AppError(404, "Attachment not found.", "ATTACHMENT_NOT_FOUND");
      }

      if (
        request.user.role !== Role.ADMIN &&
        request.user.id !== attachment.request.userId
      ) {
        throw new AppError(404, "Attachment not found.", "ATTACHMENT_NOT_FOUND");
      }

      const storedPath = join(app.appConfig.uploadDir, attachment.storedName);

      try {
        await access(storedPath);
      } catch {
        throw new AppError(404, "File is missing on disk.", "FILE_NOT_FOUND");
      }

      reply.header(
        "Content-Disposition",
        `attachment; filename="${attachment.originalName}"`,
      );
      reply.type(attachment.mimeType);

      return reply.send(createReadStream(storedPath));
    },
  );
};
