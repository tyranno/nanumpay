#!/usr/bin/env python3
"""
개별 등록 테스트 스크립트
한 명씩 등록하면서 processBatch 분류 로직 점검
"""

import requests
import json

BASE_URL = "http://localhost:3100"

def login():
    """관리자 로그인"""
    response = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={
            "loginId": "관리자",
            "password": "admin1234!!"
        }
    )
    if response.status_code == 200:
        print("✅ 로그인 성공")
        return response.cookies
    else:
        print(f"❌ 로그인 실패: {response.status_code}")
        print(response.text)
        return None

def register_user(cookies, user_data):
    """개별 사용자 등록"""
    print(f"\n{'='*60}")
    print(f"📝 등록 시작: {user_data['name']}")
    print(f"{'='*60}")

    response = requests.post(
        f"{BASE_URL}/api/admin/users/register",
        json=user_data,
        cookies=cookies
    )

    if response.status_code == 200:
        result = response.json()
        print(f"✅ 등록 성공: {user_data['name']}")
        print(f"   등급: {result.get('user', {}).get('grade', 'N/A')}")
        return True
    else:
        print(f"❌ 등록 실패: {response.status_code}")
        print(response.text)
        return False

def main():
    print("🚀 개별 등록 테스트 시작\n")

    # 로그인
    cookies = login()
    if not cookies:
        return

    # 7월 1명째: 사장님
    print("\n" + "="*80)
    print("7월 1명째: 사장님 (루트)")
    print("="*80)

    user1 = {
        "registrationDate": "2025-07-01",
        "name": "사장님",
        "phone": "010-1234-5678",
        "salesperson": "-",
        "bank": "국민은행",
        "accountNumber": "123456789012"
    }

    if not register_user(cookies, user1):
        return

    print("\n⏸️  서버 로그 확인:")
    print("   - processBatch 호출됨?")
    print("   - 월별 분류: 2025-07?")
    print("   - 등록자/승급자/추가지급 분류?")

    # 7월 2명째: 김영수
    print("\n" + "="*80)
    print("7월 2명째: 김영수 (사장님 왼쪽)")
    print("="*80)

    user2 = {
        "registrationDate": "2025-07-01",
        "name": "김영수",
        "phone": "010-2222-2222",
        "salesperson": "사장님",
        "bank": "신한은행",
        "accountNumber": "223456789012"
    }

    if not register_user(cookies, user2):
        return

    print("\n⏸️  서버 로그 확인:")
    print("   - 사장님 승급: F1 → F2?")
    print("   - 승급자 분류 확인?")

    # 7월 3명째: 이미영
    print("\n" + "="*80)
    print("7월 3명째: 이미영 (사장님 오른쪽)")
    print("="*80)

    user3 = {
        "registrationDate": "2025-07-02",
        "name": "이미영",
        "phone": "010-3333-3333",
        "salesperson": "사장님",
        "bank": "우리은행",
        "accountNumber": "323456789012"
    }

    if not register_user(cookies, user3):
        return

    print("\n⏸️  서버 로그를 확인하세요!")
    print("   - 7월 총 3명 등록 확인?")
    print("   - 등급 분포: F1=2, F2=1?")

    print("\n" + "="*80)
    print("✅ 7월 등록 완료!")
    print("="*80)

if __name__ == "__main__":
    main()
