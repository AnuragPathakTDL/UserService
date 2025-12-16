import type { PrismaClient } from "@prisma/client";
import type {
  PermissionDTO,
  RoleAssignmentDTO,
  RoleDTO,
  UserContextDTO,
} from "../types/rbac";

function mapPermission(permission: {
  id: string;
  resource: string;
  action: string;
  description: string | null;
}): PermissionDTO {
  return {
    id: permission.id,
    resource: permission.resource,
    action: permission.action,
    description: permission.description ?? undefined,
  };
}

function mapRole(role: {
  id: string;
  name: string;
  description: string | null;
  isSystem: boolean;
  permissions: Array<{
    permission: {
      id: string;
      resource: string;
      action: string;
      description: string | null;
    };
  }>;
}): RoleDTO {
  return {
    id: role.id,
    name: role.name,
    description: role.description ?? undefined,
    isSystem: role.isSystem,
    permissions: role.permissions.map((rp) => mapPermission(rp.permission)),
  };
}

function mapAssignment(assignment: {
  id: string;
  userId: string;
  scope: string | null;
  grantedBy: string | null;
  isActive: boolean;
  revokedAt: Date | null;
  role: {
    id: string;
    name: string;
    description: string | null;
    isSystem: boolean;
    permissions: Array<{
      permission: {
        id: string;
        resource: string;
        action: string;
        description: string | null;
      };
    }>;
  };
}): RoleAssignmentDTO {
  return {
    assignmentId: assignment.id,
    userId: assignment.userId,
    scope: assignment.scope ?? undefined,
    grantedBy: assignment.grantedBy ?? undefined,
    active: assignment.isActive,
    revokedAt: assignment.revokedAt,
    role: mapRole(assignment.role),
  };
}

export async function getUserContext(
  prisma: PrismaClient,
  userId: string
): Promise<UserContextDTO> {
  const assignments = await prisma.userRoleAssignment.findMany({
    where: { userId },
    include: {
      role: {
        include: {
          permissions: {
            include: {
              permission: true,
            },
          },
        },
      },
    },
    orderBy: {
      createdAt: "asc",
    },
  });

  const mappedAssignments = assignments.map((assignment) =>
    mapAssignment(assignment)
  );

  const roles: RoleDTO[] = [];
  const seenRoles = new Set<string>();

  for (const assignment of mappedAssignments) {
    if (!seenRoles.has(assignment.role.id)) {
      roles.push(assignment.role);
      seenRoles.add(assignment.role.id);
    }
  }

  const permissionsMap = new Map<string, PermissionDTO>();
  for (const role of roles) {
    for (const permission of role.permissions) {
      permissionsMap.set(permission.id, permission);
    }
  }

  return {
    userId,
    roles,
    permissions: Array.from(permissionsMap.values()),
    assignments: mappedAssignments,
  };
}

export async function assignRole(
  prisma: PrismaClient,
  params: {
    userId: string;
    roleId: string;
    scope?: string;
    grantedBy?: string;
  }
): Promise<RoleAssignmentDTO> {
  const { userId, roleId, scope, grantedBy } = params;

  const existing = await prisma.userRoleAssignment.findFirst({
    where: {
      userId,
      roleId,
      scope: scope ?? null,
    },
  });

  const assignment = existing
    ? await prisma.userRoleAssignment.update({
        where: { id: existing.id },
        data: {
          isActive: true,
          revokedAt: null,
          grantedBy: grantedBy ?? existing.grantedBy,
        },
        include: {
          role: {
            include: {
              permissions: {
                include: {
                  permission: true,
                },
              },
            },
          },
        },
      })
    : await prisma.userRoleAssignment.create({
        data: {
          userId,
          roleId,
          scope,
          grantedBy,
        },
        include: {
          role: {
            include: {
              permissions: {
                include: {
                  permission: true,
                },
              },
            },
          },
        },
      });

  return mapAssignment(assignment);
}

export async function revokeRole(
  prisma: PrismaClient,
  params: {
    assignmentId: string;
    revokedBy?: string;
  }
): Promise<void> {
  const { assignmentId, revokedBy } = params;

  await prisma.userRoleAssignment.update({
    where: { id: assignmentId },
    data: {
      isActive: false,
      revokedAt: new Date(),
      grantedBy: revokedBy,
    },
  });
}

export async function listRoles(prisma: PrismaClient): Promise<RoleDTO[]> {
  const roles = await prisma.role.findMany({
    include: {
      permissions: {
        include: {
          permission: true,
        },
      },
    },
    orderBy: {
      name: "asc",
    },
  });

  return roles.map((role) => mapRole(role));
}
