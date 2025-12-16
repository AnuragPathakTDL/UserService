import { buildApp } from "./app";
import { loadConfig } from "./config";
import { startGrpcServer, stopGrpcServer } from "./grpc/server";

async function main() {
  const app = await buildApp();
  const config = loadConfig();
  let grpcServer: Awaited<ReturnType<typeof startGrpcServer>> | undefined;

  try {
    await app.listen({ host: config.HTTP_HOST, port: config.HTTP_PORT });
    grpcServer = await startGrpcServer({
      app,
      prisma: app.prisma,
      serviceToken: config.SERVICE_AUTH_TOKEN,
      authService: app.authService,
    });
    app.log.info(
      { http: `${config.HTTP_HOST}:${config.HTTP_PORT}` },
      "UserService ready"
    );
  } catch (error) {
    app.log.error({ err: error }, "Failed to start UserService");
    await app.close();
    process.exit(1);
  }

  const shutdown = async (signal: NodeJS.Signals) => {
    app.log.info({ signal }, "Shutting down UserService");
    try {
      if (grpcServer) {
        await stopGrpcServer(grpcServer);
      }
      await app.close();
      process.exit(0);
    } catch (error) {
      app.log.error({ err: error }, "Error during shutdown");
      process.exit(1);
    }
  };

  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}

void main();
