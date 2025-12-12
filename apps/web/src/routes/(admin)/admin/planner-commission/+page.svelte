<script>
	import { onMount } from 'svelte';
	import { browser } from '$app/environment';
	import { PlannerCommissionExcelExporter } from '$lib/utils/plannerCommissionExcelExporter.js';
	import PlannerAccountEditModal from '$lib/components/shared/payment/PlannerAccountEditModal.svelte';

	// ⭐ 설계사 수정 모달 상태
	let showPlannerEditModal = false;
	let selectedPlannerInfo = null;

	// 기간 제한 초과 여부
	let periodLimitExceeded = false;

	// 상태 변수
	let commissions = [];
	let periods = []; // 기간 목록 (월간/주간)
	let periodTotals = {}; // 기간별 총계
	let isLoading = false;
	let error = '';
	let currentPage = 1;
	let totalPages = 1;
	let totalCount = 0;
	let limit = 20;

	// 필터 상태
	let filterType = 'month'; // 'month' 또는 'period'
	let selectedMonth = ''; // 이번 달
	let startYear = new Date().getFullYear();
	let startMonth = new Date().getMonth() + 1;
	let endYear = new Date().getFullYear();
	let endMonth = new Date().getMonth() + 1;
	let plannerName = '';
	let viewMode = 'weekly'; // 'weekly' | 'monthly' (기본값: 주간보기)
	let sortBy = 'name'; // 'name' | 'amount' - 정렬 기준

	// 칼럼 표시 옵션
	let showPhoneColumn = false; // 연락처 칼럼 표시 여부 (기본값: false)
	let showUserCountColumn = false; // 등록인원 칼럼 표시 여부 (기본값: false)
	let showRevenueColumn = false; // 매출금 칼럼 표시 여부 (기본값: false)

	// 통계 요약
	let summary = {
		totalPlanners: 0,
		totalRevenue: 0,
		totalCommission: 0,
		totalService: 0,
		grandTotal: 0
	};

	// 모바일 감지
	let isMobile = false;

	function checkScreenSize() {
		if (browser) {
			isMobile = window.innerWidth < 768;
		}
	}

	/**
	 * 기간 키를 형식에 맞게 변환
	 * @param {string} period - "2025-10" 또는 "2025-10-W1"
	 * @returns {string} - "2025년 10월" 또는 "2025-12-05" (금요일 날짜)
	 */
	function formatPeriodLabel(period) {
		if (period.includes('-W')) {
			// 주간보기: "2025-10-W1" → "2025-10-04" (해당 주 금요일)
			const parts = period.split('-');
			const year = parseInt(parts[0]);
			const month = parseInt(parts[1]);
			const week = parseInt(parts[2].replace('W', ''));

			// 해당 월 1일
			const firstDay = new Date(year, month - 1, 1);
			// 첫 번째 금요일 찾기 (금요일 = 5)
			let firstFriday = new Date(firstDay);
			const dayOfWeek = firstDay.getDay();
			const daysUntilFriday = (5 - dayOfWeek + 7) % 7;
			firstFriday.setDate(1 + daysUntilFriday);

			// 주차에 맞게 7일씩 더함
			const targetFriday = new Date(firstFriday);
			targetFriday.setDate(firstFriday.getDate() + (week - 1) * 7);

			// "YYYY-MM-DD" 형식으로 반환
			const mm = String(targetFriday.getMonth() + 1).padStart(2, '0');
			const dd = String(targetFriday.getDate()).padStart(2, '0');
			return `${targetFriday.getFullYear()}-${mm}-${dd}`;
		} else {
			// 월간보기: "2025-10" → "2025년 10월"
			const [year, month] = period.split('-');
			return `${year}년 ${month}월`;
		}
	}

	// 컴포넌트 마운트 시 데이터 로드
	onMount(() => {
		checkScreenSize();
		window.addEventListener('resize', checkScreenSize);

		// 현재 월로 초기화
		const now = new Date();
		selectedMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
		loadCommissions();

		return () => {
			window.removeEventListener('resize', checkScreenSize);
		};
	});

	// 필터 기준으로 기간 목록 생성
	function generatePeriodsFromFilter() {
		const periodsList = [];

		if (filterType === 'month' && selectedMonth) {
			// 단일 월
			periodsList.push(selectedMonth);
		} else if (filterType === 'period') {
			// 기간
			const start = new Date(startYear, startMonth - 1);
			const end = new Date(endYear, endMonth - 1);

			let current = new Date(start);
			while (current <= end) {
				const year = current.getFullYear();
				const month = String(current.getMonth() + 1).padStart(2, '0');
				periodsList.push(`${year}-${month}`);
				current.setMonth(current.getMonth() + 1);
			}
		}

		return periodsList;
	}

	// 데이터 로드
	async function loadCommissions(page = 1) {
		isLoading = true;
		error = '';
		currentPage = page;

		try {
			const params = new URLSearchParams({
				page: page.toString(),
				limit: limit.toString(),
				viewMode: viewMode, // 보기 모드 추가
				sortBy: sortBy // 정렬 기준 추가
			});

			if (filterType === 'month' && selectedMonth) {
				params.append('paymentMonth', selectedMonth);
			} else if (filterType === 'period') {
				params.append('startYear', startYear.toString());
				params.append('startMonth', startMonth.toString());
				params.append('endYear', endYear.toString());
				params.append('endMonth', endMonth.toString());
			}

			if (plannerName) {
				params.append('searchType', 'name');
				params.append('searchTerm', plannerName);
			}

			const response = await fetch(`/api/admin/planner-commission?${params}`);
			const result = await response.json();

			if (result.success) {
				commissions = result.data.commissions;
				// API에서 기간 목록이 없으면 필터 기준으로 생성
				periods = result.data.periods && result.data.periods.length > 0
					? result.data.periods
					: generatePeriodsFromFilter();
				periodTotals = result.data.periodTotals || {}; // 기간별 총계
				totalPages = result.data.pagination.totalPages;
				totalCount = result.data.pagination.totalCount;
				summary = result.data.summary || summary;
			} else {
				error = result.error || '데이터를 불러오는데 실패했습니다.';
			}
		} catch (err) {
			console.error('Error loading commissions:', err);
			error = err.message;
		} finally {
			isLoading = false;
		}
	}

	// 검색
	function handleSearch() {
		loadCommissions(1);
	}

	// 페이지 변경
	function goToPage(page) {
		if (page >= 1 && page <= totalPages) {
			loadCommissions(page);
		}
	}

	// 페이지당 항목 수 변경
	function handleItemsPerPageChange() {
		loadCommissions(1);
	}

	// 필터 타입 변경
	function handleFilterTypeChange() {
		loadCommissions(1);
	}

	// 보기 모드 변경
	function handleViewModeChange() {
		loadCommissions(1);
	}

	// 정렬 변경 (API에서 전체 데이터 기준 정렬)
	function handleSortChange() {
		loadCommissions(1);
	}

	// 기간 변경 (최대 12개월 제한)
	function handlePeriodChange() {
		if (filterType === 'period') {
			// 시작/종료 월 계산 (개월 수)
			const startTotal = startYear * 12 + startMonth;
			const endTotal = endYear * 12 + endMonth;

			// 12개월 초과 시 데이터 로드 안함
			if (endTotal - startTotal > 11) {
				periodLimitExceeded = true;
				commissions = [];
				periods = [];
				return;
			}

			periodLimitExceeded = false;
			loadCommissions(1);
		}
	}

	// 월 변경
	function handleMonthChange() {
		if (filterType === 'month') {
			loadCommissions(1);
		}
	}

	// Enter 키 처리
	function handleKeyPress(event) {
		if (event.key === 'Enter') {
			handleSearch();
		}
	}

	// 금액 포맷
	function formatAmount(amount) {
		if (!amount && amount !== 0) return '-';
		return amount.toLocaleString();
	}

	// 엑셀 다운로드
	async function exportToExcel() {
		try {
			// 전체 데이터 가져오기 (현재 정렬 기준 적용)
			const params = new URLSearchParams({
				page: '1',
				limit: '999999',
				viewMode: viewMode,
				sortBy: sortBy // 정렬 기준 적용
			});
			if (filterType === 'month' && selectedMonth) params.append('paymentMonth', selectedMonth);
			else if (filterType === 'period') {
				params.append('startYear', startYear.toString());
				params.append('startMonth', startMonth.toString());
				params.append('endYear', endYear.toString());
				params.append('endMonth', endMonth.toString());
			}
			if (plannerName) {
				params.append('searchType', 'name');
				params.append('searchTerm', plannerName);
			}

			const response = await fetch(`/api/admin/planner-commission?${params}`);
			const result = await response.json();
			if (!result.success) {
				alert('데이터를 불러오는데 실패했습니다.');
				return;
			}

			const allData = result.data.commissions;
			const exportPeriods = result.data.periods || [];
			const exportPeriodTotals = result.data.periodTotals || {};

			// Excel 내보내기
			const exporter = new PlannerCommissionExcelExporter({
				showPhoneColumn,
				showUserCountColumn,
				showRevenueColumn,
				filterType,
				selectedMonth,
				startYear,
				startMonth,
				endYear,
				endMonth,
				plannerName,
				viewMode
			});

			await exporter.export(allData, exportPeriods, exportPeriodTotals);
		} catch (error) {
			console.error('Excel export error:', error);
			alert('Excel 다운로드에 실패했습니다.');
		}
	}

	// ⭐ 설계사 이름 클릭 핸들러
	function handlePlannerClick(planner) {
		selectedPlannerInfo = {
			plannerAccountId: planner.plannerAccountId?._id || planner.plannerAccountId,
			name: planner.plannerName,
			phone: planner.plannerAccountId?.phone || '',
			bank: planner.plannerAccountId?.bank || '',
			accountNumber: planner.plannerAccountId?.accountNumber || ''
		};
		showPlannerEditModal = true;
	}

	// ⭐ 설계사 정보 저장 후 핸들러
	function handlePlannerSaved(updatedPlanner) {
		// 목록 새로고침
		loadCommissions(currentPage);
	}
</script>

<div class="container">
	<h1 class="title">설계사 지급명부</h1>

	{#if isMobile}
		<!-- ==================== 모바일 버전 ==================== -->

		<!-- 필터 영역 -->
		<div class="mb-2">
			<div class="filter-box">
				<!-- 필터 타입 선택 -->
				<div class="mb-2 flex items-center gap-2">
					<label class="radio-label-mobile">
						<input
							type="radio"
							bind:group={filterType}
							value="month"
							onchange={handleFilterTypeChange}
							class="cursor-pointer"
						/>
						<span class="font-medium">이번 달</span>
					</label>
					<label class="radio-label-mobile">
						<input
							type="radio"
							bind:group={filterType}
							value="period"
							onchange={handleFilterTypeChange}
							class="cursor-pointer"
						/>
						<span class="font-medium">기간</span>
					</label>
				</div>

				<!-- 이번 달 선택 -->
				{#if filterType === 'month'}
					<input
						type="month"
						bind:value={selectedMonth}
						onchange={handleMonthChange}
						class="input-mobile"
					/>
				{/if}

				<!-- 기간 선택 -->
				{#if filterType === 'period'}
					<div class="flex flex-col gap-2">
						<!-- 시작 ~ 종료 -->
						<div class="flex items-center gap-2 text-xs flex-wrap">
							<input
								type="number"
								bind:value={startYear}
								onchange={handlePeriodChange}
								class="input-year-mobile"
								min="2020"
								max="2030"
								placeholder="년"
							/>
							<span class="text-gray-600">년</span>
							<select bind:value={startMonth} onchange={handlePeriodChange} class="select-mobile">
								{#each Array(12) as _, i}
									<option value={i + 1}>{i + 1}월</option>
								{/each}
							</select>
							<span class="text-gray-500">~</span>
							<input
								type="number"
								bind:value={endYear}
								onchange={handlePeriodChange}
								class="input-year-mobile"
								min="2020"
								max="2030"
								placeholder="년"
							/>
							<span class="text-gray-600">년</span>
							<select bind:value={endMonth} onchange={handlePeriodChange} class="select-mobile">
								{#each Array(12) as _, i}
									<option value={i + 1}>{i + 1}월</option>
								{/each}
							</select>
						</div>
					</div>
				{/if}
			</div>
		</div>

		<!-- 보기 모드 선택 -->
		<div class="mb-2">
			<div class="filter-box">
				<div class="flex items-center gap-2">
					<label class="radio-label-mobile">
						<input
							type="radio"
							bind:group={viewMode}
							value="weekly"
							onchange={handleViewModeChange}
							class="cursor-pointer"
						/>
						<span class="font-medium">주간보기</span>
					</label>
					<label class="radio-label-mobile">
						<input
							type="radio"
							bind:group={viewMode}
							value="monthly"
							onchange={handleViewModeChange}
							class="cursor-pointer"
						/>
						<span class="font-medium">월간보기</span>
					</label>
				</div>
			</div>
		</div>

		<!-- 총합계 요약 -->
		<div class="summary-container-mobile">
			<div class="grid grid-cols-2 gap-2">
				<div class="summary-card-mobile">
					<div class="summary-label-mobile">총 설계사</div>
					<div class="summary-value text-gray-800">{summary.totalPlanners}명</div>
				</div>
				<div class="summary-card-mobile">
					<div class="summary-label-mobile">설계 총액</div>
					<div class="summary-value text-green-600">{formatAmount(summary.totalCommission)}원</div>
				</div>
				<div class="summary-card-mobile">
					<div class="summary-label-mobile">지원 총액</div>
					<div class="summary-value text-purple-600">{formatAmount(summary.totalService)}원</div>
				</div>
				<div class="summary-card-mobile">
					<div class="summary-label-mobile">전체 총액</div>
					<div class="summary-value text-indigo-600 font-bold">{formatAmount(summary.grandTotal)}원</div>
				</div>
			</div>
		</div>

		<!-- 검색 및 설정 -->
		<div class="search-section-mobile">
			<!-- 검색 -->
			<div class="mb-2 flex gap-1">
				<input
					type="text"
					bind:value={plannerName}
					onkeypress={handleKeyPress}
					placeholder="설계사 이름..."
					class="input-search-mobile"
				/>
				<button onclick={handleSearch} class="btn-search-mobile">검색</button>
			</div>

			<!-- 설정 -->
			<div class="settings-row-mobile">
				<label class="flex items-center gap-1">
					<span class="text-gray-600 text-xs">정렬:</span>
					<select
						bind:value={sortBy}
						onchange={handleSortChange}
						class="select-page-mobile"
					>
						<option value="name">이름순</option>
						<option value="amount">금액순</option>
						<option value="createdAt">등록일순</option>
					</select>
				</label>
				<label class="flex items-center gap-1">
					<span class="text-gray-600 text-xs">페이지:</span>
					<select
						bind:value={limit}
						onchange={handleItemsPerPageChange}
						class="select-page-mobile"
					>
						<option value={10}>10개</option>
						<option value={20}>20개</option>
						<option value={50}>50개</option>
						<option value={100}>100개</option>
					</select>
				</label>
				<div class="flex items-center gap-2">
					<button onclick={exportToExcel} class="btn-icon-mobile" title="Excel 다운로드">
						<img src="/icons/download.svg" alt="다운로드" class="icon-small" />
					</button>
				</div>
				{#if totalCount > 0}
				<span class="text-xs text-gray-600">총 {totalCount}건</span>
			{/if}
			</div>
		</div>
	{:else}
		<!-- ==================== 데스크탑 버전 ==================== -->

		<!-- 필터 영역 -->
		<div class="mb-2.5 flex items-start gap-2.5">
			<div class="filter-container-desktop">
				<div class="flex items-center gap-1.5 text-[13px]">
					<!-- 이번 달 필터 -->
					<label class="radio-label-desktop">
						<input
							type="radio"
							bind:group={filterType}
							value="month"
							onchange={handleFilterTypeChange}
							class="cursor-pointer"
						/>
						<span>이번 달</span>
					</label>
					{#if filterType === 'month'}
						<input
							type="month"
							bind:value={selectedMonth}
							onchange={handleMonthChange}
							class="input-desktop"
						/>
					{/if}

					<!-- 구분선 -->
					<div class="divider-vertical"></div>

					<!-- 기간 필터 -->
					<label class="radio-label-desktop">
						<input
							type="radio"
							bind:group={filterType}
							value="period"
							onchange={handleFilterTypeChange}
							class="cursor-pointer"
						/>
						<span>기간</span>
					</label>

					{#if filterType === 'period'}
						<input
							type="number"
							bind:value={startYear}
							onchange={handlePeriodChange}
							class="input-year"
							min="2020"
							max="2030"
						/>
						<span class="whitespace-nowrap text-[13px] leading-7">년</span>
						<select bind:value={startMonth} onchange={handlePeriodChange} class="select-month">
							{#each Array(12) as _, i}
								<option value={i + 1}>{i + 1}월</option>
							{/each}
						</select>
						<span class="mx-0.5 text-[13px] leading-7 text-gray-600">~</span>
						<input
							type="number"
							bind:value={endYear}
							onchange={handlePeriodChange}
							class="input-year"
							min="2020"
							max="2030"
						/>
						<span class="whitespace-nowrap text-[13px] leading-7">년</span>
						<select bind:value={endMonth} onchange={handlePeriodChange} class="select-month">
							{#each Array(12) as _, i}
								<option value={i + 1}>{i + 1}월</option>
							{/each}
						</select>
					{/if}

					<!-- 구분선 -->
					<div class="divider-vertical"></div>

					<!-- 보기 모드 필터 -->
					<label class="radio-label-desktop">
						<input
							type="radio"
							bind:group={viewMode}
							value="weekly"
							onchange={handleViewModeChange}
							class="cursor-pointer"
						/>
						<span>주간보기</span>
					</label>
					<label class="radio-label-desktop">
						<input
							type="radio"
							bind:group={viewMode}
							value="monthly"
							onchange={handleViewModeChange}
							class="cursor-pointer"
						/>
						<span>월간보기</span>
					</label>
				</div>
			</div>
		</div>

		<!-- 총합계 요약 섹션 -->
		<div class="summary-container-desktop">
			<div class="grid grid-cols-[repeat(auto-fit,minmax(100px,1fr))] gap-2.5">
				<div class="summary-card-desktop">
					<div class="summary-label-desktop">총 설계사</div>
					<div class="summary-value-desktop text-gray-800">{summary.totalPlanners}명</div>
				</div>
				<div class="summary-card-desktop">
					<div class="summary-label-desktop">설계 총액</div>
					<div class="summary-value-desktop text-green-600">{formatAmount(summary.totalCommission)}원</div>
				</div>
				<div class="summary-card-desktop">
					<div class="summary-label-desktop">지원 총액</div>
					<div class="summary-value-desktop text-purple-600">{formatAmount(summary.totalService)}원</div>
				</div>
				<div class="summary-card-desktop">
					<div class="summary-label-desktop">전체 총액</div>
					<div class="summary-value-desktop text-indigo-600 font-bold">{formatAmount(summary.grandTotal)}원</div>
				</div>
			</div>
		</div>

		<!-- 검색 및 페이지 설정 -->
		<div class="flex items-center justify-between gap-2.5 mb-2.5">
			<!-- 검색 영역 (왼쪽) -->
			<div class="flex items-center gap-1.5">
				<!-- 검색 입력 -->
				<input
					type="text"
					bind:value={plannerName}
					onkeypress={handleKeyPress}
					placeholder="설계사 이름으로 검색..."
					class="input-search-desktop"
				/>

				<!-- 검색 버튼 -->
				<button onclick={handleSearch} class="btn-gradient-blue">
					<img src="/icons/search.svg" alt="검색" class="icon-small" />
				</button>
			</div>

			<!-- 설정 영역 (오른쪽) -->
			<div class="flex items-center gap-2.5">
				<!-- 정렬 -->
				<label class="label-desktop">
					정렬
					<select
						bind:value={sortBy}
						onchange={handleSortChange}
						class="select-desktop-with-focus"
					>
						<option value="name">이름순</option>
						<option value="amount">금액순</option>
						<option value="createdAt">등록일순</option>
					</select>
				</label>
				<!-- 페이지당 항목 수 -->
				<label class="label-desktop">
					페이지당
					<select
						bind:value={limit}
						onchange={handleItemsPerPageChange}
						class="select-desktop-with-focus"
					>
						<option value={10}>10개</option>
						<option value={20}>20개</option>
						<option value={50}>50개</option>
						<option value={100}>100개</option>
					</select>
				</label>

				<!-- Excel Export 버튼 -->
				<button onclick={exportToExcel} title="Excel 다운로드" class="btn-gradient-green">
					<img src="/icons/download.svg" alt="다운로드" class="icon-small" />
				</button>

				{#if totalCount > 0}
					<span class="text-[13px] text-gray-600">총 {totalCount}건</span>
				{/if}
			</div>
		</div>
	{/if}

	<!-- 테이블 -->
	{#if periodLimitExceeded}
	<div class="period-limit-message">
		<p class="text-red-500 font-medium">최대 12개월까지만 조회 가능합니다.</p>
	</div>
{:else if isLoading}
	<div class="loading">데이터를 불러오는 중...</div>
{:else if error}
	<div class="error">{error}</div>
{:else}
	<div class="table-wrapper">
			<table class="payment-table">
				<thead>
					<!-- Row 1: 순번, 설계사, 전체총액/설계총액/지원총액, 기간 -->
					<tr>
						<th rowspan="2" class="th-number th-sticky-0">순번</th>
						<th rowspan="2" class="th-name th-sticky-1">설계사</th>
						<th rowspan="2" class="th-name th-sticky-2">계좌은행</th>
						<th rowspan="2" class="th-name th-sticky-3">계좌번호</th>
						{#if showPhoneColumn}
							<th rowspan="2" class="th-name th-sticky-4">연락처</th>
						{/if}
						<th rowspan="2" class="th-planner-total">전체 총액</th>
						<th rowspan="2" class="th-planner-total">설계 총액</th>
						<th rowspan="2" class="th-planner-total">지원 총액</th>
						{#each periods as period}
							{@const colCount = 3 + (showUserCountColumn ? 1 : 0) + (showRevenueColumn ? 1 : 0)}
							<th colspan={colCount} class="th-group period-border">{formatPeriodLabel(period)}</th>
						{/each}
					</tr>
					<!-- Row 2: 총액, 수당금액, 지원총액 -->
					<tr>
						{#each periods as period}
							<th class="th-sub period-border">총액</th>
							<th class="th-sub">수당금액</th>
							<th class="th-sub">지원총액</th>
							{#if showUserCountColumn}
								<th class="th-sub">등록인원</th>
							{/if}
							{#if showRevenueColumn}
								<th class="th-sub">매출금</th>
							{/if}
						{/each}
					</tr>
				</thead>
				<tbody>
				{#if commissions.length === 0}
					{@const colCount = 3 + (showUserCountColumn ? 1 : 0) + (showRevenueColumn ? 1 : 0)}
					{@const baseColCount = 4 + (showPhoneColumn ? 1 : 0)}
					{@const plannerSummaryCols = 3}
					<!-- 빈 데이터 메시지 -->
					<tr>
						<td colspan={baseColCount + plannerSummaryCols + periods.length * colCount} class="text-center py-12">
							데이터가 없습니다
						</td>
					</tr>
				{:else}
					{#each commissions as planner, index}
						{@const plannerTotal = periods.reduce((sum, period) => {
							const p = planner.periods[period];
							if (p) {
								return {
									totalAmount: sum.totalAmount + (p.totalAmount || 0),
									commissionAmount: sum.commissionAmount + (p.commissionAmount || 0),
									serviceAmount: sum.serviceAmount + (p.serviceAmount || 0)
								};
							}
							return sum;
						}, { totalAmount: 0, commissionAmount: 0, serviceAmount: 0 })}
						<tr class="data-row">
							<td class="td-number td-sticky-0">{(currentPage - 1) * limit + index + 1}</td>
							<td class="td-name td-sticky-1">
								<button
									onclick={() => handlePlannerClick(planner)}
									class="planner-link"
								>
									{planner.plannerName}
								</button>
							</td>
							<td class="td-bank td-sticky-2">{planner.plannerAccountId?.bank || '-'}</td>
						<td class="td-account td-sticky-3">{planner.plannerAccountId?.accountNumber || '-'}</td>
						{#if showPhoneColumn}
							<td class="td-phone td-sticky-4">{planner.plannerAccountId?.phone || '-'}</td>
						{/if}
							<!-- 설계사별 총액 -->
							<td class="td-amount planner-total highlight-total">{formatAmount(plannerTotal.totalAmount)}</td>
							<td class="td-amount planner-total highlight-commission">{formatAmount(plannerTotal.commissionAmount)}</td>
							<td class="td-amount planner-total highlight-service">{formatAmount(plannerTotal.serviceAmount)}</td>
							<!-- 기간별 데이터 -->
							{#each periods as period}
								{@const periodData = planner.periods[period]}
								<td class="td-amount highlight-total period-border">{periodData ? formatAmount(periodData.totalAmount) : '-'}</td>
								<td class="td-amount highlight-commission">{periodData ? formatAmount(periodData.commissionAmount) : '-'}</td>
								<td class="td-amount highlight-service">{periodData ? formatAmount(periodData.serviceAmount) : '-'}</td>
								{#if showUserCountColumn}
									<td class="td-count">{periodData ? periodData.totalUsers : '-'}</td>
								{/if}
								{#if showRevenueColumn}
									<td class="td-amount">{periodData ? formatAmount(periodData.totalRevenue) : '-'}</td>
								{/if}
							{/each}
						</tr>
					{/each}

					<!-- 총계 행 -->
					<tr class="grand-total-row">
						<td colspan={4 + (showPhoneColumn ? 1 : 0)} class="grand-total-label td-sticky-0">총계</td>
						<!-- 설계사별 총액 합계 -->
						<td class="grand-total-value planner-total highlight-total">{formatAmount(summary.grandTotal)}</td>
						<td class="grand-total-value planner-total highlight-commission">{formatAmount(summary.totalCommission)}</td>
						<td class="grand-total-value planner-total highlight-service">{formatAmount(summary.totalService)}</td>
						<!-- 기간별 총계 -->
						{#each periods as period}
							{@const periodTotal = periodTotals[period] || { totalAmount: 0, commissionAmount: 0, serviceAmount: 0, totalUsers: 0, totalRevenue: 0 }}
							<td class="grand-total-value highlight-total period-border">{formatAmount(periodTotal.totalAmount)}</td>
							<td class="grand-total-value highlight-commission">{formatAmount(periodTotal.commissionAmount)}</td>
							<td class="grand-total-value highlight-service">{formatAmount(periodTotal.serviceAmount)}</td>
							{#if showUserCountColumn}
								<td class="grand-total-value">{periodTotal.totalUsers}</td>
							{/if}
							{#if showRevenueColumn}
								<td class="grand-total-value">{formatAmount(periodTotal.totalRevenue)}</td>
							{/if}
						{/each}
					</tr>
				{/if}
				</tbody>
			</table>
		</div>

		<!-- 페이지네이션 -->
		{#if totalPages > 1}
			<div class="pagination">
				<button
					onclick={() => goToPage(currentPage - 1)}
					disabled={currentPage === 1}
					class="pagination-btn"
				>
					이전
				</button>

				{#each Array(totalPages) as _, i}
					{#if i + 1 === 1 || i + 1 === totalPages || (i + 1 >= currentPage - 2 && i + 1 <= currentPage + 2)}
						<button
							onclick={() => goToPage(i + 1)}
							class="pagination-btn {currentPage === i + 1 ? 'active' : ''}"
						>
							{i + 1}
						</button>
					{:else if i + 1 === currentPage - 3 || i + 1 === currentPage + 3}
						<span class="pagination-dots">...</span>
					{/if}
				{/each}

				<button
					onclick={() => goToPage(currentPage + 1)}
					disabled={currentPage === totalPages}
					class="pagination-btn"
				>
					다음
				</button>
			</div>
		{/if}
	{/if}
</div>

<!-- ⭐ 설계사 수정 모달 -->
<PlannerAccountEditModal
	isOpen={showPlannerEditModal}
	plannerInfo={selectedPlannerInfo}
	onClose={() => showPlannerEditModal = false}
	onSaved={handlePlannerSaved}
/>

<style>
	@reference "$lib/../app.css";

	/* ==================== 공통 ==================== */
	.container {
		padding: 20px;
		max-width: 100%;
		background: white;
	}

	.title {
		font-size: 1.25rem;
		font-weight: 700;
		margin-bottom: 20px;
		color: #1f2937;
		text-align: center;
	}

	.icon-small {
		@apply h-4 w-4 brightness-0 invert;
	}

	/* ==================== 모바일 ==================== */
	.filter-box {
		@apply border border-gray-300 bg-white p-2;
	}

	.radio-label-mobile {
		@apply flex cursor-pointer items-center gap-1 text-xs;
	}

	.input-mobile {
		@apply w-full border border-gray-300 px-2 py-1.5 text-xs;
	}

	.input-year-mobile {
		@apply w-20 border border-gray-300 px-2 py-1.5 text-xs text-center;
	}

	.select-mobile {
		@apply w-20 border border-gray-300 px-2 py-1.5 text-xs;
	}

	.summary-container-mobile {
		@apply mb-2 border border-gray-200 bg-gray-50 p-2;
	}

	.summary-card-mobile {
		@apply flex flex-col items-center bg-white p-2;
	}

	.summary-label-mobile {
		@apply mb-1 text-xs text-gray-500;
	}

	.summary-value {
		@apply text-lg font-bold;
	}

	.search-section-mobile {
		@apply mb-2 bg-gray-50 p-2;
	}

	.input-search-mobile {
		@apply flex-1 border border-gray-300 px-2 py-1.5 text-xs;
	}

	.btn-search-mobile {
		@apply bg-blue-500 px-3 py-1.5 text-xs font-medium text-white active:bg-blue-700;
	}

	.settings-row-mobile {
		@apply flex items-center justify-between gap-2 text-xs;
	}

	.select-page-mobile {
		@apply min-w-[60px] border border-gray-300 bg-white px-2 py-1 text-xs;
	}

	/* ==================== 데스크탑 ==================== */
	.filter-container-desktop {
		@apply min-w-[280px] flex-1 border border-gray-300 bg-white px-2.5 py-2;
	}

	.radio-label-desktop {
		@apply flex cursor-pointer items-center gap-0.5 whitespace-nowrap;
	}

	.input-desktop {
		@apply h-7 border border-gray-300 px-1.5 py-1 text-[13px] leading-[1.4];
	}

	.input-year {
		@apply h-7 w-[60px] border border-gray-300 px-1.5 py-1 text-[13px] leading-[1.4];
	}

	.select-month {
		@apply h-7 w-[60px] border border-gray-300 px-1.5 py-1 pr-5 text-[13px] leading-[1.4];
	}

	.divider-vertical {
		@apply mx-1.5 h-5 w-px bg-gray-300;
	}

	.summary-container-desktop {
		@apply my-2 border border-gray-200 bg-gray-50 px-2.5 py-2;
	}

	.summary-card-desktop {
		@apply flex flex-col text-center;
	}

	.summary-label-desktop {
		@apply mb-0.5 text-[10px] font-medium text-gray-500;
	}

	.summary-value-desktop {
		@apply whitespace-nowrap text-base font-bold;
	}

	.search-container-desktop {
		@apply my-3 flex flex-wrap items-center gap-2.5 bg-gradient-to-b from-gray-50 to-white p-3 shadow-sm;
	}

	.input-search-desktop {
		@apply h-7 min-w-[200px] flex-1 border-2 border-gray-200 bg-white px-1.5 py-1 text-[13px] leading-[1.4] outline-none transition-all hover:border-gray-400 focus:border-blue-500 focus:shadow-[0_0_0_2px_rgba(0,123,255,0.15)];
	}

	.btn-gradient-blue {
		@apply flex h-7 flex-shrink-0 cursor-pointer items-center justify-center border-none bg-gradient-to-br from-blue-500 to-blue-700 px-2 text-white shadow-[0_1px_4px_rgba(0,123,255,0.3)] transition-all hover:-translate-y-px hover:from-blue-700 hover:to-blue-900 hover:shadow-[0_2px_8px_rgba(0,123,255,0.4)] active:translate-y-0 active:shadow-[0_1px_3px_rgba(0,123,255,0.3)];
	}

	.label-desktop {
		@apply flex flex-shrink-0 items-center gap-1.5 whitespace-nowrap text-[13px] font-medium text-gray-700;
	}

	.select-desktop-with-focus {
		@apply flex h-7 min-w-[78px] cursor-pointer items-center border-2 border-gray-200 bg-white px-1.5 py-1 pr-5 text-[13px] font-medium leading-[1.4] outline-none transition-all hover:border-blue-500 hover:shadow-[0_0_0_2px_rgba(0,123,255,0.1)] focus:border-blue-500 focus:shadow-[0_0_0_2px_rgba(0,123,255,0.15)];
	}

	.toggle-container {
		@apply flex flex-shrink-0 items-center gap-3 rounded border-2 border-gray-200 bg-white px-3 py-1;
	}

	.toggle-label {
		@apply flex cursor-pointer select-none items-center gap-1.5 whitespace-nowrap text-[13px] font-medium text-gray-700 hover:text-blue-500;
	}

	.checkbox-desktop {
		@apply h-4 w-4 cursor-pointer accent-blue-500;
	}

	.btn-gradient-green {
		@apply flex h-7 flex-shrink-0 cursor-pointer items-center justify-center rounded border-none bg-gradient-to-br from-green-500 to-green-700 px-2 text-white shadow-[0_1px_4px_rgba(40,167,69,0.3)] transition-all hover:-translate-y-px hover:from-green-700 hover:to-green-900 hover:shadow-[0_2px_8px_rgba(40,167,69,0.4)] active:translate-y-0 active:shadow-[0_1px_3px_rgba(40,167,69,0.3)];
	}

	.checkbox-label-mobile {
		@apply flex cursor-pointer items-center gap-1 text-xs;
	}

	.btn-icon-mobile {
		@apply rounded bg-green-500 p-1.5 text-white active:bg-green-700;
	}

	/* ==================== 테이블 ==================== */
	/* 테이블 래퍼 */
	.table-wrapper {
		@apply relative overflow-x-auto border border-gray-300 bg-white;
	}

	.table-wrapper::-webkit-scrollbar {
		@apply h-2.5;
	}

	.table-wrapper::-webkit-scrollbar-track {
		@apply bg-gray-100;
	}

	.table-wrapper::-webkit-scrollbar-thumb {
		@apply rounded bg-gray-400;
	}

	.table-wrapper::-webkit-scrollbar-thumb:hover {
		@apply bg-gray-600;
	}

	/* 테이블 기본 */
	.payment-table {
		@apply w-full min-w-max border-separate border-spacing-0;
	}

	/* 헤더 - 기본 */
	.th-number,
	.th-name {
		@apply border-b border-r border-t border-gray-300 bg-gray-200;
		@apply whitespace-nowrap p-1.5 text-center text-sm font-bold;
	}

	.th-number:first-child {
		@apply border-l;
	}

	/* 헤더 - 그룹 */
	.th-group {
		@apply border-b border-r border-t border-gray-300 bg-blue-100;
		@apply whitespace-nowrap p-1.5 text-center text-sm font-bold;
	}

	/* 헤더 - 설계사별 총액 */
	.th-planner-total {
		@apply border-b border-r border-t border-gray-300 bg-yellow-100;
		@apply whitespace-nowrap p-1.5 text-center text-sm font-bold;
	}

	/* 헤더 - 그룹 서브 (총액) */
	.th-group-sub {
		@apply border-b border-r border-gray-300 bg-blue-50;
		@apply whitespace-nowrap p-1.5 text-center text-[13px] font-semibold;
	}

	/* 헤더 - 서브 */
	.th-sub {
		@apply border-b border-r border-gray-300 bg-gray-200;
		@apply min-w-[100px] whitespace-nowrap p-1.5 text-center text-[13px] font-normal;
	}

	/* 헤더 - 고정 컬럼 (데스크탑만) */
	.th-sticky-0 {
		@apply min-w-[60px];
		@apply md:sticky md:left-0 md:z-20;
	}

	.th-sticky-1 {
		@apply min-w-[120px];
		@apply md:sticky md:left-[60px] md:z-[19];
	}

	.th-sticky-2 {
		@apply min-w-[80px];
		@apply md:sticky md:left-[180px] md:z-[18];
	}

	.th-sticky-3 {
		@apply min-w-[140px];
		@apply md:sticky md:left-[260px] md:z-[17];
	}

	.th-sticky-4 {
		@apply min-w-[120px];
		@apply md:sticky md:left-[400px] md:z-[16];
	}

	/* 데이터 행 */
	.data-row:hover td {
		@apply bg-black/[0.02];
	}

	/* 데이터 셀 - 고정 컬럼 (데스크탑만) */
	.td-sticky-0 {
		@apply border-b border-l border-r border-gray-300;
		@apply whitespace-nowrap p-1.5 text-center text-sm;
		@apply md:sticky md:left-0 md:bg-white;
	}

	@media (min-width: 768px) {
		.td-sticky-0 {
			z-index: 10 !important;
		}
		.data-row:hover .td-sticky-0 {
			background-color: #fafafa !important;
			z-index: 10 !important;
		}
	}

	.td-sticky-1 {
		@apply border-b border-r border-gray-300;
		@apply whitespace-nowrap p-1.5 text-center text-sm;
		@apply md:sticky md:left-[60px] md:bg-white;
	}

	@media (min-width: 768px) {
		.td-sticky-1 {
			z-index: 9 !important;
		}
		.data-row:hover .td-sticky-1 {
			background-color: #fafafa !important;
			z-index: 9 !important;
		}
	}

	.td-sticky-2 {
		@apply border-b border-r border-gray-300;
		@apply whitespace-nowrap p-1.5 text-center text-sm;
		@apply md:sticky md:left-[180px] md:bg-white;
	}

	@media (min-width: 768px) {
		.td-sticky-2 {
			z-index: 8 !important;
		}
		.data-row:hover .td-sticky-2 {
			background-color: #fafafa !important;
			z-index: 8 !important;
		}
	}

	.td-sticky-3 {
		@apply border-b border-r border-gray-300;
		@apply whitespace-nowrap p-1.5 text-center text-sm;
		@apply md:sticky md:left-[260px] md:bg-white;
	}

	@media (min-width: 768px) {
		.td-sticky-3 {
			z-index: 7 !important;
		}
		.data-row:hover .td-sticky-3 {
			background-color: #fafafa !important;
			z-index: 7 !important;
		}
	}

	.td-sticky-4 {
		@apply border-b border-r border-gray-300;
		@apply whitespace-nowrap p-1.5 text-center text-sm;
		@apply md:sticky md:left-[400px] md:bg-white;
	}

	@media (min-width: 768px) {
		.td-sticky-4 {
			z-index: 6 !important;
		}
		.data-row:hover .td-sticky-4 {
			background-color: #fafafa !important;
			z-index: 7 !important;
		}
	}

	/* 데이터 셀 - 일반 */
	.td-number,
	.td-name,
	.td-phone,
	.td-bank,
	.td-account,
	.td-count {
		@apply border-b border-r border-gray-300;
		@apply whitespace-nowrap p-1.5 text-center text-sm;
	}

	.td-number:first-child {
		@apply border-l;
	}

	.td-number {
		@apply text-gray-500;
	}

	.td-name {
		@apply font-medium;
	}

	/* ⭐ 설계사 이름 링크 */
	.planner-link {
		@apply text-blue-600 hover:text-blue-800 hover:underline cursor-pointer transition-colors bg-transparent border-none font-medium;
	}

	.td-phone {
		@apply text-gray-500;
	}

	.td-count {
		@apply font-medium;
	}

	/* 데이터 셀 - 금액 */
	.td-amount {
		@apply border-b border-r border-gray-300 bg-yellow-100;
		@apply whitespace-nowrap p-1.5 pr-3 text-right text-sm font-bold;
	}

	.data-row:hover .td-amount {
		@apply bg-yellow-200;
	}

	.td-amount.highlight-total {
		@apply bg-blue-50 text-blue-700 font-bold;
	}

	.data-row:hover .td-amount.highlight-total {
		@apply bg-blue-100;
	}

	.td-amount.highlight-commission {
		@apply bg-green-50 text-green-700 font-bold;
	}

	.data-row:hover .td-amount.highlight-commission {
		@apply bg-green-100;
	}

	.td-amount.highlight-service {
		@apply bg-purple-50 text-purple-700 font-bold;
	}

	.data-row:hover .td-amount.highlight-service {
		@apply bg-purple-100;
	}

	/* 설계사별 총액 셀 */
	.td-amount.planner-total {
		@apply bg-yellow-50 font-extrabold;
	}

	.data-row:hover .td-amount.planner-total {
		@apply bg-yellow-100;
	}

	.td-amount.planner-total.highlight-total {
		@apply text-blue-800;
	}

	.td-amount.planner-total.highlight-commission {
		@apply text-green-800;
	}

	.td-amount.planner-total.highlight-service {
		@apply text-purple-800;
	}

	/* 총계 행 */
	.grand-total-row {
		@apply border-t-2 border-gray-400 bg-purple-100;
	}

	.grand-total-label {
		@apply border-b border-l border-r border-gray-300;
		@apply whitespace-nowrap p-1.5 text-center text-sm font-bold;
		@apply bg-purple-100;
		@apply md:sticky md:left-0;
	}

	@media (min-width: 768px) {
		.grand-total-label {
			z-index: 10 !important;
		}
	}

	.grand-total-value {
		@apply border-b border-r border-gray-300 bg-purple-50;
		@apply whitespace-nowrap p-1.5 pr-3 text-right text-sm font-bold;
	}

	.grand-total-value.highlight-total {
		@apply bg-blue-100 text-blue-700;
	}

	.grand-total-value.highlight-commission {
		@apply bg-green-100 text-green-700;
	}

	.grand-total-value.highlight-service {
		@apply bg-purple-100 text-purple-700;
	}

	/* 총계 행 - 설계사별 총액 */
	.grand-total-value.planner-total {
		@apply bg-yellow-100 font-extrabold;
	}

	.grand-total-value.planner-total.highlight-total {
		@apply text-blue-800;
	}

	.grand-total-value.planner-total.highlight-commission {
		@apply text-green-800;
	}

	.grand-total-value.planner-total.highlight-service {
		@apply text-purple-800;
	}

	/* 빈 메시지 */
	.empty-message {
		@apply border-b border-l border-r border-gray-300 bg-white py-10 text-center italic text-gray-600;
	}

	/* 페이지네이션 */
	.pagination {
		display: flex;
		justify-content: center;
		align-items: center;
		gap: 5px;
		padding: 15px 20px;
		background: white;
		border-top: 1px solid #e5e7eb;
	}

	.pagination-btn {
		padding: 6px 12px;
		background: white;
		border: 1px solid #d1d5db;
		border-radius: 4px;
		cursor: pointer;
		font-size: 0.8125rem;
		transition: all 0.15s;
		color: #374151;
		font-weight: 400;
		min-width: 38px;
		height: 38px;
		display: inline-flex;
		align-items: center;
		justify-content: center;
	}

	.pagination-btn:hover:not(:disabled) {
		background: #f3f4f6;
		border-color: #9ca3af;
	}

	.pagination-btn:disabled {
		opacity: 0.4;
		cursor: not-allowed;
		background: white;
		color: #9ca3af;
	}

	.pagination-btn.active {
		background: #3b82f6;
		color: white;
		border-color: #3b82f6;
		font-weight: 500;
	}

	.pagination-dots {
		padding: 0 5px;
		color: #9ca3af;
		font-size: 0.875rem;
	}

	/* 기간 경계선 (주간보기/월간보기 구분) */
	.period-border {
		border-left: 2px solid #3b82f6 !important; /* 파란색 굵은 경계선 */
	}

	/* 기간 제한 초과 메시지 */
	.period-limit-message {
		@apply flex items-center justify-center py-20 text-center;
	}
</style>
