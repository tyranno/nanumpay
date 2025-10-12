/**
 * 과거 지급 일괄 처리 API
 * POST /api/admin/payment/process-past
 */

import { json } from '@sveltejs/kit';
import { connectDB } from '$lib/server/db.js';
import { processAllPastPayments } from '$lib/server/services/weeklyPaymentService.js';

/**
 * 과거 미처리 지급 일괄 처리
 */
export async function POST({ cookies }) {
	try {
		// 관리자 인증 확인
		const sessionId = cookies.get('sessionId');
		if (!sessionId) {
			return json({ success: false, message: '로그인이 필요합니다' }, { status: 401 });
		}

		// DB 연결
		await connectDB();

		// 환경변수 확인
		if (process.env.AUTO_PROCESS_PAST_PAYMENTS !== 'true') {
			return json(
				{
					success: false,
					message: '과거 지급 자동 처리가 비활성화되어 있습니다. AUTO_PROCESS_PAST_PAYMENTS=true로 설정하세요.'
				},
				{ status: 403 }
			);
		}

		console.log('[API] 과거 지급 일괄 처리 요청');

		// 과거 지급 일괄 처리
		const result = await processAllPastPayments();

		return json({
			success: true,
			message: '과거 지급 일괄 처리가 완료되었습니다',
			data: result
		});
	} catch (error) {
		console.error('[API] 과거 지급 일괄 처리 실패:', error);
		return json(
			{
				success: false,
				message: error.message || '과거 지급 일괄 처리에 실패했습니다'
			},
			{ status: 500 }
		);
	}
}
