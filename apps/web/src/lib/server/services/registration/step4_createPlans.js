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

  // ⭐ 0. 기존 계획 삭제 (revenueMonth 기준 - 기본+추가 모두!)
  const deleteResult = await WeeklyPaymentPlans.deleteMany({
    revenueMonth: registrationMonth
  });

  const { promotedTargets, registrantF1Targets, additionalTargets } = targets;

  const registrantPlans = [];
  const promotionPlans = [];
  const additionalPlans = [];

  // 4-1. 이번 배치 등록자 계획 생성

  // ⭐ monthlyReg.registrations 사용 (users 파라미터 제거)
  for (const registration of monthlyReg.registrations) {
    const userId = registration.userId;
    const userName = registration.userName;
    const registrationDate = registration.registrationDate;

    // 승급 여부 확인
    const promotion = promoted.find(p => p.userId === userId);

    if (promotion) {
      // ⭐ 승급한 경우: newGrade Promotion만 생성 (oldGrade Initial 생성 안 함!)
      // ⭐ 등록일 기준으로 지급 계획 시작 (귀속월에 등록+승급한 경우)

      // newGrade Promotion 계획만 생성
      const promotionPlan = await createPromotionPaymentPlan(
        userId,
        userName,
        promotion.newGrade,
        registrationDate,  // ⭐ 등록일 기준 (등록한 달에 승급)
        monthlyReg
      );
      promotionPlans.push({
        userId,
        type: 'promotion',
        grade: promotion.newGrade,
        plan: promotionPlan._id
      });

      // ⭐ 기존 추가지급 계획 중단 (승급 시)
      // v8.0: 등록일 = 승급일 (등록한 달에 승급한 경우)
      const terminatedCount = await terminateAdditionalPaymentPlans(userId, registrationDate);
      if (terminatedCount > 0) {
      }

    } else {
      // 미승급 경우: 현재 등급으로 Initial 계획 생성

      // ⭐ User 모델에서 실제 등급 확인
      const user = await User.findById(userId);
      const currentGrade = user?.grade || 'F1';

      const initialPlan = await createInitialPaymentPlan(
        userId,
        userName,
        currentGrade,  // ⭐ 실제 등급 사용
        registrationDate
      );
      registrantPlans.push({
        userId,
        type: 'initial',
        grade: currentGrade,  // ⭐ 실제 등급 사용
        plan: initialPlan._id
      });
    }
  }

  // 4-2. 기존 사용자 중 승급자 계획 생성

  const currentBatchIds = monthlyReg.registrations.map(r => r.userId);
  const existingPromoted = promotedTargets.filter(p => !currentBatchIds.includes(p.userId));

  if (existingPromoted.length > 0) {

    for (const prom of existingPromoted) {
      const user = await User.findById(prom.userId);
      if (!user) {
        continue;
      }

      // ⭐ v8.0: 이미 해당 등급의 promotion 계획이 있으면 스킵 (중복 방지)
      const existingPlan = await WeeklyPaymentPlans.findOne({
        userId: prom.userId,
        baseGrade: prom.grade,
        planType: 'promotion'
      });
      if (existingPlan) {
        console.log(`[기존 승급자] ${prom.userName}: ${prom.grade} promotion 계획 이미 존재 → 스킵`);
        continue;
      }

      // ⭐ v8.0: 승급일 = User.lastGradeChangeDate 사용 (정확한 승급일)
      const promotionDate = user.lastGradeChangeDate || new Date();

      console.log(`[기존 승급자] ${prom.userName}: 승급일 = ${promotionDate.toISOString().split('T')[0]}`);

      // newGrade Promotion 계획 생성
      const promotionPlan = await createPromotionPaymentPlan(
        prom.userId,
        prom.userName,
        prom.grade,
        promotionDate,  // ⭐ 첫 승급일 기준
        monthlyReg
      );
      promotionPlans.push({
        userId: prom.userId,
        type: 'promotion',
        grade: prom.grade,
        plan: promotionPlan._id
      });

      // 기존 추가지급 계획 중단
      // v8.0: promotionDate 사용 (승급 다음달 첫 금요일부터 중단)
      const terminatedCount = await terminateAdditionalPaymentPlans(prom.userId, promotionDate);
      if (terminatedCount > 0) {
      }
    }
  } else {
  }

  // 4-3. 추가지급 대상자 계획 생성

  if (additionalTargets.length > 0) {

    for (const target of additionalTargets) {

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
      } else {
      }
    }
  } else {
  }


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
    console.log(`[createAdditionalPaymentPlan] ${userName} - grade:${grade}, 단계:${추가지급단계}, 매출월:${revenueMonth}`);

    // 1. 지급액 계산 (10분할)
    const baseAmount = gradePayments[grade] || 0;
    if (baseAmount === 0) {
      console.log(`[createAdditionalPaymentPlan] ${userName} - baseAmount가 0이라 계획 생성 안 함`);
      return null;
    }

    const installmentAmount = Math.floor(baseAmount / 10 / 100) * 100;  // 100원 단위 절삭
    const withholdingTax = Math.round(installmentAmount * 0.033);
    const netAmount = installmentAmount - withholdingTax;


    // 2. 이전 계획 조회 (v8.0: additionalPaymentBaseDate 참조용)
    const previousPlans = await WeeklyPaymentPlans.find({
      userId: userId,
      baseGrade: grade
    }).sort({ 추가지급단계: -1 });

    const latestPlan = previousPlans[0];

    // 3. v8.0: 지급 시작일 계산
    // - 추가1차 (단계=1): 등록/승급일 + 2개월 후 첫 금요일
    // - 추가2차+ (단계>=2): 이전 추가지급 시작일 + 1개월 후 첫 금요일
    let firstPaymentDate;
    let additionalPaymentBaseDate;

    if (추가지급단계 === 1) {
      // 추가1차: 등록/승급일 + 2개월 후 첫 금요일
      // ⭐ v8.0 마이그레이션: additionalPaymentBaseDate가 없으면 startDate에서 역계산
      if (latestPlan?.additionalPaymentBaseDate) {
        additionalPaymentBaseDate = latestPlan.additionalPaymentBaseDate;
      } else if (latestPlan?.startDate) {
        // startDate = baseDate + 1개월 → 첫 금요일
        // 역계산: startDate에서 약 1개월 전으로 추정
        const estimatedBaseDate = new Date(latestPlan.startDate);
        estimatedBaseDate.setMonth(estimatedBaseDate.getMonth() - 1);
        additionalPaymentBaseDate = estimatedBaseDate;
        console.log(`[createAdditionalPaymentPlan] additionalPaymentBaseDate 역계산: startDate=${latestPlan.startDate.toISOString().split('T')[0]} → baseDate=${estimatedBaseDate.toISOString().split('T')[0]}`);
      } else {
        additionalPaymentBaseDate = new Date();
        console.warn(`[createAdditionalPaymentPlan] ${userName} - 기준일 없음, 오늘 날짜 사용`);
      }
      const baseDate = new Date(additionalPaymentBaseDate);
      baseDate.setMonth(baseDate.getMonth() + 2);
      firstPaymentDate = WeeklyPaymentPlans.getNextFriday(baseDate);
      console.log(`[createAdditionalPaymentPlan] 추가1차: 기준일=${new Date(additionalPaymentBaseDate).toISOString().split('T')[0]}, +2개월 후 시작=${firstPaymentDate.toISOString().split('T')[0]}`);
    } else {
      // 추가2차+: 이전 추가지급 시작일 + 1개월 후 첫 금요일
      additionalPaymentBaseDate = latestPlan?.startDate || new Date();
      const baseDate = new Date(additionalPaymentBaseDate);
      baseDate.setMonth(baseDate.getMonth() + 1);
      firstPaymentDate = WeeklyPaymentPlans.getNextFriday(baseDate);
      console.log(`[createAdditionalPaymentPlan] 추가${추가지급단계}차: 이전 시작일=${additionalPaymentBaseDate.toISOString().split('T')[0]}, +1개월 후 시작=${firstPaymentDate.toISOString().split('T')[0]}`);
    }


    // 4. 10회 installments 생성
    const installments = [];
    for (let i = 0; i < 10; i++) {
      const paymentDate = new Date(firstPaymentDate);
      // ⭐ UTC 메소드 사용 (타임존 문제 방지)
      paymentDate.setUTCDate(paymentDate.getUTCDate() + (i * 7));  // 매주 금요일

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

    // 5. 계획 생성 (v8.0: additionalPaymentBaseDate 포함)
    const newPlan = new WeeklyPaymentPlans({
      userId: userId,
      userName: userName,
      planType: latestPlan?.planType || 'initial',  // 이전 계획 타입 유지
      generation: (latestPlan?.generation || 0) + 1,
      installmentType: 'additional',  // ⭐ 추가지급
      추가지급단계: 추가지급단계,  // ⭐ Step 3에서 계산된 값 사용
      baseGrade: grade,
      revenueMonth: revenueMonth,
      additionalPaymentBaseDate: additionalPaymentBaseDate,  // v8.0: 위에서 계산된 값 사용
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

    console.log(`[createAdditionalPaymentPlan] ${userName} - 계획 생성 완료`);
    return newPlan;

  } catch (error) {
    console.error(`[createAdditionalPaymentPlan] ${userName} - 오류:`, error);
    return null;
  }
}

/**
 * v8.0: 승급 시 추가지급 계획 중단
 * ⭐ 중단 시점: 승급 지급 시작일 (승급 다음달 첫 금요일)부터
 *
 * @param {string} userId - 사용자 ID
 * @param {Date} promotionDate - 승급일
 * @returns {Promise<number>} 중단된 계획 수
 */
async function terminateAdditionalPaymentPlans(userId, promotionDate) {
  try {
    // ⭐ v8.0: 승급 지급 시작일 계산 (승급 다음달 첫 금요일)
    const stopDate = WeeklyPaymentPlans.getPaymentStartDate(promotionDate);

    console.log(`[terminateAdditionalPaymentPlans] ${userId} 승급일: ${promotionDate}, 중단 시작일: ${stopDate}`);

    // 모든 active 추가지급 계획 조회
    const plans = await WeeklyPaymentPlans.find({
      userId: userId,
      planStatus: 'active',
      installmentType: 'additional'
    });

    let terminatedCount = 0;

    for (const plan of plans) {
      let hasCanceled = false;

      // 각 installment 확인 - 승급 지급 시작일 이후만 canceled로 변경
      for (const inst of plan.installments) {
        const instDate = new Date(inst.scheduledDate);

        // ⭐ v8.0: 승급 지급 시작일 이후만 중단
        if (instDate >= stopDate && inst.status === 'pending') {
          inst.status = 'terminated';
          inst.terminatedReason = 'promotion';
          hasCanceled = true;
        }
      }

      if (hasCanceled) {
        // 남은 pending 확인
        const remainingPending = plan.installments.filter(i => i.status === 'pending').length;

        // ⭐ updateOne 사용 (Mongoose validation 우회)
        const updateFields = {
          installments: plan.installments,
          terminatedAt: stopDate,
          terminationReason: 'promotion'
        };

        if (remainingPending === 0) {
          updateFields.planStatus = 'terminated';
          updateFields.terminatedBy = 'promotion_additional_stop';
        }

        await WeeklyPaymentPlans.updateOne(
          { _id: plan._id },
          { $set: updateFields },
          { strict: false }
        );
        terminatedCount++;

        console.log(`[terminateAdditionalPaymentPlans] ${userId} ${plan.baseGrade} ${plan.추가지급단계}단계 중단`);
      }
    }

    return terminatedCount;

  } catch (error) {
    console.error(`[terminateAdditionalPaymentPlans] ${userId} 오류:`, error);
    return 0;
  }
}
