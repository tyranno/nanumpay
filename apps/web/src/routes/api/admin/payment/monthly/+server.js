import { json } from '@sveltejs/kit';
import { connectDB } from '$lib/server/db.js';
import UserPaymentPlan from '$lib/server/models/UserPaymentPlan.js';
import User from '$lib/server/models/User.js';
import { getWeeksInMonth } from '$lib/utils/fridayWeekCalculator.js';

export async function GET({ url }) {
	try {
		await connectDB();

		const year = parseInt(url.searchParams.get('year')) || new Date().getFullYear();
		const startMonth = parseInt(url.searchParams.get('startMonth')) || 1;
		const monthCount = parseInt(url.searchParams.get('count')) || 4;

		const months = [];

		for (let i = 0; i < monthCount; i++) {
			const currentMonth = startMonth + i;
			const month = ((currentMonth - 1) % 12) + 1;
			const yearOffset = Math.floor((currentMonth - 1) / 12);
			const targetYear = year + yearOffset;

			// 해당 월의 모든 주차 구하기
			const weeksInMonth = getWeeksInMonth(targetYear, month);

			// 모든 사용자 조회
			const allUsers = await User.find({ type: 'user' }).lean();
			const allUserIds = allUsers.map(u => u._id.toString());
			const userMap = new Map(allUsers.map(u => [u._id.toString(), u]));

			// 해당 월의 모든 주차에 대한 지급 계획 조회
			const paymentPlans = await UserPaymentPlan.find({
				userId: { $in: allUserIds },
				'installments.scheduledDate.year': targetYear,
				'installments.scheduledDate.month': month
			}).lean();

			// 사용자별 월간 합계 계산
			const userPaymentMap = new Map();

			paymentPlans.forEach(plan => {
				const user = userMap.get(plan.userId);
				if (!user) return;

				if (!userPaymentMap.has(plan.userId)) {
					userPaymentMap.set(plan.userId, {
						userId: user.loginId,
						userName: user.name,
						bank: user.bank,
						accountNumber: user.accountNumber,
						grade: user.grade,
						totalAmount: 0,
						taxAmount: 0,
						netAmount: 0,
						weeks: []
					});
				}

				const userPayment = userPaymentMap.get(plan.userId);

				// 해당 월의 모든 분할금 합산
				const monthInstallments = plan.installments.filter(inst =>
					inst.scheduledDate.year === targetYear &&
					inst.scheduledDate.month === month
				);

				monthInstallments.forEach(inst => {
					const amount = inst.amount || 0;
					userPayment.totalAmount += amount;

					// 주차별 기록
					const existingWeek = userPayment.weeks.find(w => w.week === inst.scheduledDate.week);
					if (existingWeek) {
						existingWeek.amount += amount;
					} else {
						userPayment.weeks.push({
							week: inst.scheduledDate.week,
							amount: amount
						});
					}
				});
			});

			// 세금 계산
			const monthlyPayments = Array.from(userPaymentMap.values()).map(payment => {
				payment.taxAmount = Math.round(payment.totalAmount * 0.033);
				payment.netAmount = payment.totalAmount - payment.taxAmount;
				return payment;
			});

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