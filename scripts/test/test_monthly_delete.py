#!/usr/bin/env python3
"""
월별 데이터 삭제 테스트 스크립트
Cascade 삭제가 제대로 작동하는지 확인

사용법:
  python3 scripts/test/test_monthly_delete.py 10월     # 10월 데이터 삭제
  python3 scripts/test/test_monthly_delete.py all      # 10월→9월→8월→7월 순차 삭제
"""

import requests
import sys
import json
from pathlib import Path

BASE_URL = "http://localhost:3100"
ADMIN_LOGIN_ID = "관리자"
ADMIN_PASSWORD = "admin1234!!"

def login_admin():
    """관리자 로그인"""
    print("🔐 관리자 로그인 중...")

    response = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={
            "loginId": ADMIN_LOGIN_ID,
            "password": ADMIN_PASSWORD
        }
    )

    if response.status_code == 200:
        print(f"✅ 관리자 로그인 성공")
        return response.cookies
    else:
        print(f"❌ 로그인 실패: {response.status_code}")
        print(response.text)
        sys.exit(1)

def check_db_orphans():
    """MongoDB에서 고아 참조 확인"""
    print("\n🔍 고아 참조 확인 중...")

    script = """
    const users = db.users.find({}).toArray();
    let orphanCount = 0;
    const orphans = [];

    for (const user of users) {
        if (user.leftChildId) {
            const leftExists = db.users.findOne({_id: user.leftChildId});
            if (!leftExists) {
                orphanCount++;
                orphans.push({ user: user.name, field: 'leftChildId' });
            }
        }

        if (user.rightChildId) {
            const rightExists = db.users.findOne({_id: user.rightChildId});
            if (!rightExists) {
                orphanCount++;
                orphans.push({ user: user.name, field: 'rightChildId' });
            }
        }
    }

    print(JSON.stringify({ orphanCount, orphans }));
    """

    import subprocess
    result = subprocess.run(
        ['mongosh', 'mongodb://localhost:27017/nanumpay', '--quiet', '--eval', script],
        capture_output=True,
        text=True
    )

    if result.returncode == 0:
        try:
            data = json.loads(result.stdout.strip().split('\n')[-1])
            if data['orphanCount'] == 0:
                print(f"✅ 고아 참조 없음!")
            else:
                print(f"❌ 고아 참조 {data['orphanCount']}개 발견:")
                for orphan in data['orphans']:
                    print(f"   - {orphan['user']}.{orphan['field']}")
            return data['orphanCount']
        except Exception as e:
            print(f"⚠️  파싱 실패: {e}")
            print(result.stdout)
            return -1
    else:
        print(f"❌ MongoDB 쿼리 실패")
        print(result.stderr)
        return -1

def delete_monthly_data(cookies, month_key):
    """월별 데이터 삭제"""
    print(f"\n🗑️  {month_key} 데이터 삭제 중...")

    response = requests.post(
        f"{BASE_URL}/api/admin/db/delete-monthly",
        json={"monthKey": month_key},
        cookies=cookies
    )

    if response.status_code == 200:
        result = response.json()
        print(f"\n{'='*60}")
        print(f"✅ {month_key} 삭제 성공!")
        print(f"{'='*60}")
        print(f"📊 삭제된 용역자: {result.get('deletedUsers', 0)}명")
        print(f"📊 삭제된 설계사: {result.get('deletedPlanners', 0)}명")
        print(f"📊 삭제된 월별 등록: {result.get('deletedRegistrations', 0)}건")
        print(f"📊 삭제된 지급 계획: {result.get('deletedPlans', 0)}건")
        print(f"📊 삭제된 주간 요약: {result.get('deletedSummaries', 0)}건")
        print(f"{'='*60}\n")
        return True
    else:
        print(f"\n{'='*60}")
        print(f"❌ {month_key} 삭제 실패: {response.status_code}")
        print(f"{'='*60}")
        try:
            error_data = response.json()
            print(f"오류: {error_data.get('error', '알 수 없는 오류')}")
        except:
            print(response.text)
        print(f"{'='*60}\n")
        return False

def get_user_count(cookies):
    """전체 사용자 수 조회"""
    response = requests.get(
        f"{BASE_URL}/api/admin/users?limit=1",
        cookies=cookies
    )

    if response.status_code == 200:
        data = response.json()
        return data.get('pagination', {}).get('total', 0)
    return -1

def main():
    if len(sys.argv) < 2:
        print("사용법: python3 scripts/test/test_monthly_delete.py [2025-10|all]")
        sys.exit(1)

    test_type = sys.argv[1]

    # 로그인
    cookies = login_admin()

    if test_type == "all":
        # 역순으로 전체 삭제 (10월 → 9월 → 8월 → 7월)
        print("\n" + "="*60)
        print("🚀 전체 월별 데이터 삭제 테스트 시작 (역순)")
        print("="*60 + "\n")

        for month in ["2025-10", "2025-09", "2025-08", "2025-07"]:
            print(f"\n{'#'*60}")
            print(f"# {month} 삭제 테스트")
            print(f"{'#'*60}\n")

            # 삭제 전 사용자 수
            before_count = get_user_count(cookies)
            print(f"📊 삭제 전 사용자 수: {before_count}명")

            # 삭제 실행
            success = delete_monthly_data(cookies, month)

            if success:
                # 삭제 후 사용자 수
                after_count = get_user_count(cookies)
                print(f"📊 삭제 후 사용자 수: {after_count}명 (감소: {before_count - after_count}명)")

                # 고아 참조 확인
                orphan_count = check_db_orphans()

                if orphan_count == 0:
                    print(f"✅ {month} cascade 삭제 성공!")
                else:
                    print(f"❌ {month} cascade 삭제 실패! 고아 참조 {orphan_count}개")
                    sys.exit(1)
            else:
                print(f"❌ {month} 삭제 실패")
                sys.exit(1)

        print("\n" + "="*60)
        print("✅ 전체 삭제 테스트 성공!")
        print("="*60 + "\n")

    else:
        # 개별 월 삭제
        month_key = test_type
        if not month_key.startswith("2025-"):
            month_key = f"2025-{test_type.replace('월', '').zfill(2)}"

        print(f"\n{'='*60}")
        print(f"🚀 {month_key} 삭제 테스트")
        print(f"{'='*60}\n")

        # 삭제 전 사용자 수
        before_count = get_user_count(cookies)
        print(f"📊 삭제 전 사용자 수: {before_count}명")

        # 삭제 실행
        success = delete_monthly_data(cookies, month_key)

        if success:
            # 삭제 후 사용자 수
            after_count = get_user_count(cookies)
            print(f"📊 삭제 후 사용자 수: {after_count}명 (감소: {before_count - after_count}명)")

            # 고아 참조 확인
            orphan_count = check_db_orphans()

            if orphan_count == 0:
                print(f"✅ {month_key} cascade 삭제 성공!")
            else:
                print(f"❌ {month_key} cascade 삭제 실패! 고아 참조 {orphan_count}개")
                sys.exit(1)
        else:
            sys.exit(1)

if __name__ == "__main__":
    main()
