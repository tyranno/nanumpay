#!/usr/bin/env python3
"""
이미영 계정의 10월 용역비 내역 조회 스크립트
"""
import requests
import json
from datetime import datetime

BASE_URL = "http://localhost:3100"

def login(login_id, password):
    """로그인"""
    print(f"🔐 로그인 시도: {login_id}")
    response = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"loginId": login_id, "password": password}
    )

    if response.status_code == 200:
        data = response.json()
        if data.get("success"):
            user_name = data.get('primaryUser', {}).get('name', login_id)
            print(f"✅ 로그인 성공: {user_name}")
            # 쿠키에서 토큰 추출
            cookies = response.cookies
            return cookies.get('token', '')

    print(f"❌ 로그인 실패: {response.text}")
    return None

def get_payments(token):
    """용역비 내역 조회"""
    print("\n📊 용역비 내역 조회 중...")

    headers = {"Cookie": f"token={token}"}
    response = requests.get(f"{BASE_URL}/api/user/payments", headers=headers)

    if response.status_code != 200:
        print(f"❌ 조회 실패: {response.text}")
        return None

    data = response.json()
    if not data.get("success"):
        print(f"❌ 조회 실패: {data}")
        return None

    return data

def analyze_october_payments(data):
    """10월 지급 내역 분석"""
    print("\n" + "="*80)
    print("📋 이미영 계정 정보")
    print("="*80)
    user = data["user"]
    print(f"이름: {user['name']}")
    print(f"등급: {user['grade']}")
    print(f"보험: {user['insuranceActive']}")
    print(f"등록번호: {user.get('registrationNumber', 'N/A')}")

    print("\n" + "="*80)
    print("📅 전체 등록 정보")
    print("="*80)
    for idx, reg in enumerate(data.get("allRegistrations", []), 1):
        created = reg.get('createdAt', 'N/A')
        if created != 'N/A':
            created = datetime.fromisoformat(created.replace('Z', '+00:00')).strftime('%Y-%m-%d')
        print(f"{idx}. {reg['name']} (등급: {reg['grade']}, 등록일: {created})")

    print("\n" + "="*80)
    print("💰 용역비 요약")
    print("="*80)
    summary = data["summary"]
    print(f"이번주 지급액: {summary['thisWeek']['amount']:,}원 (세금: {summary['thisWeek']['tax']:,}원, 실수령: {summary['thisWeek']['net']:,}원)")
    print(f"이번달 지급액: {summary['thisMonth']['amount']:,}원 (세금: {summary['thisMonth']['tax']:,}원, 실수령: {summary['thisMonth']['net']:,}원)")
    print(f"지급 예정액: {summary['upcoming']['amount']:,}원 (세금: {summary['upcoming']['tax']:,}원, 실수령: {summary['upcoming']['net']:,}원)")

    print("\n" + "="*80)
    print("📊 10월 주차별 지급 내역 (2025-W40 ~ 2025-W44)")
    print("="*80)

    payments = data["payments"]
    october_payments = []

    for payment in payments:
        week_num = payment.get("weekNumber", "")
        if week_num >= "2025-W40" and week_num <= "2025-W44":
            october_payments.append(payment)

    if not october_payments:
        print("❌ 10월 지급 내역이 없습니다.")
        return

    # 주차별로 정렬
    october_payments.sort(key=lambda x: x["weekNumber"])

    total_amount = 0
    total_tax = 0
    total_net = 0

    print(f"\n{'주차':<12} {'지급일':<12} {'등급분포':<20} {'총액':<12} {'세금':<12} {'실수령':<12}")
    print("-" * 80)

    for payment in october_payments:
        week_num = payment["weekNumber"]
        week_date = datetime.fromisoformat(payment["weekDate"].replace('Z', '+00:00')).strftime('%Y-%m-%d')

        # 등급별 횟수
        grade_count = payment.get("gradeCount", {})
        grade_str = ", ".join([f"{grade}x{count}" for grade, count in sorted(grade_count.items())])

        amount = payment["amount"]
        tax = payment["tax"]
        net = payment["netAmount"]

        total_amount += amount
        total_tax += tax
        total_net += net

        print(f"{week_num:<12} {week_date:<12} {grade_str:<20} {amount:>11,}원 {tax:>11,}원 {net:>11,}원")

    print("-" * 80)
    print(f"{'총계':<12} {'':<12} {'':<20} {total_amount:>11,}원 {total_tax:>11,}원 {total_net:>11,}원")

    print("\n" + "="*80)
    print("🔍 등급별 분석")
    print("="*80)

    all_grades = {}
    for payment in october_payments:
        for grade, count in payment.get("gradeCount", {}).items():
            if grade not in all_grades:
                all_grades[grade] = 0
            all_grades[grade] += count

    for grade, count in sorted(all_grades.items()):
        print(f"{grade}: {count}회")

    print("\n" + "="*80)
    print("📈 상세 분석")
    print("="*80)
    print(f"10월 총 지급 주차: {len(october_payments)}주")
    print(f"10월 총 지급액: {total_amount:,}원")
    print(f"10월 총 세금: {total_tax:,}원")
    print(f"10월 실수령액: {total_net:,}원")
    print(f"주당 평균 지급액: {total_amount // len(october_payments) if october_payments else 0:,}원")

def main():
    print("="*80)
    print("이미영 10월 용역비 내역 조회")
    print("="*80)

    # 1. 로그인
    token = login("이미영", "5678")
    if not token:
        return

    # 2. 용역비 내역 조회
    data = get_payments(token)
    if not data:
        return

    # 3. 10월 내역 분석
    analyze_october_payments(data)

    print("\n✅ 조회 완료!")

if __name__ == "__main__":
    main()
