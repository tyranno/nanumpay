import { json } from '@sveltejs/kit';
import { connectDB } from '$lib/server/db.js';
import WeeklyPaymentPlans from '$lib/server/models/WeeklyPaymentPlans.js';
import WeeklyPaymentSummary from '$lib/server/models/WeeklyPaymentSummary.js';
import User from '$lib/server/models/User.js';
import { getAllWeeksInPeriod, getFridaysInMonth } from '$lib/utils/fridayWeekCalculator.js';

/**
 * 설계사 전용 용역비 지급명부 API v5.0
 * 관리자 API와 동일하지만 설계사가 담당하는 사용자만 필터링
 */
export async function GET({ url, locals }) {
	// 설계사 권한 확인
	if (!locals.user || locals.user.accountType !== 'planner') {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	try {
		await connectDB();

		const plannerAccountId = locals.user.id;

		// 설계사가 담당하는 사용자 ID 목록 조회
		const users = await User.find({ plannerAccountId: plannerAccountId }, '_id').lean();
		const userIds = users.map(u => u._id.toString());

		if (userIds.length === 0) {
			return json({
				success: true,
				data: {
					grandTotal: { totalAmount: 0, totalTax: 0, totalNet: 0 },
					pagination: { page: 1, totalPages: 0, totalItems: 0, itemsPerPage: 20 },
					payments: [],
					weeks: []
				}
			});
		}

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
			return await getSingleWeekPayments(year, month, week, page, limit, search, searchCategory, userIds);
		}

		// === 기간 조회 ===
		if (startYear && startMonth && endYear && endMonth) {
			return await getRangePayments(startYear, startMonth, endYear, endMonth, page, limit, search, searchCategory, userIds);
		}

		// === 기본: 현재 월의 모든 주차 조회 ===
		return await getDefaultPayments(year, month || new Date().getMonth() + 1, page, limit, search, searchCategory, userIds);

	} catch (error) {
		console.error('[설계사 API] Weekly payment error:', error);
		return json({
			success: false,
			error: error.message
		}, { status: 500 });
	}
}

/**
 * 단일 주차 지급 데이터 조회 (설계사 전용)
 */
async function getSingleWeekPayments(year, month, week, page, limit, search, searchCategory, userIds) {
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

	// 2. 검색 조건 구성
	const searchFilter = buildSearchFilter(search, searchCategory);

	// 3. Aggregation Pipeline for 페이지네이션 (설계사 담당 사용자만)
	const pipeline = [
		// 설계사 담당 사용자만 필터
		{
			$match: {
				userId: { $in: userIds },
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
			$addFields: {
				userIdAsObjectId: { $toObjectId: '$_id' }
			}
		},
		{
			$lookup: {
				from: 'users',
				localField: 'userIdAsObjectId',
				foreignField: '_id',
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

	// 4. 사용자 상세 정보 추가
	const paymentUserIds = userPayments.map(p => p._id);
	const usersData = await User.find({ _id: { $in: paymentUserIds } })
		.populate('userAccountId')
		.lean();
	const userMap = new Map(usersData.map(u => [u._id.toString(), u]));

	const enrichedPayments = userPayments.map((payment, idx) => {
		const user = userMap.get(payment._id) || {};
		const userAccount = user.userAccountId || {};

		return {
			no: (page - 1) * limit + idx + 1,
			userId: payment._id,
			userName: payment.userName,
			bank: userAccount.bank || '',
			accountNumber: userAccount.accountNumber || '',
			grade: user.grade || 'F1',
			actualAmount: payment.totalAmount || 0,
			taxAmount: payment.totalTax || 0,
			netAmount: payment.totalNet || 0,
			installments: payment.payments
		};
	});

	// 5. 설계사 담당 사용자의 전체 총계 계산
	const totalPipeline = [
		{
			$match: {
				userId: { $in: userIds },
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
				_id: null,
				totalAmount: { $sum: '$installments.installmentAmount' },
				totalTax: { $sum: '$installments.withholdingTax' },
				totalNet: { $sum: '$installments.netAmount' }
			}
		}
	];

	const totalResult = await WeeklyPaymentPlans.aggregate(totalPipeline);
	const grandTotal = totalResult[0] ? {
		totalAmount: totalResult[0].totalAmount || 0,
		totalTax: totalResult[0].totalTax || 0,
		totalNet: totalResult[0].totalNet || 0
	} : {
		totalAmount: 0,
		totalTax: 0,
		totalNet: 0
	};

	// 6. 현재 페이지 합계
	const pageTotal = {
		amount: enrichedPayments.reduce((sum, p) => sum + p.actualAmount, 0),
		tax: enrichedPayments.reduce((sum, p) => sum + p.taxAmount, 0),
		net: enrichedPayments.reduce((sum, p) => sum + p.netAmount, 0)
	};

	return json({
		success: true,
		data: {
			grandTotal,
			pagination: {
				page,
				totalPages,
				totalItems: totalCount,
				itemsPerPage: limit
			},
			payments: enrichedPayments,
			pageTotal,
			year,
			monthNumber: month,
			weekNumber: week,
			week: `${month}월 ${week}주`
		}
	});
}

/**
 * 기간 조회 (설계사 전용)
 */
async function getRangePayments(startYear, startMonth, endYear, endMonth, page, limit, search, searchCategory, userIds) {
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

	// 3. 설계사 담당 용역자만 조회 (등록일자 순)
	let allUsers = await User.find({
		_id: { $in: userIds.map(id => id) },
		isAdmin: { $ne: true }
	})
		.populate('userAccountId')
		.sort({ registrationDate: 1, createdAt: 1 })
		.lean();

	// 검색 필터 적용
	if (searchFilter.userName) {
		allUsers = allUsers.filter(u => searchFilter.userName.$regex.test(u.name));
	}

	// 4. 주차별 데이터 생성
	const weeks = [];

	for (const fridayInfo of allFridays) {
		const { friday, weekNumber: wWeek } = fridayInfo;
		const wYear = friday.getFullYear();
		const wMonth = friday.getMonth() + 1;
		const weekNumber = WeeklyPaymentPlans.getISOWeek(friday);

		// 해당 주차의 설계사 담당 사용자 지급 계획만 조회
		const pipeline = [
			{
				$match: {
					userId: { $in: userIds },
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
					installmentAmount: { $sum: '$installments.installmentAmount' },
					withholdingTax: { $sum: '$installments.withholdingTax' },
					netAmount: { $sum: '$installments.netAmount' }
				}
			}
		];

		const weekPayments = await WeeklyPaymentPlans.aggregate(pipeline);
		const paymentMap = new Map(weekPayments.map(p => [p._id, p]));

		// 모든 용역자에 대해 지급 정보 생성 (0원 포함)
		const payments = allUsers.map(user => {
			const userId = user._id.toString();
			const payment = paymentMap.get(userId);
			const userAccount = user.userAccountId || {};

			return {
				userId: userId,
				userName: user.name,
				bank: userAccount.bank || '',
				accountNumber: userAccount.accountNumber || '',
				grade: user.grade || 'F1',
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

	return json({
		success: true,
		data: {
			grandTotal,
			period: periodInfo,
			pagination: {
				page,
				totalPages: Math.ceil(allUsers.length / limit),
				totalItems: allUsers.length,
				itemsPerPage: limit
			},
			weeks,
			payments: allUsers.slice((page - 1) * limit, page * limit).map((user, idx) => {
				const userId = user._id.toString();
				const userAccount = user.userAccountId || {};

				return {
					no: (page - 1) * limit + idx + 1,
					userId: userId,
					userName: user.name,
					bank: userAccount.bank || '',
					accountNumber: userAccount.accountNumber || '',
					grade: user.grade || 'F1',
					totalAmount: weeks.reduce((sum, week) => {
						const payment = week.payments.find(p => p.userId === userId);
						return sum + (payment?.actualAmount || 0);
					}, 0),
					totalTax: weeks.reduce((sum, week) => {
						const payment = week.payments.find(p => p.userId === userId);
						return sum + (payment?.taxAmount || 0);
					}, 0),
					totalNet: weeks.reduce((sum, week) => {
						const payment = week.payments.find(p => p.userId === userId);
						return sum + (payment?.netAmount || 0);
					}, 0),
					paymentCount: weeks.reduce((count, week) => {
						const payment = week.payments.find(p => p.userId === userId);
						return count + (payment?.actualAmount > 0 ? 1 : 0);
					}, 0)
				};
			})
		}
	});
}

/**
 * 기본 조회 - 현재 월 (설계사 전용)
 */
async function getDefaultPayments(year, month, page, limit, search, searchCategory, userIds) {
	return getRangePayments(year, month, year, month, page, limit, search, searchCategory, userIds);
}

/**
 * 검색 필터 구성
 */
function buildSearchFilter(search, searchCategory) {
	const filter = {};

	if (search) {
		if (searchCategory === 'name') {
			filter.userName = { $regex: search, $options: 'i' };
		}
		// 설계사 검색은 설계사 페이지에서 필요 없음 (본인 담당만 보기 때문)
	}

	return filter;
}
