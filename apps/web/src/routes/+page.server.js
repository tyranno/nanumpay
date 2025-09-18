import { redirect } from '@sveltejs/kit';

export function load({ locals }) {
	if (locals.user) {
		// Admin 컬렉션에서 온 경우
		if (locals.user.isAdmin) {
			throw redirect(302, '/admin');
		} else {
			throw redirect(302, '/dashboard');
		}
	}
	throw redirect(302, '/login');
}