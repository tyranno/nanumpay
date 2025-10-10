import { json } from '@sveltejs/kit';
import User from '$lib/server/models/User.js';
import { db } from '$lib/server/db.js';

/**
 * 판매인 검색 API
 * GET /api/admin/users/search?q=검색어
 */
export async function GET({ url, locals }) {
	// 관리자 권한 확인
	if (!locals.user || !locals.user.isAdmin) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	await db();

	try {

		const query = url.searchParams.get('q') || '';

		if (query.length < 1) {
			return json({ users: [] });
		}

		// 이름으로 검색 (부분 일치, 최대 10개)
		const users = await User.find({
			name: { $regex: query, $options: 'i' },
			status: 'active'
		})
		.select('_id name phone branch')
		.limit(10)
		.lean();

		return json({ users });
	} catch (error) {
		console.error('User search error:', error);
		return json({ error: 'Search failed' }, { status: 500 });
	}
}
