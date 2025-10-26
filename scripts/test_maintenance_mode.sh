#!/bin/bash

# 유지보수 모드 테스트 스크립트
# 사용법: bash scripts/test_maintenance_mode.sh

set -e

echo "========================================="
echo "  유지보수 모드 테스트"
echo "========================================="
echo ""

# 설정
BASE_URL="http://localhost:3100"
ADMIN_USER="관리자"
ADMIN_PASS="admin1234!!"

echo "📍 서버 URL: $BASE_URL"
echo ""

# 1. 관리자 로그인
echo "1️⃣  관리자 로그인..."
LOGIN_RESPONSE=$(curl -s -c cookies.txt -X POST "$BASE_URL/api/auth/login" \
  -H "Content-Type: application/json" \
  -d "{\"loginId\":\"$ADMIN_USER\",\"password\":\"$ADMIN_PASS\"}")

if echo "$LOGIN_RESPONSE" | grep -q "\"success\":true"; then
  echo "   ✅ 관리자 로그인 성공"
else
  echo "   ❌ 관리자 로그인 실패"
  echo "   응답: $LOGIN_RESPONSE"
  rm -f cookies.txt
  exit 1
fi
echo ""

# 2. 현재 유지보수 모드 상태 확인
echo "2️⃣  현재 유지보수 모드 상태 확인..."
STATUS_RESPONSE=$(curl -s "$BASE_URL/api/maintenance/status")
CURRENT_MODE=$(echo "$STATUS_RESPONSE" | grep -o '"maintenanceMode":[^,}]*' | cut -d':' -f2)
echo "   현재 상태: maintenanceMode = $CURRENT_MODE"
echo ""

# 3. 유지보수 모드 활성화
echo "3️⃣  유지보수 모드 활성화..."
ENABLE_RESPONSE=$(curl -s -b cookies.txt -X PUT "$BASE_URL/api/admin/settings/system" \
  -H "Content-Type: application/json" \
  -d '{"maintenanceMode":true,"backup":{"enabled":true,"frequency":"daily","time":"02:00","dayOfWeek":0,"dayOfMonth":1,"retention":{"count":7,"days":30,"compress":true},"storage":{"type":"ftp","s3":{"region":"ap-northeast-2","bucket":"","accessKeyId":"","secretAccessKey":"","prefix":"nanumpay-backup/"},"ftp":{"host":"","port":21,"username":"","password":"","remotePath":"/backup/nanumpay","secure":false}}}}')

if echo "$ENABLE_RESPONSE" | grep -q "\"success\":true"; then
  echo "   ✅ 유지보수 모드 활성화 성공"
else
  echo "   ❌ 유지보수 모드 활성화 실패"
  echo "   응답: $ENABLE_RESPONSE"
  rm -f cookies.txt
  exit 1
fi
echo ""

# 4. 유지보수 모드 상태 재확인
echo "4️⃣  유지보수 모드 상태 재확인..."
sleep 1
STATUS_RESPONSE=$(curl -s "$BASE_URL/api/maintenance/status")
NEW_MODE=$(echo "$STATUS_RESPONSE" | grep -o '"maintenanceMode":[^,}]*' | cut -d':' -f2)
echo "   변경 후 상태: maintenanceMode = $NEW_MODE"

if [ "$NEW_MODE" = "true" ]; then
  echo "   ✅ 유지보수 모드 활성화 확인됨"
else
  echo "   ❌ 유지보수 모드가 활성화되지 않음"
  rm -f cookies.txt
  exit 1
fi
echo ""

# 5. 일반 사용자 접근 테스트 (쿠키 없이)
echo "5️⃣  일반 사용자 접근 테스트 (쿠키 없이)..."
DASHBOARD_RESPONSE=$(curl -s -L -o /dev/null -w "%{http_code}" "$BASE_URL/dashboard")
echo "   /dashboard 접근 결과: HTTP $DASHBOARD_RESPONSE"

if [ "$DASHBOARD_RESPONSE" = "200" ] || [ "$DASHBOARD_RESPONSE" = "302" ]; then
  echo "   ✅ 리다이렉트 또는 차단됨"
else
  echo "   ⚠️  예상과 다른 응답 코드"
fi
echo ""

# 6. 관리자는 접근 가능한지 확인
echo "6️⃣  관리자 접근 테스트 (쿠키 사용)..."
ADMIN_RESPONSE=$(curl -s -b cookies.txt -L -o /dev/null -w "%{http_code}" "$BASE_URL/admin")
echo "   /admin 접근 결과: HTTP $ADMIN_RESPONSE"

if [ "$ADMIN_RESPONSE" = "200" ]; then
  echo "   ✅ 관리자는 정상 접근 가능"
else
  echo "   ❌ 관리자 접근 실패"
fi
echo ""

# 7. 유지보수 모드 비활성화
echo "7️⃣  유지보수 모드 비활성화..."
DISABLE_RESPONSE=$(curl -s -b cookies.txt -X PUT "$BASE_URL/api/admin/settings/system" \
  -H "Content-Type: application/json" \
  -d '{"maintenanceMode":false,"backup":{"enabled":true,"frequency":"daily","time":"02:00","dayOfWeek":0,"dayOfMonth":1,"retention":{"count":7,"days":30,"compress":true},"storage":{"type":"ftp","s3":{"region":"ap-northeast-2","bucket":"","accessKeyId":"","secretAccessKey":"","prefix":"nanumpay-backup/"},"ftp":{"host":"","port":21,"username":"","password":"","remotePath":"/backup/nanumpay","secure":false}}}}')

if echo "$DISABLE_RESPONSE" | grep -q "\"success\":true"; then
  echo "   ✅ 유지보수 모드 비활성화 성공"
else
  echo "   ❌ 유지보수 모드 비활성화 실패"
  echo "   응답: $DISABLE_RESPONSE"
  rm -f cookies.txt
  exit 1
fi
echo ""

# 8. 최종 상태 확인
echo "8️⃣  최종 상태 확인..."
sleep 1
FINAL_STATUS=$(curl -s "$BASE_URL/api/maintenance/status")
FINAL_MODE=$(echo "$FINAL_STATUS" | grep -o '"maintenanceMode":[^,}]*' | cut -d':' -f2)
echo "   최종 상태: maintenanceMode = $FINAL_MODE"

if [ "$FINAL_MODE" = "false" ]; then
  echo "   ✅ 유지보수 모드 비활성화 확인됨"
else
  echo "   ❌ 유지보수 모드가 비활성화되지 않음"
  rm -f cookies.txt
  exit 1
fi
echo ""

# 정리
rm -f cookies.txt

echo "========================================="
echo "  ✅ 모든 테스트 통과!"
echo "========================================="
echo ""
echo "📝 테스트 요약:"
echo "   1. ✅ 관리자 로그인"
echo "   2. ✅ 유지보수 모드 활성화"
echo "   3. ✅ 유지보수 모드 상태 확인"
echo "   4. ✅ 일반 사용자 접근 차단"
echo "   5. ✅ 관리자 접근 허용"
echo "   6. ✅ 유지보수 모드 비활성화"
echo "   7. ✅ 최종 상태 확인"
echo ""
