#!/usr/bin/env python3
"""
월 삭제 후 이전 월 재처리 비교 테스트

방법:
1. 7월 → 8월 → 9월 → 10월 → 11월 순차 업로드
2. 각 월 업로드 후 스냅샷 저장
3. 11월 삭제 → 10월 스냅샷과 비교
4. 10월 삭제 → 9월 스냅샷과 비교
5. 9월 삭제 → 8월 스냅샷과 비교
6. 8월 삭제 → 7월 스냅샷과 비교

사용법:
  python3 scripts/test/test_delete_and_compare.py
  python3 scripts/test/test_delete_and_compare.py --port 3101
"""

import requests
import sys
import json
import argparse
import openpyxl
import subprocess
from pathlib import Path
from pymongo import MongoClient
from copy import deepcopy

# 설정
MONGO_URI = "mongodb://localhost:27017"
DB_NAME = "nanumpay"
ADMIN_LOGIN_ID = "관리자"
ADMIN_PASSWORD = "admin1234!!"

# 폴더별 엑셀 파일 경로
EXCEL_FILES = {
    "7월": "test-data/test/7월_용역자명단_간단.xlsx",
    "8월": "test-data/test/8월_용역자명단_간단.xlsx",
    "9월": "test-data/test/9월_용역자명단_간단.xlsx",
    "10월": "test-data/test/10월_용역자명단_간단.xlsx",
    "11월": "test-data/test/11월_용역자명단_간단.xlsx",
}

MONTH_ORDER = ["7월", "8월", "9월", "10월", "11월"]
MONTH_KEYS = {
    "7월": "2025-07",
    "8월": "2025-08",
    "9월": "2025-09",
    "10월": "2025-10",
    "11월": "2025-11",
}


def print_header(text):
    print(f"\n{'='*60}")
    print(f"  {text}")
    print(f"{'='*60}")


def print_subheader(text):
    print(f"\n{'-'*40}")
    print(f"  {text}")
    print(f"{'-'*40}")


def connect_db():
    client = MongoClient(MONGO_URI)
    return client[DB_NAME]


def reset_db():
    """DB 초기화"""
    print_header("🗑️ DB 초기화")

    project_root = Path(__file__).parent.parent.parent
    db_dir = project_root / "apps/web/install/linux/db"
    init_script = project_root / "apps/web/install/linux/db_init.sh"

    try:
        result = subprocess.run(
            ["bash", str(init_script), "--force"],
            env={"DB_DIR": str(db_dir), "PATH": "/usr/bin:/bin"},
            capture_output=True,
            text=True,
            cwd=str(project_root)
        )

        if result.returncode == 0:
            print("✅ DB 초기화 완료")
            return True
        else:
            print(f"❌ DB 초기화 실패: {result.stderr}")
            return False
    except Exception as e:
        print(f"❌ DB 초기화 오류: {e}")
        return False


def login_admin(base_url):
    response = requests.post(
        f"{base_url}/api/auth/login",
        json={"loginId": ADMIN_LOGIN_ID, "password": ADMIN_PASSWORD}
    )
    if response.status_code == 200:
        return response.cookies
    return None


def read_excel_to_json(file_path):
    wb = openpyxl.load_workbook(file_path)
    ws = wb.active

    headers = [str(cell.value).strip() if cell.value else None for cell in ws[1]]

    data = []
    for row in ws.iter_rows(min_row=2, values_only=True):
        row_data = {}
        for idx, value in enumerate(row):
            if idx < len(headers) and value is not None and str(value).strip():
                row_data[f'__EMPTY_{idx}' if idx > 0 else '__EMPTY'] = str(value).strip()
                if headers[idx]:
                    row_data[headers[idx]] = str(value).strip()
        if row_data:
            data.append(row_data)

    return data


def upload_excel(cookies, base_url, users_data, file_name):
    response = requests.post(
        f"{base_url}/api/admin/users/bulk",
        json={"users": users_data, "fileName": file_name},
        cookies=cookies
    )
    if response.status_code == 200:
        return response.json()
    return None


def delete_month(cookies, base_url, month_key):
    """월 삭제 API 호출"""
    response = requests.post(
        f"{base_url}/api/admin/db/delete-monthly",
        json={"monthKey": month_key},
        cookies=cookies
    )
    if response.status_code == 200:
        return response.json()
    else:
        print(f"❌ 삭제 실패: {response.status_code}")
        print(response.text[:500])
        return None


def capture_snapshot(db):
    """현재 DB 상태 스냅샷 캡처"""
    snapshot = {
        'users': [],
        'payment_plans': [],
        'monthly_registrations': []
    }

    # Users (type='user'만)
    users = list(db.users.find({'type': 'user'}).sort([('name', 1)]))
    for user in users:
        snapshot['users'].append({
            'name': user.get('name'),
            'grade': user.get('grade'),
            'status': user.get('status'),
            'leftChildId': user.get('leftChildId'),
            'rightChildId': user.get('rightChildId'),
        })

    # Payment Plans
    plans = list(db.weeklypaymentplans.find().sort([('userName', 1), ('revenueMonth', 1), ('planType', 1)]))
    for plan in plans:
        plan_data = {
            'userName': plan.get('userName'),
            'baseGrade': plan.get('baseGrade'),
            'revenueMonth': plan.get('revenueMonth'),
            'planType': plan.get('planType'),
            'planStatus': plan.get('planStatus'),
            'installmentType': plan.get('installmentType', 'basic'),
            'installments': []
        }
        for inst in plan.get('installments', []):
            plan_data['installments'].append({
                'week': inst.get('week'),
                'status': inst.get('status'),
                'installmentAmount': inst.get('installmentAmount'),
                'scheduledDate': str(inst.get('scheduledDate', ''))[:10]
            })
        snapshot['payment_plans'].append(plan_data)

    # Monthly Registrations
    regs = list(db.monthlyregistrations.find().sort('monthKey', 1))
    for reg in regs:
        snapshot['monthly_registrations'].append({
            'monthKey': reg.get('monthKey'),
            'registrationCount': len(reg.get('registrations', [])),
            'totalRevenue': reg.get('totalRevenue', 0),
        })

    return snapshot


def compare_snapshots(expected, actual, label=""):
    """두 스냅샷 비교"""
    differences = []

    # Users 비교
    if len(expected['users']) != len(actual['users']):
        differences.append(f"Users 수: {len(expected['users'])} vs {len(actual['users'])}")
    else:
        for i, (exp_user, act_user) in enumerate(zip(expected['users'], actual['users'])):
            for key in ['name', 'grade', 'status']:
                if exp_user.get(key) != act_user.get(key):
                    differences.append(f"User {exp_user.get('name')} {key}: {exp_user.get(key)} vs {act_user.get(key)}")

    # Payment Plans 비교
    if len(expected['payment_plans']) != len(actual['payment_plans']):
        differences.append(f"Plans 수: {len(expected['payment_plans'])} vs {len(actual['payment_plans'])}")
    else:
        for exp_plan, act_plan in zip(expected['payment_plans'], actual['payment_plans']):
            key = f"{exp_plan['userName']}/{exp_plan['revenueMonth']}/{exp_plan['planType']}"

            for field in ['baseGrade', 'planStatus', 'installmentType']:
                if exp_plan.get(field) != act_plan.get(field):
                    differences.append(f"Plan {key} {field}: {exp_plan.get(field)} vs {act_plan.get(field)}")

            # Installments 비교
            if len(exp_plan['installments']) != len(act_plan['installments']):
                differences.append(f"Plan {key} installments 수: {len(exp_plan['installments'])} vs {len(act_plan['installments'])}")
            else:
                for i, (exp_inst, act_inst) in enumerate(zip(exp_plan['installments'], act_plan['installments'])):
                    for field in ['status', 'installmentAmount', 'scheduledDate']:
                        if exp_inst.get(field) != act_inst.get(field):
                            differences.append(f"Plan {key} inst{i+1} {field}: {exp_inst.get(field)} vs {act_inst.get(field)}")

    # Monthly Registrations 비교
    if len(expected['monthly_registrations']) != len(actual['monthly_registrations']):
        differences.append(f"MonthlyReg 수: {len(expected['monthly_registrations'])} vs {len(actual['monthly_registrations'])}")

    return differences


def main():
    parser = argparse.ArgumentParser(description='월 삭제 후 비교 테스트')
    parser.add_argument('--port', type=int, default=3101, help='서버 포트')
    args = parser.parse_args()

    base_url = f"http://localhost:{args.port}"
    project_root = Path(__file__).parent.parent.parent

    print_header("🧪 월 삭제 후 재처리 비교 테스트")
    print(f"  서버: {base_url}")

    # DB 초기화
    if not reset_db():
        sys.exit(1)

    db = connect_db()

    # 로그인
    print_subheader("🔐 관리자 로그인")
    cookies = login_admin(base_url)
    if not cookies:
        print("❌ 로그인 실패")
        sys.exit(1)
    print("  ✅ 로그인 성공")

    # ========================================
    # Phase 1: 순차 업로드 및 스냅샷 저장
    # ========================================
    print_header("📤 Phase 1: 순차 업로드 및 스냅샷 저장")

    snapshots = {}

    for month in MONTH_ORDER:
        print_subheader(f"📤 {month} 업로드")

        file_path = project_root / EXCEL_FILES[month]
        if not file_path.exists():
            print(f"❌ 파일 없음: {file_path}")
            continue

        users_data = read_excel_to_json(file_path)
        result = upload_excel(cookies, base_url, users_data, month)

        if result:
            print(f"  ✅ {result.get('created', 0)}명 등록")

            # 스냅샷 저장
            snapshots[month] = capture_snapshot(db)
            print(f"  📸 스냅샷 저장: Users={len(snapshots[month]['users'])}, Plans={len(snapshots[month]['payment_plans'])}")
        else:
            print(f"  ❌ 업로드 실패")

    # ========================================
    # Phase 2: 역순 삭제 및 비교
    # ========================================
    print_header("🗑️ Phase 2: 역순 삭제 및 비교")

    results = {}

    # 11월 → 10월 → 9월 → 8월 순으로 삭제
    delete_order = ["11월", "10월", "9월", "8월"]
    compare_targets = ["10월", "9월", "8월", "7월"]

    for delete_month, compare_month in zip(delete_order, compare_targets):
        print_subheader(f"🗑️ {delete_month} 삭제 → {compare_month} 스냅샷과 비교")

        month_key = MONTH_KEYS[delete_month]

        # 삭제 실행
        delete_result = delete_month_api(cookies, base_url, month_key)

        if delete_result:
            print(f"  ✅ 삭제 완료")
            print(f"     - 삭제된 용역자: {delete_result.get('deletedUsers', 0)}")
            print(f"     - 삭제된 계획: {delete_result.get('deletedPlans', 0)}")
            print(f"     - 재처리 월: {delete_result.get('reprocessedMonth', 'N/A')}")

            # 현재 상태 캡처
            current_snapshot = capture_snapshot(db)

            # 비교
            expected_snapshot = snapshots.get(compare_month)
            if expected_snapshot:
                differences = compare_snapshots(expected_snapshot, current_snapshot)

                if not differences:
                    print(f"  ✅ {compare_month} 스냅샷과 완벽히 일치!")
                    results[delete_month] = {'status': 'PASS'}
                else:
                    print(f"  ❌ {len(differences)}개 차이 발견:")
                    for diff in differences[:10]:
                        print(f"     • {diff}")
                    if len(differences) > 10:
                        print(f"     ... 외 {len(differences) - 10}개")
                    results[delete_month] = {'status': 'FAIL', 'differences': len(differences)}

                    # 상세 분석 출력
                    print(f"\n  📋 상세 분석:")
                    print(f"     Expected plans ({len(expected_snapshot['payment_plans'])}):")
                    exp_users = set()
                    act_users = set()
                    for p in expected_snapshot['payment_plans']:
                        exp_users.add(f"{p['userName']}/{p['revenueMonth']}/{p['planType']}")
                    for p in current_snapshot['payment_plans']:
                        act_users.add(f"{p['userName']}/{p['revenueMonth']}/{p['planType']}")

                    missing = exp_users - act_users
                    extra = act_users - exp_users
                    if missing:
                        print(f"     ❌ 누락된 계획 ({len(missing)}):")
                        for m in sorted(missing)[:10]:
                            print(f"        - {m}")
                    if extra:
                        print(f"     ➕ 추가된 계획 ({len(extra)}):")
                        for e in sorted(extra)[:10]:
                            print(f"        - {e}")
            else:
                print(f"  ⚠️ {compare_month} 스냅샷 없음")
                results[delete_month] = {'status': 'SKIP'}
        else:
            print(f"  ❌ 삭제 실패")
            results[delete_month] = {'status': 'ERROR'}

    # ========================================
    # 최종 결과
    # ========================================
    print_header("📊 최종 결과")

    passed = sum(1 for r in results.values() if r['status'] == 'PASS')
    failed = sum(1 for r in results.values() if r['status'] == 'FAIL')

    for month, result in results.items():
        status_emoji = {'PASS': '✅', 'FAIL': '❌', 'SKIP': '⚠️', 'ERROR': '💥'}.get(result['status'], '❓')
        extra = f" ({result.get('differences', 0)}개 차이)" if result['status'] == 'FAIL' else ""
        print(f"  {status_emoji} {month} 삭제: {result['status']}{extra}")

    print(f"\n  합계: {passed} PASS / {failed} FAIL")

    if failed == 0:
        print("\n🎉 모든 테스트 통과!")
        return 0
    else:
        print("\n❌ 일부 테스트 실패")
        return 1


def delete_month_api(cookies, base_url, month_key):
    """월 삭제 API 호출"""
    response = requests.post(
        f"{base_url}/api/admin/db/delete-monthly",
        json={"monthKey": month_key},
        cookies=cookies
    )
    if response.status_code == 200:
        return response.json()
    else:
        print(f"  삭제 API 오류: {response.status_code}")
        try:
            print(f"  {response.json()}")
        except:
            print(f"  {response.text[:200]}")
        return None


if __name__ == "__main__":
    sys.exit(main())
