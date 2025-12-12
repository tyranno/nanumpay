/**
 * Step 3: 지급 대상자 확정 및 등급별 인원 구성
 *
 * 역할:
 * 1. 지급 대상자 3가지 확정:
 *    A. 승급자 (promoted)
 *    B. 미승급 등록자 (이번 달 등록자 중 승급 안 한 사람)
 *    C. 추가지급 대상자 (이전 달 대상자 중 이번 달 승급 안 한 사람)
 * 2. 중복 제거 (이미 각 그룹으로 분리됨)
 * 3. 등급별 지급 대상 인원 집계
 * 4. 등급별 1회 지급 금액 산출
 */

import User from '../../models/User.js';
import MonthlyRegistrations from '../../models/MonthlyRegistrations.js';
import WeeklyPaymentPlans from '../../models/WeeklyPaymentPlans.js';
import { calculateGradePayments } from '../../utils/paymentCalculator.js';
import { GRADE_LIMITS, MAX_ADDITIONAL_PAYMENTS } from '../../utils/constants.js';

/**
 * Step 3 실행
 *
 * @param {Array} promoted - Step 2에서 추출한 승급자 배열
 * @param {Object} monthlyReg - Step 2에서 업데이트한 MonthlyRegistrations
 * @param {string} registrationMonth - 귀속월 (YYYY-MM)
 * @returns {Promise<Object>}
 */
export async function executeStep3(promoted, monthlyReg, registrationMonth) {
	// A. 승급자 (이번 달 전체 승급자 = 기존 + 신규)
	// ⚠️ 이번 배치의 승급자를 기존 승급자 목록에 누적
	const existingPromoted = monthlyReg.paymentTargets?.promoted || [];

	// ⭐ promoted 배열의 userId 목록
	const promotedUserIds = promoted.map(p => p.userId);

	// ⭐ 기존 승급자 중 이번에 다시 승급한 사람 제외 (업데이트될 예정)
	const unchangedPromoted = existingPromoted.filter(p => !promotedUserIds.includes(p.userId));

	const promotedTargets = [
		...unchangedPromoted.map(p => ({
			userId: p.userId,
			userName: p.userName,
			grade: p.newGrade || p.grade,
			oldGrade: p.oldGrade,
			type: 'promoted'
		})),
		...promoted.map(p => ({
			userId: p.userId,
			userName: p.userName,
			grade: p.newGrade,
			oldGrade: p.oldGrade,
			type: 'promoted'
		}))
	];

	// B. 미승급 등록자
	const promotedIds = promotedTargets.map(p => p.userId);
	const registrantF1Targets = monthlyReg.registrations
		.filter((r) => !promotedIds.includes(r.userId))
		.map((r) => ({
			userId: r.userId,
			userName: r.userName,
			grade: r.grade,
			type: 'registrant_f1'
		}));

	// C. 추가지급 대상자
	const additionalTargets = await findAdditionalPaymentTargets(promotedTargets, registrationMonth);

	// 등급별 인원 집계
	const gradeDistribution = {
		F1: 0,
		F2: 0,
		F3: 0,
		F4: 0,
		F5: 0,
		F6: 0,
		F7: 0,
		F8: 0
	};

	promotedTargets.forEach((t) => {
		if (gradeDistribution[t.grade] !== undefined) {
			gradeDistribution[t.grade]++;
		}
	});

	registrantF1Targets.forEach((t) => {
		gradeDistribution.F1++;
	});

	additionalTargets.forEach((t) => {
		if (gradeDistribution[t.grade] !== undefined) {
			gradeDistribution[t.grade]++;
		}
	});

	// 등급별 지급 금액 산출
	const revenue = monthlyReg.getEffectiveRevenue();
	const gradePayments = calculateGradePayments(revenue, gradeDistribution);

	// ⭐ v8.0: adjustedGradePayments가 있으면 조정값 우선 사용
	if (monthlyReg.adjustedGradePayments) {
		for (const [grade, adjustment] of Object.entries(monthlyReg.adjustedGradePayments)) {
			if (adjustment && adjustment.totalAmount !== null && adjustment.totalAmount !== undefined) {
				// 조정값이 설정된 등급은 조정값 사용 (0 포함)
				gradePayments[grade] = adjustment.totalAmount;
				console.log(`  [Step3] ${grade} 조정값 적용: ${adjustment.totalAmount.toLocaleString()}원`);
			}
		}
	}

	// MonthlyRegistrations에 저장
	monthlyReg.paymentTargets.registrants = registrantF1Targets.map((t) => ({
		userId: t.userId,
		userName: t.userName,
		grade: t.grade
	}));

	monthlyReg.paymentTargets.promoted = promotedTargets.map((t) => ({
		userId: t.userId,
		userName: t.userName,
		oldGrade: t.oldGrade,
		newGrade: t.grade,
		promotionDate: new Date()
	}));

	monthlyReg.paymentTargets.additionalPayments = additionalTargets.map((t) => ({
		userId: t.userId,
		userName: t.userName,
		grade: t.grade,
		추가지급단계: t.추가지급단계 || 1
	}));

	monthlyReg.gradeDistribution = gradeDistribution;
	monthlyReg.gradePayments = gradePayments;

	await monthlyReg.save();

	// ========================================
	// Step 3 결과 로그 출력
	// ========================================
	console.log(`\nSTEP3  [${registrationMonth} 지급 대상자 분류]`);
	// A. 승급자
	console.log(`  - 승급자: ${promotedTargets.length}명`);
	if (promotedTargets.length > 0) {
		const names = promotedTargets.map((t) => `${t.userName}(${t.oldGrade}→${t.grade})`).join(', ');
		console.log(`    → ${names}`);
	}
	// B. 미승급 등록자
	console.log(`  - 미승급 등록자: ${registrantF1Targets.length}명`);
	if (registrantF1Targets.length > 0) {
		const names = registrantF1Targets.map((t) => `${t.userName}(${t.grade})`).join(', ');
		console.log(`    → ${names}`);
	}
	// C. 추가지급 대상자
	console.log(`  - 추가지급 대상자: ${additionalTargets.length}명`);
	if (additionalTargets.length > 0) {
		const names = additionalTargets
			.map((t) => `${t.userName}(${t.grade},${t.추가지급단계}차)`)
			.join(', ');
		console.log(`    → ${names}`);
	}
	// 등급별 분포
	console.log(`  - 등급별 지급 대상 인원:`);
	Object.entries(gradeDistribution).forEach(([grade, count]) => {
		if (count > 0) {
			const amount = gradePayments[grade] || 0;
			console.log(`    → ${grade}: ${count}명 × ${amount.toLocaleString()}원/회`);
		}
	});
	console.log('='.repeat(80));

	return {
		promotedTargets,
		registrantF1Targets,
		additionalTargets,
		gradeDistribution,
		gradePayments
	};
}

/**
 * 추가지급 대상자 찾기 (2번안: User.gradeHistory 활용)
 *
 * ⭐ 핵심 룰: "이 등급으로 몇 개월째인가?"
 *   0개월째 (승급/등록월) → 기본지급
 *   1개월째 → 추가1차
 *   2개월째 → 추가2차
 *   ...
 *   N개월째 → 추가N차 (최대 차수까지)
 *
 * ⭐ 장점:
 *   - User 테이블 1회 조회로 완료 (O(N) vs O(32N))
 *   - gradeHistory.revenueMonth로 등급 시작월 직접 계산
 *   - MonthlyRegistrations 탐색 불필요
 *
 * @param {Array} promoted - 이번 달 승급자 배열
 * @param {string} registrationMonth - 현재 귀속월 (YYYY-MM)
 * @returns {Promise<Array>}
 */
async function findAdditionalPaymentTargets(promoted, registrationMonth) {
	const additionalTargets = [];

	// 1. 현재 월 등록 데이터 조회 (등록자 제외용)
	const currentMonthlyReg = await MonthlyRegistrations.findOne({
		monthKey: registrationMonth
	});

	// 2. 제외 대상 ID 수집 (승급자 + 등록자)
	const excludeIds = new Set([
		...promoted.map((p) => p.userId),
		...(currentMonthlyReg?.registrations || []).map((r) => r.userId)
	]);

	// 3. 전체 active 사용자 조회 (1회!)
	const users = await User.find({
		status: 'active',
		_id: { $nin: Array.from(excludeIds) }
	});

	// 4. 각 사용자별 추가지급 판단
	for (const user of users) {
		// gradeHistory에서 현재 등급 시작월 가져오기
		const lastEntry = user.gradeHistory?.[user.gradeHistory.length - 1];
		if (!lastEntry) continue;

		const startMonth = lastEntry.revenueMonth;
		if (!startMonth) continue;

		// 등급 유지 개월 수 계산
		const monthsInGrade = getMonthDiff(registrationMonth, startMonth);

		// 최대 추가지급 횟수
		const maxMonths = MAX_ADDITIONAL_PAYMENTS[user.grade] || 0;

		// 추가지급 대상 조건:
		// - 0개월 = 승급/등록월 = 기본지급 → 제외
		// - 1개월 이상 & 최대 차수 이하 = 추가지급 대상
		if (monthsInGrade > 0 && monthsInGrade <= maxMonths) {
			// 중복 확인: 이번 달에 이미 이 등급으로 추가지급 생성됨?
			const alreadyCreated = await WeeklyPaymentPlans.findOne({
				userId: user._id,
				baseGrade: user.grade,
				revenueMonth: registrationMonth,
				installmentType: 'additional'
			});

			if (!alreadyCreated) {
				additionalTargets.push({
					userId: user._id.toString(),
					userName: user.name,
					grade: user.grade,
					추가지급단계: monthsInGrade,
					type: 'additional'
				});
				console.log(`    ✓ ${user.name}(${user.grade}): ${startMonth} 시작 → ${monthsInGrade}개월째 → 추가${monthsInGrade}차`);
			}
		}
	}

	return additionalTargets;
}

/**
 * 두 월 사이의 개월 수 차이 계산
 *
 * @param {string} currentMonth - 현재 월 (YYYY-MM)
 * @param {string} startMonth - 시작 월 (YYYY-MM)
 * @returns {number} 개월 차이
 */
function getMonthDiff(currentMonth, startMonth) {
	const [currentYear, currentMon] = currentMonth.split('-').map(Number);
	const [startYear, startMon] = startMonth.split('-').map(Number);

	return (currentYear - startYear) * 12 + (currentMon - startMon);
}

/**
 * 월 오프셋 계산 (YYYY-MM 형식)
 *
 * @param {string} monthKey - 기준 월 (YYYY-MM)
 * @param {number} offset - 오프셋 (-1: 이전 달, +1: 다음 달)
 * @returns {string} 계산된 월 (YYYY-MM)
 */
function getMonthOffset(monthKey, offset) {
	const [year, month] = monthKey.split('-').map(Number);
	const date = new Date(year, month - 1, 1); // month는 0-based
	date.setMonth(date.getMonth() + offset);

	const resultYear = date.getFullYear();
	const resultMonth = String(date.getMonth() + 1).padStart(2, '0');

	return `${resultYear}-${resultMonth}`;
}
