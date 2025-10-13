#!/usr/bin/env python3
"""
Nanumpay 용역자 등록 테스트 스크립트
7월, 8월 엑셀 파일을 순서대로 등록하고 결과를 검증합니다.
"""

import requests
import json
import openpyxl
from datetime import datetime
import time
import sys

# 설정
API_BASE_URL = "http://localhost:3100"
ADMIN_LOGIN_ID = "관리자"
ADMIN_PASSWORD = "admin1234!!"

# 엑셀 파일 경로
EXCEL_FILES = [
    {
        "path": "test-data/7월_용역자명단_root.xlsx",
        "month": "2025-07",
        "description": "7월 등록 (3명)"
    },
    {
        "path": "test-data/8월_용역자명단_간단.xlsx",
        "month": "2025-08",
        "description": "8월 등록 (3명 + 승급 1명)"
    }
]


class NanumpayTester:
    def __init__(self):
        self.session = requests.Session()
        self.token = None

    def login(self):
        """관리자 로그인"""
        print("=" * 60)
        print("🔐 관리자 로그인 중...")

        response = self.session.post(
            f"{API_BASE_URL}/api/auth/login",
            json={
                "loginId": ADMIN_LOGIN_ID,
                "password": ADMIN_PASSWORD
            }
        )

        if response.status_code == 200:
            data = response.json()
            if data.get("success"):
                print(f"✅ 로그인 성공: {data.get('user', {}).get('name')}")
                return True
            else:
                print(f"❌ 로그인 실패: {data.get('error')}")
                return False
        else:
            print(f"❌ 로그인 실패: HTTP {response.status_code}")
            print(f"   응답: {response.text}")
            return False

    def read_excel(self, file_path):
        """엑셀 파일을 읽어 API 형식으로 변환"""
        print(f"\n📁 엑셀 파일 읽기: {file_path}")

        try:
            workbook = openpyxl.load_workbook(file_path)
            sheet = workbook.active

            # 헤더 읽기 (첫 번째 행)
            headers = []
            for cell in sheet[1]:
                headers.append(cell.value)

            print(f"   헤더: {headers}")

            # 데이터 읽기 (두 번째 행부터)
            users = []
            for row_idx, row in enumerate(sheet.iter_rows(min_row=2, values_only=True), start=2):
                if not row[0]:  # 첫 번째 컬럼이 비어있으면 건너뛰기
                    continue

                user_data = {}
                for col_idx, (header, value) in enumerate(zip(headers, row)):
                    if header:
                        # __EMPTY 형식으로 변환 (bulk API가 이 형식을 기대함)
                        # 헤더: ['순번', '날짜', '성명', '연락처', '주민번호', '은행', '계좌번호', '판매인', '연락처', '설계사', '연락처', '보험상품명', '보험회사', '지사']
                        if col_idx == 0:
                            continue  # 순번 건너뛰기
                        elif col_idx == 1:
                            # 날짜를 문자열로 변환
                            if isinstance(value, datetime):
                                user_data['__EMPTY'] = value.strftime('%Y-%m-%d')
                            else:
                                user_data['__EMPTY'] = value
                        elif col_idx == 2:
                            user_data['__EMPTY_1'] = value  # 성명
                        elif col_idx == 3:
                            user_data['__EMPTY_2'] = value  # 연락처
                        elif col_idx == 4:
                            user_data['__EMPTY_3'] = value  # 주민번호
                        elif col_idx == 5:
                            user_data['__EMPTY_4'] = value  # 은행
                        elif col_idx == 6:
                            user_data['__EMPTY_5'] = value  # 계좌번호
                        elif col_idx == 7:
                            user_data['__EMPTY_6'] = value  # 판매인
                        elif col_idx == 8:
                            user_data['__EMPTY_7'] = value  # 판매인연락처
                        elif col_idx == 9:
                            user_data['__EMPTY_8'] = value  # 설계사
                        elif col_idx == 10:
                            user_data['__EMPTY_9'] = value  # 설계사연락처
                        elif col_idx == 11:
                            user_data['__EMPTY_10'] = value  # 보험상품명
                        elif col_idx == 12:
                            user_data['__EMPTY_11'] = value  # 보험회사
                        elif col_idx == 13:
                            user_data['__EMPTY_12'] = value  # 지사

                users.append(user_data)
                print(f"   행 {row_idx}: {user_data.get('__EMPTY_1')} (판매인: {user_data.get('__EMPTY_6', '-')})")

            print(f"✅ 총 {len(users)}명 읽기 완료")
            return users

        except Exception as e:
            print(f"❌ 엑셀 파일 읽기 실패: {str(e)}")
            import traceback
            traceback.print_exc()
            return None

    def register_users(self, users, description):
        """용역자 일괄 등록"""
        print(f"\n{'=' * 60}")
        print(f"📝 {description}")
        print(f"   등록 인원: {len(users)}명")

        response = self.session.post(
            f"{API_BASE_URL}/api/admin/users/bulk",
            json={"users": users},
            headers={"Content-Type": "application/json"}
        )

        if response.status_code == 200:
            data = response.json()
            print(f"\n✅ 등록 성공!")
            print(f"   - 성공: {data.get('created', 0)}명")
            print(f"   - 실패: {data.get('failed', 0)}명")

            if data.get('errors'):
                print(f"\n⚠️ 오류 목록:")
                for error in data['errors']:
                    print(f"   - {error}")

            if data.get('alerts'):
                print(f"\n💡 알림:")
                for alert in data['alerts']:
                    print(f"   - {alert.get('message')}")

            if data.get('batchProcessing'):
                bp = data['batchProcessing']
                print(f"\n📊 배치 처리 결과:")
                if bp.get('revenue'):
                    print(f"   - 매출: {bp['revenue'].get('totalRevenue', 0):,}원")
                if bp.get('plans'):
                    print(f"   - 지급계획: {len(bp['plans'])}명")

            return True
        else:
            print(f"❌ 등록 실패: HTTP {response.status_code}")
            print(f"   응답: {response.text}")
            return False

    def verify_payment_plans(self):
        """지급 계획 검증"""
        print(f"\n{'=' * 60}")
        print("🔍 지급 계획 검증 중...")

        # MongoDB 직접 조회 명령 출력
        print("\n📋 MongoDB 조회 명령:")
        print("=" * 60)

        queries = [
            {
                "title": "1. 전체 사용자 등급 확인",
                "command": 'db.users.find({}, {name: 1, grade: 1, createdAt: 1}).sort({createdAt: 1})'
            },
            {
                "title": "2. 월별 등록 현황",
                "command": 'db.monthlyregistrations.find({}, {monthKey: 1, registrationCount: 1, totalRevenue: 1, gradeDistribution: 1})'
            },
            {
                "title": "3. 지급 계획 (사장님)",
                "command": 'db.weeklypaymentplans.find({userName: "사장님"}, {baseGrade: 1, 추가지급단계: 1, installmentType: 1, revenueMonth: 1, planStatus: 1, "installments.installmentAmount": 1}).sort({createdAt: 1})'
            },
            {
                "title": "4. 지급 계획 (김영수)",
                "command": 'db.weeklypaymentplans.find({userName: "김영수"}, {baseGrade: 1, 추가지급단계: 1, installmentType: 1, revenueMonth: 1, planStatus: 1, "installments.installmentAmount": 1}).sort({createdAt: 1})'
            },
            {
                "title": "5. 지급 계획 (이미영)",
                "command": 'db.weeklypaymentplans.find({userName: "이미영"}, {baseGrade: 1, 추가지급단계: 1, installmentType: 1, revenueMonth: 1, planStatus: 1, "installments.installmentAmount": 1}).sort({createdAt: 1})'
            },
            {
                "title": "6. 추가지급 계획만 확인",
                "command": 'db.weeklypaymentplans.find({installmentType: "additional"}, {userName: 1, baseGrade: 1, 추가지급단계: 1, revenueMonth: 1, "installments.0.installmentAmount": 1})'
            },
            {
                "title": "7. 월별 스냅샷",
                "command": 'db.monthlytreesnapshots.find({}, {monthKey: 1, gradeDistribution: 1, "users.name": 1, "users.grade": 1})'
            }
        ]

        for query in queries:
            print(f"\n{query['title']}:")
            print(f"mongosh mongodb://localhost:27017/nanumpay --quiet --eval '{query['command']}'")

        print("\n" + "=" * 60)
        print("\n💡 위 명령어를 터미널에서 실행하여 결과를 확인하세요!")
        print("\n예상 결과 (v7.0_검증결과_7-8-9월_등록_분석.md 참고):")
        print("  - 7월: 사장님(F2), 김영수(F1), 이미영(F1)")
        print("  - 8월: 김영수 승급(F1→F2)")
        print("  - 8월 추가지급: 사장님(F2, 40,500원/회), 이미영(F1, 12,000원/회)")
        print("          ⭐ 금액은 8월 등급 분포(F1=4명, F2=2명) 기준!")

    def run(self):
        """전체 테스트 실행"""
        print("=" * 60)
        print("🚀 Nanumpay 용역자 등록 테스트 시작")
        print("=" * 60)

        # 1. 로그인
        if not self.login():
            print("\n❌ 로그인 실패로 테스트 중단")
            return False

        # 2. 각 엑셀 파일 순차 등록
        for excel_info in EXCEL_FILES:
            print(f"\n⏳ 잠시 대기 중... (2초)")
            time.sleep(2)

            # 엑셀 파일 읽기
            users = self.read_excel(excel_info["path"])
            if users is None:
                print(f"\n❌ {excel_info['description']} 실패로 테스트 중단")
                return False

            # 등록
            if not self.register_users(users, excel_info["description"]):
                print(f"\n❌ {excel_info['description']} 실패로 테스트 중단")
                return False

        # 3. 결과 검증
        time.sleep(2)
        self.verify_payment_plans()

        print("\n" + "=" * 60)
        print("✅ 테스트 완료!")
        print("=" * 60)
        return True


def main():
    """메인 함수"""
    print(f"\n⚠️ 주의: 이 스크립트를 실행하기 전에 DB를 초기화하세요!")
    print(f"DB_DIR=/home/tyranno/project/bill/nanumpay/apps/web/install/linux/db \\")
    print(f"bash /home/tyranno/project/bill/nanumpay/apps/web/install/linux/db_init.sh --force\n")

    response = input("DB를 초기화했습니까? (y/n): ")
    if response.lower() != 'y':
        print("테스트를 취소합니다.")
        return

    response = input("개발 서버가 실행 중입니까? (y/n): ")
    if response.lower() != 'y':
        print("먼저 개발 서버를 실행하세요: pnpm dev:web --host")
        return

    tester = NanumpayTester()
    success = tester.run()

    if success:
        sys.exit(0)
    else:
        sys.exit(1)


if __name__ == "__main__":
    main()
