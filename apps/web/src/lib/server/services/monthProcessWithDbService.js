/**
 * DB 기반 월별 지급 계획 재처리 서비스
 *
 * bulk 구조(processUserRegistration)를 그대로 사용
 *
 * 핵심 흐름:
 * 1. 해당 월 등록자 조회
 * 2. 조상(부모 체인) 수집
 * 3. 조상 + 등록자 모두 등급 F1로 초기화 + gradeHistory promotion 제거
 * 4. 조상 + 등록자 플랜에서 terminated → pending 복원
 * 5. 해당 월 플랜 삭제
 * 6. processUserRegistration 호출 (bulk 구조 그대로)
 */

import User from '../models/User.js';
import MonthlyRegistrations from '../models/MonthlyRegistrations.js';
import WeeklyPaymentPlans from '../models/WeeklyPaymentPlans.js';
import { processUserRegistration } from './registrationService.js';

/**
 * 월별 지급 계획 재처리 (DB 기반)
 *
 * @param {string} monthKey - 재처리할 월 (YYYY-MM)
 * @returns {Promise<Object>} 처리 결과
 */
export async function reprocessMonthPayments(monthKey) {
	console.log(`[재처리] ${monthKey} 시작`);

	try {
		// 1. 해당 월 등록자 조회
		const monthlyReg = await MonthlyRegistrations.findOne({ monthKey });
		if (!monthlyReg || !monthlyReg.registrations?.length) {
			console.log(`[재처리] ${monthKey} 등록 데이터 없음 - 스킵`);
			return { success: false, message: '등록 데이터 없음' };
		}

		const userIds = monthlyReg.registrations.map((r) => r.userId);

		// 2. 조상(부모 체인) 수집
		const ancestorIds = new Set();
		for (const userId of userIds) {
			const user = await User.findById(userId).lean();
			if (!user) continue;

			let currentParentId = user.parentId;
			while (currentParentId) {
				ancestorIds.add(currentParentId.toString());
				const parent = await User.findById(currentParentId).lean();
				currentParentId = parent?.parentId;
			}
		}

		// 3. 등급 복원 (해당 월 이후 promotion 제거, 이전 월 등급으로 복원)
		const allUserIdsToReset = [...Array.from(ancestorIds), ...userIds];
		let gradeResetCount = 0;

		for (const userId of allUserIdsToReset) {
			const user = await User.findById(userId);
			if (!user) continue;

			const oldGrade = user.grade;

			// gradeHistory에서 해당 월 이후의 promotion만 제거
			const filteredHistory = (user.gradeHistory || []).filter(
				(h) => h.type !== 'promotion' || h.revenueMonth < monthKey
			);

			// 이전 월까지의 마지막 등급 찾기
			const previousPromotions = filteredHistory
				.filter(h => h.type === 'promotion' && h.revenueMonth < monthKey)
				.sort((a, b) => (b.revenueMonth || '').localeCompare(a.revenueMonth || ''));

			const restoredGrade = previousPromotions.length > 0
				? previousPromotions[0].toGrade
				: 'F1';

			if (oldGrade !== restoredGrade || user.gradeHistory?.length !== filteredHistory.length) {
				user.grade = restoredGrade;
				user.gradeHistory = filteredHistory;
				await user.save();
				gradeResetCount++;
			}
		}

		// 4. 플랜 복원 (해당 월에 의해 terminated된 것만)
		let restoredCount = 0;
		for (const userId of allUserIdsToReset) {
			const plans = await WeeklyPaymentPlans.find({
				userId: userId,
				planStatus: 'terminated',
				terminatedByRevenueMonth: monthKey
			});

			for (const plan of plans) {
				let restored = false;

				for (const inst of plan.installments) {
					if (inst.status === 'terminated') {
						inst.status = 'pending';
						inst.terminatedReason = undefined;
						restored = true;
					}
				}

				if (restored) {
					plan.planStatus = 'active';
					plan.terminatedAt = undefined;
					plan.terminationReason = undefined;
					plan.terminatedByRevenueMonth = undefined;
					await plan.save();
					restoredCount++;
				}
			}
		}

		// 5. 해당 월 플랜 삭제
		const deletedPlans = await WeeklyPaymentPlans.deleteMany({ revenueMonth: monthKey });

		// 6. processUserRegistration 호출
		const result = await processUserRegistration(userIds);

		// 결과 로그
		console.log(`[재처리] ${monthKey} 완료: 등록자 ${userIds.length}명, 조상 ${ancestorIds.size}명, 등급복원 ${gradeResetCount}명, 플랜복원 ${restoredCount}건, 삭제 ${deletedPlans.deletedCount}건, 승급자 ${result.promotedUsers}명, 플랜 ${result.paymentPlans}개`);

		return {
			success: true,
			monthKey,
			registeredUsers: userIds.length,
			promotedUsers: result.promotedUsers,
			paymentPlans: result.paymentPlans,
			restoredPlans: restoredCount,
			gradesUpdated: gradeResetCount,
			plansUpdated: result.paymentPlans
		};
	} catch (error) {
		console.error(`[재처리] ${monthKey} 오류:`, error);
		throw error;
	}
}

/**
 * 가장 최근 등록월 조회
 */
export async function getLatestRegistrationMonth() {
	const latest = await MonthlyRegistrations.findOne({}).sort({ monthKey: -1 }).select('monthKey').lean();

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
