<script>
	import { onMount } from 'svelte';
	import * as XLSX from 'xlsx';
	import ExcelJS from 'exceljs';
	import FileSaver from 'file-saver';
	import { getWeekOfMonthByFriday } from '$lib/utils/fridayWeekCalculator.js';
	import Pagination from '$lib/components/Pagination.svelte';
	const { saveAs } = FileSaver;

	// 상태 변수
	let paymentList = [];
	let filteredPaymentList = [];
	let weeklyColumns = [];
	let isLoading = false;
	let error = '';

	// 필터 옵션
	let filterType = 'date'; // 'date' or 'period'
	// 오늘 날짜를 자동으로 설정
	let today = new Date();
	let selectedDate = today.toISOString().split('T')[0];
	let selectedYear = today.getFullYear();
	let selectedMonth = today.getMonth() + 1;
	let periodType = 'weekly'; // 'weekly' or 'monthly'
	let currentWeekOffset = 0; // 주간 이동을 위한 오프셋
	let displayStartIndex = 0; // 표시 시작 인덱스
	let allWeeklyData = []; // 전체 로드한 데이터

	// 마지막 로드한 기간 저장 (재로드 판단용)
	let lastLoadedStartYear = null;
	let lastLoadedStartMonth = null;
	let lastLoadedEndYear = null;
	let lastLoadedEndMonth = null;

	// 기간 선택용 시작/종료 년월
	let startYear = today.getFullYear();
	let startMonth = today.getMonth() + 1;
	let endYear = today.getFullYear();
	let endMonth = today.getMonth() + 1;

	// 검색 및 페이지네이션
	let searchQuery = '';
	let searchCategory = 'name'; // 'name' 또는 'planner'
	let currentPage = 1;
	let itemsPerPage = 20;
	let totalPages = 1;

	// 컬럼 표시 토글
	let showTaxColumn = true; // 원천징수 컬럼 표시 여부
	let showNetColumn = true; // 실지급액 컬럼 표시 여부

	// 전체 총액 (API에서 받은 grandTotal)
	let apiGrandTotal = null;
	// 전체 지급 대상 인원수 (API에서 받은 totalItems)
	let totalPaymentTargets = 0;

	// 주차 계산 함수 (금요일 기준) - DEPRECATED: API에서 직접 처리하므로 불필요
	// fridayWeekCalculator의 getWeekOfMonthByFriday 사용

	// 데이터 로드 (페이지네이션 포함)
	async function loadPaymentData(page = 1) {
		isLoading = true;
		error = '';
		weeklyColumns = [];
		paymentList = [];
		currentPage = page;

		try {
			if (filterType === 'date') {
				// 단일 날짜 조회 (금요일 기준 주차 계산)
				const [year, month, day] = selectedDate.split('-');
				const weekInfo = getWeekOfMonthByFriday(new Date(selectedDate));
				const week = weekInfo.week;

				// 서버 사이드 페이지네이션 파라미터 포함
				const params = new URLSearchParams({
					year,
					month: parseInt(month),
					week,
					page: currentPage,
					limit: itemsPerPage,
					search: searchQuery,
					searchCategory: searchCategory
				});

				const response = await fetch(`/api/admin/payment/weekly?${params}`);
				const result = await response.json();

				if (result.success && result.data) {
					// 서버에서 페이지네이션 정보 받아오기
					if (result.data.pagination) {
						totalPages = result.data.pagination.totalPages;
						// 전체 아이템 수도 설정
						totalPaymentTargets = result.data.pagination.totalItems || 0;
					}
					// API에서 전체 검색 결과의 총액 받아오기
					if (result.data.grandTotal) {
						apiGrandTotal = result.data.grandTotal;
					}
					weeklyColumns = [
						{
							year: result.data.year,
							month: result.data.monthNumber,
							week: result.data.weekNumber,
							label: result.data.week,
							data: result.data
						}
					];
					// 서버에서 받은 payments를 직접 사용하고 인덱스 추가
					const weekKey = `${result.data.year}_${result.data.monthNumber}_${result.data.weekNumber}`;
					paymentList = (result.data.payments || []).map((user, index) => ({
						...user,
						no: (currentPage - 1) * itemsPerPage + index + 1,
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
					}));
					filteredPaymentList = paymentList;
				}
			} else {
				// 기간 조회
				// 선택된 기간의 월 수 계산
				const monthDiff = (endYear - startYear) * 12 + (endMonth - startMonth) + 1;

				if (monthDiff > 12) {
					error = '최대 12개월까지만 조회 가능합니다.';
					isLoading = false;
					return;
				}

				if (monthDiff <= 0) {
					error = '종료 월이 시작 월보다 이전입니다.';
					isLoading = false;
					return;
				}

				// 기간이 변경되거나 검색어가 변경되면 새로 로드
				const needReload = !allWeeklyData.length ||
					lastLoadedStartYear !== startYear ||
					lastLoadedStartMonth !== startMonth ||
					lastLoadedEndYear !== endYear ||
					lastLoadedEndMonth !== endMonth;

				if (needReload) {
					displayStartIndex = 0;

					// 마지막 로드 정보 저장
					lastLoadedStartYear = startYear;
					lastLoadedStartMonth = startMonth;
					lastLoadedEndYear = endYear;
					lastLoadedEndMonth = endMonth;
				}

				// 전체 기간 데이터를 페이지별로 로드
				const params = new URLSearchParams({
					startYear: startYear,
					startMonth: startMonth,
					endYear: endYear,
					endMonth: endMonth,
					page: page,
					limit: itemsPerPage,
					search: searchQuery,
					searchCategory: searchCategory
				});

				const response = await fetch(`/api/admin/payment/weekly?${params}`);
				const result = await response.json();

				if (result.success && result.data) {
					// 페이지네이션 정보
					if (result.data.pagination) {
						totalPages = result.data.pagination.totalPages;
						totalPaymentTargets = result.data.pagination.totalItems || 0;
					}

					// 전체 총액
					if (result.data.grandTotal) {
						apiGrandTotal = result.data.grandTotal;
					}

					// 주차별 데이터를 weeklyColumns에 설정
					if (result.data.weeks && result.data.weeks.length > 0) {
						weeklyColumns = result.data.weeks.map(weekData => ({
							year: weekData.year,
							month: weekData.monthNumber,
							week: weekData.weekNumber,
							label: weekData.week,
							data: weekData
						}));
					}

					// 사용자별 지급 내역 처리 - weeks 데이터로부터 user.payments 구조 생성
					const userMap = new Map();

					// API의 payments 배열로부터 사용자 기본 정보 및 최신 등급 가져오기
					if (result.data.payments) {
						result.data.payments.forEach(p => {
							userMap.set(p.userId, {
								userId: p.userId,
								name: p.userName || p.name || 'Unknown',
								planner: p.planner || '',
								bank: p.bank || '',
								accountNumber: p.accountNumber || '',
								grade: p.grade || 'F1',  // payments 배열에서 최신 등급 사용
								payments: {}
							});
						});
					}

					// 모든 주차 데이터를 순회하며 사용자별 주차별 지급 금액 집계
					if (result.data.weeks) {
						result.data.weeks.forEach(weekData => {
							const weekKey = `${weekData.year}_${weekData.monthNumber}_${weekData.weekNumber}`;

							(weekData.payments || []).forEach(payment => {
								// 이미 userMap에 추가된 사용자만 처리
								if (userMap.has(payment.userId)) {
									const user = userMap.get(payment.userId);
									user.payments[weekKey] = {
										amount: payment.actualAmount || 0,
										tax: payment.taxAmount || 0,
										net: payment.netAmount || 0,
										installmentDetails: payment.installments || []
									};
								}
							});
						});
					}

					paymentList = Array.from(userMap.values()).map((user, index) => ({
						...user,
						no: (currentPage - 1) * itemsPerPage + index + 1
					}));

					filteredPaymentList = paymentList;
				}
			}
		} catch (err) {
			console.error('Error loading payment data:', err);
			error = err.message;
		} finally {
			isLoading = false;
		}
	}

	// 표시 데이터 업데이트 (이미 로드한 데이터에서 범위만 변경)
	function updateDisplayData() {
		if (allWeeklyData.length === 0) return;

		if (periodType === 'monthly') {
			// 월간 표시: 월별로 데이터 집계 후 전체 표시
			const monthlyData = aggregateMonthlyData(allWeeklyData);
			weeklyColumns = monthlyData;
		} else {
			// 주간 표시: 전체 주차 표시
			weeklyColumns = allWeeklyData;
		}

		processPaymentData();
	}

	// 월별 데이터 집계
	function aggregateMonthlyData(weeklyData) {
		const monthlyMap = new Map();

		// 주간 데이터를 월별로 그룹화
		weeklyData.forEach((week) => {
			const monthKey = `${week.year}-${week.month}`;

			if (!monthlyMap.has(monthKey)) {
				monthlyMap.set(monthKey, {
					year: week.year,
					month: week.month,
					label: `${week.year}년 ${week.month}월`,
					data: {
						payments: [],
						totalAmount: 0,
						totalTax: 0,
						totalNet: 0
					}
				});
			}

			const monthData = monthlyMap.get(monthKey);

			// 해당 월의 주간 데이터 합산
			if (week.data.payments) {
				week.data.payments.forEach((payment) => {
					// 사용자별로 합산
					const existingUser = monthData.data.payments.find((p) => p.userId === payment.userId);

					if (existingUser) {
						existingUser.actualAmount += payment.actualAmount || 0;
						existingUser.taxAmount += payment.taxAmount || 0;
						existingUser.netAmount += payment.netAmount || 0;
					} else {
						monthData.data.payments.push({
							userId: payment.userId,
							userName: payment.userName,
							bank: payment.bank,
							accountNumber: payment.accountNumber,
							actualAmount: payment.actualAmount || 0,
							taxAmount: payment.taxAmount || 0,
							netAmount: payment.netAmount || 0
						});
					}
				});

				monthData.data.totalAmount += week.data.totalAmount || 0;
				monthData.data.totalTax += week.data.totalTax || 0;
				monthData.data.totalNet += week.data.totalNet || 0;
			}
		});

		return Array.from(monthlyMap.values());
	}

	// 데이터 처리
	function processPaymentData() {
	
		if (weeklyColumns.length === 0) {
			paymentList = [];
			return;
		}

		// 모든 사용자 수집
		const userMap = new Map();

		weeklyColumns.forEach((column) => {
			if (column.data.payments) {
				column.data.payments.forEach((payment) => {
					if (!userMap.has(payment.userId)) {
						userMap.set(payment.userId, {
							userId: payment.userId,
							name: payment.userName,
							planner: payment.planner,
							bank: payment.bank,
							accountNumber: payment.accountNumber,
							grade: payment.grade || 'F1',
							payments: {}
						});
					}

					// 키 생성: 주간이면 year_month_week, 월간이면 month_월
					const key =
						periodType === 'monthly'
							? `month_${column.month}`
							: `${column.year}_${column.month}_${column.week}`;

					userMap.get(payment.userId).payments[key] = {
						amount: payment.actualAmount || 0,
						tax: payment.taxAmount || 0,
						net: payment.netAmount || 0,
						installmentDetails: payment.installmentDetails || []
					};
				});
			}
		});

		paymentList = Array.from(userMap.values()).map((user, index) => ({
			...user,
			no: (currentPage - 1) * itemsPerPage + index + 1
		}));


		// 검색 필터 적용
		filterPayments();
	}

	// 검색 필터링 (서버 사이드 페이지네이션이므로 필터링 없이 그대로 사용)
	function filterPayments() {
		// 서버에서 이미 필터링된 데이터를 받으므로
		// 클라이언트에서 추가 필터링하지 않음
		filteredPaymentList = paymentList;
	}

	// 현재 페이지의 데이터 가져오기 (서버 사이드 페이지네이션이므로 그대로 반환)
	function getCurrentPageData() {
		return filteredPaymentList;
	}

	// 페이지 변경 (서버에서 데이터 다시 가져오기)
	function goToPage(page) {
		if (page >= 1 && page <= totalPages) {
			loadPaymentData(page);
		}
	}

	// 검색어 변경 핸들러 (서버에 새로운 검색 요청)
	function handleSearch() {
		loadPaymentData(1); // 검색 시 첫 페이지로
	}

	// Enter 키로 검색
	function handleKeyPress(event) {
		if (event.key === 'Enter') {
			handleSearch();
		}
	}

	// 페이지당 항목 수 변경
	function handleItemsPerPageChange() {
		loadPaymentData(1); // 항목 수 변경 시 첫 페이지로
	}

	// 금액 포맷
	function formatAmount(amount) {
		if (!amount && amount !== 0) return '-';
		return amount.toLocaleString();
	}

	// 컬럼별 합계 계산
	function calculateColumnTotal(week) {
		const key = week.week || `month_${week.month}`;
		let totalAmount = 0;
		let totalTax = 0;
		let totalNet = 0;

		filteredPaymentList.forEach((user) => {
			const payment = user.payments[key];
			if (payment) {
				totalAmount += payment.amount || 0;
				totalTax += payment.tax || 0;
				totalNet += payment.net || 0;
			}
		});

		return { amount: totalAmount, tax: totalTax, net: totalNet };
	}

	// 전체 합계 계산 (API에서 받은 전체 검색 결과의 총액 사용)
	function calculateGrandTotal() {
		// API에서 받은 grandTotal이 있으면 그것을 사용 (검색 기간의 전체 총액)
		if (apiGrandTotal && apiGrandTotal.totalAmount !== undefined) {
			return {
				amount: apiGrandTotal.totalAmount || 0,
				tax: apiGrandTotal.totalTax || 0,
				net: apiGrandTotal.totalNet || 0
			};
		}

		// API 데이터가 없는 경우 현재 페이지 데이터로 계산 (fallback)
		let grandTotal = { amount: 0, tax: 0, net: 0 };

		weeklyColumns.forEach((week) => {
			const total = calculateColumnTotal(week);
			grandTotal.amount += total.amount;
			grandTotal.tax += total.tax;
			grandTotal.net += total.net;
		});

		return grandTotal;
	}

	// 전체 데이터 가져오기 (페이지네이션 없이)
	async function getAllPaymentData() {
		try {
			if (filterType === 'date') {
				// 단일 날짜 조회
				const [year, month, day] = selectedDate.split('-');
				const weekInfo = getWeekOfMonthByFriday(new Date(selectedDate));
				const week = weekInfo.week;

				const params = new URLSearchParams({
					year,
					month: parseInt(month),
					week,
					page: 1,
					limit: 10000, // 충분히 큰 값
					search: searchQuery,
					searchCategory: searchCategory
				});

				const response = await fetch(`/api/admin/payment/weekly?${params}`);
				const result = await response.json();

				if (result.success && result.data) {
					const weekKey = `${result.data.year}_${result.data.monthNumber}_${result.data.weekNumber}`;
					const allWeeks = [{
						year: result.data.year,
						month: result.data.monthNumber,
						week: result.data.weekNumber,
						label: result.data.week
					}];
					
					const users = (result.data.payments || []).map((user, index) => ({
						...user,
						no: index + 1,
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
					}));
					
					return { users, weeks: allWeeks };
				}
			} else {
				// 기간 조회
				const params = new URLSearchParams({
					startYear: startYear,
					startMonth: startMonth,
					endYear: endYear,
					endMonth: endMonth,
					page: 1,
					limit: 10000, // 충분히 큰 값
					search: searchQuery,
					searchCategory: searchCategory
				});

				const response = await fetch(`/api/admin/payment/weekly?${params}`);
				const result = await response.json();

				if (result.success && result.data) {
					// 기간 조회 데이터 처리
					const weeks = result.data.weeks || [];
					const allUsers = new Map();
					
					// 전체 주차 정보 생성
					const allWeeks = weeks.map(weekData => ({
						year: weekData.year,
						month: weekData.monthNumber,
						week: weekData.weekNumber,
						label: weekData.week
					}));

					weeks.forEach(weekData => {
						const weekKey = `${weekData.year}_${weekData.monthNumber}_${weekData.weekNumber}`;
						(weekData.payments || []).forEach(payment => {
							const userId = payment.userId;
							if (!allUsers.has(userId)) {
								allUsers.set(userId, {
									userId: payment.userId,
									name: payment.userName || payment.name || 'Unknown',
									planner: payment.planner || '',
									bank: payment.bank || '',
									accountNumber: payment.accountNumber || '',
									payments: {}
								});
							}
							const user = allUsers.get(userId);
							user.payments[weekKey] = {
								amount: payment.actualAmount || 0,
								tax: payment.taxAmount || 0,
								net: payment.netAmount || 0,
								installmentDetails: payment.installments || []
							};
						});
					});

					const users = Array.from(allUsers.values()).map((user, index) => ({
						...user,
						no: index + 1
					}));
					
					// periodType에 따라 다른 데이터 구조 반환
					if (periodType === 'monthly') {
						// 월간 표시: 월별로 데이터 집계
						const monthlyMap = new Map();
						const monthlyPeriods = [];
						
						weeks.forEach(weekData => {
							const monthKey = `${weekData.year}_${weekData.monthNumber}`;
							
							if (!monthlyMap.has(monthKey)) {
								monthlyMap.set(monthKey, {
									year: weekData.year,
									month: weekData.monthNumber,
									label: `${weekData.year}년 ${weekData.monthNumber}월`
								});
								monthlyPeriods.push({
									year: weekData.year,
									month: weekData.monthNumber,
									label: `${weekData.year}년 ${weekData.monthNumber}월`
								});
							}
						});
						
						// 사용자별 월간 데이터 집계
						const monthlyUsers = Array.from(allUsers.values()).map((user, index) => {
							const monthlyPayments = {};
							
							// 각 월별로 해당 월의 모든 주차 데이터를 합산
							monthlyPeriods.forEach(period => {
								const monthKey = `${period.year}_${period.month}`;
								let monthTotal = { amount: 0, tax: 0, net: 0 };
								
								// 해당 월의 모든 주차 찾아서 합산
								weeks.forEach(weekData => {
									if (weekData.year === period.year && weekData.monthNumber === period.month) {
										const weekKey = `${weekData.year}_${weekData.monthNumber}_${weekData.weekNumber}`;
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
								userId: user.userId,
								name: user.name,
								planner: user.planner,
								bank: user.bank,
								accountNumber: user.accountNumber,
								no: index + 1,
								payments: monthlyPayments
							};
						});
						
						return { users: monthlyUsers, weeks: monthlyPeriods };
					} else {
						// 주간 표시: 주차별 데이터 그대로 반환
						return { users, weeks: allWeeks };
					}
				}
			}
			return { users: [], weeks: [] };
		} catch (err) {
			console.error('Error fetching all payment data:', err);
			return { users: [], weeks: [] };
		}
	}

	// 엑셀 Export 기능 (ExcelJS로 완전한 스타일 적용)
	async function exportToExcel() {
		// 전체 데이터 가져오기
		const { users: allData, weeks: allWeeks } = await getAllPaymentData();
		
		if (allData.length === 0) {
			alert('다운로드할 데이터가 없습니다.');
			return;
		}

		const workbook = new ExcelJS.Workbook();
		const worksheet = workbook.addWorksheet('용역비 지급명부');

		const totalCols = 5 + allWeeks.length * 3;

		// 조회 조건 정보
		let periodInfo = '';
		if (filterType === 'date') {
			const date = new Date(selectedDate);
			const weekInfo = getWeekOfMonthByFriday(date);
			periodInfo = `${date.getFullYear()}년 ${date.getMonth() + 1}월 ${weekInfo.week}주차 (${selectedDate})`;
		} else {
			periodInfo = `${startYear}년 ${startMonth}월 ~ ${endYear}년 ${endMonth}월 (${periodType === 'weekly' ? '주간' : '월간'} 표시)`;
		}

		const searchInfo = searchQuery
			? `${searchCategory === 'name' ? '이름' : '설계자'}: ${searchQuery}`
			: '전체';

		// 전체 데이터로 합계 계산
		const calculateAllDataTotal = (data, week) => {
			// periodType에 따라 다른 키 생성
			const key = (filterType === 'period' && periodType === 'monthly')
				? `${week.year}_${week.month}`
				: `${week.year}_${week.month}_${week.week}`;
			
			let totalAmount = 0;
			let totalTax = 0;
			let totalNet = 0;

			data.forEach((user) => {
				const payment = user.payments[key];
				if (payment) {
					totalAmount += payment.amount || 0;
					totalTax += payment.tax || 0;
					totalNet += payment.net || 0;
				}
			});

			return { amount: totalAmount, tax: totalTax, net: totalNet };
		};

		// 전체 합계 계산
		let totalSummary = { amount: 0, tax: 0, net: 0 };
		allWeeks.forEach((week) => {
			const total = calculateAllDataTotal(allData, week);
			totalSummary.amount += total.amount;
			totalSummary.tax += total.tax;
			totalSummary.net += total.net;
		});

		// 1. 제목 행
		const titleRow = worksheet.addRow(['용역비 지급명부']);
		worksheet.mergeCells(1, 1, 1, totalCols);
		titleRow.height = 30;
		titleRow.getCell(1).font = { bold: true, size: 16, color: { argb: 'FF1F4788' } };
		titleRow.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE3F2FD' } };
		titleRow.getCell(1).alignment = { vertical: 'middle', horizontal: 'center' };
		// 제목은 테두리 없음

		// 2. 빈 행
		worksheet.addRow([]);

		// 3. 조회 기간
		const periodRow = worksheet.addRow(['조회 기간:', periodInfo]);
		periodRow.getCell(1).font = { bold: true, size: 11 };
		periodRow.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF5F5F5' } };
		periodRow.getCell(1).border = {
			top: { style: 'thin', color: { argb: 'FFDDDDDD' } },
			bottom: { style: 'thin', color: { argb: 'FFDDDDDD' } },
			left: { style: 'thin', color: { argb: 'FFDDDDDD' } },
			right: { style: 'thin', color: { argb: 'FFDDDDDD' } }
		};
		periodRow.getCell(2).alignment = { vertical: 'middle', horizontal: 'left' };

		// 4. 검색 조건
		const searchRow = worksheet.addRow(['검색 조건:', searchInfo]);
		searchRow.getCell(1).font = { bold: true, size: 11 };
		searchRow.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF5F5F5' } };
		searchRow.getCell(1).border = {
			top: { style: 'thin', color: { argb: 'FFDDDDDD' } },
			bottom: { style: 'thin', color: { argb: 'FFDDDDDD' } },
			left: { style: 'thin', color: { argb: 'FFDDDDDD' } },
			right: { style: 'thin', color: { argb: 'FFDDDDDD' } }
		};
		searchRow.getCell(2).alignment = { vertical: 'middle', horizontal: 'left' };

		// 5. 총액 정보
		const summaryRow = worksheet.addRow([
			'총 지급액:', `${totalSummary.amount.toLocaleString()}원`, '',
			'총 원천징수:', `${totalSummary.tax.toLocaleString()}원`, '',
			'총 실지급액:', `${totalSummary.net.toLocaleString()}원`
		]);
		[1, 4, 7].forEach(col => {
			summaryRow.getCell(col).font = { bold: true, size: 11 };
			summaryRow.getCell(col).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF3E0' } };
			summaryRow.getCell(col).border = {
				top: { style: 'thin', color: { argb: 'FFDDDDDD' } },
				bottom: { style: 'thin', color: { argb: 'FFDDDDDD' } },
				left: { style: 'thin', color: { argb: 'FFDDDDDD' } },
				right: { style: 'thin', color: { argb: 'FFDDDDDD' } }
			};
		});
		[2, 5, 8].forEach(col => {
			summaryRow.getCell(col).font = { bold: true, size: 12, color: { argb: 'FFE65100' } };
			summaryRow.getCell(col).alignment = { vertical: 'middle', horizontal: 'right' };
		});

		// 6. 지급 대상
		const targetRow = worksheet.addRow(['지급 대상:', `${allData.length}명`]);
		targetRow.getCell(1).font = { bold: true, size: 11 };
		targetRow.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF5F5F5' } };
		targetRow.getCell(1).border = {
			top: { style: 'thin', color: { argb: 'FFDDDDDD' } },
			bottom: { style: 'thin', color: { argb: 'FFDDDDDD' } },
			left: { style: 'thin', color: { argb: 'FFDDDDDD' } },
			right: { style: 'thin', color: { argb: 'FFDDDDDD' } }
		};
		targetRow.getCell(2).alignment = { vertical: 'middle', horizontal: 'left' };

		// 7. 빈 행
		worksheet.addRow([]);

		// 8. 테이블 헤더 1행 (주차 정보)
		const headerRow1Data = ['순번', '성명', '설계자', '은행', '계좌번호'];
		allWeeks.forEach(week => {
			headerRow1Data.push(week.label, '', '');  // 3칸 차지: 레이블 + 빈칸 2개
		});
		const headerRow1 = worksheet.addRow(headerRow1Data);
		headerRow1.height = 25;
		// 개별 셀에 스타일 적용
		for (let i = 1; i <= 5 + allWeeks.length * 3; i++) {
			headerRow1.getCell(i).font = { bold: true };
			headerRow1.getCell(i).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8E8E8' } };
			headerRow1.getCell(i).alignment = { vertical: 'middle', horizontal: 'center' };
		}

		// 고정 컬럼 병합
		for (let i = 1; i <= 5; i++) {
			worksheet.mergeCells(headerRow1.number, i, headerRow1.number + 1, i);
		}

		// 주차 헤더 병합 및 색상
		let colStart = 6;
		allWeeks.forEach(() => {
			worksheet.mergeCells(headerRow1.number, colStart, headerRow1.number, colStart + 2);
			[colStart, colStart + 1, colStart + 2].forEach(c => {
				headerRow1.getCell(c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD0E0F0' } };
			});
			colStart += 3;
		});

		// 9. 테이블 헤더 2행 (세부 항목)
		const headerRow2Data = ['', '', '', '', ''];
		allWeeks.forEach(() => {
			headerRow2Data.push('지급액', '원천징수(3.3%)', '실지급액');
		});
		const headerRow2 = worksheet.addRow(headerRow2Data);
		// 개별 셀에 스타일 적용 (세부 항목 헤더)
		for (let i = 6; i <= 5 + allWeeks.length * 3; i++) {
			headerRow2.getCell(i).font = { bold: true };
			headerRow2.getCell(i).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8E8E8' } };
			headerRow2.getCell(i).alignment = { vertical: 'middle', horizontal: 'center' };
		}

		// 10. 데이터 행
		allData.forEach(user => {
			const rowData = [
				user.no,
				user.name,
				user.planner || '',
				user.bank || '',
				user.accountNumber || ''
			];

			allWeeks.forEach(week => {
				// periodType에 따라 다른 키 생성
				const key = (filterType === 'period' && periodType === 'monthly')
					? `${week.year}_${week.month}`
					: `${week.year}_${week.month}_${week.week}`;
				const payment = user.payments[key];
				rowData.push(
					payment?.amount || 0,
					payment?.tax || 0,
					payment?.net || 0
				);
			});

			const dataRow = worksheet.addRow(rowData);
			dataRow.alignment = { vertical: 'middle', horizontal: 'center' };

			// 금액 컬럼 스타일
			let col = 6;
			allWeeks.forEach(() => {
				// 지급액
				dataRow.getCell(col).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFFCC' } };
				dataRow.getCell(col).font = { bold: true };
				dataRow.getCell(col).numFmt = '#,##0';
				dataRow.getCell(col).alignment = { vertical: 'middle', horizontal: 'right' };

				// 원천징수
				dataRow.getCell(col + 1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFEEEE' } };
				dataRow.getCell(col + 1).font = { color: { argb: 'FFD9534F' } };
				dataRow.getCell(col + 1).numFmt = '#,##0';
				dataRow.getCell(col + 1).alignment = { vertical: 'middle', horizontal: 'right' };

				// 실지급액
				dataRow.getCell(col + 2).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8F5E9' } };
				dataRow.getCell(col + 2).numFmt = '#,##0';
				dataRow.getCell(col + 2).alignment = { vertical: 'middle', horizontal: 'right' };

				col += 3;
			});
		});

		// 11. 합계 행
		const totalRowData = ['', '', '', '', '합계'];
		allWeeks.forEach(week => {
			const total = calculateAllDataTotal(allData, week);
			totalRowData.push(total.amount, total.tax, total.net);
		});
		const totalRow = worksheet.addRow(totalRowData);
		// 개별 셀에 스타일 적용 (합계 행)
		for (let i = 1; i <= totalCols; i++) {
			totalRow.getCell(i).font = { bold: true };
			totalRow.getCell(i).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF0F0F0' } };
			totalRow.getCell(i).alignment = { vertical: 'middle', horizontal: 'center' };
		}
		for (let i = 6; i <= totalCols; i++) {
			totalRow.getCell(i).numFmt = '#,##0';
			totalRow.getCell(i).alignment = { vertical: 'middle', horizontal: 'right' };
		}

		// 12. 총합계 행
		const grandTotalData = ['', '', '', '', '총합계'];
		grandTotalData.push(totalSummary.amount, totalSummary.tax, totalSummary.net);
		allWeeks.slice(1).forEach(() => {
			grandTotalData.push('', '', '');
		});
		const grandTotalRow = worksheet.addRow(grandTotalData);
		// 개별 셀에 스타일 적용 (총합계 행)
		for (let i = 1; i <= totalCols; i++) {
			grandTotalRow.getCell(i).font = { bold: true, size: 12, color: { argb: 'FFE65100' } };
			grandTotalRow.getCell(i).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFE0B2' } };
			grandTotalRow.getCell(i).alignment = { vertical: 'middle', horizontal: 'center' };
		}
		for (let i = 6; i <= 8; i++) {
			grandTotalRow.getCell(i).numFmt = '#,##0';
			grandTotalRow.getCell(i).alignment = { vertical: 'middle', horizontal: 'right' };
		}

		// 테이블 영역 테두리
		const tableStartRow = headerRow1.number;
		const tableEndRow = grandTotalRow.number;
		for (let r = tableStartRow; r <= tableEndRow; r++) {
			for (let c = 1; c <= totalCols; c++) {
				const cell = worksheet.getRow(r).getCell(c);
				cell.border = {
					top: { style: 'thin', color: { argb: 'FF000000' } },
					bottom: { style: 'thin', color: { argb: 'FF000000' } },
					left: { style: 'thin', color: { argb: 'FF000000' } },
					right: { style: 'thin', color: { argb: 'FF000000' } }
				};
			}
		}

		// 컬럼 너비 설정
		worksheet.getColumn(1).width = 15;
		worksheet.getColumn(2).width = 12;
		worksheet.getColumn(3).width = 12;
		worksheet.getColumn(4).width = 12;
		worksheet.getColumn(5).width = 18;
		for (let i = 6; i <= totalCols; i++) {
			worksheet.getColumn(i).width = 14;
		}

		// 파일명 생성
		const today = new Date();
		const fileName = `용역비지급명부_${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, '0')}${String(today.getDate()).padStart(2, '0')}.xlsx`;

		// 파일 생성 및 다운로드
		const buffer = await workbook.xlsx.writeBuffer();
		const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
		saveAs(blob, fileName);
	}

	// 과거 지급 일괄 처리
	let isProcessingPast = false;
	async function processPastPayments() {
		if (!confirm('오늘 이전의 모든 pending 지급을 자동으로 처리합니다. 계속하시겠습니까?')) {
			return;
		}

		isProcessingPast = true;
		try {
			const response = await fetch('/api/admin/payment/process-past', {
				method: 'POST'
			});
			const result = await response.json();

			if (result.success) {
				alert(`과거 지급 일괄 처리 완료!\n\n처리된 주차: ${result.data.processedWeeks}개\n총 지급 건수: ${result.data.totalPayments}건`);
				// 현재 페이지 새로고침
				loadPaymentData(currentPage);
			} else {
				alert(`오류: ${result.message}`);
			}
		} catch (error) {
			console.error('과거 지급 처리 실패:', error);
			alert(`오류: ${error.message}`);
		} finally {
			isProcessingPast = false;
		}
	}

	// 필터 타입 변경
	function handleFilterTypeChange() {
		loadPaymentData();
	}

	// 기간 선택 변경
	function handlePeriodChange() {
		currentWeekOffset = 0; // 오프셋 초기화
		displayStartIndex = 0; // 표시 인덱스 초기화

		// 기간이 변경되면 항상 새로 로드 (총액 계산을 위해 필수)
		allWeeklyData = [];
		lastLoadedStartYear = startYear;
		lastLoadedStartMonth = startMonth;
		lastLoadedEndYear = endYear;
		lastLoadedEndMonth = endMonth;

		if (filterType === 'period') {
			loadPaymentData(1);
		}
	}

	// 이전 주로 이동 (데이터 다시 로드하지 않고 표시만 변경)
	function movePreviousWeek() {
		if (filterType === 'period' && allWeeklyData.length > 0) {
			if (displayStartIndex > 0) {
				displayStartIndex -= 1;
				updateDisplayData();
			}
		} else {
			// 날짜 선택 모드에서는 기존 방식대로
			if (currentWeekOffset > 0) {
				currentWeekOffset -= 1;
				loadPaymentData(1);
			}
		}
	}

	// 다음 주로 이동 (데이터 다시 로드하지 않고 표시만 변경)
	function moveNextWeek() {
		if (filterType === 'period' && allWeeklyData.length > 0) {
			if (periodType === 'monthly') {
				// 월간 모드: aggregateMonthlyData로 처리된 데이터의 길이 확인
				const monthlyData = aggregateMonthlyData(allWeeklyData);
				if (displayStartIndex < monthlyData.length - 1) {
					displayStartIndex += 1;
					updateDisplayData();
				}
			} else {
				// 주간 모드
				if (displayStartIndex < allWeeklyData.length - 1) {
					displayStartIndex += 1;
					updateDisplayData();
				}
			}
		} else {
			// 날짜 선택 모드에서는 기존 방식대로
			const monthDiff = (endYear - startYear) * 12 + (endMonth - startMonth) + 1;
			const totalWeeks = monthDiff * 4;
			if (currentWeekOffset + 1 < totalWeeks) {
				currentWeekOffset += 1;
				loadPaymentData(1);
			}
		}
	}


	onMount(() => {
		loadPaymentData();
	});
</script>

<svelte:head>
	<title>용역비 지급명부</title>
</svelte:head>

<div class="container">
	<!-- 제목 -->
	<h1 class="title">용역비 지급명부</h1>

	<!-- 필터 영역 -->
	<div class="filter-section">
		<div class="filter-box">
			<div class="filter-content">
				<div class="filter-row">
					<label class="radio-label">
						<input
							type="radio"
							bind:group={filterType}
							value="date"
							onchange={handleFilterTypeChange}
						/>
						<span>주간</span>
					</label>
					{#if filterType === 'date'}
						<input
							type="date"
							bind:value={selectedDate}
							onchange={loadPaymentData}
							class="date-input"
						/>
					{/if}

					<div class="divider"></div>

					<label class="radio-label">
						<input
							type="radio"
							bind:group={filterType}
							value="period"
							onchange={handleFilterTypeChange}
						/>
						<span>기간</span>
					</label>
				</div>
				{#if filterType === 'period'}
					<div class="period-controls">
						<input
							type="number"
							bind:value={startYear}
							onchange={handlePeriodChange}
							class="year-input"
							min="2020"
							max="2030"
						/>
						<span>년</span>
						<select bind:value={startMonth} onchange={handlePeriodChange} class="month-input">
							{#each Array(12) as _, i}
								<option value={i + 1}>{i + 1}월</option>
							{/each}
						</select>
						<span class="range-divider">~</span>
						<input
							type="number"
							bind:value={endYear}
							onchange={handlePeriodChange}
							class="year-input"
							min="2020"
							max="2030"
						/>
						<span>년</span>
						<select bind:value={endMonth} onchange={handlePeriodChange} class="month-input">
							{#each Array(12) as _, i}
								<option value={i + 1}>{i + 1}월</option>
							{/each}
						</select>
						<div class="divider"></div>
						<span class="period-label">표시:</span>
						<select
							bind:value={periodType}
							onchange={handlePeriodChange}
							class="period-select"
						>
							<option value="weekly">주간</option>
							<option value="monthly">월간</option>
						</select>
					</div>
				{/if}
			</div>
		</div>
	</div>

	<!-- 총합계 요약 섹션 -->
	{#if filteredPaymentList.length > 0}
		{@const grandTotal = apiGrandTotal && apiGrandTotal.totalAmount !== undefined
			? {
				amount: apiGrandTotal.totalAmount || 0,
				tax: apiGrandTotal.totalTax || 0,
				net: apiGrandTotal.totalNet || 0
			}
			: calculateGrandTotal()}
		<div class="summary-section">
			<div class="summary-cards">
				<div class="summary-card">
					<div class="summary-label">총 지급액</div>
					<div class="summary-value">{formatAmount(grandTotal.amount)}원</div>
				</div>
				<div class="summary-card tax-card">
					<div class="summary-label">총 원천징수</div>
					<div class="summary-value">{formatAmount(grandTotal.tax)}원</div>
				</div>
				<div class="summary-card net-card">
					<div class="summary-label">총 실지급액</div>
					<div class="summary-value">{formatAmount(grandTotal.net)}원</div>
				</div>
				<div class="summary-card info-card">
					<div class="summary-label">지급 대상</div>
					<div class="summary-value">{totalPaymentTargets || filteredPaymentList.length}명</div>
				</div>
			</div>
		</div>
	{/if}

	<!-- 검색 및 페이지 설정 -->
	<div class="search-section">
		<select bind:value={searchCategory} class="search-category">
			<option value="name">이름</option>
			<option value="planner">설계자</option>
		</select>
		<input
			type="text"
			bind:value={searchQuery}
			onkeypress={handleKeyPress}
			placeholder={searchCategory === 'name' ? '이름으로 검색...' : '설계자 이름으로 검색...'}
			class="search-input"
		/>
		<button onclick={handleSearch} class="search-button">
			<img src="/icons/search.svg" alt="검색" width="20" height="20" />
		</button>

		<label class="per-page-label">
			페이지당
			<select
				bind:value={itemsPerPage}
				onchange={handleItemsPerPageChange}
				class="per-page-select"
			>
				<option value={10}>10개</option>
				<option value={20}>20개</option>
				<option value={50}>50개</option>
				<option value={100}>100개</option>
			</select>
		</label>

		<!-- 컬럼 표시 토글 -->
		<div class="column-toggle">
			<label class="toggle-label">
				<input type="checkbox" bind:checked={showTaxColumn} class="toggle-checkbox" />
				<span>원천징수</span>
			</label>
			<label class="toggle-label">
				<input type="checkbox" bind:checked={showNetColumn} class="toggle-checkbox" />
				<span>실지급액</span>
			</label>
		</div>

		{#if filteredPaymentList.length > 0}
			<button onclick={exportToExcel} class="export-button">
				<img src="/icons/download.svg" alt="다운로드" width="16" height="16" />
			</button>
		{/if}

		<button onclick={processPastPayments} disabled={isProcessingPast} class="process-past-button" title="오늘 이전의 pending 지급을 자동 처리">
			{#if isProcessingPast}
				처리중...
			{:else}
				과거 지급 처리
			{/if}
		</button>
	</div>

	<!-- 테이블 영역 -->
	{#if isLoading}
		<div class="loading">데이터를 불러오는 중...</div>
	{:else if error}
		<div class="error">{error}</div>
	{:else}
		<div class="table-container">

			<div class="table-wrapper">
				<table class="payment-table">
					<thead>
						<tr class="header-row-1">
							<th rowspan="2" class="sticky-col sticky-col-0">순번</th>
							<th rowspan="2" class="sticky-col sticky-col-1">성명</th>
							<th rowspan="2">설계자</th>
							<th rowspan="2">은행</th>
							<th rowspan="2">계좌번호</th>
							{#each weeklyColumns as week}
								{@const colCount = 1 + (showTaxColumn ? 1 : 0) + (showNetColumn ? 1 : 0)}
								<th colspan={colCount} class="week-header">{week.label}</th>
							{/each}
						</tr>
						<tr class="header-row-2">
							{#each weeklyColumns as week}
								<th class="sub-header">지급액</th>
								{#if showTaxColumn}
									<th class="sub-header tax-header">원천징수(3.3%)</th>
								{/if}
								{#if showNetColumn}
									<th class="sub-header">실지급액</th>
								{/if}
							{/each}
						</tr>
					</thead>
					<tbody>
						{#if paymentList.length > 0}
							{#each getCurrentPageData() as user}
								<tr>
									<td class="sticky-col sticky-col-0">{user.no}</td>
									<td class="sticky-col sticky-col-1">
										<div style="display: flex; align-items: center; justify-content: center;">
											<div style="position: relative; display: inline-flex; align-items: baseline;">
												{user.name}
												{#if user.grade}
													<img src="/icons/{user.grade}.svg" alt="{user.grade}" style="width: 20px; height: 20px; position: absolute; top: -6px; right: -20px;" title="{user.grade} 등급" />
												{/if}
											</div>
										</div>
									</td>
									<td>{user.planner || ''}</td>
									<td>{user.bank}</td>
									<td>{user.accountNumber}</td>
									{#each weeklyColumns as week}
										{@const key = periodType === 'monthly' ? `month_${week.month}` : `${week.year}_${week.month}_${week.week}`}
										{@const payment = user.payments[key]}
										<td
											class="amount-cell"
											title={payment?.installmentDetails
												? payment.installmentDetails
														.map((d) => `${d.revenueMonth} ${d.installmentNumber}회차`)
														.join(', ')
												: ''}
										>
											{formatAmount(payment?.amount)}
										</td>
										{#if showTaxColumn}
											<td class="tax-cell">{formatAmount(payment?.tax)}</td>
										{/if}
										{#if showNetColumn}
											<td class="net-cell">{formatAmount(payment?.net)}</td>
										{/if}
									{/each}
								</tr>
							{/each}
						{:else}
							<tr>
								<td colspan={4 + weeklyColumns.length * 3} class="empty-message">
									데이터가 없습니다
								</td>
							</tr>
						{/if}
					</tbody>
				</table>
			</div>

			<!-- 페이지네이션 -->
			{#if filteredPaymentList.length > 0}
				<Pagination
					currentPage={currentPage}
					totalPages={totalPages}
					totalItems={totalPaymentTargets || filteredPaymentList.length}
					itemsPerPage={itemsPerPage}
					onPageChange={goToPage}
				/>
			{/if}
		</div>
	{/if}
</div>

<style>
	.container {
		padding: 20px;
		max-width: 100%;
		background: white;
	}

	.title {
		font-size: 24px;
		font-weight: bold;
		text-align: center;
		margin-bottom: 20px;
		color: #333;
	}

	/* 필터 영역 */
	.filter-section {
		display: flex;
		gap: 10px;
		margin-bottom: 10px;
		align-items: flex-start;
		flex-wrap: wrap;
	}

	.filter-box {
		flex: 1;
		border: 1px solid #ccc;
		border-radius: 4px;
		padding: 8px 10px;
		background: white;
		min-width: 280px;
	}

	.filter-content {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}

	.filter-row {
		display: flex;
		align-items: center;
		gap: 8px;
		flex-wrap: wrap;
	}

	.divider {
		width: 1px;
		height: 20px;
		background: #ddd;
		margin: 0 5px;
	}

	.radio-label {
		display: flex;
		align-items: center;
		gap: 3px;
		white-space: nowrap;
		font-size: 13px;
	}

	.date-input {
		padding: 4px 6px;
		border: 1px solid #ccc;
		border-radius: 3px;
		font-size: 13px;
	}

	.date-input:disabled {
		background: #f5f5f5;
		cursor: not-allowed;
	}

	.year-input,
	.month-input {
		padding: 5px;
		border: 1px solid #ccc;
		border-radius: 3px;
		font-size: 14px;
	}

	.year-input {
		width: 70px;
	}

	.month-input {
		width: 75px;
		padding: 5px 26px 5px 10px;
	}

	/* 기간 선택 컨트롤 */
	.period-controls {
		display: flex;
		align-items: center;
		gap: 6px;
		flex-wrap: wrap;
		margin-top: 4px;
		padding-left: 0;
	}

	.range-divider {
		margin: 0 4px;
		color: #666;
	}

	.period-label {
		font-weight: bold;
		font-size: 13px;
		white-space: nowrap;
	}

	.period-select {
		padding: 5px 26px 5px 10px;
		border: 1px solid #ccc;
		border-radius: 3px;
		font-size: 14px;
		width: 90px;
	}

	/* 테이블 컨테이너 */
	.table-container {
		position: relative;
	}

	/* 테이블 영역 */
	.table-wrapper {
		overflow-x: auto;
		border: 1px solid #ddd;
		background: white;
		position: relative;
	}

	.payment-table {
		border-collapse: separate;
		border-spacing: 0;
		width: 100%;
		min-width: max-content;
	}

	.payment-table th,
	.payment-table td {
		border-right: 1px solid #ddd;
		border-bottom: 1px solid #ddd;
		padding: 6px;
		text-align: center;
		white-space: nowrap;
		font-size: 14px;
	}

	.payment-table th:first-child,
	.payment-table td:first-child {
		border-left: 1px solid #ddd;
	}

	.payment-table thead tr:first-child th {
		border-top: 1px solid #ddd;
	}

	/* 고정 컬럼 기본 스타일 */
	.sticky-col {
		position: sticky !important;
		z-index: 10;
		background: white !important;
	}

	.sticky-col-0 {
		left: 0;
		min-width: 60px;
		z-index: 12;
	}

	.sticky-col-1 {
		left: 60px;
		min-width: 80px;
		z-index: 11;
	}

	/* 헤더 스타일 */
	.header-row-1 th {
		background: #e8e8e8;
		font-weight: bold;
	}

	.week-header {
		background: #d0e0f0;
	}

	.header-row-2 th {
		background: #e8e8e8;
		font-weight: normal;
	}

	.sub-header {
		min-width: 100px;
		font-size: 13px;
	}

	.tax-header {
		background: #ffe0e0;
	}

	/* 데이터 셀 스타일 */
	.amount-cell {
		background: #ffffcc;
		font-weight: bold;
		text-align: right;
		padding-right: 12px;
	}

	.tax-cell {
		background: #ffeeee;
		color: #d9534f;
		text-align: right;
		padding-right: 12px;
	}

	.net-cell {
		background: #eeffee;
		font-weight: bold;
		text-align: right;
		padding-right: 12px;
	}

	/* 고정 컬럼 헤더 */
	thead .sticky-col {
		background: #e8e8e8 !important;
		z-index: 20;
	}

	/* 고정 컬럼은 항상 흰색 배경 유지 */
	tbody .sticky-col {
		background: white !important;
	}

	.empty-message {
		text-align: center;
		padding: 40px;
		color: #666;
		font-style: italic;
		background: white;
	}

	.loading,
	.error {
		text-align: center;
		padding: 40px;
		font-size: 16px;
	}

	.error {
		color: #d9534f;
	}

	/* 반응형 - 모바일 */
	@media (max-width: 768px) {
		.filter-section {
			flex-direction: column;
			gap: 8px;
		}

		.filter-box {
			width: 100%;
			min-width: unset;
		}

		.filter-row {
			font-size: 12px;
		}

		.summary-cards {
			grid-template-columns: repeat(2, 1fr);
			gap: 8px;
		}

		.summary-value {
			font-size: 12px;
		}

		.search-section {
			flex-wrap: wrap;
			gap: 8px;
		}

		.search-category {
			padding: 6px 10px;
			border: 1px solid #ddd;
			border-radius: 4px;
			font-size: 14px;
		}

		.search-input {
			min-width: 150px;
		}

		.table-wrapper {
			font-size: 12px;
		}

		.sticky-col-0 {
			min-width: 50px;
		}

		.sticky-col-1 {
			left: 50px;
			min-width: 60px;
		}

		.week-header {
			font-size: 11px;
		}

		.sub-header {
			font-size: 10px;
		}

		.year-input {
			width: 60px;
		}

		.period-controls {
			gap: 4px;
			margin-left: 6px;
		}

		.month-input {
			width: 60px;
			padding: 4px 20px 4px 6px;
		}

		.period-select {
			width: 70px;
			padding: 4px 20px 4px 6px;
		}
	}

	/* 아주 작은 화면 (모바일) */
	@media (max-width: 480px) {
		.container {
			padding: 5px;
		}

		.title {
			font-size: 14px;
			margin-bottom: 6px;
		}

		.filter-box {
			padding: 4px 5px;
		}

		.filter-row {
			font-size: 10px;
			gap: 4px;
			flex-direction: row;
			flex-wrap: wrap;
			align-items: center;
		}

		.radio-label {
			font-size: 10px;
		}

		.date-input {
			padding: 2px 4px;
			font-size: 10px;
		}

		.year-input {
			width: 45px;
		}

		.month-input {
			width: 35px;
		}

		.period-controls {
			gap: 3px;
			margin-left: 4px;
		}

		.period-select {
			width: 45px;
			font-size: 11px;
		}

		.period-label {
			font-size: 11px;
		}

		.summary-section {
			margin: 4px 0;
			padding: 4px 5px;
		}

		.summary-cards {
			grid-template-columns: repeat(2, 1fr);
			gap: 3px;
		}

		.summary-card {
			padding: 3px;
		}

		.summary-label {
			font-size: 7px;
			margin-bottom: 1px;
		}

		.summary-value {
			font-size: 9px;
		}

		.search-section {
			margin: 4px 0;
			gap: 4px;
			flex-wrap: wrap;
		}

		.search-input {
			padding: 4px 6px;
			font-size: 11px;
			min-width: 120px;
		}

		.search-button {
			padding: 4px 6px;
		}

		.search-button img {
			width: 14px;
			height: 14px;
		}

		.per-page-label {
			font-size: 10px;
			gap: 3px;
		}

		.per-page-select {
			padding: 3px 16px 3px 5px;
			font-size: 10px;
			min-width: 55px;
		}

		.export-button {
			padding: 4px;
			min-width: 28px;
			height: 28px;
		}

		.export-button img {
			width: 12px;
			height: 12px;
		}

		.table-wrapper {
			font-size: 9px;
		}

		.payment-table th,
		.payment-table td {
			padding: 2px;
			font-size: 9px;
		}

		.sticky-col-0 {
			min-width: 30px;
		}

		.sticky-col-1 {
			left: 30px;
			min-width: 45px;
		}

		.week-header {
			font-size: 8px;
			padding: 2px;
		}

		.sub-header {
			font-size: 7px;
			min-width: 45px;
		}

		.amount-cell,
		.tax-cell,
		.net-cell {
			font-size: 8px;
			padding-right: 2px;
		}


		.loading,
		.error {
			padding: 20px;
			font-size: 11px;
		}

		.empty-message {
			padding: 20px;
			font-size: 10px;
		}

		.divider {
			height: 15px;
			margin: 0 3px;
		}
	}

	/* 스크롤바 스타일 */
	.table-wrapper::-webkit-scrollbar {
		height: 10px;
	}

	.table-wrapper::-webkit-scrollbar-track {
		background: #f1f1f1;
	}

	.table-wrapper::-webkit-scrollbar-thumb {
		background: #888;
		border-radius: 4px;
	}

	.table-wrapper::-webkit-scrollbar-thumb:hover {
		background: #555;
	}

	/* 호버 효과 */
	tbody tr:hover td {
		background-color: rgba(0, 0, 0, 0.02);
	}

	tbody tr:hover .amount-cell {
		background: #ffff99;
	}

	tbody tr:hover .tax-cell {
		background: #ffdddd;
	}

	tbody tr:hover .net-cell {
		background: #ddffdd;
	}

	/* 요약 섹션 */
	.summary-section {
		margin: 8px 0;
		padding: 8px 10px;
		background: #f8f9fa;
		border-radius: 4px;
		border: 1px solid #e0e0e0;
	}

	.summary-cards {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(100px, 1fr));
		gap: 10px;
	}

	.summary-card {
		display: flex;
		flex-direction: column;
		padding: 0;
		background: transparent;
		border: none;
		text-align: center;
	}

	.summary-card.tax-card {
		border-left: none;
	}

	.summary-card.net-card {
		border-left: none;
	}

	.summary-card.info-card {
		border-left: none;
	}

	.summary-label {
		font-size: 10px;
		color: #888;
		margin-bottom: 2px;
		font-weight: 500;
	}

	.summary-value {
		font-size: 13px;
		font-weight: bold;
		color: #333;
		white-space: nowrap;
	}

	.tax-card .summary-value {
		color: #dc3545;
	}

	.net-card .summary-value {
		color: #28a745;
	}

	.info-card .summary-value {
		color: #6c757d;
	}

	/* 검색 및 페이지 설정 */
	.search-section {
		display: flex;
		align-items: center;
		margin: 12px 0;
		gap: 10px;
		flex-wrap: nowrap;
		background: linear-gradient(to bottom, #f8f9fa, #ffffff);
		padding: 12px;
		border-radius: 6px;
		box-shadow: 0 1px 4px rgba(0, 0, 0, 0.08);
	}

	.search-category {
		padding: 7px 12px;
		border: 2px solid #e0e0e0;
		border-radius: 5px;
		font-size: 14px;
		font-weight: 500;
		background: white;
		cursor: pointer;
		transition: all 0.2s ease;
		outline: none;
		min-width: 90px;
		height: 36px;
		line-height: 1.4;
		display: flex;
		align-items: center;
	}

	.search-category:hover {
		border-color: #007bff;
		box-shadow: 0 0 0 2px rgba(0, 123, 255, 0.1);
	}

	.search-category:focus {
		border-color: #007bff;
		box-shadow: 0 0 0 2px rgba(0, 123, 255, 0.15);
	}

	.search-input {
		flex: 1;
		padding: 7px 14px;
		border: 2px solid #e0e0e0;
		border-radius: 5px;
		font-size: 14px;
		min-width: 200px;
		transition: all 0.2s ease;
		outline: none;
		background: white;
		height: 36px;
		line-height: 1.4;
	}

	.search-input:hover {
		border-color: #b0b0b0;
	}

	.search-input:focus {
		border-color: #007bff;
		box-shadow: 0 0 0 2px rgba(0, 123, 255, 0.15);
	}

	.search-input::placeholder {
		color: #999;
		font-weight: 400;
	}

	.search-button {
		padding: 7px 14px;
		background: linear-gradient(135deg, #007bff 0%, #0056b3 100%);
		border: none;
		border-radius: 5px;
		color: white;
		cursor: pointer;
		display: flex;
		align-items: center;
		justify-content: center;
		flex-shrink: 0;
		transition: all 0.2s ease;
		box-shadow: 0 1px 4px rgba(0, 123, 255, 0.3);
		min-width: 36px;
		height: 36px;
	}

	.search-button:hover {
		background: linear-gradient(135deg, #0056b3 0%, #003d82 100%);
		box-shadow: 0 2px 8px rgba(0, 123, 255, 0.4);
		transform: translateY(-1px);
	}

	.search-button:active {
		transform: translateY(0);
		box-shadow: 0 1px 3px rgba(0, 123, 255, 0.3);
	}

	.search-button img {
		filter: brightness(0) invert(1);
		width: 18px;
		height: 18px;
	}

	.per-page-label {
		display: flex;
		align-items: center;
		gap: 6px;
		font-size: 14px;
		font-weight: 500;
		white-space: nowrap;
		flex-shrink: 0;
		color: #495057;
	}

	.per-page-select {
		padding: 6px 26px 6px 12px;
		min-width: 78px;
		border: 2px solid #e0e0e0;
		border-radius: 5px;
		font-size: 14px;
		cursor: pointer;
		background: white;
		background-position: right 8px center;
		background-repeat: no-repeat;
		transition: all 0.2s ease;
		outline: none;
		font-weight: 500;
		height: 36px;
		line-height: 1.4;
		display: flex;
		align-items: center;
	}

	.per-page-select:hover {
		border-color: #007bff;
		box-shadow: 0 0 0 2px rgba(0, 123, 255, 0.1);
	}

	.per-page-select:focus {
		border-color: #007bff;
		box-shadow: 0 0 0 2px rgba(0, 123, 255, 0.15);
	}

	.export-button {
		padding: 7px 14px;
		background: linear-gradient(135deg, #28a745 0%, #1e7e34 100%);
		color: white;
		border: none;
		border-radius: 5px;
		cursor: pointer;
		display: flex;
		align-items: center;
		justify-content: center;
		transition: all 0.2s ease;
		min-width: 36px;
		height: 36px;
		flex-shrink: 0;
		box-shadow: 0 1px 4px rgba(40, 167, 69, 0.3);
	}

	.export-button:hover {
		background: linear-gradient(135deg, #1e7e34 0%, #155724 100%);
		box-shadow: 0 2px 8px rgba(40, 167, 69, 0.4);
		transform: translateY(-1px);
	}

	.export-button:active {
		transform: translateY(0);
		box-shadow: 0 1px 3px rgba(40, 167, 69, 0.3);
	}

	.export-button img {
		filter: brightness(0) invert(1);
		width: 16px;
		height: 16px;
	}

	.process-past-button {
		padding: 7px 14px;
		background: linear-gradient(135deg, #ffc107 0%, #ff9800 100%);
		color: #333;
		border: none;
		border-radius: 5px;
		cursor: pointer;
		display: flex;
		align-items: center;
		justify-content: center;
		transition: all 0.2s ease;
		min-width: 100px;
		height: 36px;
		flex-shrink: 0;
		box-shadow: 0 1px 4px rgba(255, 152, 0, 0.3);
		font-weight: 500;
		font-size: 13px;
		white-space: nowrap;
	}

	.process-past-button:hover:not(:disabled) {
		background: linear-gradient(135deg, #ff9800 0%, #f57c00 100%);
		box-shadow: 0 2px 8px rgba(255, 152, 0, 0.4);
		transform: translateY(-1px);
	}

	.process-past-button:active:not(:disabled) {
		transform: translateY(0);
		box-shadow: 0 1px 3px rgba(255, 152, 0, 0.3);
	}

	.process-past-button:disabled {
		opacity: 0.6;
		cursor: not-allowed;
		background: #ccc;
		box-shadow: none;
	}

	/* 컬럼 표시 토글 */
	.column-toggle {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 4px 12px;
		background: white;
		border: 2px solid #e0e0e0;
		border-radius: 5px;
		flex-shrink: 0;
	}

	.toggle-label {
		display: flex;
		align-items: center;
		gap: 6px;
		font-size: 13px;
		font-weight: 500;
		cursor: pointer;
		white-space: nowrap;
		color: #495057;
		user-select: none;
	}

	.toggle-checkbox {
		width: 16px;
		height: 16px;
		cursor: pointer;
		accent-color: #007bff;
	}

	.toggle-label:hover {
		color: #007bff;
	}

</style>