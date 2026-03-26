import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import type { FastifyPluginAsync } from "fastify";

const publicRoot = resolve(process.cwd(), "public");

async function readPublicFile(fileName: string) {
  return readFile(resolve(publicRoot, fileName), "utf8");
}

export const frontendRoutes: FastifyPluginAsync = async (app) => {
  app.get("/", async (_request, reply) => {
    const html = await readPublicFile("index.html");
    return reply.type("text/html; charset=utf-8").send(html);
  });

  app.get("/styles.css", async (_request, reply) => {
    const css = await readPublicFile("styles.css");
    return reply.type("text/css; charset=utf-8").send(css);
  });

  app.get("/app.js", async (_request, reply) => {
    const script = await readPublicFile("app.js");
    return reply
      .type("application/javascript; charset=utf-8")
      .send(script);
  });
};
