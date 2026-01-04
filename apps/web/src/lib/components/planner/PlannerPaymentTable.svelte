<script>
	import { plannerPaymentFilterState } from '$lib/stores/dashboardStore';
	import Pagination from '$lib/components/Pagination.svelte';
	import { GRADE_LIMITS } from '$lib/utils/constants.js';

	// Props
	export let paymentList = [];  // 전체 데이터 (그룹핑 전)
	export let weeklyColumns = [];
	export let isLoading = false;
	export let error = '';
	export let grandTotal = { amount: 0, tax: 0, net: 0 };
	export let weeklyTotals = {};
	export let monthlyTotals = {};
	export let subtotalDisplayMode = 'noSubtotals'; // ⭐ 'noSubtotals' | 'withSubtotals' | 'subtotalsOnly'

	// Store에서 컬럼 표시 설정 가져오기
	$: showGradeInfoColumn = $plannerPaymentFilterState.showGradeInfoColumn;
	$: showTaxColumn = $plannerPaymentFilterState.showTaxColumn;
	$: showNetColumn = $plannerPaymentFilterState.showNetColumn;
	$: showBankColumn = $plannerPaymentFilterState.showBankColumn;
	$: showAccountColumn = $plannerPaymentFilterState.showAccountColumn;
	$: showCumulativeColumn = $plannerPaymentFilterState.showCumulativeColumn ?? true;
	// ⭐ 설계사 전용 고정 컬럼 설정
	$: showInsuranceColumn = $plannerPaymentFilterState.showInsuranceColumn ?? true;
	$: showRegistrationDateColumn = $plannerPaymentFilterState.showRegistrationDateColumn ?? true;
	$: showDeadlineColumn = $plannerPaymentFilterState.showDeadlineColumn ?? true;
	$: periodType = $plannerPaymentFilterState.periodType;
	$: filterType = $plannerPaymentFilterState.filterType;
	$: itemsPerPage = $plannerPaymentFilterState.itemsPerPage || 20;


	// ⭐ 동적 sticky 위치 계산 (기본 컬럼: 순번, 유/비, 성명, 등록/승급일, 가입기한, 은행, 계좌번호)
	const COL_WIDTH = {
		no: 60,         // 순번
		insurance: 55,  // 유/비
		name: 120,      // 성명
		regDate: 90,    // 등록/승급일
		deadline: 90,   // 가입기한
		bank: 80,       // 은행
		account: 140    // 계좌번호
	};

	// 각 컬럼의 left 위치 계산 (선택된 컬럼에 따라 동적으로 조정)
	$: insuranceLeft = COL_WIDTH.no;
	$: nameLeft = insuranceLeft + (showInsuranceColumn ? COL_WIDTH.insurance : 0);
	$: regDateLeft = nameLeft + COL_WIDTH.name;
	$: deadlineLeft = regDateLeft + (showRegistrationDateColumn ? COL_WIDTH.regDate : 0);
	$: bankLeft = deadlineLeft + (showDeadlineColumn ? COL_WIDTH.deadline : 0);
	$: accountLeft = bankLeft + (showBankColumn ? COL_WIDTH.bank : 0);

	// 총금액 라벨 colspan 계산 (sticky 컬럼 수)
	$: labelColspan = 2  // 순번 + 성명 (항상 포함)
		+ (showInsuranceColumn ? 1 : 0)
		+ (showRegistrationDateColumn ? 1 : 0)
		+ (showDeadlineColumn ? 1 : 0)
		+ (showBankColumn ? 1 : 0)
		+ (showAccountColumn ? 1 : 0);

	// ⭐ 마지막 고정 컬럼 판별 (그림자 표시용) - 계좌번호는 제외하고 은행 컬럼에 그림자 표시
	$: lastFrozenCol = showAccountColumn && showBankColumn ? 'bank'
		: showAccountColumn && showDeadlineColumn ? 'deadline'
		: showAccountColumn && showRegistrationDateColumn ? 'regDate'
		: showAccountColumn ? 'name'
		: showBankColumn ? 'bank'
		: showDeadlineColumn ? 'deadline'
		: showRegistrationDateColumn ? 'regDate'
		: 'name';

	// 페이지 상태
	let currentPage = 1;

	// ⭐ userAccountId로 그룹핑 + 소계 행 생성
	$: groupedData = createGroupedDataWithSubtotals(paymentList);

	// ⭐ 소계 표시 모드에 따라 필터링
	$: filteredData = subtotalDisplayMode === 'subtotalsOnly'
		? groupedData.filter(row => row.isSubtotalRow)
		: subtotalDisplayMode === 'noSubtotals'
		? groupedData.filter(row => !row.isSubtotalRow)
		: groupedData;

	// ⭐ 가상 페이지네이션 (필터링된 데이터 기준)
	$: totalPages = Math.ceil(filteredData.length / itemsPerPage) || 1;
	$: currentPageData = filteredData.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

	// ⭐ 전체 누적총액 계산 (소계 행 제외)
	$: grandTotalCumulative = filteredData
		.filter(row => !row.isSubtotalRow)
		.reduce((acc, row) => {
			const cumulative = row.cumulativeTotal || { totalAmount: 0, totalTax: 0, totalNet: 0 };
			return {
				totalAmount: acc.totalAmount + (cumulative.totalAmount || 0),
				totalTax: acc.totalTax + (cumulative.totalTax || 0),
				totalNet: acc.totalNet + (cumulative.totalNet || 0)
			};
		}, { totalAmount: 0, totalTax: 0, totalNet: 0 });

	/**
	 * 데이터를 userAccountId로 그룹핑하고 소계 행 삽입
	 */
	function createGroupedDataWithSubtotals(data) {
		if (!data || data.length === 0) return [];

		// userAccountId로 그룹핑
		const groups = new Map();
		
		data.forEach(item => {
			const key = item.userAccountId || item.userId;  // userAccountId 없으면 userId 사용
			if (!groups.has(key)) {
				groups.set(key, {
					accountName: item.accountName || item.name,
					bank: item.bank,
					accountNumber: item.accountNumber,
					items: []
				});
			}
			groups.get(key).items.push(item);
		});

		// 그룹핑된 데이터 + 소계 행 생성
		const result = [];
		let rowNo = 1;

		groups.forEach((group, key) => {
			// 그룹 내 항목들
			group.items.forEach(item => {
				result.push({
					...item,
					no: rowNo++,
					isSubtotalRow: false,
					groupKey: key
				});
			});

			// 그룹 소계 행
			if (group.items.length > 0) {
				const subtotal = calculateGroupSubtotal(group);
				result.push({
					isSubtotalRow: true,
					groupKey: key,
					accountName: group.accountName,
					bank: group.bank,
					accountNumber: group.accountNumber,
					itemCount: group.items.length,
					...subtotal
				});
			}
		});

		return result;
	}

	/**
	 * 그룹 소계 계산
	 */
	function calculateGroupSubtotal(group) {
		const subtotal = {
			totalAmount: 0,
			totalTax: 0,
			totalNet: 0,
			// ⭐ 누적총액 합계
			cumulativeTotal: { totalAmount: 0, totalTax: 0, totalNet: 0 },
			payments: {}
		};

		// 각 항목의 totalAmount, totalTax, totalNet 합산
		group.items.forEach(item => {
			subtotal.totalAmount += item.totalAmount || 0;
			subtotal.totalTax += item.totalTax || 0;
			subtotal.totalNet += item.totalNet || 0;

			// ⭐ 누적총액 합산
			if (item.cumulativeTotal) {
				subtotal.cumulativeTotal.totalAmount += item.cumulativeTotal.totalAmount || 0;
				subtotal.cumulativeTotal.totalTax += item.cumulativeTotal.totalTax || 0;
				subtotal.cumulativeTotal.totalNet += item.cumulativeTotal.totalNet || 0;
			}

			// 주차별/월별 지급 합산
			Object.entries(item.payments || {}).forEach(([key, payment]) => {
				if (!subtotal.payments[key]) {
					subtotal.payments[key] = { amount: 0, tax: 0, net: 0 };
				}
				subtotal.payments[key].amount += payment?.amount || 0;
				subtotal.payments[key].tax += payment?.tax || 0;
				subtotal.payments[key].net += payment?.net || 0;
			});
		});

		return subtotal;
	}

	// Sticky 컬럼: 순번(60) + 유/비(55) + 성명(120) = 235px까지 고정
	// 등록/승급일, 가입기한, 은행, 계좌번호는 스크롤됨

	// ⭐ 유지 상태 및 비율 계산
	function getInsuranceInfo(user) {
		const gradeLimit = GRADE_LIMITS[user.grade];
		const isRequired = gradeLimit?.insuranceRequired || false;
		const isActive = user.insuranceActive || false;
		const ratio = user.ratio ?? 1;
		return { isRequired, isActive, ratio };
	}

	// ⭐ 최종 승급일 조회 (승급일 없으면 등록일 반환)
	function getLastPromotionDate(user) {
		if (!user.gradeHistory || user.gradeHistory.length === 0) {
			return null;
		}
		// promotion 타입인 기록 중 가장 마지막 것
		const promotions = user.gradeHistory.filter(h => h.type === 'promotion');
		if (promotions.length > 0) {
			const lastPromotion = promotions[promotions.length - 1];
			return new Date(lastPromotion.date);
		}
		// 승급 기록이 없으면 등록일 반환
		const registration = user.gradeHistory.find(h => h.type === 'registration');
		if (registration) {
			return new Date(registration.date);
		}
		return null;
	}

	// ⭐ 보험 유지 만료 날짜 계산 (승급 후 2달 첫 금요일)
	function getInsuranceDeadline(user) {
		const gradeLimit = GRADE_LIMITS[user.grade];
		if (!gradeLimit?.insuranceRequired) return null;

		if (!user.gradeHistory || user.gradeHistory.length === 0) {
			return null;
		}

		// 현재 등급으로 승급한 날짜 찾기 (가장 최근)
		const currentGrade = user.grade;
		const promotionRecord = [...user.gradeHistory]
			.reverse()
			.find(h => h.toGrade === currentGrade && h.type === 'promotion');

		let baseDate;
		if (!promotionRecord) {
			// 승급 기록이 없으면 등록일 기준
			const registrationRecord = user.gradeHistory.find(h => h.type === 'registration');
			if (!registrationRecord) return null;
			baseDate = new Date(registrationRecord.date);
		} else {
			baseDate = new Date(promotionRecord.date);
		}

		// 2달 후 첫 금요일 계산
		const twoMonthsLater = new Date(baseDate);
		twoMonthsLater.setMonth(twoMonthsLater.getMonth() + 2);

		const dayOfWeek = twoMonthsLater.getDay();
		const daysUntilFriday = (5 - dayOfWeek + 7) % 7;

		const firstFriday = new Date(twoMonthsLater);
		if (daysUntilFriday === 0 && twoMonthsLater.getDay() !== 5) {
			firstFriday.setDate(firstFriday.getDate() + 7);
		} else {
			firstFriday.setDate(firstFriday.getDate() + daysUntilFriday);
		}

		return firstFriday;
	}

	// 날짜 포맷 (YYYY-MM-DD)
	function formatDate(date) {
		if (!date) return '-';
		return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
	}

	// 금액 포맷
	function formatAmount(amount) {
		if (!amount && amount !== 0) return '-';
		return amount.toLocaleString();
	}

	// 개인별 기간 합산 계산
	function calculateUserTotal(user) {
		let totalAmount = 0;
		let totalTax = 0;
		let totalNet = 0;

		Object.values(user.payments || {}).forEach(payment => {
			if (payment) {
				totalAmount += payment.amount || 0;
				totalTax += payment.tax || 0;
				totalNet += payment.net || 0;
			}
		});

		return { totalAmount, totalTax, totalNet };
	}

	// 주차별/월별 총금액 가져오기
	function getColumnTotal(column) {
		let total;

		if (filterType === 'period' && periodType === 'monthly') {
			const monthKey = `month_${column.month}`;
			total = monthlyTotals[monthKey];
		} else {
			const weekKey = `${column.year}-${column.month}-${column.week}`;
			total = weeklyTotals[weekKey];
		}

		if (total) {
			return {
				totalAmount: total.totalAmount || 0,
				totalTax: total.totalTax || 0,
				totalNet: total.totalNet || 0
			};
		}

		return { totalAmount: 0, totalTax: 0, totalNet: 0 };
	}

	// 페이지 변경
	function goToPage(page) {
		if (page >= 1 && page <= totalPages) {
			currentPage = page;
		}
	}

	// 데이터 변경 또는 표시 모드 변경 시 페이지 리셋
	$: if (paymentList || subtotalDisplayMode) {
		currentPage = 1;
	}
</script>

<!-- 테이블 영역 -->
{#if isLoading}
	<div class="loading-state">데이터를 불러오는 중...</div>
{:else if error}
	<div class="error-state">{error}</div>
{:else}
	<div class="relative">
		<!-- 테이블 래퍼 -->
		<div class="table-wrapper">
			<table class="payment-table">
			<!-- ⭐ 컬럼 너비 명시적 고정 (sticky left 계산과 일치) -->
			<colgroup>
				<col style="width: 60px;"><!-- 순번 -->
				{#if showInsuranceColumn}<col style="width: 55px;">{/if}<!-- 유/비 -->
				<col style="width: 120px;"><!-- 성명 -->
				{#if showRegistrationDateColumn}<col style="width: 90px;">{/if}<!-- 등록/승급일 -->
				{#if showDeadlineColumn}<col style="width: 90px;">{/if}<!-- 가입기한 -->
				{#if showBankColumn}<col style="width: 80px;">{/if}<!-- 은행 -->
				{#if showAccountColumn}<col style="width: 140px;">{/if}<!-- 계좌번호 -->
			</colgroup>
			<thead>
					<!-- 첫 번째 헤더 행 -->
					<tr>
						<th rowspan="2" class="th-base th-sticky" style="left: 0; z-index: 42; width: 60px; min-width: 60px; max-width: 60px;">순번</th>
						{#if showInsuranceColumn}
							<th rowspan="2" class="th-base th-sticky" style="left: {insuranceLeft}px; z-index: 41; width: 55px; min-width: 55px; max-width: 55px;">유/비</th>
						{/if}
						<th rowspan="2" class="th-base th-sticky" class:th-sticky-last={lastFrozenCol === 'name'} style="left: {nameLeft}px; z-index: 40; width: 120px; min-width: 120px; max-width: 120px;">성명</th>
						{#if showRegistrationDateColumn}
							<th rowspan="2" class="th-base th-sticky" class:th-sticky-last={lastFrozenCol === 'regDate'} style="left: {regDateLeft}px; z-index: 39; width: 90px; min-width: 90px; max-width: 90px;">등록/승급일</th>
						{/if}
						{#if showDeadlineColumn}
							<th rowspan="2" class="th-base th-sticky" class:th-sticky-last={lastFrozenCol === 'deadline'} style="left: {deadlineLeft}px; z-index: 38; width: 90px; min-width: 90px; max-width: 90px;">가입기한</th>
						{/if}
						{#if showBankColumn}
							<th rowspan="2" class="th-base th-sticky" class:th-sticky-last={lastFrozenCol === 'bank'} style="left: {bankLeft}px; z-index: 37; width: 80px; min-width: 80px; max-width: 80px;">은행</th>
						{/if}
						{#if showAccountColumn}
							<th rowspan="2" class="th-base th-sticky th-sticky-account" style="left: {accountLeft}px; z-index: 36; width: 140px; min-width: 140px; max-width: 140px;">계좌번호</th>
						{/if}
						<!-- ⭐ 누적총액 (주간 선택일 때만 표시) -->
					{#if filterType !== 'period' && showCumulativeColumn}
						<th colspan={1 + (showTaxColumn ? 1 : 0) + (showNetColumn ? 1 : 0)} class="th-cumulative" class:th-cumulative-no-left={showAccountColumn}>누적총액</th>
					{/if}
					{#if filterType === 'period'}
						<th colspan={1 + (showTaxColumn ? 1 : 0) + (showNetColumn ? 1 : 0)} class="th-total" class:th-total-left-border={!showAccountColumn}>기간 합계</th>
					{/if}
					{#each weeklyColumns as week}
							<th colspan={(showGradeInfoColumn ? 1 : 0) + 1 + (showTaxColumn ? 1 : 0) + (showNetColumn ? 1 : 0)} class="th-week period-border">{week.label}</th>
						{/each}
					</tr>
					<!-- 두 번째 헤더 행 -->
					<tr>
						<!-- ⭐ 누적총액 서브 헤더 (주간 선택일 때만 표시) -->
						{#if filterType !== 'period' && showCumulativeColumn}
							<th class="th-sub" class:cumulative-border={!showAccountColumn}>지급액</th>
							{#if showTaxColumn}
								<th class="th-sub th-tax">세지원(3.3%)</th>
							{/if}
							{#if showNetColumn}
								<th class="th-sub">실지급액</th>
							{/if}
						{/if}
						{#if filterType === 'period'}
							<th class="th-sub th-total-sub" class:period-total-border={!showAccountColumn}>지급액</th>
							{#if showTaxColumn}
								<th class="th-sub th-total-sub th-tax">세지원(3.3%)</th>
							{/if}
							{#if showNetColumn}
								<th class="th-sub th-total-sub">실지급액</th>
							{/if}
						{/if}
						{#each weeklyColumns as week}
							{#if showGradeInfoColumn}
								<th class="th-sub th-grade-info">등급(회수)</th>
							{/if}
							<th class="th-sub{showGradeInfoColumn ? '' : ' period-border'}">지급액</th>
							{#if showTaxColumn}
								<th class="th-sub th-tax">세지원(3.3%)</th>
							{/if}
							{#if showNetColumn}
								<th class="th-sub">실지급액</th>
							{/if}
						{/each}
					</tr>
				</thead>
				<tbody>
					{#if filteredData.length > 0}
						{#each currentPageData as row}
							{#if row.isSubtotalRow}
								<!-- ⭐ 소계 행 -->
								<tr class="subtotal-row">
									<td class="subtotal-cell td-sticky" style="left: 0; z-index: 12; width: 60px; min-width: 60px; max-width: 60px;">-</td>
									{#if showInsuranceColumn}
										<td class="subtotal-cell td-sticky" style="left: {insuranceLeft}px; z-index: 11; width: 55px; min-width: 55px; max-width: 55px;">-</td>
									{/if}
									<td class="subtotal-cell subtotal-label td-sticky" class:td-sticky-last={lastFrozenCol === 'name'} style="left: {nameLeft}px; z-index: 10; width: 120px; min-width: 120px; max-width: 120px;">
										<span class="font-bold">{row.accountName}</span>
										<span class="text-xs text-gray-500 ml-1">({row.itemCount}건) 소계</span>
									</td>
									{#if showRegistrationDateColumn}
										<td class="subtotal-cell td-sticky" class:td-sticky-last={lastFrozenCol === 'regDate'} style="left: {regDateLeft}px; z-index: 9; width: 90px; min-width: 90px; max-width: 90px;">-</td>
									{/if}
									{#if showDeadlineColumn}
										<td class="subtotal-cell td-sticky" class:td-sticky-last={lastFrozenCol === 'deadline'} style="left: {deadlineLeft}px; z-index: 8; width: 90px; min-width: 90px; max-width: 90px;">-</td>
									{/if}
									{#if showBankColumn}
										<td class="subtotal-cell td-sticky" class:td-sticky-last={lastFrozenCol === 'bank'} style="left: {bankLeft}px; z-index: 7; width: 80px; min-width: 80px; max-width: 80px;">{row.bank || ''}</td>
									{/if}
									{#if showAccountColumn}
									<td class="subtotal-cell td-sticky td-sticky-account" style="left: {accountLeft}px; z-index: 6; width: 140px; min-width: 140px; max-width: 140px;">{row.accountNumber || ''}</td>
								{/if}
								<!-- ⭐ 누적총액 (주간 선택일 때만 표시) -->
								{#if filterType !== 'period' && showCumulativeColumn}
									<td class="subtotal-value" class:cumulative-border={!showAccountColumn}>{formatAmount(row.cumulativeTotal?.totalAmount || 0)}</td>
									{#if showTaxColumn}
										<td class="subtotal-value subtotal-tax">{formatAmount(row.cumulativeTotal?.totalTax || 0)}</td>
									{/if}
									{#if showNetColumn}
										<td class="subtotal-value">{formatAmount(row.cumulativeTotal?.totalNet || 0)}</td>
									{/if}
								{/if}
								<!-- 기간 합계 -->
								{#if filterType === 'period'}
									<td class="subtotal-value" class:period-total-border={!showAccountColumn}>{formatAmount(row.totalAmount)}</td>
										{#if showTaxColumn}
											<td class="subtotal-value subtotal-tax">{formatAmount(row.totalTax)}</td>
										{/if}
										{#if showNetColumn}
											<td class="subtotal-value">{formatAmount(row.totalNet)}</td>
										{/if}
									{/if}
									<!-- 주차별/월별 소계 -->
									{#each weeklyColumns as week}
										{@const key =
											filterType === 'period' && periodType === 'monthly'
												? `month_${week.month}`
												: `${week.year}_${week.month}_${week.week}`}
										{@const payment = row.payments[key]}
										{#if showGradeInfoColumn}
											<td class="subtotal-value period-border" style="text-align: center; padding-right: 6px;">-</td>
										{/if}
										<td class="subtotal-value{showGradeInfoColumn ? '' : ' period-border'}">{formatAmount(payment?.amount)}</td>
										{#if showTaxColumn}
											<td class="subtotal-value subtotal-tax">{formatAmount(payment?.tax)}</td>
										{/if}
										{#if showNetColumn}
											<td class="subtotal-value">{formatAmount(payment?.net)}</td>
										{/if}
									{/each}
								</tr>
							{:else}
								<!-- 일반 데이터 행 -->
								{@const userTotal = calculateUserTotal(row)}
								{@const insuranceInfo = getInsuranceInfo(row)}
								{@const promoDate = getLastPromotionDate(row)}
								{@const deadline = getInsuranceDeadline(row)}
								{@const isOverdue = deadline && !row.insuranceActive && deadline > new Date()}
								<tr class="data-row">
									<td class="td-sticky td-base" style="left: 0; z-index: 12; width: 60px; min-width: 60px; max-width: 60px;">{row.no}</td>
									{#if showInsuranceColumn}
										<td class="td-sticky td-base" style="left: {insuranceLeft}px; z-index: 11; width: 55px; min-width: 55px; max-width: 55px; padding: 2px;">
											<div class="insurance-cell">
												{#if !insuranceInfo.isRequired}
													<span class="insurance-badge insurance-badge-na" title="보험 불필요">-</span>
												{:else if insuranceInfo.isActive}
													<span class="insurance-badge insurance-badge-active" title="보험 유지됨">유</span>
												{:else}
													<span class="insurance-badge insurance-badge-inactive" title="보험 미유지">✕</span>
												{/if}
												<span class="insurance-ratio" class:insurance-ratio-warn={insuranceInfo.isRequired && !insuranceInfo.isActive}>{insuranceInfo.ratio}</span>
											</div>
										</td>
									{/if}
									<td class="td-sticky td-base" class:td-sticky-last={lastFrozenCol === 'name'} style="left: {nameLeft}px; z-index: 10; width: 120px; min-width: 120px; max-width: 120px;">
										<div class="flex items-center justify-center">
											<div class="relative inline-flex items-baseline">
												{row.name}
												{#if row.grade}
													<img
														src="/icons/{row.grade}.svg"
														alt={row.grade}
														class="grade-icon"
														title="{row.grade} 등급"
													/>
												{/if}
											</div>
										</div>
									</td>
									{#if showRegistrationDateColumn}
										<td class="td-sticky td-base" class:td-sticky-last={lastFrozenCol === 'regDate'} style="left: {regDateLeft}px; z-index: 9; width: 90px; min-width: 90px; max-width: 90px;">{formatDate(promoDate)}</td>
									{/if}
									{#if showDeadlineColumn}
										<td class="td-sticky td-base" class:text-red-600={isOverdue} class:td-sticky-last={lastFrozenCol === 'deadline'} style="left: {deadlineLeft}px; z-index: 8; width: 90px; min-width: 90px; max-width: 90px;">{formatDate(deadline)}</td>
									{/if}
									{#if showBankColumn}
										<td class="td-sticky td-base" class:td-sticky-last={lastFrozenCol === 'bank'} style="left: {bankLeft}px; z-index: 7; width: 80px; min-width: 80px; max-width: 80px;">{row.bank}</td>
									{/if}
									{#if showAccountColumn}
									<td class="td-sticky td-base td-sticky-account" style="left: {accountLeft}px; z-index: 6; width: 140px; min-width: 140px; max-width: 140px;">{row.accountNumber}</td>
								{/if}
								<!-- ⭐ 누적총액 (주간 선택일 때만 표시) -->
								{#if filterType !== 'period' && showCumulativeColumn}
									<td class="td-amount" class:cumulative-border={!showAccountColumn}>{formatAmount(row.cumulativeTotal?.totalAmount || 0)}</td>
									{#if showTaxColumn}
										<td class="td-tax">{formatAmount(row.cumulativeTotal?.totalTax || 0)}</td>
									{/if}
									{#if showNetColumn}
										<td class="td-net">{formatAmount(row.cumulativeTotal?.totalNet || 0)}</td>
									{/if}
								{/if}
								<!-- 기간 합계 (기간 선택일 때만) -->
								{#if filterType === 'period'}
									<td class="td-total" class:period-total-border={!showAccountColumn}>{formatAmount(userTotal.totalAmount)}</td>
										{#if showTaxColumn}
											<td class="td-total td-tax">{formatAmount(userTotal.totalTax)}</td>
										{/if}
										{#if showNetColumn}
											<td class="td-total">{formatAmount(userTotal.totalNet)}</td>
										{/if}
									{/if}
									{#each weeklyColumns as week}
										{@const key =
											filterType === 'period' && periodType === 'monthly'
												? `month_${week.month}`
												: `${week.year}_${week.month}_${week.week}`}
										{@const payment = row.payments[key]}
										{#if showGradeInfoColumn}
											<td
												class="td-grade-info"
												title={payment?.installmentDetails
													? payment.installmentDetails.map((d) => `${d.revenueMonth} ${d.week}회차`).join(', ')
													: ''}
											>
												{payment?.gradeInfo || '-'}
											</td>
										{/if}
										<td class="td-amount{showGradeInfoColumn ? '' : ' period-border'}">
											{formatAmount(payment?.amount)}
										</td>
										{#if showTaxColumn}
											<td class="td-tax">{formatAmount(payment?.tax)}</td>
										{/if}
										{#if showNetColumn}
											<td class="td-net">{formatAmount(payment?.net)}</td>
										{/if}
									{/each}
								</tr>
							{/if}
						{/each}

						<!-- 총금액 행 -->
						<tr class="grand-total-row">
							<td colspan={labelColspan} class="grand-total-label" class:grand-total-label-account={showAccountColumn}>총금액</td>
							<!-- ⭐ 누적총액 컬럼 (주간 선택일 때만 표시) -->
							{#if filterType !== 'period' && showCumulativeColumn}
								<td class="grand-total-value" class:cumulative-border={!showAccountColumn}>{formatAmount(grandTotalCumulative.totalAmount)}</td>
								{#if showTaxColumn}
									<td class="grand-total-value grand-total-tax">{formatAmount(grandTotalCumulative.totalTax)}</td>
								{/if}
								{#if showNetColumn}
									<td class="grand-total-value">{formatAmount(grandTotalCumulative.totalNet)}</td>
								{/if}
							{/if}
							<!-- 기간 합계 컬럼 -->
							{#if filterType === 'period'}
								<td class="grand-total-value" class:period-total-border={!showAccountColumn}>{formatAmount(grandTotal.amount)}</td>
								{#if showTaxColumn}
									<td class="grand-total-value grand-total-tax">{formatAmount(grandTotal.tax)}</td>
								{/if}
								{#if showNetColumn}
									<td class="grand-total-value">{formatAmount(grandTotal.net)}</td>
								{/if}
							{/if}
							<!-- 주차별/월별 총계 컬럼 -->
							{#each weeklyColumns as column}
								{@const columnTotal = getColumnTotal(column)}
								{#if showGradeInfoColumn}
									<td class="grand-total-value period-border" style="text-align: center; padding-right: 6px;">-</td>
								{/if}
								<td class="grand-total-value{showGradeInfoColumn ? '' : ' period-border'}">{formatAmount(columnTotal.totalAmount)}</td>
								{#if showTaxColumn}
									<td class="grand-total-value grand-total-tax">{formatAmount(columnTotal.totalTax)}</td>
								{/if}
								{#if showNetColumn}
									<td class="grand-total-value">{formatAmount(columnTotal.totalNet)}</td>
								{/if}
							{/each}
						</tr>
					{:else}
						{@const fixedCols = 2 + (showInsuranceColumn ? 1 : 0) + (showRegistrationDateColumn ? 1 : 0) + (showDeadlineColumn ? 1 : 0) + (showBankColumn ? 1 : 0) + (showAccountColumn ? 1 : 0)}
						{@const colsPerWeek = (showGradeInfoColumn ? 1 : 0) + 1 + (showTaxColumn ? 1 : 0) + (showNetColumn ? 1 : 0)}
						{@const cumulativeCols = (filterType !== 'period' && showCumulativeColumn) ? 1 + (showTaxColumn ? 1 : 0) + (showNetColumn ? 1 : 0) : 0}
						{@const periodCols = filterType === 'period' ? colsPerWeek : 0}
						{@const totalCols = fixedCols + cumulativeCols + periodCols + weeklyColumns.length * colsPerWeek}
						<tr>
							<td colspan={totalCols} class="empty-state">
								데이터가 없습니다
							</td>
						</tr>
					{/if}
				</tbody>
			</table>
		</div>

		<!-- 페이지네이션 -->
		{#if filteredData.length > 0}
			<Pagination
				{currentPage}
				{totalPages}
				totalItems={filteredData.length}
				{itemsPerPage}
				onPageChange={goToPage}
			/>
		{/if}
	</div>
{/if}

<style>
	@reference "$lib/../app.css";

	/* 상태 메시지 */
	.loading-state {
		@apply py-10 text-center text-base;
	}

	.error-state {
		@apply py-10 text-center text-base text-red-600;
	}

	.empty-state {
		@apply border-b border-l border-r border-gray-300 bg-white py-10 text-center italic text-gray-600;
	}

	/* 테이블 래퍼 - 수평 스크롤 */
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

	/* ⭐ 헤더 고정 컬럼 (수평 sticky) */
	.th-sticky {
		@apply sticky bg-gray-200;
		z-index: 20 !important;
	}

	/* ⭐ 마지막 고정 컬럼 - 오른쪽 그림자 */
	.th-sticky-last {
		box-shadow: 4px 0 8px -2px rgba(0, 0, 0, 0.15) !important;
	}

	/* ⭐ 데이터 셀 수평 스크롤 고정 */
	.td-sticky {
		@apply sticky bg-white;
		z-index: 10 !important;
	}

	/* ⭐ 마지막 고정 컬럼 - 오른쪽 그림자 */
	.td-sticky-last {
		box-shadow: 4px 0 8px -2px rgba(0, 0, 0, 0.15) !important;
	}

	/* ⭐ 계좌번호 컬럼 - 파란색 오른쪽 경계선 (마지막 고정 컬럼 구분) */
	.th-sticky-account {
		border-right: 2px solid #93c5fd !important;
	}

	.td-sticky-account {
		border-right: 2px solid #93c5fd !important;
	}

	/* 소계 행의 sticky 셀 */
	.subtotal-row .td-sticky {
		background-color: #fef3c7 !important;
	}

	/* 총금액 행의 sticky 셀 */
	.grand-total-row .td-sticky {
		background-color: #e9d5ff !important;
	}

	/* 데이터 행 hover 시 sticky 셀 */
	.data-row:hover .td-sticky {
		background-color: #fafafa !important;
	}

	/* 헤더 - 기본 */
	.th-base {
		@apply border-b border-r border-t border-gray-300 bg-gray-200;
		@apply whitespace-nowrap p-1.5 text-center text-sm font-bold;
	}

	.th-base:first-child {
		@apply border-l;
	}

	/* 헤더 - 누적총액 */
	.th-cumulative {
		@apply border-b border-r border-t border-gray-300 bg-blue-100;
		@apply whitespace-nowrap p-1.5 text-center text-sm font-bold;
		border-left: 2px solid #93c5fd !important;
	}

	/* ⭐ 계좌번호 컬럼이 있을 때 누적총액 왼쪽 경계선 제거 (중복 방지) */
	.th-cumulative-no-left {
		border-left: none !important;
	}

	/* 헤더 - 기간 합계 */
	.th-total {
		@apply border-b border-r border-t border-gray-300 bg-purple-200;
		@apply whitespace-nowrap p-1.5 text-center text-sm font-bold;
	}

	/* ⭐ 기간 합계 - 계좌번호 컬럼이 없을 때 왼쪽 파란 경계선 */
	.th-total-left-border {
		border-left: 2px solid #93c5fd !important;
	}

	/* ⭐ 기간 합계 셀 - 왼쪽 파란 경계선 (계좌번호 컬럼 없을 때) */
	.period-total-border {
		border-left: 2px solid #93c5fd !important;
	}

	/* 헤더 - 주차 */
	.th-week {
		@apply border-b border-r border-t border-gray-300 bg-blue-100;
		@apply whitespace-nowrap p-1.5 text-center text-sm font-bold;
	}

	/* 헤더 - 서브 */
	.th-sub {
		@apply border-b border-r border-gray-300 bg-gray-200;
		@apply min-w-[100px] whitespace-nowrap p-1.5 text-center text-[13px] font-normal;
	}

	.th-total-sub {
		@apply bg-purple-100;
	}

	.th-tax {
		@apply bg-red-50;
	}

	/* 데이터 행 */
	.data-row:hover td {
		@apply bg-black/[0.02];
	}

	/* ⭐ 보험 유/비 관련 스타일 */
	.insurance-cell {
		@apply flex items-center justify-center gap-0.5;
	}

	.insurance-badge {
		@apply inline-flex items-center justify-center w-4 h-4 rounded text-[10px] font-bold;
	}

	.insurance-badge-active {
		@apply bg-green-100 text-green-700 border border-green-300;
	}

	.insurance-badge-inactive {
		@apply bg-red-100 text-red-600 border border-red-300;
	}

	.insurance-badge-na {
		@apply text-gray-400;
	}

	.insurance-ratio {
		@apply text-[10px] text-gray-500;
	}

	.insurance-ratio-warn {
		@apply text-red-500 font-semibold;
	}


	/* 데이터 셀 - 기본 (승급일, 가입기한 등) */
	.td-base {
		@apply border-b border-r border-gray-300;
		@apply whitespace-nowrap p-1.5 text-center text-sm;
	}

	.data-row:hover .td-base {
		@apply bg-black/[0.02];
	}

	/* 데이터 셀 - 지급액 */
	.td-amount {
		@apply border-b border-r border-gray-300 bg-yellow-100;
		@apply whitespace-nowrap p-1.5 pr-3 text-right text-sm font-bold;
	}

	.data-row:hover .td-amount {
		@apply bg-yellow-200;
	}

	/* 데이터 셀 - 세지원 */
	.td-tax {
		@apply border-b border-r border-gray-300 bg-red-50;
		@apply whitespace-nowrap p-1.5 pr-3 text-right text-sm text-red-600;
	}

	.data-row:hover .td-tax {
		@apply bg-red-100;
	}

	/* 데이터 셀 - 실지급액 */
	.td-net {
		@apply border-b border-r border-gray-300 bg-green-50;
		@apply whitespace-nowrap p-1.5 pr-3 text-right text-sm font-bold;
	}

	.data-row:hover .td-net {
		@apply bg-green-100;
	}

	/* 데이터 셀 - 기간 합계 */
	.td-total {
		@apply border-b border-r border-gray-300 bg-purple-50;
		@apply whitespace-nowrap p-1.5 pr-3 text-right text-sm font-bold;
	}

	.data-row:hover .td-total {
		@apply bg-purple-100;
	}

	.td-total.td-tax {
		@apply bg-red-100 text-red-700;
	}

	.data-row:hover .td-total.td-tax {
		@apply bg-red-200;
	}

	/* 누적총액 - 왼쪽 경계선 (일반 스타일) */
	.cumulative-border {
		@apply border-l border-gray-300;
	}

	/* 등급(회수) 셀 - ⭐ 왼쪽 경계선 파란색으로 통일 */
	.th-grade-info {
		@apply bg-indigo-100;
		@apply font-semibold text-indigo-800;
		@apply min-w-[80px] max-w-[100px];
		border-left: 2px solid #93c5fd !important;
	}

	.td-grade-info {
		@apply border-b border-r border-gray-300 bg-indigo-50;
		@apply whitespace-nowrap p-1.5 text-center text-xs;
		@apply text-indigo-700 font-medium;
		border-left: 2px solid #93c5fd !important;
	}

	.data-row:hover .td-grade-info {
		@apply bg-indigo-100;
	}

	/* 기간 경계선 */
	.period-border {
		border-left: 2px solid #93c5fd !important;
	}

	/* 등급 아이콘 */
	.grade-icon {
		@apply absolute -right-5 -top-1.5 h-5 w-5;
	}

	/* ⭐ 소계 행 스타일 */
	.subtotal-row {
		@apply bg-amber-50 border-t-2 border-amber-400;
	}

	.subtotal-cell {
		@apply bg-amber-100 font-semibold;
		@apply border-b border-r border-gray-300;
		@apply whitespace-nowrap p-1.5 text-center text-sm;
	}

	.subtotal-label {
		@apply text-left pl-3;
	}

	.subtotal-value {
		@apply bg-amber-100 font-bold;
		@apply border-b border-r border-gray-300;
		@apply whitespace-nowrap p-1.5 pr-3 text-right text-sm;
	}

	.subtotal-tax {
		@apply bg-red-100 text-red-700;
	}

	/* 기간별 총계 행 */
	.grand-total-row {
		@apply border-t-2 border-gray-400 bg-purple-100;
	}

	.grand-total-label {
		@apply sticky left-0 z-10 bg-purple-200;
		@apply border-b border-l border-r border-gray-300;
		@apply whitespace-nowrap p-1.5 text-center text-sm font-bold;
	}

	/* ⭐ 총금액 행 - 계좌번호 컬럼 표시 시 파란색 오른쪽 경계선 */
	.grand-total-label-account {
		border-right: 2px solid #93c5fd !important;
	}

	.grand-total-value {
		@apply border-b border-r border-gray-300 bg-purple-200;
		@apply whitespace-nowrap p-1.5 pr-3 text-right text-sm font-bold;
	}

	.grand-total-tax {
		@apply bg-red-200 text-red-700;
	}

	/* 모바일에서 sticky 효과 제거 */
	@media (max-width: 768px) {
		.th-sticky,
		.td-sticky {
			position: static !important;
		}
		.th-sticky-last,
		.td-sticky-last {
			box-shadow: none !important;
		}
	}
</style>
