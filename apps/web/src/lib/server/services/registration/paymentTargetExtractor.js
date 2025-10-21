/**
 * 지급 대상자 추출 모듈 v7.0
 *
 * 역할: 등록자, 승급자, 추가지급 대상자를 명확하게 추출
 *
 * 핵심 개념:
 * 1. 등록자 (registrants): 이번 달 신규 등록 → 매출 기여 O
 * 2. 승급자 (promoted): 이번 등록으로 등급 상승 → 매출 기여 X
 * 3. 추가지급 대상자 (additionalPayments): 이전 월 미승급자 → 매출 기여 X
 *
 * ⭐ v7.0: 지급 대상자 = 등록자 + 승급자 + 추가지급 대상자 (등급 분포 계산 기준)
 *         매출 기여 = 등록자만
 */

/**
 * 등록자 추출 (신규 등록)
 *
 * @param {Array} users - User 모델 객체 배열
 * @returns {Array} 등록자 목록
 */
export function extractRegistrants(users) {

  const registrants = users.map(user => ({
    userId: user._id.toString(),
    userName: user.name,
    grade: user.grade,
    registrationDate: user.registrationDate || user.createdAt || new Date(),
    type: 'registrant'
  }));

  registrants.forEach(r => {
  });

  return registrants;
}

/**
 * 승급자 추출 (이번 등록으로 승급된 사람들)
 *
 * @param {Array} changedUsers - gradeChangeResult.changedUsers
 * @param {Array} currentBatchUserIds - 현재 등록 배치의 userId 목록 (중복 제외용)
 * @returns {Array} 승급자 목록
 */
export function extractPromoted(changedUsers, currentBatchUserIds = []) {

  const promoted = changedUsers
    .filter(u => {
      // 등급 변경만 필터링
      if (u.changeType !== 'grade_change') return false;
      if (!u.oldGrade || !u.newGrade) return false;
      if (u.oldGrade >= u.newGrade) return false; // 승급만 (하락 제외)

      // 현재 등록 배치에 포함된 경우 제외 (이미 등록자로 카운트됨)
      if (currentBatchUserIds.includes(u.userId)) {
        return false;
      }

      return true;
    })
    .map(u => ({
      userId: u.userId,
      userName: u.userName,
      oldGrade: u.oldGrade,
      newGrade: u.newGrade,
      type: 'promoted'
    }));

  promoted.forEach(p => {
  });

  return promoted;
}

/**
 * 지급 대상자 전체 추출 (등록자 + 승급자)
 *
 * @param {Array} users - 등록된 User 모델 객체 배열
 * @param {Object} gradeChangeResult - 등급 재계산 결과
 * @returns {Object} { registrants, promoted, all }
 */
export function extractPaymentTargets(users, gradeChangeResult) {

  // 1. 등록자 추출
  const registrants = extractRegistrants(users);

  // 2. 승급자 추출 (현재 등록 배치 제외)
  const currentBatchUserIds = users.map(u => u._id.toString());
  const promoted = extractPromoted(
    gradeChangeResult.changedUsers || [],
    currentBatchUserIds
  );

  // 3. 전체 대상자 (등록자 + 승급자)
  const all = [...registrants, ...promoted];


  return {
    registrants,
    promoted,
    all
  };
}

/**
 * 추가지급 대상자 정보 구성 (createMonthlyAdditionalPayments 결과 활용)
 *
 * @param {Object} additionalPaymentsInfo - createMonthlyAdditionalPayments 반환값
 * @returns {Array} 추가지급 대상자 목록
 */
export function extractAdditionalPaymentTargets(additionalPaymentsInfo) {
  if (!additionalPaymentsInfo || !additionalPaymentsInfo.targets) {
    return [];
  }


  const targets = additionalPaymentsInfo.targets.map(t => ({
    userId: t.userId,
    userName: t.userName,
    grade: t.grade,
    추가지급단계: t.추가지급단계,
    revenueMonth: t.revenueMonth,
    type: 'additional'
  }));

  targets.forEach(t => {
  });

  return targets;
}
