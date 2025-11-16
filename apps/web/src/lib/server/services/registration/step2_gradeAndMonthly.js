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
import PlannerCommission from '../../models/PlannerCommission.js';
import PlannerAccount from '../../models/PlannerAccount.js';

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
	const promotedRaw = changedUsers.filter((u) => {
		return u.changeType === 'grade_change' && u.oldGrade && u.newGrade && u.oldGrade < u.newGrade;
	});

	// ⭐ 디버깅: promotedRaw 확인
	console.log(`\n🔍 changedUsers: ${changedUsers.length}건`);
	console.log(`🔍 promotedRaw: ${promotedRaw.length}건`);
	if (promotedRaw.length > 0 && promotedRaw.length <= 25) {
		console.log('🔍 promotedRaw 내용:');
		promotedRaw.forEach((p, idx) => {
			console.log(`  ${idx + 1}. ${p.userName} (userId: ${p.userId?.substring(0, 8)}...) ${p.oldGrade} → ${p.newGrade}`);
		});
	}

	// ⭐ 중복 제거: 같은 사용자가 여러 번 승급 시 (최초 oldGrade, 최종 newGrade만 사용)
	const promotedMap = new Map();
	for (const p of promotedRaw) {
		if (!promotedMap.has(p.userId)) {
			// 첫 승급 기록
			promotedMap.set(p.userId, {
				userId: p.userId,
				userName: p.userName,
				changeType: p.changeType,
				oldGrade: p.oldGrade,  // 최초 등급
				newGrade: p.newGrade   // 현재 등급 (계속 업데이트됨)
			});
		} else {
			// 이미 있으면 newGrade만 업데이트 (oldGrade는 최초값 유지)
			const existing = promotedMap.get(p.userId);
			console.log(`    🔄 다단계 승급 감지: ${p.userName} (${existing.oldGrade} → ${existing.newGrade} → ${p.newGrade})`);
			existing.newGrade = p.newGrade;
		}
	}
	const promoted = Array.from(promotedMap.values());
	
	// ⭐ 디버깅: 최종 promoted 배열 확인
	console.log(`\n📊 Step2 승급자 처리 결과:`);
	console.log(`  - 원본 승급 이벤트: ${promotedRaw.length}건`);
	console.log(`  - 최종 승급자: ${promoted.length}명`);
	if (promoted.length > 0 && promoted.length < 10) {
		promoted.forEach(p => {
			console.log(`    → ${p.userName}: ${p.oldGrade} → ${p.newGrade}`);
		});
	}

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

	// 2-9. 설계사 수당 통계 업데이트
	await updatePlannerCommissions(users, registrationMonth);

	console.log(`\nSTEP2  [${registrationMonth} 월별 인원 현황]`);
	console.log(`  - 전체 등록자: ${monthlyReg.registrationCount}명`);
	// 등록자 이름 출력
	const registrantNames = monthlyReg.registrations.map((r) => r.userName).join(', ');
	console.log(`    → 등록자: ${registrantNames}`);
	console.log(`  - 승급자: ${monthlyReg.promotedCount}명`);
	// 승급자 이름 출력
	if (promoted.length > 0) {
		const promotedNames = promoted.map((p) => p.userName).join(', '); // ⭐ userName 사용
		console.log(`    → 승급자: ${promotedNames}`);
	}
	console.log(`  - 미승급자: ${monthlyReg.nonPromotedCount}명`);
	console.log(`  - 매출: ${monthlyReg.totalRevenue.toLocaleString()}원`);
	console.log('-'.repeat(80));

	return {
		promoted,
		monthlyReg,
		registrationMonth
	};
}

/**
 * 설계사 수당 통계 업데이트
 *
 * @param {Array} users - 이번 배치 등록자 배열
 * @param {string} registrationMonth - 귀속월 (YYYY-MM)
 */
async function updatePlannerCommissions(users, registrationMonth) {
	console.log(`\n💰 [Step2-9] 설계사 수당 통계 업데이트: ${registrationMonth}`);
	console.log(`  📋 전달된 사용자: ${users.length}명`);

	// 설계사별로 그룹화
	const plannerMap = new Map();

	for (const user of users) {
		if (!user.plannerAccountId) {
			console.log(`  ⚠️ 설계사 정보 없음: ${user.name} (${user._id})`);
			continue;
		}

		// 설계사 정보 조회
		const plannerAccount = await PlannerAccount.findById(user.plannerAccountId);
		const plannerName = plannerAccount ? plannerAccount.name : user.plannerAccountId;
		console.log(`  👤 ${user.name}: 설계사 = ${plannerName}`);

		const plannerIdStr = user.plannerAccountId.toString();

		if (!plannerMap.has(plannerIdStr)) {
			plannerMap.set(plannerIdStr, []);
		}

		plannerMap.get(plannerIdStr).push(user);
	}

	console.log(`  📊 설계사 수: ${plannerMap.size}명`);

	// 각 설계사별로 PlannerCommission 업데이트
	for (const [plannerIdStr, plannerUsers] of plannerMap.entries()) {
		try {
			// 설계사 정보 조회
			const plannerAccount = await PlannerAccount.findById(plannerIdStr);
			if (!plannerAccount) {
				console.log(`  ⚠️ 설계사 계정 없음: ${plannerIdStr}`);
				continue;
			}

			// PlannerCommission 찾기 또는 생성
			let commission = await PlannerCommission.findOne({
				plannerAccountId: plannerIdStr,
				revenueMonth: registrationMonth
			});

			if (!commission) {
				commission = new PlannerCommission({
					plannerAccountId: plannerIdStr,
					plannerName: plannerAccount.name,
					revenueMonth: registrationMonth,
					users: []  // ⭐ 명시적으로 초기화
				});
			}

			// users 배열이 undefined면 초기화
			if (!commission.users) {
				commission.users = [];
			}

			// 용역자 추가
			for (const user of plannerUsers) {
				const userIdStr = user._id.toString();

				// 중복 확인
				const exists = commission.users.some(u => u.userId === userIdStr);
				if (!exists) {
					commission.users.push({
						userId: userIdStr,
						userName: user.name,
						registrationDate: user.registrationDate || user.createdAt,
						revenue: 1000000,
						commission: 100000
					});

					console.log(`  ✅ ${plannerAccount.name} ← ${user.name} (수당: 100,000원)`);
				}
			}

			// 통계 재계산
			commission.totalUsers = commission.users.length;
			commission.totalRevenue = commission.users.reduce((sum, u) => sum + (u.revenue || 0), 0);
			commission.totalCommission = commission.users.reduce((sum, u) => sum + (u.commission || 0), 0);

			// 저장
			await commission.save();

			console.log(`  💰 ${plannerAccount.name} 총 수당: ${commission.totalCommission.toLocaleString()}원 (${commission.totalUsers}명)`);

		} catch (error) {
			console.error(`  ❌ 설계사 수당 업데이트 실패 (${plannerIdStr}):`, error.message);
		}
	}

	console.log(`✅ [Step2-9] 설계사 수당 통계 업데이트 완료\n`);
}
