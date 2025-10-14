#!/usr/bin/env python3
"""
8월 3명 등록 테스트: 박철수, 최영희, 정민수
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
    """사용자 등록"""
    print(f"\n{'='*80}")
    print(f"📝 등록 시작: {user_data['name']}")
    print('='*60)

    response = requests.post(
        f"{BASE_URL}/api/admin/users/register",
        json=user_data,
        cookies=cookies
    )

    if response.status_code == 200:
        result = response.json()
        print(f"✅ 등록 성공: {user_data['name']}")
        print(f"   등급: {result.get('grade', 'N/A')}")
    else:
        print(f"❌ 등록 실패: {response.status_code}")
        print(response.text)

    return response

def main():
    print("🚀 8월 3명 등록 테스트")

    # 로그인
    cookies = login()
    if not cookies:
        return

    print("\n" + "="*80)
    print("8월 1명째: 박철수 (김영수 왼쪽 아래)")
    print("="*80)

    # 박철수 등록 (김영수 왼쪽 아래)
    user_data = {
        "name": "박철수",
        "phone": "010-1111-1111",
        "bank": "우리은행",
        "accountNumber": "111-222-333444",
        "salesperson": "김영수",
        "registrationDate": "2025-08-01"
    }

    register_user(cookies, user_data)

    print("\n⏸️  서버 로그를 확인하세요!")
    print("   - 8월 박철수 등록 확인?")
    print("   - 7월 계획 유지 확인? (병행 지급)")
    print("   - 8월 계획 생성 확인?")

    print("\n" + "="*80)
    print("8월 2명째: 최영희 (김영수 오른쪽 아래)")
    print("="*80)

    # 최영희 등록 (김영수 오른쪽 아래)
    user_data = {
        "name": "최영희",
        "phone": "010-2222-2222",
        "bank": "신한은행",
        "accountNumber": "222-333-444555",
        "salesperson": "김영수",
        "registrationDate": "2025-08-02"
    }

    register_user(cookies, user_data)

    print("\n⏸️  서버 로그를 확인하세요!")
    print("   - 김영수 승급: F1 → F2?")
    print("   - 8월 승급자 계획 생성?")

    print("\n" + "="*80)
    print("8월 3명째: 정민수 (이미영 왼쪽 아래)")
    print("="*80)

    # 정민수 등록 (이미영 왼쪽 아래)
    user_data = {
        "name": "정민수",
        "phone": "010-3333-3333",
        "bank": "국민은행",
        "accountNumber": "333-444-555666",
        "salesperson": "이미영",
        "registrationDate": "2025-08-03"
    }

    register_user(cookies, user_data)

    print("\n⏸️  서버 로그를 확인하세요!")
    print("   - 8월 총 3명 등록 확인?")
    print("   - 7월 추가지급 2건 생성 확인? (사장님 F2, 이미영 F1)")

    print("\n" + "="*80)
    print("✅ 8월 3명 등록 완료!")
    print("="*80)

if __name__ == "__main__":
    main()
