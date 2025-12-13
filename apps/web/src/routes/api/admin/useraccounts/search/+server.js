import { json } from '@sveltejs/kit';
import UserAccount from '$lib/server/models/UserAccount.js';
import { db } from '$lib/server/db.js';

/**
 * UserAccount 검색 API
 * GET /api/admin/useraccounts/search?q=검색어
 * loginId 또는 name으로 검색
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
			return json({ accounts: [] });
		}

		// loginId 또는 name으로 검색
		const accounts = await UserAccount.find({
			status: 'active',
			$or: [
				{ loginId: { $regex: query, $options: 'i' } },
				{ name: { $regex: query, $options: 'i' } }
			]
		})
			.select('_id loginId name phone idNumber bank accountNumber')
			.limit(10)
			.lean();

		return json({ accounts });
	} catch (error) {
		console.error('UserAccount search error:', error);
		return json({ error: 'Search failed' }, { status: 500 });
	}
}
