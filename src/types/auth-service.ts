export interface AuthServiceUser {
  id: string;
  email: string;
  role: string;
  userType: string;
  active: boolean;
}

export type AdminVerificationReason = "NOT_FOUND" | "NOT_ADMIN" | "INACTIVE";

export class AdminVerificationError extends Error {
  public readonly reason: AdminVerificationReason;

  constructor(reason: AdminVerificationReason, message?: string) {
    super(message ?? `Admin verification failed: ${reason}`);
    this.name = "AdminVerificationError";
    this.reason = reason;
  }
}

export function isAdminVerificationError(
  value: unknown
): value is AdminVerificationError {
  return value instanceof AdminVerificationError;
}

export interface AuthServiceIntegration {
  isEnabled: boolean;
  getUserById(userId: string): Promise<AuthServiceUser>;
  ensureAdminUser(userId: string): Promise<AuthServiceUser>;
}
