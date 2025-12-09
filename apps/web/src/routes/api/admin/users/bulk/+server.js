import { json } from '@sveltejs/kit';
import { db } from '$lib/server/db.js';
import { registerUsers } from '$lib/server/services/userRegistrationService.js';

/**
 * 엑셀 파일을 통한 사용자 일괄 등록 (v7.0)
 * - userRegistrationService로 공통 로직 처리
 */
export async function POST({ request, locals }) {
	// 관리자 권한 확인
	if (!locals.user || !locals.user.isAdmin) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	await db();

	try {
		const { users, fileName } = await request.json();

		// 데이터 형식 확인
		if (!users || !Array.isArray(users)) {
			return json({ error: '올바른 데이터 형식이 아닙니다.' }, { status: 400 });
		}

		// 파일명 로그 출력
		if (fileName) {
			console.log(`📁 엑셀 등록: ${fileName} (${users.length}명)`);
		}

		// ⭐ 날짜 + 순번 기준 정렬 (등록 순서 보장)
		const sortedUsers = [...users].sort((a, b) => {
			// 날짜 비교 (빠른 날짜 먼저) - 한글/영문 필드명 모두 지원
			const dateStrA = a.date || a['날짜'] || a.__EMPTY_1 || '';
			const dateStrB = b.date || b['날짜'] || b.__EMPTY_1 || '';
			const dateA = dateStrA ? new Date(dateStrA) : new Date(0);
			const dateB = dateStrB ? new Date(dateStrB) : new Date(0);
			if (dateA.getTime() !== dateB.getTime()) {
				return dateA - dateB;
			}
			// 같은 날짜면 순번으로 (작은 순번 먼저)
			const seqA = parseInt(a.sequence || a['순번'] || a.__EMPTY || 0);
			const seqB = parseInt(b.sequence || b['순번'] || b.__EMPTY || 0);
			return seqA - seqB;
		});

		console.log(`📋 정렬 완료: ${sortedUsers.map(u => u.name || u['성명']).join(', ')}`);

		// 공통 등록 함수 호출
		const results = await registerUsers(sortedUsers, {
			source: 'bulk',
			admin: locals.user,
			fileName: fileName  // 파일명 전달
		});

		return json({
			success: true,
			created: results.created,
			failed: results.failed,
			errors: results.errors,
			alerts: results.alerts,
			treeStructure: results.treeStructure,
			batchProcessing: results.batchProcessing,
			message: `${results.created}명 등록 완료, ${results.failed}명 실패`
		});
	} catch (error) {
		// 검증 오류인 경우 상세 정보 전달
		if (error.message.includes('엑셀 업로드 실패')) {
			return json(
				{
					error: error.message,
					details: error.details || '사전 검증 실패'
				},
				{ status: 400 }
			);
		}

		return json({ error: '일괄 등록 중 오류가 발생했습니다.' }, { status: 500 });
	}
}
