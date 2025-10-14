/**
 * Step 3: 지급 대상자 확정 및 등급별 인원 구성
 *
 * 역할:
 * 1. 지급 대상자 3가지 확정:
 *    A. 승급자 (promoted)
 *    B. 미승급 등록자 (등록자 중 승급 안 한 사람)
 *    C. 추가지급 대상자 (조건 확인)
 * 2. 중복 제거 (승급자 우선)
 * 3. 등급별 지급 대상 인원 집계
 * 4. 등급별 1회 지급 금액 산출
 */

import User from '../../models/User.js';
import WeeklyPaymentPlans from '../../models/WeeklyPaymentPlans.js';
import { calculateGradePayments } from '../../utils/paymentCalculator.js';
import { GRADE_LIMITS } from '../../utils/constants.js';

/**
 * Step 3 실행
 *
 * @param {Array} users - 이번 배치 등록자 배열
 * @param {Array} promoted - Step 2에서 추출한 승급자 배열
 * @param {Object} monthlyReg - Step 2에서 업데이트한 MonthlyRegistrations
 * @param {string} registrationMonth - 귀속월 (YYYY-MM)
 * @returns {Promise<Object>}
 */
export async function executeStep3(users, promoted, monthlyReg, registrationMonth) {
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
  const registrantIds = monthlyReg.registrations.map(r => r.userId);
  const promotedIds = promoted.map(p => p.userId);
  const nonPromotedRegistrantIds = registrantIds.filter(id => !promotedIds.includes(id));

  const registrantF1Targets = users
    .filter(u => nonPromotedRegistrantIds.includes(u.loginId))
    .map(u => ({
      userId: u.loginId,
      userName: u.name,
      grade: 'F1',  // ⭐ 미승급 = F1
      type: 'registrant_f1'
    }));
  console.log(`  B. 미승급 등록자 (F1): ${registrantF1Targets.length}명`);

  // C. 추가지급 대상자 (조건 확인)
  console.log(`\n  C. 추가지급 대상자 확인 중...`);
  const additionalTargets = await findAdditionalPaymentTargets(
    registrantIds,
    promotedIds,
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
 * 조건:
 * 1. 전체 사용자 - (이번 달 등록자 + 승급자)
 * 2. 최대 횟수 미도달
 * 3. F3+ 보험 가입
 * 4. 등급 유지 (하락 시 제외)
 *
 * @param {Array} registrantIds - 이번 달 등록자 ID 배열
 * @param {Array} promotedIds - 승급자 ID 배열
 * @param {string} registrationMonth - 귀속월
 * @returns {Promise<Array>}
 */
async function findAdditionalPaymentTargets(registrantIds, promotedIds, registrationMonth) {
  // 제외 대상
  const excludedIds = [...registrantIds, ...promotedIds];

  // 후보자 = 전체 활성 사용자 - 제외 대상
  const candidates = await User.find({
    type: 'user',
    loginId: { $nin: excludedIds }
  });

  console.log(`    후보자: ${candidates.length}명`);

  const additionalTargets = [];

  for (const candidate of candidates) {
    const userId = candidate.loginId;
    const userName = candidate.name;
    const grade = candidate.grade;

    // 조건 1: 최대 횟수 확인
    const maxInstallments = GRADE_LIMITS[grade]?.maxInstallments || 0;
    const completedCount = await WeeklyPaymentPlans.countDocuments({
      userId: userId,
      planStatus: 'completed'
    });

    // 현재 활성 계획의 installments 수 확인
    const activePlans = await WeeklyPaymentPlans.find({
      userId: userId,
      planStatus: 'active'
    });

    let totalInstallments = completedCount * 10;  // 완료된 계획 × 10
    activePlans.forEach(plan => {
      totalInstallments += plan.completedInstallments || 0;
    });

    if (totalInstallments >= maxInstallments) {
      console.log(`    [SKIP] ${userName} (${grade}): 최대 횟수 도달 (${totalInstallments}/${maxInstallments})`);
      continue;
    }

    // 조건 2: F3+ 보험 확인
    if (grade >= 'F3') {
      const insuranceActive = candidate.insuranceSettings?.maintained || false;
      if (!insuranceActive) {
        console.log(`    [SKIP] ${userName} (${grade}): 보험 미가입`);
        continue;
      }
    }

    // 조건 3: 등급 유지 확인 (가장 최근 계획의 등급과 비교)
    const latestPlan = await WeeklyPaymentPlans.findOne({
      userId: userId
    }).sort({ createdAt: -1 });

    if (latestPlan && latestPlan.baseGrade > grade) {
      console.log(`    [SKIP] ${userName} (${grade}): 등급 하락 (${latestPlan.baseGrade} → ${grade})`);
      continue;
    }

    // 조건 4: 이번 달에 이미 추가지급 받았는지 확인 (중복 방지)
    const hasAdditionalThisMonth = await WeeklyPaymentPlans.findOne({
      userId: userId,
      revenueMonth: registrationMonth,
      installmentType: 'additional'
    });

    if (hasAdditionalThisMonth) {
      console.log(`    [SKIP] ${userName} (${grade}): 이번 달 추가지급 이미 생성`);
      continue;
    }

    // ⭐ 모든 조건 통과 → 추가지급 대상자
    console.log(`    ✓ ${userName} (${grade}): 추가지급 대상 (${totalInstallments}/${maxInstallments} 완료)`);

    additionalTargets.push({
      userId: userId,
      userName: userName,
      grade: grade,
      totalInstallments: totalInstallments,
      type: 'additional'
    });
  }

  return additionalTargets;
}
