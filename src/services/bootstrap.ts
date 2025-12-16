import type { PrismaClient } from "@prisma/client";

const SYSTEM_ROLES: Array<{
  name: string;
  description: string;
}> = [
  {
    name: "SUPER_ADMIN",
    description:
      "Super administrator with unrestricted access to manage roles and permissions.",
  },
  {
    name: "ADMIN",
    description: "Administrator with elevated access granted by Super Admins.",
  },
];

export async function ensureSystemRoles(prisma: PrismaClient): Promise<void> {
  for (const role of SYSTEM_ROLES) {
    const existing = await prisma.role.findUnique({
      where: { name: role.name },
    });

    if (existing) {
      if (!existing.isSystem || existing.description !== role.description) {
        await prisma.role.update({
          where: { id: existing.id },
          data: {
            isSystem: true,
            description: role.description,
          },
        });
      }
      continue;
    }

    await prisma.role.create({
      data: {
        name: role.name,
        description: role.description,
        isSystem: true,
      },
    });
  }
}
