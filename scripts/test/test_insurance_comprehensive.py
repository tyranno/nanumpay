#!/usr/bin/env python3
"""
추가 보험 조건 종합 테스트 스크립트

테스트 시나리오:
1. 7월 등록 → 보험 설정(50,000) → 8,9,10월 등록 → 추가지급 발생 확인
2. 7월 등록 → 8월 등록 → 보험 설정(50,000) → 9,10월 등록 → 설정 시점부터 적용 확인
3. 7월 등록 → 보험 설정(50,000) → 8월 등록 → 9월 등록 전 보험 해제 → 10월 등록 → 영향 확인
4. 7월 등록 → 보험 미설정 → 8,9,10월 등록 → 추가지급 미발생 확인
"""

import requests
import json
import subprocess
import time
from datetime import datetime

BASE_URL = "http://localhost:3100"
ADMIN_LOGIN_ID = "관리자"
ADMIN_PASSWORD = "admin1234!!"

def print_header(text):
    """헤더 출력"""
    print("\n" + "=" * 80)
    print(text)
    print("=" * 80)

def print_step(step, text):
    """단계 출력"""
    print(f"\n{'─' * 80}")
    print(f"📍 {step}: {text}")
    print(f"{'─' * 80}")

def db_init():
    """DB 초기화"""
    print("🗄️ DB 초기화 중...")
    result = subprocess.run(
        [
            "bash",
            "-c",
            "DB_DIR=/home/tyranno/project/bill/nanumpay/apps/web/install/linux/db "
            "bash /home/tyranno/project/bill/nanumpay/apps/web/install/linux/db_init.sh --force"
        ],
        capture_output=True,
        text=True
    )
    if result.returncode == 0:
        print("✅ DB 초기화 완료\n")
        return True
    else:
        print(f"❌ DB 초기화 실패: {result.stderr}")
        return False

def login_admin():
    """관리자 로그인"""
    print("🔐 관리자 로그인 중...")
    response = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"loginId": ADMIN_LOGIN_ID, "password": ADMIN_PASSWORD}
    )
    if response.status_code == 200:
        print("✅ 로그인 성공")
        return response.cookies
    else:
        print(f"❌ 로그인 실패: {response.status_code}")
        return None

def upload_excel(cookies, month):
    """test_excel_upload.py를 사용하여 등록"""
    print(f"📤 {month}월 등록 중...")

    # test_excel_upload.py 실행
    result = subprocess.run(
        ["python3", "scripts/test/test_excel_upload.py", month],
        capture_output=True,
        text=True
    )

    if result.returncode == 0:
        print(f"✅ {month}월 등록 완료")
        print(result.stdout)
        return True
    else:
        print(f"❌ {month}월 등록 실패")
        print(result.stderr)
        return False

def set_insurance(cookies, user_name, amount):
    """특정 사용자의 보험 금액 설정"""
    print(f"💊 {user_name} 보험 설정: {amount:,}원")

    # 1. 사용자 조회
    response = requests.get(
        f"{BASE_URL}/api/admin/users?search={user_name}",
        cookies=cookies
    )

    if response.status_code != 200:
        print(f"❌ 사용자 조회 실패: {response.status_code}")
        return False

    data = response.json()
    users = data.get('users', [])
    if not users:
        print(f"❌ 사용자 '{user_name}' 없음")
        return False

    user = users[0]

    # 2. 보험 금액 업데이트 (userId 필수)
    update_data = {
        'userId': user.get('_id'),  # ⭐ userId로 전달
        'insuranceAmount': amount
    }

    response = requests.put(
        f"{BASE_URL}/api/admin/users",
        json=update_data,
        cookies=cookies
    )

    if response.status_code == 200:
        print(f"✅ {user_name} 보험 설정 완료: {amount:,}원")
        return True
    else:
        print(f"❌ 보험 설정 실패: {response.status_code}")
        print(f"   요청: {update_data}")
        return False

def check_user_info(cookies, user_name):
    """사용자 정보 확인"""
    response = requests.get(
        f"{BASE_URL}/api/admin/users?search={user_name}",
        cookies=cookies
    )

    if response.status_code == 200:
        data = response.json()
        users = data.get('users', [])
        if users:
            user = users[0]
            print(f"👤 {user_name} 정보:")
            print(f"   등급: {user.get('grade')}")
            print(f"   보험: {user.get('insuranceAmount', 0):,}원")
            return user
    return None

def check_payment_plans_db(user_name):
    """MongoDB에서 지급 계획 확인"""
    cmd = f"""
mongosh mongodb://localhost:27017/nanumpay --quiet --eval "
print('');
print('📋 {user_name} 지급 계획:');
print('');
db.weeklypaymentplans.find({{ userName: '{user_name}' }})
  .sort({{ baseGrade: 1, 추가지급단계: 1 }})
  .forEach(p => {{
    const type = p.installmentType === 'additional' ? '추가' : '기본';
    const stage = p.추가지급단계 || 0;
    print(p.baseGrade + ' 등급 (' + type + ', ' + stage + '차) - ' + p.revenueMonth + ' 매출월');
    print('  상태: ' + p.planStatus + ', 완료: ' + p.completedInstallments + '/10회');

    // 첫 3회차 상태 확인
    for (let i = 0; i < Math.min(3, p.installments.length); i++) {{
      const inst = p.installments[i];
      const statusIcon = inst.status === 'paid' ? '✅' :
                        inst.status === 'skipped' ? '⏭️' : '⏳';
      const reason = inst.skipReason ? ' (' + inst.skipReason + ')' : '';
      print('  ' + statusIcon + ' ' + (i+1) + '회차: ' + inst.status + reason);
    }}
    print('');
  }});
"
    """

    result = subprocess.run(cmd, shell=True, capture_output=True, text=True)
    if result.returncode == 0:
        print(result.stdout)
    else:
        print(f"❌ DB 조회 실패: {result.stderr}")

def verify_additional_payments(user_name, expected_count):
    """추가지급 계획 개수 확인"""
    cmd = f"""
mongosh mongodb://localhost:27017/nanumpay --quiet --eval "
const additionalPlans = db.weeklypaymentplans.find({{
  userName: '{user_name}',
  installmentType: 'additional'
}}).toArray();
print(additionalPlans.length);
"
    """

    result = subprocess.run(cmd, shell=True, capture_output=True, text=True)
    if result.returncode == 0:
        count = int(result.stdout.strip())
        if count == expected_count:
            print(f"✅ 추가지급 계획: {count}개 (예상: {expected_count}개)")
            return True
        else:
            print(f"❌ 추가지급 계획: {count}개 (예상: {expected_count}개)")
            return False
    return False

def test_scenario_1():
    """
    시나리오 1: 7월 등록 → 보험 설정 → 8,9,10월 등록 → 추가지급 발생 확인

    예상 결과:
    - 7월 F2 기본지급
    - 8월 F3 승급 → F3 기본지급 생성, 7월 F2 추가지급 생성 (보험 OK)
    - 9월 추가지급 생성 (8월분, 보험 OK)
    - 10월 추가지급 생성 (9월분, 보험 OK)
    """
    print_header("시나리오 1: 사전 보험 설정 → 추가지급 정상 발생")

    if not db_init():
        return False

    time.sleep(2)
    cookies = login_admin()
    if not cookies:
        return False

    # 1. 7월 등록
    print_step("1", "7월 3명 등록")
    upload_excel(cookies, "7월")

    # 2. 사장님 보험 설정 (F3+ 요구: 50,000원)
    print_step("2", "사장님 보험 설정 (50,000원)")
    set_insurance(cookies, "사장님", 50000)
    check_user_info(cookies, "사장님")

    # 3. 8월 등록 (F3 승급 발생)
    print_step("3", "8월 4명 등록 (F3 승급 예상)")
    upload_excel(cookies, "8월")
    time.sleep(1)
    check_payment_plans_db("사장님")

    # 4. 9월 등록 (8월분 추가지급 생성 예상)
    print_step("4", "9월 4명 등록 (8월분 추가지급 예상)")
    upload_excel(cookies, "9월")
    time.sleep(1)
    check_payment_plans_db("사장님")

    # 5. 10월 등록 (9월분 추가지급 생성 예상)
    print_step("5", "10월 4명 등록 (9월분 추가지급 예상)")
    upload_excel(cookies, "10월")
    time.sleep(1)
    check_payment_plans_db("사장님")

    # 6. 최종 검증
    print_step("6", "최종 검증")
    check_user_info(cookies, "사장님")

    # 추가지급 계획: 8월 F3(1차), 9월 F3(2차) = 2개
    # ⭐ 8월 F3 승급 시 F2 추가지급은 생성되지 않음 (새 등급 기본지급 생성)
    return verify_additional_payments("사장님", 2)

def test_scenario_2():
    """
    시나리오 2: 7월 등록 → 8월 등록 → 보험 설정 → 9,10월 등록

    예상 결과:
    - 7월 F2 기본지급
    - 8월 F3 승급 → F3 기본지급, 7월 F2 추가지급 SKIP (보험 없음)
    - 보험 설정 (50,000원)
    - 9월 8월분 추가지급 생성 (보험 OK, 8월부터 적용)
    - 10월 9월분 추가지급 생성 (보험 OK)
    """
    print_header("시나리오 2: 중간 보험 설정 → 설정 시점부터 적용")

    if not db_init():
        return False

    time.sleep(2)
    cookies = login_admin()
    if not cookies:
        return False

    # 1. 7월 등록
    print_step("1", "7월 3명 등록")
    upload_excel(cookies, "7월")

    # 2. 8월 등록 (보험 없이, F3 승급)
    print_step("2", "8월 4명 등록 (보험 미설정 상태)")
    upload_excel(cookies, "8월")
    time.sleep(1)
    check_payment_plans_db("사장님")

    # 3. 보험 설정
    print_step("3", "사장님 보험 설정 (50,000원)")
    set_insurance(cookies, "사장님", 50000)
    check_user_info(cookies, "사장님")

    # 4. 9월 등록 (8월분 추가지급 생성, 보험 OK)
    print_step("4", "9월 4명 등록 (8월분 추가지급 생성 예상)")
    upload_excel(cookies, "9월")
    time.sleep(1)
    check_payment_plans_db("사장님")

    # 5. 10월 등록 (9월분 추가지급 생성)
    print_step("5", "10월 4명 등록 (9월분 추가지급 생성 예상)")
    upload_excel(cookies, "10월")
    time.sleep(1)
    check_payment_plans_db("사장님")

    # 6. 최종 검증
    print_step("6", "최종 검증")
    check_user_info(cookies, "사장님")

    # 추가지급 계획: 8월 F3(1차), 9월 F3(2차) = 2개 (7월분은 생성 안됨)
    return verify_additional_payments("사장님", 2)

def test_scenario_3():
    """
    시나리오 3: 7월 등록 → 보험 설정 → 8월 등록 → 보험 해제 → 9월 등록 → 10월 등록

    예상 결과:
    - 7월 F2 기본지급
    - 보험 설정 (50,000원)
    - 8월 F3 승급 → F3 기본지급, 7월 F2 추가지급 생성 (보험 OK)
    - 보험 해제 (0원)
    - 9월 8월분 추가지급 SKIP (보험 없음)
    - 10월 9월분 추가지급 SKIP (보험 없음)
    """
    print_header("시나리오 3: 보험 설정 → 해제 → 추가지급 중단")

    if not db_init():
        return False

    time.sleep(2)
    cookies = login_admin()
    if not cookies:
        return False

    # 1. 7월 등록
    print_step("1", "7월 3명 등록")
    upload_excel(cookies, "7월")

    # 2. 보험 설정
    print_step("2", "사장님 보험 설정 (50,000원)")
    set_insurance(cookies, "사장님", 50000)
    check_user_info(cookies, "사장님")

    # 3. 8월 등록 (F3 승급, 7월분 추가지급 생성)
    print_step("3", "8월 4명 등록 (F3 승급, 7월분 추가지급 생성 예상)")
    upload_excel(cookies, "8월")
    time.sleep(1)
    check_payment_plans_db("사장님")

    # 4. 보험 해제
    print_step("4", "사장님 보험 해제 (0원)")
    set_insurance(cookies, "사장님", 0)
    check_user_info(cookies, "사장님")

    # 5. 9월 등록 (8월분 추가지급 생성 안됨)
    print_step("5", "9월 4명 등록 (8월분 추가지급 생성 안됨 예상)")
    upload_excel(cookies, "9월")
    time.sleep(1)
    check_payment_plans_db("사장님")

    # 6. 10월 등록 (9월분 추가지급 생성 안됨)
    print_step("6", "10월 4명 등록 (9월분 추가지급 생성 안됨 예상)")
    upload_excel(cookies, "10월")
    time.sleep(1)
    check_payment_plans_db("사장님")

    # 7. 최종 검증
    print_step("7", "최종 검증")
    check_user_info(cookies, "사장님")

    # 추가지급 계획: 0개 (8월 F3 승급 시 F2 추가지급 생성 안 됨 + 보험 해제로 F3 추가지급도 안 됨)
    return verify_additional_payments("사장님", 0)

def test_scenario_4():
    """
    시나리오 4: 보험 미설정 상태로 전체 진행

    예상 결과:
    - 7월 F2 기본지급
    - 8월 F3 승급 → F3 기본지급, 7월 F2 추가지급 SKIP (보험 없음)
    - 9월 8월분 추가지급 SKIP (보험 없음)
    - 10월 9월분 추가지급 SKIP (보험 없음)
    - 추가지급 계획 0개
    """
    print_header("시나리오 4: 보험 미설정 → 추가지급 미발생")

    if not db_init():
        return False

    time.sleep(2)
    cookies = login_admin()
    if not cookies:
        return False

    # 1. 7월 등록
    print_step("1", "7월 3명 등록")
    upload_excel(cookies, "7월")
    check_user_info(cookies, "사장님")

    # 2. 8월 등록 (F3 승급, 추가지급 생성 안됨)
    print_step("2", "8월 4명 등록 (보험 없음, 추가지급 생성 안됨)")
    upload_excel(cookies, "8월")
    time.sleep(1)
    check_payment_plans_db("사장님")

    # 3. 9월 등록 (추가지급 생성 안됨)
    print_step("3", "9월 4명 등록 (추가지급 생성 안됨)")
    upload_excel(cookies, "9월")
    time.sleep(1)
    check_payment_plans_db("사장님")

    # 4. 10월 등록 (추가지급 생성 안됨)
    print_step("4", "10월 4명 등록 (추가지급 생성 안됨)")
    upload_excel(cookies, "10월")
    time.sleep(1)
    check_payment_plans_db("사장님")

    # 5. 최종 검증
    print_step("5", "최종 검증")
    check_user_info(cookies, "사장님")

    # 추가지급 계획: 0개 (보험 없음)
    return verify_additional_payments("사장님", 0)

def main():
    """메인 실행"""
    print("\n")
    print("🧪 추가 보험 조건 종합 테스트 시작")
    print("=" * 80)

    results = {}

    # 시나리오 1
    try:
        results['scenario_1'] = test_scenario_1()
    except Exception as e:
        print(f"❌ 시나리오 1 실패: {e}")
        results['scenario_1'] = False

    # 시나리오 2
    try:
        results['scenario_2'] = test_scenario_2()
    except Exception as e:
        print(f"❌ 시나리오 2 실패: {e}")
        results['scenario_2'] = False

    # 시나리오 3
    try:
        results['scenario_3'] = test_scenario_3()
    except Exception as e:
        print(f"❌ 시나리오 3 실패: {e}")
        results['scenario_3'] = False

    # 시나리오 4
    try:
        results['scenario_4'] = test_scenario_4()
    except Exception as e:
        print(f"❌ 시나리오 4 실패: {e}")
        results['scenario_4'] = False

    # 최종 결과
    print_header("최종 결과")
    print()
    for scenario, passed in results.items():
        icon = "✅" if passed else "❌"
        print(f"{icon} {scenario}: {'통과' if passed else '실패'}")

    print()
    total = len(results)
    passed = sum(1 for p in results.values() if p)
    print(f"총 {total}개 시나리오 중 {passed}개 통과")

    if passed == total:
        print("\n🎉 모든 테스트 통과!")
        return True
    else:
        print(f"\n⚠️ {total - passed}개 테스트 실패")
        return False

if __name__ == "__main__":
    success = main()
    exit(0 if success else 1)
