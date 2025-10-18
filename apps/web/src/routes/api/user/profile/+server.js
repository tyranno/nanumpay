import { json } from '@sveltejs/kit';
import { db } from '$lib/server/db.js';
import User from '$lib/server/models/User.js';

export async function GET({ locals }) {
	if (!locals.user || locals.user.type !== 'user') {
		return json({ message: '권한이 없습니다.' }, { status: 401 });
	}

	await db();

	const userId = locals.user.id;

	// 사용자 정보 조회
	const user = await User.findById(userId)
		.select('name loginId phone email bank accountNumber idNumber insuranceCompany insuranceProduct branch planner plannerPhone salesperson salespersonPhone grade insuranceActive')
		.lean();

	if (!user) {
		return json({ message: '사용자를 찾을 수 없습니다.' }, { status: 404 });
	}

	// 주민번호 마스킹 (뒷자리 숨김)
	let maskedIdNumber = '-';
	if (user.idNumber) {
		const idNum = user.idNumber.replace(/-/g, '');
		if (idNum.length === 13) {
			maskedIdNumber = `${idNum.substring(0, 6)}-*******`;
		} else {
			maskedIdNumber = user.idNumber;
		}
	}

	return json({
		success: true,
		profile: {
			name: user.name || '',
			loginId: user.loginId || '',
			phone: user.phone || '',
			email: user.email || '',
			bank: user.bank || '',
			accountNumber: user.accountNumber || '',
			idNumber: maskedIdNumber,
			insuranceCompany: user.insuranceCompany || '',
			insuranceProduct: user.insuranceProduct || '',
			branch: user.branch || '',
			planner: user.planner || '',
			plannerPhone: user.plannerPhone || '',
			salesperson: user.salesperson || '',
			salespersonPhone: user.salespersonPhone || '',
			grade: user.grade || '',
			insuranceActive: user.insuranceActive || false
		}
	});
}

export async function PUT({ locals, request }) {
	if (!locals.user || locals.user.type !== 'user') {
		return json({ message: '권한이 없습니다.' }, { status: 401 });
	}

	await db();

	const userId = locals.user.id;
	const body = await request.json();

	try {
		// 업데이트 가능한 필드만 허용
		const updateFields = {
			phone: body.phone,
			email: body.email
		};

		// 비밀번호 변경 요청이 있는 경우
		if (body.currentPassword && body.newPassword) {
			const user = await User.findById(userId);

			if (!user) {
				return json({ message: '사용자를 찾을 수 없습니다.' }, { status: 404 });
			}

			// bcryptjs 동적 import
			const bcrypt = await import('bcryptjs');

			// 현재 비밀번호 확인
			const isPasswordValid = await bcrypt.default.compare(body.currentPassword, user.passwordHash);

			if (!isPasswordValid) {
				return json({ message: '현재 비밀번호가 일치하지 않습니다.' }, { status: 400 });
			}

			// 새 비밀번호 해시 생성
			const salt = await bcrypt.default.genSalt(10);
			const newPasswordHash = await bcrypt.default.hash(body.newPassword, salt);
			updateFields.passwordHash = newPasswordHash;
		}

		const user = await User.findByIdAndUpdate(
			userId,
			{ $set: updateFields },
			{ new: true, runValidators: true }
		).select('name loginId phone email');

		if (!user) {
			return json({ message: '사용자를 찾을 수 없습니다.' }, { status: 404 });
		}

		return json({
			success: true,
			message: body.currentPassword ? '정보 및 비밀번호가 업데이트되었습니다.' : '정보가 업데이트되었습니다.',
			profile: {
				name: user.name,
				loginId: user.loginId,
				phone: user.phone,
				email: user.email
			}
		});
	} catch (error) {
		console.error('Profile update error:', error);
		return json({ message: '정보 업데이트에 실패했습니다.' }, { status: 500 });
	}
}
