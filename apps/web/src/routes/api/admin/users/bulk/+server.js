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

		// 공통 등록 함수 호출
		const results = await registerUsers(users, {
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
