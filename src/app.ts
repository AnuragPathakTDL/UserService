import Fastify from "fastify";
import {
  serializerCompiler,
  validatorCompiler,
  ZodTypeProvider,
} from "fastify-type-provider-zod";
import sensible from "@fastify/sensible";
import helmet from "@fastify/helmet";
import cors from "@fastify/cors";
import { loadConfig } from "./config";
import prismaPlugin from "./plugins/prisma";
import authServicePlugin from "./plugins/auth-service";
import adminUserRoutes from "./routes/admin-users";
import { ensureSystemRoles } from "./services/bootstrap";

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
  }).withTypeProvider<ZodTypeProvider>();

  fastify.setValidatorCompiler(validatorCompiler);
  fastify.setSerializerCompiler(serializerCompiler);

  await fastify.register(sensible);
  await fastify.register(cors, { origin: false });
  await fastify.register(helmet, {
    contentSecurityPolicy: false,
  });
  await fastify.register(prismaPlugin);
  await fastify.register(authServicePlugin);
  await ensureSystemRoles(fastify.prisma);

  const externalBase = "/api/v1/user";
  await fastify.register(adminUserRoutes, {
    prefix: `${externalBase}/admin`,
  });

  fastify.get("/health", async () => ({ status: "ok" }));

  return fastify;
}
