import { json } from '@sveltejs/kit';
import { db } from '$lib/server/db.js';
import UserAccount from '$lib/server/models/UserAccount.js';

export async function GET({ url, locals }) {
	// 관리자 권한 확인
	if (!locals.user || locals.user.type !== 'admin') {
		return json({ message: '권한이 없습니다.' }, { status: 403 });
	}

	const loginId = url.searchParams.get('loginId');

	if (!loginId) {
		return json({ message: '사용자 ID를 입력해주세요.' }, { status: 400 });
	}

	await db();

	try {
		// UserAccount에서 검색 (대소문자 구분 없이)
		const user = await UserAccount.findOne({
			loginId: loginId.toLowerCase()
		}).select('loginId name phone');

		if (!user) {
			return json({ user: null, message: '사용자를 찾을 수 없습니다.' });
		}

		return json({
			success: true,
			user: {
				loginId: user.loginId,
				name: user.name,
				phone: user.phone || ''
			}
		});
	} catch (error) {
		console.error('사용자 검색 오류:', error);
		return json({ message: '사용자 검색 중 오류가 발생했습니다.' }, { status: 500 });
	}
}
