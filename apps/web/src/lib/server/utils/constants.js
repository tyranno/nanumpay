/**
 * 시스템 상수 정의
 */

/**
 * 등급별 제한 (최대 지급 횟수, 보험 필수 여부)
 * ⭐ v8.1: 유지보험 규칙 변경
 *   - F1-F3: 보험 조건 없음
 *   - F4-F5: 7만원 이상
 *   - F6-F7: 9만원 이상
 *   - F8: 11만원 이상
 *   - 유예기간: 승급 후 2달 (기본지급 시작 후 1달)
 *   - 승계: 1단계 상위 승급 시 이전 보험 기준 인정
 * ⭐ v9.4: 승계 시에도 유예기간은 새로 적용 (승급일 기준 2달)
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
    maxInstallments: 30,  // 40 → 30 변경
    insuranceRequired: false
  },
  F4: {
    maxInstallments: 40,
    insuranceRequired: true,
    insuranceAmount: 70000   // 7만원
  },
  F5: {
    maxInstallments: 40,  // 50 → 40 변경
    insuranceRequired: true,
    insuranceAmount: 70000   // 7만원 (F4와 동일)
  },
  F6: {
    maxInstallments: 50,
    insuranceRequired: true,
    insuranceAmount: 90000   // 9만원
  },
  F7: {
    maxInstallments: 50,  // 60 → 50 변경
    insuranceRequired: true,
    insuranceAmount: 90000   // 9만원 (F6와 동일)
  },
  F8: {
    maxInstallments: 50,  // 60 → 50 변경
    insuranceRequired: true,
    insuranceAmount: 110000  // 11만원
  }
};

/**
 * ⭐ v8.1: 유지보험 유예기간 설정
 */
export const INSURANCE_GRACE_MONTHS = 2;  // 승급 후 2달 (기본지급 시작 1달 + 유예기간 1달)

/**
 * ⭐ v8.1: 등급 순서 (승계 조건 체크용)
 */
export const GRADE_ORDER = ['F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8'];

/**
 * ⭐ v8.1: 1단계 상위 등급 체크
 * @param {string} fromGrade - 이전 등급
 * @param {string} toGrade - 새 등급
 * @returns {boolean} - 1단계 상위 승급인지 여부
 */
export function isOneStepPromotion(fromGrade, toGrade) {
  const fromIndex = GRADE_ORDER.indexOf(fromGrade);
  const toIndex = GRADE_ORDER.indexOf(toGrade);
  return toIndex === fromIndex + 1;
}

/**
 * ⭐ v8.1: 유예기간 마감일 계산 (승급일 + 2달)
 * @param {Date} promotionDate - 승급일
 * @returns {Date} - 유예기간 마감일
 */
export function calculateGraceDeadline(promotionDate) {
  const d = new Date(promotionDate);
  const year = d.getFullYear();
  const month = d.getMonth();
  const day = d.getDate();

  // 2개월 후 계산
  let targetMonth = month + INSURANCE_GRACE_MONTHS;
  let targetYear = year;
  while (targetMonth > 11) {
    targetMonth -= 12;
    targetYear += 1;
  }

  // 다음 달의 마지막 날 계산 (날짜 초과 방지)
  const lastDayOfTargetMonth = new Date(targetYear, targetMonth + 1, 0).getDate();
  const targetDay = Math.min(day, lastDayOfTargetMonth);

  return new Date(targetYear, targetMonth, targetDay);
}

/**
 * ⭐ v8.1: 등급별 유지보험 금액 조회
 * @param {string} grade - 등급
 * @returns {number|null} - 필요 보험 금액 (F1-F3은 null)
 */
export function getInsuranceRequired(grade) {
  const limit = GRADE_LIMITS[grade];
  if (!limit || !limit.insuranceRequired) {
    return null;
  }
  return limit.insuranceAmount;
}

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

/**
 * ⭐ 등급별 최대 추가지급 횟수 (GRADE_LIMITS에서 자동 계산)
 * 공식: (maxInstallments - 10) / 10
 * 결과: F1:1, F2:2, F3:2, F4:3, F5:3, F6:4, F7:4, F8:4
 */
export const MAX_ADDITIONAL_PAYMENTS = Object.fromEntries(
  Object.entries(GRADE_LIMITS).map(([grade, limits]) => [
    grade,
    Math.floor((limits.maxInstallments - 10) / 10)
  ])
);
