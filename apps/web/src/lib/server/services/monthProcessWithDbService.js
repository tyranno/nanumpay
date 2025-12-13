/**
 * DB 기반 월별 지급 계획 재처리 서비스
 *
 * 역할: DB에 있는 User 정보 기반으로 엑셀 등록과 같은 절차로 재계산
 *
 * 사용 시점:
 * - 지원자 정보 수정 후 (ratio, 등록일 등)
 * - 지원자 삭제 후
 *
 * 처리 절차 (엑셀 등록과 동일한 방향):
 * ┌─────────────────────────────────────────────────────────────┐
 * │ 단계 │ 엑셀 등록              │ DB 기반 재계산              │
 * ├─────────────────────────────────────────────────────────────┤
 * │  1   │ User 생성              │ (이미 수정됨 - 스킵)        │
 * │  2   │ 트리 배치              │ (User hook이 처리)          │
 * │  3   │ 등급 재계산            │ 등급 재계산 ✅              │
 * │  4   │ 매출 계산              │ 매출 재계산 (ratio 반영) ✅ │
 * │  5   │ gradePayments 계산     │ gradePayments 재계산 ✅     │
 * │  6   │ MonthlyRegistrations   │ MonthlyRegistrations 업데이트 ✅ │
 * │  7   │ WeeklyPaymentPlans 생성│ WeeklyPaymentPlans 삭제 후 새로 생성 ✅ │
 * └─────────────────────────────────────────────────────────────┘
 */

import User from '../models/User.js';
import MonthlyRegistrations from '../models/MonthlyRegistrations.js';
import WeeklyPaymentPlans from '../models/WeeklyPaymentPlans.js';
import { recalculateAllGrades } from './gradeCalculation.js';
import { calculateGradePayments } from '../utils/paymentCalculator.js';
import { MAX_ADDITIONAL_PAYMENTS } from '../utils/constants.js';
import { createInitialPaymentPlan, createPromotionPaymentPlan } from './paymentPlanService.js';
import { createAdditionalPaymentPlan } from './registration/step4_createPlans.js';

/**
 * 월별 지급 계획 재처리 (DB 기반)
 *
 * @param {string} monthKey - 재처리할 월 (YYYY-MM)
 * @param {Object} options - 옵션
 * @param {boolean} options.skipGradeRecalc - 등급 재계산 생략 여부
 * @returns {Promise<Object>} 처리 결과
 */
export async function reprocessMonthPayments(monthKey, options = {}) {
	console.log(`\n${'='.repeat(60)}`);
	console.log(`[DB 기반 재처리] ${monthKey} 시작`);
	console.log(`${'='.repeat(60)}`);

	const result = {
		monthKey,
		gradesUpdated: 0,
		plansUpdated: 0,
		gradeDistribution: null,
		gradePayments: null,
		totalRevenue: 0
	};

	try {
		// ========================================
		// Step 1: 등급 재계산
		// ========================================
		if (!options.skipGradeRecalc) {
			console.log(`\n[Step 1] 등급 재계산...`);
			const gradeResult = await recalculateAllGrades();
			result.gradesUpdated = gradeResult.updatedCount || 0;
			console.log(`  → ${result.gradesUpdated}명 등급 변경`);
		} else {
			console.log(`\n[Step 1] 등급 재계산 (스킵)`);
		}

		// ========================================
		// Step 2: MonthlyRegistrations 조회
		// ========================================
		const monthlyReg = await MonthlyRegistrations.findOne({ monthKey });
		if (!monthlyReg) {
			console.log(`  ⚠️ ${monthKey} 월별 등록 데이터 없음 - 스킵`);
			return result;
		}

		// ========================================
		// Step 3: 지급 대상자 재분류
		// ========================================
		console.log(`\n[Step 2] 지급 대상자 재분류...`);

		// 3-1. 승급자 재확인 (현재 등급 vs 이전 등급)
		const promotedTargets = [];
		for (const p of (monthlyReg.paymentTargets?.promoted || [])) {
			const user = await User.findById(p.userId);
			if (user && user.status === 'active') {
				promotedTargets.push({
					userId: p.userId,
					userName: user.name,
					grade: user.grade, // 현재 등급 사용
					oldGrade: p.oldGrade
				});
			}
		}

		// 3-2. 등록자 중 미승급자 확인
		const promotedIds = promotedTargets.map(p => p.userId);
		const registrantF1Targets = [];
		for (const r of (monthlyReg.registrations || [])) {
			if (!promotedIds.includes(r.userId)) {
				const user = await User.findById(r.userId);
				if (user && user.status === 'active') {
					registrantF1Targets.push({
						userId: r.userId,
						userName: user.name,
						grade: user.grade
					});
				}
			}
		}

		// 3-3. 추가지급 대상자 재확인
		const additionalTargets = await findAdditionalPaymentTargets(
			promotedTargets,
			registrantF1Targets,
			monthKey
		);

		console.log(`  → 승급자: ${promotedTargets.length}명`);
		console.log(`  → 등록자(미승급): ${registrantF1Targets.length}명`);
		console.log(`  → 추가지급: ${additionalTargets.length}명`);

		// ========================================
		// Step 4: gradeDistribution 재계산
		// ========================================
		console.log(`\n[Step 3] 등급별 분포 재계산...`);
		const gradeDistribution = {
			F1: 0, F2: 0, F3: 0, F4: 0,
			F5: 0, F6: 0, F7: 0, F8: 0
		};

		promotedTargets.forEach(t => {
			if (gradeDistribution[t.grade] !== undefined) {
				gradeDistribution[t.grade]++;
			}
		});

		registrantF1Targets.forEach(t => {
			if (gradeDistribution[t.grade] !== undefined) {
				gradeDistribution[t.grade]++;
			}
		});

		additionalTargets.forEach(t => {
			if (gradeDistribution[t.grade] !== undefined) {
				gradeDistribution[t.grade]++;
			}
		});

		result.gradeDistribution = gradeDistribution;
		console.log(`  → 등급별 인원:`, gradeDistribution);

		// ========================================
		// Step 5: 매출 재계산 (ratio 반영)
		// ========================================
		console.log(`\n[Step 4] 매출 재계산 (ratio 반영)...`);
		let recalculatedRevenue = 0;
		for (const reg of monthlyReg.registrations) {
			const userDoc = await User.findById(reg.userId);
			const ratio = userDoc?.ratio ?? 1;
			recalculatedRevenue += Math.floor(1000000 * ratio);
		}

		// 매출 업데이트 (adjustedRevenue가 없으면 totalRevenue 업데이트)
		if (monthlyReg.adjustedRevenue === null || monthlyReg.adjustedRevenue === undefined) {
			monthlyReg.totalRevenue = recalculatedRevenue;
			console.log(`  → 매출 재계산: ${recalculatedRevenue.toLocaleString()}원`);
		} else {
			console.log(`  → 수동 조정 매출 유지: ${monthlyReg.adjustedRevenue.toLocaleString()}원`);
		}
		result.totalRevenue = monthlyReg.getEffectiveRevenue();

		// ========================================
		// Step 6: gradePayments 재계산
		// ========================================
		console.log(`\n[Step 5] 등급별 지급액 재계산...`);
		const revenue = monthlyReg.getEffectiveRevenue();
		let gradePayments = calculateGradePayments(revenue, gradeDistribution);

		// 조정값이 있으면 적용
		if (monthlyReg.adjustedGradePayments) {
			for (const [grade, adj] of Object.entries(monthlyReg.adjustedGradePayments)) {
				if (adj && adj.totalAmount !== null && adj.totalAmount !== undefined) {
					gradePayments[grade] = adj.totalAmount;
					console.log(`  → ${grade} 조정값 적용: ${adj.totalAmount.toLocaleString()}원`);
				}
			}
		}

		result.gradePayments = gradePayments;
		console.log(`  → 등급별 지급액:`, gradePayments);

		// ========================================
		// Step 7: MonthlyRegistrations 업데이트
		// ========================================
		console.log(`\n[Step 6] MonthlyRegistrations 업데이트...`);
		monthlyReg.paymentTargets = {
			registrants: registrantF1Targets.map(t => ({
				userId: t.userId,
				userName: t.userName,
				grade: t.grade
			})),
			promoted: promotedTargets.map(t => ({
				userId: t.userId,
				userName: t.userName,
				oldGrade: t.oldGrade,
				newGrade: t.grade,
				promotionDate: new Date()
			})),
			additionalPayments: additionalTargets.map(t => ({
				userId: t.userId,
				userName: t.userName,
				grade: t.grade,
				추가지급단계: t.추가지급단계 || 1
			}))
		};
		monthlyReg.gradeDistribution = gradeDistribution;
		monthlyReg.gradePayments = gradePayments;
		await monthlyReg.save();
		console.log(`  → 저장 완료`);

		// ========================================
		// Step 8: WeeklyPaymentPlans 삭제 후 새로 생성
		// ========================================
		console.log(`\n[Step 7] WeeklyPaymentPlans 삭제 후 새로 생성...`);

		// 8-1. 기존 지급 계획 삭제 (해당 월)
		const deletedPlans = await WeeklyPaymentPlans.deleteMany({ revenueMonth: monthKey });
		console.log(`  → 기존 지급 계획 ${deletedPlans.deletedCount}건 삭제`);

		// ⭐ 8-2. 모든 등록자에 대해 초기 지급 계획 생성 (승급자 포함!)
		// 원래 엑셀 업로드 흐름: 등록 → initial 계획 → 등급 계산 → 승급 시 promotion 계획 추가
		// 따라서 승급자도 먼저 initial 계획을 가져야 함
		console.log(`  → 등록자 ${monthlyReg.registrations?.length || 0}명 초기 지급 계획 생성 중...`);
		for (const reg of (monthlyReg.registrations || [])) {
			const user = await User.findById(reg.userId);
			if (user && user.status === 'active') {
				try {
					// ⭐ 승급자도 등록 당시 등급(F1)으로 initial 계획 생성
					const promotedInfo = promotedTargets.find(p => p.userId === reg.userId);
					const initialGrade = promotedInfo ? (promotedInfo.oldGrade || 'F1') : user.grade;

					await createInitialPaymentPlan(
						user._id.toString(),  // userId = User._id
						user.name,
						initialGrade,         // 등록 당시 등급
						user.createdAt
					);
					result.plansUpdated++;
				} catch (err) {
					console.error(`    ⚠️ ${user.name} 초기 지급 계획 생성 실패:`, err.message);
				}
			}
		}

		// 8-3. 승급자(promoted)에 대해 추가로 승급 지급 계획 생성 + 기존 플랜 부분 종료
		console.log(`  → 승급자 ${promotedTargets.length}명 승급 지급 계획 생성 중...`);
		for (const promoted of promotedTargets) {
			const user = await User.findById(promoted.userId);
			if (user) {
				try {
					// ⭐ 승급일 계산: gradeHistory에서 해당 월의 승급 기록 찾기
					let promotionDate = user.createdAt;

					// gradeHistory에서 해당 월의 승급 기록 확인
					const promotionHistory = user.gradeHistory?.find(h =>
						h.type === 'promotion' &&
						h.revenueMonth === monthKey &&
						h.toGrade === user.grade
					);

					if (promotionHistory && promotionHistory.date) {
						promotionDate = new Date(promotionHistory.date);
					}

					const newPlan = await createPromotionPaymentPlan(
						user._id.toString(),  // userId = User._id
						user.name,
						user.grade,           // 현재(승급 후) 등급
						promotionDate,
						monthlyReg
					);
					result.plansUpdated++;

					// ⭐ 승급 시 기존 플랜 부분 종료 (엑셀 등록과 동일한 동작)
					// 새 플랜의 첫 지급일 이후의 기존 플랜 installments를 terminated로 변경
					if (newPlan) {
						await terminateActivePlansFromDate(
							user._id.toString(),
							newPlan.startDate,
							newPlan._id
						);
					}
				} catch (err) {
					console.error(`    ⚠️ ${user.name} 승급 지급 계획 생성 실패:`, err.message);
				}
			}
		}

		// 8-4. 추가지급 대상자 계획 생성
		if (additionalTargets.length > 0) {
			console.log(`  → 추가지급 대상자 ${additionalTargets.length}명 계획 생성 중...`);
			for (const target of additionalTargets) {
				try {
					const additionalPlan = await createAdditionalPaymentPlan(
						target.userId,
						target.userName,
						target.grade,
						target.추가지급단계 || 1,
						monthKey,
						gradePayments
					);
					if (additionalPlan) {
						result.plansUpdated++;
						console.log(`    ✅ ${target.userName} 추가지급 ${target.추가지급단계 || 1}단계 계획 생성`);
					}
				} catch (err) {
					console.error(`    ⚠️ ${target.userName} 추가지급 계획 생성 실패:`, err.message);
				}
			}
		}

		console.log(`  → 총 ${result.plansUpdated}건 지급 계획 생성 완료`);

		// ========================================
		// 완료
		// ========================================
		console.log(`\n[완료] ${monthKey} DB 기반 재처리 완료`);
		console.log(`  - 등급 변경: ${result.gradesUpdated}명`);
		console.log(`  - 매출: ${result.totalRevenue.toLocaleString()}원`);
		console.log(`  - 지급 계획 생성: ${result.plansUpdated}개`);
		console.log(`${'='.repeat(60)}\n`);

		return result;

	} catch (error) {
		console.error(`[DB 기반 재처리] 오류:`, error);
		throw error;
	}
}

/**
 * 추가지급 대상자 찾기
 * 이전 월 등록자/승급자 중 현재 월에 승급하지 않은 사람들
 */
async function findAdditionalPaymentTargets(promotedTargets, registrantTargets, registrationMonth) {
	const additionalTargets = [];

	// 제외 대상 ID (현재 월 승급자 + 현재 월 등록자)
	const excludeIds = new Set([
		...promotedTargets.map(p => p.userId),
		...registrantTargets.map(r => r.userId)
	]);

	// 이전 월들의 MonthlyRegistrations 조회 (현재 월 제외)
	const previousMonths = await MonthlyRegistrations.find({
		monthKey: { $lt: registrationMonth }
	}).sort({ monthKey: -1 });

	// 각 이전 월의 등록자/승급자 확인
	for (const prevReg of previousMonths) {
		const prevMonthKey = prevReg.monthKey;

		// 이전 월 등록자들
		for (const reg of (prevReg.registrations || [])) {
			if (excludeIds.has(reg.userId)) continue;

			const user = await User.findById(reg.userId);
			if (!user || user.status !== 'active') continue;

			// 현재 등급에서 시작한 월 확인 (gradeHistory에서 마지막 등록/승급)
			const gradeStartEntry = findGradeStartEntry(user.gradeHistory, user.grade);
			if (!gradeStartEntry) continue;

			const gradeStartMonth = gradeStartEntry.revenueMonth;
			const monthsInGrade = getMonthDiff(registrationMonth, gradeStartMonth);
			const maxMonths = MAX_ADDITIONAL_PAYMENTS[user.grade] || 0;

			// 추가지급 가능 여부 확인
			if (monthsInGrade > 0 && monthsInGrade <= maxMonths) {
				// 이미 추가한 대상인지 확인
				if (!additionalTargets.some(t => t.userId === reg.userId)) {
					additionalTargets.push({
						userId: reg.userId,
						userName: user.name,
						grade: user.grade,
						추가지급단계: monthsInGrade,
						type: 'additional'
					});
				}
			}
		}

		// 이전 월 승급자들
		for (const promoted of (prevReg.paymentTargets?.promoted || [])) {
			if (excludeIds.has(promoted.userId)) continue;

			const user = await User.findById(promoted.userId);
			if (!user || user.status !== 'active') continue;

			// 현재 등급에서 시작한 월 확인
			const gradeStartEntry = findGradeStartEntry(user.gradeHistory, user.grade);
			if (!gradeStartEntry) continue;

			const gradeStartMonth = gradeStartEntry.revenueMonth;
			const monthsInGrade = getMonthDiff(registrationMonth, gradeStartMonth);
			const maxMonths = MAX_ADDITIONAL_PAYMENTS[user.grade] || 0;

			// 추가지급 가능 여부 확인
			if (monthsInGrade > 0 && monthsInGrade <= maxMonths) {
				// 이미 추가한 대상인지 확인
				if (!additionalTargets.some(t => t.userId === promoted.userId)) {
					additionalTargets.push({
						userId: promoted.userId,
						userName: user.name,
						grade: user.grade,
						추가지급단계: monthsInGrade,
						type: 'additional'
					});
				}
			}
		}
	}

	return additionalTargets;
}

/**
 * gradeHistory에서 특정 등급 시작 entry 찾기
 */
function findGradeStartEntry(gradeHistory, targetGrade) {
	if (!gradeHistory || gradeHistory.length === 0) return null;

	// 역순으로 탐색하여 해당 등급이 시작된 entry 찾기
	for (let i = gradeHistory.length - 1; i >= 0; i--) {
		const entry = gradeHistory[i];
		if (entry.type === 'promotion' && entry.toGrade === targetGrade) {
			return entry;
		}
		if (entry.type === 'registration' && entry.grade === targetGrade) {
			return entry;
		}
	}

	// 첫 등록 entry 반환
	return gradeHistory.find(h => h.type === 'registration');
}

/**
 * 두 월 사이의 개월 수 차이 계산
 */
function getMonthDiff(currentMonth, startMonth) {
	const [currentYear, currentMon] = currentMonth.split('-').map(Number);
	const [startYear, startMon] = startMonth.split('-').map(Number);
	return (currentYear - startYear) * 12 + (currentMon - startMon);
}

/**
 * ⭐ 승급 시 기존 플랜 부분 종료
 * - 새 플랜의 첫 지급일 기준으로 기존 플랜 terminate
 * - excludePlanId: 새로 생성된 플랜은 제외
 *
 * @param {string} userId - 사용자 ID
 * @param {Date} firstPaymentDate - 새 플랜의 첫 지급일
 * @param {ObjectId} excludePlanId - 제외할 플랜 ID (새로 생성된 플랜)
 * @returns {Promise<number>} 처리된 플랜 수
 */
async function terminateActivePlansFromDate(userId, firstPaymentDate, excludePlanId) {
	try {
		console.log(`[승급 처리] userId=${userId}: 첫 지급일=${firstPaymentDate.toISOString().split('T')[0]} 기준으로 기존 플랜 종료`);

		// 모든 active 플랜 조회 (새로 생성된 플랜 제외)
		// ⭐ 승급 시 기본지급, 승급지급, 추가지급 모두 terminate
		const plans = await WeeklyPaymentPlans.find({
			userId: userId,
			planStatus: 'active',
			_id: { $ne: excludePlanId }
		});

		if (plans.length === 0) {
			return 0;
		}

		console.log(`[승급 처리] userId=${userId}: ${plans.length}개 active 플랜 확인`);

		let terminatedCount = 0;

		for (const plan of plans) {
			// ⭐ v8.0: 승급 첫 지급일 이후의 pending installments만 terminated로 변경
			let hasRemainingPending = false;
			let terminatedInstallments = 0;

			for (const inst of plan.installments) {
				if (inst.status === 'pending') {
					const instDate = new Date(inst.scheduledDate);
					if (instDate >= firstPaymentDate) {
						// 승급 첫 지급일 이후 → terminated
						inst.status = 'terminated';
						inst.terminatedReason = 'promotion';
						terminatedInstallments++;
					} else {
						// 승급 첫 지급일 이전 → 유지 (정상 지급)
						hasRemainingPending = true;
					}
				}
			}

			// ⭐ v8.0 FIX: 승급으로 인해 terminated installment가 있으면 planStatus도 terminated
			// 남은 pending은 정상 지급하되, 계획 자체는 종료 상태로 표시
			let newPlanStatus = plan.planStatus;
			if (terminatedInstallments > 0) {
				newPlanStatus = 'terminated';
			}

			const updateFields = {
				installments: plan.installments,
				planStatus: newPlanStatus,
				...(newPlanStatus === 'terminated' && {
					terminatedAt: new Date(),
					terminationReason: 'promotion',
					terminatedBy: 'promotion_additional_stop'
				})
			};

			await WeeklyPaymentPlans.updateOne(
				{ _id: plan._id },
				{ $set: updateFields },
				{ strict: false }
			);

			if (terminatedInstallments > 0) {
				terminatedCount++;
				const statusLabel = newPlanStatus === 'terminated' ? '종료' : '부분종료';
				console.log(`  - [${statusLabel}] ${plan.planType} ${plan.baseGrade} (${plan.revenueMonth}): ${terminatedInstallments}개 installment terminated, 남은 pending: ${hasRemainingPending}`);
			}
		}

		console.log(`[승급 처리] userId=${userId}: ${terminatedCount}개 플랜 처리 완료`);
		return terminatedCount;

	} catch (error) {
		console.error(`[terminateActivePlansFromDate] ${userId} 오류:`, error);
		return 0;
	}
}

/**
 * 가장 최근 등록월 조회
 */
export async function getLatestRegistrationMonth() {
	const latest = await MonthlyRegistrations.findOne({})
		.sort({ monthKey: -1 })
		.select('monthKey')
		.lean();

	return latest?.monthKey || null;
}

/**
 * 사용자가 특정 월에 등록되었는지 확인
 */
export async function isUserInMonth(userId, monthKey) {
	const monthlyReg = await MonthlyRegistrations.findOne({
		monthKey,
		'registrations.userId': userId
	});

	return !!monthlyReg;
}
