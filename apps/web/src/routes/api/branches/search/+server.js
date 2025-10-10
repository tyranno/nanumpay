import { json } from '@sveltejs/kit';
import User from '$lib/server/models/User.js';
import { db } from '$lib/server/db.js';

/**
 * 소속/지사 검색 API
 * GET /api/branches/search?q=검색어
 * User 컬렉션에서 소속/지사 정보를 집계하여 반환
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
			return json({ branches: [] });
		}

		// User 컬렉션에서 소속/지사 정보를 집계
		const branches = await User.aggregate([
			// 소속/지사 필드가 있는 사용자만 필터링
			{
				$match: {
					branch: { $ne: null, $ne: '' },
					branch: { $regex: query, $options: 'i' }
				}
			},
			// 소속/지사 이름으로 그룹화
			{
				$group: {
					_id: '$branch',
					count: { $sum: 1 }
				}
			},
			// 많이 사용된 소속/지사 순으로 정렬
			{ $sort: { count: -1 } },
			// 최대 10개만 반환
			{ $limit: 10 },
			// 필드명 변경
			{
				$project: {
					_id: 0,
					name: '$_id',
					count: 1
				}
			}
		]);

		return json({ branches });
	} catch (error) {
		console.error('Branch search error:', error);
		return json({ error: 'Search failed' }, { status: 500 });
	}
}
