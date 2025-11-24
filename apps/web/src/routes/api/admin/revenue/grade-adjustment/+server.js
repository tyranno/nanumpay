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

		// null 값 제거: null이면 조정 안 함 (자동 계산 사용)
		const filteredAdjustments = {};
		Object.keys(adjustedGradePayments).forEach(grade => {
			const payment = adjustedGradePayments[grade];
			if (payment && payment.totalAmount !== null && payment.totalAmount !== undefined) {
				// 값이 있는 것만 저장 (0 포함)
				filteredAdjustments[grade] = payment;
			}
			// null/undefined는 저장하지 않음 → 자동 계산 사용
		});

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
					adjustedGradePayments: filteredAdjustments,
					lastModifiedBy: locals.user.username,
					lastModifiedAt: new Date()
				}
			},
			{
				new: true,
				upsert: true
			}
		);

		// 자동 계산 금액 가져오기 (조정값이 null일 때 사용)
		const monthData = await MonthlyRegistrations.findOne({ monthKey });
		const autoCalculatedPayments = monthData?.gradePayments || {};

		// WeeklyPaymentPlans 업데이트: revenueMonth가 monthKey인 모든 계획
		const plans = await WeeklyPaymentPlans.find({
			revenueMonth: monthKey,
			planStatus: { $in: ['active', 'completed'] }
		});

		let updatedCount = 0;
		const gradeStats = {}; // 등급별 통계
		for (const plan of plans) {
			const grade = plan.baseGrade;
			const adjustedPayment = filteredAdjustments[grade];

			// 등급별 통계 초기화
			if (!gradeStats[grade]) {
				gradeStats[grade] = { count: 0, isAdjusted: false, amount: 0 };
			}

			// 조정값 결정: null/undefined면 자동 계산 금액, 0이면 0원, 값이 있으면 조정 금액
			let perInstallment;
			if (!adjustedPayment || adjustedPayment.totalAmount === null || adjustedPayment.totalAmount === undefined) {
				// 아무것도 입력되지 않음 → 자동 계산 금액 사용
				const autoPayment = autoCalculatedPayments[grade];
				if (autoPayment === null || autoPayment === undefined) {
					continue;
				}
				// autoPayment는 숫자이므로 직접 사용 (0도 유효!)
				perInstallment = Math.floor(autoPayment / 10 / 100) * 100;
				gradeStats[grade].isAdjusted = false;
				gradeStats[grade].amount = perInstallment;
			} else {
				// 0원 포함하여 조정 금액 사용
				perInstallment = adjustedPayment.perInstallment;
				gradeStats[grade].isAdjusted = true;
				gradeStats[grade].amount = perInstallment;
			}

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
			gradeStats[grade].count++;
		}

		// 결과 메시지 생성
		let message;
		if (Object.keys(gradeStats).length === 0) {
			message = `조정값이 저장되었습니다.
(해당 월 지급 대상자 없음)`;
		} else {
			const resultDetails = Object.keys(gradeStats)
				.sort()
				.map(grade => {
					const stat = gradeStats[grade];
					const type = stat.isAdjusted ? '조정' : '자동';
					const amount = stat.amount.toLocaleString();
					return `${grade}: ${type} ${amount}원/회 (${stat.count}명)`;
				})
				.join('\n');
			message = `등급별 지급 총액이 조정되었습니다.
${resultDetails}
총 ${updatedCount}개 지급계획 업데이트`;
		}

		return json({
			success: true,
			message: message,
			data: result,
			updatedPlansCount: updatedCount,
			gradeStats
		});
	} catch (error) {
		console.error('Error saving grade adjustment:', error);
		return json({ error: 'Internal server error' }, { status: 500 });
	}
}