import { json } from '@sveltejs/kit';
import { db } from '$lib/server/db.js';
import { User } from '$lib/server/models/User.js';
import SimpleCache from '$lib/server/cache.js';

// 캐시 설정 (TTL: 60초)
const cache = new SimpleCache(60000);

export async function GET({ locals, url }) {
	if (!locals.user || locals.user.type !== 'admin') {
		return json({ message: '권한이 없습니다.' }, { status: 401 });
	}

	await db();

	// 페이지네이션 파라미터
	const page = parseInt(url.searchParams.get('page') || '1');
	const limit = parseInt(url.searchParams.get('limit') || '10');
	const skip = (page - 1) * limit;

	// 캐시 키
	const cacheKey = `admin_dashboard_stats`;
	let stats = cache.get(cacheKey);

	// 캐시가 없을 때만 DB 쿼리
	if (!stats) {
		// 통계 데이터를 병렬로 조회
		const today = new Date();
		today.setHours(0, 0, 0, 0);

		const [
			totalUsers,
			activeUsers,
			todayRegistrations,
			totalRevenueResult
		] = await Promise.all([
			User.countDocuments(),
			User.countDocuments({ status: 'active' }),
			User.countDocuments({ createdAt: { $gte: today } }),
			User.aggregate([
				{
					$group: {
						_id: null,
						total: { $sum: '$totalEarnings' }
					}
				}
			])
		]);

		stats = {
			totalUsers,
			activeUsers,
			todayRegistrations,
			totalRevenue: totalRevenueResult[0]?.total || 0
		};

		// 캐시에 저장
		cache.set(cacheKey, stats);
	}

	// 최근 가입 사용자 (페이지네이션 적용)
	const recentUsers = await User.find()
		.sort({ createdAt: -1 })
		.skip(skip)
		.limit(limit)
		.select('name loginId createdAt status')
		.lean(); // lean() 사용으로 성능 개선

	// 전체 사용자 수 (페이지네이션용)
	const totalCount = await User.countDocuments();

	return json({
		stats,
		recentUsers,
		pagination: {
			page,
			limit,
			total: totalCount,
			totalPages: Math.ceil(totalCount / limit)
		}
	});
}