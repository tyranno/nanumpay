import { json } from '@sveltejs/kit';
import { db } from '$lib/server/db.js';
import MonthlyRegistrations from '$lib/server/models/MonthlyRegistrations.js';
import WeeklyPaymentPlans from '$lib/server/models/WeeklyPaymentPlans.js';
import WeeklyPaymentSummary from '$lib/server/models/WeeklyPaymentSummary.js';
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
		let plannerIds = [];

		if (monthlyReg && monthlyReg.registrations) {
			userIds = monthlyReg.registrations.map(r => r.userId);

			// 설계사 목록 추출 (중복 제거)
			const plannerNames = [...new Set(monthlyReg.registrations.map(r => r.planner))];
			const planners = await PlannerAccount.find({ loginId: { $in: plannerNames } });
			plannerIds = planners.map(p => p._id);
		}

		console.log(`[DB Delete] ${monthKey} 등록 용역자: ${userIds.length}명 - ${userIds.join(', ')}`);
		console.log(`[DB Delete] ${monthKey} 등록 설계사: ${plannerIds.length}명 - ${plannerIds.join(', ')}`);

		// ⭐ 방법1: 삭제 전 승급자의 canceled 추가지급 복원
		const promotedUsers = monthlyReg?.paymentTargets?.promoted || [];
		const promotedUserIds = promotedUsers.map(p => p.userId);
		if (promotedUserIds.length > 0) {
			console.log(`[DB Delete] ${monthKey} 승급자 ${promotedUserIds.length}명의 canceled 추가지급 복원 시도...`);

			// 승급자들의 모든 추가지급 계획 중 canceled된 회차 복원
			const restored = await WeeklyPaymentPlans.updateMany(
				{
					userId: { $in: promotedUserIds },
					installmentType: 'additional',
					'installments.status': 'canceled'
				},
				{
					$set: { 'installments.$[elem].status': 'pending' }
				},
				{
					arrayFilters: [{ 'elem.status': 'canceled' }]
				}
			);
			console.log(`[DB Delete] ${monthKey} 승급자 canceled → pending 복원: ${restored.modifiedCount}건`);
		}

		// 1. 해당 월 승급자의 새 등급 지급 계획 삭제 (createdBy: 'promotion', revenueMonth: monthKey)
		const deletedPromotionPlans = await WeeklyPaymentPlans.deleteMany({
			userId: { $in: promotedUserIds },
			createdBy: 'promotion',
			revenueMonth: monthKey
		});
		if (deletedPromotionPlans.deletedCount > 0) {
			console.log(`[DB Delete] 승급자 새 등급 지급 계획 ${deletedPromotionPlans.deletedCount}건 삭제`);
		}

		// 3. 해당 월에 등록된 용역자의 모든 지급 계획 삭제 (User 삭제 전에!)
		// ⭐ User cascade hook에서는 지급 계획을 삭제하지 않으므로 여기서 먼저 삭제
		const deletedUserPlans = await WeeklyPaymentPlans.deleteMany({ userId: { $in: userIds } });
		console.log(`[DB Delete] 신규 용역자 지급 계획 ${deletedUserPlans.deletedCount}건 삭제`);

		// 3-1. ⭐ 해당 월에 등록된 용역자의 설계사 수당 계획 삭제
		const deletedCommissionPlans = await PlannerCommissionPlan.deleteMany({ userId: { $in: userIds } });
		console.log(`[DB Delete] 설계사 수당 계획 ${deletedCommissionPlans.deletedCount}건 삭제`);

		// 4. 해당 월에 등록된 용역자 삭제 (cascade hook 작동하도록 개별 삭제)
		// ⭐ deleteMany()는 pre hook을 호출하지 않으므로 findByIdAndDelete() 사용
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
		const deletedUsers = { deletedCount: deletedUsersCount };

		// 5. ⭐ UserAccount 정리: 연결된 User가 모두 삭제되었으면 UserAccount도 삭제
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
			console.log(`[DB Delete] UserAccount ${deletedUserAccountsCount}개 삭제 (연결된 User 없음)`);
		}

		// 6. 설계사 정리: 다른 용역자에 등록되어 있으면 유지, 없으면 삭제
		let deletedPlannersCount = 0;
		for (const plannerId of plannerIds) {
			// 이 설계사가 다른 용역자에도 등록되어 있는지 확인
			const remainingUsers = await User.countDocuments({ plannerId });
			if (remainingUsers === 0) {
				await PlannerAccount.findByIdAndDelete(plannerId);
				deletedPlannersCount++;
			}
		}
		if (deletedPlannersCount > 0) {
			console.log(`[DB Delete] PlannerAccount ${deletedPlannersCount}개 삭제 (연결된 User 없음)`);
		}
		const deletedPlanners = { deletedCount: deletedPlannersCount };

		// 7. 월별 등록 데이터 삭제
		const deletedRegistrations = await MonthlyRegistrations.deleteOne({ monthKey });

		// 8. 해당 월 매출분 지급 계획 삭제 (추가지급 등 남은 것)
		// ⭐ revenueMonth 기준으로 삭제 (위에서 이미 삭제한 것 제외하고 남은 것만)
		const deletedRevenueMonthPlans = await WeeklyPaymentPlans.deleteMany({ revenueMonth: monthKey });
		console.log(`[DB Delete] 매출월 지급 계획 ${deletedRevenueMonthPlans.deletedCount}건 삭제 (추가지급 등)`);

		// 9. 해당 월의 주간 지급 요약 삭제
		const deletedSummaries = await WeeklyPaymentSummary.deleteMany({ monthKey });

		const totalDeletedPlans =
			deletedUserPlans.deletedCount +
			(deletedPromotionPlans?.deletedCount || 0) +
			deletedRevenueMonthPlans.deletedCount;

		console.log(`[DB Delete] 삭제 완료:
			- 용역자: ${deletedUsers.deletedCount}건
			- 지급 계획 총: ${totalDeletedPlans}건
			  ∟ 신규 용역자: ${deletedUserPlans.deletedCount}건
			  ∟ 승급자 새 등급: ${deletedPromotionPlans?.deletedCount || 0}건
			  ∟ 매출월 기준: ${deletedRevenueMonthPlans.deletedCount}건
			- 설계사 수당 계획: ${deletedCommissionPlans.deletedCount}건
			- 설계사: ${deletedPlanners.deletedCount}건
			- 월별 등록: ${deletedRegistrations.deletedCount}건
			- 주간 요약: ${deletedSummaries.deletedCount}건
		`);

		// 10. ⭐ 삭제 후 등급 재계산만 수행 (지급 계획 재생성 안 함!)
		// - 삭제로 인해 트리 구조가 변경되었으므로 등급 재계산 필요
		// - 기존 지급 계획은 그대로 유지 (삭제된 월 것만 이미 삭제됨)
		const { recalculateAllGrades } = await import('$lib/server/services/gradeCalculation.js');

		console.log(`[DB Delete] 등급 재계산 시작...`);
		try {
			const gradeResult = await recalculateAllGrades();
			console.log(`[DB Delete] 등급 재계산 완료: ${gradeResult.updatedCount}명 등급 변경`);

			if (gradeResult.changedUsers && gradeResult.changedUsers.length > 0) {
				gradeResult.changedUsers.forEach(u => {
					console.log(`  → ${u.userName}: ${u.oldGrade} → ${u.newGrade}`);
				});
			}
		} catch (gradeError) {
			console.error(`[DB Delete] 등급 재계산 실패:`, gradeError);
		}

		const reprocessedMonth = null;

		return json({
			success: true,
			deletedUsers: deletedUsers.deletedCount,
			deletedPlanners: deletedPlanners.deletedCount,
			deletedRegistrations: deletedRegistrations.deletedCount,
			deletedPlans: totalDeletedPlans,
			deletedCommissionPlans: deletedCommissionPlans.deletedCount,
			deletedSummaries: deletedSummaries.deletedCount,
			reprocessedMonth
		});
	} catch (error) {
		console.error('Delete monthly data error:', error);
		return json({ error: '월별 데이터 삭제 중 오류가 발생했습니다.' }, { status: 500 });
	}
}