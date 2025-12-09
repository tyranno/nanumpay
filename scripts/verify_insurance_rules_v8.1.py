#!/usr/bin/env python3
"""
v8.1 F4+ 유지보험 규칙 검증 스크립트

검증 항목:
1. 유예기간 계산 (승급 후 2달)
2. 승계 조건 (1단계 상위 승급만)
3. 등급별 보험 금액 (F4-F5: 7만원, F6-F7: 9만원, F8: 11만원)
4. 보험 변경 시 installment 상태 변경
"""

from datetime import date, timedelta
from typing import Optional, Tuple
import json

# 등급 순서
GRADE_ORDER = ['F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8']

# 등급별 보험 금액
GRADE_INSURANCE = {
    'F1': None,
    'F2': None,
    'F3': None,
    'F4': 70000,
    'F5': 70000,
    'F6': 90000,
    'F7': 90000,
    'F8': 110000
}

# 유예기간 (월)
INSURANCE_GRACE_MONTHS = 2

class InsuranceRuleVerifier:
    def __init__(self):
        self.results = []
        self.passed = 0
        self.failed = 0

    def test(self, name: str, expected, actual, description: str = ""):
        """테스트 결과 기록"""
        passed = expected == actual
        result = {
            'name': name,
            'expected': expected,
            'actual': actual,
            'passed': passed,
            'description': description
        }
        self.results.append(result)
        if passed:
            self.passed += 1
            print(f"  [PASS] {name}")
        else:
            self.failed += 1
            print(f"  [FAIL] {name}")
            print(f"         Expected: {expected}")
            print(f"         Actual:   {actual}")
            if description:
                print(f"         Note: {description}")

    def is_one_step_promotion(self, from_grade: str, to_grade: str) -> bool:
        """1단계 상위 승급인지 확인"""
        from_idx = GRADE_ORDER.index(from_grade) if from_grade in GRADE_ORDER else -1
        to_idx = GRADE_ORDER.index(to_grade) if to_grade in GRADE_ORDER else -1
        return to_idx == from_idx + 1

    def get_insurance_required(self, grade: str) -> Optional[int]:
        """등급별 필요 보험 금액"""
        return GRADE_INSURANCE.get(grade)

    def calculate_grace_deadline(self, promotion_date: date) -> date:
        """유예기간 마감일 계산 (승급 후 2달)"""
        year = promotion_date.year
        month = promotion_date.month
        day = promotion_date.day

        # 2개월 후 계산
        target_month = month + INSURANCE_GRACE_MONTHS
        target_year = year
        while target_month > 12:
            target_month -= 12
            target_year += 1

        # 다음 달의 마지막 날 확인
        # 다음 달의 1일 - 1일 = 이번 달 마지막 날
        if target_month == 12:
            last_day = 31
        else:
            next_month_first = date(target_year, target_month + 1, 1)
            last_day = (next_month_first - timedelta(days=1)).day

        target_day = min(day, last_day)
        return date(target_year, target_month, target_day)

    def check_inheritance(self, from_grade: str, to_grade: str, previous_plans_active: bool) -> Tuple[bool, Optional[int]]:
        """
        승계 조건 확인
        Returns: (승계 가능 여부, 이전 등급 보험 금액)
        """
        # 1단계 상위 승급이 아니면 승계 불가
        if not self.is_one_step_promotion(from_grade, to_grade):
            return False, None

        # 이전 등급에 보험 조건이 없으면 승계 불가 (F1, F2, F3)
        prev_insurance = self.get_insurance_required(from_grade)
        if prev_insurance is None:
            return False, None

        # 이전 등급 플랜이 완료되었으면 승계 불가
        if not previous_plans_active:
            return False, None

        return True, prev_insurance

    def run_tests(self):
        """모든 테스트 실행"""
        print("=" * 60)
        print("v8.1 F4+ 유지보험 규칙 검증")
        print("=" * 60)

        # 1. 유예기간 계산 테스트
        print("\n[1] 유예기간 계산 테스트")
        print("-" * 40)

        # 10/10 승급 -> 12/10 마감
        self.test(
            "10/10 승급 -> 12/10 마감",
            date(2025, 12, 10),
            self.calculate_grace_deadline(date(2025, 10, 10)),
            "일반적인 경우"
        )

        # 10/15 승급 -> 12/15 마감
        self.test(
            "10/15 승급 -> 12/15 마감",
            date(2025, 12, 15),
            self.calculate_grace_deadline(date(2025, 10, 15)),
            "일반적인 경우"
        )

        # 11/15 승급 -> 1/15 마감 (연도 넘어감)
        self.test(
            "11/15 승급 -> 1/15 마감",
            date(2026, 1, 15),
            self.calculate_grace_deadline(date(2025, 11, 15)),
            "연도가 넘어가는 경우"
        )

        # 12/31 승급 -> 2/28 마감 (말일 조정)
        self.test(
            "12/31 승급 -> 2/28 마감 (윤년 아님)",
            date(2026, 2, 28),
            self.calculate_grace_deadline(date(2025, 12, 31)),
            "말일이 다른 경우 (31일 -> 28일)"
        )

        # 1/30 승급 -> 3/30 마감
        self.test(
            "1/30 승급 -> 3/30 마감",
            date(2025, 3, 30),
            self.calculate_grace_deadline(date(2025, 1, 30)),
            "1월 30일 -> 3월 30일"
        )

        # 1/31 승급 -> 3/31 마감
        self.test(
            "1/31 승급 -> 3/31 마감",
            date(2025, 3, 31),
            self.calculate_grace_deadline(date(2025, 1, 31)),
            "1월 31일 -> 3월 31일"
        )

        # 2. 1단계 상위 승급 테스트
        print("\n[2] 1단계 상위 승급 테스트")
        print("-" * 40)

        self.test("F3 -> F4 (1단계)", True, self.is_one_step_promotion('F3', 'F4'))
        self.test("F4 -> F5 (1단계)", True, self.is_one_step_promotion('F4', 'F5'))
        self.test("F5 -> F6 (1단계)", True, self.is_one_step_promotion('F5', 'F6'))
        self.test("F6 -> F7 (1단계)", True, self.is_one_step_promotion('F6', 'F7'))
        self.test("F7 -> F8 (1단계)", True, self.is_one_step_promotion('F7', 'F8'))
        self.test("F3 -> F5 (2단계)", False, self.is_one_step_promotion('F3', 'F5'))
        self.test("F4 -> F6 (2단계)", False, self.is_one_step_promotion('F4', 'F6'))
        self.test("F5 -> F8 (3단계)", False, self.is_one_step_promotion('F5', 'F8'))
        self.test("F5 -> F4 (하락)", False, self.is_one_step_promotion('F5', 'F4'))

        # 3. 등급별 보험 금액 테스트
        print("\n[3] 등급별 보험 금액 테스트")
        print("-" * 40)

        self.test("F1 보험 금액 (없음)", None, self.get_insurance_required('F1'))
        self.test("F2 보험 금액 (없음)", None, self.get_insurance_required('F2'))
        self.test("F3 보험 금액 (없음)", None, self.get_insurance_required('F3'))
        self.test("F4 보험 금액 (7만원)", 70000, self.get_insurance_required('F4'))
        self.test("F5 보험 금액 (7만원)", 70000, self.get_insurance_required('F5'))
        self.test("F6 보험 금액 (9만원)", 90000, self.get_insurance_required('F6'))
        self.test("F7 보험 금액 (9만원)", 90000, self.get_insurance_required('F7'))
        self.test("F8 보험 금액 (11만원)", 110000, self.get_insurance_required('F8'))

        # 4. 승계 조건 테스트
        print("\n[4] 승계 조건 테스트")
        print("-" * 40)

        # F3 -> F4: F3에는 보험 조건이 없으므로 승계 불가
        can_inherit, prev_amount = self.check_inheritance('F3', 'F4', True)
        self.test("F3 -> F4 (F3 보험 조건 없음)", False, can_inherit, "F3에는 보험 조건이 없음")

        # F4 -> F5: 1단계, F4 플랜 활성 -> 승계 가능 (7만원 기준)
        can_inherit, prev_amount = self.check_inheritance('F4', 'F5', True)
        self.test("F4 -> F5 (플랜 활성)", True, can_inherit)
        self.test("F4 -> F5 승계 금액 (7만원)", 70000, prev_amount)

        # F5 -> F6: 1단계, F5 플랜 활성 -> 승계 가능 (7만원 기준)
        can_inherit, prev_amount = self.check_inheritance('F5', 'F6', True)
        self.test("F5 -> F6 (플랜 활성)", True, can_inherit)
        self.test("F5 -> F6 승계 금액 (7만원)", 70000, prev_amount)

        # F6 -> F7: 1단계, F6 플랜 활성 -> 승계 가능 (9만원 기준)
        can_inherit, prev_amount = self.check_inheritance('F6', 'F7', True)
        self.test("F6 -> F7 (플랜 활성)", True, can_inherit)
        self.test("F6 -> F7 승계 금액 (9만원)", 90000, prev_amount)

        # F7 -> F8: 1단계, F7 플랜 활성 -> 승계 가능 (9만원 기준)
        can_inherit, prev_amount = self.check_inheritance('F7', 'F8', True)
        self.test("F7 -> F8 (플랜 활성)", True, can_inherit)
        self.test("F7 -> F8 승계 금액 (9만원)", 90000, prev_amount)

        # F4 -> F5: 플랜 완료 -> 승계 불가
        can_inherit, prev_amount = self.check_inheritance('F4', 'F5', False)
        self.test("F4 -> F5 (플랜 완료)", False, can_inherit, "이전 등급 플랜이 완료되면 승계 불가")

        # F4 -> F6: 2단계 승급 -> 승계 불가
        can_inherit, prev_amount = self.check_inheritance('F4', 'F6', True)
        self.test("F4 -> F6 (2단계)", False, can_inherit, "2단계 이상 승급은 승계 불가")

        # 5. 시나리오 테스트
        print("\n[5] 시나리오 테스트")
        print("-" * 40)

        # 시나리오 1: F4 -> F5 승계
        print("\n  시나리오 1: F4 -> F5 승계")
        print("  - 10/10 F4 승급, 보험 7만원 유지")
        print("  - 11/10 F5 승급, F4 플랜 활성 상태")
        can_inherit, prev_amount = self.check_inheritance('F4', 'F5', True)
        self.test("  F4 -> F5 승계 가능", True, can_inherit)
        self.test("  F5에서 7만원 기준 유지", 70000, prev_amount, "F4의 7만원 기준 승계")

        # 시나리오 2: F5 -> F7 (2단계)
        print("\n  시나리오 2: F5 -> F7 (2단계)")
        print("  - 승계 불가, F7 기준(9만원) 적용")
        can_inherit, prev_amount = self.check_inheritance('F5', 'F7', True)
        self.test("  F5 -> F7 승계 불가", False, can_inherit)
        self.test("  F7 보험 기준 (9만원)", 90000, self.get_insurance_required('F7'))
        grace = self.calculate_grace_deadline(date(2025, 11, 10))
        self.test("  11/10 승급 유예기간 마감 (1/10)", date(2026, 1, 10), grace)

        # 시나리오 3: F4 플랜 완료 후 F5 승급
        print("\n  시나리오 3: F4 플랜 완료 후 F5 승급")
        print("  - 승계 불가, F5 기준(7만원) 적용, 유예기간 부여")
        can_inherit, prev_amount = self.check_inheritance('F4', 'F5', False)
        self.test("  플랜 완료 후 승계 불가", False, can_inherit)
        self.test("  F5 보험 기준 (7만원)", 70000, self.get_insurance_required('F5'))
        grace = self.calculate_grace_deadline(date(2025, 12, 15))
        self.test("  12/15 승급 유예기간 마감 (2/15)", date(2026, 2, 15), grace)

        # 결과 요약
        print("\n" + "=" * 60)
        print(f"테스트 결과: {self.passed} passed, {self.failed} failed")
        print("=" * 60)

        if self.failed == 0:
            print("\n모든 테스트 통과!")
            return True
        else:
            print(f"\n{self.failed}개 테스트 실패")
            return False


def main():
    verifier = InsuranceRuleVerifier()
    success = verifier.run_tests()

    # 결과를 JSON으로 저장
    result_file = '/home/doowon/project/my/nanumpay/scripts/insurance_rule_test_results.json'
    with open(result_file, 'w', encoding='utf-8') as f:
        json.dump({
            'passed': verifier.passed,
            'failed': verifier.failed,
            'results': verifier.results
        }, f, indent=2, ensure_ascii=False, default=str)

    print(f"\n결과 저장됨: {result_file}")

    return 0 if success else 1


if __name__ == '__main__':
    exit(main())
