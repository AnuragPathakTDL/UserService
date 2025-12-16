# UserService

Role-Based Access Control (RBAC) service for PocketLOL. Manages roles, permissions, and user role assignments for the admin portal.

## Features

- Role management (CRUD operations)
- Permission management with resource-action model
- User role assignments with optional scope and audit trail
- Dual interface: HTTP REST API + gRPC
- Prisma-based data persistence
- TypeScript with strict typing

## Architecture

- **HTTP API**: Fastify-based REST endpoints for admin operations
- **gRPC API**: High-performance service-to-service communication
- **Database**: PostgreSQL with Prisma ORM
- **Authorization**: Optional service token authentication for gRPC endpoints

## Setup

To run UserService alongside the rest of the PocketLOL stack, execute `docker compose up --build` from the repository root (see [../README.md](../README.md)).

1. Install dependencies:

```bash
npm install
```

2. Configure environment:

```bash
cp .env.example .env
# Edit .env with your configuration
```

3. Run Prisma migrations:

```bash
npm run migrate:dev
```

4. Generate Prisma client:

```bash
npm run generate
```

## Development

```bash
npm run dev
```

## Production

```bash
npm run build
npm start
```

## API Endpoints

### HTTP REST API

- `GET /admin/users/:userId/context` - Get user's RBAC context (roles, permissions, assignments)
- `POST /admin/users/:userId/roles` - Assign role to user
- `DELETE /admin/users/:userId/roles/:assignmentId` - Revoke role assignment
- `GET /admin/roles` - List all available roles
- `GET /health` - Health check endpoint

### gRPC API

- `GetUserContext` - Retrieve user's complete RBAC context
- `AssignRole` - Create or reactivate role assignment
- `RevokeRole` - Deactivate role assignment
- `ListRoles` - Enumerate all roles with permissions

## Integration

AuthService integrates with UserService via gRPC to:

- Validate admin user role assignments during login
- Automatically assign admin roles during registration
- Fetch RBAC context for token enrichment
- Enforce that RBAC roles are only applied to AuthService users registered as `ADMIN`

Configure the following environment variables so UserService can reach AuthService:

- `AUTH_SERVICE_ADDRESS` - gRPC address for AuthService (`host:port`)
- `AUTH_SERVICE_TOKEN` - Bearer token that must match AuthService `SERVICE_AUTH_TOKEN`

## System Roles

- **SUPER_ADMIN** - Full access, including admin management, disclosures, and role maintenance
- **ADMIN** - Manage users, transactions, dashboard, and role assignments
- **RIA** - Access dashboard, subscription management, and advisor tooling
- **FINANCIAL_TEAM** - Access dashboard and transaction management

## Database Schema

- `Role` - Role definitions with system flag
- `Permission` - Resource-action permission pairs
- `RolePermission` - Many-to-many role-permission mapping
- `UserRoleAssignment` - User role assignments with audit metadata

## Environment Variables

See `.env.example` for all configuration options.

## License

Private - PocketLOL
