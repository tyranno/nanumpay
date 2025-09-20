import { json } from '@sveltejs/kit';
import { db } from '$lib/server/db.js';
import WeeklyPayment from '$lib/server/models/WeeklyPayment.js';
import User from '$lib/server/models/User.js';

export async function GET({ url }) {
	try {
		await db();

		const year = parseInt(url.searchParams.get('year')) || new Date().getFullYear();
		const startMonth = parseInt(url.searchParams.get('startMonth')) || 1;
		const monthCount = parseInt(url.searchParams.get('count')) || 4;

		const months = [];

		for (let i = 0; i < monthCount; i++) {
			const currentMonth = startMonth + i;
			const month = ((currentMonth - 1) % 12) + 1;
			const yearOffset = Math.floor((currentMonth - 1) / 12);
			const targetYear = year + yearOffset;

			// 해당 월의 모든 주차 데이터를 가져와서 합산
			const monthlyPayments = await WeeklyPayment.getMonthlyPayments(targetYear, month);

			months.push({
				month: `${targetYear}년 ${month}월`,
				year: targetYear,
				monthNumber: month,
				payments: monthlyPayments,
				totalAmount: monthlyPayments.reduce((sum, p) => sum + p.totalAmount, 0),
				totalTax: monthlyPayments.reduce((sum, p) => sum + p.taxAmount, 0),
				totalNet: monthlyPayments.reduce((sum, p) => sum + p.netAmount, 0)
			});
		}

		return json({
			success: true,
			data: months
		});
	} catch (error) {
		console.error('Monthly payment API error:', error);
		return json({
			success: false,
			error: error.message
		}, { status: 500 });
	}
}