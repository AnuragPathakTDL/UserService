export interface PermissionDTO {
  id: string;
  resource: string;
  action: string;
  description?: string;
}

export interface RoleDTO {
  id: string;
  name: string;
  description?: string;
  permissions: PermissionDTO[];
  isSystem: boolean;
}

export interface RoleAssignmentDTO {
  assignmentId: string;
  userId: string;
  role: RoleDTO;
  scope?: string;
  grantedBy?: string;
  active: boolean;
  revokedAt?: Date | null;
}

export interface UserContextDTO {
  userId: string;
  roles: RoleDTO[];
  permissions: PermissionDTO[];
  assignments: RoleAssignmentDTO[];
}
