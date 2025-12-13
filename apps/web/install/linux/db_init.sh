#!/usr/bin/env bash
set -euo pipefail

# 기본값
MONGO_URI="${MONGO_URI:-mongodb://localhost:27017}"
DB_NAME="${DB_NAME:-nanumpay}"
ADMIN_LOGIN_ID="${ADMIN_LOGIN_ID:-관리자}"
ADMIN_NAME="${ADMIN_NAME:-관리자}"
ADMIN_PASSWORD="${ADMIN_PASSWORD:-admin1234!!}"
ROLE="${ROLE:-admin}"
FORCE="${FORCE:-false}"        # true/false
BCRYPT_COST="${BCRYPT_COST:-10}"
BCRYPT_HASH="${BCRYPT_HASH:-}"

DB_DIR="${DB_DIR:-/opt/nanumpay/db}"  # init.mongo.js, JSON이 설치될 위치

usage() {
  echo "Usage: sudo /opt/nanumpay/tools/db_init.sh [--uri=URI] [--db=NAME] [--loginId=ID] [--name=NAME] [--role=ROLE] [--password=PWD | --hash=BCRYPT] [--force] [--cost=N]"
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

# 연결 URI 처리 - 단순화
# mongodb://localhost:27017 → mongodb://localhost:27017/nanumpay
if [[ "$MONGO_URI" == */ ]]; then
  # 마지막에 /가 있으면 제거하고 DB 추가
  CONNECT_URI="${MONGO_URI%/}/$DB_NAME"
elif [[ "$MONGO_URI" == *:27017 ]] || [[ "$MONGO_URI" == mongodb://localhost ]]; then
  # 포트만 있거나 기본 URI면 DB 추가
  CONNECT_URI="$MONGO_URI/$DB_NAME"
else
  # 이미 DB가 포함된 경우 그대로 사용
  CONNECT_URI="$MONGO_URI"
fi

# db 디렉토리에서 실행 (상대 경로 JSON 로딩)
cd "$DB_DIR"

# 관리자 존재 여부 확인 (FORCE가 아닌 경우)
if [ "$FORCE" != "true" ]; then
    ADMIN_EXISTS=$("$MONGO_SHELL" $CONNECT_URI --quiet --eval "db.admins.countDocuments({loginId: '$ADMIN_LOGIN_ID'})")
    if [ "$ADMIN_EXISTS" -gt 0 ]; then
        echo "[init] Admin '$ADMIN_LOGIN_ID' already exists. Skipping initialization."
        echo "[init] Use --force to reinitialize."
        exit 0
    fi
fi

# FORCE 모드일 때 uploads 폴더 삭제
if [ "$FORCE" == "true" ]; then
    # DB_DIR 기준으로 프로젝트 루트의 uploads 폴더 찾기
    # DB_DIR이 apps/web/install/linux/db 인 경우 → 프로젝트 루트는 5단계 상위
    PROJECT_ROOT="$(cd "$DB_DIR/../../../../.." 2>/dev/null && pwd)"
    UPLOADS_DIR="${UPLOADS_DIR:-$PROJECT_ROOT/uploads}"

    if [ -d "$UPLOADS_DIR" ]; then
        echo "[init] Clearing uploads directory: $UPLOADS_DIR"
        rm -rf "$UPLOADS_DIR"/*
        echo "[init] Uploads cleared."
    fi
fi

echo "[init] connecting: $CONNECT_URI"
"$MONGO_SHELL" $CONNECT_URI --quiet \
  --eval "var DB_NAME='$DB_NAME', ADMIN_LOGIN_ID='$ADMIN_LOGIN_ID', ADMIN_NAME='$ADMIN_NAME', ADMIN_HASH='$BCRYPT', ROLE='$ROLE', FORCE=$FORCE;" \
  --file "./init.mongo.js"

echo "[init] done."
