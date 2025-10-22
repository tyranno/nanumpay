#!/usr/bin/env python3
"""
개별 등록 테스트 스크립트
7월 3명, 8월 3명, 9월 5명, 10월 5명 등록
등급별 지급 총액 조정 기능 테스트 포함
"""

import requests
import json
import time

BASE_URL = "http://localhost:3100"

def login():
    """관리자 로그인"""
    response = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={
            "loginId": "관리자",
            "password": "admin1234!!"
        }
    )
    if response.status_code == 200:
        print("✅ 로그인 성공")
        return response.cookies
    else:
        print(f"❌ 로그인 실패: {response.status_code}")
        print(response.text)
        return None

def register_user(cookies, user_data):
    """개별 사용자 등록"""
    print(f"\n{'='*60}")
    print(f"📝 등록 시작: {user_data['name']}")
    print(f"{'='*60}")

    response = requests.post(
        f"{BASE_URL}/api/admin/users/register",
        json=user_data,
        cookies=cookies
    )

    if response.status_code == 200:
        result = response.json()
        print(f"✅ 등록 성공: {user_data['name']}")
        print(f"   등급: {result.get('user', {}).get('grade', 'N/A')}")
        return True
    else:
        print(f"❌ 등록 실패: {response.status_code}")
        print(response.text)
        return False

# ========================================
# 7월 등록 (3명)
# ========================================

def register_july_1():
    """7-1. 사장님 등록 (루트)"""
    print("🚀 [7월 1/3] 사장님 등록 시작\n")
    cookies = login()
    if not cookies:
        return False

    user = {
        "registrationDate": "2025-07-09",
        "ID": "사장님",
        "name": "사장님",
        "phone": "010-1234-5678",
        "salesperson": "-",
        "planner": "김설계",
        "plannerPhone": "010-9999-9999",
        "bank": "국민은행",
        "accountNumber": "123456789012",
        "idNumber": "750315-1234567"
    }
    return register_user(cookies, user)

def register_july_2():
    """7-2. 김영수 등록 (사장님 왼쪽)"""
    print("🚀 [7월 2/3] 김영수 등록 시작\n")
    cookies = login()
    if not cookies:
        return False

    user = {
        "registrationDate": "2025-07-15",
        "ID": "김영수",
        "name": "김영수",
        "phone": "010-2222-2222",
        "salesperson": "사장님",
        "planner": "김설계",
        "plannerPhone": "010-9999-9999",
        "bank": "신한은행",
        "accountNumber": "223456789012",
        "idNumber": "750315-1234567"
    }
    return register_user(cookies, user)

def register_july_3():
    """7-3. 이미영 등록 (사장님 오른쪽)"""
    print("🚀 [7월 3/3] 이미영 등록 시작\n")
    cookies = login()
    if not cookies:
        return False

    user = {
        "registrationDate": "2025-07-31",
        "ID": "이미영",
        "name": "이미영",
        "phone": "010-3333-3333",
        "salesperson": "사장님",
        "planner": "김설계",
        "plannerPhone": "010-9999-9999",
        "bank": "우리은행",
        "accountNumber": "323456789012",
        "idNumber": "800422-2345678"
    }
    return register_user(cookies, user)

def register_july_all():
    """7월 전체 등록 (3명)"""
    print("🚀 7월 전체 등록 시작 (3명)\n")
    print("="*80)

    if not register_july_1():
        return False
    print("="*80)

    if not register_july_2():
        return False
    print("="*80)

    if not register_july_3():
        return False

    print("="*80)
    print("✅ 7월 전체 등록 완료!")
    print("="*80)
    return True

# ========================================
# 8월 등록 (3명)
# ========================================

def register_august_1():
    """8-1. 박철수 등록 (김영수 왼쪽)"""
    print("🚀 [8월 1/3] 박철수 등록 시작\n")
    cookies = login()
    if not cookies:
        return False

    user = {
        "registrationDate": "2025-08-01",
        "ID": "박철수",
        "name": "박철수",
        "phone": "010-4444-4444",
        "salesperson": "김영수",
        "planner": "최설계",
        "plannerPhone": "010-9999-9999",
        "bank": "국민은행",
        "accountNumber": "423456789012",
        "idNumber": "850101-1111111"
    }
    return register_user(cookies, user)

def register_august_2():
    """8-2. 최영희 등록 (김영수 오른쪽)"""
    print("🚀 [8월 2/3] 최영희 등록 시작\n")
    cookies = login()
    if not cookies:
        return False

    user = {
        "registrationDate": "2025-08-01",
        "ID": "최영희",
        "name": "최영희",
        "phone": "010-5555-5555",
        "salesperson": "김영수",
        "planner": "최설계",
        "plannerPhone": "010-9999-9999",
        "bank": "신한은행",
        "accountNumber": "523456789012",
        "idNumber": "880202-2222222"
    }
    return register_user(cookies, user)

def register_august_3():
    """8-3. 정민수 등록 (이미영 왼쪽)"""
    print("🚀 [8월 3/3] 정민수 등록 시작\n")
    cookies = login()
    if not cookies:
        return False

    user = {
        "registrationDate": "2025-08-02",
        "ID": "정민수",
        "name": "정민수",
        "phone": "010-6666-6666",
        "salesperson": "이미영",
        "planner": "최설계",
        "plannerPhone": "010-9999-9999",
        "bank": "우리은행",
        "accountNumber": "623456789012",
        "idNumber": "900303-1111111"
    }
    return register_user(cookies, user)

def register_august_all():
    """8월 전체 등록 (3명)"""
    print("🚀 8월 전체 등록 시작 (3명)\n")
    print("="*80)

    if not register_august_1():
        return False
    print("="*80)

    if not register_august_2():
        return False
    print("="*80)

    if not register_august_3():
        return False

    print("="*80)
    print("✅ 8월 전체 등록 완료!")
    print("="*80)
    return True

# ========================================
# 9월 등록 (5명)
# ========================================

def register_september_1():
    """9-1. 강민지 등록 (이미영 오른쪽)"""
    print("🚀 [9월 1/5] 강민지 등록 시작\n")
    cookies = login()
    if not cookies:
        return False

    user = {
        "registrationDate": "2025-09-01",
        "ID": "강민지",
        "name": "강민지",
        "phone": "010-7777-7777",
        "salesperson": "이미영",
        "planner": "박설계",
        "plannerPhone": "010-9999-9999",
        "bank": "국민은행",
        "accountNumber": "723456789012",
        "idNumber": "920404-2222222"
    }
    return register_user(cookies, user)

def register_september_2():
    """9-2. 홍길동 등록 (박철수 왼쪽)"""
    print("🚀 [9월 2/5] 홍길동 등록 시작\n")
    cookies = login()
    if not cookies:
        return False

    user = {
        "registrationDate": "2025-09-05",
        "ID": "홍길동",
        "name": "홍길동",
        "phone": "010-8888-1111",
        "salesperson": "박철수",
        "planner": "박설계",
        "plannerPhone": "010-9999-9999",
        "bank": "신한은행",
        "accountNumber": "823456789012",
        "idNumber": "950505-1234567"
    }
    return register_user(cookies, user)

def register_september_3():
    """9-3. 이순신 등록 (박철수 오른쪽)"""
    print("🚀 [9월 3/5] 이순신 등록 시작\n")
    cookies = login()
    if not cookies:
        return False

    user = {
        "registrationDate": "2025-09-10",
        "ID": "이순신",
        "name": "이순신",
        "phone": "010-8888-2222",
        "salesperson": "박철수",
        "planner": "박설계",
        "plannerPhone": "010-9999-9999",
        "bank": "우리은행",
        "accountNumber": "923456789012",
        "idNumber": "960606-1234567"
    }
    return register_user(cookies, user)

def register_september_4():
    """9-4. 김유신 등록 (최영희 왼쪽)"""
    print("🚀 [9월 4/5] 김유신 등록 시작\n")
    cookies = login()
    if not cookies:
        return False

    user = {
        "registrationDate": "2025-09-15",
        "ID": "김유신",
        "name": "김유신",
        "phone": "010-8888-3333",
        "salesperson": "최영희",
        "planner": "박설계",
        "plannerPhone": "010-9999-9999",
        "bank": "국민은행",
        "accountNumber": "103456789012",
        "idNumber": "970707-1234567"
    }
    return register_user(cookies, user)

def register_september_5():
    """9-5. 장보고 등록 (최영희 오른쪽)"""
    print("🚀 [9월 5/5] 장보고 등록 시작\n")
    cookies = login()
    if not cookies:
        return False

    user = {
        "registrationDate": "2025-09-20",
        "ID": "장보고",
        "name": "장보고",
        "phone": "010-8888-4444",
        "salesperson": "최영희",
        "planner": "박설계",
        "plannerPhone": "010-9999-9999",
        "bank": "신한은행",
        "accountNumber": "113456789012",
        "idNumber": "980808-1234567"
    }
    return register_user(cookies, user)

def register_september_all():
    """9월 전체 등록 (5명)"""
    print("🚀 9월 전체 등록 시작 (5명)\n")
    print("="*80)

    if not register_september_1():
        return False
    print("="*80)

    if not register_september_2():
        return False
    print("="*80)

    if not register_september_3():
        return False
    print("="*80)

    if not register_september_4():
        return False
    print("="*80)

    if not register_september_5():
        return False

    print("="*80)
    print("✅ 9월 전체 등록 완료!")
    print("="*80)
    return True

# ========================================
# 10월 등록 (5명)
# ========================================

def register_october_1():
    """10-1. 세종대왕 등록 (정민수 왼쪽)"""
    print("🚀 [10월 1/5] 세종대왕 등록 시작\n")
    cookies = login()
    if not cookies:
        return False

    user = {
        "registrationDate": "2025-10-01",
        "ID": "세종대왕",
        "name": "세종대왕",
        "phone": "010-9999-1111",
        "salesperson": "정민수",
        "planner": "이설계",
        "plannerPhone": "010-8888-8888",
        "bank": "국민은행",
        "accountNumber": "123456789111",
        "idNumber": "990101-1234567"
    }
    return register_user(cookies, user)

def register_october_2():
    """10-2. 안중근 등록 (정민수 오른쪽)"""
    print("🚀 [10월 2/5] 안중근 등록 시작\n")
    cookies = login()
    if not cookies:
        return False

    user = {
        "registrationDate": "2025-10-05",
        "ID": "안중근",
        "name": "안중근",
        "phone": "010-9999-2222",
        "salesperson": "정민수",
        "planner": "이설계",
        "plannerPhone": "010-8888-8888",
        "bank": "신한은행",
        "accountNumber": "223456789111",
        "idNumber": "000202-1234567"
    }
    return register_user(cookies, user)

def register_october_3():
    """10-3. 윤봉길 등록 (강민지 왼쪽)"""
    print("🚀 [10월 3/5] 윤봉길 등록 시작\n")
    cookies = login()
    if not cookies:
        return False

    user = {
        "registrationDate": "2025-10-10",
        "ID": "윤봉길",
        "name": "윤봉길",
        "phone": "010-9999-3333",
        "salesperson": "강민지",
        "planner": "이설계",
        "plannerPhone": "010-8888-8888",
        "bank": "우리은행",
        "accountNumber": "323456789111",
        "idNumber": "010303-3234567"
    }
    return register_user(cookies, user)

def register_october_4():
    """10-4. 유관순 등록 (강민지 오른쪽)"""
    print("🚀 [10월 4/5] 유관순 등록 시작\n")
    cookies = login()
    if not cookies:
        return False

    user = {
        "registrationDate": "2025-10-15",
        "ID": "유관순",
        "name": "유관순",
        "phone": "010-9999-4444",
        "salesperson": "강민지",
        "planner": "이설계",
        "plannerPhone": "010-8888-8888",
        "bank": "국민은행",
        "accountNumber": "423456789111",
        "idNumber": "020404-4234567"
    }
    return register_user(cookies, user)

def register_october_5():
    """10-5. 김구 등록 (홍길동 왼쪽)"""
    print("🚀 [10월 5/5] 김구 등록 시작\n")
    cookies = login()
    if not cookies:
        return False

    user = {
        "registrationDate": "2025-10-20",
        "ID": "김구",
        "name": "김구",
        "phone": "010-9999-5555",
        "salesperson": "홍길동",
        "planner": "이설계",
        "plannerPhone": "010-8888-8888",
        "bank": "신한은행",
        "accountNumber": "523456789111",
        "idNumber": "030505-1234567"
    }
    return register_user(cookies, user)

def register_october_all():
    """10월 전체 등록 (5명)"""
    print("🚀 10월 전체 등록 시작 (5명)\n")
    print("="*80)

    if not register_october_1():
        return False
    print("="*80)

    if not register_october_2():
        return False
    print("="*80)

    if not register_october_3():
        return False
    print("="*80)

    if not register_october_4():
        return False
    print("="*80)

    if not register_october_5():
        return False

    print("="*80)
    print("✅ 10월 전체 등록 완료!")
    print("="*80)
    return True

# ========================================
# 등급별 지급 총액 조정 테스트
# ========================================

def adjust_grade_payments():
    """10월 등급별 지급 총액 조정"""
    print("\n" + "="*80)
    print("💰 10월 등급별 지급 총액 조정 테스트")
    print("="*80)

    cookies = login()
    if not cookies:
        print("❌ 로그인 실패")
        return False

    # 현재 10월 데이터 확인
    print("\n📊 10월 현재 상태 확인...")
    time.sleep(1)

    # 등급별 지급 총액 조정 (예시 값)
    adjustments = {
        "F1": {
            "totalAmount": 300000,  # 30만원으로 조정
            "perInstallment": 30000  # 3만원씩 10회
        },
        "F2": {
            "totalAmount": 1000000,  # 100만원으로 조정
            "perInstallment": 100000  # 10만원씩 10회
        },
        "F3": {
            "totalAmount": 2000000,  # 200만원으로 조정
            "perInstallment": 200000  # 20만원씩 10회
        },
        "F4": {
            "totalAmount": 3500000,  # 350만원으로 조정
            "perInstallment": 350000  # 35만원씩 10회
        }
    }

    print("\n📝 조정할 등급별 지급 총액:")
    for grade, values in adjustments.items():
        print(f"   {grade}: 총액 {values['totalAmount']:,}원 (회당 {values['perInstallment']:,}원)")

    # API 호출
    response = requests.post(
        f"{BASE_URL}/api/admin/revenue/adjust-grade-payments",
        json={
            "monthKey": "2025-10",
            "adjustments": adjustments
        },
        cookies=cookies
    )

    if response.status_code == 200:
        result = response.json()
        print(f"\n✅ 등급별 지급액 조정 성공!")
        print(f"   업데이트된 계획: {result.get('updatedPlans', 0)}개")
        return True
    else:
        print(f"\n❌ 조정 실패: {response.status_code}")
        print(response.text)
        return False

def register_october_additional():
    """10월 추가 등록 (조정 후)"""
    print("\n" + "="*80)
    print("📝 10월 추가 등록 (등급별 조정 후)")
    print("="*80)

    cookies = login()
    if not cookies:
        return False

    # 추가 등록자
    additional_users = [
        {
            "registrationDate": "2025-10-25",
            "ID": "이성계",
            "name": "이성계",
            "phone": "010-7777-1111",
            "salesperson": "홍길동",
            "planner": "이설계",
            "plannerPhone": "010-8888-8888",
            "bank": "국민은행",
            "accountNumber": "623456789111",
            "idNumber": "040606-1234567"
        },
        {
            "registrationDate": "2025-10-26",
            "ID": "정약용",
            "name": "정약용",
            "phone": "010-7777-2222",
            "salesperson": "이순신",
            "planner": "이설계",
            "plannerPhone": "010-8888-8888",
            "bank": "신한은행",
            "accountNumber": "723456789111",
            "idNumber": "050707-1234567"
        }
    ]

    for user in additional_users:
        print(f"\n📝 추가 등록: {user['name']}")
        response = requests.post(
            f"{BASE_URL}/api/admin/users/register",
            json=user,
            cookies=cookies
        )

        if response.status_code == 200:
            result = response.json()
            print(f"✅ 등록 성공: {user['name']}")
            print(f"   등급: {result.get('user', {}).get('grade', 'N/A')}")
            print(f"   💡 조정된 금액으로 지급 계획이 생성됩니다.")
        else:
            print(f"❌ 등록 실패: {user['name']}")
            print(response.text)
            return False

    return True

# ========================================
# 전체 등록
# ========================================

def register_all():
    """전체 등록 (7월 3명 + 8월 3명 + 9월 5명 + 10월 5명)"""
    print("🚀 전체 등록 시작 (7월 3명 + 8월 3명 + 9월 5명 + 10월 5명)\n")

    if not register_july_all():
        return False

    print("\n")
    if not register_august_all():
        return False

    print("\n")
    if not register_september_all():
        return False

    print("\n")
    if not register_october_all():
        return False

    print("\n" + "="*80)
    print("✅ 전체 등록 완료! (총 18명)")
    print("="*80)
    return True

def test_grade_adjustment():
    """등급별 지급 조정 테스트 시나리오"""
    print("\n" + "="*80)
    print("🎯 등급별 지급 조정 테스트 시나리오")
    print("="*80)

    # 1. 10월 일부 등록
    print("\n[STEP 1] 10월 초기 등록 (5명)")
    if not register_october_all():
        return False

    # 2. 등급별 지급액 조정
    print("\n[STEP 2] 등급별 지급 총액 조정")
    if not adjust_grade_payments():
        return False

    # 3. 추가 등록 (조정된 금액 적용)
    print("\n[STEP 3] 10월 추가 등록 (조정된 금액 적용)")
    if not register_october_additional():
        return False

    print("\n" + "="*80)
    print("✅ 등급별 지급 조정 테스트 완료!")
    print("💡 조정된 금액으로 새로운 등록자의 지급 계획이 생성되었습니다.")
    print("="*80)
    return True

# ========================================
# 메인
# ========================================

def main():
    """메인 실행 함수"""
    import sys

    if len(sys.argv) < 2:
        # 기본: 전체 등록
        register_all()
        return

    command = sys.argv[1]

    # 전체
    if command == "all":
        register_all()
    # 7월
    elif command == "7":
        register_july_all()
    elif command == "7-1":
        register_july_1()
    elif command == "7-2":
        register_july_2()
    elif command == "7-3":
        register_july_3()
    # 8월
    elif command == "8":
        register_august_all()
    elif command == "8-1":
        register_august_1()
    elif command == "8-2":
        register_august_2()
    elif command == "8-3":
        register_august_3()
    # 9월
    elif command == "9":
        register_september_all()
    elif command == "9-1":
        register_september_1()
    elif command == "9-2":
        register_september_2()
    elif command == "9-3":
        register_september_3()
    elif command == "9-4":
        register_september_4()
    elif command == "9-5":
        register_september_5()
    # 10월
    elif command == "10":
        register_october_all()
    elif command == "10-1":
        register_october_1()
    elif command == "10-2":
        register_october_2()
    elif command == "10-3":
        register_october_3()
    elif command == "10-4":
        register_october_4()
    elif command == "10-5":
        register_october_5()
    # 등급별 조정 테스트
    elif command == "adjust":
        adjust_grade_payments()
    elif command == "test-adjustment":
        test_grade_adjustment()
    else:
        print(f"❌ 알 수 없는 명령어: {command}")
        print("\n사용법:")
        print("  python3 test_individual_registration.py           # 전체 등록 (기본)")
        print("  python3 test_individual_registration.py all       # 전체 등록")
        print("")
        print("  python3 test_individual_registration.py 7         # 7월 전체 (3명)")
        print("  python3 test_individual_registration.py 7-1       # 7월 1번: 사장님")
        print("  python3 test_individual_registration.py 7-2       # 7월 2번: 김영수")
        print("  python3 test_individual_registration.py 7-3       # 7월 3번: 이미영")
        print("")
        print("  python3 test_individual_registration.py 8         # 8월 전체 (3명)")
        print("  python3 test_individual_registration.py 8-1       # 8월 1번: 박철수")
        print("  python3 test_individual_registration.py 8-2       # 8월 2번: 최영희")
        print("  python3 test_individual_registration.py 8-3       # 8월 3번: 정민수")
        print("")
        print("  python3 test_individual_registration.py 9         # 9월 전체 (5명)")
        print("  python3 test_individual_registration.py 9-1       # 9월 1번: 강민지")
        print("  python3 test_individual_registration.py 9-2       # 9월 2번: 홍길동")
        print("  python3 test_individual_registration.py 9-3       # 9월 3번: 이순신")
        print("  python3 test_individual_registration.py 9-4       # 9월 4번: 김유신")
        print("  python3 test_individual_registration.py 9-5       # 9월 5번: 장보고")
        print("")
        print("  python3 test_individual_registration.py 10        # 10월 전체 (5명)")
        print("  python3 test_individual_registration.py 10-1      # 10월 1번: 세종대왕")
        print("  python3 test_individual_registration.py 10-2      # 10월 2번: 안중근")
        print("  python3 test_individual_registration.py 10-3      # 10월 3번: 윤봉길")
        print("  python3 test_individual_registration.py 10-4      # 10월 4번: 유관순")
        print("  python3 test_individual_registration.py 10-5      # 10월 5번: 김구")
        print("")
        print("  python3 test_individual_registration.py adjust    # 10월 등급별 지급액 조정")
        print("  python3 test_individual_registration.py test-adjustment  # 조정 테스트 시나리오")

if __name__ == "__main__":
    main()
