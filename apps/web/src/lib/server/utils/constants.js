/**
 * 시스템 상수 정의
 */

/**
 * 등급별 제한 (최대 지급 횟수, 보험 필수 여부)
 */
export const GRADE_LIMITS = {
  F1: {
    maxInstallments: 20,
    insuranceRequired: false
  },
  F2: {
    maxInstallments: 30,
    insuranceRequired: false
  },
  F3: {
    maxInstallments: 40,
    insuranceRequired: false  // ⭐ v8.0 변경: 보험 불필요
  },
  F4: {
    maxInstallments: 40,
    insuranceRequired: true,
    insuranceAmount: 70000,  // ⭐ v8.0 변경: 5만원 → 7만원
    insuranceDeadlinePayments: 4  // ⭐ v8.0 신규: 승급 후 4번(한달) 이내 가입 필요
  },
  F5: {
    maxInstallments: 50,
    insuranceRequired: true,
    insuranceAmount: 70000  // 7만원 (동일)
  },
  F6: {
    maxInstallments: 50,
    insuranceRequired: true,
    insuranceAmount: 90000  // ⭐ v8.0 변경: 7만원 → 9만원
  },
  F7: {
    maxInstallments: 60,
    insuranceRequired: true,
    insuranceAmount: 90000  // ⭐ v8.0 변경: 10만원 → 9만원
  },
  F8: {
    maxInstallments: 60,
    insuranceRequired: true,
    insuranceAmount: 110000  // ⭐ v8.0 변경: 10만원 → 11만원
  }
};

/**
 * 등급별 기본 지급액 (매출 1,000,000원 기준)
 */
export const GRADE_BASE_AMOUNTS = {
  F1: 24000,
  F2: 81000,
  F3: 189000,
  F4: 324000,
  F5: 540000,
  F6: 810000,
  F7: 1215000,
  F8: 1620000
};
