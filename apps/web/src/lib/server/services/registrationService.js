/**
 * 용역자 등록 서비스 v7.0
 * 등록, 등급 계산, 스냅샷 업데이트, 지급 계획 생성, 매월 추가지급 확인 통합 처리
 */

import User from '../models/User.js';
import MonthlyRegistrations from '../models/MonthlyRegistrations.js';
import MonthlyTreeSnapshots from '../models/MonthlyTreeSnapshots.js';
import WeeklyPaymentPlans from '../models/WeeklyPaymentPlans.js';
import { recalculateAllGrades } from './gradeCalculation.js';
import {
  createInitialPaymentPlan,
  createPromotionPaymentPlan,
  createMonthlyAdditionalPayments
} from './paymentPlanService.js';
import { excelLogger as logger } from '../logger.js';

/**
 * 용역자 등록 시 전체 프로세스 처리
 */
export async function processUserRegistration(userIds) {
  try {
    logger.info(`=== 용역자 등록 처리 시작 (v7.0) ===`, {
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
    const changedUsers = gradeChangeResult.changedUsers || [];

    logger.info(`등급 재계산 완료: ${changedUsers.length}명 변경`);

    // 3. 등급 재계산 후 users 정보 다시 조회 (최신 등급 반영)
    const updatedUsers = await User.find({ _id: { $in: userIds } });
    console.log('[등록처리 2단계] 등급 재계산 후 사용자 정보:');
    updatedUsers.forEach(u => {
      console.log(`  - ${u.name} (${u.loginId}), 등급: ${u.grade}`);
    });

    // 4. 월별 등록 정보 업데이트 (최신 등급으로)
    await updateMonthlyRegistrations(updatedUsers);

    // 5. 월별 트리 스냅샷 업데이트
    await updateMonthlyTreeSnapshots(updatedUsers, changedUsers);

    // 6. 지급 계획 처리
    console.log('[등록처리 6단계] 지급 계획 생성 시작');
    const paymentPlanResults = [];

    // 6-1. 신규 등록자 Initial 계획 생성 (원래 등록 등급으로)
    for (const user of updatedUsers) {
      // ⭐ 중요: Initial은 원래 등록 등급으로 생성
      const changedUser = changedUsers.find(c => c.userId === user.loginId);
      const originalGrade = changedUser?.oldGrade || user.grade;

      console.log(`[등록처리 6-1] ${user.name}의 Initial 지급 계획 생성 시작`);
      console.log(`  - 등록일: ${user.registrationDate?.toISOString().split('T')[0]}`);
      console.log(`  - 원래 등급: ${originalGrade}`);

      const plan = await createInitialPaymentPlan(
        user.loginId,
        user.name,
        originalGrade,  // 원래 등급 사용
        user.registrationDate || user.createdAt
      );

      console.log(`[등록처리 6-1] 지급 계획 생성 완료: ${plan.installments.length}개 할부`);
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

    // 6-2. 승급자 필터링
    const promotedUsers = changedUsers.filter(u =>
      u.changeType === 'grade_change' &&
      u.oldGrade &&
      u.newGrade &&
      u.oldGrade < u.newGrade
    );

    // 현재 등록 배치의 가장 최근 등록일을 승급일로 사용
    const promotionDate = updatedUsers.reduce((latest, user) => {
      const userDate = user.registrationDate || user.createdAt;
      return userDate > latest ? userDate : latest;
    }, updatedUsers[0]?.registrationDate || updatedUsers[0]?.createdAt || new Date());

    // 6-3. 승급자의 등급 분포만 업데이트 (매출은 등록자 수 기준!)
    // ⭐ 핵심: 승급자는 registrations에 추가하지 않음! (매출 기여 안 함)
    // ⭐ 단, gradeDistribution에는 반영하여 지급액 계산에 포함!
    let updatedMonthlyReg = null;  // ⭐ 6-4에서 사용할 변수
    if (promotedUsers.length > 0) {
      console.log(`[등록처리 6-3] 승급자 ${promotedUsers.length}명의 등급 분포 업데이트`);
      const promotionMonthKey = MonthlyRegistrations.generateMonthKey(promotionDate);

      let monthlyReg = await MonthlyRegistrations.findOne({ monthKey: promotionMonthKey });

      if (!monthlyReg) {
        console.log(`  [ERROR] ${promotionMonthKey} MonthlyRegistrations가 없습니다!`);
      } else {
        console.log(`  [확인] ${promotionMonthKey} 현재 등록자 수: ${monthlyReg.registrationCount}명`);
        console.log(`  [확인] 현재 매출: ${monthlyReg.totalRevenue.toLocaleString()}원`);

        // ⭐ 중요: registrations는 건드리지 않음! (등록자 수/매출 유지)
        // 등급 분포만 재계산 (등록자 + 승급자 포함)
        const gradeDistribution = {
          F1: 0, F2: 0, F3: 0, F4: 0,
          F5: 0, F6: 0, F7: 0, F8: 0
        };

        // 1) 현재 등록자들의 등급 카운트
        for (const reg of monthlyReg.registrations) {
          if (gradeDistribution[reg.grade] !== undefined) {
            gradeDistribution[reg.grade]++;
          }
        }

        console.log(`  [1단계] 등록자 기준 등급 분포: ${JSON.stringify(gradeDistribution)}`);

        // v7.0: paymentTargets 초기화 (없으면 생성)
        if (!monthlyReg.paymentTargets) {
          monthlyReg.paymentTargets = {
            registrants: [],
            promoted: [],
            additionalPayments: []
          };
        }

        // 2) 승급자 추가 카운트 (이번 배치 제외!)
        for (const promoted of promotedUsers) {
          const isInCurrentBatch = updatedUsers.some(u => u.loginId === promoted.userId);
          if (isInCurrentBatch) {
            console.log(`  [SKIP] ${promoted.userName}는 현재 등록 배치에 포함 (이미 등급 분포에 포함됨)`);
            continue;
          }

          // ⭐ 핵심: 승급 전 등급 감소, 승급 후 등급 증가
          if (gradeDistribution[promoted.oldGrade] !== undefined && gradeDistribution[promoted.oldGrade] > 0) {
            gradeDistribution[promoted.oldGrade]--;
          }
          if (gradeDistribution[promoted.newGrade] !== undefined) {
            gradeDistribution[promoted.newGrade]++;
          }

          console.log(`  [승급 반영] ${promoted.userName}: ${promoted.oldGrade}(-1) → ${promoted.newGrade}(+1)`);

          // v7.0: paymentTargets.promoted에 추가
          monthlyReg.paymentTargets.promoted.push({
            userId: promoted.userId,
            userName: promoted.userName,
            oldGrade: promoted.oldGrade,
            newGrade: promoted.newGrade,
            promotionDate: promotionDate
          });
          
          console.log(`  [v7.0] ✓ ${promoted.userName} 승급자로 추가: ${promoted.oldGrade} → ${promoted.newGrade}`);
        }

        monthlyReg.gradeDistribution = gradeDistribution;
        console.log(`  [2단계] 승급 반영 후 등급 분포: ${JSON.stringify(gradeDistribution)}`);

        // 등급별 지급액 재계산 (매출은 그대로, 등급 분포만 변경!)
        const revenue = monthlyReg.getEffectiveRevenue();
        monthlyReg.gradePayments = calculateGradePayments(revenue, gradeDistribution);

        await monthlyReg.save();
        updatedMonthlyReg = monthlyReg;  // ⭐ 저장 후 변수에 저장!

        console.log(`  [최종] ${promotionMonthKey} 등록자 수: ${monthlyReg.registrationCount}명 (변경 없음)`);
        console.log(`  [최종] 매출: ${revenue.toLocaleString()}원 (변경 없음)`);
        console.log(`  [최종] 등급 분포: ${JSON.stringify(gradeDistribution)}`);
        console.log(`  [최종] F1 지급액: ${(monthlyReg.gradePayments?.F1 || 0).toLocaleString()}원`);
        console.log(`  [최종] F2 지급액: ${(monthlyReg.gradePayments?.F2 || 0).toLocaleString()}원`);
      }
    }

    // 6-4. Promotion 계획 생성 (6-3 이후 실행되므로 올바른 금액 계산됨!)
    console.log(`[등록처리 6-4] 승급자 ${promotedUsers.length}명 Promotion 계획 생성 시작`);
    for (const promoted of promotedUsers) {
      console.log(`  - ${promoted.userName}: ${promoted.oldGrade} → ${promoted.newGrade}`);
      const user = await User.findOne({ loginId: promoted.userId });
      if (user) {
        // ⭐ 중요: 업데이트된 monthlyReg 객체를 직접 전달!
        const promotionPlan = await createPromotionPaymentPlan(
          user.loginId,
          user.name,
          promoted.newGrade,
          promotionDate,  // 현재 배치의 등록일 사용
          updatedMonthlyReg  // ⭐ 업데이트된 매출 데이터 전달
        );
        console.log(`  - Promotion 계획 생성 완료: ${promotionPlan._id} (매출월: ${promotionPlan.revenueMonth}, 금액: ${promotionPlan.installments[0]?.installmentAmount || 0}원)`);

        // ⭐ 중요: 같은 달에 등록+승급이 일어난 경우, Initial 계획 삭제!
        const initialPlan = await WeeklyPaymentPlans.findOne({
          userId: user.loginId,
          planType: 'initial',
          revenueMonth: promotionPlan.revenueMonth  // 같은 매출월
        });

        if (initialPlan) {
          console.log(`  [삭제] ${user.name}의 Initial 계획 삭제 (같은 달 등록+승급) - ID: ${initialPlan._id}`);
          await WeeklyPaymentPlans.deleteOne({ _id: initialPlan._id });
          // paymentPlanResults에서도 제거
          const index = paymentPlanResults.findIndex(p => p.plan.equals(initialPlan._id));
          if (index > -1) {
            paymentPlanResults.splice(index, 1);
          }
        }

        paymentPlanResults.push({
          userId: user.loginId,
          type: 'promotion',
          plan: promotionPlan._id
        });
      }
    }

    // 7. v7.0: 매월 추가지급 확인 (이전 월 대상자 중 승급 없는 자)
    console.log('[등록처리 7단계] v7.0 매월 추가지급 확인 시작');
    console.log('='.repeat(80));
    console.log('📋 v7.0 핵심 로직: 매월 승급 없는 대상자에게 추가지급 생성');
    console.log('='.repeat(80));

    // ⭐ 핵심: 등록 월을 기준으로 이전 월 확인 (시스템 날짜 X)
    // 8월 등록 시 → 7월 대상자 확인
    const registrationMonth = MonthlyRegistrations.generateMonthKey(
      updatedUsers[0]?.registrationDate || updatedUsers[0]?.createdAt || new Date()
    );
    console.log(`  등록 월: ${registrationMonth}`);

    // 매월 추가지급 생성 (이전 월 대상자 확인)
    const additionalPaymentsInfo = await createMonthlyAdditionalPayments(registrationMonth);
    
    console.log('='.repeat(80));

    console.log(`[등록처리 7단계] v7.0 매월 추가지급 생성 완료: ${additionalPaymentsInfo?.count || 0}건`);

    // ⭐ 8단계: 현재 월(registrationMonth) MonthlyRegistrations에 추가지급 대상자 추가 및 등급 분포 재계산
    if (additionalPaymentsInfo && additionalPaymentsInfo.targets && additionalPaymentsInfo.targets.length > 0) {
      console.log(`[등록처리 8단계] ${registrationMonth} 등급 분포에 추가지급 대상자 반영 시작`);
      console.log(`  ⚠️ 중요: 6-3단계에서 이미 승급자 반영되었으므로, 현재 등급 분포에 추가지급 대상자만 추가!`);

      const currentMonthReg = await MonthlyRegistrations.findOne({ monthKey: registrationMonth });
      if (currentMonthReg) {
        console.log(`  [현재 상태] 등급 분포: ${JSON.stringify(currentMonthReg.gradeDistribution)}`);

        // paymentTargets.additionalPayments 추가
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
        for (const target of additionalPaymentsInfo.targets) {
          currentMonthReg.paymentTargets.additionalPayments.push({
            userId: target.userId,
            userName: target.userName,
            grade: target.grade,
            추가지급단계: target.추가지급단계,
            fromMonth: target.revenueMonth  // 어느 월 매출 기준인지
          });
          console.log(`  ✓ ${target.userName} (${target.grade}, 추가지급단계:${target.추가지급단계}, 매출월:${target.revenueMonth})`);
        }

        // ⭐ 핵심: 기존 등급 분포에 추가지급 대상자만 추가!
        // 승급자는 이미 6-3단계에서 반영되었음!
        const gradeDistribution = { ...currentMonthReg.gradeDistribution };  // 기존 분포 복사

        console.log(`  [1단계] 기존 등급 분포 (등록자+승급자): ${JSON.stringify(gradeDistribution)}`);

        // 추가지급 대상자만 카운트
        for (const additional of currentMonthReg.paymentTargets.additionalPayments) {
          if (gradeDistribution[additional.grade] !== undefined) {
            gradeDistribution[additional.grade]++;
            console.log(`    ➕ ${additional.userName} (${additional.grade}) 추가`);
          }
        }

        console.log(`  [2단계] 추가지급 대상자 추가 후: ${JSON.stringify(gradeDistribution)}`);

        // 등급 분포 및 지급액 업데이트
        currentMonthReg.gradeDistribution = gradeDistribution;
        const revenue = currentMonthReg.getEffectiveRevenue();
        currentMonthReg.gradePayments = calculateGradePayments(revenue, gradeDistribution);

        console.log(`  [최종] 매출: ${revenue.toLocaleString()}원`);
        console.log(`  [최종] 등급 분포: ${JSON.stringify(gradeDistribution)}`);
        console.log(`  [최종] F1 지급액: ${(currentMonthReg.gradePayments?.F1 || 0).toLocaleString()}원`);
        console.log(`  [최종] F2 지급액: ${(currentMonthReg.gradePayments?.F2 || 0).toLocaleString()}원`);

        await currentMonthReg.save();
        console.log(`  ✅ ${registrationMonth} 등급 분포 업데이트 완료`);
      } else {
        console.log(`  ⚠️ ${registrationMonth} MonthlyRegistrations 없음 - 건너뜀`);
      }
    }

    // 8. 처리 완료

    logger.info(`=== 용역자 등록 처리 완료 ===`, {
      신규등록: updatedUsers.length,
      등급변경: changedUsers.length,
      승급자: promotedUsers.length,
      지급계획: paymentPlanResults.length,
      추가계획: additionalPaymentsInfo?.count || 0
    });

    return {
      success: true,
      registeredUsers: updatedUsers.length,
      affectedUsers: changedUsers.length,
      promotedUsers: promotedUsers.length,
      paymentPlans: paymentPlanResults,
      additionalPlans: additionalPaymentsInfo?.count || 0
    };

  } catch (error) {
    logger.error('용역자 등록 처리 실패:', error);
    throw error;
  }
}

/**
 * 월별 등록 정보 업데이트 (v7.0: paymentTargets 구조 추가)
 */
async function updateMonthlyRegistrations(users) {
  console.log(`\n[updateMonthlyRegistrations] 함수 호출됨! 사용자 수: ${users.length}`);
  users.forEach(u => console.log(`  - ${u.name} (${u.loginId}), 등록일: ${(u.registrationDate || u.createdAt)?.toISOString().split('T')[0]}`));

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
      // 새로운 문서 생성 (v7.0: paymentTargets 구조 포함)
      monthlyReg = new MonthlyRegistrations({
        monthKey,
        registrationCount: 0,
        totalRevenue: 0,
        registrations: [],
        paymentTargets: {
          registrants: [],
          promoted: [],
          additionalPayments: []
        }
      });
    }

    // v7.0: paymentTargets 초기화 (없으면 생성)
    if (!monthlyReg.paymentTargets) {
      monthlyReg.paymentTargets = {
        registrants: [],
        promoted: [],
        additionalPayments: []
      };
    }

    // 등록자 추가
    monthlyReg.registrations.push(...registrations);
    monthlyReg.registrationCount = monthlyReg.registrations.length;
    monthlyReg.totalRevenue = monthlyReg.registrationCount * 1000000; // 100만원

    // v7.0: paymentTargets.registrants 업데이트 (등록자 정보)
    console.log(`  [v7.0] paymentTargets.registrants 업데이트 중... (${registrations.length}명)`);
    for (const reg of registrations) {
      monthlyReg.paymentTargets.registrants.push({
        userId: reg.userId,
        userName: reg.userName,
        grade: reg.grade
      });
      console.log(`    ✓ ${reg.userName} (${reg.userId}) - ${reg.grade} 등록자로 추가`);
    }

    // 등급 분포 계산 (v7.0: 지급 대상자 전체 기준)
    // ⭐ v7.0 핵심: 지급 대상자 = 등록자 + 승급자 + 추가지급 대상자
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
    console.log(`  [등급 분포 1단계] 등록자만: ${JSON.stringify(gradeDistribution)}`);

    // 2) 승급자 카운트 (v7.0: paymentTargets.promoted)
    if (monthlyReg.paymentTargets?.promoted) {
      for (const promoted of monthlyReg.paymentTargets.promoted) {
        if (gradeDistribution[promoted.newGrade] !== undefined) {
          gradeDistribution[promoted.newGrade]++;
        }
      }
      console.log(`  [등급 분포 2단계] 승급자 추가: ${JSON.stringify(gradeDistribution)}`);
    }

    // 3) 추가지급 대상자 카운트 (v7.0: paymentTargets.additionalPayments)
    if (monthlyReg.paymentTargets?.additionalPayments) {
      for (const additional of monthlyReg.paymentTargets.additionalPayments) {
        if (gradeDistribution[additional.grade] !== undefined) {
          gradeDistribution[additional.grade]++;
        }
      }
      console.log(`  [등급 분포 3단계] 추가지급 대상자 추가: ${JSON.stringify(gradeDistribution)}`);
    }

    console.log(`  [등급 분포 최종] ${JSON.stringify(gradeDistribution)}`)

    monthlyReg.gradeDistribution = gradeDistribution;

    // 등급별 지급액 계산
    const revenue = monthlyReg.getEffectiveRevenue();
    monthlyReg.gradePayments = calculateGradePayments(revenue, gradeDistribution);

    console.log(`  [updateMonthlyRegistrations] ${monthKey} 저장 시작`);
    console.log(`    - registrationCount: ${monthlyReg.registrationCount}`);
    console.log(`    - totalRevenue: ${monthlyReg.totalRevenue}`);
    console.log(`    - gradeDistribution: ${JSON.stringify(monthlyReg.gradeDistribution)}`);
    console.log(`    - isNew: ${monthlyReg.isNew}`);

    try {
      const savedDoc = await monthlyReg.save();
      console.log(`  [updateMonthlyRegistrations] ${monthKey} 저장 성공! ID: ${savedDoc._id}`);
    } catch (saveError) {
      console.error(`  [updateMonthlyRegistrations] ${monthKey} 저장 실패:`, saveError);
      throw saveError;
    }
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
  // ⭐ 수정: 등록자의 registrationDate 기준으로 월 키 생성
  const registrationDate = newUsers[0]?.registrationDate || newUsers[0]?.createdAt || new Date();
  const currentMonth = MonthlyRegistrations.generateMonthKey(registrationDate);

  console.log(`[updateMonthlyTreeSnapshots] 등록 월 키: ${currentMonth} (등록일: ${registrationDate.toISOString().split('T')[0]})`);

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

