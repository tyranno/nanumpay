<script>
	import { onMount } from 'svelte';
	import { paymentPageFilterState } from '$lib/stores/dashboardStore';
	import { plannerPaymentService } from '$lib/services/plannerPaymentService';
	import PaymentHeader from '$lib/components/shared/payment/PaymentHeader.svelte';
	import PaymentTable from '$lib/components/shared/payment/PaymentTable.svelte';

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

	// Store 구독
	$: filterState = $paymentPageFilterState;

	// 데이터 로드
	async function loadPaymentData(page = 1) {
		isLoading = true;
		error = '';
		currentPage = page;

		try {
			const result = await plannerPaymentService.loadPaymentData({
				filterType: filterState.filterType,
				selectedDate: filterState.selectedDate,
				selectedYear: filterState.selectedYear,
				selectedMonth: filterState.selectedMonth,
				startYear: filterState.startYear,
				startMonth: filterState.startMonth,
				endYear: filterState.endYear,
				endMonth: filterState.endMonth,
				page,
				limit: filterState.itemsPerPage,
				searchQuery: filterState.searchQuery,
				searchCategory: filterState.searchCategory,
				periodType: filterState.periodType
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
		loadPaymentData();
	}

	// 기간 변경
	function handlePeriodChange() {
		if (filterState.filterType === 'period') {
			loadPaymentData(1);
		}
	}

	// grandTotal을 reactive 변수로 계산
	$: grandTotal = apiGrandTotal ? {
		amount: apiGrandTotal.totalAmount || 0,
		tax: apiGrandTotal.totalTax || 0,
		net: apiGrandTotal.totalNet || 0
	} : { amount: 0, tax: 0, net: 0 };

	// 엑셀 다운로드
	async function handleExcelExport() {
		try {
			const { PaymentExcelExporter } = await import('$lib/utils/paymentExcelExporter.js');

			const exporter = new PaymentExcelExporter({
				filterType: filterState.filterType,
				selectedDate: filterState.selectedDate,
				startYear: filterState.startYear,
				startMonth: filterState.startMonth,
				endYear: filterState.endYear,
				endMonth: filterState.endMonth,
				periodType: filterState.periodType,
				showGradeInfoColumn: filterState.showGradeInfoColumn, // ⭐ 등급(회수)
				showTaxColumn: filterState.showTaxColumn,
				showNetColumn: filterState.showNetColumn,
				searchQuery: filterState.searchQuery,
				searchCategory: filterState.searchCategory,
				plannerName: '',
				isPlanner: true
			});

			await exporter.export(filteredPaymentList, weeklyColumns, apiGrandTotal);
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

<!-- 카드 4: 용역비 지급명부 -->
<div class="rounded-lg bg-white p-4 shadow-md">
	<h2 class="mb-3 text-lg font-bold text-gray-900">용역비 지급명부</h2>

	<PaymentHeader
		{isLoading}
		isProcessingPast={false}
		{grandTotal}
		{totalPaymentTargets}
		hasData={filteredPaymentList.length > 0}
		onFilterChange={handleFilterTypeChange}
		onPeriodChange={handlePeriodChange}
		onDateChange={() => loadPaymentData()}
		onSearch={handleSearch}
		onItemsPerPageChange={handleItemsPerPageChange}
		onExport={handleExcelExport}
		hidePastProcessButton={true}
		hideExportButton={false}
		onProcessPast={() => {}}
		showPlannerOption={false}
	/>

	<PaymentTable
		{paymentList}
		{filteredPaymentList}
		{weeklyColumns}
		{isLoading}
		{error}
		{currentPage}
		{totalPages}
		{totalPaymentTargets}
		itemsPerPage={filterState.itemsPerPage}
		onPageChange={goToPage}
		{grandTotal}
		{weeklyTotals}
		{monthlyTotals}
		showPlannerColumn={false}
	/>
</div>
