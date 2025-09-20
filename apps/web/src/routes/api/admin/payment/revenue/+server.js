import { json } from '@sveltejs/kit';
import { connectDB } from '$lib/server/db.js';
import PaymentService from '$lib/server/services/paymentService.js';
import { MonthlyRevenue } from '$lib/server/models/Payment.js';

export async function GET({ url }) {
	try {
		await connectDB();

		const year = parseInt(url.searchParams.get('year') || new Date().getFullYear());
		const month = url.searchParams.get('month');

		// 특정 월 조회
		if (month) {
			const monthlyRevenue = await MonthlyRevenue.findOne({
				year,
				month: parseInt(month)
			});

			if (!monthlyRevenue) {
				// 계산 후 반환
				const calculated = await PaymentService.calculateMonthlyRevenue(year, parseInt(month));
				return json({
					success: true,
					data: calculated
				});
			}

			return json({
				success: true,
				data: monthlyRevenue
			});
		}

		// 연간 조회
		const revenues = await MonthlyRevenue.find({ year }).sort({ month: 1 });
		const totalRevenue = revenues.reduce((sum, r) => sum + r.totalRevenue, 0);
		const totalNewMembers = revenues.reduce((sum, r) => sum + r.newMembers, 0);

		return json({
			success: true,
			data: revenues,
			summary: {
				year,
				monthCount: revenues.length,
				totalRevenue,
				totalNewMembers,
				averageMonthlyRevenue: revenues.length > 0 ? totalRevenue / revenues.length : 0
			}
		});
	} catch (error) {
		console.error('Monthly revenue API error:', error);
		return json({
			success: false,
			error: error.message
		}, { status: 500 });
	}
}

export async function POST({ request }) {
	try {
		await connectDB();

		const { year, month } = await request.json();

		if (!year || !month) {
			return json({
				success: false,
				error: 'year and month are required'
			}, { status: 400 });
		}

		// 월별 매출 계산
		const monthlyRevenue = await PaymentService.calculateMonthlyRevenue(year, month);

		return json({
			success: true,
			data: monthlyRevenue
		});
	} catch (error) {
		console.error('Calculate monthly revenue error:', error);
		return json({
			success: false,
			error: error.message
		}, { status: 500 });
	}
}