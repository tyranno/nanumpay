import { json } from '@sveltejs/kit';
import { db } from '$lib/server/db.js';
import User from '$lib/server/models/User.js';
import WeeklyPaymentPlans from '$lib/server/models/WeeklyPaymentPlans.js';

export async function GET({ locals }) {
	// 설계사 계정 확인
	if (!locals.user || locals.user.accountType !== 'planner') {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	await db();

	try {
		const plannerAccountId = locals.user.id;

		// 설계사가 설계한 모든 사용자 ID 조회
		const users = await User.find({ plannerAccountId: plannerAccountId }, '_id').lean();
		const userIds = users.map(u => u._id);

		if (userIds.length === 0) {
			return json({
				thisWeek: { date: null, amount: 0, tax: 0, net: 0 },
				totalPaid: { amount: 0, tax: 0, net: 0 },
				upcoming: { amount: 0, tax: 0, net: 0 }
			});
		}

		// 이번 주 금요일 계산 (UTC 기준)
		// ⭐ 금요일이 지났으면(토/일) 다음 주 금요일을 "이번주"로 표시
		const now = new Date();
		const dayOfWeek = now.getUTCDay(); // 0(일) ~ 6(토)
		const isFridayPassed = dayOfWeek === 0 || dayOfWeek === 6; // 토요일(6) 또는 일요일(0)

		// ⭐ 금요일이 지났으면 다음 주 기준으로 계산
		const weekOffset = isFridayPassed ? 7 : 0;

		// 이번 주 일요일 (UTC 기준) - 금요일 지났으면 다음 주 일요일
		const thisWeekStart = new Date(Date.UTC(
			now.getUTCFullYear(),
			now.getUTCMonth(),
			now.getUTCDate() - dayOfWeek + weekOffset
		));

		// 이번 주 토요일 (UTC 기준) - 금요일 지났으면 다음 주 토요일
		const thisWeekEnd = new Date(Date.UTC(
			now.getUTCFullYear(),
			now.getUTCMonth(),
			now.getUTCDate() - dayOfWeek + 6 + weekOffset,
			23, 59, 59, 999
		));

		// 이번 주 금요일 날짜 (UTC 기준) - 금요일 지났으면 다음 주 금요일
		const thisWeekFriday = new Date(Date.UTC(
			now.getUTCFullYear(),
			now.getUTCMonth(),
			now.getUTCDate() - dayOfWeek + 5 + weekOffset
		));

		// 모든 지급 계획 조회
		const paymentPlans = await WeeklyPaymentPlans.find({
			userId: { $in: userIds.map(id => id.toString()) },
			planStatus: { $nin: ['terminated', 'canceled'] }
		}).lean();

		let thisWeekAmount = 0, thisWeekTax = 0, thisWeekNet = 0;
		let totalPaidAmount = 0, totalPaidTax = 0, totalPaidNet = 0;
		let upcomingAmount = 0, upcomingTax = 0, upcomingNet = 0;

		for (const plan of paymentPlans) {
			for (const installment of plan.installments) {
				// canceled 상태 제외
				if (installment.status === 'canceled') continue;

				const installmentDate = installment.scheduledDate || installment.weekDate;

				// 1. 이번주 금요일 지급액 (이번주만, 상태 무관)
				if (installmentDate >= thisWeekStart && installmentDate <= thisWeekEnd) {
					thisWeekAmount += installment.installmentAmount || 0;
					thisWeekTax += installment.withholdingTax || 0;
					thisWeekNet += installment.netAmount || 0;
				}

				// 2. 이미 지급한 총액 (과거 전체, 상태 무관)
				if (installmentDate < thisWeekStart) {
					totalPaidAmount += installment.installmentAmount || 0;
					totalPaidTax += installment.withholdingTax || 0;
					totalPaidNet += installment.netAmount || 0;
				}

				// 3. 앞으로 지급해야 할 총액 (미래만, 상태 무관)
				if (installmentDate > thisWeekEnd) {
					upcomingAmount += installment.installmentAmount || 0;
					upcomingTax += installment.withholdingTax || 0;
					upcomingNet += installment.netAmount || 0;
				}
			}
		}

		return json({
			thisWeek: {
				date: thisWeekFriday.toISOString().split('T')[0],
				amount: thisWeekAmount,
				tax: thisWeekTax,
				net: thisWeekNet
			},
			totalPaid: {
				amount: totalPaidAmount,
				tax: totalPaidTax,
				net: totalPaidNet
			},
			upcoming: {
				amount: upcomingAmount,
				tax: upcomingTax,
				net: upcomingNet
			}
		});
	} catch (error) {
		console.error('지급 총액 조회 오류:', error);
		return json({ error: '서버 오류가 발생했습니다.' }, { status: 500 });
	}
}