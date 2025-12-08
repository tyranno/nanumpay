import { json } from '@sveltejs/kit';
import { db } from '$lib/server/db.js';
import User from '$lib/server/models/User.js';
import WeeklyPaymentPlans from '$lib/server/models/WeeklyPaymentPlans.js';
import { shouldSkipByInsurance } from '$lib/server/services/payment/utils.js';

export async function GET({ locals }) {
	// 설계사 계정 확인
	if (!locals.user || locals.user.accountType !== 'planner') {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	await db();

	try {
		const plannerAccountId = locals.user.id;

		// 설계사가 설계한 모든 사용자 ID 조회 (보험 정보 포함)
		const users = await User.find({ plannerAccountId: plannerAccountId }, '_id grade insuranceAmount').lean();
		const userIds = users.map(u => u._id);

		// userId -> 보험 정보 매핑
		const userInsuranceMap = {};
		users.forEach(u => {
			userInsuranceMap[u._id.toString()] = {
				grade: u.grade,
				insuranceAmount: u.insuranceAmount || 0
			};
		});

		if (userIds.length === 0) {
			return json({
				thisWeek: { date: null, amount: 0, tax: 0, net: 0 },
				totalPaid: { amount: 0, tax: 0, net: 0 },
				upcoming: { amount: 0, tax: 0, net: 0 }
			});
		}

		// 이번 주 금요일 계산 (로컬 시간 기준)
		// ⭐ 토요일만 "금요일 지급 완료"로 처리 (일요일은 새 주의 시작)
		const now = new Date();
		const dayOfWeek = now.getDay(); // 0(일) ~ 6(토) - 로컬 시간
		const isFridayPassed = dayOfWeek === 6; // 토요일(6)만 금요일 지남 처리

		// ⭐ 토요일이면 다음 주 금요일, 그 외는 이번 주 금요일
		const weekOffset = isFridayPassed ? 7 : 0;

		// 이번 주 일요일 (로컬 시간 기준)
		const thisWeekStart = new Date(now);
		thisWeekStart.setDate(now.getDate() - dayOfWeek + weekOffset);
		thisWeekStart.setHours(0, 0, 0, 0);

		// 이번 주 토요일 (로컬 시간 기준)
		const thisWeekEnd = new Date(thisWeekStart);
		thisWeekEnd.setDate(thisWeekStart.getDate() + 6);
		thisWeekEnd.setHours(23, 59, 59, 999);

		// 이번 주 금요일 날짜 (로컬 시간 기준)
		const thisWeekFriday = new Date(thisWeekStart);
		thisWeekFriday.setDate(thisWeekStart.getDate() + 5);

		// 모든 지급 계획 조회
		// ⭐ v8.0: terminated 플랜도 포함 (유효한 installments 있음)
		// canceled만 제외
		const paymentPlans = await WeeklyPaymentPlans.find({
			userId: { $in: userIds.map(id => id.toString()) },
			planStatus: { $ne: 'canceled' }
		}).lean();

		let thisWeekAmount = 0, thisWeekTax = 0, thisWeekNet = 0;
		let totalPaidAmount = 0, totalPaidTax = 0, totalPaidNet = 0;
		let upcomingAmount = 0, upcomingTax = 0, upcomingNet = 0;

		for (const plan of paymentPlans) {
			// ⭐ 보험 조건 확인 (지급명부와 동일)
			const userInfo = userInsuranceMap[plan.userId];
			if (userInfo && shouldSkipByInsurance(userInfo.grade, userInfo.insuranceAmount)) {
				continue; // 보험 미가입 시 전체 플랜 skip
			}

			for (const installment of plan.installments) {
				// ⭐ canceled, terminated 상태 제외 (취소/정지된 할부 제외)
				if (installment.status === 'canceled' || installment.status === 'terminated') continue;

				const installmentDate = installment.scheduledDate || installment.weekDate;

				// 1. 이번주 금요일 지급액
				if (installmentDate >= thisWeekStart && installmentDate <= thisWeekEnd) {
					thisWeekAmount += installment.installmentAmount || 0;
					thisWeekTax += installment.withholdingTax || 0;
					thisWeekNet += installment.netAmount || 0;
				}

				// 2. 이미 지급한 총액 (이번주 이전)
				if (installmentDate < thisWeekStart) {
					totalPaidAmount += installment.installmentAmount || 0;
					totalPaidTax += installment.withholdingTax || 0;
					totalPaidNet += installment.netAmount || 0;
				}

				// 3. 앞으로 지급해야 할 총액 (이번주 이후)
				if (installmentDate > thisWeekEnd) {
					upcomingAmount += installment.installmentAmount || 0;
					upcomingTax += installment.withholdingTax || 0;
					upcomingNet += installment.netAmount || 0;
				}
			}
		}

		// 로컬 시간 기준 날짜 포맷 (YYYY-MM-DD)
		const formatLocalDate = (date) => {
			const year = date.getFullYear();
			const month = String(date.getMonth() + 1).padStart(2, '0');
			const day = String(date.getDate()).padStart(2, '0');
			return `${year}-${month}-${day}`;
		};

		return json({
			thisWeek: {
				date: formatLocalDate(thisWeekFriday),
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
