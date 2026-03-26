import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import bcrypt from "bcrypt";
import type { PrismaClient } from "@prisma/client";
import type { FastifyInstance } from "fastify";
import supertest from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

let app: FastifyInstance;
let prisma: PrismaClient;
let api: supertest.SuperTest<supertest.Test>;
let tempDir: string;
let dbUrl: string;
let uploadDir: string;

async function resetDatabase() {
  await prisma.statusHistory.deleteMany();
  await prisma.attachment.deleteMany();
  await prisma.request.deleteMany();
  await prisma.user.deleteMany();

  await prisma.user.create({
    data: {
      name: "Administrator",
      email: "admin@example.com",
      role: "ADMIN",
      passwordHash: await bcrypt.hash("Admin123!", 10),
    },
  });

  rmSync(uploadDir, { recursive: true, force: true });
  mkdirSync(uploadDir, { recursive: true });
}

async function registerUser(name: string, email: string) {
  const response = await api.post("/auth/register").send({
    name,
    email,
    password: "Password123!",
  });

  expect(response.status).toBe(201);
  return response.body as { token: string; user: { id: string } };
}

async function loginAdmin() {
  const response = await api.post("/auth/login").send({
    email: "admin@example.com",
    password: "Admin123!",
  });

  expect(response.status).toBe(200);
  return response.body.token as string;
}

describe("Consultas API", () => {
  beforeAll(async () => {
    tempDir = mkdtempSync(join(tmpdir(), "consultas-api-"));
    uploadDir = join(tempDir, "uploads");
    dbUrl = `file:${join(tempDir, "test.db").replace(/\\/g, "/")}`;

    process.env.NODE_ENV = "test";
    process.env.DATABASE_URL = dbUrl;
    process.env.JWT_SECRET = "test-secret-key-123";

    const [{ createPrismaClient }, { buildApp }] = await Promise.all([
      import("../src/lib/prisma"),
      import("../src/main/app"),
    ]);

    prisma = createPrismaClient(dbUrl);
    app = await buildApp({
      logger: false,
      prisma,
      config: {
        nodeEnv: "test",
        databaseUrl: dbUrl,
        jwtSecret: "test-secret-key-123",
        uploadDir,
      },
    });
    api = supertest(app.server);
  });

  beforeEach(async () => {
    await resetDatabase();
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("serves the frontend shell", async () => {
    const response = await api.get("/");

    expect(response.status).toBe(200);
    expect(response.text).toContain("Portal de Solicitudes");
  });

  it("registers, logs in, and returns the current user", async () => {
    const registered = await registerUser("Alice", "alice@example.com");

    const login = await api.post("/auth/login").send({
      email: "alice@example.com",
      password: "Password123!",
    });

    expect(login.status).toBe(200);
    expect(login.body.user.email).toBe("alice@example.com");

    const me = await api
      .get("/auth/me")
      .set("Authorization", `Bearer ${registered.token}`);

    expect(me.status).toBe(200);
    expect(me.body.email).toBe("alice@example.com");
    expect(me.body.role).toBe("USER");
  });

  it("limits request visibility to the owner unless the caller is admin", async () => {
    const owner = await registerUser("Owner", "owner@example.com");
    const otherUser = await registerUser("Other", "other@example.com");

    const created = await api
      .post("/requests")
      .set("Authorization", `Bearer ${owner.token}`)
      .send({
        title: "Need certificate",
        description: "I need to download my account certificate.",
        category: "Certificates",
      });

    expect(created.status).toBe(201);

    const ownerList = await api
      .get("/requests")
      .set("Authorization", `Bearer ${owner.token}`);

    expect(ownerList.status).toBe(200);
    expect(ownerList.body).toHaveLength(1);

    const otherList = await api
      .get("/requests")
      .set("Authorization", `Bearer ${otherUser.token}`);

    expect(otherList.status).toBe(200);
    expect(otherList.body).toHaveLength(0);

    const otherDetail = await api
      .get(`/requests/${created.body.id}`)
      .set("Authorization", `Bearer ${otherUser.token}`);

    expect(otherDetail.status).toBe(404);
  });

  it("enforces status transition rules for users and admins", async () => {
    const owner = await registerUser("Owner", "owner2@example.com");
    const adminToken = await loginAdmin();

    const created = await api
      .post("/requests")
      .set("Authorization", `Bearer ${owner.token}`)
      .send({
        title: "Need approval",
        description: "Please review and approve this request.",
        category: "General",
      });

    expect(created.status).toBe(201);

    const invalidUserTransition = await api
      .patch(`/requests/${created.body.id}/status`)
      .set("Authorization", `Bearer ${owner.token}`)
      .send({
        status: "APPROVED",
      });

    expect(invalidUserTransition.status).toBe(409);

    const inReview = await api
      .patch(`/requests/${created.body.id}/status`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        status: "IN_REVIEW",
        note: "Review started",
      });

    expect(inReview.status).toBe(200);
    expect(inReview.body.status).toBe("IN_REVIEW");

    const approved = await api
      .patch(`/requests/${created.body.id}/status`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        status: "APPROVED",
        note: "Approved for download",
      });

    expect(approved.status).toBe(200);
    expect(approved.body.status).toBe("APPROVED");

    const completed = await api
      .patch(`/requests/${created.body.id}/status`)
      .set("Authorization", `Bearer ${owner.token}`)
      .send({
        status: "COMPLETED",
      });

    expect(completed.status).toBe(200);
    expect(completed.body.status).toBe("COMPLETED");

    const history = await api
      .get(`/requests/${created.body.id}/history`)
      .set("Authorization", `Bearer ${owner.token}`);

    expect(history.status).toBe(200);
    expect(history.body).toHaveLength(4);
  });

  it("uploads valid attachments, rejects invalid types, and enforces download access", async () => {
    const owner = await registerUser("Owner", "owner3@example.com");
    const otherUser = await registerUser("Visitor", "visitor@example.com");
    const adminToken = await loginAdmin();

    const created = await api
      .post("/requests")
      .set("Authorization", `Bearer ${owner.token}`)
      .send({
        title: "Need file",
        description: "A document should be attached to this request.",
        category: "Documents",
      });

    expect(created.status).toBe(201);

    const invalidUpload = await api
      .post(`/requests/${created.body.id}/attachments`)
      .set("Authorization", `Bearer ${adminToken}`)
      .attach("file", Buffer.from("plain text"), {
        filename: "note.txt",
        contentType: "text/plain",
      });

    expect(invalidUpload.status).toBe(400);

    const validUpload = await api
      .post(`/requests/${created.body.id}/attachments`)
      .set("Authorization", `Bearer ${adminToken}`)
      .attach("file", Buffer.from("%PDF-1.4 sample"), {
        filename: "document.pdf",
        contentType: "application/pdf",
      });

    expect(validUpload.status).toBe(201);
    expect(validUpload.body.originalName).toBe("document.pdf");

    const attachments = await api
      .get(`/requests/${created.body.id}/attachments`)
      .set("Authorization", `Bearer ${owner.token}`);

    expect(attachments.status).toBe(200);
    expect(attachments.body).toHaveLength(1);

    const download = await api
      .get(`/attachments/${validUpload.body.id}/download`)
      .set("Authorization", `Bearer ${owner.token}`);

    expect(download.status).toBe(200);
    expect(download.headers["content-type"]).toContain("application/pdf");

    const forbiddenDownload = await api
      .get(`/attachments/${validUpload.body.id}/download`)
      .set("Authorization", `Bearer ${otherUser.token}`);

    expect(forbiddenDownload.status).toBe(404);
  });
});


