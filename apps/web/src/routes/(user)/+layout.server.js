import { redirect } from '@sveltejs/kit';

export async function load({ locals }) {
	// 로그인하지 않은 경우
	if (!locals.user) {
		throw redirect(302, '/login');
	}

	// 일반 사용자가 아닌 경우 (관리자인 경우)
	if (locals.user.type !== 'user') {
		throw redirect(302, '/admin');
	}

	return {
		user: locals.user
	};
}