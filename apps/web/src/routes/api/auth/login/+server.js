import { json } from '@sveltejs/kit';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { db } from '$lib/server/db.js';
import { Admin } from '$lib/server/models/Admin.js';
import User from '$lib/server/models/User.js';
import UserAccount from '$lib/server/models/UserAccount.js'; // v8.0
import PlannerAccount from '$lib/server/models/PlannerAccount.js'; // v8.0
import { JWT_SECRET, JWT_EXPIRES, JWT_REFRESH_EXPIRES } from '$env/static/private';

export async function POST({ request, cookies }) {
	const { loginId, password } = await request.json();

	if (!loginId || !password) {
		return json({ message: '아이디와 비밀번호를 입력해주세요.' }, { status: 400 });
	}

	await db();

	// v8.0: 3-Collection Sequential Check
	// 1) Admin
	let account = await Admin.findOne({ loginId: loginId.toLowerCase() });
	let accountType = 'admin';

	// 2) UserAccount
	if (!account) {
		account = await UserAccount.findOne({ loginId: loginId.toLowerCase() });
		accountType = 'user';
	}

	// 3) PlannerAccount
	if (!account) {
		account = await PlannerAccount.findOne({ loginId });
		accountType = 'planner';
	}

	if (!account) {
		return json({ message: '아이디 또는 비밀번호가 일치하지 않습니다.' }, { status: 401 });
	}

	const validPassword = await bcrypt.compare(password, account.passwordHash);
	if (!validPassword) {
		return json({ message: '아이디 또는 비밀번호가 일치하지 않습니다.' }, { status: 401 });
	}

	// v8.0: UserAccount 로그인 시 primaryUser 조회
	let primaryUser = null;
	let allUsers = [];
	if (accountType === 'user') {
		// 첫 번째 User (registrationNumber: 1)
		primaryUser = await User.findOne({
			userAccountId: account._id,
			registrationNumber: 1
		});

		// 모든 User 조회
		allUsers = await User.find({ userAccountId: account._id })
			.sort({ registrationNumber: 1 });
	}

	// v8.0: PlannerAccount 로그인 시 담당 고객 조회
	let clients = [];
	if (accountType === 'planner') {
		clients = await User.find({ plannerAccountId: account._id })
			.sort({ createdAt: -1 })
			.limit(100); // 최근 100명
	}

	// Access Token 생성 (짧은 만료 시간)
	const tokenPayload = {
		id: account._id.toString(),
		loginId: account.loginId || account.name, // PlannerAccount는 loginId가 name
		name: account.name,
		type: accountType
	};

	// v8.0: UserAccount인 경우 primaryUser 정보 추가
	if (accountType === 'user' && primaryUser) {
		tokenPayload.primaryUserId = primaryUser._id.toString();
		tokenPayload.primaryUserName = primaryUser.name;
	}

	const accessToken = jwt.sign(tokenPayload, JWT_SECRET, { expiresIn: JWT_EXPIRES || '1h' });

	// Refresh Token 생성 (긴 만료 시간)
	const refreshToken = jwt.sign(
		{
			id: account._id.toString(),
			type: accountType
		},
		JWT_SECRET,
		{ expiresIn: JWT_REFRESH_EXPIRES || '7d' }
	);

	// Access Token을 세션 쿠키로 저장 (브라우저 종료 시 자동 삭제)
	cookies.set('token', accessToken, {
		httpOnly: true,
		secure: process.env.NODE_ENV === 'production',
		sameSite: 'strict',
		path: '/'
	});

	// Refresh Token도 세션 쿠키로 저장 (브라우저 종료 시 자동 삭제)
	cookies.set('refreshToken', refreshToken, {
		httpOnly: true,
		secure: process.env.NODE_ENV === 'production',
		sameSite: 'strict',
		path: '/'
	});

	// 마지막 로그인 시간 업데이트
	if (accountType === 'admin') {
		await Admin.updateOne({ _id: account._id }, { lastLogin: new Date() });
	} else if (accountType === 'user') {
		await UserAccount.updateOne({ _id: account._id }, { updatedAt: new Date() });
	} else if (accountType === 'planner') {
		await PlannerAccount.updateOne({ _id: account._id }, { updatedAt: new Date() });
	}

	// v8.0: 응답 데이터
	const response = {
		success: true,
		accountType,
		redirect: accountType === 'admin' ? '/admin' : '/dashboard'
	};

	// v8.0: UserAccount 로그인 시 primaryUser 및 모든 등록 정보 반환
	if (accountType === 'user') {
		response.primaryUser = primaryUser ? {
			id: primaryUser._id.toString(),
			name: primaryUser.name,
			grade: primaryUser.grade,
			registrationNumber: primaryUser.registrationNumber
		} : null;
		response.allRegistrations = allUsers.map(u => ({
			id: u._id.toString(),
			name: u.name,
			grade: u.grade,
			registrationNumber: u.registrationNumber,
			createdAt: u.createdAt
		}));
	}

	// v8.0: PlannerAccount 로그인 시 담당 고객 정보 반환
	if (accountType === 'planner') {
		response.clientCount = clients.length;
		response.recentClients = clients.slice(0, 10).map(u => ({
			id: u._id.toString(),
			name: u.name,
			grade: u.grade,
			createdAt: u.createdAt
		}));
	}

	return json(response);
}