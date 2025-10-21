import { json } from '@sveltejs/kit';
import { db } from '$lib/server/db.js';
import User from '$lib/server/models/User.js';

export async function GET({ locals }) {
	// 설계사 계정 확인
	if (!locals.user || locals.user.accountType !== 'planner') {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	await db();

	try {
		const plannerAccountId = locals.user.id;

		// 총 설계 건수 (설계사 계정 ID로 등록된 모든 계약)
		const totalContracts = await User.countDocuments({
			plannerAccountId: plannerAccountId
		});

		// 활성 계약 (grade가 있는 계약)
		const activeContracts = await User.countDocuments({
			plannerAccountId: plannerAccountId,
			grade: { $ne: null }
		});

		// 이번달 신규 계약
		const currentMonth = new Date();
		const startOfMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1);
		const endOfMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 0, 23, 59, 59);

		const thisMonthContracts = await User.countDocuments({
			plannerAccountId: plannerAccountId,
			registrationDate: {
				$gte: startOfMonth,
				$lte: endOfMonth
			}
		});

		return json({
			totalContracts,
			activeContracts,
			thisMonthContracts
		});
	} catch (error) {
		console.error('계약 통계 조회 오류:', error);
		return json({ error: '서버 오류가 발생했습니다.' }, { status: 500 });
	}
}