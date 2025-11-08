<script>
	import { onMount } from 'svelte';
	import { browser } from '$app/environment';
	import GradeBadge from '$lib/components/GradeBadge.svelte';
	import GradePaymentAdjustModal from './GradePaymentAdjustModal.svelte';
	import { revenueCardState } from '$lib/stores/dashboardStore';

	// Store에서 초기값 가져오기
	let viewMode = $revenueCardState.viewMode;
	let selectedYear = $revenueCardState.startYear;
	let selectedMonth = $revenueCardState.startMonth;
	let startYear = $revenueCardState.startYear;
	let startMonth = $revenueCardState.startMonth;
	let endYear = $revenueCardState.endYear;
	let endMonth = $revenueCardState.endMonth;

	// 변경 시 Store 업데이트
	$: viewMode, selectedYear, selectedMonth, startYear, startMonth, endYear, endMonth, updateStore();

	function updateStore() {
		if (browser) {
			revenueCardState.set({
				viewMode,
				startYear: viewMode === 'single' ? selectedYear : startYear,
				startMonth: viewMode === 'single' ? selectedMonth : startMonth,
				endYear,
				endMonth
			});
		}
	}

	// 데이터
	let monthlyData = null;
	let rangeData = null; // 기간 조회 데이터
	let isLoading = false;
	let isCurrentMonth = false;

	// 모달 상태
	let showGradeModal = false;
	let modalMonthKey = null;

	onMount(() => {
		loadData();
	});

	$: if (browser && viewMode === 'single' && selectedYear && selectedMonth) {
		rangeData = null; // 모드 변경 시 기간 데이터 초기화
		loadData();
	}

	$: if (browser && viewMode === 'range' && startYear && startMonth && endYear && endMonth) {
		monthlyData = null; // 모드 변경 시 월간 데이터 초기화
		loadRangeData();
	}

	// 현재월 확인
	$: {
		const today = new Date();
		const currentMonthKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
		const selectedMonthKey = `${selectedYear}-${String(selectedMonth).padStart(2, '0')}`;
		isCurrentMonth = selectedMonthKey === currentMonthKey;
	}

	// 날짜 범위 검증
	let isDateRangeInvalid = false;
	$: {
		if (startYear > endYear || (startYear === endYear && startMonth > endMonth)) {
			isDateRangeInvalid = true;
		} else {
			isDateRangeInvalid = false;
		}
	}

	async function loadData() {
		try {
			isLoading = true;
			const monthKey = `${selectedYear}-${String(selectedMonth).padStart(2, '0')}`;

			const response = await fetch(`/api/admin/revenue/monthly?monthKey=${monthKey}`);
			if (response.ok) {
				monthlyData = await response.json();
			} else {
				console.error('Failed to load monthly data');
				monthlyData = null;
			}
		} catch (error) {
			console.error('Error loading data:', error);
			monthlyData = null;
		} finally {
			isLoading = false;
		}
	}

	async function loadRangeData() {
		try {
			isLoading = true;
			const startMonthKey = `${startYear}-${String(startMonth).padStart(2, '0')}`;
			const endMonthKey = `${endYear}-${String(endMonth).padStart(2, '0')}`;

			console.log(`[MonthlyRevenueCard] loadRangeData: ${startMonthKey} ~ ${endMonthKey}`);

			const response = await fetch(
				`/api/admin/revenue/range?start=${startMonthKey}&end=${endMonthKey}&viewMode=monthly`
			);
			if (response.ok) {
				const data = await response.json();
				console.log(
					`[MonthlyRevenueCard] API returned ${data.monthlyData?.length || 0} months:`,
					data.monthlyData?.map((m) => m.monthKey)
				);

				// 선택한 기간의 모든 월 생성 (do...while로 최소 시작월은 보장)
				const allMonths = [];
				let currentYear = startYear;
				let currentMonth = startMonth;

				do {
					const monthKey = `${currentYear}-${String(currentMonth).padStart(2, '0')}`;

					// API에서 받은 데이터 중 해당 월 찾기
					const existingMonth = (data.monthlyData || []).find((m) => m.monthKey === monthKey);

					if (existingMonth) {
						// 데이터가 있는 월
						console.log(`[MonthlyRevenueCard] ${monthKey}: 데이터 있음`);
						allMonths.push(existingMonth);
					} else {
						// 데이터가 없는 월 - 빈 객체 생성
						console.log(`[MonthlyRevenueCard] ${monthKey}: 데이터 없음 (빈 객체 생성)`);
						allMonths.push({
							monthKey,
							registrationCount: 0,
							effectiveRevenue: 0,
							gradeDistribution: {
								F1: 0,
								F2: 0,
								F3: 0,
								F4: 0,
								F5: 0,
								F6: 0,
								F7: 0,
								F8: 0
							}
						});
					}

					if (isDateRangeInvalid) {
						break; // 날짜 역전 시 시작 월만 표시
					}

					// 다음 월로 이동
					currentMonth++;
					if (currentMonth > 12) {
						currentMonth = 1;
						currentYear++;
					}
				} while (currentYear < endYear || (currentYear === endYear && currentMonth <= endMonth));

				console.log(
					`[MonthlyRevenueCard] Total generated months: ${allMonths.length}`,
					allMonths.map((m) => m.monthKey)
				);

				rangeData = {
					summary: data.summary,
					months: allMonths
				};
			} else {
				console.error('Failed to load range data');
				rangeData = null;
			}
		} catch (error) {
			console.error('Error loading range data:', error);
			rangeData = null;
		} finally {
			isLoading = false;
		}
	}

	function openGradeModal() {
		const monthKey = `${selectedYear}-${String(selectedMonth).padStart(2, '0')}`;
		modalMonthKey = monthKey;
		showGradeModal = true;
	}

	function closeGradeModal() {
		showGradeModal = false;
		modalMonthKey = null;
	}

	async function handleGradeAdjusted(event) {
		closeGradeModal();
		await loadData();
	}

	// 총계 계산
	let totalCount = 0;
	let totalPerAmount = 0; // 1회 금액 합계
	let totalAmount = 0; // 10회 총액 합계

	$: if (monthlyData?.gradeDistribution && monthlyData?.gradePayments) {
		totalCount = Object.values(monthlyData.gradeDistribution || {}).reduce((sum, count) => sum + count, 0);

		// 1회 금액 합계와 10회 총액 합계 계산
		const result = ['F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8'].reduce((acc, grade) => {
			const count = monthlyData.gradeDistribution?.[grade] || 0;
			const perAmount = monthlyData.gradePayments?.[grade] || 0;

			return {
				perAmount: acc.perAmount + (perAmount * count), // 1회 금액 × 인원수
				totalAmount: acc.totalAmount + (perAmount * 10 * count) // 10회 총액
			};
		}, { perAmount: 0, totalAmount: 0 });

		totalPerAmount = result.perAmount;
		totalAmount = result.totalAmount;
	} else {
		totalCount = 0;
		totalPerAmount = 0;
		totalAmount = 0;
	}

	// 지급 기간 계산 (다음 달부터 3개월)
	function getPaymentPeriod(year, month) {
		let startMonth = month + 1;
		let startYear = year;
		if (startMonth > 12) {
			startMonth = 1;
			startYear++;
		}

		let endMonth = startMonth + 2;
		let endYear = startYear;
		if (endMonth > 12) {
			endMonth -= 12;
			endYear++;
		}

		return `${startMonth}~${endMonth}월`;
	}
</script>

<div class="overflow-hidden rounded-lg bg-white shadow-sm">
	<!-- 헤더 -->
	<div class="border-b border-gray-200 bg-gradient-to-r from-green-50 to-green-100 px-4 py-3">
		<div class="flex flex-col gap-3">
			<h3 class="text-lg font-semibold text-gray-900">📈 매출 통계</h3>

			<!-- 조회 옵션 (모바일 최적화) -->
			<div class="flex flex-col gap-2">
				<!-- 월간 선택 -->
				<div class="flex items-center gap-2">
					<label class="flex cursor-pointer items-center gap-1">
						<input type="radio" bind:group={viewMode} value="single" class="form-radio text-xs" />
						<span class="text-xs">월간</span>
					</label>
					<input
						type="month"
						value="{selectedYear}-{String(selectedMonth).padStart(2, '0')}"
						on:change={(e) => {
							const [year, month] = e.target.value.split('-');
							selectedYear = parseInt(year);
							selectedMonth = parseInt(month);
						}}
						disabled={viewMode !== 'single'}
						class="rounded border border-gray-300 px-2 py-1 text-xs disabled:bg-gray-100 disabled:text-gray-400"
					/>
				</div>

				<!-- 기간 선택 -->
				<div class="flex items-center gap-2">
					<label class="flex cursor-pointer items-center gap-1">
						<input type="radio" bind:group={viewMode} value="range" class="form-radio text-xs" />
						<span class="text-xs">기간</span>
					</label>
					<input
						type="month"
						value="{startYear}-{String(startMonth).padStart(2, '0')}"
						on:change={(e) => {
							const [year, month] = e.target.value.split('-');
							startYear = parseInt(year);
							startMonth = parseInt(month);
						}}
						disabled={viewMode !== 'range'}
						class="rounded border border-gray-300 px-2 py-1 text-xs disabled:bg-gray-100 disabled:text-gray-400"
					/>
					<span class="text-xs">~</span>
					<input
						type="month"
						value="{endYear}-{String(endMonth).padStart(2, '0')}"
						on:change={(e) => {
							const [year, month] = e.target.value.split('-');
							endYear = parseInt(year);
							endMonth = parseInt(month);
						}}
						disabled={viewMode !== 'range'}
						class="rounded border border-gray-300 px-2 py-1 text-xs disabled:bg-gray-100 disabled:text-gray-400"
					/>
				</div>
			</div>
		</div>
	</div>

	<!-- 본문 -->
	<div class="p-4">
		{#if isLoading}
			<div class="flex h-64 items-center justify-center">
				<div class="text-gray-500">로딩 중...</div>
			</div>
		{:else if monthlyData}
			<div class="space-y-4">
				<!-- 기간 표시 -->
				<div class="border-b border-gray-300 pb-2">
					<h4 class="text-base font-semibold text-gray-900">
						{selectedYear}년 {selectedMonth}월 현황
						{#if isCurrentMonth}
							<span class="ml-2 text-xs font-semibold text-blue-600">📍 현재 월</span>
						{/if}
					</h4>
				</div>

				<!-- 매출 정보 -->
				<div class="rounded-lg border border-gray-300 bg-green-50 px-4 py-3">
					<div class="flex flex-col gap-2 text-xs">
						<div class="flex items-center justify-between">
							<span class="text-gray-600">자동 매출:</span>
							<div class="flex items-center gap-2">
								<span class="font-semibold"
									>{(monthlyData.totalRevenue || 0).toLocaleString()}원</span
								>
								<span class="text-gray-500">(등록자 {monthlyData.registrationCount || 0}명)</span>
							</div>
						</div>
						<div class="flex items-center justify-between">
							<span class="text-gray-600">수동 매출:</span>
							<div class="flex items-center gap-2">
								{#if monthlyData.isManualRevenue}
									<span class="font-semibold text-orange-600">
										{(monthlyData.adjustedRevenue || 0).toLocaleString()}원
									</span>
									<span class="text-gray-500">
										({new Date(monthlyData.revenueModifiedAt).toLocaleDateString()})
									</span>
								{:else}
									<span class="text-gray-400">설정 안 됨</span>
								{/if}
							</div>
						</div>
						<div class="flex items-center justify-between border-t border-gray-300 pt-2">
							<span class="font-semibold text-gray-900">적용 매출:</span>
							<span class="text-base font-bold text-green-900">
								{(monthlyData.effectiveRevenue || 0).toLocaleString()}원
							</span>
						</div>
						<div class="flex justify-end border-t border-gray-300 pt-2">
							{#if isCurrentMonth}
								<button
									on:click={openGradeModal}
									class="rounded bg-blue-600 px-4 py-2 text-xs text-white transition hover:bg-blue-700"
								>
									등급별 조정
								</button>
							{:else}
								<span class="text-gray-400">현재월만 설정 가능</span>
							{/if}
						</div>
					</div>
				</div>

				<!-- 등록/승급 현황 -->
				<div class="rounded-lg border border-gray-300 bg-blue-50 px-4 py-3">
					<h5 class="mb-2 text-sm font-semibold text-gray-900">👥 등록/승급 현황</h5>
					<div class="flex items-center gap-4 text-xs">
						<div>
							<span class="text-gray-600">신규 등록:</span>
							<span class="ml-1 font-semibold"
								>{monthlyData.paymentTargets?.registrants?.length || 0}명</span
							>
						</div>
						<span class="text-gray-400">|</span>
						<div>
							<span class="text-gray-600">승급:</span>
							<span class="ml-1 font-semibold"
								>{monthlyData.paymentTargets?.promoted?.length || 0}명</span
							>
						</div>
						<span class="text-gray-400">|</span>
						<div>
							<span class="text-gray-600">추가지급 대상:</span>
							<span class="ml-1 font-semibold"
								>{monthlyData.paymentTargets?.additionalPayments?.length || 0}명</span
							>
						</div>
					</div>
				</div>

				<!-- 등급별 대상자 -->
				<div>
					<h5 class="mb-2 text-sm font-semibold text-gray-700">📊 등급별 지급 대상자</h5>
					<table class="min-w-full border border-gray-300">
						<thead class="bg-gray-100">
							<tr>
								<th class="border border-gray-300 px-2 py-1 text-xs">등급</th>
								<th class="border border-gray-300 px-2 py-1 text-xs">인원</th>
								<th class="border border-gray-300 px-2 py-1 text-xs">1회 금액</th>
								<th class="border border-gray-300 px-2 py-1 text-xs">10회 총액</th>
								<th class="border border-gray-300 px-2 py-1 text-xs">지급 기간</th>
							</tr>
						</thead>
						<tbody>
							{#each ['F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8'] as grade}
								{@const count = monthlyData.gradeDistribution?.[grade] || 0}
								{@const perAmount = monthlyData.gradePayments?.[grade] || 0}
								<tr class="hover:bg-gray-50">
									<td class="border border-gray-300 px-2 py-1 text-center">
										<GradeBadge {grade} size="sm" />
									</td>
									<td class="border border-gray-300 px-2 py-1 text-center text-xs font-semibold">
										{count}
									</td>
									<td class="border border-gray-300 px-2 py-1 text-right text-xs">
										{(Math.floor(perAmount / 100) * 100).toLocaleString()}
									</td>
									<td class="border border-gray-300 px-2 py-1 text-right text-xs text-blue-600">
										{(Math.floor((perAmount * 10 * count) / 100) * 100).toLocaleString()}
									</td>
									<td class="border border-gray-300 px-2 py-1 text-center text-xs">
										{getPaymentPeriod(selectedYear, selectedMonth)}
									</td>
								</tr>
							{/each}
					<!-- 총계 행 -->
					<tr class="bg-gray-50 font-semibold">
						<td class="border border-gray-300 px-2 py-1 text-center text-xs">
							총계
						</td>
						<td class="border border-gray-300 px-2 py-1 text-center text-xs">
							{totalCount}
						</td>
						<td class="border border-gray-300 px-2 py-1 text-right text-xs">
							{(Math.floor(totalPerAmount / 100) * 100).toLocaleString()}
						</td>
						<td class="border border-gray-300 px-2 py-1 text-right text-xs text-blue-600">
							{(Math.floor(totalAmount / 100) * 100).toLocaleString()}
						</td>
						<td class="border border-gray-300 px-2 py-1 text-center text-xs">
							-
						</td>
					</tr>
				</tbody>
			</table>
					<p class="mt-2 text-xs text-gray-600">💡 매출은 다음 달부터 10주간 지급됩니다</p>
				</div>
			</div>
		{:else if rangeData}
			<div class="space-y-4">
				<!-- 날짜 역전 경고 -->
				{#if isDateRangeInvalid}
					<div class="rounded-lg border border-red-200 bg-red-50 px-4 py-2">
						<p class="text-xs text-red-700">⚠️ 종료 기간이 시작 기간보다 앞설 수 없습니다. 시작 월만 표시됩니다.</p>
					</div>
				{/if}

				<!-- 기간 제목 -->
				<div class="border-b border-gray-300 pb-2">
					<h4 class="text-base font-semibold text-gray-900">기간 현황</h4>
				</div>

				<!-- 통합 매출 정보 -->
				<div class="rounded-lg border border-gray-300 bg-green-50 px-4 py-3">
					<div class="flex flex-col gap-2 text-xs">
						<div class="flex items-center justify-between">
							<span class="text-gray-600"> 총 기간:</span>
							<span class="font-semibold">
								({startYear}년 {startMonth}월 ~ {endYear}년 {endMonth}월) {rangeData.summary
									?.totalMonths || 0}개월</span
							>
						</div>
						<div class="flex items-center justify-between">
							<span class="text-gray-600">총 등록자:</span>
							<span class="font-semibold">{rangeData.summary?.totalRegistrants || 0}명</span>
						</div>
						<div class="flex items-center justify-between border-t border-gray-300 pt-2">
							<span class="font-semibold text-gray-900">총 매출:</span>
							<span class="text-base font-bold text-green-900">
								{(rangeData.summary?.totalRevenue || 0).toLocaleString()}원
							</span>
						</div>
						<div class="flex items-center justify-between">
							<span class="text-gray-600">월 평균:</span>
							<span class="font-semibold"
								>{(rangeData.summary?.avgRevenue || 0).toLocaleString()}원</span
							>
						</div>
					</div>
				</div>

				<!-- 월별 상세 -->
				<div>
					<h5 class="mb-2 text-sm font-semibold text-gray-700">📅 월별 상세 내역</h5>
					<div class="overflow-x-auto">
						<table class="min-w-full border border-gray-300">
							<thead class="bg-gray-100">
								<tr>
									<th
										class="border border-gray-300 px-2 py-1 text-xs"
										rowspan="2"
										style="min-width: 68px">월</th
									>
									<th
										class="border border-gray-300 px-2 py-1 text-xs"
										rowspan="2"
										style="min-width: 58px">등록자</th
									>
									<th
										class="border border-gray-300 px-2 py-1 text-xs"
										rowspan="2"
										style="min-width: 100px">매출</th
									>
									<th class="border border-gray-300 px-2 py-1 text-center text-xs" colspan="8"
										>등급 분포</th
									>
								</tr>
								<tr>
									<th class="border border-gray-300 px-2 py-1 text-xs" style="min-width: 40px"
										>F1</th
									>
									<th class="border border-gray-300 px-2 py-1 text-xs" style="min-width: 40px"
										>F2</th
									>
									<th class="border border-gray-300 px-2 py-1 text-xs" style="min-width: 40px"
										>F3</th
									>
									<th class="border border-gray-300 px-2 py-1 text-xs" style="min-width: 40px"
										>F4</th
									>
									<th class="border border-gray-300 px-2 py-1 text-xs" style="min-width: 40px"
										>F5</th
									>
									<th class="border border-gray-300 px-2 py-1 text-xs" style="min-width: 40px"
										>F6</th
									>
									<th class="border border-gray-300 px-2 py-1 text-xs" style="min-width: 40px"
										>F7</th
									>
									<th class="border border-gray-300 px-2 py-1 text-xs" style="min-width: 40px"
										>F8</th
									>
								</tr>
							</thead>
							<tbody>
								{#if rangeData.months && rangeData.months.length > 0}
									{#each rangeData.months as month}
										<tr class="hover:bg-gray-50">
											<td class="border border-gray-300 px-2 py-1 text-center text-xs">
												{month.monthKey}
											</td>
											<td class="border border-gray-300 px-2 py-1 text-center text-xs">
												{month.registrationCount || 0}
											</td>
											<td class="border border-gray-300 px-2 py-1 text-right text-xs">
												{(month.effectiveRevenue || 0).toLocaleString()}
											</td>
											{#each ['F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8'] as grade}
												{@const count = month.gradeDistribution?.[grade] || 0}
												<td class="border border-gray-300 px-2 py-1 text-center text-xs">
													{count}
												</td>
											{/each}
										</tr>
									{/each}
								{:else}
									<tr>
										<td
											colspan="11"
											class="border border-gray-300 px-2 py-8 text-center text-xs text-gray-500"
										>
											{startYear}년 {startMonth}월 ~ {endYear}년 {endMonth}월 기간에 매출 자료가
											없습니다.
										</td>
									</tr>
								{/if}
							</tbody>
						</table>
					</div>
				</div>
			</div>
		{:else}
			<div class="py-8 text-center text-gray-500">데이터가 없습니다</div>
		{/if}
	</div>
</div>

<!-- 등급별 조정 모달 -->
{#if showGradeModal && modalMonthKey}
	<GradePaymentAdjustModal
		isOpen={showGradeModal}
		monthKey={modalMonthKey}
		onClose={closeGradeModal}
		onSave={handleGradeAdjusted}
	/>
{/if}
