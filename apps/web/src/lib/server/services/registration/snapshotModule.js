/**
 * 스냅샷 모듈 v7.0
 *
 * 역할: 월별 등록 정보 및 트리 스냅샷 업데이트
 *
 * 기존 registrationService.js의 스냅샷 관련 로직 분리
 */

import User from '../../models/User.js';
import MonthlyRegistrations from '../../models/MonthlyRegistrations.js';
import MonthlyTreeSnapshots from '../../models/MonthlyTreeSnapshots.js';
import { calculateGradePayments } from '../../utils/paymentCalculator.js';
import { excelLogger as logger } from '../../logger.js';

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

/**
 * 월별 등록 정보 업데이트 (v7.0: paymentTargets 구조 추가)
 *
 * @param {Array} users - 등록된 User 모델 객체 배열
 * @returns {Promise<Object>} 업데이트된 monthlyReg 객체 (monthKey를 키로)
 */
export async function updateMonthlyRegistrations(users) {
  console.log(`\n[snapshotModule] updateMonthlyRegistrations 시작! 사용자 수: ${users.length}`);
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

  const updatedMonthlyRegs = {};

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

    console.log(`  [등급 분포 최종] ${JSON.stringify(gradeDistribution)}`);

    monthlyReg.gradeDistribution = gradeDistribution;

    // 등급별 지급액 계산
    const revenue = monthlyReg.getEffectiveRevenue();
    monthlyReg.gradePayments = calculateGradePayments(revenue, gradeDistribution);

    console.log(`  [snapshotModule] ${monthKey} 저장 시작`);
    console.log(`    - registrationCount: ${monthlyReg.registrationCount}`);
    console.log(`    - totalRevenue: ${monthlyReg.totalRevenue}`);
    console.log(`    - gradeDistribution: ${JSON.stringify(monthlyReg.gradeDistribution)}`);
    console.log(`    - isNew: ${monthlyReg.isNew}`);

    try {
      const savedDoc = await monthlyReg.save();
      console.log(`  [snapshotModule] ${monthKey} 저장 성공! ID: ${savedDoc._id}`);
      updatedMonthlyRegs[monthKey] = savedDoc;
    } catch (saveError) {
      console.error(`  [snapshotModule] ${monthKey} 저장 실패:`, saveError);
      throw saveError;
    }
  }

  return updatedMonthlyRegs;
}

/**
 * 월별 트리 스냅샷 업데이트
 *
 * @param {Array} newUsers - 신규 등록된 사용자들
 * @param {Array} affectedUsers - 등급이 변경된 사용자들
 */
export async function updateMonthlyTreeSnapshots(newUsers, affectedUsers) {
  // ⭐ 수정: 등록자의 registrationDate 기준으로 월 키 생성
  const registrationDate = newUsers[0]?.registrationDate || newUsers[0]?.createdAt || new Date();
  const currentMonth = MonthlyRegistrations.generateMonthKey(registrationDate);

  console.log(`[snapshotModule] updateMonthlyTreeSnapshots 등록 월 키: ${currentMonth} (등록일: ${registrationDate.toISOString().split('T')[0]})`);

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

  // ⚠️ v7.0 수정: MonthlyRegistrations 등급 분포는 여기서 업데이트하지 않음!
  // 이유: 추가지급 대상자가 아직 반영되지 않았기 때문
  // Step 8 (승급자)와 Step 11 (추가지급)에서 순차적으로 업데이트됨
  logger.info(`월별 트리 스냅샷 업데이트 완료: ${currentMonth}`, gradeDistribution);
}
