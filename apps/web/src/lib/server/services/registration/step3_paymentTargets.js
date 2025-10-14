/**
 * Step 3: 지급 대상자 확정 및 등급별 인원 구성
 *
 * 역할:
 * 1. 지급 대상자 3가지 확정:
 *    A. 승급자 (promoted)
 *    B. 미승급 등록자 (이번 달 등록자 중 승급 안 한 사람)
 *    C. 추가지급 대상자 (이전 달 대상자 중 이번 달 승급 안 한 사람)
 * 2. 중복 제거 (이미 각 그룹으로 분리됨)
 * 3. 등급별 지급 대상 인원 집계
 * 4. 등급별 1회 지급 금액 산출
 */

import User from '../../models/User.js';
import MonthlyRegistrations from '../../models/MonthlyRegistrations.js';
import WeeklyPaymentPlans from '../../models/WeeklyPaymentPlans.js';
import { calculateGradePayments } from '../../utils/paymentCalculator.js';
import { GRADE_LIMITS } from '../../utils/constants.js';

/**
 * Step 3 실행
 *
 * @param {Array} promoted - Step 2에서 추출한 승급자 배열
 * @param {Object} monthlyReg - Step 2에서 업데이트한 MonthlyRegistrations
 * @param {string} registrationMonth - 귀속월 (YYYY-MM)
 * @returns {Promise<Object>}
 */
export async function executeStep3(promoted, monthlyReg, registrationMonth) {
  console.log('\n[Step 3] 지급 대상자 확정 및 등급별 인원 구성');
  console.log('='.repeat(80));

  // 3-1. 지급 대상자 3가지 확정
  console.log('\n  [3-1. 지급 대상자 확정]');

  // A. 승급자 (전체 승급자)
  const promotedTargets = promoted.map(p => ({
    userId: p.userId,
    userName: p.userName,
    grade: p.newGrade,  // ⭐ 새 등급
    oldGrade: p.oldGrade,
    type: 'promoted'
  }));
  console.log(`  A. 승급자: ${promotedTargets.length}명`);

  // B. 미승급 등록자 (이번 달 등록자 중 승급 안 한 사람)
  // ⭐ monthlyReg.registrations에서 직접 가져오기
  const promotedIds = promoted.map(p => p.userId);
  const registrantF1Targets = monthlyReg.registrations
    .filter(r => !promotedIds.includes(r.userId))  // 승급 안 한 사람
    .map(r => ({
      userId: r.userId,
      userName: r.userName,
      grade: r.grade,  // ⭐ monthlyReg에 이미 저장된 등급 사용
      type: 'registrant_f1'
    }));
  console.log(`  B. 미승급 등록자: ${registrantF1Targets.length}명`);

  // C. 추가지급 대상자 (이전 달 대상자 중 이번 달 승급 안 한 사람)
  console.log(`\n  C. 추가지급 대상자 확인 중...`);
  const additionalTargets = await findAdditionalPaymentTargets(
    promoted,
    registrationMonth
  );
  console.log(`  C. 추가지급 대상자: ${additionalTargets.length}명`);

  // 3-2. 중복 제거 (승급자 우선 - 이미 분리되어 있으므로 생략)
  console.log(`\n  [3-2. 중복 제거]`);
  console.log(`  - 승급자 우선 원칙 적용 완료`);
  console.log(`  - 등록자 중 승급한 사람은 승급자로만 카운트`);

  // 3-3. 등급별 지급 대상 인원 집계
  console.log(`\n  [3-3. 등급별 인원 집계]`);
  const gradeDistribution = {
    F1: 0, F2: 0, F3: 0, F4: 0,
    F5: 0, F6: 0, F7: 0, F8: 0
  };

  // 승급자
  promotedTargets.forEach(t => {
    if (gradeDistribution[t.grade] !== undefined) {
      gradeDistribution[t.grade]++;
    }
  });

  // 미승급 등록자
  registrantF1Targets.forEach(t => {
    gradeDistribution.F1++;
  });

  // 추가지급 대상자
  additionalTargets.forEach(t => {
    if (gradeDistribution[t.grade] !== undefined) {
      gradeDistribution[t.grade]++;
    }
  });

  console.log(`  등급별 인원: ${JSON.stringify(gradeDistribution)}`);

  // 3-4. 등급별 1회 지급 금액 산출
  console.log(`\n  [3-4. 등급별 지급 금액 산출]`);
  const revenue = monthlyReg.getEffectiveRevenue();
  const gradePayments = calculateGradePayments(revenue, gradeDistribution);

  console.log(`  매출: ${revenue.toLocaleString()}원`);
  console.log(`  등급별 지급액:`);
  Object.entries(gradePayments).forEach(([grade, amount]) => {
    if (amount > 0) {
      console.log(`    - ${grade}: ${amount.toLocaleString()}원/회`);
    }
  });

  // D. ⭐ MonthlyRegistrations.paymentTargets 저장 (다음 달을 위해!)
  console.log('\n  [D. MonthlyRegistrations.paymentTargets 저장]');

  // 등록자 저장 (미승급자만)
  monthlyReg.paymentTargets.registrants = registrantF1Targets.map(t => ({
    userId: t.userId,
    userName: t.userName,
    grade: t.grade
  }));

  // 승급자 저장
  monthlyReg.paymentTargets.promoted = promotedTargets.map(t => ({
    userId: t.userId,
    userName: t.userName,
    oldGrade: t.oldGrade,
    newGrade: t.grade,
    promotionDate: new Date()
  }));

  // 추가지급 대상자 저장 ⭐ 핵심!
  monthlyReg.paymentTargets.additionalPayments = additionalTargets.map(t => ({
    userId: t.userId,
    userName: t.userName,
    grade: t.grade,
    추가지급단계: t.추가지급단계 || 1  // findAdditionalPaymentTargets에서 계산됨
  }));

  // E. 등급별 구성 저장
  monthlyReg.gradeDistribution = gradeDistribution;

  await monthlyReg.save();

  console.log(`  ✓ registrants: ${monthlyReg.paymentTargets.registrants.length}명`);
  console.log(`  ✓ promoted: ${monthlyReg.paymentTargets.promoted.length}명`);
  console.log(`  ✓ additionalPayments: ${monthlyReg.paymentTargets.additionalPayments.length}명`);
  console.log(`  ✓ gradeDistribution 저장 완료`);

  console.log('='.repeat(80));

  return {
    promotedTargets,
    registrantF1Targets,
    additionalTargets,
    gradeDistribution,
    gradePayments
  };
}

/**
 * 추가지급 대상자 찾기
 *
 * ⭐ 핵심 로직:
 * 1. 등급별로 확인해야 할 이전 달 개수 계산
 *    - F1: 1개월 (기본 10 + 추가 10 = 20회)
 *    - F2: 2개월 (기본 10 + 추가 20 = 30회)
 *    - F3-F4: 3개월 (기본 10 + 추가 30 = 40회)
 *    - F5-F6: 4개월 (기본 10 + 추가 40 = 50회)
 *    - F7-F8: 5개월 (기본 10 + 추가 50 = 60회)
 *
 * 2. 각 이전 달의 대상자 중 이번 달 미승급자 찾기 (3가지 소스)
 *    A. 등록자 (최초 추가지급)
 *    B. 승급자 (최초 추가지급)
 *    C. 추가지급 대상자 (지속적인 추가지급) ⭐ 핵심!
 *
 * 3. 조건 확인:
 *    - 최대 횟수 미도달
 *    - F3+ 보험 가입
 *    - 등급 유지 (하락 시 제외)
 *    - 이번 달 추가지급 미생성
 *
 * ⭐ 중요: 추가지급의 revenueMonth는 현재 월!
 *   예: 7월 등록 → 8월 미승급 → 8월 매출분 추가지급 생성
 *       8월 추가지급 → 9월 미승급 → 9월 매출분 추가지급 생성
 *
 * @param {Array} promoted - 이번 달 승급자 배열
 * @param {string} registrationMonth - 현재 귀속월 (YYYY-MM)
 * @returns {Promise<Array>}
 */
async function findAdditionalPaymentTargets(promoted, registrationMonth) {
  console.log(`    현재 월: ${registrationMonth}`);

  // 1. 등급별 확인해야 할 이전 달 개수
  const maxPreviousMonths = {
    F1: 1,  // 20회 = 기본 10 + 추가 10 (1차)
    F2: 2,  // 30회 = 기본 10 + 추가 20 (2차)
    F3: 3,  // 40회 = 기본 10 + 추가 30 (3차)
    F4: 3,
    F5: 4,  // 50회 = 기본 10 + 추가 40 (4차)
    F6: 4,
    F7: 5,  // 60회 = 기본 10 + 추가 50 (5차)
    F8: 5
  };

  const additionalTargets = [];
  const currentPromotedIds = promoted.map(p => p.userId);
  const processedUsers = new Set();  // 중복 방지

  // 2. 각 등급별로 필요한 만큼 이전 달 확인
  for (const [grade, months] of Object.entries(maxPreviousMonths)) {
    console.log(`\n    [${grade}] 최대 ${months}개월 이전까지 확인`);

    for (let i = 1; i <= months; i++) {
      const targetMonth = getMonthOffset(registrationMonth, -i);
      console.log(`      ${targetMonth} 확인 중...`);

      // 해당 월 MonthlyRegistrations 조회
      const monthlyReg = await MonthlyRegistrations.findOne({
        monthKey: targetMonth
      });

      if (!monthlyReg) {
        console.log(`        데이터 없음`);
        continue;
      }

      // ⭐ 해당 월 전체 대상자 (3가지 소스)
      const prevTargets = [
        // 1. 등록자
        ...monthlyReg.registrations,

        // 2. 승급자
        ...(monthlyReg.paymentTargets?.promoted || []).map(p => ({
          userId: p.userId,
          userName: p.userName,
          grade: p.newGrade  // 승급 후 등급
        })),

        // 3. 추가지급 대상자 ⭐ 핵심!
        ...(monthlyReg.paymentTargets?.additionalPayments || []).map(a => ({
          userId: a.userId,
          userName: a.userName,
          grade: a.grade
        }))
      ];

      // 해당 등급만 필터링 + 이번 달 미승급자 + 미처리
      const candidates = prevTargets
        .filter(t => (t.grade === grade || t.newGrade === grade))
        .filter(t => !currentPromotedIds.includes(t.userId))
        .filter(t => !processedUsers.has(t.userId));

      console.log(`        후보자: ${candidates.length}명`);

      // 3. 각 후보자별 조건 확인
      for (const candidate of candidates) {
        const target = await checkAdditionalPaymentConditions(
          candidate.userId,
          grade,
          registrationMonth,  // ⭐ 현재 월 매출분!
          i  // ⭐ 추가지급단계 (1, 2, 3, ...)
        );

        if (target) {
          additionalTargets.push(target);
          processedUsers.add(candidate.userId);  // 중복 방지
        }
      }
    }
  }

  console.log(`\n    총 추가지급 대상자: ${additionalTargets.length}명`);
  return additionalTargets;
}

/**
 * 추가지급 조건 확인
 *
 * @param {string} userId
 * @param {string} grade
 * @param {string} revenueMonth - 매출 귀속 월 (현재 월)
 * @param {number} 추가지급단계 - 1차, 2차, 3차, ...
 * @returns {Promise<Object|null>}
 */
async function checkAdditionalPaymentConditions(userId, grade, revenueMonth, 추가지급단계) {
  // User 모델에서 최신 정보 조회
  const user = await User.findOne({ loginId: userId });
  if (!user) {
    console.log(`        [SKIP] ${userId}: 사용자 정보 없음`);
    return null;
  }

  const userName = user.name;
  const currentGrade = user.grade;

  // 조건 1: 등급 유지 확인
  if (currentGrade !== grade) {
    console.log(`        [SKIP] ${userName}: 등급 변경 (${grade} → ${currentGrade})`);
    return null;
  }

  // 조건 2: 최대 횟수 확인
  const maxInstallments = GRADE_LIMITS[grade]?.maxInstallments || 0;
  const completedCount = await WeeklyPaymentPlans.countDocuments({
    userId: userId,
    planStatus: 'completed'
  });

  const activePlans = await WeeklyPaymentPlans.find({
    userId: userId,
    planStatus: 'active'
  });

  let totalInstallments = completedCount * 10;
  activePlans.forEach(plan => {
    totalInstallments += plan.completedInstallments || 0;
  });

  if (totalInstallments >= maxInstallments) {
    console.log(`        [SKIP] ${userName} (${grade}): 최대 횟수 도달 (${totalInstallments}/${maxInstallments})`);
    return null;
  }

  // 조건 3: F3+ 보험 확인
  if (grade >= 'F3') {
    const insuranceActive = user.insuranceSettings?.maintained || false;
    if (!insuranceActive) {
      console.log(`        [SKIP] ${userName} (${grade}): 보험 미가입`);
      return null;
    }
  }

  // 조건 4: 이번 달 추가지급 미생성 확인
  const hasAdditionalThisMonth = await WeeklyPaymentPlans.findOne({
    userId: userId,
    revenueMonth: revenueMonth,
    installmentType: 'additional'
  });

  if (hasAdditionalThisMonth) {
    console.log(`        [SKIP] ${userName} (${grade}): 이번 달 추가지급 이미 생성`);
    return null;
  }

  // ⭐ 모든 조건 통과
  console.log(`        ✓ ${userName} (${grade}): 추가지급 대상 (${totalInstallments}/${maxInstallments}) - ${추가지급단계}차`);

  return {
    userId: userId,
    userName: userName,
    grade: grade,
    추가지급단계: 추가지급단계,  // ⭐ 추가!
    totalInstallments: totalInstallments,
    type: 'additional'
  };
}

/**
 * 월 오프셋 계산 (YYYY-MM 형식)
 *
 * @param {string} monthKey - 기준 월 (YYYY-MM)
 * @param {number} offset - 오프셋 (-1: 이전 달, +1: 다음 달)
 * @returns {string} 계산된 월 (YYYY-MM)
 */
function getMonthOffset(monthKey, offset) {
  const [year, month] = monthKey.split('-').map(Number);
  const date = new Date(year, month - 1, 1);  // month는 0-based
  date.setMonth(date.getMonth() + offset);

  const resultYear = date.getFullYear();
  const resultMonth = String(date.getMonth() + 1).padStart(2, '0');

  return `${resultYear}-${resultMonth}`;
}
