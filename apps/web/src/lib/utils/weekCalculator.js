/**
 * 일요일 시작 + 월요일 기준 주차 계산 유틸리티
 *
 * 규칙:
 * - 주간: 일요일 ~ 토요일 (7일간)
 * - 주차 결정: 그 주의 월요일이 몇월에 속하느냐로 결정
 * - 월경계 처리: 월요일 기준으로 해당 월의 N주차 결정
 */

/**
 * 특정 월의 모든 월요일 찾기 (이전달/다음달 포함)
 * @param {number} year 연도
 * @param {number} month 월 (1-12)
 * @returns {Array} [{ monday: Date, weekNumber: number }] 배열
 */
export function getMondaysInMonth(year, month) {
  const mondays = [];
  let weekNumber = 1;

  // 해당 월 전후로 검색 범위 확장
  const searchStart = new Date(year, month - 2, 1); // 이전달 1일부터
  const searchEnd = new Date(year, month + 1, 0); // 다음달 마지막날까지

  const date = new Date(searchStart);

  // 첫 번째 월요일 찾기
  while (date.getDay() !== 1) { // 1 = 월요일
    date.setDate(date.getDate() + 1);
  }

  // 월요일들을 수집하되, 해당 월에 속하는 것만 카운트
  while (date <= searchEnd) {
    const mondayMonth = date.getMonth() + 1;

    if (mondayMonth === month) {
      mondays.push({
        monday: new Date(date),
        weekNumber: weekNumber
      });
      weekNumber++;
    }

    date.setDate(date.getDate() + 7); // 다음 월요일
  }

  return mondays;
}

/**
 * 일요일 시작 + 월요일 기준 주차 계산
 * @param {Date|string} inputDate 날짜 (Date 객체 또는 'YYYY-MM-DD' 문자열)
 * @returns {Object} { year, month, week } 또는 null
 */
export function getWeekOfMonthByMonday(inputDate) {
  const date = typeof inputDate === 'string' ? new Date(inputDate) : new Date(inputDate);

  // 해당 주의 월요일 찾기 (일요일 시작 주간 기준)
  const weekMonday = new Date(date);

  if (date.getDay() === 0) {
    // 일요일인 경우: 다음 월요일을 찾음
    weekMonday.setDate(date.getDate() + 1);
  } else {
    // 월~토요일인 경우: 같은 주의 월요일을 찾음
    const daysToMonday = (date.getDay() + 6) % 7;
    weekMonday.setDate(date.getDate() - daysToMonday);
  }

  // 월요일이 속한 월이 주차 결정
  const mondayYear = weekMonday.getFullYear();
  const mondayMonth = weekMonday.getMonth() + 1;

  // 해당 월의 월요일들 중에서 몇 번째인지 찾기
  const mondays = getMondaysInMonth(mondayYear, mondayMonth);

  for (const mondayInfo of mondays) {
    // 날짜만 비교 (시간 무시)
    if (weekMonday.getFullYear() === mondayInfo.monday.getFullYear() &&
        weekMonday.getMonth() === mondayInfo.monday.getMonth() &&
        weekMonday.getDate() === mondayInfo.monday.getDate()) {
      return {
        year: mondayYear,
        month: mondayMonth,
        week: mondayInfo.weekNumber
      };
    }
  }

  return null; // 예외 상황
}

/**
 * 주차 정보를 문자열로 변환
 * @param {number} year 연도
 * @param {number} month 월
 * @param {number} week 주차
 * @returns {string} "YYYY년 MM월 N주차" 형태
 */
export function formatWeekString(year, month, week) {
  return `${year}년 ${month}월 ${week}주차`;
}

/**
 * 지급 스케줄용 주차 계산 (N월 매출 -> N+1월부터 10주 지급)
 * @param {number} sourceYear 매출 발생 연도
 * @param {number} sourceMonth 매출 발생 월
 * @param {number} installmentNumber 회차 (1-10)
 * @returns {Object} { year, month, week }
 */
export function calculatePaymentWeek(sourceYear, sourceMonth, installmentNumber) {
  // N+1월부터 시작
  let paymentYear = sourceYear;
  let paymentMonth = sourceMonth + 1;

  if (paymentMonth > 12) {
    paymentYear++;
    paymentMonth = 1;
  }

  // 회차별 주차 계산
  let currentYear = paymentYear;
  let currentMonth = paymentMonth;
  let remainingInstallments = installmentNumber;

  while (remainingInstallments > 0) {
    const mondays = getMondaysInMonth(currentYear, currentMonth);
    const weeksInMonth = mondays.length;

    if (remainingInstallments <= weeksInMonth) {
      // 현재 월에서 지급 완료
      return {
        year: currentYear,
        month: currentMonth,
        week: remainingInstallments
      };
    }

    // 다음 월로 이동
    remainingInstallments -= weeksInMonth;
    currentMonth++;
    if (currentMonth > 12) {
      currentMonth = 1;
      currentYear++;
    }
  }

  // 여기까지 올 일은 없지만 안전장치
  return {
    year: currentYear,
    month: currentMonth,
    week: 1
  };
}

/**
 * 디버깅용: 특정 월의 주차 정보 출력 (일요일 시작 기준)
 * @param {number} year 연도
 * @param {number} month 월
 */
export function debugMonthWeeks(year, month) {
  console.log(`=== ${year}년 ${month}월 주차 정보 (일요일 시작) ===`);
  const mondays = getMondaysInMonth(year, month);

  mondays.forEach((mondayInfo) => {
    const monday = mondayInfo.monday;
    const weekNumber = mondayInfo.weekNumber;

    // 일요일 시작으로 주간 계산
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() - 1); // 월요일 전날 = 일요일

    const saturday = new Date(monday);
    saturday.setDate(monday.getDate() + 5); // 월요일 + 5일 = 토요일

    console.log(
      `${month}월 ${weekNumber}주차: ${sunday.getMonth() + 1}/${sunday.getDate()}(일) ~ ${saturday.getMonth() + 1}/${saturday.getDate()}(토) [월요일: ${monday.getMonth() + 1}/${monday.getDate()}]`
    );
  });
}