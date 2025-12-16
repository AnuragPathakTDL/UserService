import type { PrismaClient } from "@prisma/client";

type PermissionDefinition = {
  key: string;
  resource: string;
  action: string;
  description: string;
};

type RoleDefinition = {
  name: string;
  description: string;
  permissions: string[];
};

const PERMISSIONS: PermissionDefinition[] = [
  {
    key: "dashboard:view",
    resource: "dashboard",
    action: "view",
    description: "Access the administrative dashboard overview.",
  },
  {
    key: "users:manage",
    resource: "users",
    action: "manage",
    description: "Activate or deactivate platform users.",
  },
  {
    key: "transactions:manage",
    resource: "transactions",
    action: "manage",
    description: "Review and manage financial transactions.",
  },
  {
    key: "subscriptions:manage",
    resource: "subscriptions",
    action: "manage",
    description: "Manage subscription plans and assignments.",
  },
  {
    key: "advisor:access",
    resource: "advisor",
    action: "access",
    description: "Access advisor insights and tooling.",
  },
  {
    key: "admin:manage",
    resource: "admin_management",
    action: "manage",
    description: "Manage administrator accounts and privileges.",
  },
  {
    key: "roles:manage",
    resource: "role_permissions",
    action: "manage",
    description: "Maintain role and permission assignments.",
  },
  {
    key: "disclosures:edit",
    resource: "disclosures",
    action: "edit",
    description: "Edit compliance disclosures and related content.",
  },
];

const ROLE_DEFINITIONS: RoleDefinition[] = [
  {
    name: "SUPER_ADMIN",
    description:
      "Super administrator with unrestricted access to manage roles, users, and disclosures.",
    permissions: PERMISSIONS.map((permission) => permission.key),
  },
  {
    name: "ADMIN",
    description:
      "Administrator with operational access to manage users, transactions, and role assignments.",
    permissions: [
      "dashboard:view",
      "users:manage",
      "transactions:manage",
      "roles:manage",
    ],
  },
  {
    name: "RIA",
    description:
      "Registered Investment Advisor with access to subscription and advisor tooling.",
    permissions: ["dashboard:view", "subscriptions:manage", "advisor:access"],
  },
  {
    name: "FINANCIAL_TEAM",
    description:
      "Finance operations role with access to transaction oversight dashboards.",
    permissions: ["dashboard:view", "transactions:manage"],
  },
];

export async function ensureSystemRoles(prisma: PrismaClient): Promise<void> {
  const permissionIds = new Map<string, string>();

  for (const definition of PERMISSIONS) {
    const existing = await prisma.permission.findUnique({
      where: {
        resource_action: {
          resource: definition.resource,
          action: definition.action,
        },
      },
    });

    if (existing) {
      if (existing.description !== definition.description) {
        await prisma.permission.update({
          where: { id: existing.id },
          data: { description: definition.description },
        });
      }
      permissionIds.set(definition.key, existing.id);
      continue;
    }

    const created = await prisma.permission.create({
      data: {
        resource: definition.resource,
        action: definition.action,
        description: definition.description,
      },
    });
    permissionIds.set(definition.key, created.id);
  }

  for (const roleDefinition of ROLE_DEFINITIONS) {
    const existingRole = await prisma.role.findUnique({
      where: { name: roleDefinition.name },
    });

    const targetRole = existingRole
      ? await prisma.role.update({
          where: { id: existingRole.id },
          data: {
            isSystem: true,
            description: roleDefinition.description,
          },
        })
      : await prisma.role.create({
          data: {
            name: roleDefinition.name,
            description: roleDefinition.description,
            isSystem: true,
          },
        });

    const roleWithPermissions = await prisma.role.findUnique({
      where: { id: targetRole.id },
      include: {
        permissions: true,
      },
    });

    const desiredPermissionIds = roleDefinition.permissions.map((key) => {
      const permissionId = permissionIds.get(key);
      if (!permissionId) {
        throw new Error(`Missing permission mapping for key ${key}`);
      }
      return permissionId;
    });

    const desiredPermissionSet = new Set(desiredPermissionIds);
    const existingAssignments = roleWithPermissions?.permissions ?? [];
    const existingPermissionSet = new Set(
      existingAssignments.map((assignment) => assignment.permissionId)
    );

    const toAdd = desiredPermissionIds.filter(
      (permissionId) => !existingPermissionSet.has(permissionId)
    );
    if (toAdd.length > 0) {
      await prisma.rolePermission.createMany({
        data: toAdd.map((permissionId) => ({
          roleId: targetRole.id,
          permissionId,
        })),
        skipDuplicates: true,
      });
    }

    const toRemove = existingAssignments
      .filter(
        (assignment) => !desiredPermissionSet.has(assignment.permissionId)
      )
      .map((assignment) => assignment.permissionId);
    if (toRemove.length > 0) {
      await prisma.rolePermission.deleteMany({
        where: {
          roleId: targetRole.id,
          permissionId: { in: toRemove },
        },
      });
    }
  }
}
