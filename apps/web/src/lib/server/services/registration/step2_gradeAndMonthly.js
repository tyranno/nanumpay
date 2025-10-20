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
	// 2-1. 등급 재계산 (전체 사용자)
	const gradeChangeResult = await recalculateAllGrades();
	const changedUsers = gradeChangeResult.changedUsers || [];

	// 승급자 필터링 (등급 상승한 사람들)
	const promoted = changedUsers.filter((u) => {
		return u.changeType === 'grade_change' && u.oldGrade && u.newGrade && u.oldGrade < u.newGrade;
	});

	// 2-2. 귀속월 파악
	const registrationMonth = MonthlyRegistrations.generateMonthKey(
		users[0]?.registrationDate || users[0]?.createdAt || new Date()
	);

	// 2-3. 월별 등록자 관리 (MonthlyRegistrations)
	let monthlyReg = await MonthlyRegistrations.findOne({ monthKey: registrationMonth });

	if (!monthlyReg) {
		// 해당 월 최초 등록 (스키마 default 값 사용)
		monthlyReg = new MonthlyRegistrations({ monthKey: registrationMonth });
	}

	// 2-4. 이번 배치 등록자 추가
	for (const user of users) {
		const userIdStr = user._id.toString(); // ⭐ v8.0: _id 사용

		// 승급 여부 확인
		const promotion = promoted.find((p) => p.userId === userIdStr);
		const currentGrade = promotion ? promotion.newGrade : 'F1';

		// position 값 변환 (L/R/ROOT → left/right/root)
		let positionValue = user.position;
		if (positionValue === 'L') positionValue = 'left';
		else if (positionValue === 'R') positionValue = 'right';
		else if (positionValue === 'ROOT') positionValue = 'root';

		// 기존 등록자 확인
		const existingIdx = monthlyReg.registrations.findIndex((r) => r.userId === userIdStr);

		if (existingIdx >= 0) {
			// ⭐ 이미 등록되어 있으면 등급만 업데이트 (승급 시)
			if (promotion) {
				monthlyReg.registrations[existingIdx].grade = currentGrade;
			}
		} else {
			// 신규 등록
			monthlyReg.registrations.push({
				userId: userIdStr, // ⭐ v8.0: _id 사용
				userName: user.name,
				registrationDate: user.registrationDate || user.createdAt,
				grade: currentGrade, // 현재 등급 (승급 후)
				position: positionValue
			});
			monthlyReg.registrationCount++;
		}
	}

	// ⭐ 2-4-2. 기존 등록자 중 승급자 등급 업데이트 (users 배열에 없는 경우)
	for (const prom of promoted) {
		const existingIdx = monthlyReg.registrations.findIndex((r) => r.userId === prom.userId);
		if (existingIdx >= 0) {
			// users 배열에 있는 경우는 위에서 이미 처리됨
			const isInUsers = users.find((u) => u._id.toString() === prom.userId); // ⭐ v8.0: _id 사용
			if (!isInUsers) {
				monthlyReg.registrations[existingIdx].grade = prom.newGrade;
			}
		}
	}

	// 2-5. 매출 업데이트 (등록자 수 × 1,000,000)
	monthlyReg.totalRevenue = monthlyReg.registrationCount * 1000000;

	// 2-6. 승급자 수 계산 (이번 달 등록자 중 승급한 사람)
	const registrantIds = monthlyReg.registrations.map((r) => r.userId);
	const promotedThisMonth = promoted.filter((p) => registrantIds.includes(p.userId));
	monthlyReg.promotedCount = promotedThisMonth.length;

	// 2-7. 미승급자 수 계산 (이번 달 등록자 중 승급 안 한 사람)
	monthlyReg.nonPromotedCount = monthlyReg.registrationCount - monthlyReg.promotedCount;

	// 2-8. 저장
	await monthlyReg.save();

	// console.log(`\nSTEP2  [${registrationMonth} 월별 인원 현황]`);
	// console.log(`  - 전체 등록자: ${monthlyReg.registrationCount}명`);
	// // 등록자 이름 출력
	// const registrantNames = monthlyReg.registrations.map((r) => r.userName).join(', ');
	// console.log(`    → 등록자: ${registrantNames}`);
	// console.log(`  - 승급자: ${monthlyReg.promotedCount}명`);
	// // 승급자 이름 출력
	// if (promoted.length > 0) {
	// 	const promotedNames = promoted.map((p) => p.name || p.userId).join(', ');
	// 	console.log(`    → 승급자: ${promotedNames}`);
	// }
	// console.log(`  - 미승급자: ${monthlyReg.nonPromotedCount}명`);
	// console.log(`  - 매출: ${monthlyReg.totalRevenue.toLocaleString()}원`);
	// console.log('-'.repeat(80));

	return {
		promoted,
		monthlyReg,
		registrationMonth
	};
}
