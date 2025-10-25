import { json } from '@sveltejs/kit';
import { processWeeklyPayments } from '$lib/server/services/weeklyPaymentService.js';
import { connectDB } from '$lib/server/db.js';

/** @type {import('./$types').RequestHandler} */
export async function POST({ request }) {
	await connectDB();

	try {
		const { date } = await request.json();

		console.log('[API] 수동 지급 실행 요청:', { date });

		// 지정된 날짜로 지급 처리 (날짜 없으면 오늘)
		const paymentDate = date ? new Date(date) : new Date();
		const result = await processWeeklyPayments(paymentDate);

		return json({
			success: true,
			message: '지급 처리가 완료되었습니다.',
			result
		});

	} catch (error) {
		console.error('Error in POST /api/admin/payment/execute:', error);
		return json({
			success: false,
			error: error.message
		}, { status: 500 });
	}
}