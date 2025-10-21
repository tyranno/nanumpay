import { json } from '@sveltejs/kit';
import { db } from '$lib/server/db.js';
import User from '$lib/server/models/User.js';
import WeeklyPaymentPlans from '$lib/server/models/WeeklyPaymentPlans.js';

export async function GET({ locals }) {
	// 설계사 계정 확인
	if (!locals.user || locals.user.accountType !== 'planner') {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	await db();

	try {
		const plannerAccountId = locals.user.id;

		// 설계사가 설계한 모든 사용자 ID 조회
		const users = await User.find({ plannerAccountId: plannerAccountId }, '_id').lean();
		const userIds = users.map(u => u._id);

		if (userIds.length === 0) {
			return json({
				totalAmount: 0,
				totalTax: 0,
				totalNet: 0
			});
		}

		// 해당 사용자들의 모든 지급 계획에서 지급 완료된 금액 집계
		const result = await WeeklyPaymentPlans.aggregate([
			{
				$match: {
					userId: { $in: userIds.map(id => id.toString()) }
				}
			},
			{
				$unwind: '$installments'
			},
			{
				$match: {
					'installments.status': 'paid'
				}
			},
			{
				$group: {
					_id: null,
					totalAmount: { $sum: '$installments.installmentAmount' },
					totalTax: { $sum: '$installments.withholdingTax' },
					totalNet: { $sum: '$installments.netAmount' }
				}
			}
		]);

		if (result.length === 0) {
			return json({
				totalAmount: 0,
				totalTax: 0,
				totalNet: 0
			});
		}

		return json({
			totalAmount: result[0].totalAmount || 0,
			totalTax: result[0].totalTax || 0,
			totalNet: result[0].totalNet || 0
		});
	} catch (error) {
		console.error('지급 총액 조회 오류:', error);
		return json({ error: '서버 오류가 발생했습니다.' }, { status: 500 });
	}
}