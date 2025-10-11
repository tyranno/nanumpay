import { json } from '@sveltejs/kit';
import { connectDB } from '$lib/server/db.js';
import WeeklyPaymentPlans from '$lib/server/models/WeeklyPaymentPlans.js';
import WeeklyPaymentSummary from '$lib/server/models/WeeklyPaymentSummary.js';
import User from '$lib/server/models/User.js';
import { getAllWeeksInPeriod, getFridaysInMonth } from '$lib/utils/fridayWeekCalculator.js';

/**
 * 용역비 지급명부 API v5.0
 * WeeklyPaymentPlans 기반으로 실제 지급 계획 데이터 조회
 * WeeklyPaymentSummary로 전체 총계 빠른 조회
 */
export async function GET({ url }) {
	try {
		await connectDB();

		// 파라미터 파싱
		const year = parseInt(url.searchParams.get('year')) || new Date().getFullYear();
		const month = parseInt(url.searchParams.get('month'));
		const week = parseInt(url.searchParams.get('week'));

		// 기간 조회 파라미터
		const startYear = parseInt(url.searchParams.get('startYear'));
		const startMonth = parseInt(url.searchParams.get('startMonth'));
		const endYear = parseInt(url.searchParams.get('endYear'));
		const endMonth = parseInt(url.searchParams.get('endMonth'));

		// 페이지네이션
		const page = parseInt(url.searchParams.get('page')) || 1;
		const limit = parseInt(url.searchParams.get('limit')) || 20;
		const search = url.searchParams.get('search') || '';
		const searchCategory = url.searchParams.get('searchCategory') || 'name';

		// === 단일 주차 조회 ===
		if (month && week) {
			return await getSingleWeekPaymentsV5(year, month, week, page, limit, search, searchCategory);
		}

		// === 기간 조회 ===
		if (startYear && startMonth && endYear && endMonth) {
			return await getRangePaymentsV5(startYear, startMonth, endYear, endMonth, page, limit, search, searchCategory);
		}

		// === 기본: 현재 월의 모든 주차 조회 ===
		return await getDefaultPaymentsV5(year, month || new Date().getMonth() + 1, page, limit, search, searchCategory);

	} catch (error) {
		console.error('[API] Weekly payment error:', error);
		return json({
			success: false,
			error: error.message
		}, { status: 500 });
	}
}

/**
 * 단일 주차 지급 데이터 조회 (v5.0)
 */
async function getSingleWeekPaymentsV5(year, month, week, page, limit, search, searchCategory) {
	console.log(`[API v5.0] 단일 주차 조회: ${year}년 ${month}월 ${week}주차`);

	// 1. 해당 주차의 날짜 계산
	const fridays = getFridaysInMonth(year, month);
	const targetWeek = fridays.find(w => w.weekNumber === week);

	if (!targetWeek) {
		return json({
			success: false,
			error: '유효하지 않은 주차입니다.'
		}, { status: 400 });
	}

	const weekDate = targetWeek.friday;
	const weekNumber = WeeklyPaymentPlans.getISOWeek(weekDate);

	// 2. 주차별 총계 조회 (전체 총액 - 페이지 무관)
	const summary = await WeeklyPaymentSummary.findOne({ weekNumber });

	const grandTotal = summary ? {
		totalAmount: summary.totalAmount || 0,
		totalTax: summary.totalTax || 0,
		totalNet: summary.totalNet || 0
	} : {
		totalAmount: 0,
		totalTax: 0,
		totalNet: 0
	};

	// 3. 검색 조건 구성
	const searchFilter = buildSearchFilter(search, searchCategory);

	// 4. Aggregation Pipeline for 페이지네이션
	const pipeline = [
		// 해당 주차의 할부가 있는 계획만 필터
		{
			$match: {
				'installments': {
					$elemMatch: {
						weekNumber: weekNumber,
						status: { $in: ['paid', 'pending'] }
					}
				}
			}
		},
		// 해당 주차의 할부만 필터링
		{
			$unwind: '$installments'
		},
		{
			$match: {
				'installments.weekNumber': weekNumber,
				'installments.status': { $in: ['paid', 'pending'] }
			}
		},
		// 검색 조건 적용
		...(searchFilter.userName ? [{ $match: { userName: searchFilter.userName } }] : []),
		// 사용자별 그룹화
		{
			$group: {
				_id: '$userId',
				userName: { $first: '$userName' },
				baseGrade: { $first: '$baseGrade' },
				payments: {
					$push: {
						planType: '$planType',
						revenueMonth: '$installments.revenueMonth',
						week: '$installments.week',
						amount: '$installments.installmentAmount',
						tax: '$installments.withholdingTax',
						net: '$installments.netAmount',
						status: '$installments.status'
					}
				},
				totalAmount: { $sum: '$installments.installmentAmount' },
				totalTax: { $sum: '$installments.withholdingTax' },
				totalNet: { $sum: '$installments.netAmount' }
			}
		},
		{
			$lookup: {
				from: 'users',
				localField: '_id',
				foreignField: 'loginId',
				as: 'userInfo'
			}
		},
		{
			$addFields: {
				registrationDate: { $arrayElemAt: ['$userInfo.registrationDate', 0] },
				createdAt: { $arrayElemAt: ['$userInfo.createdAt', 0] },
				userObjectId: { $arrayElemAt: ['$userInfo._id', 0] }
			}
		},
		{
			$sort: { registrationDate: 1, createdAt: 1, userObjectId: 1 }
		}
	];

	// 전체 카운트
	const countPipeline = [...pipeline, { $count: 'total' }];
	const countResult = await WeeklyPaymentPlans.aggregate(countPipeline);
	const totalCount = countResult[0]?.total || 0;
	const totalPages = Math.ceil(totalCount / limit);

	// 페이지네이션 적용
	const skip = (page - 1) * limit;
	const paginatedPipeline = [
		...pipeline,
		{ $skip: skip },
		{ $limit: limit }
	];

	const userPayments = await WeeklyPaymentPlans.aggregate(paginatedPipeline);

	// 5. 사용자 상세 정보 추가
	const userIds = userPayments.map(p => p._id);
	const users = await User.find({ loginId: { $in: userIds } }).lean();
	const userMap = new Map(users.map(u => [u.loginId, u]));

	const enrichedPayments = userPayments.map((payment, idx) => {
		const user = userMap.get(payment._id) || {};
		return {
			no: (page - 1) * limit + idx + 1,
			userId: payment._id,
			userName: payment.userName,
			planner: user.planner || '',
			bank: user.bank || '',
			accountNumber: user.accountNumber || '',
			grade: user.grade || 'F1', // User 테이블의 최신 등급 사용
			actualAmount: payment.totalAmount || 0,
			taxAmount: payment.totalTax || 0,
			netAmount: payment.totalNet || 0,
			installments: payment.payments
		};
	});

	// 6. 현재 페이지 합계
	const pageTotal = {
		amount: enrichedPayments.reduce((sum, p) => sum + p.actualAmount, 0),
		tax: enrichedPayments.reduce((sum, p) => sum + p.taxAmount, 0),
		net: enrichedPayments.reduce((sum, p) => sum + p.netAmount, 0)
	};

	return json({
		success: true,
		data: {
			// 전체 총계 (페이지 무관)
			grandTotal,
			// 페이지네이션 정보
			pagination: {
				page,
				totalPages,
				totalItems: totalCount,
				itemsPerPage: limit
			},
			// 현재 페이지 데이터
			payments: enrichedPayments,
			pageTotal,
			// 메타 정보
			year,
			monthNumber: month,
			weekNumber: week,
			week: `${month}월 ${week}주`
		}
	});
}

/**
 * 기간 조회 (v5.0)
 */
async function getRangePaymentsV5(startYear, startMonth, endYear, endMonth, page, limit, search, searchCategory) {
	console.log(`[API v5.0] 기간 조회: ${startYear}/${startMonth} ~ ${endYear}/${endMonth}`);

	// 1. 기간 내 모든 금요일 날짜 수집
	const allFridays = [];
	let currentYear = startYear;
	let currentMonth = startMonth;

	while (currentYear < endYear || (currentYear === endYear && currentMonth <= endMonth)) {
		const fridays = getFridaysInMonth(currentYear, currentMonth);
		allFridays.push(...fridays);

		currentMonth++;
		if (currentMonth > 12) {
			currentMonth = 1;
			currentYear++;
		}
	}

	// 2. 검색 조건 구성
	const searchFilter = buildSearchFilter(search, searchCategory);

	// 3. 모든 용역자 조회 (관리자 제외, 등록일자 순)
	let allUsers = await User.find({ isAdmin: { $ne: true } }).sort({ registrationDate: 1, createdAt: 1 }).lean();
	console.log(`[API 기간조회] 전체 용역자 ${allUsers.length}명 조회 (등록일자 순)`);

	// 검색 필터 적용
	if (searchFilter.userName) {
		allUsers = allUsers.filter(u => searchFilter.userName.$regex.test(u.name));
		console.log(`[API 기간조회] 검색 필터 적용 후 ${allUsers.length}명`);
	}

	// 4. 주차별 데이터 생성
	console.log(`[API 기간조회] 주차별 데이터 생성 시작 (총 ${allFridays.length}주)`);
	const weeks = [];

	for (const fridayInfo of allFridays) {
		const { friday, weekNumber: wWeek } = fridayInfo;
		const wYear = friday.getFullYear();
		const wMonth = friday.getMonth() + 1;
		const weekNumber = WeeklyPaymentPlans.getISOWeek(friday);

		// 해당 주차의 모든 지급 계획 조회
		const pipeline = [
			{
				$match: {
					'installments': {
						$elemMatch: {
							weekNumber: weekNumber,
							status: { $in: ['paid', 'pending'] }
						}
					}
				}
			},
			{
				$unwind: '$installments'
			},
			{
				$match: {
					'installments.weekNumber': weekNumber,
					'installments.status': { $in: ['paid', 'pending'] }
				}
			},
			{
				$group: {
					_id: '$userId',
					userName: { $first: '$userName' },
					baseGrade: { $first: '$baseGrade' },
					installmentAmount: { $first: '$installments.installmentAmount' },
					withholdingTax: { $first: '$installments.withholdingTax' },
					netAmount: { $first: '$installments.netAmount' }
				}
			}
		];

		const weekPayments = await WeeklyPaymentPlans.aggregate(pipeline);
		const paymentMap = new Map(weekPayments.map(p => [p._id, p]));

		// 모든 용역자에 대해 지급 정보 생성 (0원 포함)
		const payments = allUsers.map(user => {
			const payment = paymentMap.get(user.loginId);
			return {
				userId: user.loginId,
				userName: user.name,
				planner: user.planner || '',
				bank: user.bank || '',
				accountNumber: user.accountNumber || '',
				grade: user.grade || 'F1', // 항상 User 테이블의 최신 등급 사용
				actualAmount: payment ? payment.installmentAmount : 0,
				taxAmount: payment ? payment.withholdingTax : 0,
				netAmount: payment ? payment.netAmount : 0,
				installments: []
			};
		});

		weeks.push({
			year: wYear,
			monthNumber: wMonth,
			weekNumber: wWeek,
			week: `${wYear}년 ${wMonth}월 ${wWeek}주`,
			payments
		});
	}

	console.log(`[API 기간조회] weeks 배열 생성 완료 - 총 ${weeks.length}주`);
	if (weeks.length > 0) {
		console.log(`[API 기간조회] 첫 주차 샘플: ${weeks[0].week}, 용역자 ${weeks[0].payments.length}명`);
		const nonZeroPayments = weeks[0].payments.filter(p => p.actualAmount > 0);
		console.log(`[API 기간조회] 첫 주차 지급대상: ${nonZeroPayments.length}명`);
		if (nonZeroPayments.length > 0) {
			console.log(`[API 기간조회] 지급 샘플: ${nonZeroPayments[0].userName} - ${nonZeroPayments[0].actualAmount.toLocaleString()}원`);
		}
	}

	// 전체 총계 계산
	let grandTotal = { totalAmount: 0, totalTax: 0, totalNet: 0 };
	let totalPaymentCount = 0;

	weeks.forEach(week => {
		week.payments.forEach(payment => {
			if (payment.actualAmount > 0) {
				grandTotal.totalAmount += payment.actualAmount;
				grandTotal.totalTax += payment.taxAmount;
				grandTotal.totalNet += payment.netAmount;
				totalPaymentCount++;
			}
		});
	});

	// 기간 정보
	const periodInfo = {
		start: `${startYear}년 ${startMonth}월`,
		end: `${endYear}년 ${endMonth}월`,
		weekCount: weeks.length
	};

	console.log(`[API 기간조회] 전체 총계: ${grandTotal.totalAmount.toLocaleString()}원, 지급건수: ${totalPaymentCount}건`);
	console.log(`[API 기간조회] WEB 응답 반환 - 전체 구조 포함\n`);

	return json({
		success: true,
		data: {
			// 전체 총계 (페이지 무관)
			grandTotal,
			// 기간 정보
			period: periodInfo,
			// 페이지네이션 정보
			pagination: {
				page,
				totalPages: Math.ceil(allUsers.length / limit),
				totalItems: allUsers.length,
				itemsPerPage: limit
			},
			// 주차별 데이터
			weeks,
			// 현재 페이지 사용자 목록 (페이징 적용)
			payments: allUsers.slice((page - 1) * limit, page * limit).map((user, idx) => ({
				no: (page - 1) * limit + idx + 1,
				userId: user.loginId,
				userName: user.name,
				planner: user.planner || '',
				bank: user.bank || '',
				accountNumber: user.accountNumber || '',
				grade: user.grade || 'F1',
				// 전체 기간 동안의 총 지급액
				totalAmount: weeks.reduce((sum, week) => {
					const payment = week.payments.find(p => p.userId === user.loginId);
					return sum + (payment?.actualAmount || 0);
				}, 0),
				totalTax: weeks.reduce((sum, week) => {
					const payment = week.payments.find(p => p.userId === user.loginId);
					return sum + (payment?.taxAmount || 0);
				}, 0),
				totalNet: weeks.reduce((sum, week) => {
					const payment = week.payments.find(p => p.userId === user.loginId);
					return sum + (payment?.netAmount || 0);
				}, 0),
				paymentCount: weeks.reduce((count, week) => {
					const payment = week.payments.find(p => p.userId === user.loginId);
					return count + (payment?.actualAmount > 0 ? 1 : 0);
				}, 0)
			}))
		}
	});
}

/**
 * 기본 조회 - 현재 월 (v5.0)
 */
async function getDefaultPaymentsV5(year, month, page, limit, search, searchCategory) {
	console.log(`[API v5.0] 월 전체 조회: ${year}년 ${month}월`);

	// 해당 월의 모든 주차 계산
	const fridays = getFridaysInMonth(year, month);
	const weekNumbers = fridays.map(w => WeeklyPaymentPlans.getISOWeek(w.friday));

	// 나머지 로직은 getRangePaymentsV5와 유사
	return getRangePaymentsV5(year, month, year, month, page, limit, search, searchCategory);
}

/**
 * 검색 필터 구성
 */
function buildSearchFilter(search, searchCategory) {
	const filter = {};

	if (search) {
		if (searchCategory === 'name') {
			filter.userName = { $regex: search, $options: 'i' };
		} else if (searchCategory === 'planner') {
			// planner 검색은 User 조회 후 처리 필요
			filter.needPlannerSearch = true;
			filter.plannerSearch = search;
		}
	}

	return filter;
}