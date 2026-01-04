<script>
	import { onMount } from 'svelte';
	import { plannerPaymentFilterState } from '$lib/stores/dashboardStore';
	import { plannerPaymentService } from '$lib/services/plannerPaymentService';
	import PaymentHeader from '$lib/components/shared/payment/PaymentHeader.svelte';
	import PlannerPaymentTable from '$lib/components/planner/PlannerPaymentTable.svelte';

	// 지급명부 상태 변수
	let paymentList = [];
	let filteredPaymentList = [];
	let weeklyColumns = [];
	let isLoading = false;
	let error = '';
	let currentPage = 1;
	let totalPages = 1;
	let totalPaymentTargets = 0;
	let apiGrandTotal = null;
	let weeklyTotals = {};
	let monthlyTotals = {};

	// ⭐ 소계 표시 모드 (설계사 전용)
	let subtotalDisplayMode = $plannerPaymentFilterState.subtotalDisplayMode || 'withSubtotals';

	// ⭐ 현재 주의 금요일 계산
	function getCurrentFriday() {
		const now = new Date();
		const dayOfWeek = now.getDay();
		const daysToFriday = dayOfWeek <= 5 ? (5 - dayOfWeek) : (5 - dayOfWeek + 7);
		const friday = new Date(now);
		friday.setDate(now.getDate() + daysToFriday);
		friday.setHours(0, 0, 0, 0);
		return friday;
	}

	// ⭐ 최대 선택 가능 금요일 (현재주 포함 4주)
	function getMaxFriday() {
		const currentFriday = getCurrentFriday();
		const maxFriday = new Date(currentFriday);
		maxFriday.setDate(currentFriday.getDate() + 21); // 이번주 포함 4주
		return maxFriday;
	}

	// ⭐ Store 직접 사용 (reactive statement 제거하여 무한 루프 방지)

	// 데이터 로드
	async function loadPaymentData(page = 1, overrideDate = null) {
		isLoading = true;
		error = '';
		currentPage = page;

		try {
			// ⭐ overrideDate가 있으면 그것을 사용, 없으면 store 값 사용
			const filterState = overrideDate ?
				{ ...$plannerPaymentFilterState, selectedDate: overrideDate } :
				$plannerPaymentFilterState;

			const result = await plannerPaymentService.loadPaymentData({
				filterType: filterState.filterType,
				selectedDate: filterState.selectedDate,
				selectedYear: filterState.selectedYear,
				selectedMonth: filterState.selectedMonth,
				startYear: filterState.startYear,
				startMonth: filterState.startMonth,
				endYear: filterState.endYear,
				endMonth: filterState.endMonth,
				// ⭐ 주별 기간 선택용
				startWeekDate: filterState.startWeekDate,
				endWeekDate: filterState.endWeekDate,
				page: 1,  // ⭐ 항상 1페이지 (프론트엔드 페이지네이션)
				limit: 10000,  // ⭐ 전체 데이터 조회
				searchQuery: filterState.searchQuery,
				searchCategory: filterState.searchCategory,
				periodType: 'weekly',  // ⭐ 항상 주별로 표시
				fetchAll: true  // ⭐ 전체 데이터 조회 (그룹핑용)
			});

			paymentList = result.paymentList;
			filteredPaymentList = result.paymentList;
			weeklyColumns = result.weeklyColumns;
			totalPages = result.totalPages;
			totalPaymentTargets = result.totalPaymentTargets;
			apiGrandTotal = result.apiGrandTotal;
			weeklyTotals = result.weeklyTotals || {};
			monthlyTotals = result.monthlyTotals || {};
		} catch (err) {
			console.error('Error loading payment data:', err);
			error = err.message;
		} finally {
			isLoading = false;
		}
	}

	// 페이지 변경
	function goToPage(page) {
		if (page >= 1 && page <= totalPages) {
			loadPaymentData(page);
		}
	}

	// 검색 핸들러
	function handleSearch() {
		loadPaymentData(1);
	}

	// 페이지당 항목 수 변경
	function handleItemsPerPageChange() {
		loadPaymentData(1);
	}

	// 필터 타입 변경
	function handleFilterTypeChange() {
		loadPaymentData(1);
	}

	// 기간 변경
	function handlePeriodChange() {
		if ($plannerPaymentFilterState.filterType === 'period') {
			loadPaymentData(1);
		}
	}

	// ⭐ 소계 표시 모드 변경
	function handleSubtotalModeChange(mode) {
		subtotalDisplayMode = mode;
		plannerPaymentFilterState.update(state => ({ ...state, subtotalDisplayMode: mode }));
	}

	// grandTotal을 reactive 변수로 계산
	$: grandTotal = apiGrandTotal ? {
		amount: apiGrandTotal.totalAmount || 0,
		tax: apiGrandTotal.totalTax || 0,
		net: apiGrandTotal.totalNet || 0
	} : { amount: 0, tax: 0, net: 0 };

	// ⭐ 설계사 전용 엑셀 다운로드 (그룹핑 + 소계 포함)
	async function handleExcelExport() {
		try {
			const { PlannerPaymentExcelExporter } = await import('$lib/utils/plannerPaymentExcelExporter.js');

			const filterState = $plannerPaymentFilterState;

			const exporter = new PlannerPaymentExcelExporter({
				filterType: filterState.filterType,
				selectedDate: filterState.selectedDate,
				startYear: filterState.startYear,
				startMonth: filterState.startMonth,
				endYear: filterState.endYear,
				endMonth: filterState.endMonth,
				periodType: filterState.periodType,
				showGradeInfoColumn: filterState.showGradeInfoColumn,
				showTaxColumn: filterState.showTaxColumn,
				showNetColumn: filterState.showNetColumn,
				searchQuery: filterState.searchQuery,
				searchCategory: filterState.searchCategory,
				plannerName: ''
			});

			await exporter.export(filteredPaymentList, weeklyColumns, grandTotal);
		} catch (err) {
			console.error('엑셀 내보내기 오류:', err);
			alert('엑셀 파일 생성 중 오류가 발생했습니다.');
		}
	}

	onMount(async () => {
		// 지급명부 데이터 로드
		loadPaymentData();
	});
</script>

<!-- 카드 4: 지원비 지급명부 -->
<div class="rounded-lg border-2 border-purple-200 bg-white p-4 shadow-lg">
	<h2 class="mb-3 text-lg font-bold text-gray-900">지원비 지급명부</h2>

	<PaymentHeader
		{isLoading}
		isProcessingPast={false}
		{grandTotal}
		{totalPaymentTargets}
		hasData={filteredPaymentList.length > 0}
		filterStore={plannerPaymentFilterState}
		onFilterChange={handleFilterTypeChange}
		onPeriodChange={handlePeriodChange}
		onDateChange={(newDate) => {
			// ⭐ store 업데이트 없이 직접 날짜 전달
			loadPaymentData(1, newDate);
		}}
		onSearch={handleSearch}
		onItemsPerPageChange={handleItemsPerPageChange}
		onExport={handleExcelExport}
		hidePastProcessButton={true}
		hideExportButton={false}
		onProcessPast={() => {}}
		showPlannerOption={false}
		showSubtotalOptions={true}
		{subtotalDisplayMode}
		onSubtotalModeChange={handleSubtotalModeChange}
	/>

	<PlannerPaymentTable
		paymentList={filteredPaymentList}
		{weeklyColumns}
		{isLoading}
		{error}
		{grandTotal}
		{weeklyTotals}
		{monthlyTotals}
		{subtotalDisplayMode}
	/>
</div>
