import type {
  PermissionDTO,
  RoleAssignmentDTO,
  RoleDTO,
  UserContextDTO,
} from "../types/rbac";

export interface PermissionResponse {
  id: string;
  resource: string;
  action: string;
  description?: string;
}

export interface RoleResponse {
  id: string;
  name: string;
  description?: string;
  isSystem: boolean;
  permissions: PermissionResponse[];
}

export interface RoleAssignmentResponse {
  assignmentId: string;
  userId: string;
  scope?: string;
  grantedBy?: string;
  active: boolean;
  revokedAt?: string;
  role: RoleResponse;
}

export interface UserContextResponse {
  userId: string;
  roles: RoleResponse[];
  permissions: PermissionResponse[];
  assignments: RoleAssignmentResponse[];
}

export function serializePermission(
  permission: PermissionDTO
): PermissionResponse {
  return {
    id: permission.id,
    resource: permission.resource,
    action: permission.action,
    description: permission.description,
  };
}

export function serializeRole(role: RoleDTO): RoleResponse {
  return {
    id: role.id,
    name: role.name,
    description: role.description,
    isSystem: role.isSystem,
    permissions: role.permissions.map(serializePermission),
  };
}

export function serializeAssignment(
  assignment: RoleAssignmentDTO
): RoleAssignmentResponse {
  return {
    assignmentId: assignment.assignmentId,
    userId: assignment.userId,
    scope: assignment.scope,
    grantedBy: assignment.grantedBy,
    active: assignment.active,
    revokedAt: assignment.revokedAt?.toISOString(),
    role: serializeRole(assignment.role),
  };
}

export function serializeUserContext(
  context: UserContextDTO
): UserContextResponse {
  return {
    userId: context.userId,
    roles: context.roles.map(serializeRole),
    permissions: context.permissions.map(serializePermission),
    assignments: context.assignments.map(serializeAssignment),
  };
}
