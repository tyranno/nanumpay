#!/usr/bin/env python3
"""
v8.0 ID 기반 계정 시스템 테스트 스크립트

테스트 시나리오:
1단계: 기본 3명 등록 (사장님, 김영수, 이미영)
2단계: 다중 등록 8명 (박철수×4, 조동현×4)

데이터 특징:
- 박철수: 4개 다른 용역 계약 (다른 판매인, 설계사, 보험)
- 조동현: 4개 다른 용역 계약 (다른 판매인, 설계사, 보험)
"""

import requests
import json
import sys

BASE_URL = "http://localhost:3101"

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

def register_user(cookies, user_data, step_info=""):
    """개별 사용자 등록"""
    print(f"\n{'='*80}")
    print(f"📝 등록 시작{step_info}: {user_data['name']} (ID: {user_data.get('ID', 'N/A')})")
    print(f"{'='*80}")

    response = requests.post(
        f"{BASE_URL}/api/admin/users/register",
        json=user_data,
        cookies=cookies
    )

    if response.status_code == 200:
        result = response.json()
        print(f"✅ 등록 성공: {user_data['name']}")
        print(f"   등급: {result.get('user', {}).get('grade', 'N/A')}")

        # 알림 메시지 출력
        if 'alerts' in result:
            for alert in result['alerts']:
                print(f"   {alert.get('message', '')}")

        return True
    else:
        print(f"❌ 등록 실패: {response.status_code}")
        print(response.text)
        return False

# ========================================
# 1단계: 기본 3명 등록
# ========================================

def step1_register_basic_3():
    """1단계: 기본 3명 등록 (사장님, 김영수, 이미영)"""
    print("\n" + "="*80)
    print("🚀 1단계: 기본 3명 등록 시작")
    print("="*80)

    cookies = login()
    if not cookies:
        return False

    users = [
        # 1. 사장님 (루트)
        {
            "registrationDate": "2025-07-01",
            "ID": "사장님",  # ⭐ v8.0: ID 필드
            "name": "사장님",
            "phone": "010-1234-5678",
            "idNumber": "750315-1234567",
            "bank": "국민은행",
            "accountNumber": "123456789012",
            "판매인": "-",
            "판매인 연락처": "010-0000-0000",
            "설계사": "박기획",
            "설계사 연락처": "010-1111-0001",
            "보험상품명":"종신보험",
            "보험회사":"삼성생명",
            "지사":"서울중앙지사"
        },
        # 2. 김영수 (사장님 왼쪽)
        {
            "registrationDate": "2025-07-01",
            "ID": "김영수",
            "name": "김영수",
            "phone": "010-1234-5678",
            "idNumber": "750315-1234567",
            "bank": "국민은행",
            "accountNumber": "123456789012",
            "판매인":"사장님",
            "판매인 연락처":"010-0000-0000",
            "설계사":"박기획",
            "설계사 연락처":"010-1111-0001",
            "보험상품명":"종신보험",
            "보험회사":"삼성생명",
            "지사":"서울중앙지사"
        },
        # 3. 이미영 (사장님 오른쪽)
        {
            "registrationDate": "2025-07-02",
            "ID": "이미영",
            "name": "이미영",
            "phone": "010-2345-6789",
            "idNumber": "800422-2345678",
            "bank": "신한은행",
            "accountNumber": "234567890123",
            "판매인":"사장님",
            "판매인 연락처":"010-0000-0000",
            "설계사":"김설계",
            "설계사 연락처":"010-1111-0002",
            "보험상품명":"연금보험",
            "보험회사":"한화생명",
            "지사":"강남지사"
        }
    ]

    for i, user in enumerate(users, 1):
        if not register_user(cookies, user, f" [1단계 {i}/3]"):
            return False
        print("="*80)

    print("\n✅ 1단계 완료: 기본 3명 등록 성공!")
    print("="*80)
    return True

# ========================================
# 2단계: 다중 등록 8명 (박철수×4, 조동현×4)
# ========================================

def step2_register_multiple_8():
    """2단계: 다중 등록 8명 (박철수×4, 조동현×4)"""
    print("\n" + "="*80)
    print("🚀 2단계: 다중 등록 8명 시작 (박철수×4, 조동현×4)")
    print("="*80)

    cookies = login()
    if not cookies:
        return False

    users = [
        # 박철수 1차 (김영수 왼쪽)
        {
            "registrationDate": "2025-07-03",
            "ID": "박철수",
            "name": "박철수",
            "phone": "010-3456-7890",
            "idNumber": "700815-1456789",
            "bank": "하나은행",
            "accountNumber": "345678901234",
            "판매인":"김영수",
            "판매인 연락처":"010-1234-5678",
            "설계사":"이기획",
            "설계사 연락처":"010-1111-0003",
            "보험상품명":"변액보험",
            "보험회사":"교보생명",
            "지사":"부산지사"
        },
        # 박철수 2차 (김영수 오른쪽) - 다른 설계사, 다른 보험
        {
            "registrationDate": "2025-07-04",
            "ID": "박철수",  # ⭐ 동일 ID
            "name": "박철수",
            "phone": "010-4567-8901",  # 다른 전화번호 (무시됨)
            "idNumber": "850920-2567890",  # 다른 주민번호 (무시됨)
            "bank": "우리은행",  # 다른 은행 (무시됨)
            "accountNumber": "456789012345",  # 다른 계좌 (무시됨)
            "판매인":"김영수",
            "판매인 연락처":"010-1234-5678",
            "설계사":"정설계",  # ⭐ 다른 설계사
            "설계사 연락처":"010-1111-0004",
            "보험상품명":"건강보험",  # ⭐ 다른 보험
            "보험회사":"KB생명",
            "지사":"대구지사"
        },
        # 박철수 3차 (이미영 왼쪽) - 또 다른 설계사, 보험
        {
            "registrationDate": "2025-07-05",
            "ID": "박철수",  # ⭐ 동일 ID
            "name": "박철수",
            "phone": "010-5678-9012",  # 무시됨
            "idNumber": "770525-1678901",  # 무시됨
            "bank": "농협은행",  # 무시됨
            "accountNumber": "567890123456",  # 무시됨
            "판매인":"이미영",  # ⭐ 다른 판매인
            "판매인 연락처":"010-2345-6789",
            "설계사":"최기획",  # ⭐ 다른 설계사
            "설계사 연락처":"010-1111-0005",
            "보험상품명":"암보험",  # ⭐ 다른 보험
            "보험회사":"동양생명",
            "지사":"광주지사"
        },
        # 박철수 4차 (이미영 오른쪽)
        {
            "registrationDate": "2025-07-08",
            "ID": "박철수",  # ⭐ 동일 ID
            "name": "박철수",
            "phone": "010-6789-0123",  # 무시됨
            "idNumber": "900612-2789012",  # 무시됨
            "bank": "국민은행",  # 무시됨
            "accountNumber": "678901234567",  # 무시됨
            "판매인":"이미영",
            "판매인 연락처":"010-2345-6789",
            "설계사":"박기획",  # 기존 설계사 재활용
            "설계사 연락처":"010-1111-0001",
            "보험상품명":"종신보험",
            "보험회사":"삼성생명",
            "지사":"서울중앙지사"
        },

        # 조동현 1차 (박철수 왼쪽)
        {
            "registrationDate": "2025-07-09",
            "ID": "조동현",
            "name": "조동현",
            "phone": "010-7890-1234",
            "idNumber": "881225-1890123",
            "bank": "신한은행",
            "accountNumber": "789012345678",
            "판매인":"박철수",  # ⭐ 박철수 (UserAccount.loginId)
            "판매인 연락처":"010-3456-7890",
            "설계사":"박기획",
            "설계사 연락처":"010-1111-0001",
            "보험상품명":"종신보험",
            "보험회사":"삼성생명",
            "지사":"서울중앙지사"
        },
        # 조동현 2차
        {
            "registrationDate": "2025-07-10",
            "ID": "조동현",  # ⭐ 동일 ID
            "name": "조동현",
            "phone": "010-8901-2345",  # 무시됨
            "idNumber": "920718-2901234",  # 무시됨
            "bank": "하나은행",  # 무시됨
            "accountNumber": "890123456789",  # 무시됨
            "판매인":"박철수",
            "판매인 연락처":"010-3456-7890",
            "설계사":"김설계",
            "설계사 연락처":"010-1111-0002",
            "보험상품명":"연금보험",
            "보험회사":"한화생명",
            "지사":"강남지사"
        },
        # 조동현 3차
        {
            "registrationDate": "2025-07-11",
            "ID": "조동현",  # ⭐ 동일 ID
            "name": "조동현",
            "phone": "010-9012-3456",  # 무시됨
            "idNumber": "860830-1012345",  # 무시됨
            "bank": "우리은행",  # 무시됨
            "accountNumber": "901234567890",  # 무시됨
            "판매인":"박철수2",  # ⭐ User.name (박철수 2차)
            "판매인 연락처":"010-4567-8901",
            "설계사":"김설계",
            "설계사 연락처":"010-1111-0002",
            "보험상품명":"연금보험",
            "보험회사":"한화생명",
            "지사":"강남지사"
        },
        # 조동현 4차
        {
            "registrationDate": "2025-07-12",
            "ID": "조동현",  # ⭐ 동일 ID
            "name": "조동현",
            "phone": "010-0123-4567",  # 무시됨
            "idNumber": "910405-2123456",  # 무시됨
            "bank": "농협은행",  # 무시됨
            "accountNumber": "012345678901",  # 무시됨
            "판매인":"박철수2",  # User.name
            "판매인 연락처":"010-4567-8901",
            "설계사":"이기획",
            "설계사 연락처":"010-1111-0003",
            "보험상품명":"변액보험",
            "보험회사":"교보생명",
            "지사":"부산지사"
        }
    ]

    for i, user in enumerate(users, 1):
        user_desc = user['name']
        if user['ID'] in ['박철수', '조동현']:
            # 같은 ID 개수 세기
            count = sum(1 for u in users[:i] if u['ID'] == user['ID'])
            user_desc = f"{user['name']} {count}차"

        if not register_user(cookies, user, f" [2단계 {i}/8: {user_desc}]"):
            return False
        print("="*80)

    print("\n✅ 2단계 완료: 다중 등록 8명 성공!")
    print("="*80)
    return True

# ========================================
# 전체 테스트
# ========================================

def test_all():
    """전체 테스트 실행"""
    print("\n" + "="*80)
    print("🚀 v8.0 ID 기반 계정 시스템 테스트 시작")
    print("="*80)

    # 1단계: 기본 3명
    if not step1_register_basic_3():
        print("\n❌ 1단계 실패!")
        return False

    print("\n⏸️  1단계 완료. 2단계를 계속하려면 Enter를 누르세요...")
    input()

    # 2단계: 다중 등록 8명
    if not step2_register_multiple_8():
        print("\n❌ 2단계 실패!")
        return False

    print("\n" + "="*80)
    print("✅ 전체 테스트 완료!")
    print("="*80)
    print("\n📊 예상 결과:")
    print("  - UserAccount: 5개 (사장님, 김영수, 이미영, 박철수, 조동현)")
    print("  - User: 11개 (사장님, 김영수, 이미영, 박철수×4, 조동현×4)")
    print("  - PlannerAccount: 5개 (박기획, 김설계, 이기획, 정설계, 최기획)")
    print("\n📝 다음 단계:")
    print("  1. MongoDB 확인: mongosh mongodb://localhost:27017/nanumpay")
    print("     > db.useraccounts.count()  // 5")
    print("     > db.users.count()  // 11")
    print("     > db.planneraccounts.count()  // 5")
    print("  2. 로그인 테스트:")
    print("     - 박철수 (1234) → 4개 용역 확인")
    print("     - 조동현 (1234) → 4개 용역 확인")
    print("     - 박기획 (0001) → 담당 용역자 확인")

    return True

# ========================================
# 메인
# ========================================

def main():
    """메인 실행 함수"""
    if len(sys.argv) < 2:
        # 기본: 전체 테스트
        test_all()
        return

    command = sys.argv[1]

    if command == "all":
        test_all()
    elif command == "step1" or command == "1":
        step1_register_basic_3()
    elif command == "step2" or command == "2":
        step2_register_multiple_8()
    else:
        print(f"❌ 알 수 없는 명령어: {command}")
        print("\n사용법:")
        print("  python3 test_v8_id_registration.py           # 전체 테스트 (기본)")
        print("  python3 test_v8_id_registration.py all       # 전체 테스트")
        print("  python3 test_v8_id_registration.py step1     # 1단계만 (기본 3명)")
        print("  python3 test_v8_id_registration.py step2     # 2단계만 (다중 8명)")

if __name__ == "__main__":
    main()
