import type { FastifyPluginAsync } from "fastify";
import { RequestStatus, Role } from "@prisma/client";

import { AppError } from "../../lib/errors";
import {
  attachmentSchema,
  requestHistorySchema,
  requestSchema,
  requestStatusValues,
} from "./schemas";
import {
  assertAllowedStatusTransition,
  assertCanAccessRequest,
  assertCanEditRequest,
} from "./policies";
import {
  serializeAttachment,
  serializeHistoryEntry,
  serializeRequest,
} from "./serializers";

interface CreateRequestBody {
  title: string;
  description: string;
  category: string;
}

interface UpdateRequestBody {
  title?: string;
  description?: string;
  category?: string;
}

interface UpdateStatusBody {
  status: RequestStatus;
  note?: string;
}

interface RequestParams {
  id: string;
}

interface ListRequestsQuery {
  status?: RequestStatus;
  from?: string;
  to?: string;
  search?: string;
}

const requestSelect = {
  id: true,
  userId: true,
  title: true,
  description: true,
  category: true,
  status: true,
  createdAt: true,
  updatedAt: true,
  user: {
    select: {
      id: true,
      name: true,
      email: true,
    },
  },
} as const;

const historySelect = {
  id: true,
  fromStatus: true,
  toStatus: true,
  note: true,
  createdAt: true,
  changedBy: {
    select: {
      id: true,
      name: true,
      email: true,
    },
  },
} as const;

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

function parseDate(value: string, mode: "start" | "end") {
  const parsedDate = new Date(value);

  if (Number.isNaN(parsedDate.getTime())) {
    throw new AppError(400, `Invalid date: ${value}`, "INVALID_DATE");
  }

  if (!value.includes("T")) {
    if (mode === "start") {
      parsedDate.setHours(0, 0, 0, 0);
    } else {
      parsedDate.setHours(23, 59, 59, 999);
    }
  }

  return parsedDate;
}

export const requestRoutes: FastifyPluginAsync = async (app) => {
  app.post<{ Body: CreateRequestBody }>(
    "/requests",
    {
      preHandler: app.authenticate,
      schema: {
        tags: ["requests"],
        summary: "Create a new request",
        security: [{ bearerAuth: [] }],
        body: {
          type: "object",
          required: ["title", "description", "category"],
          properties: {
            title: { type: "string", minLength: 3, maxLength: 160 },
            description: { type: "string", minLength: 10, maxLength: 4000 },
            category: { type: "string", minLength: 2, maxLength: 120 },
          },
        },
        response: {
          201: requestSchema,
          401: errorSchema,
        },
      },
    },
    async (request, reply) => {
      const serviceRequest = await app.prisma.$transaction(async (tx) => {
        const createdRequest = await tx.request.create({
          data: {
            title: request.body.title.trim(),
            description: request.body.description.trim(),
            category: request.body.category.trim(),
            userId: request.user.id,
          },
          select: requestSelect,
        });

        await tx.statusHistory.create({
          data: {
            requestId: createdRequest.id,
            changedByUserId: request.user.id,
            toStatus: RequestStatus.PENDING,
            note: "Request created.",
          },
        });

        return createdRequest;
      });

      return reply.code(201).send(serializeRequest(serviceRequest));
    },
  );

  app.get<{ Querystring: ListRequestsQuery }>(
    "/requests",
    {
      preHandler: app.authenticate,
      schema: {
        tags: ["requests"],
        summary: "List requests with filters",
        security: [{ bearerAuth: [] }],
        querystring: {
          type: "object",
          properties: {
            status: { type: "string", enum: [...requestStatusValues] },
            from: { type: "string" },
            to: { type: "string" },
            search: { type: "string", minLength: 1, maxLength: 120 },
          },
        },
        response: {
          200: {
            type: "array",
            items: requestSchema,
          },
          401: errorSchema,
        },
      },
    },
    async (request) => {
      const where: Record<string, unknown> = {};

      if (request.user.role !== Role.ADMIN) {
        where.userId = request.user.id;
      }

      if (request.query.status) {
        where.status = request.query.status;
      }

      if (request.query.search) {
        where.OR = [
          { title: { contains: request.query.search } },
          { description: { contains: request.query.search } },
          { category: { contains: request.query.search } },
        ];
      }

      if (request.query.from || request.query.to) {
        where.createdAt = {
          ...(request.query.from
            ? { gte: parseDate(request.query.from, "start") }
            : {}),
          ...(request.query.to
            ? { lte: parseDate(request.query.to, "end") }
            : {}),
        };
      }

      const requests = await app.prisma.request.findMany({
        where,
        orderBy: { createdAt: "desc" },
        select: requestSelect,
      });

      return requests.map(serializeRequest);
    },
  );

  app.get<{ Params: RequestParams }>(
    "/requests/:id",
    {
      preHandler: app.authenticate,
      schema: {
        tags: ["requests"],
        summary: "Get request details",
        security: [{ bearerAuth: [] }],
        params: {
          type: "object",
          required: ["id"],
          properties: {
            id: { type: "string" },
          },
        },
        response: {
          200: requestSchema,
          404: errorSchema,
        },
      },
    },
    async (request) => {
      const serviceRequest = await app.prisma.request.findUnique({
        where: { id: request.params.id },
        select: requestSelect,
      });

      if (!serviceRequest) {
        throw new AppError(404, "Request not found.", "REQUEST_NOT_FOUND");
      }

      assertCanAccessRequest(request.user, serviceRequest);

      return serializeRequest(serviceRequest);
    },
  );

  app.patch<{ Params: RequestParams; Body: UpdateRequestBody }>(
    "/requests/:id",
    {
      preHandler: app.authenticate,
      schema: {
        tags: ["requests"],
        summary: "Edit a pending request",
        security: [{ bearerAuth: [] }],
        params: {
          type: "object",
          required: ["id"],
          properties: {
            id: { type: "string" },
          },
        },
        body: {
          type: "object",
          minProperties: 1,
          additionalProperties: false,
          properties: {
            title: { type: "string", minLength: 3, maxLength: 160 },
            description: { type: "string", minLength: 10, maxLength: 4000 },
            category: { type: "string", minLength: 2, maxLength: 120 },
          },
        },
        response: {
          200: requestSchema,
          403: errorSchema,
          409: errorSchema,
        },
      },
    },
    async (request) => {
      const existingRequest = await app.prisma.request.findUnique({
        where: { id: request.params.id },
        select: {
          id: true,
          userId: true,
          status: true,
        },
      });

      if (!existingRequest) {
        throw new AppError(404, "Request not found.", "REQUEST_NOT_FOUND");
      }

      assertCanEditRequest(request.user, existingRequest);

      const updatedRequest = await app.prisma.request.update({
        where: { id: request.params.id },
        data: {
          ...(request.body.title ? { title: request.body.title.trim() } : {}),
          ...(request.body.description
            ? { description: request.body.description.trim() }
            : {}),
          ...(request.body.category
            ? { category: request.body.category.trim() }
            : {}),
        },
        select: requestSelect,
      });

      return serializeRequest(updatedRequest);
    },
  );

  app.patch<{ Params: RequestParams; Body: UpdateStatusBody }>(
    "/requests/:id/status",
    {
      preHandler: app.authenticate,
      schema: {
        tags: ["requests"],
        summary: "Update request status",
        security: [{ bearerAuth: [] }],
        params: {
          type: "object",
          required: ["id"],
          properties: {
            id: { type: "string" },
          },
        },
        body: {
          type: "object",
          required: ["status"],
          properties: {
            status: { type: "string", enum: [...requestStatusValues] },
            note: { type: "string", minLength: 2, maxLength: 300 },
          },
        },
        response: {
          200: requestSchema,
          403: errorSchema,
          409: errorSchema,
        },
      },
    },
    async (request) => {
      const existingRequest = await app.prisma.request.findUnique({
        where: { id: request.params.id },
        select: {
          id: true,
          userId: true,
          status: true,
        },
      });

      if (!existingRequest) {
        throw new AppError(404, "Request not found.", "REQUEST_NOT_FOUND");
      }

      assertAllowedStatusTransition(
        request.user,
        existingRequest,
        request.body.status,
      );

      const updatedRequest = await app.prisma.$transaction(async (tx) => {
        const requestRecord = await tx.request.update({
          where: { id: request.params.id },
          data: {
            status: request.body.status,
          },
          select: requestSelect,
        });

        await tx.statusHistory.create({
          data: {
            requestId: request.params.id,
            changedByUserId: request.user.id,
            fromStatus: existingRequest.status,
            toStatus: request.body.status,
            ...(request.body.note ? { note: request.body.note.trim() } : {}),
          },
        });

        return requestRecord;
      });

      return serializeRequest(updatedRequest);
    },
  );

  app.get<{ Params: RequestParams }>(
    "/requests/:id/history",
    {
      preHandler: app.authenticate,
      schema: {
        tags: ["requests"],
        summary: "Get request status history",
        security: [{ bearerAuth: [] }],
        params: {
          type: "object",
          required: ["id"],
          properties: {
            id: { type: "string" },
          },
        },
        response: {
          200: {
            type: "array",
            items: requestHistorySchema,
          },
          404: errorSchema,
        },
      },
    },
    async (request) => {
      const existingRequest = await app.prisma.request.findUnique({
        where: { id: request.params.id },
        select: {
          userId: true,
        },
      });

      if (!existingRequest) {
        throw new AppError(404, "Request not found.", "REQUEST_NOT_FOUND");
      }

      assertCanAccessRequest(request.user, existingRequest);

      const history = await app.prisma.statusHistory.findMany({
        where: { requestId: request.params.id },
        orderBy: { createdAt: "asc" },
        select: historySelect,
      });

      return history.map(serializeHistoryEntry);
    },
  );

  app.get<{ Params: RequestParams }>(
    "/requests/:id/attachments",
    {
      preHandler: app.authenticate,
      schema: {
        tags: ["attachments"],
        summary: "List request attachments",
        security: [{ bearerAuth: [] }],
        params: {
          type: "object",
          required: ["id"],
          properties: {
            id: { type: "string" },
          },
        },
        response: {
          200: {
            type: "array",
            items: attachmentSchema,
          },
          404: errorSchema,
        },
      },
    },
    async (request) => {
      const existingRequest = await app.prisma.request.findUnique({
        where: { id: request.params.id },
        select: {
          userId: true,
        },
      });

      if (!existingRequest) {
        throw new AppError(404, "Request not found.", "REQUEST_NOT_FOUND");
      }

      assertCanAccessRequest(request.user, existingRequest);

      const attachments = await app.prisma.attachment.findMany({
        where: { requestId: request.params.id },
        orderBy: { createdAt: "desc" },
        select: attachmentSelect,
      });

      return attachments.map(serializeAttachment);
    },
  );
};

