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
  assignRoleResponseSchema,
  listRolesResponseSchema,
  revokeRoleParamsSchema,
  userContextSchema,
  userIdParamsSchema,
} from "../schemas/rbac";
import {
  serializeAssignment,
  serializeRole,
  serializeUserContext,
} from "../utils/serialize";

export default fp(async function adminUserRoutes(fastify: FastifyInstance) {
  fastify.get("/users/:userId/context", {
    schema: {
      params: userIdParamsSchema,
      response: {
        200: userContextSchema,
      },
    },
    handler: async (request) => {
      const params = userIdParamsSchema.parse(request.params);
      const context = await getUserContext(request.server.prisma, params.userId);
      return serializeUserContext(context);
    },
  });

  fastify.post("/users/:userId/roles", {
    schema: {
      params: userIdParamsSchema,
      body: assignRoleBodySchema,
      response: {
        201: assignRoleResponseSchema,
      },
    },
    handler: async (request, reply) => {
      const params = userIdParamsSchema.parse(request.params);
      const body = assignRoleBodySchema.parse(request.body);
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
      response: {
        204: { type: "null" },
      },
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
    schema: {
      response: {
        200: listRolesResponseSchema,
      },
    },
    handler: async (request) => {
      const roles = await listRoles(request.server.prisma);
      return {
        roles: roles.map(serializeRole),
      };
    },
  });
});
