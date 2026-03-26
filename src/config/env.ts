import "dotenv/config";

import { resolve } from "node:path";

import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(3000),
  HOST: z.string().min(1).default("0.0.0.0"),
  DATABASE_URL: z.string().min(1).default("file:./dev.db"),
  JWT_SECRET: z.string().min(12).default("super-secret-jwt-key-change-me"),
  UPLOAD_DIR: z.string().min(1).default("./storage/uploads"),
  ADMIN_EMAIL: z.string().email().default("admin@example.com"),
  ADMIN_PASSWORD: z.string().min(8).default("Admin123!"),
});

export interface AppConfig {
  nodeEnv: "development" | "test" | "production";
  port: number;
  host: string;
  databaseUrl: string;
  jwtSecret: string;
  uploadDir: string;
  adminEmail: string;
  adminPassword: string;
}

export function loadAppConfig(overrides: Partial<AppConfig> = {}): AppConfig {
  const parsed = envSchema.parse(process.env);

  return {
    nodeEnv: overrides.nodeEnv ?? parsed.NODE_ENV,
    port: overrides.port ?? parsed.PORT,
    host: overrides.host ?? parsed.HOST,
    databaseUrl: overrides.databaseUrl ?? parsed.DATABASE_URL,
    jwtSecret: overrides.jwtSecret ?? parsed.JWT_SECRET,
    uploadDir: overrides.uploadDir ?? resolve(parsed.UPLOAD_DIR),
    adminEmail: overrides.adminEmail ?? parsed.ADMIN_EMAIL.toLowerCase(),
    adminPassword: overrides.adminPassword ?? parsed.ADMIN_PASSWORD,
  };
}
