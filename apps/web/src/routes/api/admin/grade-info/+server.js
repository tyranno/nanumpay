import { json } from '@sveltejs/kit';
import { db } from '$lib/server/db.js';
import User from '$lib/server/models/User.js';
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

		// 이번 달의 첫 날
		const firstDayOfMonth = new Date(currentYear, currentMonth - 1, 1);

		// 병렬로 데이터 조회
		const [monthlyNewUsers, latestRevenue, gradeDistribution] = await Promise.all([
			// 이번 달 신규 가입자 수
			User.countDocuments({ createdAt: { $gte: firstDayOfMonth } }),

			// 가장 최근 매출 데이터 또는 현재 월 데이터
			MonthlyRevenue.findOne({
				year: currentYear,
				month: currentMonth
			}),

			// 등급별 사용자 수
			User.aggregate([
				{
					$group: {
						_id: '$grade',
						count: { $sum: 1 }
					}
				}
			])
		]);

		// 등급별 인원수 정리
		const gradeCount = {
			F1: 0, F2: 0, F3: 0, F4: 0, F5: 0, F6: 0, F7: 0, F8: 0
		};

		gradeDistribution.forEach(item => {
			if (item._id) {
				gradeCount[item._id] = item.count;
			}
		});

		// 매출 계산 (MonthlyRevenue가 없으면 실시간 계산 - 신규 가입자 × 100만원)
		const monthlyRevenue = latestRevenue?.totalRevenue || (monthlyNewUsers * 1000000);
		const revenuePerPayment = monthlyRevenue / 10;

		// 등급별 비율
		const gradeRatios = {
			F1: 0.24, F2: 0.19, F3: 0.14, F4: 0.09,
			F5: 0.05, F6: 0.03, F7: 0.02, F8: 0.01
		};

		// 등급별 지급액 계산 (누적 방식)
		const gradePayments = {};

		// F1 지급액 (회당)
		const f1Total = revenuePerPayment * gradeRatios.F1;
		const f1Divisor = gradeCount.F1 + gradeCount.F2;
		gradePayments.F1 = f1Divisor > 0 ? Math.floor(f1Total / f1Divisor / 100) * 100 : 0;

		// F2 지급액 (회당)
		const f2Total = revenuePerPayment * gradeRatios.F2;
		const f2Divisor = gradeCount.F2 + gradeCount.F3;
		const f2Amount = f2Divisor > 0 ? (f2Total / f2Divisor) + gradePayments.F1 : 0;
		gradePayments.F2 = Math.floor(f2Amount / 100) * 100;

		// F3 지급액 (회당)
		const f3Total = revenuePerPayment * gradeRatios.F3;
		const f3Divisor = gradeCount.F3 + gradeCount.F4;
		const f3Amount = f3Divisor > 0 ? (f3Total / f3Divisor) + gradePayments.F2 : 0;
		gradePayments.F3 = Math.floor(f3Amount / 100) * 100;

		// F4 지급액 (회당)
		const f4Total = revenuePerPayment * gradeRatios.F4;
		const f4Divisor = gradeCount.F4 + gradeCount.F5;
		const f4Amount = f4Divisor > 0 ? (f4Total / f4Divisor) + gradePayments.F3 : 0;
		gradePayments.F4 = Math.floor(f4Amount / 100) * 100;

		// F5 지급액 (회당)
		const f5Total = revenuePerPayment * gradeRatios.F5;
		const f5Divisor = gradeCount.F5 + gradeCount.F6;
		const f5Amount = f5Divisor > 0 ? (f5Total / f5Divisor) + gradePayments.F4 : 0;
		gradePayments.F5 = Math.floor(f5Amount / 100) * 100;

		// F6 지급액 (회당)
		const f6Total = revenuePerPayment * gradeRatios.F6;
		const f6Divisor = gradeCount.F6 + gradeCount.F7;
		const f6Amount = f6Divisor > 0 ? (f6Total / f6Divisor) + gradePayments.F5 : 0;
		gradePayments.F6 = Math.floor(f6Amount / 100) * 100;

		// F7 지급액 (회당)
		const f7Total = revenuePerPayment * gradeRatios.F7;
		const f7Divisor = gradeCount.F7 + gradeCount.F8;
		const f7Amount = f7Divisor > 0 ? (f7Total / f7Divisor) + gradePayments.F6 : 0;
		gradePayments.F7 = Math.floor(f7Amount / 100) * 100;

		// F8 지급액 (회당)
		const f8Total = revenuePerPayment * gradeRatios.F8;
		const f8Divisor = gradeCount.F8;
		const f8Amount = f8Divisor > 0 ? (f8Total / f8Divisor) + gradePayments.F7 : 0;
		gradePayments.F8 = Math.floor(f8Amount / 100) * 100;

		// 산출식 생성
		const gradeInfo = {};
		Object.keys(gradeCount).forEach(grade => {
			const gradeIndex = parseInt(grade.substring(1));
			const nextGrade = `F${gradeIndex + 1}`;
			const currentCount = gradeCount[grade];

			let formula = '';
			if (gradeIndex === 1) {
				formula = `총매출×${(gradeRatios[grade] * 100).toFixed(0)}%÷(${currentCount}+${gradeCount.F2})`;
			} else if (gradeIndex === 8) {
				formula = `총매출×${(gradeRatios[grade] * 100).toFixed(0)}%÷${currentCount}`;
			} else {
				const nextCount = gradeCount[nextGrade] || 0;
				formula = `총매출×${(gradeRatios[grade] * 100).toFixed(0)}%÷(${currentCount}+${nextCount})`;
			}

			gradeInfo[grade] = {
				count: currentCount,
				ratio: (gradeRatios[grade] * 100).toFixed(0),
				amount: gradePayments[grade], // 이미 100원 단위로 절삭됨
				formula: formula
			};
		});

		return json({
			success: true,
			currentMonth,
			currentYear,
			monthlyNewUsers,
			monthlyRevenue,
			gradeInfo
		});
	} catch (error) {
		console.error('Error loading grade info:', error);
		return json({
			success: false,
			error: '등급별 지급 정보 조회 중 오류가 발생했습니다.'
		}, { status: 500 });
	}
}