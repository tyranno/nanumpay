#!/usr/bin/env python3
"""
7월 3명 + 8월 3명 bulk 등록 테스트 스크립트

목적:
- terminateAdditionalPaymentPlans 로직 점검
- 김영수 8월 추가지급 삭제 이슈 재현
- 김영수 promoted 기록 누락 이슈 재현

시나리오:
1. 7월 3명 bulk 등록 (사장님, 김영수, 이미영)
   → 사장님 F2 승급
   → 7월 기본지급 생성 (3명)

2. 8월 3명 bulk 등록 (박철수, 최영희, 정민수)
   → 김영수 F2 승급 ⭐ 이슈 발생 지점
   → 7월 추가지급 생성 (3명)
   → 8월 기본지급 생성 (3명)

점검 사항:
- 김영수 8월 추가지급 계획 존재 여부
- 김영수 paymentTargets.promoted 기록 여부
- terminateAdditionalPaymentPlans 로그 확인
"""

import requests
import json
from datetime import datetime

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
        print(response.text)
        return None

def bulk_register(cookies, users, month_label):
    """bulk 사용자 등록"""
    print(f"\n{'='*80}")
    print(f"📝 {month_label} Bulk 등록 시작 ({len(users)}명)")
    print(f"{'='*80}")

    for user in users:
        print(f"  - {user['name']} ({user['registrationDate']})")

    print()

    response = requests.post(
        f"{BASE_URL}/api/admin/users/bulk",
        json={"users": users},
        cookies=cookies
    )

    if response.status_code == 200:
        result = response.json()
        print(f"\n✅ {month_label} Bulk 등록 성공!")
        print(f"   등록 완료: {result.get('successCount', 0)}명")
        if result.get('errors'):
            print(f"   실패: {len(result['errors'])}명")
            for error in result['errors']:
                print(f"     - {error}")
        return True
    else:
        print(f"\n❌ {month_label} Bulk 등록 실패: {response.status_code}")
        print(response.text)
        return False

def check_plans(cookies, userId, userName):
    """특정 사용자의 지급 계획 조회"""
    print(f"\n📋 [{userName}] 지급 계획 조회...")
    response = requests.get(
        f"{BASE_URL}/api/admin/payment/plans?userId={userId}",
        cookies=cookies
    )

    if response.status_code == 200:
        plans = response.json()
        print(f"   총 {len(plans)}개 계획")
        for plan in plans:
            print(f"   - {plan['revenueMonth']} / {plan['baseGrade']} / {plan['installmentType']} / 추가{plan['추가지급단계']} / {plan['planStatus']}")
        return plans
    else:
        print(f"   ❌ 조회 실패: {response.status_code}")
        return []

def check_monthly_registrations(cookies, monthKey):
    """월별 등록 정보 조회"""
    print(f"\n📊 [{monthKey}] MonthlyRegistrations 조회...")
    response = requests.get(
        f"{BASE_URL}/api/admin/payment/monthly-registrations?monthKey={monthKey}",
        cookies=cookies
    )

    if response.status_code == 200:
        data = response.json()
        print(f"   등록 수: {data.get('registrationCount', 0)}명")
        print(f"   매출: {data.get('totalRevenue', 0):,}원")

        targets = data.get('paymentTargets', {})
        print(f"   지급 대상자:")
        print(f"     - 등록자: {len(targets.get('registrants', []))}명")
        print(f"     - 승급자: {len(targets.get('promoted', []))}명")
        if targets.get('promoted'):
            for p in targets['promoted']:
                print(f"       * {p['userName']} ({p['userId']})")
        print(f"     - 추가지급: {len(targets.get('additionalPayments', []))}명")

        return data
    else:
        print(f"   ❌ 조회 실패: {response.status_code}")
        return None

def main():
    print("🚀 7월 3명 + 8월 3명 Bulk 등록 테스트 시작\n")
    print("목적: terminateAdditionalPaymentPlans 로직 점검")
    print("이슈: 김영수 8월 추가지급 삭제 및 promoted 기록 누락\n")

    # 로그인
    cookies = login()
    if not cookies:
        return

    # ============================================================
    # 1단계: 7월 3명 bulk 등록
    # ============================================================
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

    if not bulk_register(cookies, july_users, "7월"):
        return

    print("\n" + "─"*80)
    print("⏸️  서버 로그 확인 포인트:")
    print("   1. processBatch 호출: 2025-07?")
    print("   2. 사장님 승급: F1 → F2?")
    print("   3. 7월 지급 계획 3개 생성?")
    print("   4. 등급 분포: F1=2, F2=1?")
    print("─"*80)

    # input skipped for automation

    # 7월 결과 확인
    check_monthly_registrations(cookies, "2025-07")
    check_plans(cookies, "user002", "김영수")

    # input skipped for automation

    # ============================================================
    # 2단계: 8월 3명 bulk 등록 ⭐ 이슈 발생 지점
    # ============================================================
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

    if not bulk_register(cookies, august_users, "8월"):
        return

    print("\n" + "─"*80)
    print("⏸️  서버 로그 확인 포인트 (⭐ 중요!):")
    print("   1. 김영수 승급: F1 → F2?")
    print("   2. [v7.0 추가지급중단] 로그 출력?")
    print("   3. terminateAdditionalPaymentPlans 호출?")
    print("   4. 8월 추가지급 계획 삭제 여부?")
    print("   5. promoted 기록 여부?")
    print("─"*80)

    # input skipped for automation

    # 8월 결과 확인
    print("\n" + "="*80)
    print("🔍 결과 확인")
    print("="*80)

    # 8월 MonthlyRegistrations 확인
    august_data = check_monthly_registrations(cookies, "2025-08")

    # 김영수 지급 계획 확인 ⭐
    kim_plans = check_plans(cookies, "user002", "김영수")

    # 이슈 분석
    print("\n" + "="*80)
    print("🔴 이슈 분석")
    print("="*80)

    # 이슈 1: 김영수 8월 추가지급 삭제 여부
    august_additional_plan = None
    for plan in kim_plans:
        if plan['revenueMonth'] == '2025-08' and plan['installmentType'] == 'additional':
            august_additional_plan = plan
            break

    if august_additional_plan:
        print("✅ 김영수 8월 추가지급 계획 존재")
        print(f"   → {august_additional_plan['_id']}")
    else:
        print("❌ 김영수 8월 추가지급 계획 사라짐!")
        print("   → 이슈 재현 성공!")

    # 이슈 2: promoted 기록 누락
    if august_data:
        promoted = august_data.get('paymentTargets', {}).get('promoted', [])
        kim_promoted = [p for p in promoted if p['userId'] == 'user002']

        if kim_promoted:
            print("✅ 김영수 promoted 기록 존재")
            print(f"   → {kim_promoted[0]}")
        else:
            print("❌ 김영수 promoted 기록 없음!")
            print("   → 이슈 재현 성공!")

    # 7월 추가지급 확인
    july_additional_plans = [p for p in kim_plans if p['revenueMonth'] == '2025-07' and p['installmentType'] == 'additional']
    if july_additional_plans:
        print(f"\n✅ 김영수 7월 추가지급 계획 존재 ({len(july_additional_plans)}개)")
        for plan in july_additional_plans:
            print(f"   → {plan['baseGrade']} / 추가{plan['추가지급단계']} / {plan['planStatus']}")
    else:
        print("\n❌ 김영수 7월 추가지급 계획 없음 (예상치 못한 결과)")

    print("\n" + "="*80)
    print("✅ 테스트 완료!")
    print("="*80)
    print("\n다음 단계:")
    print("1. 서버 로그에서 [v7.0 추가지급중단] 섹션 확인")
    print("2. terminateAdditionalPaymentPlans 로직 디버깅")
    print("3. step4 → step5 데이터 전달 확인")

if __name__ == "__main__":
    main()
