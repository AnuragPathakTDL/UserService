import fp from "fastify-plugin";
import type { FastifyInstance } from "fastify";
import {
  assignRole,
  getUserContext,
  listRoles,
  revokeRole,
} from "../services/rbac";
import {
  assignRoleBodySchema,
  revokeRoleParamsSchema,
  userIdParamsSchema,
} from "../schemas/rbac";
import {
  serializeAssignment,
  serializeRole,
  serializeUserContext,
} from "../utils/serialize";
import { isAdminVerificationError } from "../types/auth-service";

export default fp(async function adminUserRoutes(fastify: FastifyInstance) {
  fastify.get("/users/:userId/context", {
    schema: {
      params: userIdParamsSchema,
    },
    handler: async (request) => {
      const params = userIdParamsSchema.parse(request.params);
      const context = await getUserContext(
        request.server.prisma,
        params.userId
      );
      return serializeUserContext(context);
    },
  });

  fastify.post("/users/:userId/roles", {
    schema: {
      params: userIdParamsSchema,
      body: assignRoleBodySchema,
    },
    handler: async (request, reply) => {
      const params = userIdParamsSchema.parse(request.params);
      const body = assignRoleBodySchema.parse(request.body);
      if (!request.server.authService.isEnabled) {
        throw request.server.httpErrors.serviceUnavailable(
          "AuthService integration is required for assigning roles"
        );
      }
      try {
        await request.server.authService.ensureAdminUser(params.userId);
      } catch (error) {
        if (isAdminVerificationError(error)) {
          if (error.reason === "NOT_FOUND") {
            throw request.server.httpErrors.notFound(error.message);
          }
          if (error.reason === "NOT_ADMIN") {
            throw request.server.httpErrors.forbidden(error.message);
          }
          if (error.reason === "INACTIVE") {
            throw request.server.httpErrors.conflict(error.message);
          }
        }
        request.log.error(
          { err: error, userId: params.userId },
          "Failed to verify admin user with AuthService"
        );
        throw request.server.httpErrors.internalServerError();
      }
      const assignment = await assignRole(request.server.prisma, {
        userId: params.userId,
        roleId: body.roleId,
        scope: body.scope,
        grantedBy: body.grantedBy,
      });
      return reply.code(201).send({
        assignment: serializeAssignment(assignment),
      });
    },
  });

  fastify.delete("/users/:userId/roles/:assignmentId", {
    schema: {
      params: revokeRoleParamsSchema,
    },
    handler: async (request, reply) => {
      const params = revokeRoleParamsSchema.parse(request.params);
      await revokeRole(request.server.prisma, {
        assignmentId: params.assignmentId,
        revokedBy: undefined,
      });
      return reply.code(204).send();
    },
  });

  fastify.get("/roles", {
    schema: {},
    handler: async (request) => {
      const roles = await listRoles(request.server.prisma);
      return {
        roles: roles.map(serializeRole),
      };
    },
  });
});
