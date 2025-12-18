import path from "node:path";
import * as grpc from "@grpc/grpc-js";
import { loadSync } from "@grpc/proto-loader";
import type { FastifyInstance } from "fastify";
import { GuestStatus, type PrismaClient } from "@prisma/client";
import { loadConfig } from "../config";
import {
  assignRole,
  getUserContext,
  listRoles,
  revokeRole,
} from "../services/rbac";
import {
  ensureCustomerProfile,
  registerGuestProfile,
} from "../services/identity";
import type {
  PermissionDTO,
  RoleAssignmentDTO,
  RoleDTO,
  UserContextDTO,
} from "../types/rbac";
import {
  type AuthServiceIntegration,
  isAdminVerificationError,
} from "../types/auth-service";

type Server = grpc.Server;
type Metadata = grpc.Metadata;
const { ServerCredentials, status } = grpc;

const PROTO_PATH = path.join(__dirname, "../../proto/user.proto");

type UserPackageDefinition = ReturnType<typeof grpc.loadPackageDefinition> & {
  user: {
    v1: {
      UserService: grpc.ServiceClientConstructor & {
        service: grpc.ServiceDefinition;
      };
    };
  };
};

interface GetUserContextRequest {
  user_id?: string;
}

interface PermissionMessage {
  id: string;
  resource: string;
  action: string;
  description?: string;
}

interface RoleMessage {
  id: string;
  name: string;
  description?: string;
  permissions: PermissionMessage[];
}

interface AssignmentMessage {
  assignment_id: string;
  user_id: string;
  role?: RoleMessage;
  scope?: string;
  granted_by?: string;
  active: boolean;
  revoked_at?: string;
}

interface GetUserContextResponse {
  user_id: string;
  roles: RoleMessage[];
  permissions: PermissionMessage[];
  assignments: AssignmentMessage[];
}

interface AssignRoleRequest {
  user_id?: string;
  role_id?: string;
  scope?: string;
  granted_by?: string;
}

interface AssignRoleResponse {
  success: boolean;
  assignment?: AssignmentMessage;
}

interface RevokeRoleRequest {
  assignment_id?: string;
  revoked_by?: string;
}

interface RevokeRoleResponse {
  success: boolean;
}

interface ListRolesRequest {}

interface ListRolesResponse {
  roles: RoleMessage[];
}

interface EnsureCustomerProfileRequest {
  firebase_uid?: string;
  phone_number?: string;
  device_id?: string;
  guest_id?: string;
}

interface EnsureCustomerProfileResponse {
  customer_id: string;
  device_identity_id: string;
  guest_migrated: boolean;
  guest_profile_id: string;
}

interface RegisterGuestRequest {
  guest_id?: string;
  device_id?: string;
}

enum GuestProfileStatusMessage {
  GUEST_PROFILE_STATUS_UNSPECIFIED = 0,
  GUEST_PROFILE_STATUS_ACTIVE = 1,
  GUEST_PROFILE_STATUS_MIGRATED = 2,
}

interface RegisterGuestResponse {
  guest_profile_id: string;
  device_identity_id: string;
  status: GuestProfileStatusMessage;
  customer_id: string;
}

type UnaryHandler<Req, Res> = grpc.handleUnaryCall<Req, Res>;

type HandlerContext = {
  app: FastifyInstance;
  prisma: PrismaClient;
  serviceToken?: string;
  authService: AuthServiceIntegration;
};

const createServiceError = (
  code: grpc.status,
  message: string
): grpc.ServiceError => {
  const error = new Error(message) as grpc.ServiceError;
  error.code = code;
  return error;
};

function isAuthorized(metadata: Metadata, token?: string) {
  if (!token) {
    return true;
  }
  const header = metadata.get("authorization")[0];
  if (typeof header !== "string") {
    return false;
  }
  const supplied = header.replace(/^Bearer\s+/i, "");
  return supplied === token;
}

function toPermissionMessage(permission: PermissionDTO): PermissionMessage {
  return {
    id: permission.id,
    resource: permission.resource,
    action: permission.action,
    description: permission.description ?? "",
  };
}

function toRoleMessage(role: RoleDTO): RoleMessage {
  return {
    id: role.id,
    name: role.name,
    description: role.description ?? "",
    permissions: role.permissions.map(toPermissionMessage),
  };
}

function toAssignmentMessage(assignment: RoleAssignmentDTO): AssignmentMessage {
  return {
    assignment_id: assignment.assignmentId,
    user_id: assignment.userId,
    role: toRoleMessage(assignment.role),
    scope: assignment.scope ?? "",
    granted_by: assignment.grantedBy ?? "",
    active: assignment.active,
    revoked_at: assignment.revokedAt?.toISOString() ?? "",
  };
}

function toContextMessage(context: UserContextDTO): GetUserContextResponse {
  return {
    user_id: context.userId,
    roles: context.roles.map(toRoleMessage),
    permissions: context.permissions.map(toPermissionMessage),
    assignments: context.assignments.map(toAssignmentMessage),
  };
}

function toGuestProfileStatus(
  statusValue: GuestStatus
): GuestProfileStatusMessage {
  switch (statusValue) {
    case GuestStatus.ACTIVE:
      return GuestProfileStatusMessage.GUEST_PROFILE_STATUS_ACTIVE;
    case GuestStatus.MIGRATED:
      return GuestProfileStatusMessage.GUEST_PROFILE_STATUS_MIGRATED;
    default:
      return GuestProfileStatusMessage.GUEST_PROFILE_STATUS_UNSPECIFIED;
  }
}

function getUserPackage(): UserPackageDefinition["user"]["v1"] {
  const packageDefinition = loadSync(PROTO_PATH, {
    keepCase: true,
    longs: String,
    enums: String,
    defaults: true,
    oneofs: true,
  });
  const loaded = grpc.loadPackageDefinition(
    packageDefinition
  ) as UserPackageDefinition;
  return loaded.user.v1;
}

export async function startGrpcServer(
  handlerContext: HandlerContext
): Promise<Server> {
  const config = loadConfig();
  const userPackage = getUserPackage();
  const server = new grpc.Server();

  const wrapAuthorization = <Req, Res>(
    handler: UnaryHandler<Req, Res>
  ): UnaryHandler<Req, Res> => {
    return async (call, callback) => {
      if (!isAuthorized(call.metadata, handlerContext.serviceToken)) {
        callback(createServiceError(status.PERMISSION_DENIED, "Unauthorized"));
        return;
      }
      await handler(call, callback);
    };
  };

  const getUserContextHandler: UnaryHandler<
    GetUserContextRequest,
    GetUserContextResponse
  > = async (call, callback) => {
    const userId = call.request.user_id;
    if (!userId) {
      callback(
        createServiceError(status.INVALID_ARGUMENT, "user_id is required")
      );
      return;
    }
    try {
      const userContext = await getUserContext(handlerContext.prisma, userId);
      callback(null, toContextMessage(userContext));
    } catch (error) {
      handlerContext.app.log.error(
        { err: error, userId },
        "Failed to fetch user context"
      );
      callback(
        createServiceError(status.INTERNAL, "Failed to fetch user context")
      );
    }
  };

  const assignRoleHandler: UnaryHandler<
    AssignRoleRequest,
    AssignRoleResponse
  > = async (call, callback) => {
    const {
      user_id: userId,
      role_id: roleId,
      scope,
      granted_by: grantedBy,
    } = call.request;
    if (!userId || !roleId) {
      callback(
        createServiceError(
          status.INVALID_ARGUMENT,
          "user_id and role_id are required"
        )
      );
      return;
    }
    if (!handlerContext.authService.isEnabled) {
      callback(
        createServiceError(
          status.FAILED_PRECONDITION,
          "AuthService integration is required for assigning roles"
        )
      );
      return;
    }
    try {
      await handlerContext.authService.ensureAdminUser(userId);
      const assignment = await assignRole(handlerContext.prisma, {
        userId,
        roleId,
        scope: scope || undefined,
        grantedBy: grantedBy || undefined,
      });
      callback(null, {
        success: true,
        assignment: toAssignmentMessage(assignment),
      });
    } catch (error) {
      if (isAdminVerificationError(error)) {
        let grpcStatus = status.INTERNAL;
        switch (error.reason) {
          case "NOT_FOUND":
            grpcStatus = status.NOT_FOUND;
            break;
          case "NOT_ADMIN":
            grpcStatus = status.PERMISSION_DENIED;
            break;
          case "INACTIVE":
            grpcStatus = status.FAILED_PRECONDITION;
            break;
        }
        callback(createServiceError(grpcStatus, error.message));
        return;
      }
      handlerContext.app.log.error(
        { err: error, userId, roleId },
        "Failed to assign role"
      );
      callback(createServiceError(status.INTERNAL, "Failed to assign role"));
    }
  };

  const revokeRoleHandler: UnaryHandler<
    RevokeRoleRequest,
    RevokeRoleResponse
  > = async (call, callback) => {
    const assignmentId = call.request.assignment_id;
    if (!assignmentId) {
      callback(
        createServiceError(status.INVALID_ARGUMENT, "assignment_id is required")
      );
      return;
    }
    try {
      await revokeRole(handlerContext.prisma, {
        assignmentId,
        revokedBy: call.request.revoked_by || undefined,
      });
      callback(null, { success: true });
    } catch (error) {
      handlerContext.app.log.error(
        { err: error, assignmentId },
        "Failed to revoke role"
      );
      callback(createServiceError(status.INTERNAL, "Failed to revoke role"));
    }
  };

  const listRolesHandler: UnaryHandler<
    ListRolesRequest,
    ListRolesResponse
  > = async (_call, callback) => {
    try {
      const roles = await listRoles(handlerContext.prisma);
      callback(null, {
        roles: roles.map(toRoleMessage),
      });
    } catch (error) {
      handlerContext.app.log.error({ err: error }, "Failed to list roles");
      callback(createServiceError(status.INTERNAL, "Failed to list roles"));
    }
  };

  const ensureCustomerProfileHandler: UnaryHandler<
    EnsureCustomerProfileRequest,
    EnsureCustomerProfileResponse
  > = async (call, callback) => {
    const firebaseUid = call.request.firebase_uid;
    const deviceId = call.request.device_id;
    if (!firebaseUid || !deviceId) {
      callback(
        createServiceError(
          status.INVALID_ARGUMENT,
          "firebase_uid and device_id are required"
        )
      );
      return;
    }

    try {
      const result = await ensureCustomerProfile({
        prisma: handlerContext.prisma,
        firebaseUid,
        phoneNumber: call.request.phone_number || undefined,
        deviceId,
        guestId: call.request.guest_id || undefined,
      });

      callback(null, {
        customer_id: result.customerId,
        device_identity_id: result.deviceIdentityId,
        guest_migrated: result.guestMigrated,
        guest_profile_id: result.guestProfileId ?? "",
      });
    } catch (error) {
      handlerContext.app.log.error(
        { err: error, firebaseUid, deviceId },
        "Failed to ensure customer profile"
      );
      callback(
        createServiceError(status.INTERNAL, "Failed to ensure customer profile")
      );
    }
  };

  const registerGuestHandler: UnaryHandler<
    RegisterGuestRequest,
    RegisterGuestResponse
  > = async (call, callback) => {
    const guestId = call.request.guest_id;
    const deviceId = call.request.device_id;
    if (!guestId || !deviceId) {
      callback(
        createServiceError(
          status.INVALID_ARGUMENT,
          "guest_id and device_id are required"
        )
      );
      return;
    }

    try {
      const result = await registerGuestProfile({
        prisma: handlerContext.prisma,
        guestId,
        deviceId,
      });

      callback(null, {
        guest_profile_id: result.guestProfileId,
        device_identity_id: result.deviceIdentityId,
        status: toGuestProfileStatus(result.status),
        customer_id: result.customerId ?? "",
      });
    } catch (error) {
      handlerContext.app.log.error(
        { err: error, guestId, deviceId },
        "Failed to register guest profile"
      );
      callback(createServiceError(status.INTERNAL, "Failed to register guest"));
    }
  };

  server.addService(userPackage.UserService.service, {
    GetUserContext: wrapAuthorization(getUserContextHandler),
    AssignRole: wrapAuthorization(assignRoleHandler),
    RevokeRole: wrapAuthorization(revokeRoleHandler),
    ListRoles: wrapAuthorization(listRolesHandler),
    EnsureCustomerProfile: wrapAuthorization(ensureCustomerProfileHandler),
    RegisterGuest: wrapAuthorization(registerGuestHandler),
  });

  await new Promise<void>((resolve, reject) => {
    server.bindAsync(
      config.GRPC_BIND_ADDRESS,
      ServerCredentials.createInsecure(),
      (err) => {
        if (err) {
          reject(err);
          return;
        }
        resolve();
      }
    );
  });

  server.start();
  handlerContext.app.log.info(
    { bind: config.GRPC_BIND_ADDRESS },
    "UserService gRPC listening"
  );
  return server;
}

export async function stopGrpcServer(server: Server) {
  await new Promise<void>((resolve, reject) => {
    server.tryShutdown((err) => {
      if (err) {
        reject(err);
        return;
      }
      resolve();
    });
  });
}
