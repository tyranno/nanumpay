import { json } from '@sveltejs/kit';
import { connectDB } from '$lib/server/db.js';
import WeeklyPaymentPlans from '$lib/server/models/WeeklyPaymentPlans.js';

/**
 * v5.0: 월별 지급 계획 조회
 * (이전 v2 UserPaymentPlan 대체)
 */
export async function GET({ url }) {
	try {
		await connectDB();

		const year = parseInt(url.searchParams.get('year')) || new Date().getFullYear();
		const month = parseInt(url.searchParams.get('month')) || (new Date().getMonth() + 1);

		// v5.0: WeeklyPaymentPlans에서 해당 월의 지급 계획 조회
		const monthKey = `${year}-${String(month).padStart(2, '0')}`;

		const plans = await WeeklyPaymentPlans.find({
			revenueMonth: monthKey,
			planStatus: { $in: ['active', 'completed'] }
		})
		.populate('userId', 'name loginId grade')
		.lean();

		// 월별로 그룹화하여 반환
		const monthlyPlans = plans.map(plan => ({
			userId: plan.userId._id,
			userName: plan.userId.name,
			userGrade: plan.userId.grade,
			planType: plan.planType,
			baseGrade: plan.baseGrade,
			totalAmount: plan.totalAmount,
			installmentCount: plan.installments.length,
			paidCount: plan.installments.filter(i => i.status === 'completed').length,
			revenueMonth: plan.revenueMonth,
			planStatus: plan.planStatus
		}));

		return json({
			success: true,
			year,
			month,
			plans: monthlyPlans
		});
	} catch (error) {
		console.error('월별 지급 계획 조회 오류:', error);
		return json({
			success: false,
			error: '월별 지급 계획 조회 중 오류가 발생했습니다.'
		}, { status: 500 });
	}
}
