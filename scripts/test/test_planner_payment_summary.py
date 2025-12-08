#!/usr/bin/env python3
"""
설계사 지급 총액 API 테스트 스크립트

사용법:
  python3 scripts/test/test_planner_payment_summary.py
  python3 scripts/test/test_planner_payment_summary.py --server http://211.248.58.193:3100
"""

import argparse
import requests
from pymongo import MongoClient
from bson import ObjectId
from datetime import datetime, timedelta
from collections import defaultdict

# 기본 설정
DEFAULT_SERVER = "http://localhost:3100"
MONGO_URI = "mongodb://localhost:27017"
DB_NAME = "nanumpay"

# 설계사 로그인 정보
PLANNER_ID = "설계사"
PLANNER_PASSWORD = "0000"


def print_section(title):
    """섹션 헤더 출력"""
    print(f"\n{'='*60}")
    print(f"  {title}")
    print(f"{'='*60}")


def connect_db():
    """MongoDB 연결"""
    client = MongoClient(MONGO_URI)
    return client[DB_NAME]


def login_as_planner(session, base_url):
    """설계사 로그인"""
    print_section("🔐 설계사 로그인")

    response = session.post(
        f"{base_url}/api/auth/login",
        json={
            "loginId": PLANNER_ID,
            "password": PLANNER_PASSWORD,
            "userType": "planner"
        }
    )

    if response.status_code == 200:
        data = response.json()
        if data.get('success'):
            print(f"✅ 로그인 성공: {PLANNER_ID}")
            return True
        else:
            print(f"❌ 로그인 실패: {data.get('message')}")
            return False
    else:
        print(f"❌ 로그인 실패: HTTP {response.status_code}")
        return False


def get_payment_summary_api(session, base_url):
    """API로 지급 총액 조회"""
    print_section("📡 API 응답 (payment-summary)")

    response = session.get(f"{base_url}/api/planner/payment-summary")

    if response.status_code == 200:
        data = response.json()

        print(f"\n이번주 금요일 지급:")
        this_week = data.get('thisWeek', {})
        print(f"  날짜: {this_week.get('date')}")
        print(f"  금액: {this_week.get('amount', 0):,}원")
        print(f"  세금: {this_week.get('tax', 0):,}원")
        print(f"  실수령: {this_week.get('net', 0):,}원")

        print(f"\n이미 지급한 총액:")
        total_paid = data.get('totalPaid', {})
        print(f"  금액: {total_paid.get('amount', 0):,}원")
        print(f"  세금: {total_paid.get('tax', 0):,}원")
        print(f"  실수령: {total_paid.get('net', 0):,}원")

        print(f"\n앞으로 지급할 총액:")
        upcoming = data.get('upcoming', {})
        print(f"  금액: {upcoming.get('amount', 0):,}원")
        print(f"  세금: {upcoming.get('tax', 0):,}원")
        print(f"  실수령: {upcoming.get('net', 0):,}원")

        return data
    else:
        print(f"❌ API 오류: HTTP {response.status_code}")
        print(response.text)
        return None


def should_skip_by_insurance(grade, insurance_amount):
    """보험 조건 확인 (서버 로직과 동일)"""
    GRADE_LIMITS = {
        'F1': {'insuranceRequired': False, 'insuranceAmount': 0},
        'F2': {'insuranceRequired': False, 'insuranceAmount': 0},
        'F3': {'insuranceRequired': False, 'insuranceAmount': 0},
        'F4': {'insuranceRequired': True, 'insuranceAmount': 70000},
        'F5': {'insuranceRequired': True, 'insuranceAmount': 70000},
        'F6': {'insuranceRequired': True, 'insuranceAmount': 90000},
        'F7': {'insuranceRequired': True, 'insuranceAmount': 90000},
        'F8': {'insuranceRequired': True, 'insuranceAmount': 110000},
    }

    limits = GRADE_LIMITS.get(grade)
    if limits and limits['insuranceRequired']:
        required = limits['insuranceAmount']
        return (insurance_amount or 0) < required
    return False


def calculate_from_db(db, planner_name=PLANNER_ID):
    """DB에서 직접 계산 (검증용)"""
    print_section("🔍 DB 직접 계산 (검증용)")

    # 설계사 계정 조회
    planner = db.planneraccounts.find_one({'name': planner_name})
    if not planner:
        print(f"❌ 설계사 없음: {planner_name}")
        return None

    planner_id = str(planner['_id'])
    print(f"설계사 ID: {planner_id}")

    # 설계사가 설계한 사용자 조회 (ObjectId 또는 string 둘 다 시도)
    users = list(db.users.find({'plannerAccountId': planner_id}))
    if not users:
        users = list(db.users.find({'plannerAccountId': ObjectId(planner_id)}))

    # userId -> 보험 정보 매핑
    user_insurance_map = {}
    for u in users:
        user_insurance_map[str(u['_id'])] = {
            'grade': u.get('grade', 'F1'),
            'insuranceAmount': u.get('insuranceAmount', 0)
        }

    user_ids = [str(u['_id']) for u in users]
    print(f"담당 사용자: {len(users)}명")

    if not user_ids:
        return None

    # 이번 주 계산
    now = datetime.now()
    day_of_week = now.weekday()  # 0=월요일
    # 일요일 기준으로 변환 (0=일요일)
    day_of_week_sunday = (day_of_week + 1) % 7

    is_friday_passed = day_of_week_sunday == 6  # 토요일
    week_offset = 7 if is_friday_passed else 0

    this_week_start = now - timedelta(days=day_of_week_sunday - week_offset)
    this_week_start = this_week_start.replace(hour=0, minute=0, second=0, microsecond=0)

    this_week_end = this_week_start + timedelta(days=6)
    this_week_end = this_week_end.replace(hour=23, minute=59, second=59, microsecond=999999)

    this_week_friday = this_week_start + timedelta(days=5)

    print(f"\n이번주 범위: {this_week_start.strftime('%Y-%m-%d')} ~ {this_week_end.strftime('%Y-%m-%d')}")
    print(f"이번주 금요일: {this_week_friday.strftime('%Y-%m-%d')}")

    # 지급 계획 조회
    plans = list(db.weeklypaymentplans.find({
        'userId': {'$in': user_ids},
        'planStatus': {'$ne': 'canceled'}
    }))

    print(f"지급 계획: {len(plans)}개")

    # 계산
    this_week = {'amount': 0, 'tax': 0, 'net': 0}
    total_paid = {'amount': 0, 'tax': 0, 'net': 0}
    upcoming = {'amount': 0, 'tax': 0, 'net': 0}

    status_counts = defaultdict(int)
    skipped_by_insurance = 0

    for plan in plans:
        # ⭐ 보험 조건 확인
        user_info = user_insurance_map.get(plan.get('userId'))
        if user_info and should_skip_by_insurance(user_info['grade'], user_info['insuranceAmount']):
            skipped_by_insurance += 1
            continue  # 보험 미가입 시 전체 플랜 skip

        for inst in plan.get('installments', []):
            status = inst.get('status', 'unknown')
            status_counts[status] += 1

            # canceled, terminated 제외
            if status in ['canceled', 'terminated']:
                continue

            inst_date = inst.get('scheduledDate') or inst.get('weekDate')
            if not inst_date:
                continue

            amount = inst.get('installmentAmount', 0)
            tax = inst.get('withholdingTax', 0)
            net = inst.get('netAmount', 0)

            if inst_date < this_week_start:
                total_paid['amount'] += amount
                total_paid['tax'] += tax
                total_paid['net'] += net
            elif this_week_start <= inst_date <= this_week_end:
                this_week['amount'] += amount
                this_week['tax'] += tax
                this_week['net'] += net
            else:
                upcoming['amount'] += amount
                upcoming['tax'] += tax
                upcoming['net'] += net

    print(f"\n💼 보험 미가입으로 제외된 플랜: {skipped_by_insurance}개")

    print(f"\n📊 할부 상태별 건수 (보험 통과 플랜만):")
    for status, count in sorted(status_counts.items()):
        emoji = {'pending': '⏳', 'paid': '✅', 'skipped': '⏭️', 'terminated': '❌', 'canceled': '🚫'}.get(status, '❓')
        print(f"  {emoji} {status}: {count}")

    print(f"\n📈 DB 직접 계산 결과:")
    print(f"\n이번주 금요일 지급:")
    print(f"  금액: {this_week['amount']:,}원")
    print(f"  세금: {this_week['tax']:,}원")
    print(f"  실수령: {this_week['net']:,}원")

    print(f"\n이미 지급한 총액:")
    print(f"  금액: {total_paid['amount']:,}원")
    print(f"  세금: {total_paid['tax']:,}원")
    print(f"  실수령: {total_paid['net']:,}원")

    print(f"\n앞으로 지급할 총액:")
    print(f"  금액: {upcoming['amount']:,}원")
    print(f"  세금: {upcoming['tax']:,}원")
    print(f"  실수령: {upcoming['net']:,}원")

    return {
        'thisWeek': this_week,
        'totalPaid': total_paid,
        'upcoming': upcoming
    }


def compare_results(api_result, db_result):
    """API 결과와 DB 결과 비교"""
    print_section("⚖️ 결과 비교")

    if not api_result or not db_result:
        print("❌ 비교 불가 (결과 없음)")
        return False

    all_match = True

    for category in ['thisWeek', 'totalPaid', 'upcoming']:
        api_data = api_result.get(category, {})
        db_data = db_result.get(category, {})

        for field in ['amount', 'tax', 'net']:
            api_val = api_data.get(field, 0)
            db_val = db_data.get(field, 0)

            if api_val == db_val:
                status = '✅'
            else:
                status = '❌'
                all_match = False

            print(f"{status} {category}.{field}: API={api_val:,} / DB={db_val:,}")

    if all_match:
        print(f"\n✅ 모든 값 일치!")
    else:
        print(f"\n❌ 불일치 발견!")

    return all_match


def main():
    parser = argparse.ArgumentParser(description='설계사 지급 총액 API 테스트')
    parser.add_argument('--server', default=DEFAULT_SERVER, help='서버 URL')
    parser.add_argument('--db-only', action='store_true', help='DB 직접 계산만 수행')

    args = parser.parse_args()

    print("\n" + "🧪" * 30)
    print("  설계사 지급 총액 테스트")
    print("🧪" * 30)

    api_result = None

    if not args.db_only:
        print(f"\n서버: {args.server}")

        # 세션 생성
        session = requests.Session()

        # 로그인
        if login_as_planner(session, args.server):
            # API 호출
            api_result = get_payment_summary_api(session, args.server)
        else:
            print("⚠️ 로그인 실패, DB 직접 계산만 수행")

    # DB 직접 계산
    try:
        db = connect_db()
        db_result = calculate_from_db(db)

        # 비교
        if api_result and db_result:
            compare_results(api_result, db_result)
    except Exception as e:
        print(f"\n⚠️ DB 연결 실패: {e}")

    print("\n" + "✅" * 30)
    print("  테스트 완료")
    print("✅" * 30 + "\n")


if __name__ == "__main__":
    main()
