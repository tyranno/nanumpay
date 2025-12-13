import { json } from '@sveltejs/kit';
import User from '$lib/server/models/User.js';
import PlannerAccount from '$lib/server/models/PlannerAccount.js';
import { db } from '$lib/server/db.js';

/**
 * 설계사 검색 API
 * GET /api/planners/search?q=검색어
 * PlannerAccount 우선 검색, 없으면 User 컬렉션에서 집계
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

		// 1. PlannerAccount에서 먼저 검색 (은행/계좌번호 포함)
		const plannerAccounts = await PlannerAccount.find({
			status: 'active',
			$or: [
				{ name: { $regex: query, $options: 'i' } },
				{ phone: { $regex: query, $options: 'i' } }
			]
		})
			.limit(10)
			.lean();

		// 2. User 컬렉션에서도 설계사 정보 집계
		const userPlanners = await User.aggregate([
			{
				$match: {
					planner: { $ne: null, $ne: '' },
					$or: [
						{ planner: { $regex: query, $options: 'i' } },
						{ plannerPhone: { $regex: query, $options: 'i' } }
					]
				}
			},
			{
				$group: {
					_id: '$planner',
					phone: { $first: '$plannerPhone' },
					count: { $sum: 1 }
				}
			},
			{ $sort: { count: -1 } },
			{ $limit: 10 }
		]);

		// 3. 결과 병합 (PlannerAccount 우선)
		const plannerAccountNames = new Set(plannerAccounts.map(p => p.name));
		const result = [
			...plannerAccounts.map(p => ({
				name: p.name,
				phone: p.phone,
				bank: p.bank || '',
				accountNumber: p.accountNumber || '',
				count: 0
			})),
			...userPlanners
				.filter(p => !plannerAccountNames.has(p._id))
				.map(p => ({
					name: p._id,
					phone: p.phone,
					bank: '',
					accountNumber: '',
					count: p.count
				}))
		].slice(0, 10);

		return json({ planners: result });
	} catch (error) {
		console.error('Planner search error:', error);
		return json({ error: 'Search failed' }, { status: 500 });
	}
}
