/**
 * Step 4: 지급 계획 생성 (3가지 유형)
 *
 * 역할:
 * 1. 이번 배치 등록자 계획 생성
 *    - 미승급자: F1 Initial 계획 (10회)
 *    - 승급자: oldGrade Initial + newGrade Promotion
 * 2. 기존 사용자 중 승급자 계획 생성
 *    - newGrade Promotion 계획 (10회)
 *    - 기존 추가지급 계획 중단
 * 3. 추가지급 대상자 계획 생성
 *    - Additional 계획 (10회)
 */

import User from '../../models/User.js';
import WeeklyPaymentPlans from '../../models/WeeklyPaymentPlans.js';
import { createInitialPaymentPlan, createPromotionPaymentPlan } from '../paymentPlanService.js';
import { calculateNextFriday } from '../../utils/dateUtils.js';

/**
 * Step 4 실행
 *
 * @param {Array} promoted - Step 2에서 추출한 승급자 배열
 * @param {Object} targets - Step 3 결과 (promotedTargets, registrantF1Targets, additionalTargets)
 * @param {Object} gradePayments - Step 3에서 계산한 등급별 지급액
 * @param {Object} monthlyReg - Step 2에서 업데이트한 MonthlyRegistrations
 * @param {string} registrationMonth - 귀속월
 * @returns {Promise<Object>}
 */
export async function executeStep4(promoted, targets, gradePayments, monthlyReg, registrationMonth) {
  console.log('\n[Step 4] 지급 계획 생성 (3가지 유형)');
  console.log('='.repeat(80));

  // ⭐ 0. 기존 계획 삭제 (revenueMonth 기준 - 기본+추가 모두!)
  console.log('\n  [4-0. 기존 계획 삭제]');
  const deleteResult = await WeeklyPaymentPlans.deleteMany({
    revenueMonth: registrationMonth
  });
  console.log(`  ✓ ${registrationMonth} 계획 ${deleteResult.deletedCount}건 삭제 (기본+추가 모두)`);

  const { promotedTargets, registrantF1Targets, additionalTargets } = targets;

  const registrantPlans = [];
  const promotionPlans = [];
  const additionalPlans = [];

  // 4-1. 이번 배치 등록자 계획 생성
  console.log('\n  [4-1. 이번 배치 등록자 계획 생성]');

  // ⭐ monthlyReg.registrations 사용 (users 파라미터 제거)
  for (const registration of monthlyReg.registrations) {
    const userId = registration.userId;
    const userName = registration.userName;
    const registrationDate = registration.registrationDate;

    // 승급 여부 확인
    const promotion = promoted.find(p => p.userId === userId);

    if (promotion) {
      // ⭐ 승급한 경우: newGrade Promotion만 생성 (oldGrade Initial 생성 안 함!)
      console.log(`  ${userName}: 등록과 동시 승급 (${promotion.oldGrade} → ${promotion.newGrade})`);
      console.log(`    → ${promotion.oldGrade} Initial 생성 안 함, ${promotion.newGrade} Promotion만 생성`);

      // newGrade Promotion 계획만 생성
      const promotionPlan = await createPromotionPaymentPlan(
        userId,
        userName,
        promotion.newGrade,
        registrationDate,
        monthlyReg
      );
      promotionPlans.push({
        userId,
        type: 'promotion',
        grade: promotion.newGrade,
        plan: promotionPlan._id
      });
      console.log(`    ✓ Promotion 계획 생성 (${promotion.newGrade}): ${promotionPlan._id}`);

      // ⭐ 기존 추가지급 계획 중단 (승급 시)
      const terminatedCount = await terminateAdditionalPaymentPlans(userId, registrationMonth);
      if (terminatedCount > 0) {
        console.log(`    ✓ 기존 추가지급 계획 중단: ${terminatedCount}건`);
      }

    } else {
      // 미승급 경우: F1 Initial 계획만
      console.log(`  ${userName}: 미승급 (F1)`);

      const initialPlan = await createInitialPaymentPlan(
        userId,
        userName,
        'F1',
        registrationDate
      );
      registrantPlans.push({
        userId,
        type: 'initial',
        grade: 'F1',
        plan: initialPlan._id
      });
      console.log(`    ✓ Initial 계획 생성 (F1): ${initialPlan._id}`);
    }
  }

  // 4-2. 기존 사용자 중 승급자 계획 생성
  console.log('\n  [4-2. 기존 사용자 중 승급자 계획 생성]');

  const currentBatchIds = monthlyReg.registrations.map(r => r.userId);
  const existingPromoted = promotedTargets.filter(p => !currentBatchIds.includes(p.userId));

  if (existingPromoted.length > 0) {
    console.log(`  기존 사용자 승급: ${existingPromoted.length}명`);

    for (const prom of existingPromoted) {
      const user = await User.findOne({ loginId: prom.userId });
      if (!user) {
        console.log(`    ⚠️ 사용자를 찾을 수 없음: ${prom.userId}`);
        continue;
      }

      console.log(`  ${prom.userName}: ${prom.oldGrade} → ${prom.grade}`);

      // ⭐ 승급일 = registrationMonth의 첫날 (매출 귀속 월과 동일)
      const [year, month] = registrationMonth.split('-').map(Number);
      const promotionDate = new Date(year, month - 1, 1);  // 월은 0-based

      // newGrade Promotion 계획 생성
      const promotionPlan = await createPromotionPaymentPlan(
        prom.userId,
        prom.userName,
        prom.grade,
        promotionDate,  // ⭐ registrationMonth 첫날
        monthlyReg
      );
      promotionPlans.push({
        userId: prom.userId,
        type: 'promotion',
        grade: prom.grade,
        plan: promotionPlan._id
      });
      console.log(`    ✓ Promotion 계획 생성 (${prom.grade}): ${promotionPlan._id}`);

      // 기존 추가지급 계획 중단
      const terminatedCount = await terminateAdditionalPaymentPlans(prom.userId, registrationMonth);
      if (terminatedCount > 0) {
        console.log(`    ✓ 추가지급 계획 중단: ${terminatedCount}건`);
      }
    }
  } else {
    console.log(`  기존 사용자 승급 없음`);
  }

  // 4-3. 추가지급 대상자 계획 생성
  console.log('\n  [4-3. 추가지급 대상자 계획 생성]');

  if (additionalTargets.length > 0) {
    console.log(`  추가지급 대상자: ${additionalTargets.length}명`);

    for (const target of additionalTargets) {
      console.log(`  ${target.userName} (${target.grade}) - ${target.추가지급단계}차`);

      const additionalPlan = await createAdditionalPaymentPlan(
        target.userId,
        target.userName,
        target.grade,
        target.추가지급단계,  // ⭐ Step 3에서 계산된 값
        registrationMonth,
        gradePayments
      );

      if (additionalPlan) {
        additionalPlans.push({
          userId: target.userId,
          type: 'additional',
          grade: target.grade,
          추가지급단계: target.추가지급단계,
          plan: additionalPlan._id
        });
        console.log(`    ✓ Additional 계획 생성: ${additionalPlan._id}`);
      } else {
        console.log(`    ⚠️ Additional 계획 생성 실패`);
      }
    }
  } else {
    console.log(`  추가지급 대상자 없음`);
  }

  console.log('='.repeat(80));

  return {
    registrantPlans,
    promotionPlans,
    additionalPlans
  };
}

/**
 * 추가지급 계획 생성
 *
 * @param {string} userId
 * @param {string} userName
 * @param {string} grade
 * @param {number} 추가지급단계 - Step 3에서 계산된 값 (1, 2, 3, ...)
 * @param {string} revenueMonth - 매출 귀속 월 (YYYY-MM) - 현재 월!
 * @param {Object} gradePayments - 등급별 지급액 (현재 월 기준)
 * @returns {Promise<Object|null>}
 */
async function createAdditionalPaymentPlan(userId, userName, grade, 추가지급단계, revenueMonth, gradePayments) {
  try {
    // 1. 지급액 계산 (10분할)
    const baseAmount = gradePayments[grade] || 0;
    if (baseAmount === 0) {
      console.log(`    ⚠️ 지급액이 0원 - 계획 생성 건너뜀`);
      return null;
    }

    const installmentAmount = Math.floor(baseAmount / 10 / 100) * 100;  // 100원 단위 절삭
    const withholdingTax = Math.round(installmentAmount * 0.033);
    const netAmount = installmentAmount - withholdingTax;

    console.log(`    지급액: ${installmentAmount.toLocaleString()}원/회`);

    // 2. 지급 시작일 = 다음 달 첫 금요일
    const [year, month] = revenueMonth.split('-').map(Number);
    const nextMonthStart = new Date(year, month, 1);  // 다음 달 1일
    const firstPaymentDate = calculateNextFriday(nextMonthStart);

    console.log(`    시작일: ${firstPaymentDate.toISOString().split('T')[0]}`);

    // 3. 10회 installments 생성
    const installments = [];
    for (let i = 0; i < 10; i++) {
      const paymentDate = new Date(firstPaymentDate);
      paymentDate.setDate(paymentDate.getDate() + (i * 7));  // 매주 금요일

      installments.push({
        week: i + 1,
        weekNumber: WeeklyPaymentPlans.getISOWeek(paymentDate),
        scheduledDate: paymentDate,
        revenueMonth: revenueMonth,
        gradeAtPayment: null,
        baseAmount: baseAmount,
        installmentAmount: installmentAmount,
        withholdingTax: withholdingTax,
        netAmount: netAmount,
        status: 'pending'
      });
    }

    // 4. 이전 계획 조회 (parentPlanId용)
    const previousPlans = await WeeklyPaymentPlans.find({
      userId: userId,
      baseGrade: grade
    }).sort({ 추가지급단계: -1 });

    const latestPlan = previousPlans[0];

    // 5. 계획 생성
    const newPlan = new WeeklyPaymentPlans({
      userId: userId,
      userName: userName,
      planType: latestPlan?.planType || 'initial',  // 이전 계획 타입 유지
      generation: (latestPlan?.generation || 0) + 1,
      installmentType: 'additional',  // ⭐ 추가지급
      추가지급단계: 추가지급단계,  // ⭐ Step 3에서 계산된 값 사용
      baseGrade: grade,
      revenueMonth: revenueMonth,
      startDate: firstPaymentDate,
      totalInstallments: 10,
      completedInstallments: 0,
      planStatus: 'active',
      installments: installments,
      parentPlanId: latestPlan?._id || null,
      createdBy: 'monthly_check',
      createdAt: new Date()
    });

    await newPlan.save();

    return newPlan;

  } catch (error) {
    console.error(`추가지급 계획 생성 실패 (${userId}):`, error);
    return null;
  }
}

/**
 * 승급 시 추가지급 계획 중단
 *
 * @param {string} userId - 사용자 ID
 * @param {string} registrationMonth - 승급 월 (YYYY-MM)
 * @returns {Promise<number>} 중단된 계획 수
 */
async function terminateAdditionalPaymentPlans(userId, registrationMonth) {
  try {
    console.log(`\n[v7.0 추가지급중단] ${userId} 승급으로 인한 추가지급 중단 시작`);
    console.log(`  승급 월: ${registrationMonth}`);

    // 승급 다음 달 계산 (예: 9월 승급 → 10월부터 중단)
    const [year, month] = registrationMonth.split('-').map(Number);
    const stopDate = new Date(Date.UTC(year, month, 1));  // ⭐ UTC 기준 다음 달 1일
    console.log(`  중단 시작일: ${stopDate.toISOString().split('T')[0]} (${registrationMonth} 다음 달)`);

    // 모든 active 추가지급 계획 조회
    const plans = await WeeklyPaymentPlans.find({
      userId: userId,
      planStatus: 'active',
      installmentType: 'additional'
    });

    console.log(`  대상 계획: ${plans.length}개`);

    let terminatedCount = 0;

    for (const plan of plans) {
      console.log(`\n  [계획 ${plan._id}]`);
      console.log(`    매출월: ${plan.revenueMonth}`);
      console.log(`    추가지급단계: ${plan.추가지급단계}`);

      let hasCanceled = false;
      let hasActive = false;

      // 각 installment 확인
      for (const inst of plan.installments) {
        const instDate = new Date(inst.scheduledDate);

        // 승급 다음 달 이후 installments만 canceled로 변경
        if (instDate >= stopDate && inst.status === 'pending') {
          inst.status = 'canceled';
          hasCanceled = true;
        } else if (inst.status === 'pending') {
          hasActive = true;
        }
      }

      if (hasCanceled) {
        // 모든 installments가 canceled이거나 paid면 terminated
        const allDone = plan.installments.every(i =>
          i.status === 'canceled' || i.status === 'paid'
        );

        // ⭐ updateOne 사용 (Mongoose validation 우회)
        const updateFields = {
          installments: plan.installments
        };

        if (allDone) {
          updateFields.planStatus = 'terminated';
          updateFields.terminatedBy = 'promotion_additional_stop';
          updateFields.terminatedAt = new Date();
          console.log(`    ✓ planStatus: terminated (모든 회차 완료)`);
        } else {
          console.log(`    ✓ 일부 회차 canceled (계획은 active 유지)`);
        }

        await WeeklyPaymentPlans.updateOne(
          { _id: plan._id },
          { $set: updateFields },
          { strict: false }  // ⭐ 스키마 validation 우회
        );
        terminatedCount++;

        console.log(`    ✓ ${stopDate.toISOString().split('T')[0]} 이후 회차 canceled`);
      } else {
        console.log(`    - 중단할 회차 없음 (모두 이전 또는 완료됨)`);
      }
    }

    console.log(`\n[v7.0 추가지급중단] 완료: ${terminatedCount}개 계획 수정\n`);

    return terminatedCount;

  } catch (error) {
    console.error(`추가지급 계획 중단 실패 (${userId}):`, error);
    return 0;
  }
}
