import { json } from '@sveltejs/kit';
import { db } from '$lib/server/db.js';
import { MonthlyRegistrations } from '$lib/server/models/MonthlyRegistrations.js';
import { MonthlyTreeSnapshots } from '$lib/server/models/MonthlyTreeSnapshots.js';
import { WeeklyPaymentPlans } from '$lib/server/models/WeeklyPaymentPlans.js';
import { WeeklyPaymentSummary } from '$lib/server/models/WeeklyPaymentSummary.js';

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

		// 1. 월별 등록 데이터 삭제
		const deletedRegistrations = await MonthlyRegistrations.deleteOne({ monthKey });

		// 2. 월별 스냅샷 삭제
		const deletedSnapshots = await MonthlyTreeSnapshots.deleteMany({ monthKey });

		// 3. 해당 월의 지급 계획 삭제
		const deletedPlans = await WeeklyPaymentPlans.deleteMany({ revenueMonth: monthKey });

		// 4. 해당 월의 주간 지급 요약 삭제
		const deletedSummaries = await WeeklyPaymentSummary.deleteMany({ monthKey });

		console.log(`[DB Delete] 삭제 완료:
			- 월별 등록: ${deletedRegistrations.deletedCount}건
			- 스냅샷: ${deletedSnapshots.deletedCount}건
			- 지급 계획: ${deletedPlans.deletedCount}건
			- 주간 요약: ${deletedSummaries.deletedCount}건
		`);

		return json({
			success: true,
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