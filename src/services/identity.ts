import { GuestStatus, type PrismaClient } from "@prisma/client";

export type EnsureCustomerProfileParams = {
  prisma: PrismaClient;
  firebaseUid: string;
  phoneNumber?: string;
  deviceId: string;
  guestId?: string;
};

export type EnsureCustomerProfileResult = {
  customerId: string;
  deviceIdentityId: string;
  guestMigrated: boolean;
  guestProfileId?: string;
};

export async function ensureCustomerProfile(
  params: EnsureCustomerProfileParams
): Promise<EnsureCustomerProfileResult> {
  const { prisma, firebaseUid, phoneNumber, deviceId, guestId } = params;

  return prisma.$transaction(async (tx) => {
    const device = await tx.deviceIdentity.upsert({
      where: { deviceId },
      update: {
        lastSeenAt: new Date(),
      },
      create: {
        deviceId,
        lastSeenAt: new Date(),
      },
    });

    const existingCustomer = await tx.customerProfile.findUnique({
      where: { firebaseUid },
    });

    const customer = existingCustomer
      ? phoneNumber && existingCustomer.phoneNumber !== phoneNumber
        ? await tx.customerProfile.update({
            where: { id: existingCustomer.id },
            data: { phoneNumber },
          })
        : existingCustomer
      : await tx.customerProfile.create({
          data: {
            firebaseUid,
            phoneNumber,
          },
        });

    await tx.customerDeviceLink.upsert({
      where: {
        customerId_deviceIdentityId: {
          customerId: customer.id,
          deviceIdentityId: device.id,
        },
      },
      update: {
        lastLinkedAt: new Date(),
      },
      create: {
        customerId: customer.id,
        deviceIdentityId: device.id,
      },
    });

    let guestMigrated = false;
    let guestProfileId: string | undefined;

    if (guestId) {
      const existingGuest = await tx.guestProfile.findUnique({
        where: {
          guestId_deviceIdentityId: {
            guestId,
            deviceIdentityId: device.id,
          },
        },
      });

      if (existingGuest && existingGuest.status !== GuestStatus.MIGRATED) {
        const migratedGuest = await tx.guestProfile.update({
          where: {
            guestId_deviceIdentityId: {
              guestId,
              deviceIdentityId: device.id,
            },
          },
          data: {
            status: GuestStatus.MIGRATED,
            customerId: customer.id,
            migratedAt: new Date(),
          },
        });
        guestMigrated = true;
        guestProfileId = migratedGuest.id;
      } else if (existingGuest) {
        guestMigrated = existingGuest.status === GuestStatus.MIGRATED;
        guestProfileId = existingGuest.id;
      }
    }

    return {
      customerId: customer.id,
      deviceIdentityId: device.id,
      guestMigrated,
      guestProfileId,
    } satisfies EnsureCustomerProfileResult;
  });
}

export type RegisterGuestProfileParams = {
  prisma: PrismaClient;
  guestId: string;
  deviceId: string;
};

export type RegisterGuestProfileResult = {
  guestProfileId: string;
  deviceIdentityId: string;
  status: GuestStatus;
  customerId?: string;
};

export async function registerGuestProfile(
  params: RegisterGuestProfileParams
): Promise<RegisterGuestProfileResult> {
  const { prisma, guestId, deviceId } = params;

  return prisma.$transaction(async (tx) => {
    const device = await tx.deviceIdentity.upsert({
      where: { deviceId },
      update: {
        lastSeenAt: new Date(),
      },
      create: {
        deviceId,
        lastSeenAt: new Date(),
      },
    });

    const guest = await tx.guestProfile.findUnique({
      where: {
        guestId_deviceIdentityId: {
          guestId,
          deviceIdentityId: device.id,
        },
      },
    });

    if (guest) {
      return {
        guestProfileId: guest.id,
        deviceIdentityId: device.id,
        status: guest.status,
        customerId: guest.customerId ?? undefined,
      } satisfies RegisterGuestProfileResult;
    }

    const createdGuest = await tx.guestProfile.create({
      data: {
        guestId,
        deviceIdentityId: device.id,
      },
    });

    return {
      guestProfileId: createdGuest.id,
      deviceIdentityId: device.id,
      status: GuestStatus.ACTIVE,
    } satisfies RegisterGuestProfileResult;
  });
}
