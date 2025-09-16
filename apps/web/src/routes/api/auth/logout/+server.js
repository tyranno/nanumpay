import { json } from '@sveltejs/kit';

export async function POST({ cookies }) {
	// 모든 인증 관련 쿠키 삭제
	cookies.delete('token', { path: '/' });
	cookies.delete('refreshToken', { path: '/' });

	return json({ success: true });
}