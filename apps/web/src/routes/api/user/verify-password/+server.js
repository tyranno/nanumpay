import { json } from '@sveltejs/kit';
import { db } from '$lib/server/db.js';
import User from '$lib/server/models/User.js';

export async function POST({ locals, request }) {
	if (!locals.user || locals.user.type !== 'user') {
		return json({ message: '권한이 없습니다.' }, { status: 401 });
	}

	await db();

	try {
		const { password } = await request.json();

		if (!password) {
			return json({ message: '비밀번호를 입력해주세요.' }, { status: 400 });
		}

		// ⭐ v8.0: primaryUserId 사용 (User._id)
		const userId = locals.user.primaryUserId || locals.user.id;
		const user = await User.findById(userId).populate('userAccountId').lean();

		if (!user || !user.userAccountId) {
			return json({ message: '사용자를 찾을 수 없습니다.' }, { status: 404 });
		}

		// ⭐ v8.0: UserAccount 모델 import
		const { default: UserAccount } = await import('$lib/server/models/UserAccount.js');
		const userAccount = await UserAccount.findById(user.userAccountId._id);

		if (!userAccount) {
			return json({ message: '계정을 찾을 수 없습니다.' }, { status: 404 });
		}

		// bcryptjs 동적 import
		const bcrypt = await import('bcryptjs');

		// ⭐ v8.0: UserAccount의 passwordHash와 비교
		const isValid = await bcrypt.default.compare(password, userAccount.passwordHash);

		if (!isValid) {
			return json({ message: '비밀번호가 일치하지 않습니다.' }, { status: 400 });
		}

		return json({ success: true });
	} catch (error) {
		console.error('Password verification error:', error);
		return json({ message: '비밀번호 확인에 실패했습니다.' }, { status: 500 });
	}
}
