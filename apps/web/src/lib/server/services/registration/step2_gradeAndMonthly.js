/**
 * Step 2: 등급 재계산 및 월별 인원 관리 ⭐ 핵심
 *
 * 역할:
 * 1. 전체 사용자 등급 재계산
 * 2. 승급자 추출
 * 3. 월별 인원 관리 (MonthlyRegistrations)
 * 4. 매출 계산 (등록자 수 × 1,000,000)
 */

import { recalculateAllGrades } from '../gradeCalculation.js';
import MonthlyRegistrations from '../../models/MonthlyRegistrations.js';

/**
 * Step 2 실행
 *
 * @param {Array} users - 이번 배치 등록자 배열 (User 모델)
 * @returns {Promise<Object>} { promoted, monthlyReg, registrationMonth }
 */
export async function executeStep2(users) {
  console.log('\n[Step 2] 등급 재계산 및 월별 인원 관리');
  console.log('='.repeat(80));

  // 2-1. 등급 재계산 (전체 사용자)
  const gradeChangeResult = await recalculateAllGrades();
  const changedUsers = gradeChangeResult.changedUsers || [];

  // 승급자 필터링 (등급 상승한 사람들)
  const promoted = changedUsers.filter(u => {
    return u.changeType === 'grade_change' &&
           u.oldGrade &&
           u.newGrade &&
           u.oldGrade < u.newGrade;
  });

  console.log(`  등급 재계산 완료`);
  console.log(`  - 전체 변경: ${changedUsers.length}명`);
  console.log(`  - 승급자: ${promoted.length}명`);
  promoted.forEach(p => {
    console.log(`    · ${p.userName}: ${p.oldGrade} → ${p.newGrade}`);
  });

  // 2-2. 귀속월 파악
  const registrationMonth = MonthlyRegistrations.generateMonthKey(
    users[0]?.registrationDate || users[0]?.createdAt || new Date()
  );
  console.log(`\n  귀속월: ${registrationMonth}`);

  // 2-3. 월별 등록자 관리 (MonthlyRegistrations)
  let monthlyReg = await MonthlyRegistrations.findOne({ monthKey: registrationMonth });

  if (!monthlyReg) {
    // 해당 월 최초 등록 (스키마 default 값 사용)
    monthlyReg = new MonthlyRegistrations({ monthKey: registrationMonth });
    console.log(`  ${registrationMonth} MonthlyRegistrations 생성`);
  }

  // 2-4. 이번 배치 등록자 추가
  console.log(`\n  [이번 배치 등록자 추가]`);
  for (const user of users) {
    // 중복 체크
    const exists = monthlyReg.registrations.find(r => r.userId === user.loginId);
    if (!exists) {
      // 승급 여부 확인
      const promotion = promoted.find(p => p.userId === user.loginId);
      const currentGrade = promotion ? promotion.newGrade : 'F1';

      monthlyReg.registrations.push({
        userId: user.loginId,
        userName: user.name,
        registrationDate: user.registrationDate || user.createdAt,
        grade: currentGrade,  // 현재 등급 (승급 후)
        position: user.position
      });
      monthlyReg.registrationCount++;
      console.log(`    + ${user.name} (${currentGrade}${promotion ? ' - 승급' : ''})`);
    }
  }

  // 2-5. 매출 업데이트 (등록자 수 × 1,000,000)
  monthlyReg.totalRevenue = monthlyReg.registrationCount * 1000000;

  // 2-6. 승급자 수 계산 (이번 달 등록자 중 승급한 사람)
  const registrantIds = monthlyReg.registrations.map(r => r.userId);
  const promotedThisMonth = promoted.filter(p => registrantIds.includes(p.userId));
  monthlyReg.promotedCount = promotedThisMonth.length;

  // 2-7. 미승급자 수 계산 (이번 달 등록자 중 승급 안 한 사람)
  monthlyReg.nonPromotedCount = monthlyReg.registrationCount - monthlyReg.promotedCount;

  // 2-8. 저장
  await monthlyReg.save();

  console.log(`\n  [${registrationMonth} 월별 인원 현황] ⭐`);
  console.log(`  - 전체 등록자: ${monthlyReg.registrationCount}명`);
  console.log(`  - 승급자: ${monthlyReg.promotedCount}명`);
  console.log(`  - 미승급자 (F1): ${monthlyReg.nonPromotedCount}명`);
  console.log(`  - 매출: ${monthlyReg.totalRevenue.toLocaleString()}원`);

  console.log('='.repeat(80));

  return {
    promoted,
    monthlyReg,
    registrationMonth
  };
}
