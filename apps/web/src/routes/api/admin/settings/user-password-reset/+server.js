import { json } from '@sveltejs/kit';
import bcrypt from 'bcryptjs';
import { db } from '$lib/server/db.js';
import UserAccount from '$lib/server/models/UserAccount.js';

export async function POST({ request, locals }) {
	// 관리자 권한 확인
	if (!locals.user || locals.user.type !== 'admin') {
		return json({ message: '권한이 없습니다.' }, { status: 403 });
	}

	const { loginId, newPassword: customPassword } = await request.json();

	if (!loginId) {
		return json({ message: '사용자 ID를 입력해주세요.' }, { status: 400 });
	}

	if (!customPassword || !customPassword.trim()) {
		return json({ message: '새 암호를 입력해주세요.' }, { status: 400 });
	}

	await db();

	try {
		// UserAccount 조회
		const user = await UserAccount.findOne({
			loginId: loginId.toLowerCase()
		});

		if (!user) {
			return json({ message: '사용자를 찾을 수 없습니다.' }, { status: 404 });
		}

		const newPassword = customPassword.trim();

		// 암호 해시 생성 및 업데이트
		const passwordHash = await bcrypt.hash(newPassword, 10);
		await UserAccount.updateOne(
			{ _id: user._id },
			{
				$set: {
					passwordHash,
					updatedAt: new Date()
				}
			}
		);

		console.log(`[관리자] 사용자 암호 초기화: ${loginId} → ${newPassword}`);

		return json({
			success: true,
			newPassword,
			message: '암호가 초기화되었습니다.'
		});
	} catch (error) {
		console.error('암호 초기화 오류:', error);
		return json({ message: '암호 초기화 중 오류가 발생했습니다.' }, { status: 500 });
	}
}
