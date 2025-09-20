<script>
	import { onMount } from 'svelte';
	import * as XLSX from 'xlsx';
	import FileSaver from 'file-saver';
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
	let currentPage = 1;
	let itemsPerPage = 20;
	let totalPages = 1;

	// 주차 계산 함수 (월의 첫날 기준)
	function getWeekOfMonth(date) {
		const d = new Date(date);
		const firstDay = new Date(d.getFullYear(), d.getMonth(), 1).getDay();
		const dayOfMonth = d.getDate();
		return Math.ceil((dayOfMonth + firstDay) / 7);
	}

	// 데이터 로드 (페이지네이션 포함)
	async function loadPaymentData(page = 1) {
		isLoading = true;
		error = '';
		weeklyColumns = [];
		paymentList = [];
		currentPage = page;

		try {
			if (filterType === 'date') {
				// 단일 날짜 조회
				const [year, month, day] = selectedDate.split('-');
				const week = getWeekOfMonth(selectedDate);

				// 서버 사이드 페이지네이션 파라미터 포함
				const params = new URLSearchParams({
					year,
					month: parseInt(month),
					week,
					page: currentPage,
					limit: itemsPerPage,
					search: searchQuery
				});

				const response = await fetch(`/api/admin/payment/weekly?${params}`);
				const result = await response.json();

				if (result.success && result.data) {
					// 서버에서 페이지네이션 정보 받아오기
					if (result.data.pagination) {
						totalPages = result.data.pagination.totalPages;
						// 전체 아이템 수도 설정
						const totalItems = result.data.pagination.totalItems;
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
					const weekKey = result.data.weekNumber || 1;
					paymentList = (result.data.payments || []).map((user, index) => ({
						...user,
						no: index + 1,
						name: user.userName || user.name || 'Unknown',
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

				// 처음 로드할 때만 전체 데이터를 가져옴
				if (allWeeklyData.length === 0 || page === 1) {
					displayStartIndex = 0;

					// 마지막 로드 정보 저장
					lastLoadedStartYear = startYear;
					lastLoadedStartMonth = startMonth;
					lastLoadedEndYear = endYear;
					lastLoadedEndMonth = endMonth;

					// 전체 기간 데이터를 한 번에 로드
					// 시작 연도와 월을 고려한 주차 계산
					// 연도가 다를 수 있으므로 절대 주차로 계산
					const baseYear = 2025; // 기준 연도
					const yearDiff = startYear - baseYear;
					const absoluteStartWeek = yearDiff * 12 * 4 + (startMonth - 1) * 4 + 1;
					const totalWeeks = monthDiff * 4;

					const params = new URLSearchParams({
						year: baseYear, // 기준 연도 사용
						startWeek: absoluteStartWeek, // 절대 주차 위치
						count: totalWeeks, // 전체 주차 로드
						page: 1,
						limit: itemsPerPage,
						search: searchQuery
					});

					const response = await fetch(`/api/admin/payment/weekly?${params}`);
					const result = await response.json();

					if (result.success && result.data) {
						if (result.data.weeks && Array.isArray(result.data.weeks)) {
							// 전체 데이터 저장
							allWeeklyData = result.data.weeks.map((weekData) => ({
								year: weekData.year,
								month: weekData.monthNumber,
								week: weekData.weekNumber,
								label: weekData.week,
								data: weekData
							}));

							if (result.data.pagination) {
								totalPages = result.data.pagination.totalPages;
							}
						}
					}
				}

				// 표시할 범위만 설정
				updateDisplayData();
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
			// 월간 표시: 월별로 데이터 집계 후 표시 범위 선택
			const monthlyData = aggregateMonthlyData(allWeeklyData);
			// 월간도 3개월씩 표시
			const endIndex = Math.min(displayStartIndex + 3, monthlyData.length);
			weeklyColumns = monthlyData.slice(displayStartIndex, endIndex);
			console.log(
				`Displaying months ${displayStartIndex + 1} to ${endIndex} of ${monthlyData.length}`
			);
		} else {
			// 주간 표시: 기존 방식대로
			const endIndex = Math.min(displayStartIndex + 4, allWeeklyData.length);
			weeklyColumns = allWeeklyData.slice(displayStartIndex, endIndex);
			console.log(
				`Displaying weeks ${displayStartIndex + 1} to ${endIndex} of ${allWeeklyData.length}`
			);
		}

		console.log(
			'Display columns:',
			weeklyColumns.map((w) => w.label)
		);
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
		console.log('processPaymentData called with columns:', weeklyColumns.length);

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
							bank: payment.bank,
							accountNumber: payment.accountNumber,
							payments: {}
						});
					}

					// 키 생성: 주간이면 week 번호, 월간이면 month_월
					const key =
						periodType === 'monthly'
							? `month_${column.month}`
							: column.week || `month_${column.month}`;

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

		console.log('Payment list updated:', paymentList.length, 'users');
		console.log('First user payments:', paymentList[0]?.payments);

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

	// 전체 합계 계산
	function calculateGrandTotal() {
		let grandTotal = { amount: 0, tax: 0, net: 0 };

		weeklyColumns.forEach((week) => {
			const total = calculateColumnTotal(week);
			grandTotal.amount += total.amount;
			grandTotal.tax += total.tax;
			grandTotal.net += total.net;
		});

		return grandTotal;
	}

	// 엑셀 Export 기능
	function exportToExcel() {
		// 엑셀 데이터 준비
		const excelData = [];

		// 헤더 행
		const headers = ['순번', '성명', '은행', '계좌번호'];
		weeklyColumns.forEach((week) => {
			headers.push(`${week.label}_지급액`);
			headers.push(`${week.label}_원천징수`);
			headers.push(`${week.label}_실지급액`);
		});
		excelData.push(headers);

		// 데이터 행
		filteredPaymentList.forEach((user, index) => {
			const row = [index + 1, user.name, user.bank || '', user.accountNumber || ''];

			weeklyColumns.forEach((week) => {
				const key = week.week || `month_${week.month}`;
				const payment = user.payments[key];
				row.push(payment?.amount || 0);
				row.push(payment?.tax || 0);
				row.push(payment?.net || 0);
			});

			excelData.push(row);
		});

		// 합계 행
		const totalRow = ['', '', '', '합계'];
		weeklyColumns.forEach((week) => {
			const total = calculateColumnTotal(week);
			totalRow.push(total.amount);
			totalRow.push(total.tax);
			totalRow.push(total.net);
		});
		excelData.push(totalRow);

		// 워크북 생성
		const ws = XLSX.utils.aoa_to_sheet(excelData);
		const wb = XLSX.utils.book_new();
		XLSX.utils.book_append_sheet(wb, ws, '용역비 지급명부');

		// 컬럼 너비 조정
		const colWidths = [
			{ wch: 8 }, // 순번
			{ wch: 15 }, // 성명
			{ wch: 15 }, // 은행
			{ wch: 20 } // 계좌번호
		];
		weeklyColumns.forEach(() => {
			colWidths.push({ wch: 15 }, { wch: 15 }, { wch: 15 });
		});
		ws['!cols'] = colWidths;

		// 파일명 생성
		const today = new Date();
		const fileName = `용역비 지급명부_${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, '0')}${String(today.getDate()).padStart(2, '0')}.xlsx`;

		// 엑셀 파일 생성 및 다운로드
		const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
		const blob = new Blob([wbout], { type: 'application/octet-stream' });
		saveAs(blob, fileName);
	}

	// 필터 타입 변경
	function handleFilterTypeChange() {
		loadPaymentData();
	}

	// 기간 선택 변경
	function handlePeriodChange() {
		currentWeekOffset = 0; // 오프셋 초기화
		displayStartIndex = 0; // 표시 인덱스 초기화

		// 연도나 월이 변경된 경우 데이터를 새로 로드
		// 표시 단위만 변경된 경우에는 기존 데이터로 업데이트
		const prevStartYear = lastLoadedStartYear;
		const prevStartMonth = lastLoadedStartMonth;
		const prevEndYear = lastLoadedEndYear;
		const prevEndMonth = lastLoadedEndMonth;

		if (
			startYear !== prevStartYear ||
			startMonth !== prevStartMonth ||
			endYear !== prevEndYear ||
			endMonth !== prevEndMonth
		) {
			// 기간이 변경되면 새로 로드
			allWeeklyData = [];
			lastLoadedStartYear = startYear;
			lastLoadedStartMonth = startMonth;
			lastLoadedEndYear = endYear;
			lastLoadedEndMonth = endMonth;
		}

		if (filterType === 'period') {
			if (allWeeklyData.length > 0) {
				// 데이터가 있으면 표시만 업데이트
				updateDisplayData();
			} else {
				// 데이터가 없으면 새로 로드
				loadPaymentData(1);
			}
		}
	}

	// 이전 주로 이동 (데이터 다시 로드하지 않고 표시만 변경)
	function movePreviousWeek() {
		if (filterType === 'period' && allWeeklyData.length > 0) {
			if (displayStartIndex > 0) {
				displayStartIndex -= 1;
				console.log('Move previous - new display index:', displayStartIndex);
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
					console.log('Move next (monthly) - new display index:', displayStartIndex);
					updateDisplayData();
				}
			} else {
				// 주간 모드
				if (displayStartIndex < allWeeklyData.length - 1) {
					displayStartIndex += 1;
					console.log('Move next (weekly) - new display index:', displayStartIndex);
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
			<div class="filter-content single-line">
				<label class="radio-label">
					<input
						type="radio"
						bind:group={filterType}
						value="date"
						onchange={handleFilterTypeChange}
					/>
					<span>주간</span>
				</label>
				<input
					type="date"
					bind:value={selectedDate}
					onchange={loadPaymentData}
					disabled={filterType !== 'date'}
					class="date-input"
				/>

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
				{#if filterType === 'period'}
					<input
						type="number"
						bind:value={startYear}
						onchange={handlePeriodChange}
						class="year-input"
						min="2020"
						max="2030"
						style="margin-left: 10px;"
					/>
					<span>년</span>
					<select bind:value={startMonth} onchange={handlePeriodChange} class="month-input">
						{#each Array(12) as _, i}
							<option value={i + 1}>{i + 1}월</option>
						{/each}
					</select>
					<span style="margin: 0 8px;">~</span>
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

					<div class="divider" style="margin: 0 15px;"></div>

					<label style="font-weight: bold; margin-right: 8px;">표시 단위:</label>
					<select
						bind:value={periodType}
						onchange={handlePeriodChange}
						class="select-input"
						style="width: 80px;"
					>
						<option value="weekly">주간</option>
						<option value="monthly">월간</option>
					</select>
				{/if}
			</div>
		</div>
	</div>

	<!-- 총합계 요약 섹션 -->
	{#if filteredPaymentList.length > 0}
		{@const grandTotal = calculateGrandTotal()}
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
					<div class="summary-value">{filteredPaymentList.length}명</div>
				</div>
			</div>
		</div>
	{/if}

	<!-- 검색 및 페이지 설정 -->
	<div class="search-section">
		<div class="search-box">
			<input
				type="text"
				bind:value={searchQuery}
				onkeyup={handleSearch}
				placeholder="이름 또는 은행명으로 검색..."
				class="search-input"
			/>
			<button onclick={handleSearch} class="search-button">
				<img src="/icons/search.svg" alt="검색" width="20" height="20" />
			</button>
		</div>

		<div class="page-settings">
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

			{#if filteredPaymentList.length > 0}
				<div class="divider"></div>
				<button onclick={exportToExcel} class="export-button">
					<img src="/icons/download.svg" alt="다운로드" width="16" height="16" />
					엑셀 다운로드
				</button>
			{/if}
		</div>
	</div>

	<!-- 테이블 영역 -->
	{#if isLoading}
		<div class="loading">데이터를 불러오는 중...</div>
	{:else if error}
		<div class="error">{error}</div>
	{:else}
		<div class="table-container">
			{#if filterType === 'period' && weeklyColumns.length > 0}
				<div class="week-nav-container">
					<div class="week-nav-buttons">
						<button
							onclick={movePreviousWeek}
							disabled={displayStartIndex === 0}
							class="week-nav-button"
						>
							<img src="/icons/chevron-left.svg" alt="이전" width="20" height="20" />
						</button>
						<button
							onclick={moveNextWeek}
							disabled={displayStartIndex >= allWeeklyData.length - 1}
							class="week-nav-button"
						>
							<img src="/icons/chevron-right.svg" alt="다음" width="20" height="20" />
						</button>
					</div>
				</div>
			{/if}
			<div class="table-wrapper">
				<table class="payment-table">
					<thead>
						<tr class="header-row-1">
							<th rowspan="2" class="sticky-col sticky-col-0">순번</th>
							<th rowspan="2" class="sticky-col sticky-col-1">성명</th>
							<th rowspan="2" class="sticky-col sticky-col-2">은행</th>
							<th rowspan="2" class="sticky-col sticky-col-3">계좌번호</th>
							{#each weeklyColumns as week}
								<th colspan="3" class="week-header">{week.label}</th>
							{/each}
						</tr>
						<tr class="header-row-2">
							{#each weeklyColumns as week}
								<th class="sub-header">지급액</th>
								<th class="sub-header tax-header">원천징수(3.3%)</th>
								<th class="sub-header">실지급액</th>
							{/each}
						</tr>
					</thead>
					<tbody>
						{#if paymentList.length > 0}
							{#each getCurrentPageData() as user}
								<tr>
									<td class="sticky-col sticky-col-0">{user.no}</td>
									<td class="sticky-col sticky-col-1">{user.name}</td>
									<td class="sticky-col sticky-col-2">{user.bank}</td>
									<td class="sticky-col sticky-col-3">{user.accountNumber}</td>
									{#each weeklyColumns as week}
										{@const key = week.week || `month_${week.month}`}
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
										<td class="tax-cell">{formatAmount(payment?.tax)}</td>
										<td class="net-cell">{formatAmount(payment?.net)}</td>
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
				<div class="pagination">
					<button
						onclick={() => goToPage(currentPage - 1)}
						disabled={currentPage === 1}
						class="page-button"
					>
						이전
					</button>

					<div class="page-numbers">
						{#if currentPage > 3}
							<button onclick={() => goToPage(1)} class="page-number">1</button>
							{#if currentPage > 4}
								<span class="page-dots">...</span>
							{/if}
						{/if}

						{#each Array(Math.min(5, totalPages)) as _, i}
							{@const pageNum = currentPage > 3 ? currentPage - 2 + i : i + 1}
							{#if pageNum > 0 && pageNum <= totalPages}
								<button
									onclick={() => goToPage(pageNum)}
									class="page-number"
									class:active={pageNum === currentPage}
								>
									{pageNum}
								</button>
							{/if}
						{/each}

						{#if currentPage < totalPages - 2}
							{#if currentPage < totalPages - 3}
								<span class="page-dots">...</span>
							{/if}
							<button onclick={() => goToPage(totalPages)} class="page-number">{totalPages}</button>
						{/if}
					</div>

					<button
						onclick={() => goToPage(currentPage + 1)}
						disabled={currentPage === totalPages}
						class="page-button"
					>
						다음
					</button>

					<div class="page-info">
						총 {filteredPaymentList.length}명 중 {(currentPage - 1) * itemsPerPage + 1}-{Math.min(
							currentPage * itemsPerPage,
							filteredPaymentList.length
						)}명
					</div>
				</div>
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
		align-items: center;
		gap: 8px;
	}

	.filter-content.single-line {
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

	.date-input,
	.select-input {
		padding: 4px 6px;
		border: 1px solid #ccc;
		border-radius: 3px;
		font-size: 13px;
	}

	.period-type {
		width: 80px;
	}

	.date-input:disabled,
	.select-input:disabled {
		background: #f5f5f5;
		cursor: not-allowed;
	}

	.year-input,
	.month-input,
	.week-input {
		padding: 5px;
		border: 1px solid #ccc;
		border-radius: 3px;
		font-size: 14px;
	}

	.period-selector {
		display: inline-flex;
		align-items: center;
		gap: 5px;
		margin-left: 10px;
	}

	.year-input {
		width: 70px;
	}

	.month-input {
		width: 55px;
	}

	.period-info {
		color: #666;
		font-size: 13px;
		margin-left: 10px;
		font-style: italic;
	}

	/* 테이블 컨테이너 */
	.table-container {
		position: relative;
	}

	/* 인라인 네비게이션 버튼 */
	.nav-button-inline {
		position: absolute;
		top: 50%;
		transform: translateY(-50%);
		width: 24px;
		height: 24px;
		background: rgba(255, 255, 255, 0.8);
		border: 1px solid rgba(102, 126, 234, 0.3);
		border-radius: 4px;
		cursor: pointer;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		transition: all 0.2s ease;
		z-index: 1;
	}

	.nav-button-left-inline {
		left: 4px;
	}

	.nav-button-right-inline {
		right: 4px;
	}

	.nav-button-inline:hover:not(:disabled) {
		background: rgba(102, 126, 234, 0.9);
		border-color: rgba(102, 126, 234, 0.6);
	}

	.nav-button-inline:hover:not(:disabled) img {
		filter: brightness(0) invert(1);
	}

	.nav-button-inline:disabled {
		opacity: 0.3;
		cursor: not-allowed;
		background: rgba(248, 248, 248, 0.5);
	}

	.nav-button-inline img {
		width: 16px;
		height: 16px;
	}

	/* 주간 이동 네비게이션 */
	.week-navigation {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 10px;
		background: #f8f9fa;
		border: 2px solid #333;
		border-bottom: none;
		gap: 20px;
	}

	.nav-group {
		display: flex;
		gap: 2px;
	}

	.nav-icon-button {
		width: 36px;
		height: 36px;
		display: flex;
		align-items: center;
		justify-content: center;
		background: white;
		border: 1px solid #d0d0d0;
		border-radius: 6px;
		cursor: pointer;
		transition: all 0.2s;
		padding: 0;
		box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
	}

	.nav-icon-button img {
		filter: brightness(0.3);
		transition: filter 0.2s;
	}

	.nav-icon-button:hover:not(:disabled) {
		background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
		border-color: #667eea;
		box-shadow: 0 2px 4px rgba(102, 126, 234, 0.3);
		transform: translateY(-1px);
	}

	.nav-icon-button:hover:not(:disabled) img {
		filter: brightness(0) invert(1);
	}

	.nav-icon-button:active:not(:disabled) {
		transform: translateY(0);
		box-shadow: 0 1px 2px rgba(102, 126, 234, 0.3);
	}

	.nav-icon-button:disabled {
		opacity: 0.3;
		cursor: not-allowed;
		background: #f8f8f8;
		border-color: #e0e0e0;
		box-shadow: none;
	}

	.nav-icon-button:disabled img {
		filter: brightness(0.6);
	}

	.current-period {
		font-weight: bold;
		font-size: 14px;
		color: #333;
	}

	/* 테이블 영역 */
	.table-wrapper {
		overflow-x: auto;
		border: 2px solid #333;
		background: white;
		position: relative;
	}

	.payment-table {
		border-collapse: collapse;
		width: 100%;
		min-width: max-content;
	}

	.payment-table th,
	.payment-table td {
		border: 1px solid #333;
		padding: 6px;
		text-align: center;
		white-space: nowrap;
		font-size: 12px;
		font-size: 14px;
	}

	/* 헤더 스타일 */
	.header-row-1 th {
		background: #e8e8e8;
		font-weight: bold;
	}

	.week-header {
		background: #d0e0f0;
		border-bottom: 2px solid #333;
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

	/* 고정 컬럼 스타일 */
	.sticky-col {
		position: sticky;
		background: white !important;
		z-index: 10;
	}

	.sticky-col-0 {
		left: 0;
		min-width: 50px;
		z-index: 14;
	}

	.sticky-col-1 {
		left: 50px;
		min-width: 80px;
		z-index: 13;
	}

	.sticky-col-2 {
		left: 130px;
		min-width: 80px;
		z-index: 12;
	}

	.sticky-col-3 {
		left: 210px;
		min-width: 150px;
		z-index: 11;
	}

	/* 고정 컬럼 헤더 */
	thead .sticky-col {
		background: #e8e8e8 !important;
		z-index: 20;
	}

	thead .sticky-col-0 {
		z-index: 24;
	}

	thead .sticky-col-1 {
		z-index: 23;
	}

	thead .sticky-col-2 {
		z-index: 22;
	}

	thead .sticky-col-3 {
		z-index: 21;
	}

	/* 고정 컬럼 경계선 강조 */
	.sticky-col-3 {
		border-right: 2px solid #666 !important;
	}

	/* hover 효과 제거 - 스크롤 시 겹침 문제로 인해 비활성화 */
	tbody tr:hover td {
		/* hover 효과 없음 */
	}

	/* 고정 컬럼은 항상 흰색 배경 유지 */
	tbody .sticky-col {
		background: white !important;
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

		.filter-content {
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
			flex-direction: column;
			align-items: stretch;
		}

		.search-box {
			width: 100%;
			margin-bottom: 8px;
		}

		.page-settings {
			justify-content: space-between;
			width: 100%;
		}

		.table-wrapper {
			font-size: 12px;
		}

		.sticky-col {
			min-width: 60px;
		}

		.sticky-col-1 {
			min-width: 80px;
		}

		.week-header {
			font-size: 11px;
		}

		.sub-header {
			font-size: 10px;
		}

		.year-input {
			width: 55px;
		}

		.month-input,
		.select-input {
			width: auto;
			min-width: 60px;
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

		.filter-content {
			font-size: 10px;
			gap: 4px;
		}

		.filter-content.single-line {
			flex-direction: row;
			flex-wrap: wrap;
			align-items: center;
		}

		.radio-label {
			font-size: 10px;
		}

		.date-input,
		.select-input {
			padding: 2px 4px;
			font-size: 10px;
		}

		.year-input {
			width: 45px;
		}

		.month-input {
			width: 40px;
		}

		.period-type {
			width: 55px;
		}

		.period-selector {
			margin-left: 5px;
			gap: 3px;
		}

		.period-info {
			font-size: 9px;
			margin-left: 3px;
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
			padding: 4px 5px;
			margin: 4px 0;
			gap: 4px;
		}

		.search-box {
			gap: 4px;
		}

		.search-input {
			padding: 4px 6px;
			font-size: 11px;
		}

		.search-button {
			padding: 4px 6px;
		}

		.search-button img {
			width: 14px;
			height: 14px;
		}

		.page-settings {
			gap: 4px;
		}

		.per-page-label {
			font-size: 10px;
			gap: 3px;
		}

		.per-page-select {
			padding: 3px 14px 3px 5px;
			font-size: 10px;
			min-width: 55px;
		}

		.export-button {
			padding: 4px 6px;
			font-size: 10px;
			gap: 3px;
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
			left: 0;
		}

		.sticky-col-1 {
			min-width: 45px;
			left: 30px;
		}

		.sticky-col-2 {
			min-width: 40px;
			left: 75px;
		}

		.sticky-col-3 {
			min-width: 80px;
			left: 115px;
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

		.week-nav-button {
			padding: 3px 5px;
		}

		.week-nav-button img {
			width: 14px;
			height: 14px;
		}

		.pagination {
			padding: 5px;
			gap: 4px;
		}

		.page-button {
			padding: 3px 6px;
			font-size: 10px;
		}

		.page-numbers {
			gap: 2px;
		}

		.page-number {
			width: 20px;
			height: 20px;
			font-size: 9px;
		}

		.page-info {
			font-size: 9px;
		}

		.page-dots {
			font-size: 9px;
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

		.total-row td {
			font-size: 9px;
			padding: 3px;
		}

		.total-cell {
			font-size: 10px;
			padding: 4px;
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

	/* 합계 행 스타일 */
	.total-row {
		background: #f0f0f0;
		font-weight: bold;
		border-top: 2px solid #333;
	}

	.total-label {
		text-align: center;
		background: #e0e0e0;
		font-size: 15px;
	}

	.total-cell {
		text-align: right;
		padding: 12px 8px;
		font-size: 14px;
		background: #f8f8f8;
	}

	.total-cell.tax-total {
		background: #fff5f5;
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
		justify-content: space-between;
		align-items: center;
		margin: 8px 0;
		padding: 8px 10px;
		background: #f8f9fa;
		border-radius: 4px;
		flex-wrap: wrap;
		gap: 10px;
	}

	.search-box {
		display: flex;
		align-items: center;
		gap: 10px;
		flex: 1;
		max-width: 400px;
	}

	.search-input {
		flex: 1;
		padding: 8px 12px;
		border: 1px solid #ddd;
		border-radius: 4px;
		font-size: 14px;
	}

	.search-button {
		padding: 8px 12px;
		background: #007bff;
		border: none;
		border-radius: 4px;
		color: white;
		cursor: pointer;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.search-button:hover {
		background: #0056b3;
	}

	.search-button img {
		filter: brightness(0) invert(1);
	}

	.page-settings {
		display: flex;
		align-items: center;
		gap: 10px;
	}

	.per-page-label {
		display: flex;
		align-items: center;
		gap: 8px;
		font-size: 14px;
	}

	.per-page-select {
		padding: 6px 24px 6px 10px;
		min-width: 85px;
		border: 1px solid #ddd;
		border-radius: 4px;
		font-size: 14px;
		cursor: pointer;
		background-position: right 6px center;
		background-repeat: no-repeat;
	}

	.export-button {
		padding: 8px 16px;
		background: #28a745;
		color: white;
		border: none;
		border-radius: 4px;
		font-size: 14px;
		font-weight: 500;
		cursor: pointer;
		display: flex;
		align-items: center;
		gap: 6px;
		transition: background 0.2s;
	}

	.export-button img {
		filter: brightness(0) invert(1);
	}

	.export-button:hover {
		background: #218838;
	}

	/* 주간 네비게이션 컨테이너 */
	.week-nav-container {
		display: flex;
		justify-content: flex-end;
		margin-bottom: 10px;
	}

	.week-nav-buttons {
		display: flex;
		gap: 8px;
	}

	.week-nav-button {
		padding: 6px 10px;
		background: white;
		border: 1px solid #ddd;
		border-radius: 4px;
		cursor: pointer;
		display: flex;
		align-items: center;
		transition: all 0.2s;
	}

	.week-nav-button:hover:not(:disabled) {
		background: #007bff;
		border-color: #007bff;
	}

	.week-nav-button:hover:not(:disabled) img {
		filter: brightness(0) invert(1);
	}

	.week-nav-button:disabled {
		opacity: 0.4;
		cursor: not-allowed;
	}

	/* 페이지네이션 */
	.pagination {
		display: flex;
		justify-content: center;
		align-items: center;
		gap: 10px;
		padding: 20px;
		background: #f8f9fa;
		border-top: 1px solid #ddd;
	}

	.page-button {
		padding: 8px 16px;
		background: white;
		border: 1px solid #ddd;
		border-radius: 4px;
		cursor: pointer;
		font-size: 14px;
		transition: all 0.2s;
	}

	.page-button:hover:not(:disabled) {
		background: #e9ecef;
	}

	.page-button:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.page-numbers {
		display: flex;
		align-items: center;
		gap: 5px;
	}

	.page-number {
		min-width: 36px;
		height: 36px;
		padding: 0;
		background: white;
		border: 1px solid #ddd;
		border-radius: 4px;
		cursor: pointer;
		font-size: 14px;
		transition: all 0.2s;
	}

	.page-number:hover {
		background: #e9ecef;
	}

	.page-number.active {
		background: #007bff;
		color: white;
		border-color: #007bff;
	}

	.page-dots {
		padding: 0 8px;
		color: #999;
	}

	.page-info {
		margin-left: 20px;
		font-size: 14px;
		color: #666;
	}
</style>
