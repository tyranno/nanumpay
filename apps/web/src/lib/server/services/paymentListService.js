import WeeklyPaymentPlans from '$lib/server/models/WeeklyPaymentPlans.js';
import WeeklyPaymentSummary from '$lib/server/models/WeeklyPaymentSummary.js';
import User from '$lib/server/models/User.js';
import PlannerAccount from '$lib/server/models/PlannerAccount.js';
import UserAccount from '$lib/server/models/UserAccount.js';
import { getFridaysInMonth } from '$lib/utils/fridayWeekCalculator.js';

/**
 * 용역비 지급명부 공용 서비스
 * 관리자/설계사 API에서 공통으로 사용
 */

/**
 * 단일 주차 지급 데이터 조회
 */
export async function getSingleWeekPayments(year, month, week, page, limit, search, searchCategory, plannerAccountId = null) {
	console.log(`[공용서비스] 단일 주차 조회: ${year}년 ${month}월 ${week}주차${plannerAccountId ? ' (설계사 필터)' : ''}`);

	// 1. 해당 주차의 날짜 계산
	const fridays = getFridaysInMonth(year, month);
	const targetWeek = fridays.find(w => w.weekNumber === week);

	if (!targetWeek) {
		throw new Error('유효하지 않은 주차입니다.');
	}

	const weekDate = targetWeek.friday;
	const weekNumber = WeeklyPaymentPlans.getISOWeek(weekDate);

	// 2. 주차별 총계 조회 (전체 총액 - 페이지 무관)
	const summary = await WeeklyPaymentSummary.findOne({ weekNumber });

	let grandTotal;
	if (summary) {
		// Summary가 있으면 사용 (지급 처리 완료된 경우)
		grandTotal = {
			totalAmount: summary.totalAmount || 0,
			totalTax: summary.totalTax || 0,
			totalNet: summary.totalNet || 0
		};
	} else {
		// Summary가 없으면 WeeklyPaymentPlans에서 직접 계산 (pending 포함)
		const totalPipeline = [
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
					_id: null,
					totalAmount: { $sum: '$installments.installmentAmount' },
					totalTax: { $sum: '$installments.withholdingTax' },
					totalNet: { $sum: '$installments.netAmount' }
				}
			}
		];

		const totalResult = await WeeklyPaymentPlans.aggregate(totalPipeline);
		grandTotal = totalResult[0] ? {
			totalAmount: totalResult[0].totalAmount || 0,
			totalTax: totalResult[0].totalTax || 0,
			totalNet: totalResult[0].totalNet || 0
		} : {
			totalAmount: 0,
			totalTax: 0,
			totalNet: 0
		};
	}

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
						baseGrade: '$baseGrade',  // ⭐ 지급 계획의 등급
						추가지급단계: '$추가지급단계',  // ⭐ 추가지급 단계
						revenueMonth: '$installments.revenueMonth',
						week: '$installments.week',  // ⭐ 회차 (1~60)
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
				registrationNumber: { $arrayElemAt: ['$userInfo.registrationNumber', 0] },
				registrationDate: { $arrayElemAt: ['$userInfo.registrationDate', 0] },
				createdAt: { $arrayElemAt: ['$userInfo.createdAt', 0] },
				userObjectId: { $arrayElemAt: ['$userInfo._id', 0] },
				plannerAccountId: { $arrayElemAt: ['$userInfo.plannerAccountId', 0] },
				bank: { $arrayElemAt: ['$userInfo.bank', 0] },
				accountNumber: { $arrayElemAt: ['$userInfo.accountNumber', 0] }
			}
		},
		{
			$lookup: {
				from: 'planneraccounts',
				localField: 'plannerAccountId',
				foreignField: '_id',
				as: 'plannerInfo'
			}
		},
		{
			$addFields: {
				plannerName: { $arrayElemAt: ['$plannerInfo.name', 0] }
			}
		},
		// ⭐ 설계사 필터 적용 (본인 용역자만 조회)
		...(plannerAccountId ? [{
			$match: {
				plannerAccountId: plannerAccountId
			}
		}] : []),
		// 설계사 검색 필터 적용
		...(searchFilter.needPlannerSearch ? [{
			$match: {
				plannerName: { $regex: searchFilter.plannerSearch, $options: 'i' }
			}
		}] : []),
		{
			$sort: { userObjectId: 1 }
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
	const users = await User.find({ _id: { $in: userIds } })
		.populate('plannerAccountId')
		.populate('userAccountId')
		.lean();
	const userMap = new Map(users.map(u => [u._id.toString(), u]));

	const enrichedPayments = userPayments.map((payment, idx) => {
		const user = userMap.get(payment._id) || {};
		const userAccount = user.userAccountId || {};
		const plannerAccount = user.plannerAccountId || {};

		return {
			no: (page - 1) * limit + idx + 1,
			userId: payment._id,
			userName: payment.userName,
			planner: plannerAccount.name || '',
			bank: userAccount.bank || '',
			accountNumber: userAccount.accountNumber || '',
			grade: user.grade || 'F1',
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

	// 7. 주차별 총계 생성 (단일 주차)
	const weekKey = `${year}-${month}-${week}`;
	const weeklyTotals = {
		[weekKey]: {
			totalAmount: grandTotal.totalAmount,
			totalTax: grandTotal.totalTax,
			totalNet: grandTotal.totalNet
		}
	};

	return {
		success: true,
		data: {
			grandTotal,
			weeklyTotals,
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
	};
}

/**
 * 기간 조회
 */
export async function getRangePayments(startYear, startMonth, endYear, endMonth, page, limit, search, searchCategory, plannerAccountId = null) {
	console.log(`[공용서비스] 기간 조회: ${startYear}/${startMonth} ~ ${endYear}/${endMonth}${plannerAccountId ? ' (설계사 필터)' : ''}`);

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
	const userQuery = { isAdmin: { $ne: true } };
	// ⭐ 설계사 필터 적용
	if (plannerAccountId) {
		userQuery.plannerAccountId = plannerAccountId;
	}
	let allUsers = await User.find(userQuery)
		.populate('plannerAccountId')
		.populate('userAccountId')
		.sort({ _id: 1 })
		.lean();
	console.log(`[공용서비스] 전체 용역자 ${allUsers.length}명 조회${plannerAccountId ? ' (설계사 필터 적용)' : ''}`);

	// 검색 필터 적용
	if (searchFilter.userName) {
		const searchRegex = searchFilter.userName.$regex
			? new RegExp(searchFilter.userName.$regex.source || searchFilter.userName.$regex, searchFilter.userName.$options || 'i')
			: new RegExp(searchFilter.userName, 'i');
		allUsers = allUsers.filter(u => searchRegex.test(u.name));
		console.log(`[공용서비스] 이름 검색 필터 적용 후 ${allUsers.length}명`);
	}

	// 설계사 검색 필터 적용
	if (searchFilter.needPlannerSearch) {
		const searchRegex = new RegExp(searchFilter.plannerSearch, 'i');
		allUsers = allUsers.filter(u => {
			const plannerName = u.plannerAccountId?.name || '';
			return searchRegex.test(plannerName);
		});
		console.log(`[공용서비스] 설계사 검색 필터 적용 후 ${allUsers.length}명`);
	}

	// 4. 주차별 데이터 생성
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
					installmentAmount: { $sum: '$installments.installmentAmount' },
					withholdingTax: { $sum: '$installments.withholdingTax' },
					netAmount: { $sum: '$installments.netAmount' },
					// ⭐ 지급 계획 정보 수집 (등급, 회차)
					payments: {
						$push: {
							baseGrade: '$baseGrade',
							week: '$installments.week',
							추가지급단계: '$추가지급단계',
							revenueMonth: '$installments.revenueMonth'
						}
					}
				}
			}
		];

		const weekPayments = await WeeklyPaymentPlans.aggregate(pipeline);
		const paymentMap = new Map(weekPayments.map(p => [p._id, p]));

		// 모든 용역자에 대해 지급 정보 생성 (0원 포함)
		const payments = allUsers.map(user => {
			const userId = user._id.toString();
			const payment = paymentMap.get(userId);
			const plannerAccount = user.plannerAccountId || {};
			const userAccount = user.userAccountId || {};

			return {
				userId: userId,
				userName: user.name,
				planner: plannerAccount.name || '',
				bank: userAccount.bank || '',
				accountNumber: userAccount.accountNumber || '',
				grade: user.grade || 'F1',
				actualAmount: payment ? payment.installmentAmount : 0,
				taxAmount: payment ? payment.withholdingTax : 0,
				netAmount: payment ? payment.netAmount : 0,
				installments: payment ? payment.payments : []  // ⭐ 지급 계획 정보
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

	// 전체 총계 및 주차별/월별 총계 계산
	let grandTotal = { totalAmount: 0, totalTax: 0, totalNet: 0 };
	let totalPaymentCount = 0;
	const weeklyTotals = {};
	const monthlyTotals = {};

	weeks.forEach(week => {
		let weekTotal = { totalAmount: 0, totalTax: 0, totalNet: 0 };

		week.payments.forEach(payment => {
			if (payment.actualAmount > 0) {
				grandTotal.totalAmount += payment.actualAmount;
				grandTotal.totalTax += payment.taxAmount;
				grandTotal.totalNet += payment.netAmount;
				totalPaymentCount++;

				weekTotal.totalAmount += payment.actualAmount;
				weekTotal.totalTax += payment.taxAmount;
				weekTotal.totalNet += payment.netAmount;
			}
		});

		const weekKey = `${week.year}-${week.monthNumber}-${week.weekNumber}`;
		weeklyTotals[weekKey] = weekTotal;

		const monthKey = `month_${week.monthNumber}`;
		if (!monthlyTotals[monthKey]) {
			monthlyTotals[monthKey] = { totalAmount: 0, totalTax: 0, totalNet: 0 };
		}
		monthlyTotals[monthKey].totalAmount += weekTotal.totalAmount;
		monthlyTotals[monthKey].totalTax += weekTotal.totalTax;
		monthlyTotals[monthKey].totalNet += weekTotal.totalNet;
	});

	const periodInfo = {
		start: `${startYear}년 ${startMonth}월`,
		end: `${endYear}년 ${endMonth}월`,
		weekCount: weeks.length
	};

	return {
		success: true,
		data: {
			grandTotal,
			weeklyTotals,
			monthlyTotals,
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
				const plannerAccount = user.plannerAccountId || {};

				return {
					no: (page - 1) * limit + idx + 1,
					userId: userId,
					userName: user.name,
					planner: plannerAccount.name || '',
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
	};
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
			filter.needPlannerSearch = true;
			filter.plannerSearch = search;
		}
	}

	return filter;
}
