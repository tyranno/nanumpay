#!/usr/bin/env python3
"""
브랜치 비교 테스트 스크립트
v8.0 리팩토링 전후 결과 비교

사용법:
  # 1. 기준 브랜치에서 실행 (결과 저장)
  python3 scripts/test/compare_branches.py --save baseline.json

  # 2. 변경 브랜치에서 실행 (비교)
  python3 scripts/test/compare_branches.py --compare baseline.json

  # 3. 전체 테스트 후 비교
  python3 scripts/test/compare_branches.py --full-test --save result.json
"""

import argparse
import json
import subprocess
import sys
import time
import requests
from pathlib import Path
from pymongo import MongoClient
from collections import defaultdict
from datetime import datetime

BASE_URL = "http://localhost:3100"
PROJECT_ROOT = Path(__file__).parent.parent.parent
MONGO_URI = "mongodb://localhost:27017"
DB_NAME = "nanumpay"

# 테스트 파일 (test-data/test 폴더 사용)
TEST_FILES = [
    ("7월", "test-data/test/7월_용역자명단_간단.xlsx"),
    ("8월", "test-data/test/8월_용역자명단_간단.xlsx"),
    ("9월", "test-data/test/9월_용역자명단_간단.xlsx"),
    ("10월", "test-data/test/10월_용역자명단_간단.xlsx"),
    ("11월", "test-data/test/11월_용역자명단_간단.xlsx"),
]

# v8.0 보험 조건
INSURANCE_REQUIREMENTS = {
    'F4': 70000,
    'F5': 70000,
    'F6': 90000,
    'F7': 90000,
    'F8': 110000,
}


def print_header(title):
    print(f"\n{'#'*70}")
    print(f"#  {title}")
    print(f"{'#'*70}\n")


def connect_db():
    client = MongoClient(MONGO_URI)
    return client[DB_NAME]


def init_db():
    """DB 초기화"""
    print_header("🗑️ DB 초기화")
    db_init_script = PROJECT_ROOT / "apps/web/install/linux/db_init.sh"
    db_dir = PROJECT_ROOT / "apps/web/install/linux/db"

    result = subprocess.run(
        ["bash", str(db_init_script), "--force"],
        env={"DB_DIR": str(db_dir), "PATH": "/usr/bin:/bin"},
        capture_output=True,
        text=True
    )

    if result.returncode == 0:
        print("✅ DB 초기화 완료")
        return True
    else:
        print(f"❌ DB 초기화 실패: {result.stderr}")
        return False


def wait_for_server(timeout=30):
    """서버 준비 대기"""
    print("⏳ 서버 준비 대기 중...")
    for i in range(timeout):
        try:
            response = requests.get(f"{BASE_URL}/api/health", timeout=2)
            if response.status_code == 200:
                print("✅ 서버 준비 완료")
                return True
        except:
            pass
        time.sleep(1)
    print("❌ 서버 응답 없음")
    return False


def login_as_admin(session):
    """관리자 로그인"""
    response = session.post(f"{BASE_URL}/api/auth/login", json={
        "loginId": "관리자",
        "password": "admin1234!!"
    })
    if response.status_code == 200:
        print("✅ 관리자 로그인 성공")
        return True
    print(f"❌ 로그인 실패: {response.status_code}")
    return False


def upload_excel(session, month_name, file_path):
    """엑셀 파일 업로드"""
    full_path = PROJECT_ROOT / file_path
    if not full_path.exists():
        print(f"❌ 파일 없음: {file_path}")
        return False

    with open(full_path, 'rb') as f:
        files = {'file': (full_path.name, f, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')}
        response = session.post(f"{BASE_URL}/api/admin/users/bulk", files=files)

    if response.status_code == 200:
        data = response.json()
        print(f"  ✅ {month_name}: {data.get('created', 0)}명 등록, {data.get('updated', 0)}명 업데이트")
        return True
    else:
        print(f"  ❌ {month_name} 업로드 실패: {response.status_code}")
        return False


def set_insurance(db):
    """F4+ 등급 보험 설정"""
    print("\n💼 F4+ 보험 설정...")

    for grade, amount in INSURANCE_REQUIREMENTS.items():
        result = db.users.update_many(
            {'grade': grade, 'type': 'user'},
            {'$set': {
                'insuranceAmount': amount,
                'insuranceDate': datetime.now(),
                'insuranceActive': True
            }}
        )
        if result.modified_count > 0:
            print(f"  ✅ {grade}: {result.modified_count}명 보험 설정 ({amount:,}원)")


def capture_results(db):
    """현재 DB 상태에서 결과 캡처"""
    print_header("📊 결과 캡처")

    results = {
        'timestamp': datetime.now().isoformat(),
        'users': {},
        'plans': {},
        'monthly': {},
        'weekly_totals': {}
    }

    # 1. 사용자 정보
    users = list(db.users.find({'type': 'user'}))
    results['users']['total'] = len(users)

    grade_dist = defaultdict(int)
    for user in users:
        grade_dist[user.get('grade', 'F1')] += 1
    results['users']['by_grade'] = dict(grade_dist)

    print(f"👥 사용자: {len(users)}명")
    for grade, count in sorted(grade_dist.items()):
        print(f"   {grade}: {count}명")

    # 2. 지급 계획 정보
    plans = list(db.weeklypaymentplans.find())
    results['plans']['total'] = len(plans)

    plan_type_dist = defaultdict(int)
    plan_status_dist = defaultdict(int)
    installment_status_dist = defaultdict(int)
    total_amounts = defaultdict(float)

    for plan in plans:
        plan_type_dist[plan.get('planType', 'unknown')] += 1
        plan_status_dist[plan.get('planStatus', 'unknown')] += 1

        for inst in plan.get('installments', []):
            status = inst.get('status', 'unknown')
            installment_status_dist[status] += 1

            if status == 'pending':
                amount = inst.get('installmentAmount', 0) or 0
                total_amounts[plan.get('baseGrade', 'F1')] += amount

    results['plans']['by_type'] = dict(plan_type_dist)
    results['plans']['by_status'] = dict(plan_status_dist)
    results['plans']['installment_status'] = dict(installment_status_dist)
    results['plans']['total_pending_amount'] = dict(total_amounts)

    print(f"\n📋 지급 계획: {len(plans)}개")
    print(f"   타입별: {dict(plan_type_dist)}")
    print(f"   상태별: {dict(plan_status_dist)}")
    print(f"   할부 상태: {dict(installment_status_dist)}")

    total_pending = sum(total_amounts.values())
    print(f"\n💰 총 pending 금액: {total_pending:,.0f}원")
    for grade, amount in sorted(total_amounts.items()):
        print(f"   {grade}: {amount:,.0f}원")

    # 3. 월별 등록 정보
    monthly_regs = list(db.monthlyregistrations.find())
    for reg in monthly_regs:
        month_key = reg.get('monthKey')
        results['monthly'][month_key] = {
            'registrationCount': reg.get('registrationCount', 0),
            'totalRevenue': reg.get('totalRevenue', 0),
            'gradeDistribution': reg.get('gradeDistribution', {})
        }

    print(f"\n📅 월별 등록: {len(monthly_regs)}개월")
    for reg in sorted(monthly_regs, key=lambda x: x.get('monthKey', '')):
        month = reg.get('monthKey')
        count = reg.get('registrationCount', 0)
        revenue = reg.get('totalRevenue', 0)
        print(f"   {month}: {count}명, {revenue:,}원")

    # 4. 주별 총액 계산 (aggregation)
    pipeline = [
        {'$unwind': '$installments'},
        {'$match': {'installments.status': 'pending'}},
        {'$group': {
            '_id': '$installments.weekNumber',
            'totalAmount': {'$sum': '$installments.installmentAmount'},
            'totalTax': {'$sum': '$installments.withholdingTax'},
            'totalNet': {'$sum': '$installments.netAmount'},
            'count': {'$sum': 1}
        }},
        {'$sort': {'_id': 1}}
    ]

    weekly_totals = list(db.weeklypaymentplans.aggregate(pipeline))
    for week in weekly_totals:
        week_num = week['_id']
        results['weekly_totals'][week_num] = {
            'amount': week['totalAmount'],
            'tax': week['totalTax'],
            'net': week['totalNet'],
            'count': week['count']
        }

    print(f"\n📆 주별 pending 총액: {len(weekly_totals)}주")
    for week in weekly_totals[:5]:  # 처음 5개만 출력
        print(f"   {week['_id']}: {week['totalAmount']:,.0f}원 ({week['count']}건)")
    if len(weekly_totals) > 5:
        print(f"   ... ({len(weekly_totals) - 5}개 더)")

    return results


def compare_results(baseline, current):
    """두 결과 비교"""
    print_header("🔍 결과 비교")

    differences = []

    # 1. 사용자 비교
    if baseline['users']['total'] != current['users']['total']:
        differences.append(f"사용자 수: {baseline['users']['total']} → {current['users']['total']}")

    for grade in set(list(baseline['users']['by_grade'].keys()) + list(current['users']['by_grade'].keys())):
        b_count = baseline['users']['by_grade'].get(grade, 0)
        c_count = current['users']['by_grade'].get(grade, 0)
        if b_count != c_count:
            differences.append(f"  {grade} 사용자: {b_count} → {c_count}")

    # 2. 지급 계획 비교
    if baseline['plans']['total'] != current['plans']['total']:
        differences.append(f"지급 계획 수: {baseline['plans']['total']} → {current['plans']['total']}")

    # 할부 상태 비교
    for status in set(list(baseline['plans']['installment_status'].keys()) +
                      list(current['plans']['installment_status'].keys())):
        b_count = baseline['plans']['installment_status'].get(status, 0)
        c_count = current['plans']['installment_status'].get(status, 0)
        if b_count != c_count:
            differences.append(f"  할부 {status}: {b_count} → {c_count}")

    # 3. pending 금액 비교
    for grade in set(list(baseline['plans']['total_pending_amount'].keys()) +
                     list(current['plans']['total_pending_amount'].keys())):
        b_amount = baseline['plans']['total_pending_amount'].get(grade, 0)
        c_amount = current['plans']['total_pending_amount'].get(grade, 0)
        if abs(b_amount - c_amount) > 1:  # 1원 오차 허용
            differences.append(f"  {grade} pending 금액: {b_amount:,.0f} → {c_amount:,.0f}")

    # 4. 주별 총액 비교
    all_weeks = set(list(baseline['weekly_totals'].keys()) + list(current['weekly_totals'].keys()))
    week_diffs = []
    for week in sorted(all_weeks):
        b_data = baseline['weekly_totals'].get(week, {'amount': 0})
        c_data = current['weekly_totals'].get(week, {'amount': 0})
        if abs(b_data.get('amount', 0) - c_data.get('amount', 0)) > 1:
            week_diffs.append(f"    {week}: {b_data.get('amount', 0):,.0f} → {c_data.get('amount', 0):,.0f}")

    if week_diffs:
        differences.append(f"주별 금액 차이: {len(week_diffs)}건")
        differences.extend(week_diffs[:10])  # 처음 10개만
        if len(week_diffs) > 10:
            differences.append(f"    ... ({len(week_diffs) - 10}개 더)")

    # 결과 출력
    if differences:
        print("❌ 차이점 발견:")
        for diff in differences:
            print(f"  {diff}")
        return False
    else:
        print("✅ 결과 일치! 모든 데이터가 동일합니다.")
        return True


def run_full_test(session, db):
    """전체 테스트 실행"""
    print_header("🧪 전체 테스트 실행")

    # 1. DB 초기화
    if not init_db():
        return None

    time.sleep(2)  # DB 초기화 후 잠시 대기

    # 2. 서버 대기
    if not wait_for_server():
        return None

    # 3. 로그인
    if not login_as_admin(session):
        return None

    # 4. 엑셀 업로드
    print_header("📤 엑셀 업로드")
    for month_name, file_path in TEST_FILES:
        if not upload_excel(session, month_name, file_path):
            print(f"⚠️ {month_name} 업로드 실패, 계속 진행")
        time.sleep(1)  # 업로드 간 대기

    # 5. 보험 설정
    set_insurance(db)

    # 6. 결과 캡처
    return capture_results(db)


def main():
    parser = argparse.ArgumentParser(description='브랜치 비교 테스트')
    parser.add_argument('--save', type=str, help='결과 저장 파일명')
    parser.add_argument('--compare', type=str, help='비교할 baseline 파일명')
    parser.add_argument('--full-test', action='store_true', help='전체 테스트 실행')
    parser.add_argument('--capture-only', action='store_true', help='현재 DB에서 결과만 캡처')

    args = parser.parse_args()

    print("\n" + "🔬" * 30)
    print("  브랜치 비교 테스트")
    print("🔬" * 30)

    db = connect_db()
    session = requests.Session()

    results = None

    if args.full_test:
        # 전체 테스트 실행
        results = run_full_test(session, db)
    elif args.capture_only:
        # 현재 DB에서 캡처만
        results = capture_results(db)
    elif args.compare:
        # 비교 모드
        results = capture_results(db)

        # baseline 로드
        baseline_path = Path(args.compare)
        if baseline_path.exists():
            with open(baseline_path, 'r') as f:
                baseline = json.load(f)
            compare_results(baseline, results)
        else:
            print(f"❌ baseline 파일 없음: {args.compare}")
            return
    else:
        # 기본: 캡처만
        results = capture_results(db)

    # 결과 저장
    if args.save and results:
        save_path = Path(args.save)
        with open(save_path, 'w') as f:
            json.dump(results, f, indent=2, default=str)
        print(f"\n💾 결과 저장됨: {save_path}")

    print("\n" + "✅" * 30)
    print("  완료")
    print("✅" * 30 + "\n")


if __name__ == "__main__":
    main()
