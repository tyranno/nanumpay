import { json } from '@sveltejs/kit';
import { db } from '$lib/server/db.js';
import { excelLogger } from '$lib/server/logger.js';
import { userRegistrationService } from '$lib/server/services/userRegistrationService.js';

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

		// 공통 등록 서비스 호출
		const results = await userRegistrationService.registerUsers(users, {
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

/**
 * GET: 엑셀 템플릿 다운로드
 */
export async function GET({ locals }) {
	// 관리자 권한 확인
	if (!locals.user || !locals.user.isAdmin) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	// xlsx 라이브러리 import
	const XLSX = await import('xlsx');

	// 샘플 데이터
	const sampleData = [
		['성명', '연락처', '지사', '은행', '계좌번호', '판매인', '설계사', '설계사 연락처', '보험상품명', '보험회사'],
		['홍길동', '010-1234-5678', '서울지사', '국민은행', '123-456-789', '', '', '', '', ''],
		['김철수', '010-2345-6789', '경기지사', '신한은행', '987-654-321', '홍길동', '이영희', '010-1111-2222', '종신보험', 'A생명'],
		['이영희', '010-3456-7890', '인천지사', '우리은행', '456-789-123', '홍길동', '박민수', '010-3333-4444', '연금보험', 'B생명'],
	];

	// 워크북 생성
	const workbook = XLSX.utils.book_new();
	const worksheet = XLSX.utils.aoa_to_sheet(sampleData);

	// 컬럼 너비 설정
	worksheet['!cols'] = [
		{ wch: 10 }, // 성명
		{ wch: 15 }, // 연락처
		{ wch: 12 }, // 지사
		{ wch: 12 }, // 은행
		{ wch: 20 }, // 계좌번호
		{ wch: 10 }, // 판매인
		{ wch: 10 }, // 설계사
		{ wch: 15 }, // 설계사 연락처
		{ wch: 15 }, // 보험상품명
		{ wch: 12 }, // 보험회사
	];

	XLSX.utils.book_append_sheet(workbook, worksheet, '사용자등록');

	// 바이너리로 변환
	const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

	return new Response(buffer, {
		headers: {
			'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
			'Content-Disposition': 'attachment; filename="user_registration_template.xlsx"'
		}
	});
}
