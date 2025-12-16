import Fastify from "fastify";
import sensible from "@fastify/sensible";
import helmet from "@fastify/helmet";
import cors from "@fastify/cors";
import { loadConfig } from "./config";
import prismaPlugin from "./plugins/prisma";
import adminUserRoutes from "./routes/admin-users";

export async function buildApp() {
  const config = loadConfig();
  const fastify = Fastify({
    logger: {
      level: config.LOG_LEVEL,
      transport:
        config.NODE_ENV === "development"
          ? {
              target: "pino-pretty",
              options: {
                colorize: true,
                translateTime: "SYS:standard",
              },
            }
          : undefined,
    },
    trustProxy: true,
    bodyLimit: config.HTTP_BODY_LIMIT,
  });

  await fastify.register(sensible);
  await fastify.register(cors, { origin: false });
  await fastify.register(helmet, {
    contentSecurityPolicy: false,
  });
  await fastify.register(prismaPlugin);
  await fastify.register(adminUserRoutes, { prefix: "/admin" });

  fastify.get("/health", async () => ({ status: "ok" }));

  return fastify;
}
