import { json } from '@sveltejs/kit';
import { db } from '$lib/server/db.js';
import User from '$lib/server/models/User.js';
import MonthlyRevenue from '$lib/server/models/MonthlyRevenue.js';
import WeeklyPayment from '$lib/server/models/WeeklyPayment.js';
import SimpleCache from '$lib/server/cache.js';
import { getWeekOfMonthByFriday } from '$lib/utils/fridayWeekCalculator.js';

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

	// 캐시 비활성화 (디버깅용)
	// const cacheKey = `admin_dashboard_stats`;
	// let stats = cache.get(cacheKey);

	// DB 쿼리 항상 실행
	// if (!stats) {
	{
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

		// 정확한 주차 계산 (일요일 시작, 월요일 기준)
		const currentDate = new Date();
		const weekInfo = getWeekOfMonthByFriday(currentDate);
		const year = weekInfo.year;
		const month = weekInfo.month;
		const weekOfMonth = weekInfo.week;

		console.log('=== 대시보드 주차 계산 ===');
		console.log('현재 날짜:', currentDate.toDateString());
		console.log('계산된 주차:', weekInfo);

		const [
			totalUsers,
			activeUsers,
			todayRegistrations,
			monthlyNewUsers,
			totalRevenueResult,
			weeklyPaymentData,
			gradeDistribution
		] = await Promise.all([
			User.countDocuments({ type: 'user' }), // 용역자만
			User.countDocuments({ type: 'user', status: 'active' }), // 활성 용역자만
			User.countDocuments({ type: 'user', createdAt: { $gte: today } }), // 오늘 신규 용역자
			// 이번 달 신규 가입자 수 조회 (용역자만)
			User.countDocuments({ type: 'user', createdAt: { $gte: firstDayOfMonth } }),
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

		// 이번 주 실제 지급액을 등급별로 집계
		const thisWeekPaymentsByGrade = await WeeklyPayment.aggregate([
			{
				$match: {
					year: year,
					month: month,
					week: weekOfMonth
				}
			},
			{
				$lookup: {
					from: 'users',
					localField: 'userId',
					foreignField: '_id',
					as: 'user'
				}
			},
			{
				$unwind: '$user'
			},
			{
				$group: {
					_id: '$user.grade',
					count: { $sum: 1 },
					totalAmount: { $sum: '$totalAmount' },
					avgAmount: { $avg: '$totalAmount' }
				}
			}
		]);

		// 등급별 지급액 맵
		const gradePayments = {
			F1: 0, F2: 0, F3: 0, F4: 0, F5: 0, F6: 0, F7: 0, F8: 0
		};

		console.log('=== WeeklyPayment 집계 결과 ===');
		console.log('조회 조건:', { year, month, week: weekOfMonth });
		console.log('집계 결과:', thisWeekPaymentsByGrade);

		thisWeekPaymentsByGrade.forEach(item => {
			if (item._id) {
				gradePayments[item._id] = Math.round(item.avgAmount || 0);
			}
		});

		console.log('최종 등급별 지급액:', gradePayments);

		// 이번 월 매출 (참고용)
		const monthlyRevenue = totalRevenueResult?.totalRevenue || (monthlyNewUsers * 1000000);

		stats = {
			totalUsers,
			activeUsers,
			todayRegistrations,
			monthlyNewUsers,
			monthlyRevenue,
			totalRevenue: totalRevenueResult[0]?.total || 0,
			// 등급별 정보 (이번 주 실제 지급액 기준)
			gradeInfo: {
				F1: { count: gradeCount.F1, ratio: 24, amount: gradePayments.F1 },
				F2: { count: gradeCount.F2, ratio: 19, amount: gradePayments.F2 },
				F3: { count: gradeCount.F3, ratio: 14, amount: gradePayments.F3 },
				F4: { count: gradeCount.F4, ratio: 9, amount: gradePayments.F4 },
				F5: { count: gradeCount.F5, ratio: 5, amount: gradePayments.F5 },
				F6: { count: gradeCount.F6, ratio: 3, amount: gradePayments.F6 },
				F7: { count: gradeCount.F7, ratio: 2, amount: gradePayments.F7 },
				F8: { count: gradeCount.F8, ratio: 1, amount: gradePayments.F8 }
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

		// 캐시 비활성화 (디버깅용)
		// cache.set(cacheKey, stats);
	}

	// 최근 가입 사용자 (페이지네이션 적용)
	const recentUsers = await User.find()
		.sort({ createdAt: -1 })
		.skip(skip)
		.limit(limit)
		.select('name loginId createdAt status')
		.lean(); // lean() 사용으로 성능 개선

	// 전체 용역자 수 (페이지네이션용)
	const totalCount = await User.countDocuments({ type: 'user' });

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