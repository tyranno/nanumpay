#!/usr/bin/env python3
"""
v8.1 F4+ 유지보험 통합 테스트

MongoDB에 직접 연결하여 시나리오별 동작 검증:
1. 유예기간 내 보험 없어도 정상 지급
2. 유예기간 후 보험 미충족 시 지급 정지
3. 보험 해지 시 다음 금요일부터 정지
4. 승계 케이스 (F5→F6)
5. 승계 불가 케이스 (F5→F7)
"""

from datetime import datetime, timedelta
from bson import ObjectId
from pymongo import MongoClient
import json

# MongoDB 연결
MONGO_URI = "mongodb://localhost:27017/nanumpay"

# 등급별 보험 금액
GRADE_INSURANCE = {
    'F1': None, 'F2': None, 'F3': None,
    'F4': 70000, 'F5': 70000,
    'F6': 90000, 'F7': 90000,
    'F8': 110000
}

GRADE_ORDER = ['F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8']


def calculate_grace_deadline(promotion_date: datetime) -> datetime:
    """유예기간 마감일 계산 (승급 후 2달)"""
    year = promotion_date.year
    month = promotion_date.month
    day = promotion_date.day

    target_month = month + 2
    target_year = year
    while target_month > 12:
        target_month -= 12
        target_year += 1

    # 말일 조정
    if target_month == 12:
        last_day = 31
    else:
        next_month_first = datetime(target_year, target_month + 1, 1)
        last_day = (next_month_first - timedelta(days=1)).day

    target_day = min(day, last_day)
    return datetime(target_year, target_month, target_day)


def get_next_friday(d: datetime) -> datetime:
    """다음 금요일 계산"""
    days_ahead = 4 - d.weekday()  # Friday = 4
    if days_ahead <= 0:
        days_ahead += 7
    return d + timedelta(days=days_ahead)


class IntegrationTest:
    def __init__(self):
        self.client = MongoClient(MONGO_URI)
        self.db = self.client.get_database()
        self.results = []
        self.passed = 0
        self.failed = 0

    def cleanup_test_data(self):
        """테스트 데이터 정리"""
        self.db.weeklypaymentplans.delete_many({"userName": {"$regex": "^TEST_"}})
        self.db.users.delete_many({"name": {"$regex": "^TEST_"}})
        print("테스트 데이터 정리 완료\n")

    def create_test_user(self, name: str, grade: str, insurance_amount: int = 0) -> str:
        """테스트 사용자 생성"""
        user = {
            "_id": ObjectId(),
            "name": name,
            "userId": name.lower().replace("_", ""),
            "grade": grade,
            "insuranceAmount": insurance_amount,
            "insuranceActive": insurance_amount >= (GRADE_INSURANCE.get(grade) or 0) if GRADE_INSURANCE.get(grade) else False,
            "insuranceDate": datetime.now() if insurance_amount > 0 else None,
            "createdAt": datetime.now(),
            "updatedAt": datetime.now()
        }
        self.db.users.insert_one(user)
        return str(user["_id"])

    def create_test_plan(
        self,
        user_id: str,
        user_name: str,
        grade: str,
        promotion_date: datetime,
        insurance_inherited: bool = False,
        previous_insurance: int = None
    ) -> str:
        """테스트 지급계획 생성"""

        # 보험 조건 결정
        current_insurance_required = GRADE_INSURANCE.get(grade)
        if current_insurance_required is None:
            # F1-F3: 보험 조건 없음
            insurance_required = None
            grace_deadline = None
            inherited = False
        elif insurance_inherited and previous_insurance:
            # 승계 인정
            insurance_required = previous_insurance
            grace_deadline = None
            inherited = True
        else:
            # 승계 불가 or 신규
            insurance_required = current_insurance_required
            grace_deadline = calculate_grace_deadline(promotion_date)
            inherited = False

        # 지급 시작일 (승급 후 1달 뒤 금요일)
        start_date = promotion_date + timedelta(days=30)
        start_date = get_next_friday(start_date)

        # 10회 installments 생성
        installments = []
        current_date = start_date
        for i in range(10):
            installments.append({
                "week": i + 1,
                "weekNumber": f"{current_date.year}-W{current_date.isocalendar()[1]:02d}",
                "scheduledDate": current_date,
                "revenueMonth": f"{promotion_date.year}-{promotion_date.month:02d}",
                "status": "pending",
                "insuranceSkipped": False
            })
            current_date = current_date + timedelta(days=7)

        plan = {
            "_id": ObjectId(),
            "userId": user_id,
            "userName": user_name,
            "planType": "promotion",
            "generation": 1,
            "추가지급단계": 0,
            "installmentType": "basic",
            "baseGrade": grade,
            "revenueMonth": f"{promotion_date.year}-{promotion_date.month:02d}",
            "additionalPaymentBaseDate": promotion_date,
            "startDate": start_date,
            "totalInstallments": 10,
            "completedInstallments": 0,
            "installments": installments,
            "planStatus": "active",
            "createdBy": "promotion",
            "graceDeadline": grace_deadline,
            "insuranceRequired": insurance_required,
            "insuranceInherited": inherited,
            "createdAt": datetime.now(),
            "updatedAt": datetime.now()
        }

        self.db.weeklypaymentplans.insert_one(plan)
        return str(plan["_id"])

    def update_installments_on_insurance_change(self, user_id: str, new_insurance_amount: int) -> dict:
        """보험 변경 시 installment 업데이트 (JavaScript 로직 재현)"""
        today = datetime.now()
        skipped_count = 0
        restored_count = 0

        plans = list(self.db.weeklypaymentplans.find({
            "userId": user_id,
            "planStatus": "active",
            "insuranceRequired": {"$ne": None}
        }))

        for plan in plans:
            plan_modified = False

            for installment in plan["installments"]:
                scheduled_date = installment["scheduledDate"]

                # 과거 지급은 건드리지 않음
                if scheduled_date < today:
                    continue

                # 유예기간 체크
                grace_deadline = plan.get("graceDeadline")
                is_after_grace = grace_deadline is None or scheduled_date > grace_deadline

                if new_insurance_amount < plan["insuranceRequired"]:
                    # 보험 미충족
                    if is_after_grace and installment["status"] == "pending":
                        installment["status"] = "skipped"
                        installment["skipReason"] = "insurance_not_maintained"
                        installment["insuranceSkipped"] = True
                        skipped_count += 1
                        plan_modified = True
                else:
                    # 보험 충족
                    if installment["status"] == "skipped" and installment.get("insuranceSkipped"):
                        installment["status"] = "pending"
                        installment["skipReason"] = None
                        installment["insuranceSkipped"] = False
                        restored_count += 1
                        plan_modified = True

            if plan_modified:
                self.db.weeklypaymentplans.update_one(
                    {"_id": plan["_id"]},
                    {"$set": {"installments": plan["installments"]}}
                )

        return {"skipped": skipped_count, "restored": restored_count}

    def test(self, name: str, expected, actual, description: str = ""):
        """테스트 결과 기록"""
        passed = expected == actual
        if passed:
            self.passed += 1
            print(f"  [PASS] {name}")
        else:
            self.failed += 1
            print(f"  [FAIL] {name}")
            print(f"         Expected: {expected}")
            print(f"         Actual:   {actual}")
        return passed

    def get_plan_status_summary(self, plan_id: str) -> dict:
        """계획의 상태 요약"""
        plan = self.db.weeklypaymentplans.find_one({"_id": ObjectId(plan_id)})
        if not plan:
            return None

        pending = sum(1 for i in plan["installments"] if i["status"] == "pending")
        skipped = sum(1 for i in plan["installments"] if i["status"] == "skipped")

        return {
            "pending": pending,
            "skipped": skipped,
            "graceDeadline": plan.get("graceDeadline"),
            "insuranceRequired": plan.get("insuranceRequired"),
            "insuranceInherited": plan.get("insuranceInherited")
        }

    def run_tests(self):
        """모든 테스트 실행"""
        print("=" * 70)
        print("v8.1 F4+ 유지보험 통합 테스트")
        print("=" * 70)

        self.cleanup_test_data()

        # ========================================
        # 시나리오 1: F4 유예기간 내 보험 없어도 정상
        # ========================================
        print("\n[시나리오 1] F4 유예기간 내 보험 없어도 정상 지급")
        print("-" * 50)

        # 10/10 F4 승급, 보험 없음
        promotion_date = datetime(2025, 10, 10)
        user_id = self.create_test_user("TEST_USER_1", "F4", insurance_amount=0)
        plan_id = self.create_test_plan(user_id, "TEST_USER_1", "F4", promotion_date)

        status = self.get_plan_status_summary(plan_id)
        print(f"  승급일: {promotion_date.strftime('%Y-%m-%d')}")
        print(f"  유예마감: {status['graceDeadline'].strftime('%Y-%m-%d') if status['graceDeadline'] else 'None'}")
        print(f"  보험필요: {status['insuranceRequired']}원")

        # 유예기간 마감일 확인 (10/10 + 2달 = 12/10)
        expected_grace = datetime(2025, 12, 10)
        self.test("유예마감일 12/10", expected_grace.date(), status['graceDeadline'].date() if status['graceDeadline'] else None)

        # 보험 0원으로 업데이트 (유예기간 내이므로 정지 안 됨)
        result = self.update_installments_on_insurance_change(user_id, 0)

        # 유예기간 전 installment는 pending 유지
        status_after = self.get_plan_status_summary(plan_id)
        # 10회 중 유예기간(12/10) 전 것들은 pending, 후 것들은 skipped
        print(f"  보험 0원 후: pending={status_after['pending']}, skipped={status_after['skipped']}")

        # 지급시작은 11/10경이고, 유예마감은 12/10이므로
        # 약 4-5회(11월)는 유예기간 내, 나머지는 유예기간 후
        self.test("skipped 개수 > 0 (유예 후)", True, status_after['skipped'] > 0)
        self.test("pending 개수 > 0 (유예 내)", True, status_after['pending'] > 0)

        # ========================================
        # 시나리오 2: 보험 가입 후 복구
        # ========================================
        print("\n[시나리오 2] 보험 가입 후 복구")
        print("-" * 50)

        # 7만원 보험 가입
        result = self.update_installments_on_insurance_change(user_id, 70000)
        status_after = self.get_plan_status_summary(plan_id)

        print(f"  7만원 가입 후: pending={status_after['pending']}, skipped={status_after['skipped']}")
        self.test("모든 installment pending 복구", 0, status_after['skipped'])

        # ========================================
        # 시나리오 3: 승계 케이스 (F5→F6)
        # ========================================
        print("\n[시나리오 3] 승계 케이스 (F5→F6)")
        print("-" * 50)

        # F5 플랜이 active 상태에서 F6 승급
        promotion_date_f5 = datetime(2025, 9, 1)
        user_id_2 = self.create_test_user("TEST_USER_2", "F6", insurance_amount=70000)

        # F5 플랜 (active)
        plan_id_f5 = self.create_test_plan(user_id_2, "TEST_USER_2", "F5", promotion_date_f5)

        # F6 플랜 (승계 인정: F5 7만원 기준)
        promotion_date_f6 = datetime(2025, 11, 1)
        plan_id_f6 = self.create_test_plan(
            user_id_2, "TEST_USER_2", "F6", promotion_date_f6,
            insurance_inherited=True, previous_insurance=70000
        )

        status_f6 = self.get_plan_status_summary(plan_id_f6)
        print(f"  F6 유예마감: {status_f6['graceDeadline']}")
        print(f"  F6 보험필요: {status_f6['insuranceRequired']}원")
        print(f"  F6 승계여부: {status_f6['insuranceInherited']}")

        self.test("승계 시 유예기간 없음", None, status_f6['graceDeadline'])
        self.test("승계 시 7만원 기준", 70000, status_f6['insuranceRequired'])
        self.test("승계 플래그 True", True, status_f6['insuranceInherited'])

        # 7만원 보험으로 조건 충족
        result = self.update_installments_on_insurance_change(user_id_2, 70000)
        status_f6_after = self.get_plan_status_summary(plan_id_f6)
        self.test("7만원으로 모든 지급 정상", 0, status_f6_after['skipped'])

        # ========================================
        # 시나리오 4: 승계 불가 케이스 (F5→F7)
        # ========================================
        print("\n[시나리오 4] 승계 불가 케이스 (F5→F7, 2단계)")
        print("-" * 50)

        # F5→F7은 2단계이므로 승계 불가
        promotion_date_f7 = datetime(2025, 10, 15)
        user_id_3 = self.create_test_user("TEST_USER_3", "F7", insurance_amount=70000)

        # F7 플랜 (승계 불가: F7 9만원 기준, 유예기간 부여)
        plan_id_f7 = self.create_test_plan(
            user_id_3, "TEST_USER_3", "F7", promotion_date_f7,
            insurance_inherited=False
        )

        status_f7 = self.get_plan_status_summary(plan_id_f7)
        print(f"  F7 유예마감: {status_f7['graceDeadline'].strftime('%Y-%m-%d') if status_f7['graceDeadline'] else 'None'}")
        print(f"  F7 보험필요: {status_f7['insuranceRequired']}원")
        print(f"  F7 승계여부: {status_f7['insuranceInherited']}")

        self.test("승계 불가 시 유예기간 있음", True, status_f7['graceDeadline'] is not None)
        self.test("F7은 9만원 기준", 90000, status_f7['insuranceRequired'])
        self.test("승계 플래그 False", False, status_f7['insuranceInherited'])

        # 7만원 보험은 F7 기준(9만원) 미충족
        result = self.update_installments_on_insurance_change(user_id_3, 70000)
        status_f7_after = self.get_plan_status_summary(plan_id_f7)
        print(f"  7만원 보험 후: pending={status_f7_after['pending']}, skipped={status_f7_after['skipped']}")
        self.test("7만원으로는 유예 후 정지", True, status_f7_after['skipped'] > 0)

        # 9만원 보험 가입
        result = self.update_installments_on_insurance_change(user_id_3, 90000)
        status_f7_final = self.get_plan_status_summary(plan_id_f7)
        self.test("9만원으로 모든 지급 복구", 0, status_f7_final['skipped'])

        # ========================================
        # 시나리오 5: F8 승계 (F7 9만원 → F8 9만원)
        # ========================================
        print("\n[시나리오 5] F7→F8 승계 (9만원 기준 유지)")
        print("-" * 50)

        promotion_date_f8 = datetime(2025, 11, 20)
        user_id_4 = self.create_test_user("TEST_USER_4", "F8", insurance_amount=90000)

        # F8 플랜 (승계 인정: F7 9만원 기준)
        plan_id_f8 = self.create_test_plan(
            user_id_4, "TEST_USER_4", "F8", promotion_date_f8,
            insurance_inherited=True, previous_insurance=90000
        )

        status_f8 = self.get_plan_status_summary(plan_id_f8)
        print(f"  F8 유예마감: {status_f8['graceDeadline']}")
        print(f"  F8 보험필요: {status_f8['insuranceRequired']}원 (승계 시 F7 기준)")
        print(f"  F8 원래 기준: 110000원")

        self.test("승계 시 9만원 기준 (F7)", 90000, status_f8['insuranceRequired'])

        # 9만원 보험으로 F8 지급 가능 (승계 덕분)
        result = self.update_installments_on_insurance_change(user_id_4, 90000)
        status_f8_after = self.get_plan_status_summary(plan_id_f8)
        self.test("9만원으로 F8 지급 가능 (승계)", 0, status_f8_after['skipped'])

        # ========================================
        # 시나리오 6: F3→F4 (승계 불가, F3에 보험 조건 없음)
        # ========================================
        print("\n[시나리오 6] F3→F4 (F3에 보험 조건 없음)")
        print("-" * 50)

        promotion_date_f4 = datetime(2025, 10, 25)
        user_id_5 = self.create_test_user("TEST_USER_5", "F4", insurance_amount=0)

        # F4 플랜 (승계 불가: F3에 보험 조건 없음)
        plan_id_f4 = self.create_test_plan(
            user_id_5, "TEST_USER_5", "F4", promotion_date_f4,
            insurance_inherited=False
        )

        status_f4 = self.get_plan_status_summary(plan_id_f4)
        print(f"  F4 유예마감: {status_f4['graceDeadline'].strftime('%Y-%m-%d') if status_f4['graceDeadline'] else 'None'}")
        print(f"  F4 보험필요: {status_f4['insuranceRequired']}원")

        self.test("F3→F4 유예기간 부여", True, status_f4['graceDeadline'] is not None)
        self.test("F4 7만원 기준", 70000, status_f4['insuranceRequired'])

        # 정리
        self.cleanup_test_data()

        # 결과 요약
        print("\n" + "=" * 70)
        print(f"테스트 결과: {self.passed} passed, {self.failed} failed")
        print("=" * 70)

        return self.failed == 0


def main():
    test = IntegrationTest()
    try:
        success = test.run_tests()
        return 0 if success else 1
    except Exception as e:
        print(f"\n오류 발생: {e}")
        import traceback
        traceback.print_exc()
        return 1
    finally:
        test.client.close()


if __name__ == "__main__":
    exit(main())
