import { getWeekOfMonthByFriday } from '$lib/utils/fridayWeekCalculator.js';

/**
 * 설계사용 Payment 관련 데이터 처리 서비스
 * paymentService와 동일하지만 API URL만 /api/planner/payment/weekly 사용
 */
export const plannerPaymentService = {
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

		const [year, month] = selectedDate.split('-');
		const weekInfo = getWeekOfMonthByFriday(new Date(selectedDate));
		const week = weekInfo.week;

		const queryParams = new URLSearchParams({
			year,
			month: parseInt(month),
			week,
			page,
			limit,
			search: searchQuery,
			searchCategory
		});

		const response = await fetch(`/api/planner/payment/weekly?${queryParams}`);
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
			apiGrandTotal: data.grandTotal || null
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
			searchCategory
		});

		const response = await fetch(`/api/planner/payment/weekly?${queryParams}`);
		const result = await response.json();

		if (!result.success || !result.data) {
			throw new Error(result.message || '데이터 로드 실패');
		}

		const data = result.data;

		// 주차별 컬럼 생성
		const weeklyColumns = (data.weeks || []).map(week => ({
			year: week.year,
			month: week.monthNumber,
			week: week.weekNumber,
			label: week.week,
			data: week
		}));

		// 사용자별 데이터 매핑
		const paymentList = (data.payments || []).map((user, index) => {
			const payments = {};

			// 주차별 지급 정보 매핑
			weeklyColumns.forEach(column => {
				const weekKey = `${column.year}_${column.month}_${column.week}`;
				const weekData = data.weeks.find(w =>
					w.year === column.year &&
					w.monthNumber === column.month &&
					w.weekNumber === column.week
				);

				const userPayment = weekData?.payments.find(p => p.userId === user.userId);

				payments[weekKey] = {
					amount: userPayment?.actualAmount || 0,
					tax: userPayment?.taxAmount || 0,
					net: userPayment?.netAmount || 0
				};
			});

			return {
				no: (page - 1) * limit + index + 1,
				userId: user.userId,
				name: user.userName || user.name || 'Unknown',
				planner: user.planner || '',
				bank: user.bank || '',
				accountNumber: user.accountNumber || '',
				grade: user.grade || 'F1',
				payments,
				totalAmount: user.totalAmount || 0,
				totalTax: user.totalTax || 0,
				totalNet: user.totalNet || 0
			};
		});

		return {
			paymentList,
			weeklyColumns,
			totalPages: data.pagination?.totalPages || 1,
			totalPaymentTargets: data.pagination?.totalItems || 0,
			apiGrandTotal: data.grandTotal || null
		};
	}
};
