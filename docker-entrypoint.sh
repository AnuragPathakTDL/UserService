#!/bin/sh
set -euo pipefail

if [ -z "${DATABASE_URL:-}" ]; then
  echo "DATABASE_URL must be set" >&2
  exit 1
fi

if [ -d "./prisma/migrations" ] && [ "$(ls -A ./prisma/migrations)" ]; then
  echo "Running Prisma migrations..."
  npx prisma migrate deploy --schema="prisma/schema.prisma"
else
  echo "No Prisma migrations found; syncing schema with prisma db push..."
  npx prisma db push --skip-generate --schema="prisma/schema.prisma"
fi

exec node dist/server.js
