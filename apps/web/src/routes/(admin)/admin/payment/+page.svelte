<script>
	import { onMount } from 'svelte';
	import { browser } from '$app/environment';
	import { paymentPageFilterState } from '$lib/stores/dashboardStore';
	import { paymentService } from '$lib/services/paymentService';
	import { PaymentExcelExporter } from '$lib/utils/paymentExcelExporter';
	import PaymentHeader from '$lib/components/shared/payment/PaymentHeader.svelte';
	import PaymentTable from '$lib/components/shared/payment/PaymentTable.svelte';

	// 상태 변수
	let paymentList = [];
	let filteredPaymentList = [];
	let weeklyColumns = [];
	let isLoading = false;
	let error = '';
	let currentPage = 1;
	let totalPages = 1;
	let totalPaymentTargets = 0;
	let apiGrandTotal = null;
	let weeklyTotals = {}; // 주차별 총계
	let monthlyTotals = {}; // 월별 총계
	let isProcessingPast = false;

	// grandTotal을 reactive 변수로 계산
	$: grandTotal = apiGrandTotal ? {
		amount: apiGrandTotal.totalAmount || 0,
		tax: apiGrandTotal.totalTax || 0,
		net: apiGrandTotal.totalNet || 0
	} : { amount: 0, tax: 0, net: 0 };

	// 데이터 로드
	async function loadPaymentData(page = 1) {
		isLoading = true;
		error = '';
		currentPage = page;

		try {
			const filterState = $paymentPageFilterState;
			const result = await paymentService.loadPaymentData({
				filterType: filterState.filterType,
				selectedDate: filterState.selectedDate,
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
			weeklyTotals = result.weeklyTotals || {}; // 주차별 총계
			monthlyTotals = result.monthlyTotals || {}; // 월별 총계
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
		if ($paymentPageFilterState.filterType === 'period') {
			loadPaymentData(1);
		}
	}

	// Excel export
	async function exportToExcel() {
		const filterState = $paymentPageFilterState;

		// 전체 데이터 가져오기
		const { users: allData, weeks: allWeeks } = await paymentService.getAllPaymentData({
			filterType: filterState.filterType,
			selectedDate: filterState.selectedDate,
			startYear: filterState.startYear,
			startMonth: filterState.startMonth,
			endYear: filterState.endYear,
			endMonth: filterState.endMonth,
			searchQuery: filterState.searchQuery,
			searchCategory: filterState.searchCategory,
			periodType: filterState.periodType
		});

		// Excel 내보내기
		const exporter = new PaymentExcelExporter({
			showGradeInfoColumn: filterState.showGradeInfoColumn, // ⭐ 등급(회수) 컬럼
			showTaxColumn: filterState.showTaxColumn,
			showNetColumn: filterState.showNetColumn,
			filterType: filterState.filterType,
			selectedDate: filterState.selectedDate,
			startYear: filterState.startYear,
			startMonth: filterState.startMonth,
			endYear: filterState.endYear,
			endMonth: filterState.endMonth,
			periodType: filterState.periodType,
			searchQuery: filterState.searchQuery,
			searchCategory: filterState.searchCategory
		});

		await exporter.export(allData, allWeeks);
	}

	// 과거 지급 일괄 처리
	async function processPastPayments() {
		if (!confirm('오늘 이전의 모든 pending 지급을 자동으로 처리합니다. 계속하시겠습니까?')) {
			return;
		}

		isProcessingPast = true;
		try {
			const result = await paymentService.processPastPayments();
			alert(`과거 지급 일괄 처리 완료!\n\n처리된 주차: ${result.processedWeeks}개\n총 지급 건수: ${result.totalPayments}건`);
			loadPaymentData(currentPage);
		} catch (error) {
			console.error('과거 지급 처리 실패:', error);
			alert(`오류: ${error.message}`);
		} finally {
			isProcessingPast = false;
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

	<!-- PaymentHeader 컴포넌트 사용 -->
	<PaymentHeader
		{isLoading}
		{isProcessingPast}
		{grandTotal}
		{totalPaymentTargets}
		hasData={filteredPaymentList.length > 0}
		onFilterChange={handleFilterTypeChange}
		onPeriodChange={handlePeriodChange}
		onDateChange={() => loadPaymentData()}
		onSearch={handleSearch}
		onItemsPerPageChange={handleItemsPerPageChange}
		onExport={exportToExcel}
		onProcessPast={processPastPayments}
	/>

	<!-- PaymentTable 컴포넌트 사용 -->
	<PaymentTable
		{paymentList}
		{filteredPaymentList}
		{weeklyColumns}
		{isLoading}
		{error}
		{currentPage}
		{totalPages}
		{totalPaymentTargets}
		itemsPerPage={$paymentPageFilterState.itemsPerPage}
		onPageChange={goToPage}
		{grandTotal}
		{weeklyTotals}
		{monthlyTotals}
		showPlannerColumn={$paymentPageFilterState.showPlannerColumn}
	/>
</div>

<style>
	.container {
		padding: 20px;
		max-width: 100%;
		background: white;
	}

	.title {
		font-size: 20px;
		font-weight: 700;
		text-align: center;
		margin-bottom: 20px;
		color: #1F2937;
	}

	/* 반응형 - 모바일 */
	@media (max-width: 480px) {
		.container {
			padding: 5px;
		}

		.title {
			font-size: 20px;
			margin-bottom: 6px;
		}
	}
</style>