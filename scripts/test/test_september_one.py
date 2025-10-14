#!/usr/bin/env python3
"""
9월 1명 등록 테스트: 이미영 아래
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
    print("🚀 9월 1명 등록 테스트 시작\n")

    # 로그인
    cookies = login()
    if not cookies:
        return

    # 9월 1명째: 강민수 (이미영 오른쪽)
    print("\n" + "="*80)
    print("9월 1명째: 강민수 (이미영 오른쪽)")
    print("="*80)

    user1 = {
        "registrationDate": "2025-09-01",
        "name": "강민수",
        "phone": "010-6666-6666",
        "salesperson": "이미영",
        "bank": "농협",
        "accountNumber": "623456789012"
    }

    if not register_user(cookies, user1):
        return

    print("\n⏸️  서버 로그를 확인하세요!")
    print("   - 9월 첫 등록 확인?")
    print("   - 8월 추가지급 생성 확인? (박철수, 최영희, 정민수, 김영수)")
    print("   - 7월+8월+9월 병행 지급 확인?")

    print("\n" + "="*80)
    print("✅ 9월 등록 완료!")
    print("="*80)

if __name__ == "__main__":
    main()
