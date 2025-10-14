#!/usr/bin/env python3
"""
8월 3명째 등록 테스트: 정민수 (김영수 왼쪽 아래)
"""

import requests
import json

BASE_URL = "http://localhost:3102"

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
    print("🚀 8월 3명째 등록 테스트")

    # 로그인
    cookies = login()
    if not cookies:
        return

    print("\n" + "="*80)
    print("8월 3명째: 정민수 (김영수 왼쪽 아래)")
    print("="*80)

    # 정민수 등록 (김영수 왼쪽 아래)
    user_data = {
        "name": "정민수",
        "phone": "010-9876-5432",
        "bank": "국민은행",
        "accountNumber": "987-654-321098",
        "salesperson": "김영수",
        "registrationDate": "2025-08-01"
    }

    register_user(cookies, user_data)

    print("\n⏸️  서버 로그를 확인하세요!")
    print("   - 8월 정민수 등록 확인?")
    print("   - 7월 계획 유지 확인? (병행 지급)")
    print("   - 8월 계획 재생성 확인?")

    print("\n" + "="*80)
    print("✅ 8월 3명째 등록 완료!")
    print("="*80)

if __name__ == "__main__":
    main()
