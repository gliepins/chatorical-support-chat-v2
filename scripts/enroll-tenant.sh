#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

ENV_FILE_LOCAL="$SCRIPT_DIR/enroll_tenant.env"
ENV_FILE_SYSTEM="/etc/chatorical/support-chat-v2.env"

if [[ ! -f "$ENV_FILE_LOCAL" ]]; then
  echo "Missing $ENV_FILE_LOCAL. Copy enroll_tenant.env.example to enroll_tenant.env and fill in values." >&2
  exit 1
fi

# Load local enrollment values
set -a
. "$ENV_FILE_LOCAL"
set +a

# Auto-generate secrets if missing
if [[ -z "${WEBHOOK_SECRET:-}" ]]; then
  WEBHOOK_SECRET="$(openssl rand -hex 32)"
  export WEBHOOK_SECRET
fi
if [[ -z "${HEADER_SECRET:-}" ]]; then
  HEADER_SECRET="$(openssl rand -hex 32)"
  export HEADER_SECRET
fi

# Load system env for DATABASE_URL etc. if not already set
if [[ -z "${DATABASE_URL:-}" && -r "$ENV_FILE_SYSTEM" ]]; then
  set -a
  . "$ENV_FILE_SYSTEM"
  set +a
fi

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "DATABASE_URL not set. Set it in environment or run this script with sudo so it can read $ENV_FILE_SYSTEM." >&2
  exit 1
fi

# Validate required
if [[ -z "${SLUG:-}" || -z "${NAME:-}" ]]; then
  echo "SLUG and NAME are required in $ENV_FILE_LOCAL" >&2
  exit 1
fi

cd "$PROJECT_ROOT"

# Run the enrollment TypeScript script; it will use env vars from this shell
WEBHOOK_BASE="${WEBHOOK_BASE:-${PUBLIC_ORIGIN:-}}" \
npx -y ts-node src/scripts/enroll_tenant.ts


