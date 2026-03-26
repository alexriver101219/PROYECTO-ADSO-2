import fastify from "fastify";
import type { FastifyReply, FastifyRequest } from "fastify";
import type { PrismaClient } from "@prisma/client";
import jwt from "@fastify/jwt";
import multipart from "@fastify/multipart";
import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";

import { authRoutes } from "../modules/auth/routes";
import { attachmentRoutes } from "../modules/attachments/routes";
import { frontendRoutes } from "../modules/frontend/routes";
import { requestRoutes } from "../modules/requests/routes";
import { AppError } from "../lib/errors";
import { ensureDefaultAdmin, initializeDatabase } from "../lib/prisma";
import { buildAppConfig, type BuildAppOptions } from "./build-app-config";

export async function buildApp(options: BuildAppOptions = {}) {
  const { config, prisma, ownsPrismaClient, ensureUploadDirectory } =
    await buildAppConfig(options);

  const app = fastify({
    logger: options.logger ?? config.nodeEnv !== "test",
  });

  app.decorate("prisma", prisma as PrismaClient);
  app.decorate("appConfig", config);
  app.decorate(
    "authenticate",
    async function authenticate(request: FastifyRequest, _reply: FastifyReply) {
      try {
        await request.jwtVerify();
      } catch {
        throw new AppError(401, "Invalid or expired token.", "UNAUTHORIZED");
      }
    },
  );
  app.decorate(
    "requireAdmin",
    async function requireAdmin(request: FastifyRequest, reply: FastifyReply) {
      await app.authenticate(request, reply);

      if (request.user.role !== "ADMIN") {
        throw new AppError(403, "Admin access is required.", "FORBIDDEN");
      }
    },
  );

  await ensureUploadDirectory();
  await initializeDatabase(prisma);
  await ensureDefaultAdmin(prisma, config);

  await app.register(swagger, {
    openapi: {
      info: {
        title: "Consultas, Solicitudes y Descargas API",
        version: "1.0.0",
        description:
          "REST API for authenticated requests, status tracking, and file downloads.",
      },
      components: {
        securitySchemes: {
          bearerAuth: {
            type: "http",
            scheme: "bearer",
            bearerFormat: "JWT",
          },
        },
      },
    },
  });

  await app.register(swaggerUi, {
    routePrefix: "/docs",
  });

  await app.register(jwt, {
    secret: config.jwtSecret,
    sign: {
      expiresIn: "1d",
    },
  });

  await app.register(multipart, {
    limits: {
      files: 1,
      fileSize: 10 * 1024 * 1024,
    },
  });

  app.get(
    "/health",
    {
      schema: {
        tags: ["system"],
        summary: "Health check",
        response: {
          200: {
            type: "object",
            required: ["status"],
            properties: {
              status: { type: "string" },
            },
          },
        },
      },
    },
    async () => ({ status: "ok" }),
  );

  await app.register(authRoutes);
  await app.register(requestRoutes);
  await app.register(attachmentRoutes);
  await app.register(frontendRoutes);

  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof AppError) {
      return reply.status(error.statusCode).send({
        message: error.message,
        ...(error.code ? { code: error.code } : {}),
        ...(error.details ? { details: error.details } : {}),
      });
    }

    if (typeof error === "object" && error !== null && "validation" in error) {
      const validationError = error as { validation?: unknown };

      if (validationError.validation) {
        return reply.status(400).send({
          message: "Validation failed.",
          code: "VALIDATION_ERROR",
          details: validationError.validation,
        });
      }
    }

    const errorWithCode = error as { code?: string };

    if (errorWithCode.code === "P2002") {
      return reply.status(409).send({
        message: "A unique field already exists.",
        code: "UNIQUE_CONSTRAINT",
      });
    }

    if (errorWithCode.code === "P2025") {
      return reply.status(404).send({
        message: "Record not found.",
        code: "RECORD_NOT_FOUND",
      });
    }

    app.log.error(error as Error);
    return reply.status(500).send({
      message: "Internal server error.",
      code: "INTERNAL_ERROR",
    });
  });

  app.setNotFoundHandler((_request, reply) => {
    return reply.status(404).send({
      message: "Route not found.",
      code: "ROUTE_NOT_FOUND",
    });
  });

  app.addHook("onClose", async () => {
    if (ownsPrismaClient) {
      await prisma.$disconnect();
    }
  });

  await app.ready();

  return app;
}




