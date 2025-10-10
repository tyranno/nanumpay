import { json } from '@sveltejs/kit';
import User from '$lib/server/models/User.js';
import { db } from '$lib/server/db.js';

/**
 * 설계사 검색 API
 * GET /api/planners/search?q=검색어
 * User 컬렉션에서 설계사 정보를 집계하여 반환
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
			return json({ planners: [] });
		}

		// User 컬렉션에서 설계사 정보를 집계
		const planners = await User.aggregate([
			// 설계사 필드가 있는 사용자만 필터링
			{
				$match: {
					planner: { $ne: null, $ne: '' },
					$or: [
						{ planner: { $regex: query, $options: 'i' } },
						{ plannerPhone: { $regex: query, $options: 'i' } }
					]
				}
			},
			// 설계사 이름으로 그룹화
			{
				$group: {
					_id: '$planner',
					phone: { $first: '$plannerPhone' },
					count: { $sum: 1 }
				}
			},
			// 많이 사용된 설계사 순으로 정렬
			{ $sort: { count: -1 } },
			// 최대 10개만 반환
			{ $limit: 10 },
			// 필드명 변경
			{
				$project: {
					_id: 0,
					name: '$_id',
					phone: 1,
					count: 1
				}
			}
		]);

		return json({ planners });
	} catch (error) {
		console.error('Planner search error:', error);
		return json({ error: 'Search failed' }, { status: 500 });
	}
}
