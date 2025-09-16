import { json } from '@sveltejs/kit';
import { db } from '$lib/server/db.js';
import { User } from '$lib/server/models/User.js';
import SimpleCache from '$lib/server/cache.js';

// 사용자별 캐시 (TTL: 30초)
const cache = new SimpleCache(30000);

export async function GET({ locals }) {
	if (!locals.user || locals.user.type !== 'user') {
		return json({ message: '권한이 없습니다.' }, { status: 401 });
	}

	await db();

	const userId = locals.user.id;
	const cacheKey = `user_dashboard_${userId}`;

	// 캐시 확인
	let cachedData = cache.get(cacheKey);
	if (cachedData) {
		return json(cachedData);
	}

	// 사용자 정보 가져오기 (lean 사용으로 성능 개선)
	const user = await User.findById(userId)
		.select('name loginId balance totalEarnings leftCount rightCount status')
		.lean();

	if (!user) {
		return json({ message: '사용자를 찾을 수 없습니다.' }, { status: 404 });
	}

	// 네트워크 정보 - 깊이 제한으로 성능 개선
	const MAX_DEPTH = 3; // 최대 3레벨까지만 계산

	// 직속 자식만 조회
	const [leftChild, rightChild] = await Promise.all([
		User.findOne({ parentId: user._id, position: 'L' }).select('totalEarnings').lean(),
		User.findOne({ parentId: user._id, position: 'R' }).select('totalEarnings').lean()
	]);

	// 볼륨 계산 최적화 - aggregate 사용
	const [leftVolume, rightVolume] = await Promise.all([
		leftChild ? calculateVolume(leftChild._id, MAX_DEPTH) : 0,
		rightChild ? calculateVolume(rightChild._id, MAX_DEPTH) : 0
	]);

	const responseData = {
		user: {
			name: user.name,
			loginId: user.loginId,
			balance: user.balance || 0,
			totalEarnings: user.totalEarnings || 0,
			status: user.status
		},
		networkInfo: {
			leftCount: user.leftCount || 0,
			rightCount: user.rightCount || 0,
			leftVolume,
			rightVolume
		}
	};

	// 캐시에 저장
	cache.set(cacheKey, responseData);

	return json(responseData);
}

// 볼륨 계산 최적화 함수
async function calculateVolume(rootId, maxDepth) {
	const result = await User.aggregate([
		// 시작점 매칭
		{ $match: { _id: rootId } },
		// GraphLookup으로 하위 노드 찾기 (깊이 제한)
		{
			$graphLookup: {
				from: 'users',
				startWith: '$_id',
				connectFromField: '_id',
				connectToField: 'parentId',
				as: 'descendants',
				maxDepth: maxDepth
			}
		},
		// 볼륨 합계 계산
		{
			$project: {
				totalVolume: {
					$sum: '$descendants.totalEarnings'
				}
			}
		}
	]);

	return result[0]?.totalVolume || 0;
}