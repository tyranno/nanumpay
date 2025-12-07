#!/usr/bin/env python3
"""
지급 계획 검증 스크립트
v8.0: 보험 조건 및 지급 상태 검증

사용법:
  python3 scripts/test/verify_payment_plans.py              # 전체 요약
  python3 scripts/test/verify_payment_plans.py --detail     # 상세 출력
  python3 scripts/test/verify_payment_plans.py --month 11   # 특정 월 검증
  python3 scripts/test/verify_payment_plans.py --user 사장님 # 특정 사용자 검증
"""

import argparse
from pymongo import MongoClient
from collections import defaultdict
from datetime import datetime

# MongoDB 연결
MONGO_URI = "mongodb://localhost:27017"
DB_NAME = "nanumpay"

# v8.0 보험 조건
GRADE_LIMITS = {
    'F1': {'maxInstallments': 20, 'insuranceRequired': False, 'insuranceAmount': 0},
    'F2': {'maxInstallments': 30, 'insuranceRequired': False, 'insuranceAmount': 0},
    'F3': {'maxInstallments': 40, 'insuranceRequired': False, 'insuranceAmount': 0},
    'F4': {'maxInstallments': 40, 'insuranceRequired': True, 'insuranceAmount': 70000},
    'F5': {'maxInstallments': 50, 'insuranceRequired': True, 'insuranceAmount': 70000},
    'F6': {'maxInstallments': 50, 'insuranceRequired': True, 'insuranceAmount': 90000},
    'F7': {'maxInstallments': 60, 'insuranceRequired': True, 'insuranceAmount': 90000},
    'F8': {'maxInstallments': 60, 'insuranceRequired': True, 'insuranceAmount': 110000},
}


def connect_db():
    """MongoDB 연결"""
    client = MongoClient(MONGO_URI)
    db = client[DB_NAME]
    return db


def print_section(title):
    """섹션 헤더 출력"""
    print(f"\n{'='*60}")
    print(f"  {title}")
    print(f"{'='*60}")


def verify_users(db, detail=False):
    """사용자 및 등급 분포 검증"""
    print_section("👥 사용자 및 등급 분포")

    users = list(db.users.find({'type': 'user'}))
    total = len(users)

    # 등급별 분포
    grade_dist = defaultdict(int)
    insurance_dist = defaultdict(list)

    for user in users:
        grade = user.get('grade', 'F1')
        grade_dist[grade] += 1

        # 보험 정보
        insurance_amount = user.get('insuranceAmount', 0)
        if grade in ['F4', 'F5', 'F6', 'F7', 'F8']:
            required = GRADE_LIMITS[grade]['insuranceAmount']
            status = '✅' if insurance_amount >= required else '❌'
            insurance_dist[grade].append({
                'name': user.get('name'),
                'amount': insurance_amount,
                'required': required,
                'status': status
            })

    print(f"\n총 사용자: {total}명")
    print(f"\n📊 등급별 분포:")
    for grade in sorted(grade_dist.keys()):
        count = grade_dist[grade]
        insurance_info = ""
        if grade in GRADE_LIMITS and GRADE_LIMITS[grade]['insuranceRequired']:
            required = GRADE_LIMITS[grade]['insuranceAmount']
            insurance_info = f" (보험 필수: {required:,}원)"
        print(f"  {grade}: {count}명{insurance_info}")

    # F4+ 보험 상태 확인
    if any(insurance_dist.values()):
        print(f"\n💼 F4+ 보험 가입 현황:")
        for grade in ['F4', 'F5', 'F6', 'F7', 'F8']:
            if insurance_dist[grade]:
                total_grade = len(insurance_dist[grade])
                insured = sum(1 for u in insurance_dist[grade] if u['status'] == '✅')
                print(f"  {grade}: {insured}/{total_grade}명 가입")

                if detail:
                    for u in insurance_dist[grade]:
                        print(f"    {u['status']} {u['name']}: {u['amount']:,}원 (필요: {u['required']:,}원)")

    return users


def verify_monthly_registrations(db, month=None, detail=False):
    """월별 등록 정보 검증"""
    print_section("📅 월별 등록 정보")

    query = {}
    if month:
        query['monthKey'] = {'$regex': f'-{month:02d}$'}

    registrations = list(db.monthlyregistrations.find(query).sort('monthKey', 1))

    if not registrations:
        print("등록 정보 없음")
        return

    for reg in registrations:
        month_key = reg.get('monthKey')
        reg_count = len(reg.get('registrations', []))
        revenue = reg.get('totalRevenue', 0)

        print(f"\n📆 {month_key}")
        print(f"  등록자: {reg_count}명")
        print(f"  매출: {revenue:,}원")

        # 지급 대상자 정보
        targets = reg.get('paymentTargets', {})
        registrants = len(targets.get('registrants', []))
        promoted = len(targets.get('promoted', []))
        additional = len(targets.get('additionalPayments', []))

        print(f"  지급 대상자:")
        print(f"    - 등록자(미승급): {registrants}명")
        print(f"    - 승급자: {promoted}명")
        print(f"    - 추가지급: {additional}명")

        # 등급별 분포
        grade_dist = reg.get('gradeDistribution', {})
        if grade_dist:
            non_zero = {k: v for k, v in grade_dist.items() if v > 0}
            if non_zero:
                print(f"  등급별 분포: {non_zero}")

        # 등급별 지급액
        grade_payments = reg.get('gradePayments', {})
        if grade_payments and detail:
            print(f"  등급별 지급액:")
            for grade, amount in sorted(grade_payments.items()):
                if amount > 0:
                    print(f"    {grade}: {amount:,.0f}원")


def verify_payment_plans(db, month=None, user_name=None, detail=False):
    """지급 계획 검증"""
    print_section("📋 지급 계획 검증")

    query = {}
    if month:
        query['revenueMonth'] = {'$regex': f'-{month:02d}$'}
    if user_name:
        query['userName'] = user_name

    plans = list(db.weeklypaymentplans.find(query))

    if not plans:
        print("지급 계획 없음")
        return

    # 통계
    stats = {
        'total': len(plans),
        'by_type': defaultdict(int),
        'by_status': defaultdict(int),
        'by_grade': defaultdict(int),
        'by_installment_type': defaultdict(int),
        'installment_status': defaultdict(int),
    }

    for plan in plans:
        stats['by_type'][plan.get('planType', 'unknown')] += 1
        stats['by_status'][plan.get('planStatus', 'unknown')] += 1
        stats['by_grade'][plan.get('baseGrade', 'unknown')] += 1
        stats['by_installment_type'][plan.get('installmentType', 'basic')] += 1

        # 할부 상태
        for inst in plan.get('installments', []):
            stats['installment_status'][inst.get('status', 'unknown')] += 1

    print(f"\n총 계획 수: {stats['total']}")

    print(f"\n📊 계획 유형별:")
    for plan_type, count in sorted(stats['by_type'].items()):
        print(f"  {plan_type}: {count}")

    print(f"\n📊 계획 상태별:")
    for status, count in sorted(stats['by_status'].items()):
        print(f"  {status}: {count}")

    print(f"\n📊 지급 유형별:")
    for inst_type, count in sorted(stats['by_installment_type'].items()):
        print(f"  {inst_type}: {count}")

    print(f"\n📊 등급별:")
    for grade, count in sorted(stats['by_grade'].items()):
        print(f"  {grade}: {count}")

    print(f"\n📊 할부 상태별:")
    for status, count in sorted(stats['installment_status'].items()):
        emoji = {'pending': '⏳', 'paid': '✅', 'skipped': '⏭️', 'terminated': '❌'}.get(status, '❓')
        print(f"  {emoji} {status}: {count}")

    # 상세 출력
    if detail:
        print(f"\n📝 상세 계획 목록:")
        for plan in sorted(plans, key=lambda x: (x.get('userName', ''), x.get('revenueMonth', ''))):
            user_name = plan.get('userName', 'Unknown')
            grade = plan.get('baseGrade', '?')
            plan_type = plan.get('planType', '?')
            status = plan.get('planStatus', '?')
            revenue_month = plan.get('revenueMonth', '?')
            completed = plan.get('completedInstallments', 0)
            total = plan.get('totalInstallments', 10)
            inst_type = plan.get('installmentType', 'basic')

            # 할부 상태 요약
            inst_summary = defaultdict(int)
            for inst in plan.get('installments', []):
                inst_summary[inst.get('status', '?')] += 1

            print(f"\n  {user_name} ({grade})")
            print(f"    유형: {plan_type} / {inst_type}")
            print(f"    상태: {status}")
            print(f"    매출월: {revenue_month}")
            print(f"    진행: {completed}/{total}")
            print(f"    할부: {dict(inst_summary)}")


def verify_insurance_skip(db, detail=False):
    """보험 미가입으로 인한 skip 검증"""
    print_section("⏭️ 보험 미가입 Skip 검증 (F4-F8)")

    # F4-F8 등급의 계획 조회
    plans = list(db.weeklypaymentplans.find({
        'baseGrade': {'$in': ['F4', 'F5', 'F6', 'F7', 'F8']}
    }))

    if not plans:
        print("F4-F8 등급 계획 없음")
        return

    skip_stats = defaultdict(list)

    for plan in plans:
        grade = plan.get('baseGrade')
        user_name = plan.get('userName')

        for inst in plan.get('installments', []):
            if inst.get('status') == 'skipped':
                skip_stats[grade].append({
                    'user': user_name,
                    'week': inst.get('week'),
                    'reason': inst.get('skipReason', 'unknown'),
                    'date': inst.get('scheduledDate')
                })

    if not any(skip_stats.values()):
        print("Skip된 할부 없음")
        return

    print(f"\n등급별 Skip 현황:")
    for grade in ['F4', 'F5', 'F6', 'F7', 'F8']:
        skips = skip_stats.get(grade, [])
        if skips:
            print(f"\n  {grade}: {len(skips)}건")
            if detail:
                for skip in skips[:5]:
                    print(f"    - {skip['user']}: {skip['week']}회차 ({skip['reason']})")
                if len(skips) > 5:
                    print(f"    ... 외 {len(skips) - 5}건")


def verify_grade_history(db, user_name=None, detail=False):
    """등급 변경 이력 검증"""
    print_section("📈 등급 변경 이력")

    query = {'gradeHistory': {'$exists': True, '$ne': []}}
    if user_name:
        query['name'] = user_name

    users = list(db.users.find(query))

    if not users:
        print("등급 변경 이력 없음")
        return

    # 등급 변경 통계
    promotion_stats = defaultdict(int)

    for user in users:
        history = user.get('gradeHistory', [])
        for h in history:
            if h.get('type') == 'promotion':
                from_grade = h.get('fromGrade', '?')
                to_grade = h.get('toGrade', '?')
                promotion_stats[f"{from_grade}→{to_grade}"] += 1

    print(f"\n총 이력 보유 사용자: {len(users)}명")

    if promotion_stats:
        print(f"\n📊 승급 통계:")
        for transition, count in sorted(promotion_stats.items()):
            print(f"  {transition}: {count}명")

    if detail:
        print(f"\n📝 상세 이력:")
        for user in sorted(users, key=lambda x: x.get('name', '')):
            name = user.get('name')
            history = user.get('gradeHistory', [])
            if history:
                print(f"\n  {name} ({user.get('grade', '?')})")
                for h in history:
                    h_type = h.get('type', '?')
                    revenue_month = h.get('revenueMonth', '?')
                    if h_type == 'promotion':
                        print(f"    {revenue_month}: {h.get('fromGrade')}→{h.get('toGrade')}")
                    elif h_type == 'registration':
                        print(f"    {revenue_month}: 등록 ({h.get('grade', '?')})")


def run_full_verification(db, detail=False, month=None, user_name=None):
    """전체 검증 실행"""
    print("\n" + "🔍" * 30)
    print("  지급 계획 검증 시작")
    print("🔍" * 30)

    verify_users(db, detail)
    verify_monthly_registrations(db, month, detail)
    verify_payment_plans(db, month, user_name, detail)
    verify_insurance_skip(db, detail)
    verify_grade_history(db, user_name, detail)

    print("\n" + "✅" * 30)
    print("  검증 완료")
    print("✅" * 30 + "\n")


def main():
    parser = argparse.ArgumentParser(description='지급 계획 검증')
    parser.add_argument('--detail', '-d', action='store_true', help='상세 출력')
    parser.add_argument('--month', '-m', type=int, help='특정 월 (1-12)')
    parser.add_argument('--user', '-u', help='특정 사용자 이름')

    args = parser.parse_args()

    try:
        db = connect_db()
        run_full_verification(
            db,
            detail=args.detail,
            month=args.month,
            user_name=args.user
        )
    except Exception as e:
        print(f"❌ 오류: {e}")
        import traceback
        traceback.print_exc()


if __name__ == "__main__":
    main()
