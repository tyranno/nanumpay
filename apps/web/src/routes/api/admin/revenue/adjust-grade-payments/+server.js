import { json } from '@sveltejs/kit';
import { db } from '$lib/server/db.js';
import MonthlyRegistrations from '$lib/server/models/MonthlyRegistrations.js';
import WeeklyPaymentPlans from '$lib/server/models/WeeklyPaymentPlans.js';

export async function POST({ request, locals }) {
	try {
		// 관리자 권한 확인
		if (!locals.user || locals.user.type !== 'admin') {
			return json({ error: '관리자 권한이 필요합니다.' }, { status: 401 });
		}

		await db();

		const { monthKey, adjustments } = await request.json();

		if (!monthKey) {
			return json({ error: '월 정보가 필요합니다.' }, { status: 400 });
		}

		console.log(`[등급별 지급액 조정] ${monthKey} 조정 시작:`, adjustments);

		// 1. MonthlyRegistrations 업데이트
		const monthlyData = await MonthlyRegistrations.findOne({ monthKey });
		if (!monthlyData) {
			return json({ error: '해당 월의 데이터가 없습니다.' }, { status: 404 });
		}

		// 등급별 조정 데이터 저장
		const adjustedGradePayments = {};
		const grades = ['F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8'];

		for (const grade of grades) {
			if (adjustments[grade]) {
			// perInstallment는 서버에서 계산 (100원 단위 절삭)
			const totalAmount = adjustments[grade].totalAmount;
			const perInstallment = totalAmount ? Math.floor(totalAmount / 10 / 100) * 100 : null;

			adjustedGradePayments[grade] = {
				totalAmount: totalAmount,
				perInstallment: perInstallment,
				modifiedAt: new Date()
			};
			} else if (monthlyData.adjustedGradePayments?.[grade]) {
				// 기존 조정값 유지
				adjustedGradePayments[grade] = monthlyData.adjustedGradePayments[grade];
			} else {
				// 조정값 없음
				adjustedGradePayments[grade] = {
					totalAmount: null,
					perInstallment: null,
					modifiedAt: null
				};
			}
		}

		// MonthlyRegistrations 업데이트
		monthlyData.adjustedGradePayments = adjustedGradePayments;
		await monthlyData.save();

		console.log(`[등급별 지급액 조정] MonthlyRegistrations 업데이트 완료`);

		// 2. 해당 월의 모든 활성 지급 계획 업데이트
		const updatedPlans = [];

		// 자동 계산을 위한 등급별 지급액 계산 (자동 복귀 시 사용)
		const revenue = monthlyData.getEffectiveRevenue();
		const gradePayments = calculateGradePayments(revenue, monthlyData.gradeDistribution);

		for (const grade of grades) {
			// 해당 등급의 모든 활성 지급 계획 찾기
			const plans = await WeeklyPaymentPlans.find({
				revenueMonth: monthKey,
				baseGrade: grade,
				planStatus: { $in: ['active', 'pending'] }
			});

			if (plans.length === 0) {
				continue;
			}

			console.log(`[등급별 지급액 조정] ${grade} 등급 ${plans.length}개 계획 발견`);

			// 수동 조정값이 있으면 사용, 없으면 자동 계산
			let newBaseAmount = 0;
			let newInstallmentAmount = 0;

			if (adjustments[grade] && adjustments[grade].totalAmount) {
				// 수동 모드: 입력된 금액 사용
				newBaseAmount = adjustments[grade].totalAmount;
				newInstallmentAmount = Math.floor(adjustments[grade].totalAmount / 10 / 100) * 100;
				console.log(`[등급별 지급액 조정] ${grade} - 수동 모드: ${newInstallmentAmount}원/회`);
			} else {
				// 자동 모드: 매출 기준 재계산
				newBaseAmount = gradePayments[grade] || 0;
				newInstallmentAmount = Math.floor(newBaseAmount / 10 / 100) * 100;
				console.log(`[등급별 지급액 조정] ${grade} - 자동 모드: ${newInstallmentAmount}원/회 (매출 기준)`);
			}

			if (newInstallmentAmount === 0) {
				console.log(`[등급별 지급액 조정] ${grade} - 금액이 0이므로 스킵`);
				continue;
			}

			for (const plan of plans) {
				// 각 할부의 금액 업데이트
				const withholdingTax = Math.round(newInstallmentAmount * 0.033);
				const netAmount = newInstallmentAmount - withholdingTax;

				for (let i = 0; i < plan.installments.length; i++) {
					// 이미 지급된 것은 건드리지 않음
					if (plan.installments[i].status === 'pending') {
						plan.installments[i].baseAmount = newBaseAmount;
						plan.installments[i].installmentAmount = newInstallmentAmount;
						plan.installments[i].withholdingTax = withholdingTax;
						plan.installments[i].netAmount = netAmount;
					}
				}

				// 총액 재계산
				plan.totalAmount = plan.installments.reduce((sum, inst) => sum + inst.installmentAmount, 0);
				plan.totalTax = plan.installments.reduce((sum, inst) => sum + inst.withholdingTax, 0);
				plan.totalNet = plan.installments.reduce((sum, inst) => sum + inst.netAmount, 0);

				// 조정 기록
				plan.isAdjusted = true;
				plan.adjustedAt = new Date();
				plan.adjustedBy = locals.user?.id || 'system';

				await plan.save();
				updatedPlans.push({
					planId: plan._id,
					userId: plan.userId,
					userName: plan.userName,
					grade: grade,
					newAmount: newInstallmentAmount
				});
			}
		}

		// 등급별 지급액 계산 함수 (로컬 헬퍼)
		function calculateGradePayments(totalRevenue, gradeDistribution) {
			const rates = {
				F1: 0.24, F2: 0.19, F3: 0.14, F4: 0.09,
				F5: 0.05, F6: 0.03, F7: 0.02, F8: 0.01
			};

			const payments = {};
			let previousAmount = 0;
			const grades = ['F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8'];

			for (let i = 0; i < grades.length; i++) {
				const grade = grades[i];
				const nextGrade = grades[i + 1];
				const currentCount = gradeDistribution[grade] || 0;
				const nextCount = gradeDistribution[nextGrade] || 0;

				if (currentCount > 0) {
					const poolAmount = totalRevenue * rates[grade];
					const poolCount = currentCount + nextCount;
					if (poolCount > 0) {
						const additionalPerPerson = poolAmount / poolCount;
						payments[grade] = previousAmount + additionalPerPerson;
						previousAmount = payments[grade];
					} else {
						payments[grade] = previousAmount;
					}
				} else {
					payments[grade] = 0;
				}
			}

			return payments;
		}

		console.log(`[등급별 지급액 조정] 총 ${updatedPlans.length}개 지급 계획 업데이트 완료`);

		return json({
			success: true,
			message: '등급별 지급액이 성공적으로 조정되었습니다.',
			updatedPlans: updatedPlans.length,
			details: updatedPlans
		});

	} catch (error) {
		console.error('등급별 지급액 조정 오류:', error);
		return json({ error: '등급별 지급액 조정 중 오류가 발생했습니다.' }, { status: 500 });
	}
}