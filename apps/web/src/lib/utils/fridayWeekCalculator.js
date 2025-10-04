/**
 * 금요일 기준 주차 계산 유틸리티
 *
 * 규칙:
 * - 주간: 일요일 ~ 토요일 (7일간) - 일반 달력 기준
 * - 주차 결정: 그 주의 금요일이 몇월에 속하느냐로 결정
 * - 월경계 처리: 금요일 기준으로 해당 월의 N주차 결정
 *
 * 예시:
 * - 2025년 10월 3일(금) → 9월 28일(일) ~ 10월 4일(토) → 10월 1주차
 */

/**
 * 특정 월의 모든 금요일 찾기 (이전달/다음달 포함)
 * @param {number} year 연도
 * @param {number} month 월 (1-12)
 * @returns {Array} [{ friday: Date, weekNumber: number }] 배열
 */
export function getFridaysInMonth(year, month) {
  const fridays = [];
  
  // 해당 월의 첫 날과 마지막 날
  const firstDay = new Date(year, month - 1, 1);
  const lastDay = new Date(year, month, 0);
  
  // 이전 월의 마지막 주 일요일부터 시작할 수 있으므로 범위 확장
  const searchStart = new Date(year, month - 1, -7); // 이전달 말부터
  const searchEnd = new Date(year, month, 7); // 다음달 초까지
  
  const date = new Date(searchStart);
  
  // 첫 번째 일요일 찾기
  while (date.getDay() !== 0) { // 0 = 일요일
    date.setDate(date.getDate() + 1);
  }
  
  let weekNumber = 1;
  
  // 일요일부터 시작해서 각 주를 확인
  while (date <= searchEnd) {
    // 해당 주의 금요일 계산 (일요일 + 5일)
    const friday = new Date(date);
    friday.setDate(friday.getDate() + 5);
    
    // 금요일이 해당 월에 속하면 그 주는 해당 월의 주차
    if (friday.getMonth() === month - 1 && friday.getFullYear() === year) {
      // 주의 시작일(일요일)과 끝일(토요일) 저장
      const saturday = new Date(date);
      saturday.setDate(saturday.getDate() + 6);
      
      fridays.push({
        friday: new Date(friday),
        sunday: new Date(date),
        saturday: new Date(saturday),
        weekNumber: weekNumber
      });
      weekNumber++;
    }
    
    // 다음 주 일요일로 이동
    date.setDate(date.getDate() + 7);
  }
  
  return fridays;
}

/**
 * 토요일 시작 + 금요일 기준 주차 계산
 * @param {Date|string} inputDate 날짜 (Date 객체 또는 'YYYY-MM-DD' 문자열)
 * @returns {Object} { year, month, week } 또는 null
 */
export function getWeekOfMonthByFriday(inputDate) {
  const date = typeof inputDate === 'string' ? new Date(inputDate) : new Date(inputDate);

  // 해당 주의 금요일 찾기 (일요일 시작 주간 기준)
  const weekFriday = new Date(date);
  const dayOfWeek = date.getDay();

  if (dayOfWeek === 0) {
    // 일요일인 경우: 같은 주의 금요일 (5일 후)
    weekFriday.setDate(date.getDate() + 5);
  } else if (dayOfWeek === 6) {
    // 토요일인 경우: 같은 주의 금요일 (1일 전)
    weekFriday.setDate(date.getDate() - 1);
  } else if (dayOfWeek <= 5) {
    // 월~금요일인 경우: 같은 주의 금요일
    const daysToFriday = 5 - dayOfWeek;
    weekFriday.setDate(date.getDate() + daysToFriday);
  }

  // 금요일이 속한 월이 주차 결정
  const fridayYear = weekFriday.getFullYear();
  const fridayMonth = weekFriday.getMonth() + 1;

  // 해당 월의 금요일들 중에서 몇 번째인지 찾기
  const fridays = getFridaysInMonth(fridayYear, fridayMonth);

  for (const fridayInfo of fridays) {
    // 날짜만 비교 (시간 무시)
    if (weekFriday.getFullYear() === fridayInfo.friday.getFullYear() &&
        weekFriday.getMonth() === fridayInfo.friday.getMonth() &&
        weekFriday.getDate() === fridayInfo.friday.getDate()) {
      return {
        year: fridayYear,
        month: fridayMonth,
        week: fridayInfo.weekNumber
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
 * 금요일 기준으로 계산
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
    const fridays = getFridaysInMonth(currentYear, currentMonth);
    const weeksInMonth = fridays.length;

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
 * 특정 월의 실제 금요일 주차 수 반환
 * @param {number} year 연도
 * @param {number} month 월 (1-12)
 * @returns {number} 금요일 기준 주차 수 (4 또는 5)
 */
export function getWeeksInMonth(year, month) {
  const fridays = getFridaysInMonth(year, month);
  return fridays.length;
}

/**
 * 디버깅용: 특정 월의 주차 정보 출력 (일요일 시작, 금요일 기준)
 * @param {number} year 연도
 * @param {number} month 월
 */
export function debugMonthWeeks(year, month) {
  console.log(`=== ${year}년 ${month}월 주차 정보 (일요일 시작, 금요일 기준) ===`);
  const fridays = getFridaysInMonth(year, month);

  fridays.forEach((fridayInfo) => {
    const { friday, sunday, saturday, weekNumber } = fridayInfo;

    console.log(
      `${month}월 ${weekNumber}주차: ${sunday.getMonth() + 1}/${sunday.getDate()}(일) ~ ${saturday.getMonth() + 1}/${saturday.getDate()}(토) [금요일: ${friday.getMonth() + 1}/${friday.getDate()}]`
    );
  });
}

/**
 * 기간 내 모든 주차 정보 생성
 * @param {number} startYear 시작 연도
 * @param {number} startMonth 시작 월
 * @param {number} endYear 종료 연도
 * @param {number} endMonth 종료 월
 * @returns {Array} [{ year, month, week, weekCount }] 배열
 */
export function getAllWeeksInPeriod(startYear, startMonth, endYear, endMonth) {
  const weeks = [];
  let currentYear = startYear;
  let currentMonth = startMonth;

  while (currentYear < endYear || (currentYear === endYear && currentMonth <= endMonth)) {
    const weekCount = getWeeksInMonth(currentYear, currentMonth);

    for (let week = 1; week <= weekCount; week++) {
      weeks.push({
        year: currentYear,
        month: currentMonth,
        week: week,
        weekCount: weekCount
      });
    }

    currentMonth++;
    if (currentMonth > 12) {
      currentMonth = 1;
      currentYear++;
    }
  }

  return weeks;
}
