/** @type {import('./$types').PageServerLoad} */
export async function load({ cookies }) {
	// 로그인 페이지 진입 시 모든 인증 쿠키 강제 삭제 (보안 강화)
	cookies.delete('token', {
		path: '/',
		httpOnly: true,
		secure: process.env.NODE_ENV === 'production',
		sameSite: 'strict'
	});

	cookies.delete('refreshToken', {
		path: '/',
		httpOnly: true,
		secure: process.env.NODE_ENV === 'production',
		sameSite: 'strict'
	});

	return {};
}
