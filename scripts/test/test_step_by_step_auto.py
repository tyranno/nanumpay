#!/usr/bin/env python3
"""
한 명씩 등록하고 DB 확인하는 자동 테스트
"""

import requests
import subprocess
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
        print("✅ 로그인 성공\n")
        return response.cookies
    else:
        print(f"❌ 로그인 실패: {response.status_code}")
        print(response.text)
        return None

def register_user(cookies, user_data, step_name):
    """사용자 등록"""
    print(f"\n{'='*80}")
    print(f"▶️ {step_name}")
    print(f"📝 등록: {user_data['name']} ({user_data['registrationDate']})")
    print('='*80)

    response = requests.post(
        f"{BASE_URL}/api/admin/users/register",
        json=user_data,
        cookies=cookies
    )

    if response.status_code == 200:
        print(f"✅ 등록 성공")
        time.sleep(1)  # DB 반영 대기
        return True
    else:
        print(f"❌ 등록 실패: {response.status_code}")
        print(response.text)
        return False

def check_db():
    """DB 상태 확인"""
    print("\n" + "="*80)
    print("📊 DB 상태 확인")
    print("="*80)
    
    # 사용자 목록 및 등급
    result = subprocess.run([
        "mongosh", "mongodb://localhost:27017/nanumpay", "--quiet", "--eval",
        """
        print('\\n[사용자 목록]');
        db.users.find({}, {userName: 1, loginId: 1, grade: 1, _id: 0}).forEach(u => {
            print('  -', u.userName || u.loginId, ':', u.grade);
        });
        """
    ], capture_output=True, text=True)
    print(result.stdout)
    
    # 지급 계획 요약
    result = subprocess.run([
        "mongosh", "mongodb://localhost:27017/nanumpay", "--quiet", "--eval",
        """
        print('[지급 계획 요약]');
        const plans = db.weeklypaymentplans.find({}).toArray();
        const grouped = {};
        plans.forEach(p => {
            const key = p.userName + ' - ' + p.revenueMonth + ' - ' + p.baseGrade;
            if (!grouped[key]) {
                grouped[key] = [];
            }
            grouped[key].push({
                type: p.installmentType,
                추가: p.추가지급단계,
                status: p.planStatus
            });
        });
        Object.keys(grouped).sort().forEach(key => {
            grouped[key].forEach(p => {
                print('  -', key, '(' + p.type + ', 추가' + p.추가 + ', ' + p.status + ')');
            });
        });
        """
    ], capture_output=True, text=True)
    print(result.stdout)
    
    # MonthlyRegistrations 확인
    result = subprocess.run([
        "mongosh", "mongodb://localhost:27017/nanumpay", "--quiet", "--eval",
        """
        print('[월별 등록 정보]');
        db.monthlyregistrations.find({}).forEach(mr => {
            print('  -', mr.monthKey + ':', mr.registrationCount + '명');
            if (mr.paymentTargets && mr.paymentTargets.promoted && mr.paymentTargets.promoted.length > 0) {
                print('    승급:', mr.paymentTargets.promoted.map(p => p.userName + ' (' + p.oldGrade + '→' + p.grade + ')').join(', '));
            }
            if (mr.paymentTargets && mr.paymentTargets.additionalPayments && mr.paymentTargets.additionalPayments.length > 0) {
                print('    추가지급:', mr.paymentTargets.additionalPayments.map(p => p.userName + ' (' + p.grade + ')').join(', '));
            }
        });
        """
    ], capture_output=True, text=True)
    print(result.stdout)
    print("="*80)

def main():
    print("🚀 한 명씩 등록하고 DB 확인하는 자동 테스트\n")
    
    # 로그인
    cookies = login()
    if not cookies:
        return
    
    # 7월 1명: 사장님
    if register_user(cookies, {
        "name": "사장님",
        "phone": "010-0000-0000",
        "bank": "기업은행",
        "accountNumber": "000-000-000000",
        "salesperson": None,
        "registrationDate": "2025-07-01"
    }, "7월 1명(사장님)"):
        check_db()
    
    # 7월 2명: 김영수
    if register_user(cookies, {
        "name": "김영수",
        "phone": "010-1234-5678",
        "bank": "국민은행",
        "accountNumber": "123-456-789012",
        "salesperson": "사장님",
        "registrationDate": "2025-07-02"
    }, "7월 2명(김영수)"):
        check_db()
    
    # 7월 3명: 이미영
    if register_user(cookies, {
        "name": "이미영",
        "phone": "010-2345-6789",
        "bank": "신한은행",
        "accountNumber": "234-567-890123",
        "salesperson": "사장님",
        "registrationDate": "2025-07-03"
    }, "7월 3명(이미영)"):
        check_db()
    
    # 8월 1명: 박철수
    if register_user(cookies, {
        "name": "박철수",
        "phone": "010-1111-1111",
        "bank": "우리은행",
        "accountNumber": "111-222-333444",
        "salesperson": "김영수",
        "registrationDate": "2025-08-01"
    }, "8월 1명(박철수)"):
        check_db()
    
    # 8월 2명: 최영희
    if register_user(cookies, {
        "name": "최영희",
        "phone": "010-2222-2222",
        "bank": "신한은행",
        "accountNumber": "222-333-444555",
        "salesperson": "김영수",
        "registrationDate": "2025-08-02"
    }, "8월 2명(최영희)"):
        check_db()
    
    # 8월 3명: 정민수
    if register_user(cookies, {
        "name": "정민수",
        "phone": "010-3333-3333",
        "bank": "국민은행",
        "accountNumber": "333-444-555666",
        "salesperson": "이미영",
        "registrationDate": "2025-08-03"
    }, "8월 3명(정민수)"):
        check_db()
    
    # 9월 1명: 강민수
    if register_user(cookies, {
        "name": "강민수",
        "phone": "010-6666-6666",
        "bank": "농협",
        "accountNumber": "623456789012",
        "salesperson": "이미영",
        "registrationDate": "2025-09-01"
    }, "9월 1명(강민수)"):
        check_db()
    
    print("\n" + "="*80)
    print("✅ 전체 테스트 완료!")
    print("="*80)

if __name__ == "__main__":
    main()
