import { json } from '@sveltejs/kit';
import PaymentScheduler from '$lib/server/services/paymentScheduler.js';
import { connectDB } from '$lib/server/db.js';

/** @type {import('./$types').RequestHandler} */
export async function POST({ request }) {
	await connectDB();

	try {
		const { year, month, week } = await request.json();

		console.log('[API] 수동 지급 실행 요청:', { year, month, week });

		// 수동으로 금요일 지급 실행
		await PaymentScheduler.executeManualPayment();

		return json({
			success: true,
			message: '금요일 자동 지급이 수동으로 실행되었습니다.'
		});

	} catch (error) {
		console.error('Error in POST /api/admin/payment/execute:', error);
		return json({
			success: false,
			error: error.message
		}, { status: 500 });
	}
}