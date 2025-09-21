import { json } from '@sveltejs/kit';
import { db } from '$lib/server/db.js';
import WeeklyPayment from '$lib/server/models/WeeklyPayment.js';
import MonthlyRevenue from '$lib/server/models/MonthlyRevenue.js';

export async function GET({ locals }) {
	if (!locals.user || locals.user.type !== 'admin') {
		return json({ message: '권한이 없습니다.' }, { status: 401 });
	}

	await db();

	try {
		// 현재 날짜 정보
		const currentDate = new Date();
		const currentYear = currentDate.getFullYear();
		const currentMonth = currentDate.getMonth() + 1;

		// 현재 주차 계산 (월요일 기준)
		const dayOfWeek = currentDate.getDay();
		const diff = currentDate.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1);
		const weekStart = new Date(currentDate.setDate(diff));
		weekStart.setHours(0, 0, 0, 0);

		const weekOfMonth = Math.ceil(weekStart.getDate() / 7);

		// 병렬로 데이터 조회
		const [weeklyPaymentData, monthlyRevenues] = await Promise.all([
			// 이번 주 지급액 조회
			WeeklyPayment.aggregate([
				{
					$match: {
						year: currentYear,
						month: currentMonth,
						week: weekOfMonth
					}
				},
				{
					$group: {
						_id: null,
						totalAmount: { $sum: '$totalAmount' },
						totalTax: { $sum: '$taxAmount' },
						totalNet: { $sum: '$netAmount' },
						userCount: { $sum: 1 }
					}
				}
			]),

			// 최근 3개월 매출 데이터 (지급 구성 표시용)
			MonthlyRevenue.find({
				$or: [
					{ year: currentYear, month: currentMonth },
					{ year: currentYear, month: currentMonth - 1 },
					{ year: currentYear, month: currentMonth - 2 },
					{ year: currentMonth <= 2 ? currentYear - 1 : currentYear, month: currentMonth <= 2 ? currentMonth + 10 : currentMonth - 2 },
					{ year: currentMonth <= 1 ? currentYear - 1 : currentYear, month: currentMonth <= 1 ? 12 : currentMonth - 1 }
				]
			}).sort({ year: -1, month: -1 }).limit(3)
		]);

		// 주간 지급 정보 정리
		const weeklyPayment = weeklyPaymentData[0] ? {
			totalAmount: weeklyPaymentData[0].totalAmount || 0,
			totalTax: weeklyPaymentData[0].totalTax || 0,
			totalNet: weeklyPaymentData[0].totalNet || 0,
			userCount: weeklyPaymentData[0].userCount || 0,
			period: `${currentYear}년 ${currentMonth}월 ${weekOfMonth}주차`
		} : {
			totalAmount: 0,
			totalTax: 0,
			totalNet: 0,
			userCount: 0,
			period: `${currentYear}년 ${currentMonth}월 ${weekOfMonth}주차`
		};

		// 월별 매출 데이터 정리 (지급 구성 표시용)
		const formattedRevenues = monthlyRevenues.map(rev => ({
			year: rev.year,
			month: rev.month,
			totalRevenue: rev.totalRevenue,
			revenuePerInstallment: rev.revenuePerInstallment || (rev.totalRevenue / 10),
			isCalculated: rev.isCalculated
		}));

		return json({
			success: true,
			currentMonth,
			currentYear,
			weeklyPayment,
			monthlyRevenues: formattedRevenues
		});
	} catch (error) {
		console.error('Error loading weekly payment info:', error);
		return json({
			success: false,
			error: '주간 지급 정보 조회 중 오류가 발생했습니다.'
		}, { status: 500 });
	}
}