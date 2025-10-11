import { json } from '@sveltejs/kit';
import { db } from '$lib/server/db.js';
import WeeklyPaymentSummary from '$lib/server/models/WeeklyPaymentSummary.js';
import MonthlyRegistrations from '$lib/server/models/MonthlyRegistrations.js';

export async function GET({ locals }) {
	if (!locals.user || locals.user.type !== 'admin') {
		return json({ message: '권한이 없습니다.' }, { status: 401 });
	}

	await db();

	try {
		// v5.0: 현재 날짜 정보
		const currentDate = new Date();
		const currentYear = currentDate.getFullYear();
		const currentMonth = currentDate.getMonth() + 1;

		// v5.0: getWeekNumber 계산 (ISO 주차)
		const startOfYear = new Date(currentYear, 0, 1);
		const dayOfYear = Math.floor((currentDate - startOfYear) / (1000 * 60 * 60 * 24));
		const weekNumber = Math.ceil((dayOfYear + startOfYear.getDay() + 1) / 7);

		// 현재 주차 계산 (월 기준)
		const dayOfWeek = currentDate.getDay();
		const diff = currentDate.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1);
		const weekStart = new Date(currentDate.setDate(diff));
		weekStart.setHours(0, 0, 0, 0);
		const weekOfMonth = Math.ceil(weekStart.getDate() / 7);

		// 병렬로 데이터 조회
		const [weeklyPaymentData, monthlyRevenues] = await Promise.all([
			// v5.0: 이번 주 지급 요약 조회
			WeeklyPaymentSummary.findOne({ weekNumber }),

			// v5.0: 최근 3개월 매출 데이터 (지급 구성 표시용)
			MonthlyRegistrations.find({
				monthKey: {
					$in: [
						`${currentYear}-${String(currentMonth).padStart(2, '0')}`,
						`${currentYear}-${String(currentMonth - 1).padStart(2, '0')}`,
						`${currentYear}-${String(currentMonth - 2).padStart(2, '0')}`
					]
				}
			}).sort({ monthKey: -1 }).limit(3)
		]);

		// v5.0: 주간 지급 정보 정리 (WeeklyPaymentSummary에서 조회)
		const weeklyPayment = weeklyPaymentData ? {
			totalAmount: weeklyPaymentData.totalAmount || 0,
			totalTax: weeklyPaymentData.totalTax || 0,
			totalNet: weeklyPaymentData.totalNetAmount || 0,
			userCount: weeklyPaymentData.userCount || 0,
			period: `${currentYear}년 ${currentMonth}월 ${weekOfMonth}주차`
		} : {
			totalAmount: 0,
			totalTax: 0,
			totalNet: 0,
			userCount: 0,
			period: `${currentYear}년 ${currentMonth}월 ${weekOfMonth}주차`
		};

		// v5.0: 월별 매출 데이터 정리 (MonthlyRegistrations에서 조회)
		const formattedRevenues = monthlyRevenues.map(reg => {
			const [year, month] = reg.monthKey.split('-').map(Number);
			return {
				year,
				month,
				totalRevenue: reg.totalRevenue || 0,
				revenuePerInstallment: (reg.totalRevenue || 0) / 10,
				isCalculated: true
			};
		});

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