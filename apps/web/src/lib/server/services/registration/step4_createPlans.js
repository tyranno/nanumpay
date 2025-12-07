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

  // ⭐ v8.0: 기존 계획 삭제하지 않음 (중복 체크로 대체)
  // - 이미 계획이 있는 사용자는 스킵
  // - 금액 재계산이 필요한 경우 별도 처리

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

    // ⭐ v8.0 FIX: gradeHistory에서 이번 달(registrationMonth) 기록만 확인
    const user = await User.findById(userId);

    // ⭐ 이번 달 등록 기록 확인
    const registrationHistory = user?.gradeHistory?.find(h =>
      h.type === 'registration' && h.revenueMonth === registrationMonth
    );

    // ⭐ 이번 달 승급 기록 확인 (gradeHistory 기반)
    const promotionHistory = user?.gradeHistory?.find(h =>
      h.type === 'promotion' && h.revenueMonth === registrationMonth
    );

    // ⭐ v8.0 FIX: 이번 달에 등록 기록이 없으면 스킵 (이전 달 등록자)
    if (!registrationHistory) {
      console.log(`[Step4] ${userName}: ${registrationMonth} 등록 기록 없음 → 스킵`);
      continue;
    }

    // 승급 여부 확인 (⭐ gradeHistory 기반)
    const hasPromotion = !!promotionHistory;

    if (hasPromotion) {
      // ⭐ v8.0: 같은 달에 등록+승급한 경우 - gradeHistory 기반 처리
      // 1. oldGrade Initial 계획 먼저 생성 (등록일 기준)
      // 2. newGrade Promotion 계획 생성 (승급일 기준)
      // 3. oldGrade 플랜을 newGrade 첫 지급일부터 terminate

      const promotion = {
        oldGrade: promotionHistory.fromGrade,
        newGrade: promotionHistory.toGrade,
        promotionDate: promotionHistory.date
      };

      // 등록일/승급일 결정
      const actualRegistrationDate = registrationHistory?.date || registrationDate;
      const actualPromotionDate = promotionHistory?.date || promotion.promotionDate || registrationDate;

      console.log(`[Step4] ${userName}: 등록일=${actualRegistrationDate.toISOString().split('T')[0]}, 승급일=${actualPromotionDate.toISOString().split('T')[0]}`);
      console.log(`[Step4] ${userName}: ${promotion.oldGrade} → ${promotion.newGrade}`);

      // ⭐ v8.0: 이미 oldGrade Initial 계획이 있는지 확인 (중복 방지)
      const existingInitialPlan = await WeeklyPaymentPlans.findOne({
        userId: userId,
        baseGrade: promotion.oldGrade,
        planType: 'initial',
        revenueMonth: registrationMonth
      });

      // 1. oldGrade Initial 계획 생성 (등록일 기준) - 없는 경우만
      let initialPlan;
      if (existingInitialPlan) {
        console.log(`[Step4] ${userName}: ${promotion.oldGrade} Initial 이미 존재 → 스킵`);
        initialPlan = existingInitialPlan;
      } else {
        initialPlan = await createInitialPaymentPlan(
        userId,
        userName,
        promotion.oldGrade,  // F1 등 이전 등급
        actualRegistrationDate  // 등록일 기준
      );
      registrantPlans.push({
        userId,
        type: 'initial',
        grade: promotion.oldGrade,
        plan: initialPlan._id
      });
      console.log(`[Step4] ${userName}: ${promotion.oldGrade} Initial 생성 (등록일: ${actualRegistrationDate.toISOString().split('T')[0]})`);
      }

      // ⭐ v8.0: 이미 newGrade Promotion 계획이 있는지 확인 (중복 방지)
      const existingPromotionPlan = await WeeklyPaymentPlans.findOne({
        userId: userId,
        baseGrade: promotion.newGrade,
        planType: 'promotion',
        revenueMonth: registrationMonth
      });

      if (existingPromotionPlan) {
        console.log(`[Step4] ${userName}: ${promotion.newGrade} Promotion 이미 존재 → 스킵`);
        continue;
      }

      // 2. newGrade Promotion 계획 생성 (승급일 기준)
      const promotionPlan = await createPromotionPaymentPlan(
        userId,
        userName,
        promotion.newGrade,  // F2 등 새 등급
        actualPromotionDate,  // 승급일 기준
        monthlyReg
      );

      // 3. Initial 플랜을 Promotion 첫 지급일부터 terminate
      const newPlanFirstPayment = promotionPlan.installments[0]?.scheduledDate;
      if (newPlanFirstPayment) {
        const terminatedCount = await terminateActivePlansFromDate(userId, newPlanFirstPayment, promotionPlan._id);
        if (terminatedCount > 0) {
          console.log(`[Step4] ${userName}: ${terminatedCount}개 기존 플랜 부분종료 (기준일: ${newPlanFirstPayment.toISOString().split('T')[0]})`);
        }
      }

      promotionPlans.push({
        userId,
        type: 'promotion',
        grade: promotion.newGrade,
        plan: promotionPlan._id
      })

    } else {
      // 미승급 경우: 현재 등급으로 Initial 계획 생성

      // ⭐ User 모델에서 실제 등급 확인
      const user = await User.findById(userId);
      const currentGrade = user?.grade || 'F1';

      // ⭐ v8.0: 이미 해당 등급의 어떤 계획이든 있으면 스킵 (중복 방지)
      // - initial이든 promotion이든 해당 등급으로 플랜이 있으면 스킵
      const existingPlan = await WeeklyPaymentPlans.findOne({
        userId: userId,
        baseGrade: currentGrade,
        revenueMonth: registrationMonth
      });
      if (existingPlan) {
        console.log(`[Step4] ${userName}: ${currentGrade} 계획 이미 존재 (${existingPlan.planType}, ${registrationMonth}) → 스킵`);
        continue;
      }

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
  // ⭐ v8.0 FIX: gradeHistory 기반으로 이번 달에 실제로 승급한 사용자만 처리

  // ⭐ v8.0 FIX: 4-1에서 실제로 승급 처리된 사용자 ID 수집
  // (이번 달 등록 + 승급이 동시에 일어난 경우만)
  const processedPromotionIds = promotionPlans.map(p => p.userId?.toString());

  // ⭐ v8.0 FIX: promotedTargets 대신 gradeHistory에서 이번 달 승급자 직접 조회
  // ⚠️ $elemMatch 사용: 같은 배열 요소에서 type과 revenueMonth가 모두 일치해야 함
  const allUsers = await User.find({
    gradeHistory: {
      $elemMatch: {
        type: 'promotion',
        revenueMonth: registrationMonth
      }
    }
  });

  // 이번 달 승급 기록이 있는 기존 사용자 (4-1에서 이미 처리된 승급자 제외)
  const existingPromoted = allUsers.filter(u => {
    const userIdStr = u._id.toString();
    // ⭐ v8.0 FIX: 4-1에서 이미 승급 플랜이 생성된 사용자만 제외
    return !processedPromotionIds.includes(userIdStr);
  });

  console.log(`[Step4] 4-2 기존 승급자: ${existingPromoted.length}명`);

  if (existingPromoted.length > 0) {

    for (const user of existingPromoted) {
      if (!user) {
        continue;
      }

      // ⭐ v8.0 FIX: 이번 달 승급 기록 조회 (gradeHistory 기반)
      const promotionHistory = user.gradeHistory?.find(h =>
        h.type === 'promotion' && h.revenueMonth === registrationMonth
      );

      if (!promotionHistory) {
        console.log(`[기존 승급자] ${user.name}: ${registrationMonth} 승급 기록 없음 → 스킵`);
        continue;
      }

      const prom = {
        userId: user._id.toString(),
        userName: user.name,
        grade: promotionHistory.toGrade,
        oldGrade: promotionHistory.fromGrade
      };

      // ⭐ v8.0: 이미 해당 등급+월의 promotion 계획이 있으면 스킵 (중복 방지)
      const existingPlan = await WeeklyPaymentPlans.findOne({
        userId: prom.userId,
        baseGrade: prom.grade,
        revenueMonth: registrationMonth,
        planType: 'promotion'
      });
      if (existingPlan) {
        console.log(`[기존 승급자] ${prom.userName}: ${prom.grade} promotion 계획 이미 존재 (${registrationMonth}) → 스킵`);
        continue;
      }

      // ⭐ v8.0: 승급일 = gradeHistory.date 사용 (정확한 승급일)
      const promotionDate = promotionHistory.date || user.lastGradeChangeDate || new Date();

      console.log(`[기존 승급자] ${prom.userName}: ${prom.oldGrade}→${prom.grade} (승급일: ${promotionDate.toISOString().split('T')[0]})`);

      // ⭐ v8.0: 새 플랜 생성
      const promotionPlan = await createPromotionPaymentPlan(
        prom.userId,
        prom.userName,
        prom.grade,
        promotionDate,
        monthlyReg
      );

      // ⭐ v8.0: 새 플랜의 첫 지급일 기준으로 기존 플랜 terminate
      const newPlanFirstPayment = promotionPlan.installments[0]?.scheduledDate;
      if (newPlanFirstPayment) {
        const terminatedCount = await terminateActivePlansFromDate(prom.userId, newPlanFirstPayment, promotionPlan._id);
        if (terminatedCount > 0) {
          console.log(`[Step4] ${prom.userName}: ${terminatedCount}개 기존 플랜 종료 (기준일: ${newPlanFirstPayment.toISOString().split('T')[0]})`);
        }
      }
      promotionPlans.push({
        userId: prom.userId,
        type: 'promotion',
        grade: prom.grade,
        plan: promotionPlan._id
      })
    }
  } else {
    console.log(`[Step4] 4-2 기존 승급자 없음`);
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
    // ⭐ v8.0: ratio는 매출 계산 시 적용됨 (step2), 지급액에는 적용 안 함
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


/**
 * ⭐ v8.0: 특정 날짜부터 기존 플랜 부분 종료
 * - 새 플랜의 첫 지급일 기준으로 기존 플랜 terminate
 * - excludePlanId: 새로 생성된 플랜은 제외
 *
 * @param {string} userId - 사용자 ID
 * @param {Date} firstPaymentDate - 새 플랜의 첫 지급일
 * @param {ObjectId} excludePlanId - 제외할 플랜 ID (새로 생성된 플랜)
 * @returns {Promise<number>} 처리된 플랜 수
 */
async function terminateActivePlansFromDate(userId, firstPaymentDate, excludePlanId) {
  try {
    console.log(`[승급 처리] userId=${userId}: 첫 지급일=${firstPaymentDate.toISOString().split('T')[0]} 기준으로 기존 플랜 종료`);

    // 모든 active 플랜 조회 (새로 생성된 플랜 제외)
    // ⭐ 승급 시 기본지급, 승급지급, 추가지급 모두 terminate
    const plans = await WeeklyPaymentPlans.find({
      userId: userId,
      planStatus: 'active',
      _id: { $ne: excludePlanId }
    });

    if (plans.length === 0) {
      return 0;
    }

    console.log(`[승급 처리] userId=${userId}: ${plans.length}개 active 플랜 확인`);

    let terminatedCount = 0;

    for (const plan of plans) {
      // ⭐ v8.0: 승급 첫 지급일 이후의 pending installments만 terminated로 변경
      let hasRemainingPending = false;
      let terminatedInstallments = 0;

      for (const inst of plan.installments) {
        if (inst.status === 'pending') {
          const instDate = new Date(inst.scheduledDate);
          if (instDate >= firstPaymentDate) {
            // 승급 첫 지급일 이후 → terminated
            inst.status = 'terminated';
            inst.terminatedReason = 'promotion';
            terminatedInstallments++;
          } else {
            // 승급 첫 지급일 이전 → 유지 (정상 지급)
            hasRemainingPending = true;
          }
        }
      }

      // ⭐ v8.0 FIX: 승급으로 인해 terminated installment가 있으면 planStatus도 terminated
      // 남은 pending은 정상 지급하되, 계획 자체는 종료 상태로 표시
      let newPlanStatus = plan.planStatus;
      if (terminatedInstallments > 0) {
        newPlanStatus = 'terminated';
      }

      const updateFields = {
        installments: plan.installments,
        planStatus: newPlanStatus,
        ...(newPlanStatus === 'terminated' && {
          terminatedAt: new Date(),
          terminationReason: 'promotion',
          terminatedBy: 'promotion_additional_stop'
        })
      };

      await WeeklyPaymentPlans.updateOne(
        { _id: plan._id },
        { $set: updateFields },
        { strict: false }
      );

      if (terminatedInstallments > 0) {
        terminatedCount++;
        const statusLabel = newPlanStatus === 'terminated' ? '종료' : '부분종료';
        console.log(`  - [${statusLabel}] ${plan.planType} ${plan.baseGrade} (${plan.revenueMonth}): ${terminatedInstallments}개 installment terminated, 남은 pending: ${hasRemainingPending}`);
      }
    }

    console.log(`[승급 처리] userId=${userId}: ${terminatedCount}개 플랜 처리 완료`);
    return terminatedCount;

  } catch (error) {
    console.error(`[terminateActivePlansFromDate] ${userId} 오류:`, error);
    return 0;
  }
}


/**
 * ⭐ v8.0: 승급 시 기존 플랜 부분 종료 (레거시 - promotionDate 기반)
 * - 승급 플랜의 첫 지급 주차부터 기존 플랜의 지급을 멈춤
 * - 그 이전 주차의 pending installments는 정상 지급
 */
async function terminateAllActivePlans(userId, promotionDate) {
  try {
    // 승급 플랜의 첫 지급일 계산 (승급일 기준 다음 금요일)
    const firstPaymentDate = calculateNextFriday(promotionDate);

    console.log(`[승급 처리] userId=${userId}: 승급일=${promotionDate.toISOString().split('T')[0]}, 첫 지급일=${firstPaymentDate.toISOString().split('T')[0]}`);

    // 모든 active 플랜 조회 (initial, promotion, additional 모두)
    const plans = await WeeklyPaymentPlans.find({
      userId: userId,
      planStatus: 'active'
    });

    if (plans.length === 0) {
      return 0;
    }

    console.log(`[승급 처리] userId=${userId}: ${plans.length}개 active 플랜 확인`);

    let terminatedCount = 0;

    for (const plan of plans) {
      // ⭐ v8.0: 승급 첫 지급일 이후의 pending installments만 terminated로 변경
      let hasRemainingPending = false;
      let terminatedInstallments = 0;

      for (const inst of plan.installments) {
        if (inst.status === 'pending') {
          const instDate = new Date(inst.scheduledDate);
          if (instDate >= firstPaymentDate) {
            // 승급 첫 지급일 이후 → terminated
            inst.status = 'terminated';
            inst.terminatedReason = 'promotion';
            terminatedInstallments++;
          } else {
            // 승급 첫 지급일 이전 → 유지 (정상 지급)
            hasRemainingPending = true;
          }
        }
      }

      // ⭐ v8.0 FIX: 승급으로 인해 terminated installment가 있으면 planStatus도 terminated
      // 남은 pending은 정상 지급하되, 계획 자체는 종료 상태로 표시
      let newPlanStatus = plan.planStatus;
      if (terminatedInstallments > 0) {
        newPlanStatus = 'terminated';
      }

      const updateFields = {
        installments: plan.installments,
        planStatus: newPlanStatus,
        ...(newPlanStatus === 'terminated' && {
          terminatedAt: new Date(),
          terminationReason: 'promotion',
          terminatedBy: 'promotion_additional_stop'
        })
      };

      await WeeklyPaymentPlans.updateOne(
        { _id: plan._id },
        { $set: updateFields },
        { strict: false }
      );

      if (terminatedInstallments > 0) {
        terminatedCount++;
        const statusLabel = newPlanStatus === 'terminated' ? '종료' : '부분종료';
        console.log(`  - [${statusLabel}] ${plan.planType} ${plan.baseGrade} (${plan.revenueMonth}): ${terminatedInstallments}개 installment terminated, 남은 pending: ${hasRemainingPending}`);
      }
    }

    console.log(`[승급 처리] userId=${userId}: ${terminatedCount}개 플랜 처리 완료`);
    return terminatedCount;

  } catch (error) {
    console.error(`[terminateAllActivePlans] ${userId} 오류:`, error);
    return 0;
  }
}
