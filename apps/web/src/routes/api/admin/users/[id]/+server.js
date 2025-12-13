import { json } from '@sveltejs/kit';
import { db } from '$lib/server/db.js';
import User from '$lib/server/models/User.js';

export async function GET({ params, locals }) {
	try {
		// 관리자 권한 확인
		if (!locals.user || locals.user.type !== 'admin') {
			return json({ error: '관리자 권한이 필요합니다.' }, { status: 401 });
		}

		await db();

		const { id } = params;

		const user = await User.findById(id)
			.select('_id name phone grade status leftChildId rightChildId parentId')
			.lean();

		if (!user) {
			return json({ error: '사용자를 찾을 수 없습니다.' }, { status: 404 });
		}

		return json({ user });
	} catch (error) {
		console.error('Get user error:', error);
		return json({ error: error?.message || '사용자 조회 중 오류가 발생했습니다.' }, { status: 500 });
	}
}
