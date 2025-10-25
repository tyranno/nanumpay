import { json } from '@sveltejs/kit';
import { db } from '$lib/server/db.js';
import PlannerAccount from '$lib/server/models/PlannerAccount.js';
import bcrypt from 'bcryptjs';

/**
 * 설계사 정보 수정 API
 * - 전화번호, 이메일, 주소, 근무지 변경
 * - 암호 변경 (이전 암호 확인 필수)
 */
export async function POST({ locals, request }) {
	if (!locals.user || locals.user.accountType !== 'planner') {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	await db();

	try {
		const { 
			phone, 
			email, 
			address, 
			workplace,
			currentPassword,
			newPassword,
			confirmPassword
		} = await request.json();

		const plannerId = locals.user.id;
		const planner = await PlannerAccount.findById(plannerId);

		if (!planner) {
			return json({ error: '설계사 정보를 찾을 수 없습니다.' }, { status: 404 });
		}

		// 기본 정보 업데이트
		if (phone !== undefined) planner.phone = phone;
		if (email !== undefined) planner.email = email;
		if (address !== undefined) planner.address = address;
		if (workplace !== undefined) planner.workplace = workplace;

		// 암호 변경 (이전 암호, 새 암호, 확인 모두 있을 때만)
		if (currentPassword && newPassword && confirmPassword) {
			// 1. 이전 암호 확인
			const isValidPassword = await bcrypt.compare(currentPassword, planner.passwordHash);
			if (!isValidPassword) {
				return json({ 
					error: '현재 암호가 일치하지 않습니다.' 
				}, { status: 400 });
			}

			// 2. 새 암호 확인
			if (newPassword !== confirmPassword) {
				return json({ 
					error: '새 암호와 암호 확인이 일치하지 않습니다.' 
				}, { status: 400 });
			}

			// 3. 새 암호 길이 확인
			if (newPassword.length < 10) {
				return json({
					error: '암호는 최소 10자 이상이어야 합니다.'
				}, { status: 400 });
			}

			// 4. 새 암호 복잡도 확인
			const hasUpperCase = /[A-Z]/.test(newPassword);
			const hasLowerCase = /[a-z]/.test(newPassword);
			const hasNumber = /[0-9]/.test(newPassword);
			const hasSpecialChar = /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(newPassword);

			if (!hasUpperCase || !hasLowerCase || !hasNumber || !hasSpecialChar) {
				return json({
					error: '암호는 대문자, 소문자, 숫자, 특수문자를 모두 포함해야 합니다.'
				}, { status: 400 });
			}

			// 5. 새 암호 해시 생성
			const salt = await bcrypt.genSalt(10);
			planner.passwordHash = await bcrypt.hash(newPassword, salt);
		}

		planner.updatedAt = new Date();
		await planner.save();

		return json({ 
			success: true,
			message: '정보가 수정되었습니다.',
			planner: {
				name: planner.name,
				phone: planner.phone,
				email: planner.email,
				address: planner.address,
				workplace: planner.workplace
			}
		});
	} catch (error) {
		console.error('설계사 정보 수정 오류:', error);
		return json({ error: '서버 오류가 발생했습니다.' }, { status: 500 });
	}
}
