#!/usr/bin/env python3
"""
등급별 지급 총액 조정 기능 테스트 스크립트

테스트 시나리오:
1. 현재월 조정값 설정
2. DB에 저장 확인
3. 다시 조회했을 때 값이 올바르게 표시되는지 확인
"""

import requests
import json
import time
from datetime import datetime

# 설정
BASE_URL = "http://localhost:3102"
USERNAME = "관리자"
PASSWORD = "admin1234!!"

# 세션
session = requests.Session()

def login():
    """로그인"""
    print("=" * 60)
    print("1. 로그인 테스트")
    print("=" * 60)

    response = session.post(f"{BASE_URL}/api/auth/login", json={
        "loginId": USERNAME,
        "password": PASSWORD
    })

    if response.status_code == 200:
        print("✅ 로그인 성공")
        return True
    else:
        print(f"❌ 로그인 실패: {response.status_code}")
        print(response.text)
        return False

def get_current_month():
    """현재 월 반환 (YYYY-MM)"""
    now = datetime.now()
    return f"{now.year}-{now.month:02d}"

def get_monthly_data(month_key):
    """월별 데이터 조회"""
    response = session.get(f"{BASE_URL}/api/admin/revenue/monthly?monthKey={month_key}")
    if response.status_code == 200:
        return response.json()
    else:
        print(f"❌ 월별 데이터 조회 실패: {response.status_code}")
        return None

def adjust_grade_payments(month_key, adjustments):
    """등급별 지급액 조정"""
    response = session.post(f"{BASE_URL}/api/admin/revenue/adjust-grade-payments", json={
        "monthKey": month_key,
        "adjustments": adjustments
    })

    if response.status_code == 200:
        return response.json()
    else:
        print(f"❌ 조정 실패: {response.status_code}")
        print(response.text)
        return None

def test_grade_adjustment():
    """등급별 조정 테스트"""
    month_key = get_current_month()

    print("\n" + "=" * 60)
    print(f"2. 등급별 조정 테스트 (월: {month_key})")
    print("=" * 60)

    # 조정 전 데이터 조회
    print("\n📊 조정 전 데이터 조회...")
    before_data = get_monthly_data(month_key)
    if not before_data:
        print("❌ 월별 데이터가 없습니다.")
        return False

    print(f"  - 등록자 수: {before_data.get('registrationCount', 0)}명")
    print(f"  - 매출: {before_data.get('effectiveRevenue', 0):,}원")

    # 조정값 설정 (F1, F2만 테스트)
    print("\n🔧 조정값 설정 중...")
    adjustments = {
        "F1": {
            "totalAmount": 300000,  # 30만원
            "perInstallment": 3000   # 클라이언트에서 계산한 값 (서버에서 재계산됨)
        },
        "F2": {
            "totalAmount": 900000,  # 90만원
            "perInstallment": 9000   # 클라이언트에서 계산한 값 (서버에서 재계산됨)
        }
    }

    print(f"  - F1: {adjustments['F1']['totalAmount']:,}원")
    print(f"  - F2: {adjustments['F2']['totalAmount']:,}원")

    result = adjust_grade_payments(month_key, adjustments)
    if not result:
        return False

    print(f"✅ 조정 완료: {result.get('updatedPlans', 0)}개 계획 업데이트됨")

    # 잠시 대기
    time.sleep(1)

    # 조정 후 데이터 조회
    print("\n📊 조정 후 데이터 조회...")
    after_data = get_monthly_data(month_key)
    if not after_data:
        print("❌ 조정 후 데이터 조회 실패")
        return False

    # 검증
    print("\n🔍 검증 중...")
    adjusted = after_data.get('adjustedGradePayments', {})

    print(f"\n  📋 전체 adjustedGradePayments:")
    print(f"    {json.dumps(adjusted, indent=4, ensure_ascii=False)}")

    success = True

    # F1 검증
    f1_adjusted = adjusted.get('F1', {})
    f1_total = f1_adjusted.get('totalAmount')
    f1_per = f1_adjusted.get('perInstallment')

    expected_f1_per = 30000  # 300000 / 10 / 100 * 100

    print(f"\n  F1 등급:")
    print(f"    - 저장된 총액: {f1_total if f1_total is not None else 'None'}원 (예상: 300,000원)")
    print(f"    - 저장된 10분할금: {f1_per if f1_per is not None else 'None'}원 (예상: {expected_f1_per:,}원)")

    if f1_total != 300000:
        print(f"    ❌ 총액이 일치하지 않음!")
        success = False
    elif f1_per != expected_f1_per:
        print(f"    ❌ 10분할금이 일치하지 않음!")
        success = False
    else:
        print(f"    ✅ F1 검증 성공")

    # F2 검증
    f2_adjusted = adjusted.get('F2', {})
    f2_total = f2_adjusted.get('totalAmount')
    f2_per = f2_adjusted.get('perInstallment')

    expected_f2_per = 90000  # 900000 / 10 / 100 * 100

    print(f"\n  F2 등급:")
    print(f"    - 저장된 총액: {f2_total if f2_total is not None else 'None'}원 (예상: 900,000원)")
    print(f"    - 저장된 10분할금: {f2_per if f2_per is not None else 'None'}원 (예상: {expected_f2_per:,}원)")

    if f2_total != 900000:
        print(f"    ❌ 총액이 일치하지 않음!")
        success = False
    elif f2_per != expected_f2_per:
        print(f"    ❌ 10분할금이 일치하지 않음!")
        success = False
    else:
        print(f"    ✅ F2 검증 성공")

    return success

def test_auto_reset():
    """자동 계산으로 복귀 테스트"""
    month_key = get_current_month()

    print("\n" + "=" * 60)
    print("3. 자동 계산으로 복귀 테스트")
    print("=" * 60)

    # 모든 등급을 null로 설정 (자동 계산)
    adjustments = {}
    for grade in ['F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8']:
        adjustments[grade] = {
            "totalAmount": None,
            "perInstallment": None
        }

    print("🔧 모든 등급을 자동 계산으로 복귀 중...")
    result = adjust_grade_payments(month_key, adjustments)
    if not result:
        return False

    print(f"✅ 복귀 완료: {result.get('updatedPlans', 0)}개 계획 업데이트됨")

    # 잠시 대기
    time.sleep(1)

    # 데이터 조회
    print("\n📊 복귀 후 데이터 조회...")
    after_data = get_monthly_data(month_key)
    if not after_data:
        print("❌ 데이터 조회 실패")
        return False

    # 검증
    print("\n🔍 검증 중...")
    adjusted = after_data.get('adjustedGradePayments', {})

    success = True
    for grade in ['F1', 'F2']:
        grade_adjusted = adjusted.get(grade, {})
        total = grade_adjusted.get('totalAmount')
        per = grade_adjusted.get('perInstallment')

        print(f"  {grade}: totalAmount={total}, perInstallment={per}")

        if total is not None or per is not None:
            print(f"    ❌ {grade}가 자동 계산으로 복귀하지 않았습니다!")
            success = False
        else:
            print(f"    ✅ {grade} 자동 계산 복귀 성공")

    return success

def main():
    print("\n" + "=" * 60)
    print("등급별 지급 총액 조정 기능 테스트")
    print("=" * 60)

    # 로그인
    if not login():
        print("\n❌ 테스트 실패: 로그인 실패")
        return

    # 테스트 실행
    test1 = test_grade_adjustment()
    test2 = test_auto_reset()

    # 결과 요약
    print("\n" + "=" * 60)
    print("테스트 결과 요약")
    print("=" * 60)
    print(f"1. 등급별 조정 테스트: {'✅ 통과' if test1 else '❌ 실패'}")
    print(f"2. 자동 복귀 테스트: {'✅ 통과' if test2 else '❌ 실패'}")

    if test1 and test2:
        print("\n🎉 모든 테스트 통과!")
    else:
        print("\n❌ 일부 테스트 실패")

if __name__ == "__main__":
    main()
