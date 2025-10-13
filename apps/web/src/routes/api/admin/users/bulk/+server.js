import { json } from '@sveltejs/kit';
import { db } from '$lib/server/db.js';
import { excelLogger } from '$lib/server/logger.js';
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
		const { users } = await request.json();

		// 엑셀 업로드 시작 로그
		excelLogger.info('=== 엑셀 업로드 시작 ===', {
			admin: locals.user.name || locals.user.id,
			timestamp: new Date().toISOString(),
			dataCount: users ? users.length : 0,
			sampleData: users ? users.slice(0, 2) : null
		});

		// 데이터 형식 확인
		if (!users || !Array.isArray(users)) {
			const error = '데이터 형식 오류';
			excelLogger.error(error, { users, type: typeof users });
			return json({ error: '올바른 데이터 형식이 아닙니다.' }, { status: 400 });
		}

		// 공통 등록 함수 호출 (매번 새 인스턴스)
		const results = await registerUsers(users, {
			source: 'bulk',
			admin: locals.user
		});

		// 결과 로그 기록
		excelLogger.info('=== 엑셀 업로드 완료 ===', {
			admin: locals.user.name || locals.user.id,
			timestamp: new Date().toISOString(),
			success: results.created,
			failed: results.failed,
			errors: results.errors
		});

		// v5.0: 과거 날짜 지급 처리는 paymentScheduler의 checkAndProcessMissedPayments에서 자동 처리됨
		excelLogger.info('v5.0: 놓친 지급은 스케줄러가 자동 처리합니다.');

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
		excelLogger.error('Bulk user registration error:', error);

		// 검증 오류인 경우 상세 정보 전달
		if (error.message.includes('엑셀 업로드 실패')) {
			return json({
				error: error.message,
				details: error.details || '사전 검증 실패'
			}, { status: 400 });
		}

		return json({ error: '일괄 등록 중 오류가 발생했습니다.' }, { status: 500 });
	}
}
