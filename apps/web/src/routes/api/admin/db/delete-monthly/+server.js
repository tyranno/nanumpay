import { json } from '@sveltejs/kit';
import { db } from '$lib/server/db.js';
import MonthlyRegistrations from '$lib/server/models/MonthlyRegistrations.js';
import WeeklyPaymentPlans from '$lib/server/models/WeeklyPaymentPlans.js';
import WeeklyPaymentSummary from '$lib/server/models/WeeklyPaymentSummary.js';
import User from '$lib/server/models/User.js';
import PlannerAccount from '$lib/server/models/PlannerAccount.js';

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

		// 1. 해당 월에 등록된 용역자 삭제 (cascade hook 작동하도록 개별 삭제)
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

		// 1-1. ⭐ UserAccount 정리: 연결된 User가 모두 삭제되었으면 UserAccount도 삭제
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

		// 2. 해당 월에 등록된 설계사 삭제 (MonthlyRegistrations에 기록된 설계사만)
		const deletedPlanners = await PlannerAccount.deleteMany({ _id: { $in: plannerIds } });

		// 3. 월별 등록 데이터 삭제
		const deletedRegistrations = await MonthlyRegistrations.deleteOne({ monthKey });

		// 4. 해당 월의 지급 계획 삭제 (revenueMonth 기준)
		const deletedPlans = await WeeklyPaymentPlans.deleteMany({ revenueMonth: monthKey });

		// 6. 해당 월의 주간 지급 요약 삭제
		const deletedSummaries = await WeeklyPaymentSummary.deleteMany({ monthKey });

		console.log(`[DB Delete] 삭제 완료:
			- 용역자: ${deletedUsers.deletedCount}건
			- 설계사: ${deletedPlanners.deletedCount}건
			- 월별 등록: ${deletedRegistrations.deletedCount}건
			- 지급 계획: ${deletedPlans.deletedCount}건
			- 주간 요약: ${deletedSummaries.deletedCount}건
		`);

		return json({
			success: true,
			deletedUsers: deletedUsers.deletedCount,
			deletedPlanners: deletedPlanners.deletedCount,
			deletedRegistrations: deletedRegistrations.deletedCount,
			deletedPlans: deletedPlans.deletedCount,
			deletedSummaries: deletedSummaries.deletedCount
		});
	} catch (error) {
		console.error('Delete monthly data error:', error);
		return json({ error: '월별 데이터 삭제 중 오류가 발생했습니다.' }, { status: 500 });
	}
}