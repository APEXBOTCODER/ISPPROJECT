#!/usr/bin/env bash
#
# Off-box backup of the SQLite database to Amazon S3.
#
# Takes a CONSISTENT online snapshot (safe even while the app is writing, incl.
# WAL mode), verifies its integrity, gzips it, and uploads it to S3 under a
# timestamped key. Retention is handled by an S3 lifecycle rule (see setup docs)
# so a compromised server key — which is write-only — cannot delete old backups.
#
# Configure via environment variables (e.g. in the cron line or a small env file):
#   DB_FILE             path to the live SQLite DB   (e.g. /home/ubuntu/ISPPROJECT/website/prisma/prod.db)
#   BACKUP_S3_BUCKET    target bucket name            (required)
#   BACKUP_S3_PREFIX    key prefix                    (default: db-backups)
#   BACKUP_AWS_PROFILE  aws CLI profile to use        (default: isp-backup)
#   AWS_REGION          bucket region                 (default: us-east-1)
#
set -euo pipefail

DB_FILE="${DB_FILE:?set DB_FILE to your live SQLite database path}"
S3_BUCKET="${BACKUP_S3_BUCKET:?set BACKUP_S3_BUCKET to your backup bucket name}"
S3_PREFIX="${BACKUP_S3_PREFIX:-db-backups}"
AWS_PROFILE_NAME="${BACKUP_AWS_PROFILE:-isp-backup}"
REGION="${AWS_REGION:-us-east-1}"

command -v sqlite3 >/dev/null || { echo "[backup] sqlite3 not installed (sudo apt install -y sqlite3)"; exit 1; }
command -v aws >/dev/null     || { echo "[backup] aws CLI not installed"; exit 1; }
[ -f "$DB_FILE" ]             || { echo "[backup] DB file not found: $DB_FILE"; exit 1; }

ts="$(date -u +%Y%m%d-%H%M%S)"
work="$(mktemp -d "${TMPDIR:-/tmp}/ispbackup.XXXXXX")"
trap 'rm -rf "$work"' EXIT
snap="$work/prod-$ts.db"

# 1. Consistent online snapshot.
sqlite3 "$DB_FILE" ".backup '$snap'"

# 2. Integrity check — never ship a corrupt backup.
if [ "$(sqlite3 "$snap" 'PRAGMA integrity_check;')" != "ok" ]; then
  echo "[backup] integrity_check FAILED — aborting" >&2
  exit 1
fi

# 3. Compress + upload.
gzip -9 "$snap"
key="$S3_PREFIX/prod-$ts.db.gz"
aws --profile "$AWS_PROFILE_NAME" --region "$REGION" s3 cp "$snap.gz" "s3://$S3_BUCKET/$key" --only-show-errors

echo "[backup] ok: s3://$S3_BUCKET/$key ($(du -h "$snap.gz" | cut -f1))"
