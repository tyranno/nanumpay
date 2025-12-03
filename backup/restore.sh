#!/bin/bash

# MongoDB Restore Script for Nanumpay
# Usage: ./restore.sh [backup_file.tar.gz]

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MONGO_URI="${MONGO_URI:-mongodb://localhost:27017}"
DB_NAME="nanumpay"

# 백업 파일 찾기
if [ -n "$1" ]; then
    BACKUP_FILE="$1"
else
    # 가장 최신 백업 파일 자동 선택
    BACKUP_FILE=$(ls -t "$SCRIPT_DIR"/nanumpay-backup-*.tar.gz 2>/dev/null | head -1)
fi

if [ -z "$BACKUP_FILE" ] || [ ! -f "$BACKUP_FILE" ]; then
    echo "❌ 백업 파일을 찾을 수 없습니다."
    echo "사용법: $0 [backup_file.tar.gz]"
    exit 1
fi

echo "🗄️  Nanumpay DB Restore"
echo "========================"
echo "백업 파일: $BACKUP_FILE"
echo "대상 DB: $DB_NAME"
echo ""

# 확인 프롬프트
read -p "⚠️  기존 데이터가 덮어씌워집니다. 계속하시겠습니까? (y/N): " confirm
if [ "$confirm" != "y" ] && [ "$confirm" != "Y" ]; then
    echo "취소되었습니다."
    exit 0
fi

# 임시 디렉토리 생성
TEMP_DIR=$(mktemp -d)
trap "rm -rf $TEMP_DIR" EXIT

echo ""
echo "📦 백업 파일 압축 해제 중..."
tar -xzf "$BACKUP_FILE" -C "$TEMP_DIR"

# 압축 해제된 디렉토리 찾기
BACKUP_DIR=$(find "$TEMP_DIR" -type d -name "nanumpay-backup-*" | head -1)
if [ -z "$BACKUP_DIR" ]; then
    echo "❌ 백업 디렉토리를 찾을 수 없습니다."
    exit 1
fi

echo "🔄 MongoDB 복원 중..."
mongorestore --uri="$MONGO_URI" \
    --db="$DB_NAME" \
    --drop \
    "$BACKUP_DIR/$DB_NAME"

echo ""
echo "✅ 복원 완료!"
echo ""

# 복원된 데이터 확인
echo "📊 복원된 컬렉션:"
mongosh "$MONGO_URI/$DB_NAME" --quiet --eval "
db.getCollectionNames().forEach(function(c) {
    var count = db[c].countDocuments();
    print('  - ' + c + ': ' + count + '개');
});
"
