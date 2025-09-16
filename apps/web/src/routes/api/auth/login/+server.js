import { json } from '@sveltejs/kit';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { db } from '$lib/server/db.js';
import { Admin } from '$lib/server/models/Admin.js';
import { User } from '$lib/server/models/User.js';
import { JWT_SECRET, JWT_EXPIRES, JWT_REFRESH_EXPIRES } from '$env/static/private';

export async function POST({ request, cookies }) {
	const { loginId, password } = await request.json();

	if (!loginId || !password) {
		return json({ message: '아이디와 비밀번호를 입력해주세요.' }, { status: 400 });
	}

	await db();

	// 먼저 관리자 테이블에서 확인
	let account = await Admin.findOne({ loginId: loginId.toLowerCase() });
	let userType = 'admin';

	// 관리자가 아니면 일반 사용자 테이블에서 확인
	if (!account) {
		account = await User.findOne({ loginId: loginId.toLowerCase() });
		userType = 'user';
	}

	if (!account) {
		return json({ message: '아이디 또는 비밀번호가 일치하지 않습니다.' }, { status: 401 });
	}

	const validPassword = await bcrypt.compare(password, account.passwordHash);
	if (!validPassword) {
		return json({ message: '아이디 또는 비밀번호가 일치하지 않습니다.' }, { status: 401 });
	}

	// Access Token 생성 (짧은 만료 시간)
	const accessToken = jwt.sign(
		{
			id: account._id.toString(),
			loginId: account.loginId,
			name: account.name,
			type: userType
		},
		JWT_SECRET,
		{ expiresIn: JWT_EXPIRES || '1h' }
	);

	// Refresh Token 생성 (긴 만료 시간)
	const refreshToken = jwt.sign(
		{
			id: account._id.toString(),
			type: userType
		},
		JWT_SECRET,
		{ expiresIn: JWT_REFRESH_EXPIRES || '7d' }
	);

	// Access Token을 쿠키에 저장
	cookies.set('token', accessToken, {
		httpOnly: true,
		secure: process.env.NODE_ENV === 'production',
		sameSite: 'strict',
		maxAge: 60 * 60, // 1시간
		path: '/'
	});

	// Refresh Token을 별도 쿠키에 저장
	cookies.set('refreshToken', refreshToken, {
		httpOnly: true,
		secure: process.env.NODE_ENV === 'production',
		sameSite: 'strict',
		maxAge: 60 * 60 * 24 * 7, // 7일
		path: '/'
	});

	// 마지막 로그인 시간 업데이트
	if (userType === 'admin') {
		await Admin.updateOne({ _id: account._id }, { lastLogin: new Date() });
	} else {
		await User.updateOne({ _id: account._id }, { lastActivity: new Date() });
	}

	return json({
		success: true,
		userType,
		redirect: userType === 'admin' ? '/admin' : '/dashboard'
	});
}