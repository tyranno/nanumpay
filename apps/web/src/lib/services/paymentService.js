import { getWeekOfMonthByFriday } from '$lib/utils/fridayWeekCalculator.js';

/**
 * Payment 관련 데이터 처리 서비스
 */
export const paymentService = {
	/**
	 * 단일 날짜 또는 기간별 지급 데이터 조회
	 */
	async loadPaymentData(params) {
		const {
			filterType,
			selectedDate,
			startYear,
			startMonth,
			endYear,
			endMonth,
			page = 1,
			limit = 20,
			searchQuery = '',
			searchCategory = 'name',
			periodType = 'weekly'
		} = params;

		try {
			if (filterType === 'date') {
				return await this.loadSingleDatePayments({
					selectedDate,
					page,
					limit,
					searchQuery,
					searchCategory
				});
			} else {
				return await this.loadPeriodPayments({
					startYear,
					startMonth,
					endYear,
					endMonth,
					page,
					limit,
					searchQuery,
					searchCategory,
					periodType
				});
			}
		} catch (err) {
			console.error('Error loading payment data:', err);
			throw err;
		}
	},

	/**
	 * 단일 날짜 지급 데이터 조회
	 */
	async loadSingleDatePayments(params) {
		const { selectedDate, page, limit, searchQuery, searchCategory } = params;

		// ⭐ 금요일 기준 주차 계산 (월경계 처리)
		const weekInfo = getWeekOfMonthByFriday(new Date(selectedDate));
		
		if (!weekInfo) {
			throw new Error('주차 계산 실패');
		}

		const queryParams = new URLSearchParams({
			year: weekInfo.year,
			month: weekInfo.month,
			week: weekInfo.week,
			page,
			limit,
			search: searchQuery,
			searchCategory
		});

		const response = await fetch(`/api/admin/payment/weekly?${queryParams}`);
		const result = await response.json();

		if (!result.success || !result.data) {
			throw new Error(result.message || '데이터 로드 실패');
		}

		const data = result.data;
		const weekKey = `${data.year}_${data.monthNumber}_${data.weekNumber}`;

		return {
			paymentList: (data.payments || []).map((user, index) => ({
				...user,
				no: (page - 1) * limit + index + 1,
				name: user.userName || user.name || 'Unknown',
				planner: user.planner || '',
				payments: {
					[weekKey]: {
						amount: user.actualAmount || 0,
						tax: user.taxAmount || 0,
						net: user.netAmount || 0,
						installmentDetails: user.installments || []
					}
				}
			})),
			weeklyColumns: [{
				year: data.year,
				month: data.monthNumber,
				week: data.weekNumber,
				label: data.week,
				data
			}],
			totalPages: data.pagination?.totalPages || 1,
			totalPaymentTargets: data.pagination?.totalItems || 0,
			apiGrandTotal: data.grandTotal || null,
			weeklyTotals: data.weeklyTotals || {} // 주차별 총계
		};
	},

	/**
	 * 기간 지급 데이터 조회
	 */
	async loadPeriodPayments(params) {
		const {
			startYear,
			startMonth,
			endYear,
			endMonth,
			page,
			limit,
			searchQuery,
			searchCategory,
			periodType
		} = params;

		// 기간 유효성 검사
		const monthDiff = (endYear - startYear) * 12 + (endMonth - startMonth) + 1;
		if (monthDiff > 12) {
			throw new Error('최대 12개월까지만 조회 가능합니다.');
		}
		if (monthDiff <= 0) {
			throw new Error('종료 월이 시작 월보다 이전입니다.');
		}

		const queryParams = new URLSearchParams({
			startYear,
			startMonth,
			endYear,
			endMonth,
			page,
			limit,
			search: searchQuery,
			searchCategory,
			periodType  // ⭐ periodType 전달
		});

		const response = await fetch(`/api/admin/payment/weekly?${queryParams}`);
		const result = await response.json();

		if (!result.success || !result.data) {
			throw new Error(result.message || '데이터 로드 실패');
		}

		const data = result.data;

		let weeklyColumns;

		if (periodType === 'monthly') {
			// ⭐ 월간 보기: 월별 컬럼 생성
			const monthMap = new Map();
			(data.weeks || []).forEach(weekData => {
				const monthKey = weekData.monthNumber;
				if (!monthMap.has(monthKey)) {
					monthMap.set(monthKey, {
						year: weekData.year,
						month: weekData.monthNumber,
						label: `${weekData.year}년 ${weekData.monthNumber}월`,
						data: weekData
					});
				}
			});
			weeklyColumns = Array.from(monthMap.values());
		} else {
			// 주간 보기: 주차별 컬럼 생성
			weeklyColumns = (data.weeks || []).map(weekData => ({
				year: weekData.year,
				month: weekData.monthNumber,
				week: weekData.weekNumber,
				label: weekData.week,
				data: weekData
			}));
		}

		// 사용자별 지급 내역 처리
		const userMap = new Map();

		// API의 payments 배열로부터 사용자 기본 정보 가져오기
		if (data.payments) {
			data.payments.forEach(p => {
				userMap.set(p.userId, {
					userId: p.userId,
					name: p.userName || p.name || 'Unknown',
					planner: p.planner || '',
					bank: p.bank || '',
					accountNumber: p.accountNumber || '',
					grade: p.grade || 'F1',
					payments: {}
				});
			});
		}

		// 모든 주차 데이터를 순회하며 사용자별 지급 금액 집계
		if (data.weeks) {
			data.weeks.forEach(weekData => {
				(weekData.payments || []).forEach(payment => {
					if (userMap.has(payment.userId)) {
						const user = userMap.get(payment.userId);

						if (periodType === 'monthly') {
							// ⭐ 월간 보기: 월별로 합산
							const monthKey = `month_${weekData.monthNumber}`;
							if (!user.payments[monthKey]) {
								user.payments[monthKey] = {
									amount: 0,
									tax: 0,
									net: 0,
									installmentDetails: []
								};
							}
							user.payments[monthKey].amount += payment.actualAmount || 0;
							user.payments[monthKey].tax += payment.taxAmount || 0;
							user.payments[monthKey].net += payment.netAmount || 0;
							user.payments[monthKey].installmentDetails.push(...(payment.installments || []));
						} else {
							// 주간 보기: 주차별로 저장
							const weekKey = `${weekData.year}_${weekData.monthNumber}_${weekData.weekNumber}`;
							user.payments[weekKey] = {
								amount: payment.actualAmount || 0,
								tax: payment.taxAmount || 0,
								net: payment.netAmount || 0,
								installmentDetails: payment.installments || []
							};
						}
					}
				});
			});
		}

		const paymentList = Array.from(userMap.values()).map((user, index) => ({
			...user,
			no: (page - 1) * limit + index + 1
		}));

		return {
			paymentList,
			weeklyColumns,
			totalPages: data.pagination?.totalPages || 1,
			totalPaymentTargets: data.pagination?.totalItems || 0,
			apiGrandTotal: data.grandTotal || null,
			weeklyTotals: data.weeklyTotals || {}, // 주차별 총계
			monthlyTotals: data.monthlyTotals || {}, // 월별 총계
			allWeeklyData: weeklyColumns // 기간 조회시 전체 데이터 포함
		};
	},

	/**
	 * 전체 데이터 가져오기 (페이지네이션 없이 - Excel export용)
	 */
	async getAllPaymentData(params) {
		const {
			filterType,
			selectedDate,
			startYear,
			startMonth,
			endYear,
			endMonth,
			searchQuery = '',
			searchCategory = 'name',
			periodType = 'weekly'
		} = params;

		// limit을 충분히 크게 설정하여 전체 데이터 가져오기
		const allDataParams = {
			...params,
			page: 1,
			limit: 10000
		};

		if (filterType === 'date') {
			const result = await this.loadSingleDatePayments(allDataParams);
			return {
				users: result.paymentList,
				weeks: result.weeklyColumns.map(w => ({
					year: w.year,
					month: w.month,
					week: w.week,
					label: w.label
				}))
			};
		} else {
			const result = await this.loadPeriodPayments(allDataParams);

			if (periodType === 'monthly') {
				// 월간 표시: 월별로 데이터 집계
				const monthlyData = this.aggregateMonthlyData(result.paymentList, result.weeklyColumns);
				return monthlyData;
			} else {
				// 주간 표시
				return {
					users: result.paymentList,
					weeks: result.weeklyColumns.map(w => ({
						year: w.year,
						month: w.month,
						week: w.week,
						label: w.label
					}))
				};
			}
		}
	},

	/**
	 * 월별 데이터 집계
	 */
	aggregateMonthlyData(users, weeks) {
		const monthlyMap = new Map();
		const monthlyPeriods = [];

		// 월별 기간 생성
		weeks.forEach(weekData => {
			const monthKey = `${weekData.year}_${weekData.month}`;

			if (!monthlyMap.has(monthKey)) {
				monthlyMap.set(monthKey, {
					year: weekData.year,
					month: weekData.month,
					label: `${weekData.year}년 ${weekData.month}월`
				});
				monthlyPeriods.push({
					year: weekData.year,
					month: weekData.month,
					label: `${weekData.year}년 ${weekData.month}월`
				});
			}
		});

		// 사용자별 월간 데이터 집계
		const monthlyUsers = users.map((user, index) => {
			const monthlyPayments = {};

			// 각 월별로 해당 월의 모든 주차 데이터를 합산
			monthlyPeriods.forEach(period => {
				const monthKey = `${period.year}_${period.month}`;
				let monthTotal = { amount: 0, tax: 0, net: 0 };

				// 해당 월의 모든 주차 찾아서 합산
				weeks.forEach(weekData => {
					if (weekData.year === period.year && weekData.month === period.month) {
						const weekKey = `${weekData.year}_${weekData.month}_${weekData.week}`;
						const weekPayment = user.payments[weekKey];
						if (weekPayment) {
							monthTotal.amount += weekPayment.amount || 0;
							monthTotal.tax += weekPayment.tax || 0;
							monthTotal.net += weekPayment.net || 0;
						}
					}
				});

				monthlyPayments[monthKey] = monthTotal;
			});

			return {
				...user,
				no: index + 1,
				payments: monthlyPayments
			};
		});

		return {
			users: monthlyUsers,
			weeks: monthlyPeriods
		};
	},

	/**
	 * 과거 지급 일괄 처리
	 */
	async processPastPayments() {
		const response = await fetch('/api/admin/payment/process-past', {
			method: 'POST'
		});
		const result = await response.json();

		if (!result.success) {
			throw new Error(result.message || '과거 지급 처리 실패');
		}

		return result.data;
	}
};