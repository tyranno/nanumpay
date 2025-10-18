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
	$: filterType, selectedDate, selectedYear, selectedMonth, periodType,
	   startYear, startMonth, endYear, endMonth, itemsPerPage,
	   showTaxColumn, showNetColumn, searchQuery, searchCategory, updateStore();

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
		<div class="border border-gray-300 rounded bg-white p-2">
			<!-- 필터 타입 선택 -->
			<div class="flex items-center gap-2 mb-2">
				<label class="flex items-center gap-1 text-xs cursor-pointer">
					<input
						type="radio"
						bind:group={filterType}
						value="date"
						onchange={handleFilterTypeChange}
						class="cursor-pointer"
					/>
					<span class="font-medium">주간</span>
				</label>
				<label class="flex items-center gap-1 text-xs cursor-pointer">
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
					class="w-full px-2 py-1.5 border border-gray-300 rounded text-xs"
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
							class="flex-1 px-2 py-1.5 border border-gray-300 rounded text-xs"
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
							class="flex-1 px-2 py-1.5 border border-gray-300 rounded text-xs"
						/>
					</div>
					<!-- 표시 -->
					<div class="flex items-center gap-2 text-xs mt-2 pt-2 border-t border-gray-200">
						<span class="text-gray-600 font-medium">표시:</span>
						<label class="flex items-center gap-1 cursor-pointer">
							<input
								type="radio"
								bind:group={periodType}
								value="weekly"
								onchange={handlePeriodChange}
								class="cursor-pointer"
							/>
							<span>주간</span>
						</label>
						<label class="flex items-center gap-1 cursor-pointer">
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
		<div class="mb-2 p-2 bg-gray-50 rounded border border-gray-200">
			<div class="grid grid-cols-2 gap-2">
				<div class="flex flex-col items-center p-2 bg-white rounded">
					<div class="text-xs text-gray-500 mb-1">총 지급액</div>
					<div class="text-sm font-bold text-gray-800">{formatAmount(grandTotal.amount)}원</div>
				</div>
				<div class="flex flex-col items-center p-2 bg-white rounded">
					<div class="text-xs text-gray-500 mb-1">원천징수</div>
					<div class="text-sm font-bold text-red-600">{formatAmount(grandTotal.tax)}원</div>
				</div>
				<div class="flex flex-col items-center p-2 bg-white rounded">
					<div class="text-xs text-gray-500 mb-1">실지급액</div>
					<div class="text-sm font-bold text-green-600">{formatAmount(grandTotal.net)}원</div>
				</div>
				<div class="flex flex-col items-center p-2 bg-white rounded">
					<div class="text-xs text-gray-500 mb-1">지급 대상</div>
					<div class="text-sm font-bold text-gray-600">{totalPaymentTargets}명</div>
				</div>
			</div>
		</div>
	{/if}

	<!-- 검색 및 설정 -->
	<div class="mb-2 p-2 bg-gray-50 rounded">
		<!-- 검색 -->
		<div class="flex gap-1 mb-2">
			<select
				bind:value={searchCategory}
				class="px-2 py-1.5 border border-gray-300 rounded text-xs bg-white min-w-[70px]"
			>
				<option value="name">이름</option>
				<option value="planner">설계자</option>
			</select>
			<input
				type="text"
				bind:value={searchQuery}
				onkeypress={handleKeyPress}
				placeholder="검색..."
				class="flex-1 px-2 py-1.5 border border-gray-300 rounded text-xs"
			/>
			<button
				onclick={handleSearch}
				class="px-3 py-1.5 bg-blue-500 text-white rounded text-xs font-medium active:bg-blue-700"
			>
				검색
			</button>
		</div>

		<!-- 설정 -->
		<div class="flex items-center justify-between gap-2 text-xs">
			<label class="flex items-center gap-1">
				<span class="text-gray-600">페이지:</span>
				<select
					bind:value={itemsPerPage}
					onchange={handleItemsPerPageChange}
					class="px-2 py-1 border border-gray-300 rounded text-xs bg-white min-w-[60px]"
				>
					<option value={10}>10개</option>
					<option value={20}>20개</option>
					<option value={50}>50개</option>
					<option value={100}>100개</option>
				</select>
			</label>

			<div class="flex items-center gap-2">
				<label class="flex items-center gap-1 cursor-pointer">
					<input type="checkbox" bind:checked={showTaxColumn} class="w-3 h-3" />
					<span>원천</span>
				</label>
				<label class="flex items-center gap-1 cursor-pointer">
					<input type="checkbox" bind:checked={showNetColumn} class="w-3 h-3" />
					<span>실지급</span>
				</label>
				{#if hasData}
					<button
						onclick={handleExport}
						class="ml-1 p-1.5 bg-green-500 text-white rounded active:bg-green-700"
						title="Excel 다운로드"
					>
						<img src="/icons/download.svg" alt="다운로드" class="brightness-0 invert w-4 h-4" />
					</button>
				{/if}
			</div>
		</div>
	</div>

{:else}
	<!-- ==================== 데스크탑 버전 ==================== -->

	<!-- 필터 영역 -->
	<div class="flex gap-2.5 mb-2.5 items-start">
		<div class="flex-1 border border-gray-300 rounded bg-white py-2 px-2.5 min-w-[280px]">
			<div class="flex items-center gap-1.5 text-[13px]">
				<!-- 주간 필터 -->
				<label class="flex items-center gap-0.5 whitespace-nowrap cursor-pointer">
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
						class="px-1.5 py-1 border border-gray-300 rounded text-[13px] h-7 leading-[1.4]"
					/>
				{/if}

				<!-- 구분선 -->
				<div class="w-px h-5 bg-gray-300 mx-1.5"></div>

				<!-- 기간 필터 -->
				<label class="flex items-center gap-0.5 whitespace-nowrap cursor-pointer">
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
						class="w-[60px] px-1.5 py-1 border border-gray-300 rounded text-[13px] h-7 leading-[1.4]"
						min="2020"
						max="2030"
					/>
					<span class="text-[13px] whitespace-nowrap leading-7">년</span>
					<select
						bind:value={startMonth}
						onchange={handlePeriodChange}
						class="w-[60px] px-1.5 py-1 pr-5 border border-gray-300 rounded text-[13px] h-7 leading-[1.4]"
					>
						{#each Array(12) as _, i}
							<option value={i + 1}>{i + 1}월</option>
						{/each}
					</select>
					<span class="mx-0.5 text-gray-600 text-[13px] leading-7">~</span>
					<input
						type="number"
						bind:value={endYear}
						onchange={handlePeriodChange}
						class="w-[60px] px-1.5 py-1 border border-gray-300 rounded text-[13px] h-7 leading-[1.4]"
						min="2020"
						max="2030"
					/>
					<span class="text-[13px] whitespace-nowrap leading-7">년</span>
					<select
						bind:value={endMonth}
						onchange={handlePeriodChange}
						class="w-[60px] px-1.5 py-1 pr-5 border border-gray-300 rounded text-[13px] h-7 leading-[1.4]"
					>
						{#each Array(12) as _, i}
							<option value={i + 1}>{i + 1}월</option>
						{/each}
					</select>

					<!-- 구분선 -->
					<div class="w-px h-5 bg-gray-300 mx-1.5"></div>

					<span class="font-bold text-[13px] whitespace-nowrap leading-7">표시:</span>
					<select
						bind:value={periodType}
						onchange={handlePeriodChange}
						class="w-[70px] px-1.5 py-1 pr-5 border border-gray-300 rounded text-[13px] h-7 leading-[1.4]"
					>
						<option value="weekly">주간</option>
						<option value="monthly">월간</option>
					</select>
				{/if}
			</div>
		</div>
	</div>

	<!-- 총합계 요약 섹션 -->
	{#if hasData}
		<div class="my-2 py-2 px-2.5 bg-gray-50 rounded border border-gray-200">
			<div class="grid grid-cols-[repeat(auto-fit,minmax(100px,1fr))] gap-2.5">
				<div class="flex flex-col text-center">
					<div class="text-[10px] text-gray-500 mb-0.5 font-medium">총 지급액</div>
					<div class="text-[13px] font-bold text-gray-800 whitespace-nowrap">{formatAmount(grandTotal.amount)}원</div>
				</div>
				<div class="flex flex-col text-center">
					<div class="text-[10px] text-gray-500 mb-0.5 font-medium">총 원천징수</div>
					<div class="text-[13px] font-bold text-red-600 whitespace-nowrap">{formatAmount(grandTotal.tax)}원</div>
				</div>
				<div class="flex flex-col text-center">
					<div class="text-[10px] text-gray-500 mb-0.5 font-medium">총 실지급액</div>
					<div class="text-[13px] font-bold text-green-600 whitespace-nowrap">{formatAmount(grandTotal.net)}원</div>
				</div>
				<div class="flex flex-col text-center">
					<div class="text-[10px] text-gray-500 mb-0.5 font-medium">지급 대상</div>
					<div class="text-[13px] font-bold text-gray-600 whitespace-nowrap">{totalPaymentTargets}명</div>
				</div>
			</div>
		</div>
	{/if}

	<!-- 검색 및 페이지 설정 -->
	<div class="flex items-center my-3 gap-2.5 flex-wrap bg-gradient-to-b from-gray-50 to-white p-3 rounded-md shadow-sm">
		<!-- 검색 카테고리 -->
		<select
			bind:value={searchCategory}
			class="px-1.5 py-1 border-2 border-gray-200 rounded bg-white cursor-pointer transition-all outline-none min-w-[90px] h-7 leading-[1.4] flex items-center text-[13px] hover:border-blue-500 hover:shadow-[0_0_0_2px_rgba(0,123,255,0.1)]"
		>
			<option value="name">이름</option>
			<option value="planner">설계자</option>
		</select>

		<!-- 검색 입력 -->
		<input
			type="text"
			bind:value={searchQuery}
			onkeypress={handleKeyPress}
			placeholder={searchCategory === 'name' ? '이름으로 검색...' : '설계자 이름으로 검색...'}
			class="flex-1 px-1.5 py-1 border-2 border-gray-200 rounded text-[13px] min-w-[200px] transition-all outline-none bg-white h-7 leading-[1.4] hover:border-gray-400 focus:border-blue-500 focus:shadow-[0_0_0_2px_rgba(0,123,255,0.15)]"
		/>

		<!-- 검색 버튼 -->
		<button
			onclick={handleSearch}
			class="px-2 h-7 bg-gradient-to-br from-blue-500 to-blue-700 border-none rounded text-white cursor-pointer flex items-center justify-center flex-shrink-0 transition-all shadow-[0_1px_4px_rgba(0,123,255,0.3)] hover:from-blue-700 hover:to-blue-900 hover:shadow-[0_2px_8px_rgba(0,123,255,0.4)] hover:-translate-y-px active:translate-y-0 active:shadow-[0_1px_3px_rgba(0,123,255,0.3)]"
		>
			<img src="/icons/search.svg" alt="검색" class="brightness-0 invert w-4 h-4" />
		</button>

		<!-- 페이지당 항목 수 -->
		<label class="flex items-center gap-1.5 text-[13px] font-medium whitespace-nowrap flex-shrink-0 text-gray-700">
			페이지당
			<select
				bind:value={itemsPerPage}
				onchange={handleItemsPerPageChange}
				class="px-1.5 py-1 pr-5 min-w-[78px] border-2 border-gray-200 rounded text-[13px] cursor-pointer bg-white transition-all outline-none font-medium h-7 leading-[1.4] flex items-center hover:border-blue-500 hover:shadow-[0_0_0_2px_rgba(0,123,255,0.1)] focus:border-blue-500 focus:shadow-[0_0_0_2px_rgba(0,123,255,0.15)]"
			>
				<option value={10}>10개</option>
				<option value={20}>20개</option>
				<option value={50}>50개</option>
				<option value={100}>100개</option>
			</select>
		</label>

		<!-- 컬럼 표시 토글 -->
		<div class="flex items-center gap-3 py-1 px-3 bg-white border-2 border-gray-200 rounded flex-shrink-0">
			<label class="flex items-center gap-1.5 text-[13px] font-medium cursor-pointer whitespace-nowrap text-gray-700 select-none hover:text-blue-500">
				<input
					type="checkbox"
					bind:checked={showTaxColumn}
					class="w-4 h-4 cursor-pointer accent-blue-500"
				/>
				<span>원천징수</span>
			</label>
			<label class="flex items-center gap-1.5 text-[13px] font-medium cursor-pointer whitespace-nowrap text-gray-700 select-none hover:text-blue-500">
				<input
					type="checkbox"
					bind:checked={showNetColumn}
					class="w-4 h-4 cursor-pointer accent-blue-500"
				/>
				<span>실지급액</span>
			</label>
		</div>

		<!-- Excel Export 버튼 -->
		{#if hasData}
			<button
				onclick={handleExport}
				title="Excel 다운로드"
				class="px-2 h-7 bg-gradient-to-br from-green-500 to-green-700 text-white border-none rounded cursor-pointer flex items-center justify-center transition-all flex-shrink-0 shadow-[0_1px_4px_rgba(40,167,69,0.3)] hover:from-green-700 hover:to-green-900 hover:shadow-[0_2px_8px_rgba(40,167,69,0.4)] hover:-translate-y-px active:translate-y-0 active:shadow-[0_1px_3px_rgba(40,167,69,0.3)]"
			>
				<img src="/icons/download.svg" alt="다운로드" class="brightness-0 invert w-4 h-4" />
			</button>
		{/if}
	</div>
{/if}
