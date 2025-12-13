import { json } from '@sveltejs/kit';
import { db } from '$lib/server/db.js';
import MonthlyRegistrations from '$lib/server/models/MonthlyRegistrations.js';
import WeeklyPaymentPlans from '$lib/server/models/WeeklyPaymentPlans.js';
import User from '$lib/server/models/User.js';
import PlannerAccount from '$lib/server/models/PlannerAccount.js';
import PlannerCommissionPlan from '$lib/server/models/PlannerCommissionPlan.js';

export async function POST({ request, locals }) {
	try {
		// 개발 환경에서만 허용
		if (process.env.NODE_ENV === 'production') {
			return json({ error: '프로덕션 환경에서는 사용할 수 없습니다.' }, { status: 403 });
		}

		// 관리자 권한 확인
		if (!locals.user || locals.user.type !== 'admin') {
			return json({ error: '관리자 권한이 필요합니다.' }, { status: 401 });
		}

		await db();

		const { monthKey } = await request.json();

		if (!monthKey) {
			return json({ error: '삭제할 월을 지정해주세요.' }, { status: 400 });
		}

		// 최신 월인지 확인 (역순으로만 삭제 가능)
		const allMonths = await MonthlyRegistrations.find({})
			.sort({ monthKey: -1 })
			.select('monthKey')
			.lean();

		if (allMonths.length === 0) {
			return json({ error: '삭제할 월별 데이터가 없습니다.' }, { status: 400 });
		}

		const latestMonth = allMonths[0].monthKey;

		if (monthKey !== latestMonth) {
			return json({
				error: `최신 월부터 순서대로 삭제해야 합니다. 현재 최신 월: ${latestMonth}`,
				latestMonth
			}, { status: 400 });
		}

		console.log(`[DB Delete] 월별 데이터 삭제 시작: ${monthKey}`);

		// 해당 월 등록 정보 조회
		const monthlyReg = await MonthlyRegistrations.findOne({ monthKey });

		let userIds = [];
		if (monthlyReg && monthlyReg.registrations) {
			userIds = monthlyReg.registrations.map(r => r.userId);
		}

		// 해당 월 승급자 목록
		const promotedUsers = monthlyReg?.paymentTargets?.promoted || [];
		const promotedUserIds = promotedUsers.map(p => p.userId);

		console.log(`[DB Delete] ${monthKey} 등록 용역자: ${userIds.length}명`);
		console.log(`[DB Delete] ${monthKey} 승급자: ${promotedUserIds.length}명`);

		// ========================================
		// 1단계: 해당 월 승급으로 terminated된 이전 월 계획 복원
		// ========================================
		if (promotedUserIds.length > 0) {
			// 해당 월 등록 시점 (이 시점 이후에 terminated된 것만 복원)
			const monthlyRegCreatedAt = monthlyReg?.createdAt || new Date();
			console.log(`[DB Delete] ${monthKey} 등록 시점: ${monthlyRegCreatedAt}`);

			// 복원 대상: 해당 월 승급자의 이전 월 계획 중 해당 월 등록 이후 terminated된 것
			// terminatedBy 또는 terminationReason이 promotion 관련인 경우 모두 포함
			const terminatedPlans = await WeeklyPaymentPlans.find({
				userId: { $in: promotedUserIds },
				planStatus: 'terminated',
				$or: [
					{ terminatedBy: { $in: ['promotion_additional_stop', 'promotion'] } },
					{ terminationReason: 'promotion' }
				],
				revenueMonth: { $lt: monthKey },
				terminatedAt: { $gte: monthlyRegCreatedAt }
			});

			console.log(`[DB Delete] 복원 대상 계획 ${terminatedPlans.length}건:`);
			for (const plan of terminatedPlans) {
				console.log(`  - User: ${plan.userName || plan.userId}, Grade: ${plan.baseGrade}, RevenueMonth: ${plan.revenueMonth}, TerminatedBy: ${plan.terminatedBy}, TerminatedAt: ${plan.terminatedAt}`);

				// ⭐ v8.0: terminated 상태를 pending으로 복원 (canceled 제거됨)
				const updatedInstallments = plan.installments.map(inst => ({
					...inst.toObject(),
					status: inst.status === 'terminated' ? 'pending' : inst.status
				}));

				await WeeklyPaymentPlans.updateOne(
					{ _id: plan._id },
					{
						$set: {
							planStatus: 'active',
							installments: updatedInstallments
						},
						$unset: {
							terminatedAt: '',
							terminatedBy: '',
							terminationReason: ''
						}
					}
				);
			}
			console.log(`[DB Delete] terminated → active 복원 완료: ${terminatedPlans.length}건`);
		}

		// ========================================
		// 2단계: 해당 월 데이터 삭제
		// ========================================

		// 2-1. 해당 월 승급자의 새 등급 지급 계획 삭제
		const deletedPromotionPlans = await WeeklyPaymentPlans.deleteMany({
			userId: { $in: promotedUserIds },
			createdBy: 'promotion',
			revenueMonth: monthKey
		});
		if (deletedPromotionPlans.deletedCount > 0) {
			console.log(`[DB Delete] 승급자 새 등급 계획 ${deletedPromotionPlans.deletedCount}건 삭제`);
		}

		// 2-2. 해당 월에 등록된 용역자의 지급 계획 삭제
		const deletedUserPlans = await WeeklyPaymentPlans.deleteMany({ userId: { $in: userIds } });
		console.log(`[DB Delete] 신규 용역자 지급 계획 ${deletedUserPlans.deletedCount}건 삭제`);

		// 2-3. 해당 월에 등록된 용역자의 설계사 수당 계획 삭제
		const deletedCommissionPlans = await PlannerCommissionPlan.deleteMany({ userId: { $in: userIds } });
		console.log(`[DB Delete] 설계사 수당 계획 ${deletedCommissionPlans.deletedCount}건 삭제`);

		// 2-4. 해당 월에 등록된 용역자 삭제 (cascade hook 작동)
		let deletedUsersCount = 0;
		const userAccountsToCheck = new Set();
		for (const userId of userIds) {
			const deleted = await User.findByIdAndDelete(userId);
			if (deleted) {
				if (deleted.userAccountId) {
					userAccountsToCheck.add(deleted.userAccountId.toString());
				}
				deletedUsersCount++;
			}
		}
		console.log(`[DB Delete] 용역자 ${deletedUsersCount}명 삭제`);

		// 2-5. UserAccount 정리
		const UserAccount = (await import('$lib/server/models/UserAccount.js')).default;
		let deletedUserAccountsCount = 0;
		for (const userAccountId of userAccountsToCheck) {
			const remainingUsers = await User.countDocuments({ userAccountId });
			if (remainingUsers === 0) {
				await UserAccount.findByIdAndDelete(userAccountId);
				deletedUserAccountsCount++;
			}
		}
		if (deletedUserAccountsCount > 0) {
			console.log(`[DB Delete] UserAccount ${deletedUserAccountsCount}개 삭제`);
		}

		// 2-6. 설계사 정리 (고아 상태인 것 삭제)
		let deletedPlannersCount = 0;
		const allPlanners = await PlannerAccount.find({});
		for (const planner of allPlanners) {
			const remainingUsers = await User.countDocuments({ plannerAccountId: planner._id });
			if (remainingUsers === 0) {
				await PlannerAccount.findByIdAndDelete(planner._id);
				deletedPlannersCount++;
			}
		}
		if (deletedPlannersCount > 0) {
			console.log(`[DB Delete] PlannerAccount ${deletedPlannersCount}개 삭제`);
		}

		// 2-7. 해당 월 매출분 지급 계획 삭제 (추가지급 등)
		const deletedRevenueMonthPlans = await WeeklyPaymentPlans.deleteMany({ revenueMonth: monthKey });
		console.log(`[DB Delete] ${monthKey} 매출분 지급 계획 ${deletedRevenueMonthPlans.deletedCount}건 삭제`);

		// 2-8. 해당 월 gradeHistory 제거
		await User.updateMany(
			{},
			{ $pull: { gradeHistory: { revenueMonth: monthKey } } }
		);

		// 2-9. 월별 등록 데이터 삭제
		const deletedRegistrations = await MonthlyRegistrations.deleteOne({ monthKey });

		// ========================================
		// 3단계: 등급 재계산
		// ========================================
		const { recalculateAllGrades } = await import('$lib/server/services/gradeCalculation.js');
		console.log(`[DB Delete] 등급 재계산 시작...`);

		try {
			const gradeResult = await recalculateAllGrades();
			console.log(`[DB Delete] 등급 재계산 완료: ${gradeResult.updatedCount}명 등급 변경`);
		} catch (gradeError) {
			console.error(`[DB Delete] 등급 재계산 실패:`, gradeError);
		}

		const totalDeletedPlans =
			deletedUserPlans.deletedCount +
			(deletedPromotionPlans?.deletedCount || 0) +
			deletedRevenueMonthPlans.deletedCount;

		console.log(`[DB Delete] 삭제 완료:
			- 용역자: ${deletedUsersCount}건
			- 지급 계획: ${totalDeletedPlans}건
			- 설계사 수당 계획: ${deletedCommissionPlans.deletedCount}건
			- 설계사: ${deletedPlannersCount}건
			- 월별 등록: ${deletedRegistrations.deletedCount}건
		`);

		return json({
			success: true,
			deletedUsers: deletedUsersCount,
			deletedPlanners: deletedPlannersCount,
			deletedRegistrations: deletedRegistrations.deletedCount,
			deletedPlans: totalDeletedPlans,
			deletedCommissionPlans: deletedCommissionPlans.deletedCount,
			deletedSummaries: 0,
			reprocessedMonth: null
		});
	} catch (error) {
		console.error('Delete monthly data error:', error);
		return json({ error: error?.message || '월별 데이터 삭제 중 오류가 발생했습니다.' }, { status: 500 });
	}
}

