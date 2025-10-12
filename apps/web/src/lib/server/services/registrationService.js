/**
 * 용역자 등록 서비스 v5.0
 * 등록, 등급 계산, 스냅샷 업데이트, 지급 계획 생성 통합 처리
 */

import User from '../models/User.js';
import MonthlyRegistrations from '../models/MonthlyRegistrations.js';
import MonthlyTreeSnapshots from '../models/MonthlyTreeSnapshots.js';
import WeeklyPaymentPlans from '../models/WeeklyPaymentPlans.js';
import { recalculateAllGrades } from './gradeCalculation.js';
import { createInitialPaymentPlan, createPromotionPaymentPlan, checkAndCreateAdditionalPlan } from './paymentPlanService.js';
import { excelLogger as logger } from '../logger.js';

/**
 * 용역자 등록 시 전체 프로세스 처리
 */
export async function processUserRegistration(userIds) {
  try {
    logger.info(`=== 용역자 등록 처리 시작 (v5.0) ===`, {
      userCount: userIds.length,
      timestamp: new Date().toISOString()
    });

    // 1. 등록된 사용자 정보 조회
    const users = await User.find({ _id: { $in: userIds } });
    if (!users || users.length === 0) {
      throw new Error('등록된 사용자를 찾을 수 없습니다.');
    }

    console.log('[등록처리 1단계] 사용자 정보 조회 완료:');
    users.forEach(u => {
      console.log(`  - ${u.name} (${u.loginId}), 등록일: ${u.registrationDate?.toISOString().split('T')[0]}, 등급: ${u.grade}`);
    });

    // 2. 트리 구조 변경 및 등급 재계산 (먼저 실행!)
    logger.info('등급 재계산 시작...');
    const gradeChangeResult = await recalculateAllGrades();
    const affectedUsers = gradeChangeResult.changedUsers || [];

    logger.info(`등급 재계산 완료: ${affectedUsers.length}명 변경`);

    // 3. 등급 재계산 후 users 정보 다시 조회 (최신 등급 반영)
    const updatedUsers = await User.find({ _id: { $in: userIds } });
    console.log('[등록처리 2단계] 등급 재계산 후 사용자 정보:');
    updatedUsers.forEach(u => {
      console.log(`  - ${u.name} (${u.loginId}), 등급: ${u.grade}`);
    });

    // 4. 월별 등록 정보 업데이트 (최신 등급으로)
    await updateMonthlyRegistrations(updatedUsers);

    // 5. 월별 트리 스냅샷 업데이트
    await updateMonthlyTreeSnapshots(updatedUsers, affectedUsers);

    // 6. 지급 계획 처리
    console.log('[등록처리 6단계] 지급 계획 생성 시작');
    const paymentPlanResults = [];

    // 6-1. 신규 등록자 Initial 계획 생성
    for (const user of updatedUsers) {
      console.log(`[등록처리 5-1] ${user.name}의 Initial 지급 계획 생성 시작`);
      console.log(`  - 등록일: ${user.registrationDate?.toISOString().split('T')[0]}`);
      console.log(`  - 등급: ${user.grade}`);

      const plan = await createInitialPaymentPlan(
        user.loginId,
        user.name,
        user.grade,
        user.registrationDate || user.createdAt
      );

      console.log(`[등록처리 5-1] 지급 계획 생성 완료: ${plan.installments.length}개 할부`);
      if (plan.installments.length > 0) {
        const first = plan.installments[0];
        console.log(`  - 첫 지급: ${first.weekNumber} (${first.paymentDate?.toISOString().split('T')[0]})`);
      }

      paymentPlanResults.push({
        userId: user.loginId,
        type: 'initial',
        plan: plan._id
      });
    }

    // 5-2. 승급자 Promotion 계획 생성
    const promotedUsers = affectedUsers.filter(u =>
      u.changeType === 'grade_change' &&
      u.oldGrade &&
      u.newGrade &&
      u.oldGrade < u.newGrade
    );

    for (const promoted of promotedUsers) {
      const user = await User.findOne({ loginId: promoted.userId });
      if (user) {
        const plan = await createPromotionPaymentPlan(
          user.loginId,
          user.name,
          promoted.newGrade,
          new Date()
        );
        paymentPlanResults.push({
          userId: user.loginId,
          type: 'promotion',
          plan: plan._id
        });
      }
    }

    // 7. v6.0: 10회 완료된 계획 확인 및 추가 계획 생성
    console.log('[등록처리 7단계] 10회 완료 계획 확인 시작');

    // 모든 완료된 계획 조회
    const completedPlans = await WeeklyPaymentPlans.find({
      completedInstallments: 10,
      planStatus: 'completed'
    });

    console.log(`  발견된 10회 완료 계획: ${completedPlans.length}건`);

    let additionalPlanCount = 0;
    for (const plan of completedPlans) {
      // 이미 추가 계획이 생성되었는지 확인 (중복 방지)
      const hasAdditionalPlan = await WeeklyPaymentPlans.findOne({
        parentPlanId: plan._id
      });

      if (!hasAdditionalPlan) {
        console.log(`  ${plan.userName}의 완료된 계획 발견: generation ${plan.generation}`);
        const additionalPlan = await checkAndCreateAdditionalPlan(plan);
        if (additionalPlan) {
          additionalPlanCount++;
          console.log(`  추가 계획 생성 완료: generation ${additionalPlan.generation}`);
        }
      }
    }

    console.log(`[등록처리 7단계] 추가 계획 생성 완료: ${additionalPlanCount}건`);

    // 8. 처리 완료

    logger.info(`=== 용역자 등록 처리 완료 ===`, {
      신규등록: updatedUsers.length,
      등급변경: affectedUsers.length,
      승급자: promotedUsers.length,
      지급계획: paymentPlanResults.length,
      추가계획: additionalPlanCount
    });

    return {
      success: true,
      registeredUsers: updatedUsers.length,
      affectedUsers: affectedUsers.length,
      promotedUsers: promotedUsers.length,
      paymentPlans: paymentPlanResults,
      additionalPlans: additionalPlanCount
    };

  } catch (error) {
    logger.error('용역자 등록 처리 실패:', error);
    throw error;
  }
}

/**
 * 월별 등록 정보 업데이트
 */
async function updateMonthlyRegistrations(users) {
  // 월별로 그룹화
  const monthGroups = {};

  for (const user of users) {
    const monthKey = MonthlyRegistrations.generateMonthKey(user.registrationDate || user.createdAt);

    if (!monthGroups[monthKey]) {
      monthGroups[monthKey] = [];
    }

    // position 값 변환 (L -> left, R -> right)
    let position = user.position;
    if (position === 'L') position = 'left';
    else if (position === 'R') position = 'right';
    else if (!position) position = 'root';

    monthGroups[monthKey].push({
      userId: user.loginId,
      userName: user.name,
      registrationDate: user.registrationDate || user.createdAt || new Date(),
      sponsorId: user.sponsorId,
      grade: user.grade,
      position: position
    });
  }

  // 각 월별로 업데이트
  for (const [monthKey, registrations] of Object.entries(monthGroups)) {
    let monthlyReg = await MonthlyRegistrations.findOne({ monthKey });

    if (!monthlyReg) {
      // 새로운 문서 생성
      monthlyReg = new MonthlyRegistrations({
        monthKey,
        registrationCount: 0,
        totalRevenue: 0,
        registrations: []
      });
    }

    // 등록자 추가
    monthlyReg.registrations.push(...registrations);
    monthlyReg.registrationCount = monthlyReg.registrations.length;
    monthlyReg.totalRevenue = monthlyReg.registrationCount * 1000000; // 100만원

    // 등급 분포 계산 (해당 월의 모든 사용자 기준)
    const gradeDistribution = {
      F1: 0, F2: 0, F3: 0, F4: 0,
      F5: 0, F6: 0, F7: 0, F8: 0
    };
    
    for (const reg of monthlyReg.registrations) {
      if (gradeDistribution[reg.grade] !== undefined) {
        gradeDistribution[reg.grade]++;
      }
    }
    
    monthlyReg.gradeDistribution = gradeDistribution;
    
    // 등급별 지급액 계산
    const revenue = monthlyReg.getEffectiveRevenue();
    monthlyReg.gradePayments = calculateGradePayments(revenue, gradeDistribution);

    await monthlyReg.save();
  }
}

/**
 * 월별 트리 스냅샷 업데이트
 */

/**
 * 이전 월 스냅샷 자동 확정
 */
async function finalizePreviousMonthSnapshots(currentMonth) {
  try {
    const [year, month] = currentMonth.split('-').map(Number);
    
    // 이전 월 계산
    let prevYear = year;
    let prevMonth = month - 1;
    if (prevMonth === 0) {
      prevMonth = 12;
      prevYear -= 1;
    }
    
    const previousMonth = `${prevYear}-${String(prevMonth).padStart(2, '0')}`;
    
    // 이전 월 스냅샷 조회
    const prevSnapshot = await MonthlyTreeSnapshots.findOne({ 
      monthKey: previousMonth 
    });
    
    if (prevSnapshot && !prevSnapshot.isFinalized) {
      prevSnapshot.isFinalized = true;
      prevSnapshot.snapshotDate = new Date(prevYear, prevMonth, 0, 23, 59, 59); // 월말 일시
      await prevSnapshot.save();
      
      logger.info(`이전 월 스냅샷 확정: ${previousMonth}`);
    }
  } catch (error) {
    logger.error('이전 월 스냅샷 확정 실패:', error);
  }
}

async function updateMonthlyTreeSnapshots(newUsers, affectedUsers) {
  const currentMonth = MonthlyRegistrations.generateMonthKey(new Date());

  // 이전 월 스냅샷 자동 확정
  await finalizePreviousMonthSnapshots(currentMonth);

  // 현재 월 스냅샷 조회 또는 생성
  let snapshot = await MonthlyTreeSnapshots.findOne({ monthKey: currentMonth });

  if (!snapshot) {
    snapshot = new MonthlyTreeSnapshots({
      monthKey: currentMonth,
      snapshotDate: new Date(),
      totalUsers: 0,
      users: []
    });
  }

  // 전체 사용자 조회 (현재 월 기준)
  const allUsers = await User.find({});

  // 스냅샷 사용자 목록 재구성
  snapshot.users = [];
  const gradeDistribution = {
    F1: 0, F2: 0, F3: 0, F4: 0,
    F5: 0, F6: 0, F7: 0, F8: 0
  };

  for (const user of allUsers) {
    // 보험 설정 확인
    const insuranceSettings = user.insuranceSettings || {
      required: ['F3', 'F4', 'F5', 'F6', 'F7', 'F8'].includes(user.grade),
      amount: 0,
      maintained: false
    };

    // position 값 변환 (L -> left, R -> right)
    let position = user.position;
    if (position === 'L') position = 'left';
    else if (position === 'R') position = 'right';
    else if (!position) position = 'root';

    // 스냅샷에 사용자 추가
    snapshot.users.push({
      userId: user.loginId,
      userName: user.name,
      grade: user.grade,
      registrationDate: user.registrationDate || user.createdAt,

      sponsorId: user.sponsorId,
      leftChildId: user.leftChildId,
      rightChildId: user.rightChildId,
      leftSubtreeCount: user.leftSubtreeCount || 0,
      rightSubtreeCount: user.rightSubtreeCount || 0,
      depth: user.depth || 0,
      position: position,

      leftSubtree: user.leftSubtree || {},
      rightSubtree: user.rightSubtree || {},

      insuranceSettings,
      activePaymentPlans: []  // 나중에 업데이트
    });

    // 등급 분포 카운트
    if (gradeDistribution[user.grade] !== undefined) {
      gradeDistribution[user.grade]++;
    }
  }

  snapshot.totalUsers = allUsers.length;
  snapshot.gradeDistribution = gradeDistribution;
  snapshot.snapshotDate = new Date();

  await snapshot.save();

  // 월별 등록 정보에도 등급 분포 업데이트
  // 중요: 등록월의 월말 등급 분포로 지급액을 계산해야 함
  const monthlyReg = await MonthlyRegistrations.findOne({
    monthKey: currentMonth
  });

  if (monthlyReg) {
    monthlyReg.gradeDistribution = gradeDistribution;

    // 등급별 지급액 계산
    const revenue = monthlyReg.getEffectiveRevenue();
    monthlyReg.gradePayments = calculateGradePayments(revenue, gradeDistribution);

    await monthlyReg.save();
    
    logger.info(`월별 등록 정보 등급 분포 업데이트: ${currentMonth}`, gradeDistribution);
  }
}

/**
 * 등급별 지급액 계산 (누적 방식)
 */
function calculateGradePayments(totalRevenue, gradeDistribution) {
  const rates = {
    F1: 0.24, F2: 0.19, F3: 0.14, F4: 0.09,
    F5: 0.05, F6: 0.03, F7: 0.02, F8: 0.01
  };

  const payments = {};
  let previousAmount = 0;

  const grades = ['F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8'];

  for (let i = 0; i < grades.length; i++) {
    const grade = grades[i];
    const nextGrade = grades[i + 1];

    const currentCount = gradeDistribution[grade] || 0;
    const nextCount = gradeDistribution[nextGrade] || 0;

    if (currentCount > 0) {
      const poolAmount = totalRevenue * rates[grade];
      const poolCount = currentCount + nextCount;

      if (poolCount > 0) {
        const additionalPerPerson = poolAmount / poolCount;
        payments[grade] = previousAmount + additionalPerPerson;
        previousAmount = payments[grade];
      } else {
        payments[grade] = previousAmount;
      }
    } else {
      payments[grade] = 0;
    }
  }

  return payments;
}

/**
 * 보험 설정 업데이트
 */
export async function updateUserInsuranceSettings(userId, insuranceSettings) {
  try {
    const user = await User.findOne({ loginId: userId });
    if (!user) {
      throw new Error('사용자를 찾을 수 없습니다.');
    }

    // 보험 설정 업데이트
    user.insuranceSettings = {
      ...user.insuranceSettings,
      ...insuranceSettings,
      lastUpdated: new Date()
    };

    // 보험 이력 추가
    if (!user.insuranceHistory) {
      user.insuranceHistory = [];
    }

    user.insuranceHistory.push({
      period: MonthlyRegistrations.generateMonthKey(new Date()),
      maintained: insuranceSettings.maintained,
      amount: insuranceSettings.amount
    });

    await user.save();

    // 현재 월 스냅샷에도 업데이트
    const currentMonth = MonthlyRegistrations.generateMonthKey(new Date());
    const snapshot = await MonthlyTreeSnapshots.findOne({ monthKey: currentMonth });

    if (snapshot) {
      const userSnapshot = snapshot.users.find(u => u.userId === userId);
      if (userSnapshot) {
        userSnapshot.insuranceSettings = user.insuranceSettings;
        await snapshot.save();
      }
    }

    // 활성 지급 계획의 insuranceSkipped 플래그 업데이트
    await updateInsuranceSkippedFlags(userId, insuranceSettings.maintained);

    return {
      success: true,
      userId,
      insuranceSettings: user.insuranceSettings
    };
  } catch (error) {
    logger.error('보험 설정 업데이트 실패:', error);
    throw error;
  }
}

/**
 * 보험 상태 변경 시 지급 계획의 insuranceSkipped 플래그 업데이트
 */
async function updateInsuranceSkippedFlags(userId, maintained) {
  try {
    const activePlans = await WeeklyPaymentPlans.find({
      userId: userId,
      planStatus: 'active'
    });

    for (const plan of activePlans) {
      let hasChanges = false;

      for (const inst of plan.installments) {
        if (inst.status === 'pending' && inst.scheduledDate > new Date()) {
          if (!maintained) {
            // 보험 해지 - 건너뜀 플래그 설정
            inst.insuranceSkipped = true;
            hasChanges = true;
          } else {
            // 보험 재가입 - 건너뜀 플래그 제거
            if (inst.insuranceSkipped) {
              inst.insuranceSkipped = false;
              hasChanges = true;
            }
          }
        }
      }

      if (hasChanges) {
        await plan.save();
      }
    }
  } catch (error) {
    console.error('보험 플래그 업데이트 실패:', error);
  }
}

