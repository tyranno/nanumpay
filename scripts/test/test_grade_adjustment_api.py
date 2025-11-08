#!/usr/bin/env python3
"""
등급별 조정 API 테스트 스크립트
"""

import requests
import json
from datetime import datetime

# 설정
BASE_URL = "http://localhost:3101"  # 개발 서버 포트
USERNAME = "관리자"
PASSWORD = "admin1234!!"  # 느낌표 2개

def login():
    """관리자 로그인"""
    print("1. 로그인 시도...")

    # 세션 생성
    session = requests.Session()

    # API 로그인 사용 (다른 테스트 스크립트 참조)
    response = session.post(
        f"{BASE_URL}/api/auth/login",
        json={
            "loginId": USERNAME,  # loginId 사용
            "password": PASSWORD
        }
    )

    if response.status_code == 200:
        print(f"✅ 로그인 성공")
        return session
    else:
        print(f"❌ 로그인 실패: {response.status_code}")
        print(f"   응답: {response.text[:200]}")
        return None

def test_get_grade_adjustment(session):
    """등급별 조정 데이터 조회 테스트"""
    print("\n2. 등급별 조정 데이터 조회...")

    # 현재 월과 이전 2개월 설정
    now = datetime.now()
    end_month = f"{now.year}-{now.month:02d}"

    # 3개월 전
    if now.month > 3:
        start_month = f"{now.year}-{now.month-2:02d}"
    else:
        start_month = f"{now.year-1}-{12-(3-now.month):02d}"

    print(f"   기간: {start_month} ~ {end_month}")

    # API 호출
    params = {
        "startMonth": start_month,
        "endMonth": end_month
    }

    response = session.get(f"{BASE_URL}/api/admin/revenue/grade-adjustment", params=params)

    if response.status_code == 200:
        result = response.json()
        print(f"✅ 데이터 조회 성공")

        if result.get('success'):
            months = result.get('months', [])
            print(f"   조회된 월 수: {len(months)}")

            for month_data in months:
                print(f"\n   📅 {month_data['monthKey']}:")

                # 등급 분포
                grade_dist = month_data.get('gradeDistribution', {})
                if grade_dist:
                    print("      등급 분포:", grade_dist)

                # 자동 지급액
                grade_payments = month_data.get('gradePayments', {})
                if grade_payments:
                    total = sum(grade_payments.values())
                    print(f"      자동 지급 총액: {total:,}원")

                # 조정 지급액
                adjusted = month_data.get('adjustedGradePayments', {})
                if adjusted and isinstance(adjusted, dict):
                    adjusted_total = 0
                    for grade, value in adjusted.items():
                        if isinstance(value, dict) and value.get('totalAmount'):
                            adjusted_total += value.get('totalAmount', 0)
                    if adjusted_total > 0:
                        print(f"      조정 지급 총액: {adjusted_total:,}원")
        else:
            print("   ⚠️ success=false")
    else:
        print(f"❌ 데이터 조회 실패: {response.status_code}")
        print(f"   응답: {response.text}")

    return response.status_code == 200

def test_save_grade_adjustment(session):
    """등급별 조정 저장 테스트"""
    print("\n3. 등급별 조정 저장 테스트...")

    # 현재 월
    now = datetime.now()
    current_month = f"{now.year}-{now.month:02d}"

    print(f"   저장할 월: {current_month}")

    # 테스트 데이터 (F1만 조정)
    test_data = {
        "monthKey": current_month,
        "adjustedGradePayments": {
            "F1": {
                "totalAmount": 300000,
                "perInstallment": 30000
            },
            "F2": {
                "totalAmount": None,
                "perInstallment": None
            },
            "F3": {
                "totalAmount": None,
                "perInstallment": None
            },
            "F4": {
                "totalAmount": None,
                "perInstallment": None
            },
            "F5": {
                "totalAmount": None,
                "perInstallment": None
            },
            "F6": {
                "totalAmount": None,
                "perInstallment": None
            },
            "F7": {
                "totalAmount": None,
                "perInstallment": None
            },
            "F8": {
                "totalAmount": None,
                "perInstallment": None
            }
        }
    }

    print("   테스트 데이터: F1 = 300,000원으로 조정")

    response = session.post(
        f"{BASE_URL}/api/admin/revenue/grade-adjustment",
        json=test_data
    )

    if response.status_code == 200:
        result = response.json()
        print(f"✅ 저장 성공: {result.get('message', '')}")

        # 저장 확인
        print("\n4. 저장 확인...")
        params = {
            "startMonth": current_month,
            "endMonth": current_month
        }

        verify_response = session.get(
            f"{BASE_URL}/api/admin/revenue/grade-adjustment",
            params=params
        )

        if verify_response.status_code == 200:
            verify_result = verify_response.json()
            months = verify_result.get('months', [])
            if months and months[0].get('adjustedGradePayments', {}).get('F1'):
                saved_value = months[0]['adjustedGradePayments']['F1'].get('totalAmount')
                if saved_value == 300000:
                    print(f"   ✅ 저장 값 확인: F1 = {saved_value:,}원")
                else:
                    print(f"   ❌ 저장 값 불일치: {saved_value}")
    else:
        print(f"❌ 저장 실패: {response.status_code}")
        try:
            error_data = response.json()
            print(f"   오류: {error_data.get('error', response.text)}")
        except:
            print(f"   응답: {response.text}")

    return response.status_code == 200

def main():
    """메인 테스트 실행"""
    print("=" * 50)
    print("등급별 조정 API 테스트")
    print("=" * 50)

    # 로그인
    session = login()
    if not session:
        print("\n테스트 중단: 로그인 실패")
        return

    # 조회 테스트
    if test_get_grade_adjustment(session):
        # 저장 테스트
        test_save_grade_adjustment(session)

    print("\n" + "=" * 50)
    print("테스트 완료")
    print("=" * 50)

if __name__ == "__main__":
    main()