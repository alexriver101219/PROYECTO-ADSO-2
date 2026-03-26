import type { PrismaClient } from "@prisma/client";

import { loadAppConfig, type AppConfig } from "../config/env";
import { ensureDirectory } from "../lib/files";
import { createPrismaClient } from "../lib/prisma";

export interface BuildAppOptions {
  logger?: boolean;
  config?: Partial<AppConfig>;
  prisma?: PrismaClient;
}

export async function buildAppConfig(options: BuildAppOptions) {
  const config = loadAppConfig(options.config);
  const prisma = options.prisma ?? createPrismaClient(config.databaseUrl);
  const ownsPrismaClient = !options.prisma;

  return {
    config,
    prisma,
    ownsPrismaClient,
    ensureUploadDirectory: async () => ensureDirectory(config.uploadDir),
  };
}
