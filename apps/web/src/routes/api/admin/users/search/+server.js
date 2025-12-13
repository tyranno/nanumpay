import { json } from '@sveltejs/kit';
import User from '$lib/server/models/User.js';
import { db } from '$lib/server/db.js';

/**
 * 판매인 검색 API
 * GET /api/admin/users/search?q=검색어
 * User를 검색하고 UserAccount를 lookup하여 phone 가져옴
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

		// User를 검색하고 UserAccount에서 phone을 lookup
		const users = await User.aggregate([
			{
				$match: {
					name: { $regex: query, $options: 'i' },
					status: 'active'
				}
			},
			{
				$lookup: {
					from: 'useraccounts',
					localField: 'userAccountId',
					foreignField: '_id',
					as: 'account'
				}
			},
			{
				$unwind: {
					path: '$account',
					preserveNullAndEmptyArrays: true
				}
			},
			{
				$project: {
					_id: 1,
					name: 1,
					phone: '$account.phone',
					branch: 1
				}
			},
			{ $limit: 10 }
		]);

		return json({ users });
	} catch (error) {
		console.error('User search error:', error);
		return json({ error: 'Search failed' }, { status: 500 });
	}
}
