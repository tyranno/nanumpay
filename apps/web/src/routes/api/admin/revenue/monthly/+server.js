import { json } from '@sveltejs/kit';
import { db } from '$lib/server/db.js';
import MonthlyRevenue from '$lib/server/models/MonthlyRevenue.js';

export async function GET({ locals }) {
	if (!locals.user || locals.user.type !== 'admin') {
		return json({ message: '권한이 없습니다.' }, { status: 401 });
	}

	await db();

	try {
		// 모든 월별 매출 데이터 조회
		const revenues = await MonthlyRevenue.find()
			.sort({ year: -1, month: -1 })
			.lean();

		return json({
			success: true,
			revenues: revenues.map(rev => ({
				year: rev.year,
				month: rev.month,
				newUsersCount: rev.newUsersCount,
				totalRevenue: rev.totalRevenue,
				revenuePerInstallment: rev.revenuePerInstallment,
				gradeDistribution: rev.gradeDistribution,
				gradePayments: rev.gradePayments,
				isCalculated: rev.isCalculated,
				calculatedAt: rev.calculatedAt
			}))
		});
	} catch (error) {
		console.error('월별 매출 조회 오류:', error);
		return json({
			success: false,
			error: '월별 매출 조회 중 오류가 발생했습니다.'
		}, { status: 500 });
	}
}