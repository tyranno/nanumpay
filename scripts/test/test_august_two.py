#!/usr/bin/env python3
"""
8월 2명째 등록 테스트
"""

import requests
import json
from datetime import datetime

BASE_URL = "http://localhost:3100"

def login():
    """관리자 로그인"""
    response = requests.post(f"{BASE_URL}/api/auth/login", json={
        "loginId": "관리자",
        "password": "admin1234!!"
    })
    if response.status_code == 200:
        print("✅ 로그인 성공")
        return response.cookies
    else:
        print(f"❌ 로그인 실패: {response.text}")
        return None

def register_user(cookies, name, salesperson, reg_date):
    """개별 사용자 등록"""
    print(f"\n{'='*60}")
    print(f"📝 등록 시작: {name}")
    print(f"{'='*60}")

    response = requests.post(f"{BASE_URL}/api/admin/users/register",
        cookies=cookies,
        json={
            "name": name,
            "phone": f"010-0000-{hash(name) % 10000:04d}",
            "salesperson": salesperson,
            "registrationDate": reg_date,
            "autoPassword": "1234",
            "bank": "국민은행",
            "accountNumber": "123456789012"
        }
    )

    if response.status_code == 200:
        data = response.json()
        print(f"✅ 등록 성공: {name}")
        print(f"   등급: {data['user']['grade']}")
        return True
    else:
        print(f"❌ 등록 실패: {response.text}")
        return False

def main():
    print("🚀 8월 2명째 등록 테스트")

    cookies = login()
    if not cookies:
        return

    print("\n" + "="*80)
    print("8월 2명째: 최영희 (사장님 오른쪽 아래)")
    print("="*80)

    # 최영희: 이미영 왼쪽 (사장님 손녀)
    register_user(cookies, "최영희", "이미영", "2025-08-02")

    print("\n⏸️  서버 로그를 확인하세요!")
    print("   - 8월 최영희 등록 확인?")
    print("   - 7월 계획 유지 확인? (병행 지급)")
    print("   - 8월 계획 재생성 확인?")

    print("\n" + "="*80)
    print("✅ 8월 2명째 등록 완료!")
    print("="*80)

if __name__ == "__main__":
    main()
