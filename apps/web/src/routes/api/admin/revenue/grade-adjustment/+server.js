import { json } from '@sveltejs/kit';
import { connectDB } from '$lib/server/db';
import MonthlyRegistrations from '$lib/server/models/MonthlyRegistrations';
import WeeklyPaymentPlans from '$lib/server/models/WeeklyPaymentPlans';
import { calculateGradePayments } from '$lib/server/utils/paymentCalculator';

export async function GET({ url, locals }) {
	// 권한 확인
	if (!locals.user || locals.user.type !== 'admin') {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	try {
		await connectDB();

		// 쿼리 파라미터 받기
		const startMonth = url.searchParams.get('startMonth');
		const endMonth = url.searchParams.get('endMonth');

		if (!startMonth || !endMonth) {
			return json({ error: 'startMonth and endMonth are required' }, { status: 400 });
		}

		// 시작월부터 종료월까지의 모든 월 생성
		const months = [];
		const [startY, startM] = startMonth.split('-').map(Number);
		const [endY, endM] = endMonth.split('-').map(Number);

		let current = new Date(endY, endM - 1, 1);
		const startDate = new Date(startY, startM - 1, 1);

		// 역순으로 월 생성 (최신월부터)
		while (current >= startDate) {
			const y = current.getFullYear();
			const m = String(current.getMonth() + 1).padStart(2, '0');
			months.push(`${y}-${m}`);
			current.setMonth(current.getMonth() - 1);
		}

		// 각 월별 데이터 조회
		const monthsData = [];
		for (const monthKey of months) {
			const monthData = await MonthlyRegistrations.findOne({ monthKey });

			if (monthData) {
				// 실제 매출 가져오기 (수동 조정값이 있으면 그것을, 없으면 자동값)
				const effectiveRevenue = monthData.getEffectiveRevenue();

				// 등급별 지급액 가져오기 (절삭하지 않고 원본 값 사용)
				let gradePayments = {};
				if (monthData.gradePayments) {
					// 원본 값 그대로 사용 (절삭하지 않음)
					gradePayments = { ...monthData.gradePayments };
				}

				// 등급별 지급액이 없으면 계산
				if (!gradePayments.F1 && !gradePayments.F2 && monthData.gradeDistribution) {
					// 등급별 지급액 재계산 (원본 값 사용, 절삭하지 않음)
					gradePayments = calculateGradePayments(effectiveRevenue, monthData.gradeDistribution);
				}

				monthsData.push({
					monthKey,
					gradeDistribution: monthData.gradeDistribution || {},
					gradePayments: gradePayments,
					adjustedGradePayments: monthData.adjustedGradePayments || {},
					totalRevenue: monthData.totalRevenue || 0,
					adjustedRevenue: monthData.adjustedRevenue,
					effectiveRevenue: effectiveRevenue
				});
			} else {
				// 데이터가 없는 월도 빈 객체로 포함
				monthsData.push({
					monthKey,
					gradeDistribution: {},
					gradePayments: {},
					adjustedGradePayments: {},
					totalRevenue: 0,
					adjustedRevenue: null,
					effectiveRevenue: 0
				});
			}
		}

		return json({
			success: true,
			months: monthsData
		});
	} catch (error) {
		console.error('Error fetching grade adjustment data:', error);
		return json({ error: 'Internal server error' }, { status: 500 });
	}
}

// 등급별 조정 저장
export async function POST({ request, locals }) {
	// 권한 확인
	if (!locals.user || locals.user.type !== 'admin') {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	try {
		await connectDB();

		const { monthKey, adjustedGradePayments } = await request.json();

		if (!monthKey || !adjustedGradePayments) {
			return json({ error: 'monthKey and adjustedGradePayments are required' }, { status: 400 });
		}

		// 현재 월 및 이전 월 확인 (현재 월과 이전 월만 수정 가능)
		const now = new Date();
		const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

		// 이전 월 계산
		const prevMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
		const prevMonth = `${prevMonthDate.getFullYear()}-${String(prevMonthDate.getMonth() + 1).padStart(2, '0')}`;

		if (monthKey !== currentMonth && monthKey !== prevMonth) {
			return json({ error: 'Only current month and previous month can be adjusted' }, { status: 400 });
		}

		// MonthlyRegistrations 업데이트
		const result = await MonthlyRegistrations.findOneAndUpdate(
			{ monthKey },
			{
				$set: {
					adjustedGradePayments,
					lastModifiedBy: locals.user.username,
					lastModifiedAt: new Date()
				}
			},
			{
				new: true,
				upsert: true
			}
		);

		// WeeklyPaymentPlans 업데이트: revenueMonth가 monthKey인 모든 계획
		const plans = await WeeklyPaymentPlans.find({
			revenueMonth: monthKey,
			planStatus: { $in: ['active', 'completed'] }
		});

		let updatedCount = 0;
		for (const plan of plans) {
			const grade = plan.baseGrade; // F1, F2, ...
			const adjustedPayment = adjustedGradePayments[grade];

			if (!adjustedPayment || adjustedPayment.totalAmount === null) {
				continue; // 조정값이 없으면 스킵
			}

			const perInstallment = adjustedPayment.perInstallment;

			// 모든 installment 업데이트 (지급액, 원천징수, 실지급액)
			// 배열을 완전히 새로 만들어서 재할당
			plan.installments = plan.installments.map(installment => {
				const withholdingTax = Math.floor(perInstallment * 0.033);
				const netAmount = perInstallment - withholdingTax;

				return {
					...installment.toObject(),
					installmentAmount: perInstallment,
					withholdingTax: withholdingTax,
					netAmount: netAmount
				};
			});

			await plan.save();
			updatedCount++;
		}

		return json({
			success: true,
			message: `등급별 지급 총액이 조정되었습니다. (지급계획 ${updatedCount}개 업데이트)`,
			data: result,
			updatedPlansCount: updatedCount
		});
	} catch (error) {
		console.error('Error saving grade adjustment:', error);
		return json({ error: 'Internal server error' }, { status: 500 });
	}
}