import { json } from '@sveltejs/kit';
import { db } from '$lib/server/db.js';
import MonthlyRegistrations from '$lib/server/models/MonthlyRegistrations.js';

export async function GET({ locals }) {
	if (!locals.user || locals.user.type !== 'admin') {
		return json({ message: '권한이 없습니다.' }, { status: 401 });
	}

	await db();

	try {
		// v5.0: 모든 월별 등록 데이터 조회
		const registrations = await MonthlyRegistrations.find()
			.sort({ monthKey: -1 })
			.lean();

		return json({
			success: true,
			revenues: registrations.map(reg => {
				const [year, month] = reg.monthKey.split('-').map(Number);
				return {
					year,
					month,
					newUsersCount: reg.registrations?.length || 0,
					totalRevenue: reg.totalRevenue || 0,
					revenuePerInstallment: (reg.totalRevenue || 0) / 10,
					gradeDistribution: reg.gradeDistribution || {},
					gradePayments: reg.gradePayments || {},
					isCalculated: true,
					calculatedAt: reg.updatedAt || reg.createdAt
				};
			})
		});
	} catch (error) {
		console.error('월별 매출 조회 오류:', error);
		return json({
			success: false,
			error: '월별 매출 조회 중 오류가 발생했습니다.'
		}, { status: 500 });
	}
}