import { json } from '@sveltejs/kit';
import jwt from 'jsonwebtoken';
import { db } from '$lib/server/db.js';
import { Admin } from '$lib/server/models/Admin.js';
import { User } from '$lib/server/models/User.js';
import { JWT_SECRET, JWT_EXPIRES } from '$env/static/private';

export async function POST({ cookies }) {
	const refreshToken = cookies.get('refreshToken');

	if (!refreshToken) {
		return json({ message: '리프레시 토큰이 없습니다.' }, { status: 401 });
	}

	try {
		// 리프레시 토큰 검증
		const decoded = jwt.verify(refreshToken, JWT_SECRET);

		await db();

		// 사용자 정보 다시 조회
		let account;
		if (decoded.type === 'admin') {
			account = await Admin.findById(decoded.id).select('loginId name');
		} else {
			account = await User.findById(decoded.id).select('loginId name');
		}

		if (!account) {
			return json({ message: '사용자를 찾을 수 없습니다.' }, { status: 401 });
		}

		// 새로운 Access Token 생성
		const newAccessToken = jwt.sign(
			{
				id: account._id.toString(),
				loginId: account.loginId,
				name: account.name,
				type: decoded.type
			},
			JWT_SECRET,
			{ expiresIn: JWT_EXPIRES || '1h' }
		);

		// 새 토큰을 쿠키에 저장
		cookies.set('token', newAccessToken, {
			httpOnly: true,
			secure: process.env.NODE_ENV === 'production',
			sameSite: 'strict',
			maxAge: 60 * 60, // 1시간
			path: '/'
		});

		return json({
			success: true,
			message: '토큰이 갱신되었습니다.'
		});
	} catch (error) {
		// 리프레시 토큰도 만료된 경우
		cookies.delete('token', { path: '/' });
		cookies.delete('refreshToken', { path: '/' });

		return json({ message: '세션이 만료되었습니다. 다시 로그인해주세요.' }, { status: 401 });
	}
}