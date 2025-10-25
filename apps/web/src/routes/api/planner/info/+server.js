import { json } from '@sveltejs/kit';
import { db } from '$lib/server/db.js';
import PlannerAccount from '$lib/server/models/PlannerAccount.js';

export async function GET({ locals }) {
	// 설계사 계정 확인
	if (!locals.user || locals.user.accountType !== 'planner') {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	await db();

	try {
		// 설계사 정보 조회
		const planner = await PlannerAccount.findById(locals.user.id)
			.select('name phone loginId email address workplace');

		if (!planner) {
			return json({ error: '설계사 정보를 찾을 수 없습니다.' }, { status: 404 });
		}

		return json({
			id: planner._id,
			loginId: planner.loginId,
			name: planner.name,
			phone: planner.phone,
			email: planner.email || '',
			address: planner.address || '',
			workplace: planner.workplace || ''
		});
	} catch (error) {
		console.error('설계사 정보 조회 오류:', error);
		return json({ error: '서버 오류가 발생했습니다.' }, { status: 500 });
	}
}