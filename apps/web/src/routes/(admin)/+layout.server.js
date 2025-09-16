import { redirect } from '@sveltejs/kit';

export async function load({ locals }) {
	// 로그인하지 않은 경우
	if (!locals.user) {
		throw redirect(302, '/login');
	}

	// 관리자가 아닌 경우
	if (locals.user.type !== 'admin') {
		throw redirect(302, '/dashboard');
	}

	return {
		user: locals.user
	};
}