import { json } from '@sveltejs/kit';
import { db } from '$lib/server/db.js';
import User from '$lib/server/models/User.js';
import MonthlyRevenue from '$lib/server/models/MonthlyRevenue.js';
import WeeklyPayment from '$lib/server/models/WeeklyPayment.js';
import SimpleCache from '$lib/server/cache.js';

// 캐시 설정 (TTL: 60초)
const cache = new SimpleCache(60000);

export async function GET({ locals, url }) {
	if (!locals.user || locals.user.type !== 'admin') {
		return json({ message: '권한이 없습니다.' }, { status: 401 });
	}

	await db();

	// 페이지네이션 파라미터
	const page = parseInt(url.searchParams.get('page') || '1');
	const limit = parseInt(url.searchParams.get('limit') || '10');
	const skip = (page - 1) * limit;

	// 캐시 키
	const cacheKey = `admin_dashboard_stats`;
	let stats = cache.get(cacheKey);

	// 캐시가 없을 때만 DB 쿼리
	if (!stats) {
		// 통계 데이터를 병렬로 조회
		const today = new Date();
		today.setHours(0, 0, 0, 0);

		// 이번 달의 첫 날 계산
		const currentMonth = new Date();
		const firstDayOfMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1);

		// 가장 최근 매출이 있는 월을 찾기
		const latestRevenue = await MonthlyRevenue.findOne({ totalRevenue: { $gt: 0 } })
			.sort({ year: -1, month: -1 })
			.limit(1);

		// 이번 주 계산 (주의 시작을 월요일로)
		const currentDate = new Date();
		const dayOfWeek = currentDate.getDay();
		const diff = currentDate.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1);
		const weekStart = new Date(currentDate.setDate(diff));
		weekStart.setHours(0, 0, 0, 0);

		// 현재 연도, 월, 주차 계산
		const year = weekStart.getFullYear();
		const month = weekStart.getMonth() + 1;
		const weekOfMonth = Math.ceil(weekStart.getDate() / 7);

		const [
			totalUsers,
			activeUsers,
			todayRegistrations,
			monthlyNewUsers,
			totalRevenueResult,
			weeklyPaymentData,
			gradeDistribution
		] = await Promise.all([
			User.countDocuments(),
			User.countDocuments({ status: 'active' }),
			User.countDocuments({ createdAt: { $gte: today } }),
			// 이번 달 신규 가입자 수 조회
			User.countDocuments({ createdAt: { $gte: firstDayOfMonth } }),
			// 가장 최근 매출이 있는 월의 데이터 사용 (없으면 현재 월)
			latestRevenue || MonthlyRevenue.findOne({
				year: currentDate.getFullYear(),
				month: currentDate.getMonth() + 1
			}),
			// 이번 주 지급액 조회
			WeeklyPayment.aggregate([
				{
					$match: {
						year: year,
						month: month,
						week: weekOfMonth
					}
				},
				{
					$group: {
						_id: null,
						totalAmount: { $sum: '$totalAmount' },
						totalTax: { $sum: '$taxAmount' },
						totalNet: { $sum: '$netAmount' },
						userCount: { $sum: 1 }
					}
				}
			]),
			// 등급별 사용자 수 조회
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

		// MonthlyRevenue에서 가져온 매출 또는 계산 (신규 가입자 × 100만원)
		const monthlyRevenue = totalRevenueResult?.totalRevenue || (monthlyNewUsers * 1000000);
		// 1회 분할 금액 (총매출을 10으로 나눔)
		const revenuePerPayment = monthlyRevenue / 10;

		// 등급별 비율
		const gradeRatios = {
			F1: 0.24, F2: 0.19, F3: 0.14, F4: 0.09,
			F5: 0.05, F6: 0.03, F7: 0.02, F8: 0.01
		};

		// 등급별 지급액 계산 (work_plan.txt의 누적 방식) - 회당 금액 기준
		const gradePayments = {};

		// F1 지급액 (회당)
		const f1Total = revenuePerPayment * gradeRatios.F1;
		const f1Divisor = gradeCount.F1 + gradeCount.F2;
		gradePayments.F1 = gradeCount.F1 > 0 && f1Divisor > 0 ? f1Total / f1Divisor : 0;

		// F2 지급액 (회당)
		const f2Total = revenuePerPayment * gradeRatios.F2;
		const f2Divisor = gradeCount.F2 + gradeCount.F3;
		gradePayments.F2 = gradeCount.F2 > 0 && f2Divisor > 0 ? (f2Total / f2Divisor) + gradePayments.F1 : 0;

		// F3 지급액 (회당)
		const f3Total = revenuePerPayment * gradeRatios.F3;
		const f3Divisor = gradeCount.F3 + gradeCount.F4;
		gradePayments.F3 = gradeCount.F3 > 0 && f3Divisor > 0 ? (f3Total / f3Divisor) + gradePayments.F2 : 0;

		// F4 지급액 (회당)
		const f4Total = revenuePerPayment * gradeRatios.F4;
		const f4Divisor = gradeCount.F4 + gradeCount.F5;
		gradePayments.F4 = gradeCount.F4 > 0 && f4Divisor > 0 ? (f4Total / f4Divisor) + gradePayments.F3 : 0;

		// F5 지급액 (회당)
		const f5Total = revenuePerPayment * gradeRatios.F5;
		const f5Divisor = gradeCount.F5 + gradeCount.F6;
		gradePayments.F5 = gradeCount.F5 > 0 && f5Divisor > 0 ? (f5Total / f5Divisor) + gradePayments.F4 : 0;

		// F6 지급액 (회당)
		const f6Total = revenuePerPayment * gradeRatios.F6;
		const f6Divisor = gradeCount.F6 + gradeCount.F7;
		gradePayments.F6 = gradeCount.F6 > 0 && f6Divisor > 0 ? (f6Total / f6Divisor) + gradePayments.F5 : 0;

		// F7 지급액 (회당)
		const f7Total = revenuePerPayment * gradeRatios.F7;
		const f7Divisor = gradeCount.F7 + gradeCount.F8;
		gradePayments.F7 = gradeCount.F7 > 0 && f7Divisor > 0 ? (f7Total / f7Divisor) + gradePayments.F6 : 0;

		// F8 지급액 (회당)
		const f8Total = revenuePerPayment * gradeRatios.F8;
		const f8Divisor = gradeCount.F8;
		gradePayments.F8 = gradeCount.F8 > 0 && f8Divisor > 0 ? (f8Total / f8Divisor) + gradePayments.F7 : 0;

		stats = {
			totalUsers,
			activeUsers,
			todayRegistrations,
			monthlyNewUsers,
			monthlyRevenue,
			totalRevenue: totalRevenueResult[0]?.total || 0,
			// 등급별 정보
			gradeInfo: {
				F1: { count: gradeCount.F1, ratio: 24, amount: Math.round(gradePayments.F1) },
				F2: { count: gradeCount.F2, ratio: 19, amount: Math.round(gradePayments.F2) },
				F3: { count: gradeCount.F3, ratio: 14, amount: Math.round(gradePayments.F3) },
				F4: { count: gradeCount.F4, ratio: 9, amount: Math.round(gradePayments.F4) },
				F5: { count: gradeCount.F5, ratio: 5, amount: Math.round(gradePayments.F5) },
				F6: { count: gradeCount.F6, ratio: 3, amount: Math.round(gradePayments.F6) },
				F7: { count: gradeCount.F7, ratio: 2, amount: Math.round(gradePayments.F7) },
				F8: { count: gradeCount.F8, ratio: 1, amount: Math.round(gradePayments.F8) }
			},
			// 이번 주 지급액 정보 추가
			weeklyPayment: {
				totalAmount: weeklyPaymentData[0]?.totalAmount || 0,
				totalTax: weeklyPaymentData[0]?.totalTax || 0,
				totalNet: weeklyPaymentData[0]?.totalNet || 0,
				userCount: weeklyPaymentData[0]?.userCount || 0,
				period: `${year}년 ${month}월 ${weekOfMonth}주차`
			},
			currentMonth: month,
			currentYear: year
		};

		// 캐시에 저장
		cache.set(cacheKey, stats);
	}

	// 최근 가입 사용자 (페이지네이션 적용)
	const recentUsers = await User.find()
		.sort({ createdAt: -1 })
		.skip(skip)
		.limit(limit)
		.select('name loginId createdAt status')
		.lean(); // lean() 사용으로 성능 개선

	// 전체 사용자 수 (페이지네이션용)
	const totalCount = await User.countDocuments();

	return json({
		stats,
		recentUsers,
		pagination: {
			page,
			limit,
			total: totalCount,
			totalPages: Math.ceil(totalCount / limit)
		}
	});
}