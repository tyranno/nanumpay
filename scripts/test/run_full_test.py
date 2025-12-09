#!/usr/bin/env python3
"""
전체 테스트 실행 스크립트
1. DB 초기화
2. 7~11월 엑셀 순차 업로드
3. F4+ 등급 보험금액 설정 (DB 직접)
4. 지급 계획 검증

사용법:
  python3 scripts/test/run_full_test.py                    # 전체 테스트
  python3 scripts/test/run_full_test.py --skip-init        # DB 초기화 생략
  python3 scripts/test/run_full_test.py --skip-upload      # 업로드 생략 (검증만)
  python3 scripts/test/run_full_test.py --detail           # 상세 검증
"""

import subprocess
import sys
import time
import argparse
import requests
from pathlib import Path
from pymongo import MongoClient

BASE_URL = "http://localhost:3100"
PROJECT_ROOT = Path(__file__).parent.parent.parent
MONGO_URI = "mongodb://localhost:27017"
DB_NAME = "nanumpay"

# v8.0 보험 조건
INSURANCE_REQUIREMENTS = {
    'F4': 70000,
    'F5': 70000,
    'F6': 90000,
    'F7': 90000,
    'F8': 110000,
}

# 테스트 파일 순서
TEST_FILES = [
    ("7월", "test-data/verify/7월_용역자명단_간단.xlsx"),
    ("7월추가", "test-data/verify/7월_용역자명단_추가.xlsx"),
    ("8월", "test-data/verify/8월_용역자명단_간단.xlsx"),
    ("9월", "test-data/verify/9월_용역자명단_간단.xlsx"),
    ("10월", "test-data/verify/10월_용역자명단_간단.xlsx"),
    ("11월", "test-data/verify/11월_용역자명단_간단.xlsx"),
]


def print_header(title):
    """헤더 출력"""
    print(f"\n{'#'*70}")
    print(f"#  {title}")
    print(f"{'#'*70}\n")


def print_subheader(title):
    """서브헤더 출력"""
    print(f"\n{'='*60}")
    print(f"  {title}")
    print(f"{'='*60}")


def connect_db():
    """MongoDB 연결"""
    client = MongoClient(MONGO_URI)
    return client[DB_NAME]


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
        print(f"  ... {i+1}초")
    print("❌ 서버 응답 없음")
    return False


def init_db():
    """DB 초기화"""
    print_header("1단계: DB 초기화")

    db_init_script = PROJECT_ROOT / "apps/web/install/linux/db_init.sh"
    db_dir = PROJECT_ROOT / "apps/web/install/linux/db"

    if not db_init_script.exists():
        print(f"❌ 스크립트 없음: {db_init_script}")
        return False

    env = {"DB_DIR": str(db_dir)}
    result = subprocess.run(
        ["bash", str(db_init_script), "--force"],
        env={**subprocess.os.environ, **env},
        cwd=str(PROJECT_ROOT),
        capture_output=True,
        text=True
    )

    if result.returncode == 0:
        print("✅ DB 초기화 완료")
        return True
    else:
        print(f"❌ DB 초기화 실패")
        print(result.stderr)
        return False


def check_server_running():
    """서버 실행 확인"""
    try:
        response = requests.get(f"{BASE_URL}/api/health", timeout=2)
        return response.status_code == 200
    except:
        return False


def set_insurance_for_f4_plus(db):
    """F4+ 등급 사용자에게 보험금액 설정 (DB 직접)"""
    print_subheader("💼 F4+ 등급 보험금액 설정")

    updated_count = 0
    for grade, amount in INSURANCE_REQUIREMENTS.items():
        # 해당 등급 사용자 조회
        users = list(db.users.find({'grade': grade, 'type': 'user'}))

        if users:
            print(f"\n  {grade} 등급 ({len(users)}명) → {amount:,}원 설정")
            for user in users:
                # insuranceAmount가 없거나 부족한 경우만 설정
                current = user.get('insuranceAmount', 0)
                if current < amount:
                    db.users.update_one(
                        {'_id': user['_id']},
                        {'$set': {'insuranceAmount': amount}}
                    )
                    print(f"    ✅ {user.get('name')}: {current:,}원 → {amount:,}원")
                    updated_count += 1
                else:
                    print(f"    ⏭️  {user.get('name')}: 이미 {current:,}원 (충분)")

    if updated_count == 0:
        print("\n  ⏭️  설정할 F4+ 사용자 없음")
    else:
        print(f"\n  ✅ 총 {updated_count}명 보험금액 설정 완료")

    return updated_count


def show_grade_distribution(db):
    """등급 분포 출력"""
    pipeline = [
        {'$match': {'type': 'user'}},
        {'$group': {'_id': '$grade', 'count': {'$sum': 1}}},
        {'$sort': {'_id': 1}}
    ]
    result = list(db.users.aggregate(pipeline))

    print("\n  📊 현재 등급 분포:")
    for item in result:
        grade = item['_id'] or 'F1'
        count = item['count']
        insurance = INSURANCE_REQUIREMENTS.get(grade, 0)
        if insurance:
            print(f"    {grade}: {count}명 (보험 필요: {insurance:,}원)")
        else:
            print(f"    {grade}: {count}명")


def upload_single_month(month_name):
    """단일 월 업로드"""
    upload_script = PROJECT_ROOT / "scripts/test/test_excel_upload.py"

    result = subprocess.run(
        ["python3", str(upload_script), month_name, "--folder", "verify"],
        cwd=str(PROJECT_ROOT),
        capture_output=False
    )

    return result.returncode == 0


def upload_excel_files_with_insurance():
    """엑셀 파일 순차 업로드 + 보험 설정"""
    print_header("2단계: 엑셀 파일 업로드 + 보험 설정")

    upload_script = PROJECT_ROOT / "scripts/test/test_excel_upload.py"

    if not upload_script.exists():
        print(f"❌ 스크립트 없음: {upload_script}")
        return False

    db = connect_db()

    for month_name, file_path in TEST_FILES:
        full_path = PROJECT_ROOT / file_path
        if not full_path.exists():
            print(f"⚠️  파일 없음: {file_path}")
            continue

        print(f"\n{'='*60}")
        print(f"📤 {month_name} 업로드")
        print(f"{'='*60}")

        # 업로드 실행
        success = upload_single_month(month_name)

        if not success:
            print(f"⚠️  {month_name} 업로드 실패")

        # 업로드 후 잠시 대기
        time.sleep(1)

        # 등급 분포 확인
        show_grade_distribution(db)

        # F4+ 보험 설정
        set_insurance_for_f4_plus(db)

        # 다음 업로드 전 대기
        time.sleep(1)

    return True


def verify_payment_plans(detail=False):
    """지급 계획 검증"""
    print_header("3단계: 지급 계획 검증")

    verify_script = PROJECT_ROOT / "scripts/test/verify_payment_plans.py"

    if not verify_script.exists():
        print(f"❌ 스크립트 없음: {verify_script}")
        return False

    args = ["python3", str(verify_script)]
    if detail:
        args.append("--detail")

    result = subprocess.run(
        args,
        cwd=str(PROJECT_ROOT),
        capture_output=False
    )

    return result.returncode == 0


def verify_insurance_conditions(db):
    """보험 조건 검증"""
    print_header("4단계: F4+ 보험 조건 검증")

    # F4+ 사용자 중 보험 미달자 확인
    print("\n📋 F4+ 보험 현황:")

    issues = []
    for grade, required in INSURANCE_REQUIREMENTS.items():
        users = list(db.users.find({'grade': grade, 'type': 'user'}))

        if not users:
            continue

        print(f"\n  {grade} 등급 (필요: {required:,}원):")
        for user in users:
            current = user.get('insuranceAmount', 0)
            status = '✅' if current >= required else '❌'
            print(f"    {status} {user.get('name')}: {current:,}원")

            if current < required:
                issues.append({
                    'name': user.get('name'),
                    'grade': grade,
                    'current': current,
                    'required': required
                })

    # 추가지급 계획 검증
    print("\n📋 F4+ 추가지급 계획 검증:")

    plans = list(db.weeklypaymentplans.find({
        'baseGrade': {'$in': list(INSURANCE_REQUIREMENTS.keys())},
        'installmentType': 'additional'
    }))

    if not plans:
        print("  ⏭️  F4+ 추가지급 계획 없음")
    else:
        for plan in plans:
            user = db.users.find_one({'_id': plan.get('userId')})
            user_name = user.get('name') if user else 'Unknown'
            grade = plan.get('baseGrade')
            status = plan.get('planStatus')

            # 사용자 보험금액 확인
            insurance = user.get('insuranceAmount', 0) if user else 0
            required = INSURANCE_REQUIREMENTS.get(grade, 0)

            insurance_ok = '✅' if insurance >= required else '❌'

            print(f"  {user_name} ({grade}): {status} - 보험 {insurance_ok} ({insurance:,}/{required:,}원)")

    if issues:
        print(f"\n⚠️  보험 미달자 {len(issues)}명 (추가지급 생성 안 됨)")
    else:
        print(f"\n✅ 모든 F4+ 사용자 보험 충족")

    return len(issues) == 0


def main():
    parser = argparse.ArgumentParser(description='전체 테스트 실행')
    parser.add_argument('--skip-init', action='store_true', help='DB 초기화 생략')
    parser.add_argument('--skip-upload', action='store_true', help='업로드 생략')
    parser.add_argument('--detail', '-d', action='store_true', help='상세 검증')

    args = parser.parse_args()

    print("\n" + "🚀" * 35)
    print("  v8.0 보험 조건 테스트 시작")
    print("🚀" * 35)

    # 서버 실행 확인
    if not check_server_running():
        print("\n❌ 서버가 실행되지 않았습니다.")
        print("먼저 다음 명령어로 서버를 실행하세요:")
        print("  pnpm dev:web --host")
        sys.exit(1)

    print("✅ 서버 실행 확인됨")

    # 1. DB 초기화
    if not args.skip_init and not args.skip_upload:
        if not init_db():
            print("\n❌ DB 초기화 실패. 테스트 중단.")
            sys.exit(1)

        # DB 초기화 후 서버 재시작 대기
        print("\n⏳ DB 초기화 후 서버 안정화 대기 (5초)...")
        time.sleep(5)

    # 2. 엑셀 업로드 + 보험 설정
    if not args.skip_upload:
        if not upload_excel_files_with_insurance():
            print("\n⚠️  일부 업로드 실패")

        # 업로드 후 처리 대기
        print("\n⏳ 업로드 후 처리 대기 (3초)...")
        time.sleep(3)

    # 3. 검증
    verify_payment_plans(args.detail)

    # 4. 보험 조건 검증
    db = connect_db()
    verify_insurance_conditions(db)

    print("\n" + "✅" * 35)
    print("  테스트 완료")
    print("✅" * 35 + "\n")


if __name__ == "__main__":
    main()
