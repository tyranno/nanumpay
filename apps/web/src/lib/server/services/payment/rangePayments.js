import WeeklyPaymentPlans from '$lib/server/models/WeeklyPaymentPlans.js';
import User from '$lib/server/models/User.js';
import UserAccount from '$lib/server/models/UserAccount.js';
import PlannerAccount from '$lib/server/models/PlannerAccount.js';
import { getFridaysInMonth } from '$lib/utils/fridayWeekCalculator.js';
import { buildSearchFilter, generateGradeInfo, calculatePeriodGrade } from './utils.js';
import mongoose from 'mongoose';

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

	// 3. 주차별 데이터 생성
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
			// 사용자별 그룹화 (등급 검색을 위해 모든 등급 수집)
			{
				$group: {
					_id: '$userId',
					userName: { $first: '$userName' },
					grades: { $push: '$baseGrade' },  // ⭐ 모든 등급 수집
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
			},
			// ⭐ 최대 등급 계산
			{
				$addFields: {
					maxGradeNum: {
						$max: {
							$map: {
								input: '$grades',
								as: 'g',
								in: { $toInt: { $substr: ['$$g', 1, -1] } }
							}
						}
					}
				}
			},
			{
				$addFields: {
					maxGrade: { $concat: ['F', { $toString: '$maxGradeNum' }] }
				}
			},
			// ⭐ 등급 검색 필터 적용 (maxGrade로 필터링)
			...(searchFilter.baseGrade ? [{ $match: { maxGrade: searchFilter.baseGrade } }] : [])
		];

		const weekPayments = await WeeklyPaymentPlans.aggregate(pipeline);
		const paymentMap = new Map(weekPayments.map(p => [p._id, p]));

		// 모든 용역자에 대해 지급 정보 생성 (0원 포함)
		const payments = allUsers.map(user => {
			const userId = user._id.toString();
			const payment = paymentMap.get(userId);
			const plannerAccount = user.plannerAccountId || {};
			const userAccount = user.userAccountId || {};

			// gradeInfo 생성
			const gradeInfo = payment && payment.payments && payment.payments.length > 0
				? generateGradeInfo(payment.payments)
				: '-';

			// 선택된 기간의 최고 등급 계산
			const periodGrade = payment && payment.payments && payment.payments.length > 0
				? calculatePeriodGrade(payment.payments, user.grade || 'F1')
				: (user.grade || 'F1');

			return {
				userId: userId,
				userName: user.name,
				planner: plannerAccount.name || '',
				bank: userAccount.bank || '',
				accountNumber: userAccount.accountNumber || '',
				grade: periodGrade,
				actualAmount: payment ? payment.installmentAmount : 0,
				taxAmount: payment ? payment.withholdingTax : 0,
				netAmount: payment ? payment.netAmount : 0,
				installments: payment ? payment.payments : [],
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

				// ⭐ 선택된 기간 전체에서 최고 등급 및 gradeInfo 계산
				const gradeOrder = { F1: 1, F2: 2, F3: 3, F4: 4, F5: 5, F6: 6, F7: 7, F8: 8 };
				let periodGrade = 'F1';
				const allGrades = [];
				const allGradeInfos = [];

				weeks.forEach(week => {
					const userPayment = week.payments.find(p => p.userId === userId);
					if (userPayment) {
						if (userPayment.gradeInfo && userPayment.gradeInfo !== '-') {
							allGradeInfos.push(userPayment.gradeInfo);
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

				if (allGrades.length === 0) {
					periodGrade = user.grade || 'F1';
				}

				const gradeInfo = allGradeInfos.length > 0 ? allGradeInfos[0] : '-';

				return {
					no: (page - 1) * limit + idx + 1,
					userId: userId,
					userName: user.name,
					planner: plannerAccount.name || '',
					bank: userAccount.bank || '',
					accountNumber: userAccount.accountNumber || '',
					grade: periodGrade,
					gradeInfo,
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
				}
			}
		},
		{
			$unwind: '$installments'
		},
		{
			$match: {
				'installments.weekNumber': { $in: weekNumbers },
				'installments.status': { $in: ['paid', 'pending'] }
			}
		},
		{
			$group: {
				_id: '$userId',
				userName: { $first: '$userName' },
				grades: { $push: '$baseGrade' }  // ⭐ 모든 등급 수집
			}
		},
		{
			$addFields: {
				maxGradeNum: {
					$max: {
						$map: {
							input: '$grades',
							as: 'g',
							in: { $toInt: { $substr: ['$$g', 1, -1] } }
						}
					}
				}
			}
		},
		{
			$addFields: {
				maxGrade: { $concat: ['F', { $toString: '$maxGradeNum' }] }
			}
		},
		// ⭐ 등급 필터 적용 (maxGrade로 필터링)
		...(gradeFilter ? [{ $match: { maxGrade: gradeFilter } }] : [])
	];

	// ⭐ 설계사 필터는 나중에 User 조회 시 적용
	const uniqueUsersResult = await WeeklyPaymentPlans.aggregate(uniqueUsersPipeline);

	// 3. 고유 userId 목록
	let userIds = uniqueUsersResult.map(u => u._id);

	// 설계사 필터 적용 (User 컬렉션 조회)
	if (plannerAccountId) {
		const filteredUsers = await User.find({
			_id: { $in: userIds.map(id => id) },
			plannerAccountId: new mongoose.Types.ObjectId(plannerAccountId)
		}).select('_id').lean();

		const filteredUserIds = new Set(filteredUsers.map(u => u._id.toString()));
		userIds = userIds.filter(id => filteredUserIds.has(id));
	}

	// 4. 전체 사용자 정보 조회 (페이지네이션은 나중에)
	const allUsers = await User.find({ _id: { $in: userIds } })
		.populate('plannerAccountId')
		.populate('userAccountId')
		.sort({ _id: 1 })
		.lean();

	// 6. 주차별 데이터 생성 (전체 사용자 기준)
	const weeks = [];

	for (const fridayInfo of allFridays) {
		const { friday, weekNumber: wWeek } = fridayInfo;
		const wYear = friday.getFullYear();
		const wMonth = friday.getMonth() + 1;
		const weekNumber = WeeklyPaymentPlans.getISOWeek(friday);

		// 해당 주차의 전체 사용자 지급 계획 조회
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

			// gradeInfo 생성
			const gradeInfo = payment && payment.payments && payment.payments.length > 0
				? generateGradeInfo(payment.payments)
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
				installments: payment ? payment.payments : [],
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

	// 9. 사용자 요약 정보 생성
	const users = allUsers.map((user, idx) => {
		const userId = user._id.toString();
		const userAccount = user.userAccountId || {};
		const plannerAccount = user.plannerAccountId || {};

		// 기간 전체에서 해당 사용자의 최고 등급 계산
		const gradeOrder = { F1: 1, F2: 2, F3: 3, F4: 4, F5: 5, F6: 6, F7: 7, F8: 8 };
		let currentGrade = user.grade || 'F1';

		// ⭐ 전체 기간의 gradeInfo 수집
		const allGradeInfos = [];

		weeks.forEach(week => {
			const payment = week.payments.find(p => p.userId === userId);
			if (payment && payment.grade) {
				if ((gradeOrder[payment.grade] || 0) > (gradeOrder[currentGrade] || 0)) {
					currentGrade = payment.grade;
				}
			}
			// ⭐ 각 주차의 gradeInfo 수집
			if (payment && payment.gradeInfo && payment.gradeInfo !== '-') {
				allGradeInfos.push(payment.gradeInfo);
			}
		});

		// ⭐ 전체 기간의 gradeInfo 결합 (첫 번째 주차 것 사용)
		const gradeInfo = allGradeInfos.length > 0 ? allGradeInfos[0] : '-';

		return {
			no: (page - 1) * limit + idx + 1,
			userId,
			userName: user.name,
			planner: plannerAccount.name || '',
			bank: userAccount.bank || '',
			accountNumber: userAccount.accountNumber || '',
			grade: currentGrade,
			gradeInfo,
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

	// ⭐ 페이지네이션 적용 (전체 사용자 목록에서)
	const totalUsers = users.length;
	const totalPages = Math.ceil(totalUsers / limit);
	const paginatedUsers = users.slice((page - 1) * limit, page * limit);

	// ⭐ 전체 사용자(users) 기준으로 총계 계산 (페이지 관계없이)
	const filteredUserIds = new Set(users.map(u => u.userId));

	const grandTotal = { totalAmount: 0, totalTax: 0, totalNet: 0 };
	const weeklyTotals = {};
	const monthlyTotals = {};

	weeks.forEach(week => {
		const weekKey = `${week.year}-${week.monthNumber}-${week.weekNumber}`;
		const monthKey = `month_${week.monthNumber}`;

		// 필터링된 사용자만 합산
		const filteredPayments = week.payments.filter(p => filteredUserIds.has(p.userId));

		const weekTotal = filteredPayments.reduce((sum, p) => ({
			totalAmount: sum.totalAmount + p.actualAmount,
			totalTax: sum.totalTax + p.taxAmount,
			totalNet: sum.totalNet + p.netAmount
		}), { totalAmount: 0, totalTax: 0, totalNet: 0 });

		weeklyTotals[weekKey] = weekTotal;

		grandTotal.totalAmount += weekTotal.totalAmount;
		grandTotal.totalTax += weekTotal.totalTax;
		grandTotal.totalNet += weekTotal.totalNet;

		if (!monthlyTotals[monthKey]) {
			monthlyTotals[monthKey] = { totalAmount: 0, totalTax: 0, totalNet: 0 };
		}
		monthlyTotals[monthKey].totalAmount += weekTotal.totalAmount;
		monthlyTotals[monthKey].totalTax += weekTotal.totalTax;
		monthlyTotals[monthKey].totalNet += weekTotal.totalNet;
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
			payments: paginatedUsers  // ⭐ 페이지네이션 적용된 사용자 반환
		}
	};
}
