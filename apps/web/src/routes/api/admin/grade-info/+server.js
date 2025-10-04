import { json } from '@sveltejs/kit';
import { db } from '$lib/server/db.js';
import User from '$lib/server/models/User.js';
import MonthlyRevenue from '$lib/server/models/MonthlyRevenue.js';

export async function GET({ locals, url }) {
	if (!locals.user || locals.user.type !== 'admin') {
		return json({ message: '권한이 없습니다.' }, { status: 401 });
	}

	await db();

	try {
		const mode = url.searchParams.get('mode') || 'single';
		
		if (mode === 'range') {
			return await handleRangeQuery(url);
		} else {
			return await handleSingleQuery(url);
		}
	} catch (error) {
		console.error('Error loading grade info:', error);
		return json({
			success: false,
			error: '등급별 지급 정보 조회 중 오류가 발생했습니다.'
		}, { status: 500 });
	}
}

async function handleSingleQuery(url) {
	const year = parseInt(url.searchParams.get('year')) || new Date().getFullYear();
	const month = parseInt(url.searchParams.get('month')) || (new Date().getMonth() + 1);

	// 해당 월의 첫 날과 마지막 날
	const firstDayOfMonth = new Date(year, month - 1, 1);
	const lastDayOfMonth = new Date(year, month, 0, 23, 59, 59, 999);

	// 병렬로 데이터 조회
	const [monthlyNewUsers, latestRevenue, gradeDistribution, eligibleUsers] = await Promise.all([
		// 해당 월 신규 가입자 수
		User.countDocuments({ 
			createdAt: { 
				$gte: firstDayOfMonth,
				$lte: lastDayOfMonth
			} 
		}),

		// 해당 월 매출 데이터
		MonthlyRevenue.findOne({
			year: year,
			month: month
		}),

		// 등급별 전체 용역자 수 (Admin 제외)
		User.aggregate([
			{ $match: { type: 'user' } },
			{
				$group: {
					_id: '$grade',
					count: { $sum: 1 }
				}
			}
		]),

		// 지급 대상 용역자 수 (등급별)
		calculateEligibleUsers(year, month)
	]);

	// 등급별 전체 인원수
	const totalGradeCount = {
		F1: 0, F2: 0, F3: 0, F4: 0, F5: 0, F6: 0, F7: 0, F8: 0
	};

	gradeDistribution.forEach(item => {
		if (item._id) {
			totalGradeCount[item._id] = item.count;
		}
	});

	// 등급별 지급 대상 인원수
	const eligibleGradeCount = {
		F1: 0, F2: 0, F3: 0, F4: 0, F5: 0, F6: 0, F7: 0, F8: 0
	};

	eligibleUsers.forEach(item => {
		if (item._id) {
			eligibleGradeCount[item._id] = item.count;
		}
	});

	// 매출 계산
	const monthlyRevenue = latestRevenue?.totalRevenue || (monthlyNewUsers * 1000000);
	const revenuePerPayment = monthlyRevenue / 10;

	// 등급별 비율
	const gradeRatios = {
		F1: 0.24, F2: 0.19, F3: 0.14, F4: 0.09,
		F5: 0.05, F6: 0.03, F7: 0.02, F8: 0.01
	};

	// 등급별 지급액 계산 (지급 대상 인원 기준)
	const gradePayments = {};

	// F1 지급액 (회당)
	const f1Total = revenuePerPayment * gradeRatios.F1;
	const f1Divisor = eligibleGradeCount.F1 + eligibleGradeCount.F2;
	gradePayments.F1 = f1Divisor > 0 ? Math.floor(f1Total / f1Divisor / 100) * 100 : 0;

	// F2 지급액 (회당)
	const f2Total = revenuePerPayment * gradeRatios.F2;
	const f2Divisor = eligibleGradeCount.F2 + eligibleGradeCount.F3;
	const f2Amount = f2Divisor > 0 ? (f2Total / f2Divisor) + gradePayments.F1 : 0;
	gradePayments.F2 = Math.floor(f2Amount / 100) * 100;

	// F3 지급액 (회당)
	const f3Total = revenuePerPayment * gradeRatios.F3;
	const f3Divisor = eligibleGradeCount.F3 + eligibleGradeCount.F4;
	const f3Amount = f3Divisor > 0 ? (f3Total / f3Divisor) + gradePayments.F2 : 0;
	gradePayments.F3 = Math.floor(f3Amount / 100) * 100;

	// F4 지급액 (회당)
	const f4Total = revenuePerPayment * gradeRatios.F4;
	const f4Divisor = eligibleGradeCount.F4 + eligibleGradeCount.F5;
	const f4Amount = f4Divisor > 0 ? (f4Total / f4Divisor) + gradePayments.F3 : 0;
	gradePayments.F4 = Math.floor(f4Amount / 100) * 100;

	// F5 지급액 (회당)
	const f5Total = revenuePerPayment * gradeRatios.F5;
	const f5Divisor = eligibleGradeCount.F5 + eligibleGradeCount.F6;
	const f5Amount = f5Divisor > 0 ? (f5Total / f5Divisor) + gradePayments.F4 : 0;
	gradePayments.F5 = Math.floor(f5Amount / 100) * 100;

	// F6 지급액 (회당)
	const f6Total = revenuePerPayment * gradeRatios.F6;
	const f6Divisor = eligibleGradeCount.F6 + eligibleGradeCount.F7;
	const f6Amount = f6Divisor > 0 ? (f6Total / f6Divisor) + gradePayments.F5 : 0;
	gradePayments.F6 = Math.floor(f6Amount / 100) * 100;

	// F7 지급액 (회당)
	const f7Total = revenuePerPayment * gradeRatios.F7;
	const f7Divisor = eligibleGradeCount.F7 + eligibleGradeCount.F8;
	const f7Amount = f7Divisor > 0 ? (f7Total / f7Divisor) + gradePayments.F6 : 0;
	gradePayments.F7 = Math.floor(f7Amount / 100) * 100;

	// F8 지급액 (회당)
	const f8Total = revenuePerPayment * gradeRatios.F8;
	const f8Divisor = eligibleGradeCount.F8;
	const f8Amount = f8Divisor > 0 ? (f8Total / f8Divisor) + gradePayments.F7 : 0;
	gradePayments.F8 = Math.floor(f8Amount / 100) * 100;

	// 산출식 생성
	const gradeInfo = {};
	Object.keys(totalGradeCount).forEach(grade => {
		const gradeIndex = parseInt(grade.substring(1));
		const nextGrade = `F${gradeIndex + 1}`;
		const eligibleCount = eligibleGradeCount[grade];

		let formula = '';
		if (gradeIndex === 1) {
			formula = `총매출×${(gradeRatios[grade] * 100).toFixed(0)}%÷(${eligibleCount}+${eligibleGradeCount.F2})`;
		} else if (gradeIndex === 8) {
			formula = `총매출×${(gradeRatios[grade] * 100).toFixed(0)}%÷${eligibleCount}`;
		} else {
			const nextCount = eligibleGradeCount[nextGrade] || 0;
			formula = `총매출×${(gradeRatios[grade] * 100).toFixed(0)}%÷(${eligibleCount}+${nextCount})`;
		}

		gradeInfo[grade] = {
			totalCount: totalGradeCount[grade],
			eligibleCount: eligibleGradeCount[grade],
			ratio: (gradeRatios[grade] * 100).toFixed(0),
			amount: gradePayments[grade],
			formula: formula
		};
	});

	return json({
		success: true,
		currentMonth: month,
		currentYear: year,
		monthlyNewUsers,
		monthlyRevenue,
		gradeInfo
	});
}

async function handleRangeQuery(url) {
	const startYear = parseInt(url.searchParams.get('startYear'));
	const startMonth = parseInt(url.searchParams.get('startMonth'));
	const endYear = parseInt(url.searchParams.get('endYear'));
	const endMonth = parseInt(url.searchParams.get('endMonth'));

	const months = [];
	let currentYear = startYear;
	let currentMonth = startMonth;

	// 기간 내 모든 월 데이터 수집
	while (currentYear < endYear || (currentYear === endYear && currentMonth <= endMonth)) {
		const monthData = await getSingleMonthData(currentYear, currentMonth);
		months.push(monthData);

		currentMonth++;
		if (currentMonth > 12) {
			currentMonth = 1;
			currentYear++;
		}
	}

	return json({
		success: true,
		months
	});
}

async function getSingleMonthData(year, month) {
	const firstDayOfMonth = new Date(year, month - 1, 1);
	const lastDayOfMonth = new Date(year, month, 0, 23, 59, 59, 999);

	const [monthlyNewUsers, latestRevenue, gradeDistribution, eligibleUsers] = await Promise.all([
		User.countDocuments({ 
			createdAt: { 
				$gte: firstDayOfMonth,
				$lte: lastDayOfMonth
			} 
		}),
		MonthlyRevenue.findOne({ year, month }),
		User.aggregate([
			{ $match: { type: 'user' } },
			{ $group: { _id: '$grade', count: { $sum: 1 } } }
		]),
		calculateEligibleUsers(year, month)
	]);

	const totalGradeCount = {
		F1: 0, F2: 0, F3: 0, F4: 0, F5: 0, F6: 0, F7: 0, F8: 0
	};
	gradeDistribution.forEach(item => {
		if (item._id) totalGradeCount[item._id] = item.count;
	});

	const eligibleGradeCount = {
		F1: 0, F2: 0, F3: 0, F4: 0, F5: 0, F6: 0, F7: 0, F8: 0
	};
	eligibleUsers.forEach(item => {
		if (item._id) eligibleGradeCount[item._id] = item.count;
	});

	const monthlyRevenue = latestRevenue?.totalRevenue || (monthlyNewUsers * 1000000);
	const revenuePerPayment = monthlyRevenue / 10;

	const gradeRatios = {
		F1: 0.24, F2: 0.19, F3: 0.14, F4: 0.09,
		F5: 0.05, F6: 0.03, F7: 0.02, F8: 0.01
	};

	const gradePayments = calculateGradePayments(revenuePerPayment, gradeRatios, eligibleGradeCount);

	const gradeInfo = {};
	Object.keys(totalGradeCount).forEach(grade => {
		gradeInfo[grade] = {
			totalCount: totalGradeCount[grade],
			eligibleCount: eligibleGradeCount[grade],
			amount: gradePayments[grade]
		};
	});

	return {
		year,
		month,
		totalRevenue: monthlyRevenue,
		newUsers: monthlyNewUsers,
		gradeInfo
	};
}

function calculateGradePayments(revenuePerPayment, gradeRatios, eligibleGradeCount) {
	const payments = {};

	const f1Total = revenuePerPayment * gradeRatios.F1;
	const f1Divisor = eligibleGradeCount.F1 + eligibleGradeCount.F2;
	payments.F1 = f1Divisor > 0 ? Math.floor(f1Total / f1Divisor / 100) * 100 : 0;

	const f2Total = revenuePerPayment * gradeRatios.F2;
	const f2Divisor = eligibleGradeCount.F2 + eligibleGradeCount.F3;
	payments.F2 = f2Divisor > 0 ? Math.floor(((f2Total / f2Divisor) + payments.F1) / 100) * 100 : 0;

	const f3Total = revenuePerPayment * gradeRatios.F3;
	const f3Divisor = eligibleGradeCount.F3 + eligibleGradeCount.F4;
	payments.F3 = f3Divisor > 0 ? Math.floor(((f3Total / f3Divisor) + payments.F2) / 100) * 100 : 0;

	const f4Total = revenuePerPayment * gradeRatios.F4;
	const f4Divisor = eligibleGradeCount.F4 + eligibleGradeCount.F5;
	payments.F4 = f4Divisor > 0 ? Math.floor(((f4Total / f4Divisor) + payments.F3) / 100) * 100 : 0;

	const f5Total = revenuePerPayment * gradeRatios.F5;
	const f5Divisor = eligibleGradeCount.F5 + eligibleGradeCount.F6;
	payments.F5 = f5Divisor > 0 ? Math.floor(((f5Total / f5Divisor) + payments.F4) / 100) * 100 : 0;

	const f6Total = revenuePerPayment * gradeRatios.F6;
	const f6Divisor = eligibleGradeCount.F6 + eligibleGradeCount.F7;
	payments.F6 = f6Divisor > 0 ? Math.floor(((f6Total / f6Divisor) + payments.F5) / 100) * 100 : 0;

	const f7Total = revenuePerPayment * gradeRatios.F7;
	const f7Divisor = eligibleGradeCount.F7 + eligibleGradeCount.F8;
	payments.F7 = f7Divisor > 0 ? Math.floor(((f7Total / f7Divisor) + payments.F6) / 100) * 100 : 0;

	const f8Total = revenuePerPayment * gradeRatios.F8;
	const f8Divisor = eligibleGradeCount.F8;
	payments.F8 = f8Divisor > 0 ? Math.floor(((f8Total / f8Divisor) + payments.F7) / 100) * 100 : 0;

	return payments;
}

async function calculateEligibleUsers(year, month) {
	// 지급 제한 조건에 따라 지급 대상 인원 계산
	// 1. F1, F2: 연속 4주 이상 같은 등급 유지 시 제외
	// 2. F3 이상: 보험 미유지 시 제외
	
	const users = await User.find({ type: 'user' }).lean();
	
	const eligibleByGrade = await User.aggregate([
		{
			$match: {
				type: 'user',
				$or: [
					// F1, F2: 연속 4주 미만 유지
					{ 
						grade: { $in: ['F1', 'F2'] },
						$or: [
							{ consecutiveGradeWeeks: { $lt: 4 } },
							{ consecutiveGradeWeeks: { $exists: false } }
						]
					},
					// F3 이상: 보험 유지 조건 충족
					{
						grade: { $in: ['F3', 'F4', 'F5', 'F6', 'F7', 'F8'] },
						insuranceActive: true,
						$or: [
							{ grade: { $in: ['F3', 'F4'] }, insuranceAmount: { $gte: 50000 } },
							{ grade: { $in: ['F5', 'F6'] }, insuranceAmount: { $gte: 70000 } },
							{ grade: { $in: ['F7', 'F8'] }, insuranceAmount: { $gte: 100000 } }
						]
					}
				]
			}
		},
		{
			$group: {
				_id: '$grade',
				count: { $sum: 1 }
			}
		}
	]);

	return eligibleByGrade;
}