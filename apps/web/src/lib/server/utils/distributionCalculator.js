/**
 * 등급 분포 계산 유틸리티 v7.0
 *
 * 역할: 등급 분포 계산 및 업데이트 순수 함수
 *
 * ⭐ v7.0 핵심: 지급 대상자 = 등록자 + 승급자 + 추가지급 대상자
 */

/**
 * 빈 등급 분포 객체 생성
 *
 * @returns {Object} { F1: 0, F2: 0, ..., F8: 0 }
 */
export function createEmptyDistribution() {
  return {
    F1: 0, F2: 0, F3: 0, F4: 0,
    F5: 0, F6: 0, F7: 0, F8: 0
  };
}

/**
 * 등록자 기준 등급 분포 계산
 *
 * @param {Array} registrants - 등록자 목록 (grade 속성 필요)
 * @returns {Object} 등급 분포
 */
export function calculateRegistrantDistribution(registrants) {
  const distribution = createEmptyDistribution();

  for (const reg of registrants) {
    if (distribution[reg.grade] !== undefined) {
      distribution[reg.grade]++;
    }
  }

  return distribution;
}

/**
 * 승급자 반영 (승급 전 등급 -1, 승급 후 등급 +1)
 *
 * @param {Object} distribution - 기존 등급 분포
 * @param {Array} promoted - 승급자 목록 (oldGrade, newGrade 속성 필요)
 * @returns {Object} 업데이트된 등급 분포
 */
export function applyPromotedToDistribution(distribution, promoted) {
  const updated = { ...distribution };

  for (const prom of promoted) {
    // 승급 전 등급 감소
    if (updated[prom.oldGrade] !== undefined && updated[prom.oldGrade] > 0) {
      updated[prom.oldGrade]--;
    }

    // 승급 후 등급 증가
    if (updated[prom.newGrade] !== undefined) {
      updated[prom.newGrade]++;
    }

    console.log(`  [승급 반영] ${prom.userName}: ${prom.oldGrade}(-1) → ${prom.newGrade}(+1)`);
  }

  return updated;
}

/**
 * 추가지급 대상자 반영 (등급별 +1)
 *
 * @param {Object} distribution - 기존 등급 분포
 * @param {Array} additionalPayments - 추가지급 대상자 목록 (grade 속성 필요)
 * @returns {Object} 업데이트된 등급 분포
 */
export function applyAdditionalPaymentsToDistribution(distribution, additionalPayments) {
  const updated = { ...distribution };

  for (const additional of additionalPayments) {
    if (updated[additional.grade] !== undefined) {
      updated[additional.grade]++;
      console.log(`  [추가지급 반영] ${additional.userName}: ${additional.grade}(+1)`);
    }
  }

  return updated;
}

/**
 * 전체 지급 대상자 기준 등급 분포 계산
 *
 * @param {Array} registrants - 등록자 목록
 * @param {Array} promoted - 승급자 목록
 * @param {Array} additionalPayments - 추가지급 대상자 목록
 * @returns {Object} 전체 등급 분포
 */
export function calculateTotalDistribution(registrants, promoted, additionalPayments) {
  console.log('\n[distributionCalculator] 전체 등급 분포 계산 시작');

  // 1) 등록자 기준
  let distribution = calculateRegistrantDistribution(registrants);
  console.log(`  [1단계] 등록자만: ${JSON.stringify(distribution)}`);

  // 2) 승급자 반영
  if (promoted && promoted.length > 0) {
    distribution = applyPromotedToDistribution(distribution, promoted);
    console.log(`  [2단계] 승급자 반영: ${JSON.stringify(distribution)}`);
  }

  // 3) 추가지급 대상자 반영
  if (additionalPayments && additionalPayments.length > 0) {
    distribution = applyAdditionalPaymentsToDistribution(distribution, additionalPayments);
    console.log(`  [3단계] 추가지급 반영: ${JSON.stringify(distribution)}`);
  }

  console.log(`  [최종] 전체 분포: ${JSON.stringify(distribution)}`);

  return distribution;
}

/**
 * 등급 분포 검증 (음수 체크)
 *
 * @param {Object} distribution - 등급 분포
 * @returns {boolean} 유효성 여부
 */
export function validateDistribution(distribution) {
  for (const grade in distribution) {
    if (distribution[grade] < 0) {
      console.error(`⚠️ 등급 분포 오류: ${grade} = ${distribution[grade]} (음수 불가)`);
      return false;
    }
  }
  return true;
}

/**
 * 등급 분포 디버그 출력
 *
 * @param {Object} distribution - 등급 분포
 * @param {string} label - 레이블
 */
export function debugDistribution(distribution, label = '등급 분포') {
  console.log(`\n📊 ${label}:`);

  const grades = ['F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8'];
  let total = 0;

  for (const grade of grades) {
    const count = distribution[grade] || 0;
    total += count;
    if (count > 0) {
      console.log(`  ${grade}: ${count}명`);
    }
  }

  console.log(`  합계: ${total}명\n`);
}
