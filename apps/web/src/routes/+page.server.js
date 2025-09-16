import { redirect } from '@sveltejs/kit';

export function load({ locals }) {
	if (locals.user) {
		if (locals.user.type === 'admin') {
			throw redirect(302, '/admin');
		} else {
			throw redirect(302, '/dashboard');
		}
	}
	throw redirect(302, '/login');
}