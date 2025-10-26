import { json } from '@sveltejs/kit';
import PlannerCommission from '$lib/server/models/PlannerCommission.js';

/**
 * 설계사 수당 요약 정보 조회
 * GET /api/planner/commission-summary
 */
export async function GET({ locals, url }) {
	try {
		// 설계사 계정 확인
		if (!locals.user || locals.user.accountType !== 'planner') {
			return json({ error: '인증되지 않은 요청입니다.' }, { status: 401 });
		}

		const plannerAccountId = locals.user.id;

		// 기간 파라미터 가져오기
		const startYear = parseInt(url.searchParams.get('startYear') || new Date().getFullYear());
		const startMonth = parseInt(url.searchParams.get('startMonth') || (new Date().getMonth() + 1));
		const endYear = parseInt(url.searchParams.get('endYear') || new Date().getFullYear());
		const endMonth = parseInt(url.searchParams.get('endMonth') || (new Date().getMonth() + 1));

		// 시작월과 종료월 문자열 생성
		const startMonthStr = `${startYear}-${String(startMonth).padStart(2, '0')}`;
		const endMonthStr = `${endYear}-${String(endMonth).padStart(2, '0')}`;

		console.log(`🔍 설계사 수당 조회: plannerAccountId=${plannerAccountId}, 기간=${startMonthStr} ~ ${endMonthStr}`);

		// 기간 내 수당 데이터 조회 (지급월 기준으로 검색)
		const commissions = await PlannerCommission.find({
			plannerAccountId,
			paymentMonth: { $gte: startMonthStr, $lte: endMonthStr }
		})
			.sort({ paymentMonth: 1 })
			.lean();

		console.log(`📊 조회 결과: ${commissions.length}건`, commissions.map(c => ({ month: c.paymentMonth, amount: c.totalCommission })));

		// 월별로 요약 (지급월 기준으로 표시)
		const monthlySummary = commissions.map(comm => ({
			month: comm.paymentMonth || comm.revenueMonth, // 지급월 우선, 없으면 수급월
			totalCommission: comm.totalCommission || 0,
			totalUsers: comm.totalUsers || 0,
			totalRevenue: comm.totalRevenue || 0
		}));

		// 총계 계산
		const grandTotal = monthlySummary.reduce(
			(acc, item) => ({
				totalCommission: acc.totalCommission + item.totalCommission,
				totalUsers: acc.totalUsers + item.totalUsers,
				totalRevenue: acc.totalRevenue + item.totalRevenue
			}),
			{ totalCommission: 0, totalUsers: 0, totalRevenue: 0 }
		);

		return json({
			success: true,
			data: monthlySummary,
			grandTotal
		});
	} catch (error) {
		console.error('설계사 수당 요약 조회 오류:', error);
		return json({ error: '수당 요약 조회 중 오류가 발생했습니다.' }, { status: 500 });
	}
}
