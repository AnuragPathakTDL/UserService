import path from "node:path";
import * as grpc from "@grpc/grpc-js";
import type { ServiceError } from "@grpc/grpc-js";
import { loadSync } from "@grpc/proto-loader";
import fp from "fastify-plugin";
import type { FastifyInstance } from "fastify";
import { loadConfig } from "../config";
import {
  AdminVerificationError,
  type AdminVerificationReason,
  type AuthServiceIntegration,
  type AuthServiceUser,
} from "../types/auth-service";

const PROTO_PATH = path.join(__dirname, "../../proto/auth.proto");

type AuthPackageDefinition = ReturnType<typeof grpc.loadPackageDefinition> & {
  auth: {
    v1: {
      AuthService: grpc.ServiceClientConstructor & {
        service: grpc.ServiceDefinition;
      };
    };
  };
};

type GetUserByIdRequest = {
  user_id: string;
};

type GetUserByIdResponse = {
  user_id: string;
  email: string;
  role: string;
  active: boolean;
};

type GrpcUnary<Req, Res> = (
  request: Req,
  metadata: grpc.Metadata,
  callback: (error: grpc.ServiceError | null, response: Res) => void
) => void;

type GrpcAuthServiceClient = grpc.Client & {
  GetUserById: GrpcUnary<GetUserByIdRequest, GetUserByIdResponse>;
};

function loadAuthPackage(): AuthPackageDefinition["auth"]["v1"] {
  const definition = loadSync(PROTO_PATH, {
    keepCase: true,
    longs: String,
    enums: String,
    defaults: true,
    oneofs: true,
  });
  const loaded = grpc.loadPackageDefinition(
    definition
  ) as AuthPackageDefinition;
  return loaded.auth.v1;
}

function mapUser(message: GetUserByIdResponse): AuthServiceUser {
  return {
    id: message.user_id,
    email: message.email,
    role: message.role,
    userType: message.role,
    active: message.active,
  };
}

function createMetadata(token?: string) {
  const metadata = new grpc.Metadata();
  if (token) {
    metadata.set("authorization", `Bearer ${token}`);
  }
  return metadata;
}

function wrapUnary<Req, Res>(method: GrpcUnary<Req, Res>, token?: string) {
  return (request: Req): Promise<Res> => {
    return new Promise<Res>((resolve, reject) => {
      const metadata = createMetadata(token);
      method(request, metadata, (error, response) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(response);
      });
    });
  };
}

function asVerificationError(
  reason: AdminVerificationReason,
  message?: string
) {
  return new AdminVerificationError(reason, message);
}

function isServiceError(error: unknown): error is ServiceError {
  if (typeof error !== "object" || error === null) {
    return false;
  }
  return (
    "code" in error && typeof (error as { code: unknown }).code === "number"
  );
}

const authServicePlugin = fp(async function authServicePlugin(
  fastify: FastifyInstance
) {
  const integration: AuthServiceIntegration = {
    isEnabled: false,
    async getUserById() {
      throw new Error("AuthService integration disabled");
    },
    async ensureAdminUser() {
      throw new Error("AuthService integration disabled");
    },
  };

  fastify.decorate("authService", integration);

  const config = loadConfig();
  if (!config.AUTH_SERVICE_ADDRESS) {
    fastify.log.warn(
      "AUTH_SERVICE_ADDRESS not configured; admin user verification disabled"
    );
    return;
  }

  const authPackage = loadAuthPackage();
  const client = new authPackage.AuthService(
    config.AUTH_SERVICE_ADDRESS,
    grpc.credentials.createInsecure()
  ) as unknown as GrpcAuthServiceClient;

  const getUserByIdUnary = wrapUnary(
    client.GetUserById.bind(client),
    config.AUTH_SERVICE_TOKEN
  );

  const fetchUserById = async (userId: string): Promise<AuthServiceUser> => {
    try {
      const response = await getUserByIdUnary({ user_id: userId });
      return mapUser(response);
    } catch (error) {
      if (isServiceError(error) && error.code === grpc.status.NOT_FOUND) {
        throw asVerificationError("NOT_FOUND", "User not found in AuthService");
      }
      fastify.log.error(
        { err: error, userId },
        "AuthService GetUserById failed"
      );
      throw new Error("Failed to fetch user from AuthService");
    }
  };

  Object.assign(integration, {
    isEnabled: true,
    async getUserById(userId: string) {
      return fetchUserById(userId);
    },
    async ensureAdminUser(userId: string) {
      const user = await fetchUserById(userId);
      if (!user.active) {
        throw asVerificationError(
          "INACTIVE",
          "User is inactive in AuthService"
        );
      }
      if (user.role.toUpperCase() !== "ADMIN") {
        throw asVerificationError(
          "NOT_ADMIN",
          "User is not registered as ADMIN in AuthService"
        );
      }
      return user;
    },
  } satisfies AuthServiceIntegration);

  fastify.addHook("onClose", async () => {
    client.close();
  });
});

declare module "fastify" {
  interface FastifyInstance {
    authService: AuthServiceIntegration;
  }
}

export default authServicePlugin;
