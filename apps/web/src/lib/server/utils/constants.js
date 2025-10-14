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
    insuranceRequired: true,
    insuranceAmount: 50000
  },
  F4: {
    maxInstallments: 40,
    insuranceRequired: true,
    insuranceAmount: 50000
  },
  F5: {
    maxInstallments: 50,
    insuranceRequired: true,
    insuranceAmount: 70000
  },
  F6: {
    maxInstallments: 50,
    insuranceRequired: true,
    insuranceAmount: 70000
  },
  F7: {
    maxInstallments: 60,
    insuranceRequired: true,
    insuranceAmount: 100000
  },
  F8: {
    maxInstallments: 60,
    insuranceRequired: true,
    insuranceAmount: 100000
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
