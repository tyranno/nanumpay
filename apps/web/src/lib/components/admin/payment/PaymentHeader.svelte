<script>
	import { onMount } from 'svelte';
	import { browser } from '$app/environment';
	import { paymentPageFilterState } from '$lib/stores/dashboardStore';

	// Props
	export let isLoading = false;
	export let isProcessingPast = false;
	export let grandTotal = { amount: 0, tax: 0, net: 0 };
	export let totalPaymentTargets = 0;
	export let hasData = false;

	// Event handler props (Svelte 5 style)
	export let onFilterChange = () => {};
	export let onPeriodChange = () => {};
	export let onDateChange = () => {};
	export let onSearch = () => {};
	export let onItemsPerPageChange = () => {};
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
		window.addEventListener('resize', checkScreenSize);
		return () => {
			window.removeEventListener('resize', checkScreenSize);
		};
	});

	// Store에서 값 가져오기
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
	let showTaxColumn = $paymentPageFilterState.showTaxColumn;
	let showNetColumn = $paymentPageFilterState.showNetColumn;
	let searchQuery = $paymentPageFilterState.searchQuery;
	let searchCategory = $paymentPageFilterState.searchCategory;

	// Store 업데이트
	$: (filterType,
		selectedDate,
		selectedYear,
		selectedMonth,
		periodType,
		startYear,
		startMonth,
		endYear,
		endMonth,
		itemsPerPage,
		showTaxColumn,
		showNetColumn,
		searchQuery,
		searchCategory,
		updateStore());

	function updateStore() {
		if (browser) {
			paymentPageFilterState.set({
				filterType,
				selectedDate,
				selectedYear,
				selectedMonth,
				periodType,
				startYear,
				startMonth,
				endYear,
				endMonth,
				itemsPerPage,
				showTaxColumn,
				showNetColumn,
				searchQuery,
				searchCategory
			});
		}
	}

	// 이벤트 핸들러
	function handleFilterTypeChange() {
		onFilterChange();
	}

	function handlePeriodChange() {
		onPeriodChange();
	}

	function handleSearch() {
		onSearch();
	}

	function handleKeyPress(event) {
		if (event.key === 'Enter') {
			handleSearch();
		}
	}

	function handleItemsPerPageChange() {
		onItemsPerPageChange();
	}

	function handleDateChange() {
		onDateChange();
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
					bind:value={selectedDate}
					onchange={handleDateChange}
					class="input-mobile"
				/>
			{/if}

			<!-- 기간 선택 -->
			{#if filterType === 'period'}
				<div class="flex flex-col gap-2">
					<!-- 시작 ~ 종료 -->
					<div class="flex items-center gap-1 text-xs">
						<input
							type="month"
							value="{startYear}-{String(startMonth).padStart(2, '0')}"
							onchange={(e) => {
								const [year, month] = e.target.value.split('-');
								startYear = parseInt(year);
								startMonth = parseInt(month);
								handlePeriodChange();
							}}
							class="input-mobile-period"
						/>
						<span class="text-gray-500">~</span>
						<input
							type="month"
							value="{endYear}-{String(endMonth).padStart(2, '0')}"
							onchange={(e) => {
								const [year, month] = e.target.value.split('-');
								endYear = parseInt(year);
								endMonth = parseInt(month);
								handlePeriodChange();
							}}
							class="input-mobile-period"
						/>
					</div>
					<!-- 표시 -->
					<div class="period-type-selector">
						<span class="font-medium text-gray-600">표시:</span>
						<label class="radio-label-mobile">
							<input
								type="radio"
								bind:group={periodType}
								value="weekly"
								onchange={handlePeriodChange}
								class="cursor-pointer"
							/>
							<span>주간</span>
						</label>
						<label class="radio-label-mobile">
							<input
								type="radio"
								bind:group={periodType}
								value="monthly"
								onchange={handlePeriodChange}
								class="cursor-pointer"
							/>
							<span>월간</span>
						</label>
					</div>
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
					<div class="summary-label-mobile">원천징수</div>
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
			<select bind:value={searchCategory} class="select-mobile">
				<option value="name">이름</option>
				<option value="planner">설계자</option>
			</select>
			<input
				type="text"
				bind:value={searchQuery}
				onkeypress={handleKeyPress}
				placeholder="검색..."
				class="input-search-mobile"
			/>
			<button onclick={handleSearch} class="btn-search-mobile">검색</button>
		</div>

		<!-- 설정 -->
		<div class="settings-row-mobile">
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
				<label class="checkbox-label-mobile">
					<input type="checkbox" bind:checked={showTaxColumn} class="h-3 w-3" />
					<span>원천</span>
				</label>
				<label class="checkbox-label-mobile">
					<input type="checkbox" bind:checked={showNetColumn} class="h-3 w-3" />
					<span>실지급</span>
				</label>
				{#if hasData}
					<button onclick={handleExport} class="btn-icon-mobile" title="Excel 다운로드">
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
						bind:value={selectedDate}
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

					<!-- 구분선 -->
					<div class="divider-vertical"></div>

					<span class="whitespace-nowrap text-[13px] font-bold leading-7">표시:</span>
					<select bind:value={periodType} onchange={handlePeriodChange} class="select-period-type">
						<option value="weekly">주간</option>
						<option value="monthly">월간</option>
					</select>
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
					<div class="summary-label-desktop">총 원천징수</div>
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
		<!-- 검색 카테고리 -->
		<select bind:value={searchCategory} class="select-desktop">
			<option value="name">이름</option>
			<option value="planner">설계자</option>
		</select>

		<!-- 검색 입력 -->
		<input
			type="text"
			bind:value={searchQuery}
			onkeypress={handleKeyPress}
			placeholder={searchCategory === 'name' ? '이름으로 검색...' : '설계자 이름으로 검색...'}
			class="input-search-desktop"
		/>

		<!-- 검색 버튼 -->
		<button onclick={handleSearch} class="btn-gradient-blue">
			<img src="/icons/search.svg" alt="검색" class="icon-small" />
		</button>

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

		<!-- 컬럼 표시 토글 -->
		<div class="toggle-container">
			<label class="toggle-label">
				<input type="checkbox" bind:checked={showTaxColumn} class="checkbox-desktop" />
				<span>원천징수</span>
			</label>
			<label class="toggle-label">
				<input type="checkbox" bind:checked={showNetColumn} class="checkbox-desktop" />
				<span>실지급액</span>
			</label>
		</div>

		<!-- Excel Export 버튼 -->
		{#if hasData}
			<button onclick={handleExport} title="Excel 다운로드" class="btn-gradient-green">
				<img src="/icons/download.svg" alt="다운로드" class="icon-small" />
			</button>
		{/if}
	</div>
{/if}

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
		@apply flex-1 rounded border border-gray-300 px-2 py-1.5 text-xs;
	}

	.period-type-selector {
		@apply mt-2 flex items-center gap-2 border-t border-gray-200 pt-2 text-xs;
	}

	.summary-container-mobile {
		@apply mb-2 rounded border border-gray-200 bg-gray-50 p-2;
	}

	.summary-card-mobile {
		@apply flex flex-col items-center rounded bg-white p-2;
	}

	.summary-label-mobile {
		@apply mb-1 text-xs text-gray-500;
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
		@apply h-7 rounded border border-gray-300 px-1.5 py-1 text-[13px] leading-[1.4];
	}

	.input-year {
		@apply h-7 w-[60px] rounded border border-gray-300 px-1.5 py-1 text-[13px] leading-[1.4];
	}

	.select-month {
		@apply h-7 w-[60px] rounded border border-gray-300 px-1.5 py-1 pr-5 text-[13px] leading-[1.4];
	}

	.select-period-type {
		@apply h-7 w-[70px] rounded border border-gray-300 px-1.5 py-1 pr-5 text-[13px] leading-[1.4];
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
		@apply mb-0.5 text-[10px] font-medium text-gray-500;
	}

	.summary-value-desktop {
		@apply whitespace-nowrap text-[13px] font-bold;
	}

	.search-container-desktop {
		@apply my-3 flex flex-wrap items-center gap-2.5 rounded-md bg-gradient-to-b from-gray-50 to-white p-3 shadow-sm;
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
</style>
