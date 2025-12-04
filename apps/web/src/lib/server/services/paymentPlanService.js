/**
 * 지급 계획 서비스 v8.0
 * 매월 기준 동적 지급 계획 생성 (10회 단위)
 *
 * v8.0 변경사항:
 * - 추가지급 시작: 등록/승급일 + 2개월 후 첫 금요일
 * - 추가2차 이후: 이전 추가지급 시작 + 1개월 후 첫 금요일
 * - 추가지급 중단: 승급 지급 시작일(승급 다음달 첫주)부터
 */

import mongoose from 'mongoose';
import WeeklyPaymentPlans from '../models/WeeklyPaymentPlans.js';
import WeeklyPaymentSummary from '../models/WeeklyPaymentSummary.js';
import MonthlyRegistrations from '../models/MonthlyRegistrations.js';

// 등급별 최대 수령 횟수 정의
const MAX_INSTALLMENTS = {
	F1: 20,
	F2: 30,
	F3: 40,
	F4: 40,
	F5: 50,
	F6: 50,
	F7: 60,
	F8: 60
};

/**
 * Initial 지급 계획 생성 (등록 시)
 */
export async function createInitialPaymentPlan(userId, userName, grade, registrationDate) {
	try {
		// 지급 시작일 계산 (등록일+1개월 후 첫 금요일)
		const startDate = WeeklyPaymentPlans.getPaymentStartDate(registrationDate);

		// 매출 귀속 월 결정
		const revenueMonth = MonthlyRegistrations.generateMonthKey(registrationDate);

		// v6.0: 초기 계획은 10회만 생성
		const totalInstallments = 10;

		// 등급별 지급액 계산 (미리 계산)
		const monthlyReg = await MonthlyRegistrations.findOne({ monthKey: revenueMonth });
		let baseAmount = 0;
		let installmentAmount = 0;
		let withholdingTax = 0;
		let netAmount = 0;

		if (monthlyReg) {
			// 조정된 금액이 있으면 사용, 없으면 계산
			if (monthlyReg.adjustedGradePayments?.[grade]?.totalAmount) {
				baseAmount = monthlyReg.adjustedGradePayments[grade].totalAmount;
				console.log(
					`[createInitialPaymentPlan] ${userName} - 조정된 금액 사용: ${grade} = ${baseAmount}원`
				);
			} else {
				const revenue = monthlyReg.getEffectiveRevenue();
				const gradePayments = calculateGradePayments(revenue, monthlyReg.gradeDistribution);
				baseAmount = gradePayments[grade] || 0;
				console.log(
					`[createInitialPaymentPlan] ${userName} - 계산된 금액 사용: ${grade} = ${baseAmount}원`
				);
			}

			if (baseAmount > 0) {
				installmentAmount = Math.floor(baseAmount / 10 / 100) * 100;

				withholdingTax = Math.round(installmentAmount * 0.033);

				netAmount = installmentAmount - withholdingTax;
			} else {
			}
		} else {
		}

		// 할부 생성 (v6.0: 10회만)
		const installments = [];
		for (let i = 1; i <= totalInstallments; i++) {
			const scheduledDate = new Date(startDate);
			// ⭐ UTC 메소드 사용하여 날짜 계산 (타임존 문제 방지)
			scheduledDate.setUTCDate(scheduledDate.getUTCDate() + (i - 1) * 7); // 매주 금요일

			installments.push({
				week: i,
				weekNumber: WeeklyPaymentPlans.getISOWeek(scheduledDate),
				scheduledDate,
				revenueMonth,
				gradeAtPayment: null, // 지급 시점에 확정

				baseAmount,
				installmentAmount,
				withholdingTax,
				netAmount,

				status: 'pending'
			});
		}

		if (installments.length > 0) {
			installments.slice(0, 3).forEach((inst, idx) => {});
		}

		// 계획 생성 (v8.0: additionalPaymentBaseDate 추가)
		const plan = await WeeklyPaymentPlans.create({
			userId,
			userName,
			planType: 'initial',
			generation: 1, // v6.0: 첫 번째 10회
			추가지급단계: 0, // v7.0: 기본 지급
			installmentType: 'basic', // v7.0: 기본 10회
			baseGrade: grade,
			revenueMonth,
			additionalPaymentBaseDate: registrationDate, // v8.0: 추가지급 기준일 (등록일)
			startDate,
			totalInstallments,
			completedInstallments: 0,
			installments,
			planStatus: 'active',
			createdBy: 'registration' // v6.0: 등록에 의한 생성
		});

		// 주차별 총계 업데이트 (미래 예측)
		await updateWeeklyProjections(plan, 'add');

		return plan;
	} catch (error) {
		throw error;
	}
}

/**
 * Promotion 지급 계획 생성 (승급 시)
 */
export async function createPromotionPaymentPlan(
	userId,
	userName,
	newGrade,
	promotionDate,
	monthlyRegData = null
) {
	try {
		// 지급 시작일 계산 (승급일+1개월 후 첫 금요일)
		const startDate = WeeklyPaymentPlans.getPaymentStartDate(promotionDate);

		// 매출 귀속 월 (승급 시점 기준)
		const revenueMonth = MonthlyRegistrations.generateMonthKey(promotionDate);

		// Promotion 계획은 항상 10회 (initial 10회만)
		const totalInstallments = 10;

		// 등급별 지급액 계산
		// ⭐ 중요: monthlyRegData가 전달되면 사용, 없으면 DB 조회
		let monthlyReg = monthlyRegData;
		if (!monthlyReg) {
			monthlyReg = await MonthlyRegistrations.findOne({ monthKey: revenueMonth });
		}

		let baseAmount = 0;
		let installmentAmount = 0;
		let withholdingTax = 0;
		let netAmount = 0;

		if (monthlyReg) {
			// 조정된 금액이 있으면 사용, 없으면 계산
			if (monthlyReg.adjustedGradePayments?.[newGrade]?.totalAmount) {
				baseAmount = monthlyReg.adjustedGradePayments[newGrade].totalAmount;
				console.log(
					`[createPromotionPaymentPlan] ${userName} - 조정된 금액 사용: ${newGrade} = ${baseAmount}원`
				);
			} else {
				const revenue = monthlyReg.getEffectiveRevenue();
				const gradePayments = calculateGradePayments(revenue, monthlyReg.gradeDistribution);
				baseAmount = gradePayments[newGrade] || 0;
				console.log(
					`[createPromotionPaymentPlan] ${userName} - 계산된 금액 사용: ${newGrade} = ${baseAmount}원`
				);
			}

			if (baseAmount > 0) {
				installmentAmount = Math.floor(baseAmount / 10 / 100) * 100;
				withholdingTax = Math.round(installmentAmount * 0.033);
				netAmount = installmentAmount - withholdingTax;
			}
		}

		// 할부 생성
		const installments = [];
		for (let i = 1; i <= totalInstallments; i++) {
			const scheduledDate = new Date(startDate);
			// ⭐ UTC 메소드 사용하여 날짜 계산 (타임존 문제 방지)
			scheduledDate.setUTCDate(scheduledDate.getUTCDate() + (i - 1) * 7);

			installments.push({
				week: i,
				weekNumber: WeeklyPaymentPlans.getISOWeek(scheduledDate),
				scheduledDate,
				revenueMonth,
				gradeAtPayment: null,

				baseAmount,
				installmentAmount,
				withholdingTax,
				netAmount,

				status: 'pending'
			});
		}

		// ⭐ v8.0: 추가지급 중단은 terminateAdditionalPlansOnPromotion에서 처리
		// (승급 지급 시작일부터만 중단하는 로직)

		// 계획 생성 (v8.0: additionalPaymentBaseDate 추가)
		const plan = await WeeklyPaymentPlans.create({
			userId,
			userName,
			planType: 'promotion',
			generation: 1, // v6.0: 첫 번째 10회
			추가지급단계: 0, // v7.0: 기본 지급
			installmentType: 'basic', // v7.0: 기본 10회
			baseGrade: newGrade,
			revenueMonth,
			additionalPaymentBaseDate: promotionDate, // v8.0: 추가지급 기준일 (승급일)
			startDate,
			totalInstallments,
			completedInstallments: 0,
			installments,
			planStatus: 'active',
			createdBy: 'promotion' // v6.0: 승급에 의한 생성
		});

		// 주차별 총계 업데이트
		await updateWeeklyProjections(plan, 'add');

		return plan;
	} catch (error) {
		throw error;
	}
}

/**
 * Additional 지급 계획 생성 (10회 완료 후 등급 유지 시)
 */
export async function createAdditionalPaymentPlan(
	userId,
	userName,
	grade,
	baseRevenueMonth,
	lastCompletedWeek
) {
	try {
		// 마지막 지급일 다음 금요일부터 시작
		const startDate = new Date(lastCompletedWeek);
		// ⭐ UTC 메소드 사용 (타임존 문제 방지)
		startDate.setUTCDate(startDate.getUTCDate() + 7);

		// 추가 지급 가능 횟수 계산
		const maxCount = MAX_INSTALLMENTS[grade];
		const additionalCount = maxCount - 10; // 이미 10회 완료

		if (additionalCount <= 0) {
			return null;
		}

		// 등급별 지급액 계산 (미리 계산)
		const monthlyReg = await MonthlyRegistrations.findOne({ monthKey: baseRevenueMonth });
		let baseAmount = 0;
		let installmentAmount = 0;
		let withholdingTax = 0;
		let netAmount = 0;

		if (monthlyReg) {
			const revenue = monthlyReg.getEffectiveRevenue();
			const gradePayments = calculateGradePayments(revenue, monthlyReg.gradeDistribution);
			baseAmount = gradePayments[grade] || 0;

			if (baseAmount > 0) {
				installmentAmount = Math.floor(baseAmount / 10 / 100) * 100;
				withholdingTax = Math.round(installmentAmount * 0.033);
				netAmount = installmentAmount - withholdingTax;
			}
		}

		// 할부 생성 (11회부터)
		const installments = [];
		for (let i = 11; i <= maxCount; i++) {
			const scheduledDate = new Date(startDate);
			// ⭐ UTC 메소드 사용하여 날짜 계산 (타임존 문제 방지)
			scheduledDate.setUTCDate(scheduledDate.getUTCDate() + (i - 11) * 7);

			installments.push({
				week: i,
				weekNumber: WeeklyPaymentPlans.getISOWeek(scheduledDate),
				scheduledDate,
				revenueMonth: baseRevenueMonth, // 원래 매출월 기준
				gradeAtPayment: null,

				baseAmount,
				installmentAmount,
				withholdingTax,
				netAmount,

				status: 'pending'
			});
		}

		// 계획 생성
		const plan = await WeeklyPaymentPlans.create({
			userId,
			userName,
			planType: 'additional',
			baseGrade: grade,
			revenueMonth: baseRevenueMonth,
			startDate,
			totalInstallments: additionalCount,
			completedInstallments: 0,
			installments,
			planStatus: 'active'
		});

		// 주차별 총계 업데이트
		await updateWeeklyProjections(plan, 'add');

		return plan;
	} catch (error) {
		throw error;
	}
}

/**
 * Additional 계획 종료 (승급 시)
 */
export async function terminateAdditionalPlans(userId) {
	try {
		const additionalPlans = await WeeklyPaymentPlans.find({
			userId,
			planType: 'additional',
			planStatus: 'active'
		});

		for (const plan of additionalPlans) {
			// pending 상태의 할부 종료
			let hasTerminated = false;
			for (const inst of plan.installments) {
				if (inst.status === 'pending') {
					inst.status = 'terminated';
					hasTerminated = true;
				}
			}

			if (hasTerminated) {
				plan.planStatus = 'terminated';
				plan.terminatedAt = new Date();
				plan.terminationReason = 'promotion';

				await plan.save();

				// 주차별 총계에서 제거
				await updateWeeklyProjections(plan, 'remove');
			}
		}
	} catch (error) {
		throw error;
	}
}

/**
 * 주차별 총계 예측 업데이트
 */
async function updateWeeklyProjections(plan, operation) {
	try {
		// 매출 정보 조회
		const monthlyReg = await MonthlyRegistrations.findOne({
			monthKey: plan.revenueMonth
		});

		if (!monthlyReg) {
			return;
		}

		// 등급별 지급액 계산
		const revenue = monthlyReg.getEffectiveRevenue();
		const gradePayments = calculateGradePayments(revenue, monthlyReg.gradeDistribution);
		const baseAmount = gradePayments[plan.baseGrade] || 0;

		if (baseAmount === 0) {
			return;
		}

		// 10분할 및 100원 단위 절삭
		const installmentAmount = Math.floor(baseAmount / 10 / 100) * 100;
		const withholdingTax = Math.round(installmentAmount * 0.033);
		const netAmount = installmentAmount - withholdingTax;

		// 주차별 업데이트
		const uniqueWeeks = [
			...new Set(
				plan.installments.filter((inst) => inst.status === 'pending').map((inst) => inst.weekNumber)
			)
		];

		for (const weekNumber of uniqueWeeks) {
			// 주차별 총계 문서 찾기 또는 생성
			let summary = await WeeklyPaymentSummary.findOne({ weekNumber });

			if (!summary) {
				const weekInstallment = plan.installments.find((i) => i.weekNumber === weekNumber);
				summary = await WeeklyPaymentSummary.create({
					weekDate: weekInstallment.scheduledDate,
					weekNumber,
					monthKey: WeeklyPaymentSummary.generateMonthKey(weekInstallment.scheduledDate),
					status: 'scheduled'
				});
			}

			// 금액 증분 또는 차감
			if (operation === 'add') {
				summary.incrementPayment(
					plan.baseGrade,
					plan.planType,
					installmentAmount,
					withholdingTax,
					netAmount,
					plan.userId // ⭐ userId 추가
				);
			} else if (operation === 'remove') {
				// 차감 로직
				summary.totalAmount -= installmentAmount;
				summary.totalTax -= withholdingTax;
				summary.totalNet -= netAmount;
				summary.totalPaymentCount -= 1;

				if (summary.byGrade[plan.baseGrade]) {
					summary.byGrade[plan.baseGrade].amount -= installmentAmount;
					summary.byGrade[plan.baseGrade].tax -= withholdingTax;
					summary.byGrade[plan.baseGrade].net -= netAmount;
					summary.byGrade[plan.baseGrade].paymentCount -= 1;
				}

				if (summary.byPlanType[plan.planType]) {
					summary.byPlanType[plan.planType].amount -= installmentAmount;
					summary.byPlanType[plan.planType].tax -= withholdingTax;
					summary.byPlanType[plan.planType].net -= netAmount;
					summary.byPlanType[plan.planType].paymentCount -= 1;
				}
			}

			await summary.save();
		}
	} catch (error) {}
}

/**
 * 등급별 누적 지급액 계산 (헬퍼 함수)
 */
function calculateGradePayments(totalRevenue, gradeDistribution) {
	const rates = {
		F1: 0.24,
		F2: 0.19,
		F3: 0.14,
		F4: 0.09,
		F5: 0.05,
		F6: 0.03,
		F7: 0.02,
		F8: 0.01
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
				previousAmount = additionalPerPerson;
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
 * 헬퍼 함수들
 */
function getNextMonth(monthKey) {
	const [year, month] = monthKey.split('-').map(Number);
	const nextDate = new Date(year, month, 1); // month는 0-based가 아님에 주의
	return MonthlyRegistrations.generateMonthKey(nextDate);
}

function getFirstFridayOfMonth(monthKey) {
	const [year, month] = monthKey.split('-').map(Number);
	const firstDay = new Date(year, month - 1, 1); // month는 1-based

	// 첫 금요일 찾기
	const dayOfWeek = firstDay.getUTCDay();
	const daysUntilFriday = (5 - dayOfWeek + 7) % 7 || 7;
	// ⭐ UTC 메소드 사용 (타임존 문제 방지)
	firstDay.setUTCDate(firstDay.getUTCDate() + daysUntilFriday);

	return firstDay;
}

/**
 * v6.0: 10회 완료 후 추가 지급 계획 생성
 * 설계문서 4.1 checkAndCreateAdditionalPlan 구현
 */
export async function checkAndCreateAdditionalPlan(completedPlan) {
	try {
		// User 모델에서 최신 등급 및 보험 정보 조회 (UserAccount populate)
		const User = mongoose.model('User');
		const user = await User.findOne({ loginId: completedPlan.userId }).populate(
			'userAccountId',
			'insuranceAmount'
		);

		if (!user) {
			return null;
		}

		// 1. 최대 횟수 확인
		const totalCompleted = await calculateTotalCompletedInstallments(
			completedPlan.userId,
			completedPlan.planType
		);
		const maxInstallments = MAX_INSTALLMENTS[user.grade];

		if (totalCompleted >= maxInstallments) {
			return null;
		}

		// 2. 등급 확인 (하락하면 추가 생성 안 함)
		if (user.grade < completedPlan.baseGrade) {
			return null;
		}

		// 3. 보험 확인 (F3 이상은 보험 필수)
		if (user.grade >= 'F3') {
			const requiredAmounts = {
				F3: 50000,
				F4: 50000,
				F5: 70000,
				F6: 70000,
				F7: 100000,
				F8: 100000
			};
			const insuranceAmount = user.userAccountId?.insuranceAmount || 0;
			if (insuranceAmount < requiredAmounts[user.grade]) {
				return null; // 보험 조건 미충족
			}
		}

		// 4. 완료 매출월 계산 (10회차의 실제 지급일 또는 예정일)
		const lastInstallment = completedPlan.installments[9]; // 10회차 (0-based)
		const completionDate = lastInstallment.paidAt || lastInstallment.scheduledDate;
		const revenueMonth = MonthlyRegistrations.generateMonthKey(completionDate);

		// 5. 매출 조회 및 금액 계산
		const monthlyReg = await MonthlyRegistrations.findOne({ monthKey: revenueMonth });
		if (!monthlyReg) {
			return null;
		}

		const revenue = monthlyReg.getEffectiveRevenue();
		const gradePayments = calculateGradePayments(revenue, monthlyReg.gradeDistribution);
		const baseAmount = gradePayments[user.grade];

		if (!baseAmount || baseAmount === 0) {
			return null;
		}

		const installmentAmount = Math.floor(baseAmount / 10 / 100) * 100;
		const withholdingTax = Math.round(installmentAmount * 0.033);
		const netAmount = installmentAmount - withholdingTax;

		// 6. 추가 10회 계획 생성
		const nextGeneration = completedPlan.generation + 1;
		const startDate = WeeklyPaymentPlans.getNextFriday(completionDate);
		// ⭐ UTC 메소드 사용 (타임존 문제 방지)
		startDate.setUTCDate(startDate.getUTCDate() + 7); // 완료일 다음주 금요일

		const installments = [];
		for (let i = 1; i <= 10; i++) {
			const scheduledDate = new Date(startDate);
			// ⭐ UTC 메소드 사용 (타임존 문제 방지)
			scheduledDate.setUTCDate(scheduledDate.getUTCDate() + (i - 1) * 7);

			installments.push({
				week: i,
				weekNumber: WeeklyPaymentPlans.getISOWeek(scheduledDate),
				scheduledDate,
				revenueMonth,
				gradeAtPayment: null,
				baseAmount,
				installmentAmount,
				withholdingTax,
				netAmount,
				status: 'pending',
				insuranceSkipped: false
			});
		}

		// 7. DB 저장
		const newPlan = await WeeklyPaymentPlans.create({
			userId: completedPlan.userId,
			userName: completedPlan.userName,
			planType: completedPlan.planType, // initial 또는 promotion 유지
			generation: nextGeneration,
			baseGrade: user.grade, // 현재 등급 기준
			revenueMonth,
			startDate,
			totalInstallments: 10,
			completedInstallments: 0,
			planStatus: 'active',
			installments,
			parentPlanId: completedPlan._id,
			createdBy: 'auto_generation'
		});

		// 8. 주차별 총계 업데이트
		await updateWeeklyProjections(newPlan, 'add');

		return newPlan;
	} catch (error) {
		return null;
	}
}

/**
 * 총 완료 횟수 계산 (같은 planType 내에서)
 */
async function calculateTotalCompletedInstallments(userId, planType) {
	const plans = await WeeklyPaymentPlans.find({
		userId,
		planType,
		planStatus: { $in: ['active', 'completed'] }
	});

	return plans.reduce((sum, p) => sum + p.completedInstallments, 0);
}

/**
 * v8.0: 승급 시 추가지급 중단
 * ⭐ 핵심: installmentType='additional'만 중단! (기본지급은 끝까지 지급)
 * ⭐ v8.0 변경: 승급 지급 시작일(승급 다음달 첫 금요일)부터 중단
 *
 * @param {string} userId - 사용자 ID
 * @param {Date} promotionDate - 승급일
 */
export async function terminateAdditionalPlansOnPromotion(userId, promotionDate) {
	try {
		// 승급 지급 시작일 계산 (승급 다음달 첫 금요일)
		const promotionPaymentStartDate = WeeklyPaymentPlans.getPaymentStartDate(promotionDate);

		console.log(`[terminateAdditionalPlans] ${userId} 승급일: ${promotionDate}, 승급 지급 시작일: ${promotionPaymentStartDate}`);

		// ⭐ installmentType='additional'인 active 계획만 조회
		const additionalPlans = await WeeklyPaymentPlans.find({
			userId,
			installmentType: 'additional', // 추가지급만 중단!
			planStatus: 'active'
		});

		for (const plan of additionalPlans) {
			// ⭐ v8.0: 승급 지급 시작일 이후의 pending 할부만 terminated로 변경
			let terminatedCount = 0;
			for (const inst of plan.installments) {
				if (inst.status === 'pending') {
					const scheduledDate = new Date(inst.scheduledDate);
					// 승급 지급 시작일 이후인 경우에만 중단
					if (scheduledDate >= promotionPaymentStartDate) {
						inst.status = 'terminated';
						inst.terminatedReason = 'promotion';
						terminatedCount++;
					}
				}
			}

			if (terminatedCount > 0) {
				// 남은 pending이 없으면 계획도 종료
				const remainingPending = plan.installments.filter(i => i.status === 'pending').length;
				if (remainingPending === 0) {
					plan.planStatus = 'terminated';
					plan.terminatedBy = 'promotion_additional_stop';
				}
				plan.terminatedAt = promotionPaymentStartDate;
				plan.terminationReason = 'promotion';

				await plan.save();

				// 주차별 총계에서 중단된 할부만 제거
				await updateWeeklyProjectionsPartial(plan, 'remove', promotionPaymentStartDate);

				console.log(`[terminateAdditionalPlans] ${userId} 추가지급 중단: ${plan.baseGrade} ${plan.추가지급단계}단계, ${terminatedCount}회 중단`);
			}
		}

		return additionalPlans.length;
	} catch (error) {
		console.error('[terminateAdditionalPlans] 오류:', error);
		throw error;
	}
}

/**
 * v8.0: 주차별 총계 부분 업데이트 (특정 날짜 이후만)
 */
async function updateWeeklyProjectionsPartial(plan, operation, fromDate) {
	try {
		for (const inst of plan.installments) {
			if (inst.status === 'terminated' && new Date(inst.scheduledDate) >= fromDate) {
				let summary = await WeeklyPaymentSummary.findOne({ weekNumber: inst.weekNumber });
				if (summary && operation === 'remove') {
					summary.totalAmount -= inst.installmentAmount || 0;
					summary.totalTax -= inst.withholdingTax || 0;
					summary.totalNet -= inst.netAmount || 0;
					summary.totalPaymentCount -= 1;

					if (summary.byGrade?.[plan.baseGrade]) {
						summary.byGrade[plan.baseGrade].amount -= inst.installmentAmount || 0;
						summary.byGrade[plan.baseGrade].tax -= inst.withholdingTax || 0;
						summary.byGrade[plan.baseGrade].net -= inst.netAmount || 0;
						summary.byGrade[plan.baseGrade].paymentCount -= 1;
					}

					await summary.save();
				}
			}
		}
	} catch (error) {
		console.error('[updateWeeklyProjectionsPartial] 오류:', error);
	}
}

/**
 * v8.0: 추가지급 시작일 계산
 * - 기본→추가1차: 등록/승급일 + 2개월 후 첫 금요일
 * - 추가N차→추가(N+1)차: 이전 추가지급 시작일 + 1개월 후 첫 금요일
 *
 * @param {Date} baseDate - 기준일 (등록/승급일 또는 이전 추가지급 시작일)
 * @param {Number} currentStage - 현재 추가지급단계 (0이면 기본→추가1차)
 * @returns {Date} 추가지급 시작 금요일
 */
export function calculateAdditionalPaymentStartDate(baseDate, currentStage) {
	const base = new Date(baseDate);
	let targetDate;

	if (currentStage === 0) {
		// 기본지급 완료 후 첫 추가지급: 등록/승급일 + 2개월
		targetDate = new Date(base);
		targetDate.setMonth(targetDate.getMonth() + 2);
	} else {
		// 추가N차 → 추가(N+1)차: 이전 추가지급 시작일 + 1개월
		targetDate = new Date(base);
		targetDate.setMonth(targetDate.getMonth() + 1);
	}

	// targetDate 이후 첫 금요일 찾기
	return getNextFridayOnOrAfter(targetDate);
}

/**
 * v8.0: 특정 날짜 이후 첫 금요일 찾기
 */
function getNextFridayOnOrAfter(date) {
	const d = new Date(date);
	const dayOfWeek = d.getDay(); // 0=일, 5=금

	if (dayOfWeek === 5) {
		// 이미 금요일이면 그대로 반환
		d.setHours(0, 0, 0, 0);
		return d;
	}

	// 다음 금요일까지 일수 계산
	const daysUntilFriday = (5 - dayOfWeek + 7) % 7 || 7;
	d.setDate(d.getDate() + daysUntilFriday);
	d.setHours(0, 0, 0, 0);

	return d;
}

/**
 * v8.0: 추가지급 계획 생성 (날짜 기반)
 * 매주 금요일 지급 후 추가지급 시작일이 도래했는지 확인하여 생성
 *
 * @param {Object} previousPlan - 이전 완료된 계획
 * @returns {Object|null} 생성된 계획 또는 null
 */
export async function createAdditionalPaymentPlanV8(previousPlan) {
	try {
		const User = mongoose.model('User');
		const user = await User.findOne({ loginId: previousPlan.userId }).populate(
			'userAccountId',
			'insuranceAmount'
		);

		if (!user) {
			console.log(`[createAdditionalPaymentPlanV8] 사용자 없음: ${previousPlan.userId}`);
			return null;
		}

		const baseGrade = previousPlan.baseGrade;
		const next추가지급단계 = previousPlan.추가지급단계 + 1;

		// 1. 최대 횟수 확인
		const totalPlanned = await WeeklyPaymentPlans.aggregate([
			{ $match: { userId: previousPlan.userId, baseGrade } },
			{ $group: { _id: null, total: { $sum: '$totalInstallments' } } }
		]);
		const totalCount = totalPlanned[0]?.total || 0;

		if (totalCount >= MAX_INSTALLMENTS[baseGrade]) {
			console.log(`[createAdditionalPaymentPlanV8] ${previousPlan.userId} ${baseGrade} 최대 횟수 도달: ${totalCount}/${MAX_INSTALLMENTS[baseGrade]}`);
			return null;
		}

		// 2. 현재 등급 확인 (하락 시 생성 안 함)
		if (user.grade < baseGrade) {
			console.log(`[createAdditionalPaymentPlanV8] ${previousPlan.userId} 등급 하락: ${baseGrade} → ${user.grade}`);
			return null;
		}

		// 3. 보험 확인 (F3 이상)
		if (baseGrade >= 'F3') {
			const requiredAmounts = {
				F3: 50000, F4: 50000, F5: 70000, F6: 70000, F7: 100000, F8: 100000
			};
			const insuranceAmount = user.userAccountId?.insuranceAmount || 0;
			if (insuranceAmount < requiredAmounts[baseGrade]) {
				console.log(`[createAdditionalPaymentPlanV8] ${previousPlan.userId} 보험 미충족: ${insuranceAmount} < ${requiredAmounts[baseGrade]}`);
				return null;
			}
		}

		// 4. 승급 여부 확인 - 승급 지급이 이미 시작되었으면 생성 안 함
		const promotionPlan = await WeeklyPaymentPlans.findOne({
			userId: previousPlan.userId,
			planType: 'promotion',
			baseGrade: { $gt: baseGrade },
			startDate: { $lte: new Date() }
		});

		if (promotionPlan) {
			console.log(`[createAdditionalPaymentPlanV8] ${previousPlan.userId} 승급으로 인한 생성 안 함`);
			return null;
		}

		// 5. 추가지급 시작일 계산
		let baseDate;
		if (previousPlan.추가지급단계 === 0) {
			// 기본→추가1차: 등록/승급일 + 2개월
			baseDate = previousPlan.additionalPaymentBaseDate;
		} else {
			// 추가N차→추가(N+1)차: 이전 추가지급 시작일 + 1개월
			baseDate = previousPlan.startDate;
		}

		const startDate = calculateAdditionalPaymentStartDate(baseDate, previousPlan.추가지급단계);

		// 아직 시작일이 안 됐으면 생성 안 함
		if (startDate > new Date()) {
			console.log(`[createAdditionalPaymentPlanV8] ${previousPlan.userId} 시작일 미도래: ${startDate}`);
			return null;
		}

		// 6. 매출월 결정 (시작일 기준 이전 월)
		const revenueDate = new Date(startDate);
		revenueDate.setMonth(revenueDate.getMonth() - 1);
		const revenueMonth = MonthlyRegistrations.generateMonthKey(revenueDate);

		// 7. 금액 계산
		const monthlyReg = await MonthlyRegistrations.findOne({ monthKey: revenueMonth });
		if (!monthlyReg) {
			console.log(`[createAdditionalPaymentPlanV8] ${previousPlan.userId} 매출 정보 없음: ${revenueMonth}`);
			return null;
		}

		let baseAmount = 0;
		if (monthlyReg.adjustedGradePayments?.[baseGrade]?.totalAmount) {
			baseAmount = monthlyReg.adjustedGradePayments[baseGrade].totalAmount;
		} else {
			const revenue = monthlyReg.getEffectiveRevenue();
			const gradePayments = calculateGradePayments(revenue, monthlyReg.gradeDistribution);
			baseAmount = gradePayments[baseGrade] || 0;
		}

		if (baseAmount === 0) {
			console.log(`[createAdditionalPaymentPlanV8] ${previousPlan.userId} 금액 0원`);
			return null;
		}

		const installmentAmount = Math.floor(baseAmount / 10 / 100) * 100;
		const withholdingTax = Math.round(installmentAmount * 0.033);
		const netAmount = installmentAmount - withholdingTax;

		// 8. 10회 할부 생성
		const installments = [];
		for (let i = 1; i <= 10; i++) {
			const scheduledDate = new Date(startDate);
			scheduledDate.setUTCDate(scheduledDate.getUTCDate() + (i - 1) * 7);

			installments.push({
				week: i,
				weekNumber: WeeklyPaymentPlans.getISOWeek(scheduledDate),
				scheduledDate,
				revenueMonth,
				gradeAtPayment: null,
				baseAmount,
				installmentAmount,
				withholdingTax,
				netAmount,
				status: 'pending',
				insuranceSkipped: false
			});
		}

		// 9. DB 저장
		const newPlan = await WeeklyPaymentPlans.create({
			userId: previousPlan.userId,
			userName: previousPlan.userName,
			planType: previousPlan.planType,
			generation: previousPlan.generation + 1,
			추가지급단계: next추가지급단계,
			installmentType: 'additional',
			baseGrade,
			revenueMonth,
			additionalPaymentBaseDate: previousPlan.additionalPaymentBaseDate, // 원래 등록/승급일 유지
			startDate,
			totalInstallments: 10,
			completedInstallments: 0,
			planStatus: 'active',
			installments,
			parentPlanId: previousPlan._id,
			createdBy: 'additional_payment'
		});

		// 10. 주차별 총계 업데이트
		await updateWeeklyProjections(newPlan, 'add');

		console.log(`[createAdditionalPaymentPlanV8] ${previousPlan.userId} 추가지급 생성: ${baseGrade} ${next추가지급단계}단계, ${revenueMonth} 매출분, 시작일: ${startDate}`);

		return newPlan;
	} catch (error) {
		console.error('[createAdditionalPaymentPlanV8] 오류:', error);
		return null;
	}
}

/**
 * v8.0: 매주 금요일 추가지급 생성 체크
 * 완료된 계획 중 추가지급 시작일이 도래한 것들을 확인하여 생성
 */
export async function checkAndCreateAdditionalPaymentsV8() {
	try {
		const today = new Date();
		console.log(`[checkAndCreateAdditionalPaymentsV8] 시작: ${today}`);

		// 완료된 계획 중 다음 단계가 없는 것들 조회
		const completedPlans = await WeeklyPaymentPlans.find({
			planStatus: 'completed',
			installmentType: { $in: ['basic', 'additional'] }
		});

		let createdCount = 0;
		let skippedCount = 0;

		for (const plan of completedPlans) {
			// 이미 다음 단계 추가지급이 있는지 확인
			const nextPlan = await WeeklyPaymentPlans.findOne({
				parentPlanId: plan._id
			});

			if (nextPlan) {
				continue;
			}

			// 추가지급 생성 시도
			const newPlan = await createAdditionalPaymentPlanV8(plan);

			if (newPlan) {
				createdCount++;
			} else {
				skippedCount++;
			}
		}

		console.log(`[checkAndCreateAdditionalPaymentsV8] 완료: 생성 ${createdCount}건, 제외 ${skippedCount}건`);

		return { created: createdCount, skipped: skippedCount };
	} catch (error) {
		console.error('[checkAndCreateAdditionalPaymentsV8] 오류:', error);
		return { created: 0, skipped: 0, error: error.message };
	}
}
