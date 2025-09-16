#!/usr/bin/env bash
set -euo pipefail

# 기본값
MONGO_URI="${MONGO_URI:-mongodb://localhost:27017}"
DB_NAME="${DB_NAME:-agent-tree}"
ADMIN_LOGIN_ID="${ADMIN_LOGIN_ID:-admin}"
ADMIN_NAME="${ADMIN_NAME:-관리자}"
ROLE="${ROLE:-admin}"
FORCE="${FORCE:-false}"        # true/false
BCRYPT_COST="${BCRYPT_COST:-10}"
BCRYPT_HASH="${BCRYPT_HASH:-}"

DB_DIR="${DB_DIR:-/opt/agent-tree/db}"  # init.mongo.js, JSON이 설치될 위치

usage() {
  echo "Usage: sudo /opt/agent-tree/tools/db_init.sh [--uri=URI] [--db=NAME] [--loginId=ID] [--name=NAME] [--role=ROLE] [--password=PWD | --hash=BCRYPT] [--force] [--cost=N]"
  exit 1
}

for arg in "$@"; do
  case "$arg" in
    --uri=*) MONGO_URI="${arg#*=}";;
    --db=*) DB_NAME="${arg#*=}";;
    --loginId=*) ADMIN_LOGIN_ID="${arg#*=}";;
    --name=*) ADMIN_NAME="${arg#*=}";;
    --role=*) ROLE="${arg#*=}";;
    --password=*) ADMIN_PASSWORD="${arg#*=}";;
    --hash=*) BCRYPT_HASH="${arg#*=}";;
    --force) FORCE="true";;
    --cost=*) BCRYPT_COST="${arg#*=}";;
    --help|-h) usage;;
    *) echo "Unknown arg: $arg"; usage;;
  esac
done

# bcrypt 해시 생성 (htpasswd → mkpasswd → 직접 해시)
gen_bcrypt() {
  if [[ -n "${BCRYPT_HASH:-}" ]]; then echo "$BCRYPT_HASH"; return; fi
  if [[ -n "${ADMIN_PASSWORD:-}" ]]; then
    if command -v htpasswd >/dev/null 2>&1; then
      printf "%s" "$ADMIN_PASSWORD" | htpasswd -niBC "$BCRYPT_COST" "$ADMIN_LOGIN_ID" | awk -F: '{print $2}'
      return
    fi
    if command -v mkpasswd >/dev/null 2>&1; then
      mkpasswd -m bcrypt -R "$BCRYPT_COST" "$ADMIN_PASSWORD"
      return
    fi
    echo "ERROR: bcrypt tool missing. Install apache2-utils or whois, or pass --hash." >&2
    exit 2
  fi
  echo ""  # 빈 해시면 관리자 생성 패스
}

BCRYPT="$(gen_bcrypt)"

# mongosh / mongo 탐색
MONGO_SHELL="$(command -v mongosh || true)"
[[ -z "$MONGO_SHELL" ]] && MONGO_SHELL="$(command -v mongo || true)"
[[ -z "$MONGO_SHELL" ]] && { echo "ERROR: mongosh/mongo not found"; exit 3; }

# 연결 URI
CONNECT_URI="$MONGO_URI"
[[ "$CONNECT_URI" != */* ]] && CONNECT_URI="$CONNECT_URI/$DB_NAME"

# db 디렉토리에서 실행 (상대 경로 JSON 로딩)
cd "$DB_DIR"

# /tmp 에 임시 래퍼 생성 + 자동 삭제
TMP_SCHEMA="$(mktemp /tmp/agent-tree.schema.XXXXXX.js)"
TMP_INDEXES="$(mktemp /tmp/agent-tree.indexes.XXXXXX.js)"
trap 'rm -f "$TMP_SCHEMA" "$TMP_INDEXES"' EXIT

{ echo -n 'globalThis.USERS_SCHEMA=';  cat ./schema.users.json;  echo ';'; }  > "$TMP_SCHEMA"
{ echo -n 'globalThis.USERS_INDEXES='; cat ./indexes.users.json; echo ';'; } > "$TMP_INDEXES"

echo "[init] connecting: $CONNECT_URI"
"$MONGO_SHELL" "$CONNECT_URI" --quiet \
  --eval "load('$TMP_SCHEMA'); load('$TMP_INDEXES');" \
  --eval "var DB_NAME='$DB_NAME', ADMIN_LOGIN_ID='$ADMIN_LOGIN_ID', ADMIN_NAME='$ADMIN_NAME', ADMIN_HASH='$BCRYPT', ROLE='$ROLE', FORCE=$FORCE;" \
  --file "./init.mongo.js"

echo "[init] done."
