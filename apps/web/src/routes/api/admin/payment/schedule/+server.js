import { json } from '@sveltejs/kit';
import PaymentService from '$lib/server/services/paymentService.js';
import PaymentSchedule from '$lib/server/models/PaymentSchedule.js';
import { connectDB } from '$lib/server/db.js';

/** @type {import('./$types').RequestHandler} */
export async function GET({ url }) {
	await connectDB();

	try {
		const year = parseInt(url.searchParams.get('year'));
		const month = parseInt(url.searchParams.get('month'));
		const week = parseInt(url.searchParams.get('week'));

		console.log(`[API] GET /api/admin/payment/schedule 요청:`, { year, month, week });

		if (!year || !month || !week) {
			console.log(`[API] 파라미터 오류: year=${year}, month=${month}, week=${week}`);
			return json({
				success: false,
				error: 'year, month, week 파라미터가 필요합니다.'
			}, { status: 400 });
		}

		// 해당 주차의 지급액 계산
		console.log(`[API] PaymentService.calculateWeeklyPayments 호출 시작`);
		const weeklyPayment = await PaymentService.calculateWeeklyPayments(year, month, week);
		console.log(`[API] PaymentService.calculateWeeklyPayments 호출 완료:`, !!weeklyPayment);

		if (!weeklyPayment) {
			console.log(`[API] 결과가 null - 해당 주차에 지급될 데이터가 없음`);
			return json({
				success: false,
				error: '해당 주차에 지급될 데이터가 없습니다.'
			});
		}

		console.log(`[API] 성공적으로 데이터 반환`, {
			payments: weeklyPayment.payments?.length || 0,
			totalPayment: weeklyPayment.totalPayment || 0
		});

		return json({
			success: true,
			data: weeklyPayment
		});

	} catch (error) {
		console.error('Error in GET /api/admin/payment/schedule:', error);
		return json({
			success: false,
			error: error.message
		}, { status: 500 });
	}
}

/** @type {import('./$types').RequestHandler} */
export async function POST({ request }) {
	await connectDB();

	try {
		const { year, month } = await request.json();

		if (!year || !month) {
			return json({
				success: false,
				error: 'year, month 파라미터가 필요합니다.'
			}, { status: 400 });
		}

		// 매출 생성 및 10주 분할 스케줄 생성
		const schedules = await PaymentService.createPaymentSchedule(year, month);

		return json({
			success: true,
			data: schedules,
			message: `${year}년 ${month}월 매출의 10주 분할 스케줄이 생성되었습니다.`
		});

	} catch (error) {
		console.error('Error in POST /api/admin/payment/schedule:', error);
		return json({
			success: false,
			error: error.message
		}, { status: 500 });
	}
}