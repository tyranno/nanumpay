#!/usr/bin/env python3
"""
8월 등록 테스트 - 추가지급 확인
"""

import requests

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
        return None

def register_user(cookies, user_data):
    """개별 사용자 등록"""
    print(f"\n{'='*60}")
    print(f"📝 등록: {user_data['name']}")

    response = requests.post(
        f"{BASE_URL}/api/admin/users/register",
        json=user_data,
        cookies=cookies
    )

    if response.status_code == 200:
        result = response.json()
        print(f"✅ 성공: {user_data['name']} (등급: {result.get('user', {}).get('grade', 'N/A')})")
        return True
    else:
        print(f"❌ 실패: {response.status_code}")
        print(response.text)
        return False

def main():
    print("🚀 8월 등록 테스트 시작\n")

    cookies = login()
    if not cookies:
        return

    # 8월 1명째: 박철수 (김영수 왼쪽)
    print("\n" + "="*80)
    print("8월 1명째: 박철수 (김영수 왼쪽)")
    print("="*80)

    user1 = {
        "registrationDate": "2025-08-01",
        "name": "박철수",
        "phone": "010-4444-4444",
        "salesperson": "김영수",
        "bank": "국민은행",
        "accountNumber": "423456789012"
    }

    if not register_user(cookies, user1):
        return

    # 8월 2명째: 최영희 (김영수 오른쪽)
    print("\n" + "="*80)
    print("8월 2명째: 최영희 (김영수 오른쪽)")
    print("="*80)

    user2 = {
        "registrationDate": "2025-08-01",
        "name": "최영희",
        "phone": "010-5555-5555",
        "salesperson": "김영수",
        "bank": "신한은행",
        "accountNumber": "523456789012"
    }

    if not register_user(cookies, user2):
        return

    print("\n⏸️ 김영수 승급 확인 (F1 → F2)")

    # 8월 3명째: 정민수 (이미영 왼쪽)
    print("\n" + "="*80)
    print("8월 3명째: 정민수 (이미영 왼쪽)")
    print("="*80)

    user3 = {
        "registrationDate": "2025-08-01",
        "name": "정민수",
        "phone": "010-6666-6666",
        "salesperson": "이미영",
        "bank": "우리은행",
        "accountNumber": "623456789012"
    }

    if not register_user(cookies, user3):
        return

    print("\n" + "="*80)
    print("✅ 8월 등록 완료!")
    print("="*80)
    print("\n💡 이제 MongoDB에서 추가지급을 확인하세요!")

if __name__ == "__main__":
    main()
