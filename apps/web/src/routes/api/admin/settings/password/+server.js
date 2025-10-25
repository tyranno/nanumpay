import { json } from '@sveltejs/kit';
import bcrypt from 'bcrypt';
import { Admin } from '$lib/server/models/Admin.js';

// PUT: 관리자 암호 변경
export async function PUT({ request, locals }) {
	try {
		// 관리자 권한 확인
		if (!locals.user || !locals.user.isAdmin) {
			return json({ success: false, message: '관리자 권한이 필요합니다.' }, { status: 401 });
		}

		const adminId = locals.user.id;
		const { currentPassword, newPassword } = await request.json();

		// 유효성 검사
		if (!currentPassword || !newPassword) {
			return json(
				{ success: false, message: '현재 암호와 새 암호를 모두 입력해주세요.' },
				{ status: 400 }
			);
		}

		if (newPassword.length < 10) {
			return json(
				{ success: false, message: '암호는 최소 10자 이상이어야 합니다.' },
				{ status: 400 }
			);
		}

		// 암호 복잡도 검사
		const hasUpperCase = /[A-Z]/.test(newPassword);
		const hasLowerCase = /[a-z]/.test(newPassword);
		const hasNumber = /[0-9]/.test(newPassword);
		const hasSpecialChar = /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(newPassword);

		if (!hasUpperCase || !hasLowerCase || !hasNumber || !hasSpecialChar) {
			return json(
				{
					success: false,
					message: '암호는 대문자, 소문자, 숫자, 특수문자를 모두 포함해야 합니다.'
				},
				{ status: 400 }
			);
		}

		// 관리자 조회
		const admin = await Admin.findById(adminId);

		if (!admin) {
			return json({ success: false, message: '관리자를 찾을 수 없습니다.' }, { status: 404 });
		}

		// 현재 암호 확인
		const isCurrentPasswordValid = await bcrypt.compare(currentPassword, admin.passwordHash);

		if (!isCurrentPasswordValid) {
			return json(
				{ success: false, message: '현재 암호가 일치하지 않습니다.' },
				{ status: 400 }
			);
		}

		// 새 암호 해시
		const saltRounds = 10;
		const newPasswordHash = await bcrypt.hash(newPassword, saltRounds);

		// 암호 업데이트
		admin.passwordHash = newPasswordHash;
		await admin.save();

		return json({
			success: true,
			message: '암호가 성공적으로 변경되었습니다.'
		});
	} catch (error) {
		console.error('❌ Error changing admin password:', error);
		return json(
			{ success: false, message: '암호 변경에 실패했습니다.' },
			{ status: 500 }
		);
	}
}
