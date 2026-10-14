import { readFile } from "node:fs/promises";
import { extname, resolve } from "node:path";

import type { FastifyPluginAsync } from "fastify";

const publicRoot = resolve(process.cwd(), "public");
const assetContentTypes: Record<string, string> = {
  ".svg": "image/svg+xml; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
};

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

  app.get<{ Params: { fileName: string } }>(
    "/assets/:fileName",
    async (request, reply) => {
      const fileName = request.params.fileName;

      if (fileName.includes("/") || fileName.includes("\\")) {
        return reply.code(404).send({ message: "Asset not found." });
      }

      const asset = await readFile(resolve(publicRoot, "assets", fileName));
      const contentType =
        assetContentTypes[extname(fileName).toLowerCase()] ??
        "application/octet-stream";

      return reply.type(contentType).send(asset);
    },
  );
};
