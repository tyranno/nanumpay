#!/bin/bash
# build.sh - Bun을 이용한 백업 앱 빌드

set -e

echo "🔨 NanumPay 백업 앱 빌드 시작"
echo "=============================="

# 현재 디렉토리 확인
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# Bun 설치 확인
if ! command -v bun &> /dev/null; then
    echo "❌ Bun이 설치되어 있지 않습니다."
    echo "   설치: curl -fsSL https://bun.sh/install | bash"
    exit 1
fi

echo "✅ Bun 버전: $(bun --version)"

# 의존성 설치
echo ""
echo "📦 의존성 설치 중..."
bun install

# 빌드 디렉토리 생성
echo ""
echo "📁 빌드 디렉토리 생성..."
mkdir -p build

# Bun으로 실행 파일 빌드
echo ""
echo "🔧 실행 파일 빌드 중..."
bun build --compile --outfile build/nanumpay-backup src/index.js

# 실행 권한 부여
chmod +x build/nanumpay-backup

# 파일 크기 확인
FILE_SIZE=$(du -h build/nanumpay-backup | cut -f1)
echo ""
echo "=============================="
echo "✅ 빌드 완료!"
echo "   파일: build/nanumpay-backup"
echo "   크기: $FILE_SIZE"
echo ""
echo "📝 테스트 방법:"
echo "   ./build/nanumpay-backup"
echo ""
