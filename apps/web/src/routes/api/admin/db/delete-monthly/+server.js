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

		// ⭐ v8.2: 1단계 복원 로직 제거
		// - monthProcessWithDbService.reprocessMonthPayments()가 해당 월 플랜을 삭제 후 새로 생성함
		// - 따라서 별도의 복원 로직이 불필요
		// - 이전 월 플랜(7월, 8월 등)은 그대로 유지됨 (이전 승급 효과 유지)

		// ========================================
		// 1단계: 해당 월 데이터 삭제
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
		// 3단계: 이전 월(새 최신 월) 재처리
		// ⭐ reprocessMonthPayments로 등급 재계산 + 지급 계획 재생성
		// ========================================
		const totalDeletedPlans =
			deletedUserPlans.deletedCount +
			(deletedPromotionPlans?.deletedCount || 0) +
			deletedRevenueMonthPlans.deletedCount;

		// 삭제 후 새로운 최신 월 확인
		const newLatestMonthDoc = await MonthlyRegistrations.findOne({})
			.sort({ monthKey: -1 })
			.select('monthKey')
			.lean();

		let reprocessedMonth = null;

		if (newLatestMonthDoc) {
			const newLatestMonth = newLatestMonthDoc.monthKey;
			console.log(`[DB Delete] 새 최신 월: ${newLatestMonth} - 재처리 시작...`);

			try {
				const { reprocessMonthPayments } = await import('$lib/server/services/monthProcessWithDbService.js');
				const reprocessResult = await reprocessMonthPayments(newLatestMonth);
				reprocessedMonth = newLatestMonth;
				console.log(`[DB Delete] ${newLatestMonth} 재처리 완료:
					- 등급 변경: ${reprocessResult.gradesUpdated}명
					- 지급 계획 생성: ${reprocessResult.plansUpdated}개
				`);
			} catch (reprocessError) {
				console.error(`[DB Delete] ${newLatestMonth} 재처리 실패:`, reprocessError);
				// 재처리 실패해도 삭제는 성공으로 처리 (이전 월 복원은 이미 됨)
			}
		} else {
			console.log(`[DB Delete] 남은 월별 데이터 없음 - 재처리 스킵`);
		}

		console.log(`[DB Delete] 삭제 완료:
			- 용역자: ${deletedUsersCount}건
			- 지급 계획: ${totalDeletedPlans}건
			- 설계사 수당 계획: ${deletedCommissionPlans.deletedCount}건
			- 설계사: ${deletedPlannersCount}건
			- 월별 등록: ${deletedRegistrations.deletedCount}건
			- 재처리 월: ${reprocessedMonth || '없음'}
		`);

		return json({
			success: true,
			deletedUsers: deletedUsersCount,
			deletedPlanners: deletedPlannersCount,
			deletedRegistrations: deletedRegistrations.deletedCount,
			deletedPlans: totalDeletedPlans,
			deletedCommissionPlans: deletedCommissionPlans.deletedCount,
			deletedSummaries: 0,
			reprocessedMonth
		});
	} catch (error) {
		console.error('Delete monthly data error:', error);
		return json({ error: error?.message || '월별 데이터 삭제 중 오류가 발생했습니다.' }, { status: 500 });
	}
}

