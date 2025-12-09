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
import { GRADE_LIMITS } from '../../utils/constants.js';

// ⭐ GRADE_LIMITS에서 최대 추가지급 횟수 자동 계산
// (최대횟수 - 기본10회) / 10 = 추가지급 차수
const MAX_ADDITIONAL_PAYMENTS = Object.fromEntries(
	Object.entries(GRADE_LIMITS).map(([grade, limits]) => [
		grade,
		Math.floor((limits.maxInstallments - 10) / 10)
	])
);

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
 * 추가지급 대상자 찾기
 *
 * ⭐ 핵심 로직:
 * 1. 등급별로 확인해야 할 이전 달 개수 계산
 *    - GRADE_LIMITS.maxInstallments 기준으로 자동 계산
 *    - 추가지급 차수 = (최대횟수 - 기본10회) / 10
 *
 * 2. 각 이전 달의 대상자 중 이번 달 미승급자 찾기 (3가지 소스)
 *    A. 등록자 (최초 추가지급)
 *    B. 승급자 (최초 추가지급)
 *    C. 추가지급 대상자 (지속적인 추가지급) ⭐ 핵심!
 *
 * 3. 조건 확인:
 *    - 최대 횟수 미도달
 *    - F4+ 보험 가입 (⭐ v8.0: F3 보험 불필요)
 *    - 등급 유지 (하락 시 제외)
 *    - 이번 달 추가지급 미생성
 *
 * ⭐ 중요: 추가지급의 revenueMonth는 현재 월!
 *   예: 7월 등록 → 8월 미승급 → 8월 매출분 추가지급 생성
 *       8월 추가지급 → 9월 미승급 → 9월 매출분 추가지급 생성
 *
 * @param {Array} promoted - 이번 달 승급자 배열
 * @param {string} registrationMonth - 현재 귀속월 (YYYY-MM)
 * @returns {Promise<Array>}
 */
async function findAdditionalPaymentTargets(promoted, registrationMonth) {
	const maxPreviousMonths = {
		F1: 1,
		F2: 2,
		F3: 3,
		F4: 3,
		F5: 4,
		F6: 4,
		F7: 5,
		F8: 5
	};

	const additionalTargets = [];
	const currentPromotedIds = promoted.map((p) => p.userId);
	const processedUsers = new Set();

	for (const [grade, months] of Object.entries(maxPreviousMonths)) {
		for (let i = 1; i <= months; i++) {
			const targetMonth = getMonthOffset(registrationMonth, -i);

			const monthlyReg = await MonthlyRegistrations.findOne({
				monthKey: targetMonth
			});

			if (!monthlyReg) continue;

			const prevPromotedIds = (monthlyReg.paymentTargets?.promoted || []).map((p) => p.userId);

			const prevTargets = [
				...monthlyReg.registrations.filter((r) => !prevPromotedIds.includes(r.userId)),
				...(monthlyReg.paymentTargets?.promoted || []).map((p) => ({
					userId: p.userId,
					userName: p.userName,
					grade: p.newGrade
				})),
				...(monthlyReg.paymentTargets?.additionalPayments || []).map((a) => ({
					userId: a.userId,
					userName: a.userName,
					grade: a.grade
				}))
			];

			const candidates = prevTargets
				.filter((t) => t.grade === grade || t.newGrade === grade)
				.filter((t) => !currentPromotedIds.includes(t.userId))
				.filter((t) => !processedUsers.has(t.userId));

			for (const candidate of candidates) {
				const target = await checkAdditionalPaymentConditions(
					candidate.userId,
					grade,
					registrationMonth,
					i // monthsBack parameter
				);

				if (target) {
					additionalTargets.push(target);
					processedUsers.add(candidate.userId);
				}
			}
		}
	}

	return additionalTargets;
}

/**
 * 추가지급 조건 확인
 *
 * @param {string} userId
 * @param {string} grade
 * @param {string} revenueMonth - 매출 귀속 월 (현재 월)
 * @param {number} monthsBack - 몇 개월 전 대상자인지 (1, 2, 3, ...)
 * @returns {Promise<Object|null>}
 */
async function checkAdditionalPaymentConditions(userId, grade, revenueMonth, monthsBack) {
	const user = await User.findById(userId);
	if (!user) return null;

	const currentGrade = user.grade;

	// 등급 유지 확인
	if (currentGrade !== grade) return null;

	// ⭐ 추가지급단계 계산: 이 등급에서 이미 생성된 추가지급 개수 확인
	const existingAdditionalPlans = await WeeklyPaymentPlans.find({
		userId: userId,
		baseGrade: grade,
		installmentType: 'additional'
	}).sort({ 추가지급단계: -1 });

	const currentAdditionalStage = existingAdditionalPlans.length > 0
		? existingAdditionalPlans[0].추가지급단계
		: 0;

	const nextAdditionalStage = currentAdditionalStage + 1;

	// ⭐ 등급별 최대 추가지급 횟수 확인 (GRADE_LIMITS에서 자동 계산)
	const maxAllowed = MAX_ADDITIONAL_PAYMENTS[grade] || 0;

	// 이미 최대 추가지급 횟수에 도달했으면 제외
	if (nextAdditionalStage > maxAllowed) return null;

	// ⭐ v8.0 변경: 보험 체크는 지급 시점(weeklyPaymentService)에서 수행
	// 계획은 항상 생성하고, 지급 시점에 보험 미가입이면 skip 처리

	// ⭐ 이번 달에 이미 이 등급으로 추가지급 계획이 생성되었는지 확인 (중복 방지)
	const alreadyCreated = await WeeklyPaymentPlans.findOne({
		userId: userId,
		baseGrade: grade,
		revenueMonth: revenueMonth,
		installmentType: 'additional'
	});

	if (alreadyCreated) return null;

	return {
		userId: userId,
		userName: user.name,
		grade: grade,
		추가지급단계: nextAdditionalStage,
		type: 'additional'
	};
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
