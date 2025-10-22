import { json } from '@sveltejs/kit';
import { db } from '$lib/server/db.js';
import { MonthlyRegistrations } from '$lib/server/models/MonthlyRegistrations.js';
import { MonthlyTreeSnapshots } from '$lib/server/models/MonthlyTreeSnapshots.js';
import { WeeklyPaymentPlans } from '$lib/server/models/WeeklyPaymentPlans.js';
import { WeeklyPaymentSummary } from '$lib/server/models/WeeklyPaymentSummary.js';
import { User } from '$lib/server/models/User.js';
import { PlannerAccount } from '$lib/server/models/PlannerAccount.js';

export async function POST({ request, locals }) {
	try {
		// 개발 환경에서만 허용
		if (process.env.NODE_ENV === 'production') {
			return json({ error: '프로덕션 환경에서는 사용할 수 없습니다.' }, { status: 403 });
		}

		// 관리자 권한 확인
		if (!locals.user || locals.user.role !== 'admin') {
			return json({ error: '관리자 권한이 필요합니다.' }, { status: 401 });
		}

		await db();

		const { monthKey } = await request.json();

		if (!monthKey) {
			return json({ error: '삭제할 월을 지정해주세요.' }, { status: 400 });
		}

		console.log(`[DB Delete] 월별 데이터 삭제 시작: ${monthKey}`);

		// 해당 월에 등록된 용역자 조회
		const monthRegex = new RegExp(`^${monthKey}`);
		const usersToDelete = await User.find({ registrationDate: monthRegex });
		const userIds = usersToDelete.map(u => u.userId);

		console.log(`[DB Delete] ${monthKey} 등록 용역자: ${userIds.length}명 - ${userIds.join(', ')}`);

		// 해당 월에 등록된 설계사 조회 (등록일 기준)
		const plannersToDelete = await PlannerAccount.find({ registeredAt: monthRegex });
		const plannerIds = plannersToDelete.map(p => p.plannerPhone);

		console.log(`[DB Delete] ${monthKey} 등록 설계사: ${plannerIds.length}명`);

		// 1. 해당 월에 등록된 용역자 삭제
		const deletedUsers = await User.deleteMany({ registrationDate: monthRegex });

		// 2. 해당 월에 등록된 설계사 삭제
		const deletedPlanners = await PlannerAccount.deleteMany({ registeredAt: monthRegex });

		// 3. 월별 등록 데이터 삭제
		const deletedRegistrations = await MonthlyRegistrations.deleteOne({ monthKey });

		// 4. 월별 스냅샷 삭제
		const deletedSnapshots = await MonthlyTreeSnapshots.deleteMany({ monthKey });

		// 5. 해당 월의 지급 계획 삭제 (revenueMonth 기준)
		const deletedPlans = await WeeklyPaymentPlans.deleteMany({ revenueMonth: monthKey });

		// 6. 해당 월의 주간 지급 요약 삭제
		const deletedSummaries = await WeeklyPaymentSummary.deleteMany({ monthKey });

		console.log(`[DB Delete] 삭제 완료:
			- 용역자: ${deletedUsers.deletedCount}건
			- 설계사: ${deletedPlanners.deletedCount}건
			- 월별 등록: ${deletedRegistrations.deletedCount}건
			- 스냅샷: ${deletedSnapshots.deletedCount}건
			- 지급 계획: ${deletedPlans.deletedCount}건
			- 주간 요약: ${deletedSummaries.deletedCount}건
		`);

		return json({
			success: true,
			deletedUsers: deletedUsers.deletedCount,
			deletedPlanners: deletedPlanners.deletedCount,
			deletedRegistrations: deletedRegistrations.deletedCount,
			deletedSnapshots: deletedSnapshots.deletedCount,
			deletedPlans: deletedPlans.deletedCount,
			deletedSummaries: deletedSummaries.deletedCount
		});
	} catch (error) {
		console.error('Delete monthly data error:', error);
		return json({ error: '월별 데이터 삭제 중 오류가 발생했습니다.' }, { status: 500 });
	}
}