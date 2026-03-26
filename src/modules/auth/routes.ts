import type { FastifyPluginAsync } from "fastify";

import { AppError } from "../../lib/errors";
import { hashPassword, verifyPassword } from "../../lib/password";
import { authResponseSchema, publicUserSchema } from "../users/schemas";
import { serializeUser, toAuthenticatedUser } from "../users/serializers";

interface RegisterBody {
  name: string;
  email: string;
  password: string;
}

interface LoginBody {
  email: string;
  password: string;
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

export const authRoutes: FastifyPluginAsync = async (app) => {
  app.post<{ Body: RegisterBody }>(
    "/auth/register",
    {
      schema: {
        tags: ["auth"],
        summary: "Register a new user",
        body: {
          type: "object",
          required: ["name", "email", "password"],
          properties: {
            name: { type: "string", minLength: 2, maxLength: 120 },
            email: { type: "string", format: "email" },
            password: { type: "string", minLength: 8, maxLength: 128 },
          },
        },
        response: {
          201: authResponseSchema,
          409: errorSchema,
        },
      },
    },
    async (request, reply) => {
      const email = request.body.email.toLowerCase();

      const existingUser = await app.prisma.user.findUnique({
        where: { email },
      });

      if (existingUser) {
        throw new AppError(409, "Email is already registered.", "EMAIL_TAKEN");
      }

      const user = await app.prisma.user.create({
        data: {
          name: request.body.name.trim(),
          email,
          passwordHash: await hashPassword(request.body.password),
        },
      });

      const token = await reply.jwtSign(toAuthenticatedUser(user));

      return reply.code(201).send({
        token,
        user: serializeUser(user),
      });
    },
  );

  app.post<{ Body: LoginBody }>(
    "/auth/login",
    {
      schema: {
        tags: ["auth"],
        summary: "Login with email and password",
        body: {
          type: "object",
          required: ["email", "password"],
          properties: {
            email: { type: "string", format: "email" },
            password: { type: "string", minLength: 8, maxLength: 128 },
          },
        },
        response: {
          200: authResponseSchema,
          401: errorSchema,
        },
      },
    },
    async (request, reply) => {
      const email = request.body.email.toLowerCase();
      const user = await app.prisma.user.findUnique({
        where: { email },
      });

      if (!user) {
        throw new AppError(401, "Invalid email or password.", "INVALID_LOGIN");
      }

      const isPasswordValid = await verifyPassword(
        request.body.password,
        user.passwordHash,
      );

      if (!isPasswordValid) {
        throw new AppError(401, "Invalid email or password.", "INVALID_LOGIN");
      }

      const token = await reply.jwtSign(toAuthenticatedUser(user));

      return {
        token,
        user: serializeUser(user),
      };
    },
  );

  app.get(
    "/auth/me",
    {
      preHandler: app.authenticate,
      schema: {
        tags: ["auth"],
        summary: "Get current authenticated user",
        security: [{ bearerAuth: [] }],
        response: {
          200: publicUserSchema,
          401: errorSchema,
        },
      },
    },
    async (request) => {
      const user = await app.prisma.user.findUnique({
        where: { id: request.user.id },
      });

      if (!user) {
        throw new AppError(401, "User not found.", "USER_NOT_FOUND");
      }

      return serializeUser(user);
    },
  );
};
