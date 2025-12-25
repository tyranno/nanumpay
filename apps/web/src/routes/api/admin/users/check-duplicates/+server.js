import { json } from '@sveltejs/kit';
import { db } from '$lib/server/db.js';
import User from '$lib/server/models/User.js';

/**
 * 엑셀 등록 전 중복 검사 API
 * - 이름 중복 검사만 (User 테이블)
 * - ID는 중복 허용 (같은 ID에 여러 사람 가능)
 */
export async function POST({ request, locals }) {
	// 관리자 권한 확인
	if (!locals.user || !locals.user.isAdmin) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	await db();

	try {
		const { users } = await request.json();

		if (!users || !Array.isArray(users)) {
			return json({ error: '올바른 데이터 형식이 아닙니다.' }, { status: 400 });
		}

		// 이름 수집
		const allNames = [];
		const nameToRow = new Map();

		for (let i = 0; i < users.length; i++) {
			const userData = users[i];

			// 헤더 행 건너뛰기
			if (userData['용 역 자 관 리 명 부'] === '순번' || userData['__EMPTY_2'] === '성명') {
				continue;
			}

			const name = String(userData['성명'] ?? '').trim();
			if (!name) continue;

			allNames.push(name);
			nameToRow.set(name, i + 1);
		}

		const duplicates = [];

		// 이름 중복 검사
		if (allNames.length > 0) {
			const existingUsers = await User.find({ name: { $in: allNames } }).select('name');
			for (const user of existingUsers) {
				const row = nameToRow.get(user.name);
				duplicates.push({
					row,
					name: user.name
				});
			}
		}

		return json({
			success: true,
			hasDuplicates: duplicates.length > 0,
			duplicates
		});

	} catch (error) {
		console.error('중복 검사 오류:', error);
		return json({ error: '중복 검사 중 오류가 발생했습니다.' }, { status: 500 });
	}
}
