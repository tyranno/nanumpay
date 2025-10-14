/**
 * 용역자 등록 서비스 v7.0 (모듈화 버전)
 *
 * 변경사항:
 * - 복잡한 processUserRegistration을 모듈별로 분리
 * - 명확한 단계별 처리 흐름
 * - 디버깅 및 유지보수 용이성 향상
 */

import User from '../models/User.js';
import MonthlyRegistrations from '../models/MonthlyRegistrations.js';
import WeeklyPaymentPlans from '../models/WeeklyPaymentPlans.js';
import { excelLogger as logger } from '../logger.js';

// 모듈 import
import {
  recalculateGrades,
  updateMonthlyRegistrations,
  updateMonthlyTreeSnapshots,
  extractPaymentTargets,
  extractAdditionalPaymentTargets,
  createRegistrantPlans,
  createPromotionPlans,
  checkAndCreateAdditionalPayments
} from './registration/index.js';

import { calculateGradePayments } from '../utils/paymentCalculator.js';
import {
  calculateTotalDistribution,
  debugDistribution
} from '../utils/distributionCalculator.js';

/**
 * 용역자 등록 시 전체 프로세스 처리 (v7.0 모듈화)
 */
export async function processUserRegistration(userIds) {
  try {
    logger.info(`=== 용역자 등록 처리 시작 (v7.0 모듈화) ===`, {
      userCount: userIds.length,
      timestamp: new Date().toISOString()
    });

    // ========================================
    // Step 1: 사용자 정보 조회
    // ========================================
    console.log('\n[Step 1] 사용자 정보 조회');
    console.log('='.repeat(80));

    const users = await User.find({ _id: { $in: userIds } });
    if (!users || users.length === 0) {
      throw new Error('등록된 사용자를 찾을 수 없습니다.');
    }

    console.log(`  등록 대상: ${users.length}명`);
    users.forEach(u => {
      console.log(`    - ${u.name} (${u.loginId}), 등록일: ${u.registrationDate?.toISOString().split('T')[0]}, 등급: ${u.grade}`);
    });

    // ========================================
    // Step 2: 등급 재계산
    // ========================================
    console.log('\n[Step 2] 등급 재계산');
    console.log('='.repeat(80));

    const gradeChangeResult = await recalculateGrades();
    const changedUsers = gradeChangeResult.changedUsers || [];

    // ========================================
    // Step 3: 최신 사용자 정보 재조회
    // ========================================
    console.log('\n[Step 3] 최신 사용자 정보 재조회');
    console.log('='.repeat(80));

    const updatedUsers = await User.find({ _id: { $in: userIds } });
    console.log(`  최신 정보: ${updatedUsers.length}명`);
    updatedUsers.forEach(u => {
      console.log(`    - ${u.name} (${u.loginId}), 등급: ${u.grade}`);
    });

    // ========================================
    // Step 4: 월별 등록 정보 업데이트
    // ========================================
    console.log('\n[Step 4] 월별 등록 정보 업데이트');
    console.log('='.repeat(80));

    const updatedMonthlyRegs = await updateMonthlyRegistrations(updatedUsers);

    // ========================================
    // Step 5: 월별 트리 스냅샷 업데이트
    // ========================================
    console.log('\n[Step 5] 월별 트리 스냅샷 업데이트');
    console.log('='.repeat(80));

    await updateMonthlyTreeSnapshots(updatedUsers, changedUsers);

    // ========================================
    // Step 6: 지급 대상자 추출
    // ========================================
    console.log('\n[Step 6] 지급 대상자 추출');
    console.log('='.repeat(80));

    const paymentTargets = extractPaymentTargets(updatedUsers, gradeChangeResult);
    const { registrants, promoted } = paymentTargets;

    // ========================================
    // Step 7: 지급 계획 생성 (등록자)
    // ========================================
    console.log('\n[Step 7] 지급 계획 생성 - 등록자');
    console.log('='.repeat(80));

    // 7-1. 등록자의 원래 등급 파악 (승급 전 등급)
    const registrantsWithOriginalGrade = registrants.map(reg => {
      const changedUser = changedUsers.find(c => c.userId === reg.userId);
      return {
        ...reg,
        originalGrade: changedUser?.oldGrade || reg.grade
      };
    });

    // 7-2. 원래 등급으로 Initial 계획 생성
    const registrantPlans = [];
    for (const reg of registrantsWithOriginalGrade) {
      console.log(`  - ${reg.userName}: 원래 등급 ${reg.originalGrade}로 Initial 계획 생성`);

      const plan = await createInitialPaymentPlanWithGrade(
        reg.userId,
        reg.userName,
        reg.originalGrade,  // 원래 등급 사용
        reg.registrationDate
      );

      registrantPlans.push({
        userId: reg.userId,
        type: 'initial',
        plan: plan._id
      });
    }

    // ========================================
    // Step 8: 승급자 등급 분포 업데이트
    // ========================================
    console.log('\n[Step 8] 승급자 등급 분포 업데이트');
    console.log('='.repeat(80));

    let updatedMonthlyReg = null;

    if (promoted.length > 0) {
      console.log(`  승급자: ${promoted.length}명`);

      // 승급일 = 현재 등록 배치의 가장 최근 등록일
      const promotionDate = updatedUsers.reduce((latest, user) => {
        const userDate = user.registrationDate || user.createdAt;
        return userDate > latest ? userDate : latest;
      }, updatedUsers[0]?.registrationDate || updatedUsers[0]?.createdAt || new Date());

      const promotionMonthKey = MonthlyRegistrations.generateMonthKey(promotionDate);

      // 해당 월 MonthlyRegistrations 조회
      let monthlyReg = await MonthlyRegistrations.findOne({ monthKey: promotionMonthKey });

      if (!monthlyReg) {
        console.log(`  ⚠️ ${promotionMonthKey} MonthlyRegistrations 없음 - 건너뜀`);
      } else {
        console.log(`  현재 ${promotionMonthKey} 등록자: ${monthlyReg.registrationCount}명`);
        console.log(`  현재 매출: ${monthlyReg.totalRevenue.toLocaleString()}원`);

        // paymentTargets 초기화
        if (!monthlyReg.paymentTargets) {
          monthlyReg.paymentTargets = {
            registrants: [],
            promoted: [],
            additionalPayments: []
          };
        }

        // 등급 분포 재계산 (등록자 기준)
        const gradeDistribution = {
          F1: 0, F2: 0, F3: 0, F4: 0,
          F5: 0, F6: 0, F7: 0, F8: 0
        };

        // 1) 등록자 카운트
        for (const reg of monthlyReg.registrations) {
          if (gradeDistribution[reg.grade] !== undefined) {
            gradeDistribution[reg.grade]++;
          }
        }
        console.log(`  [1단계] 등록자 기준: ${JSON.stringify(gradeDistribution)}`);

        // 2) 승급자 반영 (현재 등록 배치 제외)
        for (const prom of promoted) {
          const isInCurrentBatch = updatedUsers.some(u => u.loginId === prom.userId);
          if (isInCurrentBatch) {
            console.log(`  [SKIP] ${prom.userName}는 현재 등록 배치에 포함`);
            continue;
          }

          // ⭐ 수정: 승급자는 단순히 newGrade만 +1 (이미 등록자 카운트에 없음)
          if (gradeDistribution[prom.newGrade] !== undefined) {
            gradeDistribution[prom.newGrade]++;
          }

          console.log(`  [승급 반영] ${prom.userName}: ${prom.oldGrade} → ${prom.newGrade}(+1)`);

          // paymentTargets.promoted에 추가
          monthlyReg.paymentTargets.promoted.push({
            userId: prom.userId,
            userName: prom.userName,
            oldGrade: prom.oldGrade,
            newGrade: prom.newGrade,
            promotionDate: promotionDate
          });
        }

        console.log(`  [2단계] 승급 반영 후: ${JSON.stringify(gradeDistribution)}`);

        // 등급 분포 및 지급액 업데이트
        monthlyReg.gradeDistribution = gradeDistribution;
        const revenue = monthlyReg.getEffectiveRevenue();
        monthlyReg.gradePayments = calculateGradePayments(revenue, gradeDistribution);

        await monthlyReg.save();
        updatedMonthlyReg = monthlyReg;

        console.log(`  ✅ ${promotionMonthKey} 등급 분포 업데이트 완료`);
        console.log(`    - 등록자 수: ${monthlyReg.registrationCount}명`);
        console.log(`    - 매출: ${revenue.toLocaleString()}원`);
        console.log(`    - F1 지급액: ${(monthlyReg.gradePayments?.F1 || 0).toLocaleString()}원`);
        console.log(`    - F2 지급액: ${(monthlyReg.gradePayments?.F2 || 0).toLocaleString()}원`);
      }
    }

    // ========================================
    // Step 9: 지급 계획 생성 (승급자)
    // ========================================
    console.log('\n[Step 9] 지급 계획 생성 - 승급자');
    console.log('='.repeat(80));

    const promotionPlans = [];

    if (promoted.length > 0 && updatedMonthlyReg) {
      const promotionDate = updatedUsers.reduce((latest, user) => {
        const userDate = user.registrationDate || user.createdAt;
        return userDate > latest ? userDate : latest;
      }, updatedUsers[0]?.registrationDate || updatedUsers[0]?.createdAt || new Date());

      for (const prom of promoted) {
        console.log(`  - ${prom.userName}: ${prom.oldGrade} → ${prom.newGrade}`);

        const user = await User.findOne({ loginId: prom.userId });
        if (!user) {
          console.log(`    ⚠️ 사용자를 찾을 수 없음: ${prom.userId}`);
          continue;
        }

        // Promotion 계획 생성
        const promotionPlan = await createPromotionPaymentPlanWithMonthlyReg(
          user.loginId,
          user.name,
          prom.newGrade,
          promotionDate,
          updatedMonthlyReg
        );

        console.log(`    ✓ Promotion 계획 생성: ${promotionPlan._id}`);
        console.log(`      매출월: ${promotionPlan.revenueMonth}, 금액: ${promotionPlan.installments[0]?.installmentAmount || 0}원`);

        // 같은 달 등록+승급인 경우 Initial 계획 삭제
        const initialPlan = await WeeklyPaymentPlans.findOne({
          userId: user.loginId,
          planType: 'initial',
          revenueMonth: promotionPlan.revenueMonth
        });

        if (initialPlan) {
          console.log(`    [삭제] ${user.name}의 Initial 계획 삭제 (같은 달 등록+승급) - ID: ${initialPlan._id}`);
          await WeeklyPaymentPlans.deleteOne({ _id: initialPlan._id });

          // registrantPlans에서도 제거
          const index = registrantPlans.findIndex(p => p.plan.equals(initialPlan._id));
          if (index > -1) {
            registrantPlans.splice(index, 1);
          }
        }

        promotionPlans.push({
          userId: user.loginId,
          type: 'promotion',
          plan: promotionPlan._id
        });
      }
    }

    // ========================================
    // Step 10: 매월 추가지급 확인 (v7.0)
    // ========================================
    console.log('\n[Step 10] v7.0 매월 추가지급 확인');
    console.log('='.repeat(80));

    const registrationMonth = MonthlyRegistrations.generateMonthKey(
      updatedUsers[0]?.registrationDate || updatedUsers[0]?.createdAt || new Date()
    );
    console.log(`  등록 월: ${registrationMonth}`);

    const additionalPaymentsInfo = await checkAndCreateAdditionalPayments(registrationMonth);
    const additionalTargets = extractAdditionalPaymentTargets(additionalPaymentsInfo);

    // ========================================
    // Step 11: 현재 월 등급 분포에 추가지급 대상자 반영
    // ========================================
    console.log('\n[Step 11] 현재 월 등급 분포에 추가지급 대상자 반영');
    console.log('='.repeat(80));

    if (additionalTargets.length > 0) {
      console.log(`  추가지급 대상자: ${additionalTargets.length}명`);

      const currentMonthReg = await MonthlyRegistrations.findOne({ monthKey: registrationMonth });
      if (currentMonthReg) {
        console.log(`  [현재 상태] ${registrationMonth} 등급 분포: ${JSON.stringify(currentMonthReg.gradeDistribution)}`);

        // paymentTargets 초기화
        if (!currentMonthReg.paymentTargets) {
          currentMonthReg.paymentTargets = {
            registrants: [],
            promoted: [],
            additionalPayments: []
          };
        }
        if (!currentMonthReg.paymentTargets.additionalPayments) {
          currentMonthReg.paymentTargets.additionalPayments = [];
        }

        // 추가지급 대상자 추가
        for (const target of additionalTargets) {
          currentMonthReg.paymentTargets.additionalPayments.push({
            userId: target.userId,
            userName: target.userName,
            grade: target.grade,
            추가지급단계: target.추가지급단계,
            fromMonth: target.revenueMonth
          });
          console.log(`    ✓ ${target.userName} (${target.grade}, 단계:${target.추가지급단계}, 매출월:${target.revenueMonth})`);
        }

        // ⭐ 수정: additionalTargets 배열을 직접 사용하여 등급 분포 재계산
        // (paymentTargets.additionalPayments는 방금 추가했으므로 동일함)
        const gradeDistribution = { ...currentMonthReg.gradeDistribution };
        console.log(`  [1단계] 기존 분포 (등록자+승급자): ${JSON.stringify(gradeDistribution)}`);

        for (const target of additionalTargets) {
          if (gradeDistribution[target.grade] !== undefined) {
            gradeDistribution[target.grade]++;
            console.log(`    ➕ ${target.userName} (${target.grade})`);
          }
        }

        console.log(`  [2단계] 추가지급 반영 후: ${JSON.stringify(gradeDistribution)}`);

        // 등급 분포 및 지급액 업데이트
        currentMonthReg.gradeDistribution = gradeDistribution;
        const revenue = currentMonthReg.getEffectiveRevenue();
        currentMonthReg.gradePayments = calculateGradePayments(revenue, gradeDistribution);

        await currentMonthReg.save();

        console.log(`  ✅ ${registrationMonth} 등급 분포 업데이트 완료`);
        console.log(`    - 매출: ${revenue.toLocaleString()}원`);
        console.log(`    - 등급 분포: ${JSON.stringify(gradeDistribution)}`);
        console.log(`    - F1 지급액: ${(currentMonthReg.gradePayments?.F1 || 0).toLocaleString()}원`);
        console.log(`    - F2 지급액: ${(currentMonthReg.gradePayments?.F2 || 0).toLocaleString()}원`);
      } else {
        console.log(`  ⚠️ ${registrationMonth} MonthlyRegistrations 없음 - 건너뜀`);
      }
    } else {
      console.log(`  추가지급 대상자 없음`);
    }

    // ========================================
    // Step 12: 처리 완료
    // ========================================
    console.log('\n[Step 12] 처리 완료');
    console.log('='.repeat(80));

    const allPlans = [...registrantPlans, ...promotionPlans];

    logger.info(`=== 용역자 등록 처리 완료 (v7.0 모듈화) ===`, {
      신규등록: updatedUsers.length,
      등급변경: changedUsers.length,
      승급자: promoted.length,
      지급계획: allPlans.length,
      추가계획: additionalPaymentsInfo?.count || 0
    });

    console.log(`\n✅ 등록 처리 완료`);
    console.log(`  - 신규 등록: ${updatedUsers.length}명`);
    console.log(`  - 등급 변경: ${changedUsers.length}명`);
    console.log(`  - 승급자: ${promoted.length}명`);
    console.log(`  - 지급 계획: ${allPlans.length}건`);
    console.log(`  - 추가지급: ${additionalPaymentsInfo?.count || 0}건`);
    console.log('='.repeat(80));

    return {
      success: true,
      registeredUsers: updatedUsers.length,
      affectedUsers: changedUsers.length,
      promotedUsers: promoted.length,
      paymentPlans: allPlans,
      additionalPlans: additionalPaymentsInfo?.count || 0
    };

  } catch (error) {
    logger.error('용역자 등록 처리 실패:', error);
    console.error('❌ 등록 처리 실패:', error);
    throw error;
  }
}

/**
 * 헬퍼 함수: Initial 계획 생성 (원래 등급 사용)
 */
async function createInitialPaymentPlanWithGrade(userId, userName, grade, registrationDate) {
  const { createInitialPaymentPlan } = await import('./paymentPlanService.js');
  return createInitialPaymentPlan(userId, userName, grade, registrationDate);
}

/**
 * 헬퍼 함수: Promotion 계획 생성 (updatedMonthlyReg 전달)
 */
async function createPromotionPaymentPlanWithMonthlyReg(userId, userName, grade, promotionDate, updatedMonthlyReg) {
  const { createPromotionPaymentPlan } = await import('./paymentPlanService.js');
  return createPromotionPaymentPlan(userId, userName, grade, promotionDate, updatedMonthlyReg);
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
    const { MonthlyTreeSnapshots } = await import('../models/MonthlyTreeSnapshots.js');
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
