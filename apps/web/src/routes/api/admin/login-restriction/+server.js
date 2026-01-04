import { json } from '@sveltejs/kit';
import { db } from '$lib/server/db.js';
import UserAccount from '$lib/server/models/UserAccount.js';

/**
 * 로그인 제한 관리 API
 * GET: 제한된 사용자 목록 조회
 * POST: 로그인 제한/해제
 */

// GET: 제한된 사용자 목록 조회
export async function GET({ url, locals }) {
	// 관리자 권한 확인
	if (!locals.user || locals.user.type !== 'admin') {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	try {
		await db();

		const search = url.searchParams.get('search') || '';
		const showAll = url.searchParams.get('showAll') === 'true';

		let query = {};

		// 기본: 제한된 사용자만
		if (!showAll) {
			query['loginRestriction.isRestricted'] = true;
		}

		// 검색어가 있으면 검색
		if (search) {
			query.$or = [
				{ loginId: { $regex: search, $options: 'i' } },
				{ name: { $regex: search, $options: 'i' } }
			];
		}

		const users = await UserAccount.find(query)
			.select('loginId name phone loginRestriction createdAt')
			.sort({ 'loginRestriction.restrictedAt': -1, createdAt: -1 })
			.limit(100);

		return json({
			success: true,
			users: users.map(u => ({
				id: u._id.toString(),
				loginId: u.loginId,
				name: u.name,
				phone: u.phone,
				isRestricted: u.loginRestriction?.isRestricted || false,
				restrictedAt: u.loginRestriction?.restrictedAt,
				restrictedBy: u.loginRestriction?.restrictedBy,
				reason: u.loginRestriction?.reason,
				history: u.loginRestriction?.history || [],
				createdAt: u.createdAt
			}))
		});
	} catch (error) {
		console.error('로그인 제한 목록 조회 오류:', error);
		return json({ error: error.message }, { status: 500 });
	}
}

// POST: 로그인 제한/해제
export async function POST({ request, locals }) {
	// 관리자 권한 확인
	if (!locals.user || locals.user.type !== 'admin') {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	try {
		await db();

		const { userId, action, reason } = await request.json();

		if (!userId || !action) {
			return json({ error: 'userId와 action은 필수입니다.' }, { status: 400 });
		}

		if (!['restrict', 'unrestrict'].includes(action)) {
			return json({ error: 'action은 restrict 또는 unrestrict여야 합니다.' }, { status: 400 });
		}

		const user = await UserAccount.findById(userId);
		if (!user) {
			return json({ error: '사용자를 찾을 수 없습니다.' }, { status: 404 });
		}

		const adminName = locals.user.name || locals.user.loginId || '관리자';
		const now = new Date();

		// 히스토리 추가
		if (!user.loginRestriction) {
			user.loginRestriction = {
				isRestricted: false,
				history: []
			};
		}

		if (!user.loginRestriction.history) {
			user.loginRestriction.history = [];
		}

		user.loginRestriction.history.push({
			action,
			date: now,
			by: adminName,
			reason: reason || ''
		});

		if (action === 'restrict') {
			user.loginRestriction.isRestricted = true;
			user.loginRestriction.restrictedAt = now;
			user.loginRestriction.restrictedBy = adminName;
			user.loginRestriction.reason = reason || '';
		} else {
			user.loginRestriction.isRestricted = false;
			user.loginRestriction.restrictedAt = null;
			user.loginRestriction.restrictedBy = null;
			user.loginRestriction.reason = null;
		}

		await user.save();

		return json({
			success: true,
			message: action === 'restrict' ? '로그인이 제한되었습니다.' : '로그인 제한이 해제되었습니다.',
			user: {
				id: user._id.toString(),
				loginId: user.loginId,
				name: user.name,
				isRestricted: user.loginRestriction.isRestricted,
				restrictedAt: user.loginRestriction.restrictedAt,
				restrictedBy: user.loginRestriction.restrictedBy,
				reason: user.loginRestriction.reason
			}
		});
	} catch (error) {
		console.error('로그인 제한 처리 오류:', error);
		return json({ error: error.message }, { status: 500 });
	}
}
