import { z } from "zod";

export const permissionSchema = z.object({
  id: z.string().uuid(),
  resource: z.string(),
  action: z.string(),
  description: z.string().optional(),
});

export const roleSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  description: z.string().optional(),
  isSystem: z.boolean(),
  permissions: z.array(permissionSchema),
});

export const roleAssignmentSchema = z.object({
  assignmentId: z.string().uuid(),
  userId: z.string().uuid("userId must be a valid UUID"),
  scope: z.string().optional(),
  grantedBy: z.string().optional(),
  active: z.boolean(),
  revokedAt: z.string().optional(),
  role: roleSchema,
});

export const userContextSchema = z.object({
  userId: z.string().uuid("userId must be a valid UUID"),
  roles: z.array(roleSchema),
  permissions: z.array(permissionSchema),
  assignments: z.array(roleAssignmentSchema),
});

export const userIdParamsSchema = z.object({
  userId: z.string().uuid("userId must be a valid UUID"),
});

export const assignRoleBodySchema = z.object({
  roleId: z.string().uuid("roleId must be a valid UUID"),
  scope: z.string().min(1).max(128).optional(),
  grantedBy: z.string().uuid("grantedBy must be a valid UUID").optional(),
});

export const assignRoleResponseSchema = z.object({
  assignment: roleAssignmentSchema,
});

export const revokeRoleParamsSchema = z.object({
  userId: z.string().uuid("userId must be a valid UUID"),
  assignmentId: z.string().uuid("assignmentId must be a valid UUID"),
});

export const listRolesResponseSchema = z.object({
  roles: z.array(roleSchema),
});
