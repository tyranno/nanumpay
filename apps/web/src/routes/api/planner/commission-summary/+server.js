import { json } from '@sveltejs/kit';
import PlannerCommissionPlan from '$lib/server/models/PlannerCommissionPlan.js';
import mongoose from 'mongoose';

/**
 * 설계사 수당 요약 정보 조회 (PlannerCommissionPlan 사용)
 * GET /api/planner/commission-summary
 */
export async function GET({ locals, url }) {
	try {
		// 설계사 계정 확인
		if (!locals.user || locals.user.accountType !== 'planner') {
			return json({ error: '인증되지 않은 요청입니다.' }, { status: 401 });
		}

		// plannerAccountId를 ObjectId로 변환
		const plannerAccountId = new mongoose.Types.ObjectId(locals.user.id);

		// 기간 파라미터 가져오기
		const startYear = parseInt(url.searchParams.get('startYear') || new Date().getFullYear());
		const startMonth = parseInt(url.searchParams.get('startMonth') || (new Date().getMonth() + 1));
		const endYear = parseInt(url.searchParams.get('endYear') || new Date().getFullYear());
		const endMonth = parseInt(url.searchParams.get('endMonth') || (new Date().getMonth() + 1));

		// 시작월과 종료월 날짜 범위 생성
		const startDate = new Date(Date.UTC(startYear, startMonth - 1, 1));
		const endDate = new Date(Date.UTC(endYear, endMonth, 1)); // 다음 달 1일

		console.log(`🔍 설계사 수당 조회 (PlannerCommissionPlan): plannerAccountId=${plannerAccountId}, 기간=${startDate.toISOString().split('T')[0]} ~ ${endDate.toISOString().split('T')[0]}`);

		// PlannerCommissionPlan에서 집계
		const commissionPlans = await PlannerCommissionPlan.aggregate([
			// 설계사 및 기간 필터링
			{
				$match: {
					plannerAccountId,
					paymentDate: {
						$gte: startDate,
						$lt: endDate
					}
				}
			},

			// 지급월별로 그룹핑
			{
				$group: {
					_id: {
						$dateToString: { format: '%Y-%m', date: '$paymentDate' }
					},
					totalCommission: { $sum: '$commissionAmount' },
					totalUsers: { $sum: 1 },
					totalRevenue: { $sum: '$revenue' }
				}
			},

			// 월순 정렬
			{
				$sort: { _id: 1 }
			}
		]);

		console.log(`📊 조회 결과: ${commissionPlans.length}건`, commissionPlans.map(c => ({ month: c._id, amount: c.totalCommission })));

		// 월별로 요약
		const monthlySummary = commissionPlans.map(plan => ({
			month: plan._id,
			totalCommission: plan.totalCommission || 0,
			totalUsers: plan.totalUsers || 0,
			totalRevenue: plan.totalRevenue || 0
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
