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
		...(searchFilter.baseGrade ? [{ $match: { baseGrade: searchFilter.baseGrade } }] : []),
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

		// ⭐ gradeInfo 생성: 등급(회수) 형식 - 기본지급회차/추가지급회차
		const gradeInfo = payment.payments && payment.payments.length > 0
			? (() => {
				// 등급별로 그룹화하여 기본/추가 지급 회차 매칭
				const gradeMap = {}; // { 'F2': { basic: [1,2,3], additional: [1,2,3] } }

				payment.payments.forEach(p => {
					const grade = p.baseGrade;
					const stage = p.추가지급단계 || 0;

					if (!gradeMap[grade]) {
						gradeMap[grade] = { basic: [], additional: [] };
					}

					if (stage === 0) {
						gradeMap[grade].basic.push(p.week);
					} else {
						gradeMap[grade].additional.push(p.week);
					}
				});

				// 형식화: 기본만/추가만: F2(1,2,3,4), 둘 다: F2(6/1,7/2,8/3,9/4)
				return Object.entries(gradeMap).map(([grade, data]) => {
					const hasBasic = data.basic.length > 0;
					const hasAdditional = data.additional.length > 0;

					if (hasBasic && hasAdditional) {
						// 둘 다 있을 때: 슬래시로 구분
						const pairs = [];
						const maxLen = Math.max(data.basic.length, data.additional.length);
						for (let i = 0; i < maxLen; i++) {
							const basic = data.basic[i] || '';
							const additional = data.additional[i] || '';
							pairs.push(`${basic}/${additional}`);
						}
						return `${grade}(${pairs.join(',')})`;
					} else if (hasBasic) {
						// 기본지급만: 슬래시 없이
						return `${grade}(${data.basic.join(',')})`;
					} else {
						// 추가지급만: 슬래시 없이
						return `${grade}(${data.additional.join(',')})`;
					}
				}).join(', ');
			})()
			: '-';

		// ⭐ 선택된 기간의 최고 등급 계산
		const gradeOrder = { F1: 1, F2: 2, F3: 3, F4: 4, F5: 5, F6: 6, F7: 7, F8: 8 };
		const periodGrade = payment.payments && payment.payments.length > 0
			? payment.payments.reduce((maxGrade, p) => {
				const currentGrade = p.baseGrade || 'F1';
				return (gradeOrder[currentGrade] || 0) > (gradeOrder[maxGrade] || 0)
					? currentGrade
					: maxGrade;
			}, 'F1')
			: (user.grade || 'F1');

		return {
			no: (page - 1) * limit + idx + 1,
			userId: payment._id,
			userName: payment.userName,
			planner: plannerAccount.name || '',
			bank: userAccount.bank || '',
			accountNumber: userAccount.accountNumber || '',
			grade: periodGrade, // ⭐ 선택된 기간의 최고 등급
			actualAmount: payment.totalAmount || 0,
			taxAmount: payment.totalTax || 0,
			netAmount: payment.totalNet || 0,
			installments: payment.payments,
			gradeInfo // ⭐ 등급(회수) 정보
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

	// 검색 필터 적용
	if (searchFilter.userName) {
		const searchRegex = searchFilter.userName.$regex
			? new RegExp(searchFilter.userName.$regex.source || searchFilter.userName.$regex, searchFilter.userName.$options || 'i')
			: new RegExp(searchFilter.userName, 'i');
		allUsers = allUsers.filter(u => searchRegex.test(u.name));
	}

	// 설계사 검색 필터 적용
	if (searchFilter.needPlannerSearch) {
		const searchRegex = new RegExp(searchFilter.plannerSearch, 'i');
		allUsers = allUsers.filter(u => {
			const plannerName = u.plannerAccountId?.name || '';
			return searchRegex.test(plannerName);
		});
	}

	// 등급 검색 필터 적용
	if (searchFilter.baseGrade) {
		// getRangePayments는 User 기준이 아닌 WeeklyPaymentPlans 기준으로 필터링해야 함
		// 여기서는 사용자 필터링이 아니므로, 아래 파이프라인에서 처리
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
			// 등급 검색 필터 적용
			...(searchFilter.baseGrade ? [{ $match: { baseGrade: searchFilter.baseGrade } }] : []),
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

			// ⭐ gradeInfo 생성: 등급(회수) 형식 - 기본지급회차/추가지급회차
			const gradeInfo = payment && payment.payments && payment.payments.length > 0
				? (() => {
					// 등급별로 그룹화하여 기본/추가 지급 회차 매칭
					const gradeMap = {}; // { 'F2': { basic: [1,2,3], additional: [1,2,3] } }

					payment.payments.forEach(p => {
						const grade = p.baseGrade;
						const stage = p.추가지급단계 || 0;

						if (!gradeMap[grade]) {
							gradeMap[grade] = { basic: [], additional: [] };
						}

						if (stage === 0) {
							gradeMap[grade].basic.push(p.week);
						} else {
							gradeMap[grade].additional.push(p.week);
						}
					});

					// 형식화: 기본만/추가만: F2(1,2,3,4), 둘 다: F2(6/1,7/2,8/3,9/4)
					return Object.entries(gradeMap).map(([grade, data]) => {
						const hasBasic = data.basic.length > 0;
						const hasAdditional = data.additional.length > 0;

						if (hasBasic && hasAdditional) {
							// 둘 다 있을 때: 슬래시로 구분
							const pairs = [];
							const maxLen = Math.max(data.basic.length, data.additional.length);
							for (let i = 0; i < maxLen; i++) {
								const basic = data.basic[i] || '';
								const additional = data.additional[i] || '';
								pairs.push(`${basic}/${additional}`);
							}
							return `${grade}(${pairs.join(',')})`;
						} else if (hasBasic) {
							// 기본지급만: 슬래시 없이
							return `${grade}(${data.basic.join(',')})`;
						} else {
							// 추가지급만: 슬래시 없이
							return `${grade}(${data.additional.join(',')})`;
						}
					}).join(', ');
				})()
				: '-';

			// ⭐ 선택된 기간의 최고 등급 계산
			const gradeOrder = { F1: 1, F2: 2, F3: 3, F4: 4, F5: 5, F6: 6, F7: 7, F8: 8 };
			const periodGrade = payment && payment.payments && payment.payments.length > 0
				? payment.payments.reduce((maxGrade, p) => {
					const currentGrade = p.baseGrade || 'F1';
					return (gradeOrder[currentGrade] || 0) > (gradeOrder[maxGrade] || 0)
						? currentGrade
						: maxGrade;
				}, 'F1')
				: (user.grade || 'F1');

			return {
				userId: userId,
				userName: user.name,
				planner: plannerAccount.name || '',
				bank: userAccount.bank || '',
				accountNumber: userAccount.accountNumber || '',
				grade: periodGrade, // ⭐ 선택된 기간의 최고 등급
				actualAmount: payment ? payment.installmentAmount : 0,
				taxAmount: payment ? payment.withholdingTax : 0,
				netAmount: payment ? payment.netAmount : 0,
				installments: payment ? payment.payments : [],  // ⭐ 지급 계획 정보
				gradeInfo  // ⭐ 등급(회수) 정보
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
					grade: (() => {
					// ⭐ 선택된 기간 전체에서 최고 등급 계산
					const gradeOrder = { F1: 1, F2: 2, F3: 3, F4: 4, F5: 5, F6: 6, F7: 7, F8: 8 };
					let periodGrade = 'F1'; // ⭐ 기본값을 F1로 시작
					const allGrades = [];

					// ⭐ weeks 배열에서 해당 사용자의 모든 지급 내역 확인
					weeks.forEach(week => {
						const userPayment = week.payments.find(p => p.userId === userId);
						if (userPayment) {
							// gradeInfo에서 등급 추출 (예: "F2(1), F2(2)" → ["F2", "F2"])
							if (userPayment.gradeInfo && userPayment.gradeInfo !== '-') {
								const grades = userPayment.gradeInfo.split(', ').map(g => {
									const match = g.match(/^(F\d+)/);
									return match ? match[1] : null;
								}).filter(Boolean);

								grades.forEach(grade => {
									allGrades.push(grade);
									if ((gradeOrder[grade] || 0) > (gradeOrder[periodGrade] || 0)) {
										periodGrade = grade;
									}
								});
							}
						}
					});

					// 지급 내역이 없으면 현재 사용자 등급 사용
					if (allGrades.length === 0) {
						periodGrade = user.grade || 'F1';
					}

					return periodGrade;
				})(),
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
		} else if (searchCategory === 'grade') {
			// 등급 검색: baseGrade로 필터링
			filter.baseGrade = search; // "F1", "F2", ...
		}
	}

	return filter;
}

/**
 * 등급별 기간 조회 (전용 함수)
 * - 전체 기간의 모든 사용자를 먼저 조회
 * - 등급으로 필터링
 * - 페이지네이션 적용
 */
export async function getRangePaymentsByGrade(startYear, startMonth, endYear, endMonth, page, limit, gradeFilter, plannerAccountId = null) {
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

	// 2. 기간 내 모든 고유 userId를 baseGrade와 함께 수집
	const weekNumbers = allFridays.map(f => WeeklyPaymentPlans.getISOWeek(f.friday));
	
	const uniqueUsersPipeline = [
		{
			$match: {
				'installments': {
					$elemMatch: {
						weekNumber: { $in: weekNumbers },
						status: { $in: ['paid', 'pending'] }
					}
				},
				...(gradeFilter ? { baseGrade: gradeFilter } : {})  // ⭐ 등급 필터
			}
		},
		{
			$group: {
				_id: '$userId',
				userName: { $first: '$userName' },
				baseGrade: { $first: '$baseGrade' }
			}
		}
	];

	// ⭐ 설계사 필터는 나중에 User 조회 시 적용
	const uniqueUsersResult = await WeeklyPaymentPlans.aggregate(uniqueUsersPipeline);
	
	// 3. 고유 userId 목록
	const userIds = uniqueUsersResult.map(u => u._id);

	// 설계사 필터 적용 (User 컬렉션 조회)
	if (plannerAccountId) {
		const filteredUsers = await User.find({
			_id: { $in: userIds.map(id => id) },
			plannerAccountId: plannerAccountId
		}).select('_id').lean();
		
		const filteredUserIds = new Set(filteredUsers.map(u => u._id.toString()));
		userIds = userIds.filter(id => filteredUserIds.has(id));
	}

	// 4. 페이지네이션
	const totalUsers = userIds.length;
	const totalPages = Math.ceil(totalUsers / limit);
	const startIndex = (page - 1) * limit;
	const endIndex = startIndex + limit;
	const pagedUserIds = userIds.slice(startIndex, endIndex);

	// 5. 페이지에 해당하는 사용자 정보 조회
	const allUsers = await User.find({ _id: { $in: pagedUserIds } })
		.populate('plannerAccountId')
		.populate('userAccountId')
		.sort({ _id: 1 })
		.lean();

	// 6. 주차별 데이터 생성 (페이지 사용자만)
	const weeks = [];

	for (const fridayInfo of allFridays) {
		const { friday, weekNumber: wWeek } = fridayInfo;
		const wYear = friday.getFullYear();
		const wMonth = friday.getMonth() + 1;
		const weekNumber = WeeklyPaymentPlans.getISOWeek(friday);

		// 해당 주차의 페이지 사용자 지급 계획만 조회
		const pipeline = [
			{
				$match: {
					userId: { $in: pagedUserIds },
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

		// 페이지 사용자에 대해 지급 정보 생성
		const payments = allUsers.map(user => {
			const userId = user._id.toString();
			const payment = paymentMap.get(userId);
			const plannerAccount = user.plannerAccountId || {};
			const userAccount = user.userAccountId || {};

			// gradeInfo 생성 (기존 로직 동일)
			const gradeInfo = payment && payment.payments && payment.payments.length > 0
				? (() => {
					const gradeMap = {};
					payment.payments.forEach(p => {
						const grade = p.baseGrade;
						const stage = p.추가지급단계 || 0;
						if (!gradeMap[grade]) {
							gradeMap[grade] = { basic: [], additional: [] };
						}
						if (stage === 0) {
							gradeMap[grade].basic.push(p.week);
						} else {
							gradeMap[grade].additional.push(p.week);
						}
					});

					const parts = [];
					Object.keys(gradeMap).sort().forEach(grade => {
						const info = gradeMap[grade];
						const basicMin = info.basic.length > 0 ? Math.min(...info.basic) : null;
						const basicMax = info.basic.length > 0 ? Math.max(...info.basic) : null;
						const additionalMin = info.additional.length > 0 ? Math.min(...info.additional) : null;
						const additionalMax = info.additional.length > 0 ? Math.max(...info.additional) : null;

						if (basicMin !== null && additionalMin !== null) {
							parts.push(`${grade}(${basicMin}~${basicMax}/${additionalMin}~${additionalMax})`);
						} else if (basicMin !== null) {
							parts.push(`${grade}(${basicMin}~${basicMax})`);
						} else if (additionalMin !== null) {
							parts.push(`${grade}(/${additionalMin}~${additionalMax})`);
						}
					});
					return parts.join(', ');
				})()
				: '-';

			return {
				userId,
				userName: payment?.userName || user.name,
				planner: plannerAccount.name || '-',
				bank: userAccount.bank || user.bank || '-',
				accountNumber: userAccount.accountNumber || user.accountNumber || '-',
				grade: payment?.baseGrade || user.grade || 'F1',
				actualAmount: payment?.installmentAmount || 0,
				taxAmount: payment?.withholdingTax || 0,
				netAmount: payment?.netAmount || 0,
				installments: [],
				gradeInfo
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

	// 7. 총계 계산
	const grandTotal = weeks.reduce((total, week) => {
		week.payments.forEach(payment => {
			total.totalAmount += payment.actualAmount;
			total.totalTax += payment.taxAmount;
			total.totalNet += payment.netAmount;
		});
		return total;
	}, { totalAmount: 0, totalTax: 0, totalNet: 0 });

	// 8. 주차별/월별 총계
	const weeklyTotals = {};
	const monthlyTotals = {};

	weeks.forEach(week => {
		const weekKey = `${week.year}-${week.monthNumber}-${week.weekNumber}`;
		const monthKey = `month_${week.monthNumber}`;

		const weekTotal = week.payments.reduce((sum, p) => ({
			totalAmount: sum.totalAmount + p.actualAmount,
			totalTax: sum.totalTax + p.taxAmount,
			totalNet: sum.totalNet + p.netAmount
		}), { totalAmount: 0, totalTax: 0, totalNet: 0 });

		weeklyTotals[weekKey] = weekTotal;

		if (!monthlyTotals[monthKey]) {
			monthlyTotals[monthKey] = { totalAmount: 0, totalTax: 0, totalNet: 0 };
		}
		monthlyTotals[monthKey].totalAmount += weekTotal.totalAmount;
		monthlyTotals[monthKey].totalTax += weekTotal.totalTax;
		monthlyTotals[monthKey].totalNet += weekTotal.totalNet;
	});

	// 9. 사용자 요약 정보 생성 (Python 테스트 스크립트 호환)
	const users = allUsers.map((user, idx) => {
		const userId = user._id.toString();
		const userAccount = user.userAccountId || {};
		const plannerAccount = user.plannerAccountId || {};
		
		// 기간 전체에서 해당 사용자의 최고 등급 계산
		const gradeOrder = { F1: 1, F2: 2, F3: 3, F4: 4, F5: 5, F6: 6, F7: 7, F8: 8 };
		let currentGrade = user.grade || 'F1';
		
		weeks.forEach(week => {
			const payment = week.payments.find(p => p.userId === userId);
			if (payment && payment.grade) {
				if ((gradeOrder[payment.grade] || 0) > (gradeOrder[currentGrade] || 0)) {
					currentGrade = payment.grade;
				}
			}
		});
		
		return {
			no: (page - 1) * limit + idx + 1,
			userId,
			userName: user.name,
			planner: plannerAccount.name || '',
			bank: userAccount.bank || '',
			accountNumber: userAccount.accountNumber || '',
			currentGrade,  // ⭐ 선택 기간의 최고 등급
			weeks: weeks.map(week => {
				const payment = week.payments.find(p => p.userId === userId);
				return {
					weekLabel: week.week,
					installmentAmount: payment?.actualAmount || 0,
					withholdingTax: payment?.taxAmount || 0,
					netAmount: payment?.netAmount || 0
				};
			})
		};
	});

	return {
		success: true,
		data: {
			grandTotal,
			weeklyTotals,
			monthlyTotals,
			period: {
				start: `${startYear}년 ${startMonth}월`,
				end: `${endYear}년 ${endMonth}월`,
				weekCount: allFridays.length
			},
			pagination: {
				page,
				totalPages,
				totalItems: totalUsers,
				itemsPerPage: limit
			},
			weeks,
			users  // ⭐ 사용자 요약 리스트 추가
		}
	};
}
