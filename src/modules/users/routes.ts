import type { FastifyPluginAsync } from "fastify";
import { Role } from "@prisma/client";

import { publicUserSchema, roleValues } from "./schemas";
import { serializeUser } from "./serializers";

interface ListUsersQuery {
  search?: string;
  role?: Role;
}

const errorSchema = {
  type: "object",
  required: ["message"],
  properties: {
    message: { type: "string" },
    code: { type: "string" },
    details: {},
  },
} as const;

export const userRoutes: FastifyPluginAsync = async (app) => {
  app.get<{ Querystring: ListUsersQuery }>(
    "/users",
    {
      preHandler: app.requireAdmin,
      schema: {
        tags: ["users"],
        summary: "List users",
        security: [{ bearerAuth: [] }],
        querystring: {
          type: "object",
          properties: {
            search: { type: "string", minLength: 1, maxLength: 120 },
            role: { type: "string", enum: [...roleValues] },
          },
        },
        response: {
          200: {
            type: "array",
            items: publicUserSchema,
          },
          401: errorSchema,
          403: errorSchema,
        },
      },
    },
    async (request) => {
      const where: Record<string, unknown> = {};

      if (request.query.role) {
        where.role = request.query.role;
      }

      if (request.query.search) {
        const search = request.query.search.trim();
        where.OR = [
          { name: { contains: search } },
          { email: { contains: search } },
        ];
      }

      const users = await app.prisma.user.findMany({
        where,
        orderBy: { createdAt: "desc" },
      });

      return users.map(serializeUser);
    },
  );
};
