import { json } from '@sveltejs/kit';
import { db } from '$lib/server/db.js';
import { MonthlyRegistrations } from '$lib/server/models/MonthlyRegistrations.js';
import { WeeklyPaymentPlans } from '$lib/server/models/WeeklyPaymentPlans.js';

export async function POST({ request, locals }) {
	try {
		// 관리자 권한 확인
		if (!locals.user || locals.user.role !== 'admin') {
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
				adjustedGradePayments[grade] = {
					totalAmount: adjustments[grade].totalAmount,
					perInstallment: adjustments[grade].perInstallment,
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

		for (const grade of grades) {
			if (adjustments[grade] && adjustments[grade].perInstallment > 0) {
				// 해당 등급의 모든 활성 지급 계획 찾기
				const plans = await WeeklyPaymentPlans.find({
					revenueMonth: monthKey,
					baseGrade: grade,
					planStatus: { $in: ['active', 'pending'] }
				});

				console.log(`[등급별 지급액 조정] ${grade} 등급 ${plans.length}개 계획 발견`);

				for (const plan of plans) {
					// 각 할부의 금액 업데이트
					const newAmount = adjustments[grade].perInstallment;

					for (let i = 0; i < plan.installments.length; i++) {
						// 이미 지급된 것은 건드리지 않음
						if (plan.installments[i].status === 'pending') {
							plan.installments[i].installmentAmount = newAmount;
							plan.installments[i].taxAmount = Math.floor(newAmount * 0.033);
							plan.installments[i].netAmount = newAmount - Math.floor(newAmount * 0.033);
						}
					}

					// 총액 재계산
					plan.totalAmount = plan.installments.reduce((sum, inst) => sum + inst.installmentAmount, 0);
					plan.totalTax = plan.installments.reduce((sum, inst) => sum + inst.taxAmount, 0);
					plan.totalNet = plan.installments.reduce((sum, inst) => sum + inst.netAmount, 0);

					// 조정 기록
					plan.isAdjusted = true;
					plan.adjustedAt = new Date();
					plan.adjustedBy = locals.user.id;

					await plan.save();
					updatedPlans.push({
						planId: plan._id,
						userId: plan.userId,
						userName: plan.userName,
						grade: grade,
						newAmount: newAmount
					});
				}
			}
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