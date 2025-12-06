/**
 * 지급 상세 정보 조회 API
 * GET /api/admin/payment/installment-details?userId=xxx&year=2025&month=10&week=2
 *
 * 해당 주차에 지급되는 installment들의 상세 정보 반환
 * - baseDate (등록/승급일): additionalPaymentBaseDate
 * - startDate (첫 지급일)
 * - baseGrade, planType, 추가지급단계, revenueMonth, week, amount
 */

import { json } from '@sveltejs/kit';
import { connectDB } from '$lib/server/db.js';
import WeeklyPaymentPlans from '$lib/server/models/WeeklyPaymentPlans.js';
import { getFridaysInMonth } from '$lib/utils/fridayWeekCalculator.js';

export async function GET({ url, locals }) {
	// 권한 확인
	if (!locals.user || !locals.user.isAdmin) {
		return json({ error: '권한이 없습니다' }, { status: 403 });
	}

	const userId = url.searchParams.get('userId');
	const year = parseInt(url.searchParams.get('year'));
	const month = parseInt(url.searchParams.get('month'));
	const week = parseInt(url.searchParams.get('week'));

	if (!userId || !year || !month || !week) {
		return json({ error: 'userId, year, month, week가 필요합니다' }, { status: 400 });
	}

	// 해당 월의 주차에서 금요일 날짜 및 ISO weekNumber 계산
	const fridays = getFridaysInMonth(year, month);
	const targetWeek = fridays.find((w) => w.weekNumber === week);

	if (!targetWeek) {
		return json({ error: '유효하지 않은 주차입니다' }, { status: 400 });
	}

	const weekNumber = WeeklyPaymentPlans.getISOWeek(targetWeek.friday);

	try {
		await connectDB();

		// 해당 사용자의 지급 계획 중 해당 주차에 지급되는 installment 조회
		const plans = await WeeklyPaymentPlans.find({
			userId: userId,
			'installments.weekNumber': weekNumber,
			'installments.status': { $in: ['paid', 'pending'] }
		}).lean();

		// 결과 포맷
		const installmentDetails = [];

		for (const plan of plans) {
			// 해당 weekNumber의 installment만 필터
			const matchingInstallments = plan.installments.filter(
				(inst) => inst.weekNumber === weekNumber && ['paid', 'pending'].includes(inst.status)
			);

			for (const inst of matchingInstallments) {
				installmentDetails.push({
					baseGrade: plan.baseGrade,
					planType: plan.planType,
					추가지급단계: plan.추가지급단계 || 0,
					baseDate: plan.additionalPaymentBaseDate, // 등록/승급일
					startDate: plan.startDate, // 첫 지급일
					revenueMonth: inst.revenueMonth,
					week: inst.week,
					amount: inst.installmentAmount,
					tax: inst.withholdingTax,
					net: inst.netAmount,
					status: inst.status
				});
			}
		}

		// 등급 순 → 매출월 순 → 회차 순 정렬
		installmentDetails.sort((a, b) => {
			const gradeA = parseInt(a.baseGrade?.replace('F', '') || '0');
			const gradeB = parseInt(b.baseGrade?.replace('F', '') || '0');
			if (gradeA !== gradeB) return gradeA - gradeB;

			// 매출월 비교 (2025-09 < 2025-10)
			if (a.revenueMonth !== b.revenueMonth) {
				return (a.revenueMonth || '').localeCompare(b.revenueMonth || '');
			}

			return (a.week || 0) - (b.week || 0);
		});

		return json({
			success: true,
			data: installmentDetails
		});
	} catch (error) {
		console.error('[installment-details] 오류:', error);
		return json({ error: error.message }, { status: 500 });
	}
}
