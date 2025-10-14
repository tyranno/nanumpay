/**
 * 날짜 관련 유틸리티 함수
 */

/**
 * 다음 금요일 날짜 계산
 *
 * @param {Date} date - 기준 날짜
 * @returns {Date} 다음 금요일
 */
export function calculateNextFriday(date) {
  const result = new Date(date);
  const day = result.getDay();

  // 금요일 = 5
  // 현재 요일에서 금요일까지 남은 일수 계산
  const daysUntilFriday = (5 - day + 7) % 7;

  if (daysUntilFriday === 0) {
    // 이미 금요일이면 다음 금요일 (7일 후)
    result.setDate(result.getDate() + 7);
  } else {
    result.setDate(result.getDate() + daysUntilFriday);
  }

  return result;
}

/**
 * 주차 번호 계산 (YYYYWW 형식)
 *
 * 예: 2025년 42주차 → 202542
 *
 * @param {Date} date - 날짜
 * @returns {number} 주차 번호
 */
export function getWeekNumber(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);

  return parseInt(`${d.getUTCFullYear()}${String(weekNo).padStart(2, '0')}`);
}

/**
 * 지급 시작일 계산 (등록일 + 1개월 + 첫 금요일)
 *
 * 예: 2025-07-15 등록 → 2025-08-22 (금) 첫 지급
 *
 * @param {Date} registrationDate - 등록일
 * @returns {Date} 첫 지급일
 */
export function calculateFirstPaymentDate(registrationDate) {
  const nextMonth = new Date(registrationDate);
  nextMonth.setMonth(nextMonth.getMonth() + 1);
  nextMonth.setDate(1);  // 다음 달 1일

  return calculateNextFriday(nextMonth);
}
