#!/usr/bin/env python3
"""
개별 등록 테스트 스크립트
7월 3명, 8월 3명, 9월 1명 등록
"""

import requests
import json

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
        "registrationDate": "2025-07-01",
        "name": "사장님",
        "phone": "010-1234-5678",
        "salesperson": "-",
        "bank": "국민은행",
        "accountNumber": "123456789012"
    }
    return register_user(cookies, user)

def register_july_2():
    """7-2. 김영수 등록 (사장님 왼쪽)"""
    print("🚀 [7월 2/3] 김영수 등록 시작\n")
    cookies = login()
    if not cookies:
        return False

    user = {
        "registrationDate": "2025-07-01",
        "name": "김영수",
        "phone": "010-2222-2222",
        "salesperson": "사장님",
        "bank": "신한은행",
        "accountNumber": "223456789012"
    }
    return register_user(cookies, user)

def register_july_3():
    """7-3. 이미영 등록 (사장님 오른쪽)"""
    print("🚀 [7월 3/3] 이미영 등록 시작\n")
    cookies = login()
    if not cookies:
        return False

    user = {
        "registrationDate": "2025-07-02",
        "name": "이미영",
        "phone": "010-3333-3333",
        "salesperson": "사장님",
        "bank": "우리은행",
        "accountNumber": "323456789012"
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
        "name": "박철수",
        "phone": "010-4444-4444",
        "salesperson": "김영수",
        "bank": "국민은행",
        "accountNumber": "423456789012"
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
        "name": "최영희",
        "phone": "010-5555-5555",
        "salesperson": "김영수",
        "bank": "신한은행",
        "accountNumber": "523456789012"
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
        "name": "정민수",
        "phone": "010-6666-6666",
        "salesperson": "이미영",
        "bank": "우리은행",
        "accountNumber": "623456789012"
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
# 9월 등록 (1명)
# ========================================

def register_september_1():
    """9-1. 강민지 등록 (이미영 오른쪽)"""
    print("🚀 [9월 1/1] 강민지 등록 시작\n")
    cookies = login()
    if not cookies:
        return False

    user = {
        "registrationDate": "2025-09-01",
        "name": "강민지",
        "phone": "010-7777-7777",
        "salesperson": "이미영",
        "bank": "국민은행",
        "accountNumber": "723456789012"
    }
    return register_user(cookies, user)

def register_september_all():
    """9월 전체 등록 (1명)"""
    print("🚀 9월 전체 등록 시작 (1명)\n")
    print("="*80)

    if not register_september_1():
        return False

    print("="*80)
    print("✅ 9월 전체 등록 완료!")
    print("="*80)
    return True

# ========================================
# 전체 등록
# ========================================

def register_all():
    """전체 등록 (7월 3명 + 8월 3명 + 9월 1명)"""
    print("🚀 전체 등록 시작 (7월 3명 + 8월 3명 + 9월 1명)\n")

    if not register_july_all():
        return False

    print("\n")
    if not register_august_all():
        return False

    print("\n")
    if not register_september_all():
        return False

    print("\n" + "="*80)
    print("✅ 전체 등록 완료! (총 7명)")
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
        print("  python3 test_individual_registration.py 9         # 9월 전체 (1명)")
        print("  python3 test_individual_registration.py 9-1       # 9월 1번: 강민지")

if __name__ == "__main__":
    main()
