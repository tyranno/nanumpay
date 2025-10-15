#!/usr/bin/env python3
"""
9월 등록 테스트: 추가지급 중단 검증

시나리오:
1. 7월 3명 등록 (사장님, 김영수, 이미영)
2. 8월 3명 등록 (박철수, 최영희, 정민수)
   → 김영수 F2 승급
   → 이미영 F1 추가지급 생성 (7월 매출분)
3. 9월 1명 등록 (강민수)
   → 이미영 F2 승급 ⭐
   → 이미영의 8월 추가지급 부분 중단 확인 ⭐

검증:
- 이미영의 8월 추가지급 계획이 10월부터 canceled 상태인지 확인
"""

import requests
import json

BASE_URL = "http://localhost:3100"

def login():
    """관리자 로그인"""
    print("🔑 로그인 중...")
    response = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={
            "loginId": "관리자",
            "password": "admin1234!!"
        }
    )
    if response.status_code == 200:
        print("✅ 로그인 성공\n")
        return response.cookies
    else:
        print(f"❌ 로그인 실패: {response.status_code}")
        return None

def bulk_register(cookies, users, label):
    """Bulk 등록"""
    print(f"\n{'='*80}")
    print(f"📝 {label}")
    print(f"{'='*80}")

    response = requests.post(
        f"{BASE_URL}/api/admin/users/bulk",
        json={"users": users},
        cookies=cookies
    )

    if response.status_code == 200:
        result = response.json()
        print(f"✅ 등록 성공: {result.get('successCount', 0)}명")
        return True
    else:
        print(f"❌ 등록 실패: {response.status_code}")
        print(response.text)
        return False

def main():
    print("🚀 9월 등록 테스트: 추가지급 중단 검증\n")

    cookies = login()
    if not cookies:
        return

    # 1. 7월 3명
    july_users = [
        {
            "registrationDate": "2025-07-01",
            "name": "사장님",
            "phone": "010-1234-5678",
            "salesperson": "-",
            "bank": "국민은행",
            "accountNumber": "123456789012"
        },
        {
            "registrationDate": "2025-07-01",
            "name": "김영수",
            "phone": "010-2222-2222",
            "salesperson": "사장님",
            "bank": "신한은행",
            "accountNumber": "223456789012"
        },
        {
            "registrationDate": "2025-07-02",
            "name": "이미영",
            "phone": "010-3333-3333",
            "salesperson": "사장님",
            "bank": "우리은행",
            "accountNumber": "323456789012"
        }
    ]

    if not bulk_register(cookies, july_users, "7월 3명 등록"):
        return

    print("\n✅ 7월 등록 완료")
    print("   - 사장님: F1 → F2")
    print("   - 김영수: F1")
    print("   - 이미영: F1")

    # 2. 8월 3명
    august_users = [
        {
            "registrationDate": "2025-08-01",
            "name": "박철수",
            "phone": "010-4444-4444",
            "salesperson": "김영수",
            "bank": "하나은행",
            "accountNumber": "423456789012"
        },
        {
            "registrationDate": "2025-08-01",
            "name": "최영희",
            "phone": "010-5555-5555",
            "salesperson": "김영수",
            "bank": "기업은행",
            "accountNumber": "523456789012"
        },
        {
            "registrationDate": "2025-08-02",
            "name": "정민수",
            "phone": "010-6666-6666",
            "salesperson": "이미영",
            "bank": "농협은행",
            "accountNumber": "623456789012"
        }
    ]

    if not bulk_register(cookies, august_users, "8월 3명 등록"):
        return

    print("\n✅ 8월 등록 완료")
    print("   - 김영수: F1 → F2 승급")
    print("   - 이미영: F1 추가지급 생성 (7월 매출분)")

    # 3. 9월 1명 ⭐
    september_users = [
        {
            "registrationDate": "2025-09-01",
            "name": "강민수",
            "phone": "010-7777-7777",
            "salesperson": "이미영",
            "bank": "신협",
            "accountNumber": "723456789012"
        }
    ]

    if not bulk_register(cookies, september_users, "9월 1명 등록 (강민수)"):
        return

    print("\n✅ 9월 등록 완료")
    print("   - 강민수 등록")
    print("   - 이미영: F1 → F2 승급 ⭐")
    print("   - 사장님: F2 → F3 승급 ⭐")

    print("\n" + "="*80)
    print("🔍 이미영 추가지급 중단 확인")
    print("="*80)

    print("\n다음 단계:")
    print("1. 서버 로그에서 [v7.0 추가지급중단] 확인")
    print("2. MongoDB에서 이미영의 8월 추가지급 계획 확인")
    print("   mongosh mongodb://localhost:27017/nanumpay --quiet --eval \"")
    print("   db.weeklypaymentplans.findOne(")
    print("     {userName: '이미영', revenueMonth: '2025-08', installmentType: 'additional'},")
    print("     {installments: 1, planStatus: 1}")
    print("   )\"")
    print("\n예상 결과:")
    print("  - 9월 회차 (2025-09-04, 09-11, 09-18, 09-25): pending")
    print("  - 10월 회차 (2025-10-02, 10-09, ...): canceled ⭐")

if __name__ == "__main__":
    main()
