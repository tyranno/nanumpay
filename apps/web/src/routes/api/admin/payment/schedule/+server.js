import { json } from '@sveltejs/kit';
import { connectDB } from '$lib/server/db.js';
import WeeklyPaymentSummary from '$lib/server/models/WeeklyPaymentSummary.js';
import WeeklyPaymentPlans from '$lib/server/models/WeeklyPaymentPlans.js';

/**
 * v5.0: 주차별 지급 스케줄 조회
 * (이전 v2 PaymentSchedule 대체)
 */
export async function GET({ url }) {
	await connectDB();

	try {
		const year = parseInt(url.searchParams.get('year'));
		const month = parseInt(url.searchParams.get('month'));
		const week = parseInt(url.searchParams.get('week'));

		console.log(`[API] GET /api/admin/payment/schedule 요청:`, { year, month, week });

		if (!year || !month || !week) {
			console.log(`[API] 파라미터 오류: year=${year}, month=${month}, week=${week}`);
			return json({
				success: false,
				error: '년도, 월, 주차 정보가 필요합니다.'
			}, { status: 400 });
		}

		// v5.0: ISO 주차 계산
		const date = new Date(year, month - 1, 1 + (week - 1) * 7);
		const startOfYear = new Date(year, 0, 1);
		const dayOfYear = Math.floor((date - startOfYear) / (1000 * 60 * 60 * 24));
		const weekNumber = Math.ceil((dayOfYear + startOfYear.getDay() + 1) / 7);

		console.log(`[API] 계산된 weekNumber: ${weekNumber}`);

		// v5.0: 주간 지급 요약 조회
		const summary = await WeeklyPaymentSummary.findOne({ weekNumber });

		// v5.0: 해당 주차의 분할금 조회
		const installments = await WeeklyPaymentPlans.aggregate([
			{
				$unwind: '$installments'
			},
			{
				$match: {
					'installments.weekNumber': weekNumber
				}
			},
			{
				$lookup: {
					from: 'users',
					localField: 'userId',
					foreignField: '_id',
					as: 'user'
				}
			},
			{
				$unwind: '$user'
			},
			{
				$project: {
					userId: '$user._id',
					userName: '$user.name',
					userGrade: '$user.grade',
					amount: '$installments.amount',
					status: '$installments.status',
					scheduledDate: '$installments.scheduledDate',
					paidDate: '$installments.paidDate',
					planType: '$planType',
					installmentNumber: '$installments.installmentNumber'
				}
			}
		]);

		console.log(`[API] 조회된 분할금 수: ${installments.length}`);

		return json({
			success: true,
			year,
			month,
			week,
			weekNumber,
			summary: summary ? {
				totalAmount: summary.totalAmount,
				totalTax: summary.totalTax,
				totalNetAmount: summary.totalNetAmount,
				userCount: summary.userCount,
				status: summary.status,
				processedAt: summary.processedAt
			} : null,
			installments
		});
	} catch (error) {
		console.error('[API] 스케줄 조회 오류:', error);
		return json({
			success: false,
			error: '스케줄 조회 중 오류가 발생했습니다.'
		}, { status: 500 });
	}
}
