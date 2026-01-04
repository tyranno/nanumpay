<script>
	import { onMount } from 'svelte';
	import { browser } from '$app/environment';
	import { paymentPageFilterState } from '$lib/stores/dashboardStore';
	import PaymentColumnSettingsModal from './PaymentColumnSettingsModal.svelte';
	import WindowsModal from '$lib/components/WindowsModal.svelte';

	// 기간 제한 알림 모달 상태
	let showPeriodLimitAlert = false;

	// Props
	export let isLoading = false;
	export let isProcessingPast = false;
	export let grandTotal = { amount: 0, tax: 0, net: 0 };
	export let totalPaymentTargets = 0;
	export let hasData = false;
	export let showPlannerOption = true; // ⭐ 설계자 옵션 표시 여부 (기본값 true)
	export let enablePeriodLimit = true; // ⭐ 기간 제한 활성화 (설계사/사용자만, 관리자는 false)
	export let showSubtotalOptions = false; // ⭐ 소계 표시 옵션 (설계사 전용)
	export let subtotalDisplayMode = 'noSubtotals'; // 'noSubtotals' | 'withSubtotals' | 'subtotalsOnly'
	export let filterStore = null; // ⭐ 외부 store 주입 (없으면 기본 paymentPageFilterState 사용)
	export let isPlannerMode = false; // ⭐ 설계사 전용 모드 (고정 컬럼 옵션 표시)

	// ⭐ 실제 사용할 store (외부 주입 또는 기본값)
	$: activeStore = filterStore || paymentPageFilterState;

	// ⭐ 체크박스 상태 (subtotalDisplayMode에서 파생)
	let showSubtotals = subtotalDisplayMode === 'withSubtotals' || subtotalDisplayMode === 'subtotalsOnly';
	let subtotalsOnly = subtotalDisplayMode === 'subtotalsOnly';

	// Event handler props (Svelte 5 style)
	export let onFilterChange = () => {};
	export let onPeriodChange = () => {};
	export let onDateChange = () => {};
	export let onSearch = () => {};
	export let onItemsPerPageChange = () => {};
	export let onSortChange = () => {}; // 정렬 변경 핸들러
	export let onSubtotalModeChange = () => {}; // ⭐ 소계 표시 모드 변경 핸들러
	export let onExport = () => {};
	export let onProcessPast = () => {};

	// 모바일 감지
	let isMobile = false;

	function checkScreenSize() {
		if (browser) {
			isMobile = window.innerWidth < 768;
		}
	}

	onMount(() => {
		checkScreenSize();
		
		// 모바일에서는 은행/계좌번호 기본 숨김
		if (isMobile && browser) {
			showBankColumn = false;
			showAccountColumn = false;
			updateStore();
		}
		
		window.addEventListener('resize', checkScreenSize);
		return () => {
			window.removeEventListener('resize', checkScreenSize);
		};
	});

	// ⭐ Store에서 값 가져오기 (activeStore 사용)
	// 초기값은 기본 store에서 가져오고, onMount에서 activeStore로 동기화
	let filterType = $paymentPageFilterState.filterType;
	let selectedDate = $paymentPageFilterState.selectedDate;
	let selectedYear = $paymentPageFilterState.selectedYear;
	let selectedMonth = $paymentPageFilterState.selectedMonth;
	let periodType = $paymentPageFilterState.periodType;
	let startYear = $paymentPageFilterState.startYear;
	let startMonth = $paymentPageFilterState.startMonth;
	let endYear = $paymentPageFilterState.endYear;
	let endMonth = $paymentPageFilterState.endMonth;
	let itemsPerPage = $paymentPageFilterState.itemsPerPage;
	let showGradeInfoColumn = $paymentPageFilterState.showGradeInfoColumn;
	let showTaxColumn = $paymentPageFilterState.showTaxColumn;
	let showNetColumn = $paymentPageFilterState.showNetColumn;
	let showPlannerColumn = $paymentPageFilterState.showPlannerColumn;
	let showBankColumn = $paymentPageFilterState.showBankColumn;
	let showAccountColumn = $paymentPageFilterState.showAccountColumn;
	let showCumulativeColumn = $paymentPageFilterState.showCumulativeColumn; // ⭐ 누적총액 컬럼
	// ⭐ 설계사 전용 고정 컬럼 (plannerPaymentFilterState에서만 사용)
	let showInsuranceColumn = true;
	let showRegistrationDateColumn = true;
	let showDeadlineColumn = true;
	let searchQuery = $paymentPageFilterState.searchQuery;
	let searchCategory = $paymentPageFilterState.searchCategory;
	let sortByName = $paymentPageFilterState.sortByName ?? true;
	// ⭐ 주별 기간 선택용
	let startWeekDate = $paymentPageFilterState.startWeekDate;
	let endWeekDate = $paymentPageFilterState.endWeekDate;

	// ⭐ filterStore가 주입된 경우, 해당 store에서 값 동기화
	let storeInitialized = false;
	$: if (filterStore && !storeInitialized) {
		const storeValue = $activeStore;
		if (storeValue) {
			filterType = storeValue.filterType ?? filterType;
			selectedDate = storeValue.selectedDate ?? selectedDate;
			selectedYear = storeValue.selectedYear ?? selectedYear;
			selectedMonth = storeValue.selectedMonth ?? selectedMonth;
			periodType = storeValue.periodType ?? periodType;
			startYear = storeValue.startYear ?? startYear;
			startMonth = storeValue.startMonth ?? startMonth;
			endYear = storeValue.endYear ?? endYear;
			endMonth = storeValue.endMonth ?? endMonth;
			itemsPerPage = storeValue.itemsPerPage ?? itemsPerPage;
			showGradeInfoColumn = storeValue.showGradeInfoColumn ?? showGradeInfoColumn;
			showTaxColumn = storeValue.showTaxColumn ?? showTaxColumn;
			showNetColumn = storeValue.showNetColumn ?? showNetColumn;
			showPlannerColumn = storeValue.showPlannerColumn ?? showPlannerColumn;
			showBankColumn = storeValue.showBankColumn ?? showBankColumn;
			showAccountColumn = storeValue.showAccountColumn ?? showAccountColumn;
			showCumulativeColumn = storeValue.showCumulativeColumn ?? showCumulativeColumn; // ⭐ 누적총액 컬럼
			// ⭐ 설계사 전용 고정 컬럼
			showInsuranceColumn = storeValue.showInsuranceColumn ?? showInsuranceColumn;
			showRegistrationDateColumn = storeValue.showRegistrationDateColumn ?? showRegistrationDateColumn;
			showDeadlineColumn = storeValue.showDeadlineColumn ?? showDeadlineColumn;
			searchQuery = storeValue.searchQuery ?? searchQuery;
			searchCategory = storeValue.searchCategory ?? searchCategory;
			sortByName = storeValue.sortByName ?? true;
			// ⭐ 주별 기간 선택용
			startWeekDate = storeValue.startWeekDate ?? startWeekDate;
			endWeekDate = storeValue.endWeekDate ?? endWeekDate;
			storeInitialized = true;
		}
	}

	// 컬럼 설정 모달 상태
	let showColumnSettings = false;
	let tempSettings = {};

	function updateStore() {
		if (browser) {
			// ⭐ activeStore 사용 (외부 주입 또는 기본값)
			activeStore.set({
				filterType,
				selectedDate,
				selectedYear,
				selectedMonth,
				periodType,
				startYear,
				startMonth,
				endYear,
				endMonth,
				// ⭐ 주별 기간 선택용
				startWeekDate,
				endWeekDate,
				itemsPerPage,
				showGradeInfoColumn,
				showTaxColumn,
				showNetColumn,
				showPlannerColumn,
				showBankColumn,
				showAccountColumn,
				showCumulativeColumn, // ⭐ 누적총액 컬럼
				// ⭐ 설계사 전용 고정 컬럼
				showInsuranceColumn,
				showRegistrationDateColumn,
				showDeadlineColumn,
				searchQuery,
				searchCategory,
				sortByName
			});
		}
	}

	// 이벤트 핸들러
	function handleSortChange() {
		updateStore();
		onSortChange();
	}

	// ⭐ 소계 표시 모드 변경 핸들러 (체크박스 → 모드 변환)
	function handleSubtotalModeChange() {
		// 체크박스 상태에서 모드 계산
		if (subtotalsOnly) {
			subtotalDisplayMode = 'subtotalsOnly';
			showSubtotals = true;  // "소계만"이면 소계 표시 자동 활성화
		} else if (showSubtotals) {
			subtotalDisplayMode = 'withSubtotals';
		} else {
			subtotalDisplayMode = 'noSubtotals';
		}
		onSubtotalModeChange(subtotalDisplayMode);
	}

	function handleFilterTypeChange() {
		updateStore();
		onFilterChange();
	}

	function handlePeriodChange() {
		// ⭐ 기간 제한 (설계사/사용자만, 관리자는 제한 없음)
		// 현재주 포함 4주까지만 선택 가능
		if (enablePeriodLimit) {
			const maxFriday = getMaxFriday();
			const maxDateStr = getMaxDate();

			let wasAdjusted = false;

			// ⭐ 주별 기간 선택: 날짜 기반 제한
			if (startWeekDate > maxDateStr) {
				startWeekDate = maxDateStr;
				wasAdjusted = true;
			}

			if (endWeekDate > maxDateStr) {
				endWeekDate = maxDateStr;
				wasAdjusted = true;
			}

			// 시작일이 종료일보다 늦으면 조정
			if (startWeekDate > endWeekDate) {
				startWeekDate = endWeekDate;
			}

			// 제한 초과 시 알림 모달 표시
			if (wasAdjusted) {
				showPeriodLimitAlert = true;
			}
		}

		// ⭐ 날짜에서 년/월 추출하여 업데이트 (paymentService 호출용)
		if (startWeekDate) {
			const startDate = new Date(startWeekDate);
			startYear = startDate.getFullYear();
			startMonth = startDate.getMonth() + 1;
		}
		if (endWeekDate) {
			const endDate = new Date(endWeekDate);
			endYear = endDate.getFullYear();
			endMonth = endDate.getMonth() + 1;
		}

		updateStore();
		onPeriodChange();
	}

	function handleSearch() {
		updateStore();
		onSearch();
	}

	function handleKeyPress(event) {
		if (event.key === 'Enter') {
			handleSearch();
		}
	}

	function handleItemsPerPageChange() {
		updateStore();
		onItemsPerPageChange();
	}

	// ⭐ 검색 카테고리 변경 시 검색어 초기화
	function handleSearchCategoryChange() {
		searchQuery = '';
		updateStore();
	}

	// 날짜 변경 핸들러
	function handleDateChange(event) {
		selectedDate = event.target.value;
		updateStore();
		onDateChange(event.target.value);
	}

	function handleExport() {
		onExport();
	}

	function handleProcessPast() {
		onProcessPast();
	}

	// 금액 포맷
	function formatAmount(amount) {
		if (!amount && amount !== 0) return '-';
		return amount.toLocaleString();
	}

	// ⭐ 현재 주의 금요일 계산
	function getCurrentFriday() {
		const now = new Date();
		const dayOfWeek = now.getDay(); // 0=일, 1=월, ..., 5=금, 6=토
		const daysToFriday = dayOfWeek <= 5 ? (5 - dayOfWeek) : (5 - dayOfWeek + 7);
		const friday = new Date(now);
		friday.setDate(now.getDate() + daysToFriday);
		friday.setHours(0, 0, 0, 0);
		return friday;
	}

	// ⭐ 최대 선택 가능 날짜 계산 (현재주 포함 4주 = 총 5주 뒤 금요일)
	function getMaxFriday() {
		const currentFriday = getCurrentFriday();
		const maxFriday = new Date(currentFriday);
		maxFriday.setDate(currentFriday.getDate() + 21); // 이번주 포함 4주 = 3주 후
		return maxFriday;
	}

	// ⭐ 최대 선택 가능 날짜 (date picker용)
	function getMaxDate() {
		const maxFriday = getMaxFriday();
		return `${maxFriday.getFullYear()}-${String(maxFriday.getMonth() + 1).padStart(2, '0')}-${String(maxFriday.getDate()).padStart(2, '0')}`;
	}

	// ⭐ 최대 선택 가능 월 계산 (현재주 + 4주가 속한 월)
	function getMaxMonth() {
		const maxFriday = getMaxFriday();
		return `${maxFriday.getFullYear()}-${String(maxFriday.getMonth() + 1).padStart(2, '0')}`;
	}

	const maxDate = getMaxDate();
	const maxMonth = getMaxMonth();

	// 컬럼 설정 모달 핸들러
	function handleShowAllColumns() {
		tempSettings = {
			showGradeInfoColumn: true,
			showPlannerColumn: true,
			showBankColumn: true,
			showAccountColumn: true,
			showTaxColumn: true,
			showNetColumn: true,
			showCumulativeColumn: true, // ⭐ 누적총액 컬럼
			// ⭐ 설계사 전용 고정 컬럼
			...(isPlannerMode && {
				showInsuranceColumn: true,
				showRegistrationDateColumn: true,
				showDeadlineColumn: true
			})
		};
	}

	function handleApplyColumnSettings() {
		showGradeInfoColumn = tempSettings.showGradeInfoColumn;
		showPlannerColumn = tempSettings.showPlannerColumn;
		showBankColumn = tempSettings.showBankColumn;
		showAccountColumn = tempSettings.showAccountColumn;
		showTaxColumn = tempSettings.showTaxColumn;
		showNetColumn = tempSettings.showNetColumn;
		showCumulativeColumn = tempSettings.showCumulativeColumn; // ⭐ 누적총액 컬럼
		// ⭐ 설계사 전용 고정 컬럼
		if (isPlannerMode) {
			showInsuranceColumn = tempSettings.showInsuranceColumn;
			showRegistrationDateColumn = tempSettings.showRegistrationDateColumn;
			showDeadlineColumn = tempSettings.showDeadlineColumn;
		}
		updateStore();
		showColumnSettings = false;
	}

	function handleCloseColumnSettings() {
		showColumnSettings = false;
	}
</script>

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
						value="date"
						onchange={handleFilterTypeChange}
						class="cursor-pointer"
					/>
					<span class="font-medium">주간</span>
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

			<!-- 주간 선택 -->
			{#if filterType === 'date'}
				<input
				type="date"
				value={selectedDate}
				max={enablePeriodLimit ? maxDate : undefined}
				onchange={handleDateChange}
				class="input-mobile"
			/>
			{/if}

			<!-- 기간 선택 (주별) -->
			{#if filterType === 'period'}
				<div class="flex items-center gap-1 text-xs">
					<input
						type="date"
						bind:value={startWeekDate}
						max={enablePeriodLimit ? maxDate : undefined}
						onchange={handlePeriodChange}
						class="input-mobile-period"
					/>
					<span class="text-gray-500">~</span>
					<input
						type="date"
						bind:value={endWeekDate}
						max={enablePeriodLimit ? maxDate : undefined}
						onchange={handlePeriodChange}
						class="input-mobile-period"
					/>
				</div>
			{/if}
		</div>
	</div>

	<!-- 총합계 요약 -->
	{#if hasData}
		<div class="summary-container-mobile">
			<div class="grid grid-cols-2 gap-2">
				<div class="summary-card-mobile">
					<div class="summary-label-mobile">총 지급액</div>
					<div class="summary-value text-gray-800">{formatAmount(grandTotal.amount)}원</div>
				</div>
				<div class="summary-card-mobile">
					<div class="summary-label-mobile">세지원</div>
					<div class="summary-value text-red-600">{formatAmount(grandTotal.tax)}원</div>
				</div>
				<div class="summary-card-mobile">
					<div class="summary-label-mobile">실지급액</div>
					<div class="summary-value text-green-600">{formatAmount(grandTotal.net)}원</div>
				</div>
				{#if filterType === 'date'}
					<div class="summary-card-mobile">
						<div class="summary-label-mobile">지급 대상</div>
						<div class="summary-value text-gray-600">{totalPaymentTargets}명</div>
					</div>
				{/if}
			</div>
		</div>
	{/if}

	<!-- 검색 및 설정 -->
	<div class="search-section-mobile">
		<!-- 검색 -->
		<div class="mb-2 flex gap-1">
			<select bind:value={searchCategory} onchange={handleSearchCategoryChange} class="select-mobile">
				<option value="name">이름</option>
				{#if showPlannerOption}
					<option value="planner">설계자</option>
				{/if}
				<option value="grade">등급</option>
			</select>
			{#if searchCategory === 'grade'}
				<select bind:value={searchQuery} class="input-search-mobile">
					<option value="">등급 선택...</option>
					<option value="F1">F1</option>
					<option value="F2">F2</option>
					<option value="F3">F3</option>
					<option value="F4">F4</option>
					<option value="F5">F5</option>
					<option value="F6">F6</option>
					<option value="F7">F7</option>
					<option value="F8">F8</option>
				</select>
			{:else}
				<input
					type="text"
					bind:value={searchQuery}
					onkeypress={handleKeyPress}
					placeholder="검색..."
					class="input-search-mobile"
				/>
			{/if}
			<button onclick={handleSearch} class="btn-search-mobile">검색</button>
		</div>

		<!-- 설정 -->
		<div class="settings-row-mobile">
			<!-- ⭐ 설계사: 소계 표시 옵션 / 관리자: 이름순 체크박스 -->
			{#if showSubtotalOptions}
				<div class="flex items-center gap-2 text-xs">
					<label class="flex items-center gap-1 cursor-pointer">
						<input
							type="checkbox"
							bind:checked={showSubtotals}
							onchange={handleSubtotalModeChange}
							disabled={subtotalsOnly}
							class="cursor-pointer"
						/>
						<span class="text-gray-600" class:text-gray-400={subtotalsOnly}>소계포함</span>
					</label>
					<label class="flex items-center gap-1 cursor-pointer">
						<input
							type="checkbox"
							bind:checked={subtotalsOnly}
							onchange={handleSubtotalModeChange}
							class="cursor-pointer"
						/>
						<span class="text-gray-600">소계만</span>
					</label>
				</div>
			{:else}
				<label class="flex items-center gap-1 cursor-pointer">
					<input
						type="checkbox"
						bind:checked={sortByName}
						onchange={handleSortChange}
						class="cursor-pointer"
					/>
					<span class="text-xs text-gray-600">이름순</span>
				</label>
			{/if}

			<label class="flex items-center gap-1">
				<span class="text-gray-600">페이지:</span>
				<select
					bind:value={itemsPerPage}
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
				<!-- 컬럼 설정 버튼 -->
				<button
					onclick={() => {
						tempSettings = {
							showGradeInfoColumn,
							showPlannerColumn,
							showBankColumn,
							showAccountColumn,
							showTaxColumn,
							showNetColumn,
							showCumulativeColumn, // ⭐ 누적총액 컬럼
							// ⭐ 설계사 전용 고정 컬럼
							...(isPlannerMode && {
								showInsuranceColumn,
								showRegistrationDateColumn,
								showDeadlineColumn
							})
						};
						showColumnSettings = !showColumnSettings;
					}}
					class="btn-settings"
					title="컬럼 설정"
				>
					<img src="/icons/settings.svg" alt="설정" class="h-4 w-4" />
				</button>

				{#if hasData}
					<button onclick={handleExport} class="btn-gradient-green" title="Excel 다운로드">
						<img src="/icons/download.svg" alt="다운로드" class="icon-small" />
					</button>
				{/if}
			</div>
		</div>
	</div>
{:else}
	<!-- ==================== 데스크탑 버전 ==================== -->

	<!-- 필터 영역 -->
	<div class="mb-2.5 flex items-start gap-2.5">
		<div class="filter-container-desktop">
			<div class="flex items-center gap-1.5 text-[13px]">
				<!-- 주간 필터 -->
				<label class="radio-label-desktop">
					<input
						type="radio"
						bind:group={filterType}
						value="date"
						onchange={handleFilterTypeChange}
						class="cursor-pointer"
					/>
					<span>주간</span>
				</label>
				{#if filterType === 'date'}
					<input
						type="date"
						value={selectedDate}
						max={enablePeriodLimit ? maxDate : undefined}
						onchange={handleDateChange}
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
						type="date"
						bind:value={startWeekDate}
						max={enablePeriodLimit ? maxDate : undefined}
						onchange={handlePeriodChange}
						class="input-desktop"
					/>
					<span class="mx-0.5 text-[13px] leading-7 text-gray-600">~</span>
					<input
						type="date"
						bind:value={endWeekDate}
						max={enablePeriodLimit ? maxDate : undefined}
						onchange={handlePeriodChange}
						class="input-desktop"
					/>
				{/if}
			</div>
		</div>
	</div>

	<!-- 총합계 요약 섹션 -->
	{#if hasData}
		<div class="summary-container-desktop">
			<div class="grid grid-cols-[repeat(auto-fit,minmax(100px,1fr))] gap-2.5">
				<div class="summary-card-desktop">
					<div class="summary-label-desktop">총 지급액</div>
					<div class="summary-value-desktop text-gray-800">{formatAmount(grandTotal.amount)}원</div>
				</div>
				<div class="summary-card-desktop">
					<div class="summary-label-desktop">총 세지원</div>
					<div class="summary-value-desktop text-red-600">{formatAmount(grandTotal.tax)}원</div>
				</div>
				<div class="summary-card-desktop">
					<div class="summary-label-desktop">총 실지급액</div>
					<div class="summary-value-desktop text-green-600">{formatAmount(grandTotal.net)}원</div>
				</div>
				{#if filterType === 'date'}
					<div class="summary-card-desktop">
						<div class="summary-label-desktop">지급 대상</div>
						<div class="summary-value-desktop text-gray-600">{totalPaymentTargets}명</div>
					</div>
				{/if}
			</div>
		</div>
	{/if}

	<!-- 검색 및 페이지 설정 -->
	<div class="search-container-desktop">
		<!-- 검색 부분 -->
		<div class="flex items-center gap-2">
			<!-- 검색 카테고리 -->
			<select bind:value={searchCategory} onchange={handleSearchCategoryChange} class="select-desktop">
				<option value="name">이름</option>
				{#if showPlannerOption}
					<option value="planner">설계자</option>
				{/if}
				<option value="grade">등급</option>
			</select>

			<!-- 검색 입력 -->
			{#if searchCategory === 'grade'}
				<select bind:value={searchQuery} class="input-search-desktop">
					<option value="">등급 선택...</option>
					<option value="F1">F1</option>
					<option value="F2">F2</option>
					<option value="F3">F3</option>
					<option value="F4">F4</option>
					<option value="F5">F5</option>
					<option value="F6">F6</option>
					<option value="F7">F7</option>
					<option value="F8">F8</option>
				</select>
			{:else}
				<input
					type="text"
					bind:value={searchQuery}
					onkeypress={handleKeyPress}
					placeholder={searchCategory === 'name' ? '이름으로 검색...' : '설계자 이름으로 검색...'}
					class="input-search-desktop"
				/>
			{/if}

			<!-- 검색 버튼 -->
			<button onclick={handleSearch} class="btn-gradient-blue">
				<img src="/icons/search.svg" alt="검색" class="icon-small" />
			</button>
		</div>

		<!-- 우측 버튼 그룹 -->
		<div class="flex items-center gap-2">
			<!-- ⭐ 설계사: 소계 표시 옵션 / 관리자: 이름순 체크박스 -->
			{#if showSubtotalOptions}
				<div class="flex items-center gap-2">
					<label class="label-desktop cursor-pointer" class:text-gray-400={subtotalsOnly}>
						<input
							type="checkbox"
							bind:checked={showSubtotals}
							onchange={handleSubtotalModeChange}
							disabled={subtotalsOnly}
							class="mr-1 cursor-pointer"
						/>
						소계포함
					</label>
					<label class="label-desktop cursor-pointer">
						<input
							type="checkbox"
							bind:checked={subtotalsOnly}
							onchange={handleSubtotalModeChange}
							class="mr-1 cursor-pointer"
						/>
						소계만
					</label>
				</div>
			{:else}
				<label class="label-desktop cursor-pointer">
					<input
						type="checkbox"
						bind:checked={sortByName}
						onchange={handleSortChange}
						class="mr-1 cursor-pointer"
					/>
					이름순
				</label>
			{/if}

			<div class="divider-vertical"></div>

			<!-- 페이지당 항목 수 -->
		<label class="label-desktop">
			페이지당
			<select
				bind:value={itemsPerPage}
				onchange={handleItemsPerPageChange}
				class="select-desktop-with-focus"
			>
				<option value={10}>10개</option>
				<option value={20}>20개</option>
				<option value={50}>50개</option>
				<option value={100}>100개</option>
			</select>
		</label>

		<!-- 컬럼 설정 버튼 -->
		<button
			onclick={() => {
				tempSettings = {
					showGradeInfoColumn,
					showPlannerColumn,
					showBankColumn,
					showAccountColumn,
					showTaxColumn,
					showNetColumn,
					showCumulativeColumn, // ⭐ 누적총액 컬럼
					// ⭐ 설계사 전용 고정 컬럼
					...(isPlannerMode && {
						showInsuranceColumn,
						showRegistrationDateColumn,
						showDeadlineColumn
					})
				};
				showColumnSettings = !showColumnSettings;
			}}
			class="btn-settings"
			title="컬럼 설정"
		>
			<img src="/icons/settings.svg" alt="Settings" class="h-4 w-4" />
		</button>

			<!-- Excel Export 버튼 -->
			{#if hasData}
				<button onclick={handleExport} title="Excel 다운로드" class="btn-gradient-green">
					<img src="/icons/download.svg" alt="다운로드" class="icon-small" />
				</button>
			{/if}
		</div>
	</div>
{/if}

<!-- 컬럼 설정 모달 -->
<PaymentColumnSettingsModal
	isOpen={showColumnSettings}
	bind:tempSettings
	onClose={handleCloseColumnSettings}
	onShowAll={handleShowAllColumns}
	onApply={handleApplyColumnSettings}
	{showPlannerOption}
	{isPlannerMode}
/>

<!-- 기간 제한 알림 모달 -->
<WindowsModal
	isOpen={showPeriodLimitAlert}
	title="알림"
	size="xs"
	onClose={() => showPeriodLimitAlert = false}
	showFooter={true}
>
	<div class="text-center py-2">
		<p class="text-sm text-gray-700">현재주 포함 4주까지만 조회할 수 있어요.</p>
	</div>
	<svelte:fragment slot="footer">
		<button
			onclick={() => showPeriodLimitAlert = false}
			class="px-4 py-1.5 bg-blue-500 text-white text-sm rounded hover:bg-blue-600 transition-colors"
		>
			확인
		</button>
	</svelte:fragment>
</WindowsModal>

<style>
	@reference "$lib/../app.css";

	/* ==================== 공통 ==================== */
	.icon-small {
		@apply h-4 w-4 brightness-0 invert;
	}

	/* ==================== 모바일 ==================== */
	.filter-box {
		@apply rounded border border-gray-300 bg-white p-2;
	}

	.radio-label-mobile {
		@apply flex cursor-pointer items-center gap-1 text-xs;
	}

	.input-mobile {
		@apply w-full rounded border border-gray-300 px-2 py-1.5 text-xs;
	}

	.input-mobile-period {
		@apply min-w-[126px] flex-1 rounded border border-gray-300 px-2 py-1.5 text-xs;
	}

	.summary-container-mobile {
		@apply mb-2 rounded border border-gray-200 bg-gray-50 p-2;
	}

	.summary-card-mobile {
		@apply flex flex-col items-center rounded bg-white p-2;
	}

	.summary-label-mobile {
		@apply mb-0.5 text-xs font-semibold text-gray-600;
	}

	.summary-value {
		@apply text-sm font-bold;
	}

	.search-section-mobile {
		@apply mb-2 rounded bg-gray-50 p-2;
	}

	.select-mobile {
		@apply min-w-[70px] rounded border border-gray-300 bg-white px-2 py-1.5 text-xs;
	}

	.input-search-mobile {
		@apply flex-1 rounded border border-gray-300 px-2 py-1.5 text-xs;
	}

	.btn-search-mobile {
		@apply rounded bg-blue-500 px-3 py-1.5 text-xs font-medium text-white active:bg-blue-700;
	}

	.settings-row-mobile {
		@apply flex items-center justify-between gap-2 text-xs;
	}

	.select-page-mobile {
		@apply min-w-[60px] rounded border border-gray-300 bg-white px-2 py-1 text-xs;
	}

	.checkbox-label-mobile {
		@apply flex cursor-pointer items-center gap-1;
	}

	.btn-icon-mobile {
		@apply ml-1 rounded bg-green-500 p-1.5 text-white active:bg-green-700;
	}

	/* ==================== 데스크탑 ==================== */
	.filter-container-desktop {
		@apply min-w-[280px] flex-1 rounded border border-gray-300 bg-white px-2.5 py-2;
	}

	.radio-label-desktop {
		@apply flex cursor-pointer items-center gap-0.5 whitespace-nowrap;
	}

	.input-desktop {
		@apply h-7 min-w-[136px] rounded border border-gray-300 px-1.5 py-1 text-[13px] leading-[1.4];
	}

	.divider-vertical {
		@apply mx-1.5 h-5 w-px bg-gray-300;
	}

	.summary-container-desktop {
		@apply my-2 rounded border border-gray-200 bg-gray-50 px-2.5 py-2;
	}

	.summary-card-desktop {
		@apply flex flex-col text-center;
	}

	.summary-label-desktop {
		@apply mb-0.5 text-xs font-semibold text-gray-600;
	}

	.summary-value-desktop {
		@apply whitespace-nowrap text-base font-bold;
	}

	.search-container-desktop {
		@apply my-3 flex flex-wrap items-center justify-between gap-2.5 rounded-md bg-gradient-to-b from-gray-50 to-white p-3 shadow-sm;
	}

	.select-desktop {
		@apply flex h-7 min-w-[90px] cursor-pointer items-center rounded border-2 border-gray-200 bg-white px-1.5 py-1 text-[13px] leading-[1.4] outline-none transition-all hover:border-blue-500 hover:shadow-[0_0_0_2px_rgba(0,123,255,0.1)];
	}

	.input-search-desktop {
		@apply h-7 min-w-[200px] flex-1 rounded border-2 border-gray-200 bg-white px-1.5 py-1 text-[13px] leading-[1.4] outline-none transition-all hover:border-gray-400 focus:border-blue-500 focus:shadow-[0_0_0_2px_rgba(0,123,255,0.15)];
	}

	.btn-gradient-blue {
		@apply flex h-7 flex-shrink-0 cursor-pointer items-center justify-center rounded border-none bg-gradient-to-br from-blue-500 to-blue-700 px-2 text-white shadow-[0_1px_4px_rgba(0,123,255,0.3)] transition-all hover:-translate-y-px hover:from-blue-700 hover:to-blue-900 hover:shadow-[0_2px_8px_rgba(0,123,255,0.4)] active:translate-y-0 active:shadow-[0_1px_3px_rgba(0,123,255,0.3)];
	}

	.label-desktop {
		@apply flex flex-shrink-0 items-center gap-1.5 whitespace-nowrap text-[13px] font-medium text-gray-700;
	}

	.select-desktop-with-focus {
		@apply flex h-7 min-w-[78px] cursor-pointer items-center rounded border-2 border-gray-200 bg-white px-1.5 py-1 pr-5 text-[13px] font-medium leading-[1.4] outline-none transition-all hover:border-blue-500 hover:shadow-[0_0_0_2px_rgba(0,123,255,0.1)] focus:border-blue-500 focus:shadow-[0_0_0_2px_rgba(0,123,255,0.15)];
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

	.btn-settings {
		@apply flex h-7 flex-shrink-0 cursor-pointer items-center justify-center rounded border-2 border-gray-300 bg-white px-2 transition-all hover:border-blue-500 hover:bg-blue-50 active:bg-blue-100;
	}
</style>
