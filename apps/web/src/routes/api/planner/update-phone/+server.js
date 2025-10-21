import { json } from '@sveltejs/kit';
import { db } from '$lib/server/db.js';
import PlannerAccount from '$lib/server/models/PlannerAccount.js';

export async function POST({ request, locals }) {
	// 설계사 계정 확인
	if (!locals.user || locals.user.accountType !== 'planner') {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	await db();

	try {
		const { phone } = await request.json();

		// 전화번호 유효성 검사
		const phoneRegex = /^010-?\d{4}-?\d{4}$/;
		const cleanedPhone = phone.replace(/-/g, '');

		if (!phoneRegex.test(cleanedPhone)) {
			return json({
				error: '올바른 전화번호 형식이 아닙니다. (010-XXXX-XXXX)'
			}, { status: 400 });
		}

		// 전화번호 포맷팅 (하이픈 추가)
		const formattedPhone = cleanedPhone.replace(/(\d{3})(\d{4})(\d{4})/, '$1-$2-$3');

		// 설계사 정보 업데이트
		const planner = await PlannerAccount.findByIdAndUpdate(
			locals.user.id,
			{ phone: formattedPhone },
			{ new: true }
		);

		if (!planner) {
			return json({ error: '설계사 정보를 찾을 수 없습니다.' }, { status: 404 });
		}

		return json({
			success: true,
			phone: formattedPhone,
			message: '전화번호가 변경되었습니다.'
		});
	} catch (error) {
		console.error('전화번호 변경 오류:', error);
		return json({ error: '서버 오류가 발생했습니다.' }, { status: 500 });
	}
}