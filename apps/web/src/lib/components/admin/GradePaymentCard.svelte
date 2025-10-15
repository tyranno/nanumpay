<script>
	import { onMount } from 'svelte';
	import { browser } from '$app/environment';
	import GradeBadge from '$lib/components/GradeBadge.svelte';
	import RevenueAdjustModal from './RevenueAdjustModal.svelte';

	let viewMode = 'single'; // 'single' | 'range'

	// 단일 월 선택
	let currentDate = new Date();
	let selectedMonthKey = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}`;

	// 기간 선택
	let startMonthKey = selectedMonthKey;
	let endMonthKey = selectedMonthKey;

	// 데이터
	let monthlyData = null; // 단일 월 데이터
	let rangeData = null; // 기간 데이터
	let isLoading = false;

	// 모달 상태
	let showRevenueModal = false;
	let modalMonthKey = null;

	onMount(() => {
		loadData();
	});

	$: if (browser && viewMode === 'single' && selectedMonthKey) {
		loadData();
	}

	$: if (browser && viewMode === 'range' && startMonthKey && endMonthKey) {
		loadRangeData();
	}

	async function loadData() {
		try {
			isLoading = true;
			const response = await fetch(`/api/admin/revenue/monthly?monthKey=${selectedMonthKey}`);
			if (response.ok) {
				monthlyData = await response.json();
			} else {
				console.error('Failed to load monthly data');
				monthlyData = null;
			}
		} catch (error) {
			console.error('Error loading monthly data:', error);
			monthlyData = null;
		} finally {
			isLoading = false;
		}
	}

	async function loadRangeData() {
		try {
			isLoading = true;
			const response = await fetch(`/api/admin/revenue/range?start=${startMonthKey}&end=${endMonthKey}`);
			if (response.ok) {
				rangeData = await response.json();
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

	function openRevenueModal() {
		modalMonthKey = selectedMonthKey;
		showRevenueModal = true;
	}

	function closeRevenueModal() {
		showRevenueModal = false;
		modalMonthKey = null;
	}

	async function handleRevenueAdjusted() {
		closeRevenueModal();
		await loadData();
	}

	// 월 선택 옵션 생성 (최근 12개월)
	function generateMonthOptions() {
		const options = [];
		const now = new Date();
		for (let i = 0; i < 12; i++) {
			const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
			const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
			options.push({
				value: monthKey,
				label: `${date.getFullYear()}년 ${date.getMonth() + 1}월`
			});
		}
		return options;
	}

	$: monthOptions = generateMonthOptions();

	// 지급 대상자 총계 계산
	function getTotalTargets(data) {
		if (!data || !data.paymentTargets) return 0;
		return (
			(data.paymentTargets.registrants?.length || 0) +
			(data.paymentTargets.promoted?.length || 0) +
			(data.paymentTargets.additionalPayments?.length || 0)
		);
	}

	// 등급별 총 지급 예정액 계산 (10회분)
	function getTotalPaymentForGrade(grade, count, monthlyData) {
		if (!monthlyData || !monthlyData.gradePayments) return 0;
		const perInstallment = monthlyData.gradePayments[grade] || 0;
		return perInstallment * 10 * count;
	}
</script>

<div class="bg-white shadow-sm rounded-lg overflow-hidden">
	<!-- 헤더 -->
	<div class="px-4 py-3 border-b border-gray-200 bg-gradient-to-r from-blue-50 to-blue-100">
		<div class="flex flex-col gap-3">
			<h3 class="text-lg font-semibold text-gray-900">📊 월별 매출 및 등급 통계</h3>

			<!-- 조회 옵션 -->
			<div class="flex flex-wrap items-center gap-3">
				<div class="flex items-center gap-2">
					<label class="text-sm text-gray-700">조회 기간:</label>
					<label class="flex items-center gap-1 cursor-pointer">
						<input type="radio" bind:group={viewMode} value="single" class="form-radio" />
						<span class="text-sm">단일 월</span>
					</label>
					<label class="flex items-center gap-1 cursor-pointer">
						<input type="radio" bind:group={viewMode} value="range" class="form-radio" />
						<span class="text-sm">기간</span>
					</label>
				</div>

				{#if viewMode === 'single'}
					<select bind:value={selectedMonthKey} class="text-sm border-gray-300 rounded-md">
						{#each monthOptions as option}
							<option value={option.value}>{option.label}</option>
						{/each}
					</select>
				{:else}
					<div class="flex items-center gap-2">
						<select bind:value={startMonthKey} class="text-sm border-gray-300 rounded-md">
							{#each monthOptions as option}
								<option value={option.value}>{option.label}</option>
							{/each}
						</select>
						<span class="text-gray-500">~</span>
						<select bind:value={endMonthKey} class="text-sm border-gray-300 rounded-md">
							{#each monthOptions as option}
								<option value={option.value}>{option.label}</option>
							{/each}
						</select>
					</div>
				{/if}
			</div>
		</div>
	</div>

	<!-- 본문 -->
	<div class="p-4">
		{#if isLoading}
			<div class="flex justify-center items-center h-64">
				<div class="text-gray-500">로딩 중...</div>
			</div>
		{:else if viewMode === 'single' && monthlyData}
			<!-- 단일 월 뷰 -->
			<div class="space-y-4">
				<div class="border-b border-gray-300 pb-2">
					<h4 class="text-base font-semibold text-gray-900">
						{selectedMonthKey.replace('-', '년 ')}월 현황
					</h4>
				</div>

				<!-- 매출 정보 -->
				<div class="bg-gray-50 p-4 rounded-lg">
					<h5 class="text-sm font-semibold text-gray-700 mb-2">📈 매출 정보</h5>
					<div class="space-y-1 text-sm">
						<div>
							<span class="text-gray-600">자동 매출:</span>
							<span class="font-semibold">{monthlyData.totalRevenue.toLocaleString()}원</span>
							<span class="text-gray-500 text-xs">(등록자 {monthlyData.registrationCount}명)</span>
						</div>
						<div>
							<span class="text-gray-600">수동 매출:</span>
							{#if monthlyData.isManualRevenue}
								<span class="font-semibold text-orange-600">
									{monthlyData.adjustedRevenue.toLocaleString()}원
								</span>
								<span class="text-xs text-gray-500">
									({new Date(monthlyData.revenueModifiedAt).toLocaleDateString()})
								</span>
							{:else}
								<span class="text-gray-400">설정 안 됨</span>
							{/if}
						</div>
						<div class="mt-2">
							<button
								onclick={openRevenueModal}
								class="px-3 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 transition"
							>
								수동 설정
							</button>
						</div>
					</div>
				</div>

				<!-- 지급 대상자 -->
				<div class="bg-gray-50 p-4 rounded-lg">
					<h5 class="text-sm font-semibold text-gray-700 mb-2">👥 지급 대상자</h5>
					<div class="grid grid-cols-2 gap-2 text-sm">
						<div>
							<span class="text-gray-600">등록자:</span>
							<span class="font-semibold">{monthlyData.paymentTargets?.registrants?.length || 0}명</span>
						</div>
						<div>
							<span class="text-gray-600">승급자:</span>
							<span class="font-semibold">{monthlyData.paymentTargets?.promoted?.length || 0}명</span>
						</div>
						<div>
							<span class="text-gray-600">추가지급:</span>
							<span class="font-semibold">{monthlyData.paymentTargets?.additionalPayments?.length || 0}명</span>
						</div>
						<div class="col-span-2 border-t border-gray-300 pt-1 mt-1">
							<span class="text-gray-600">총 대상자:</span>
							<span class="font-bold">{getTotalTargets(monthlyData)}명</span>
						</div>
					</div>
				</div>

				<!-- 등급별 분포 및 지급액 -->
				<div>
					<h5 class="text-sm font-semibold text-gray-700 mb-2">
						📊 등급별 분포 및 지급액 ({getTotalTargets(monthlyData)}명 기준)
					</h5>
					<div class="overflow-x-auto">
						<table class="w-full text-sm border-collapse">
							<thead>
								<tr class="bg-gray-100">
									<th class="border border-gray-300 px-3 py-2 text-left">등급</th>
									<th class="border border-gray-300 px-3 py-2 text-center">인원</th>
									<th class="border border-gray-300 px-3 py-2 text-right">1회 지급액</th>
									<th class="border border-gray-300 px-3 py-2 text-right">총 지급 예정액<br/><span class="text-xs text-gray-500">(10회분)</span></th>
								</tr>
							</thead>
							<tbody>
								{#each ['F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8'] as grade}
									{@const count = monthlyData.gradeDistribution?.[grade] || 0}
									{@const perInstallment = monthlyData.gradePayments?.[grade] || 0}
									{@const totalPayment = getTotalPaymentForGrade(grade, count, monthlyData)}
									{#if count > 0}
										<tr class="hover:bg-gray-50">
											<td class="border border-gray-300 px-3 py-2">
												<GradeBadge {grade} size="sm" />
											</td>
											<td class="border border-gray-300 px-3 py-2 text-center">{count}명</td>
											<td class="border border-gray-300 px-3 py-2 text-right">
												{perInstallment.toLocaleString()}원
											</td>
											<td class="border border-gray-300 px-3 py-2 text-right font-semibold text-blue-600">
												{totalPayment.toLocaleString()}원
											</td>
										</tr>
									{/if}
								{/each}
								<tr class="bg-gray-100 font-bold">
									<td class="border border-gray-300 px-3 py-2">합계</td>
									<td class="border border-gray-300 px-3 py-2 text-center">
										{getTotalTargets(monthlyData)}명
									</td>
									<td class="border border-gray-300 px-3 py-2"></td>
									<td class="border border-gray-300 px-3 py-2 text-right text-blue-900">
										{monthlyData.effectiveRevenue.toLocaleString()}원
									</td>
								</tr>
							</tbody>
						</table>
					</div>
				</div>

				<!-- 지급 상태 -->
				<div class="bg-gray-50 p-4 rounded-lg">
					<h5 class="text-sm font-semibold text-gray-700 mb-2">⚙️ 지급 상태</h5>
					<div class="space-y-1 text-sm">
						{#if monthlyData.paymentStatus}
							{#if monthlyData.paymentStatus.hasPaid}
								<div class="flex items-center gap-2">
									<span class="text-yellow-600">⚠️ 진행 중 (변경 주의)</span>
								</div>
							{:else}
								<div class="flex items-center gap-2">
									<span class="text-green-600">✅ 대기 중 (변경 가능)</span>
								</div>
							{/if}
							<div class="text-xs text-gray-600">
								• 총 계획: {monthlyData.paymentStatus.totalCount}개
								({getTotalTargets(monthlyData)}명 × 10회)
							</div>
							<div class="text-xs text-gray-600">
								• 완료: {monthlyData.paymentStatus.paidCount}개
							</div>
							<div class="text-xs text-gray-600">
								• 대기: {monthlyData.paymentStatus.totalCount - monthlyData.paymentStatus.paidCount}개
							</div>
						{/if}
					</div>
				</div>
			</div>
		{:else if viewMode === 'range' && rangeData}
			<!-- 기간 뷰 -->
			<div class="space-y-4">
				<div class="border-b border-gray-300 pb-2">
					<h4 class="text-base font-semibold text-gray-900">
						조회 기간: {startMonthKey.replace('-', '년 ')}월 ~ {endMonthKey.replace('-', '년 ')}월
					</h4>
				</div>

				<!-- 월별 누적 테이블 -->
				<div class="overflow-x-auto">
					<table class="w-full text-sm border-collapse">
						<thead>
							<tr class="bg-gray-100">
								<th class="border border-gray-300 px-3 py-2 text-left">월</th>
								<th class="border border-gray-300 px-3 py-2 text-right">매출액</th>
								<th class="border border-gray-300 px-3 py-2 text-center">등록자</th>
								<th class="border border-gray-300 px-3 py-2 text-center">대상자</th>
								<th class="border border-gray-300 px-3 py-2 text-center">지급 완료</th>
							</tr>
						</thead>
						<tbody>
							{#each rangeData.monthlyData as monthData}
								{@const [year, month] = monthData.monthKey.split('-')}
								{@const totalTargets = getTotalTargets(monthData)}
								<tr class="hover:bg-gray-50">
									<td class="border border-gray-300 px-3 py-2">
										{parseInt(month)}월
									</td>
									<td class="border border-gray-300 px-3 py-2 text-right">
										{monthData.effectiveRevenue.toLocaleString()}원
										{#if monthData.isManualRevenue}
											<span class="text-xs text-orange-600">(수동)</span>
										{/if}
									</td>
									<td class="border border-gray-300 px-3 py-2 text-center">
										{monthData.registrationCount}명
									</td>
									<td class="border border-gray-300 px-3 py-2 text-center">
										{totalTargets}명
									</td>
									<td class="border border-gray-300 px-3 py-2 text-center">
										{monthData.paymentStatus.paidCount}/{monthData.paymentStatus.totalCount}
									</td>
								</tr>
							{/each}
							{#if rangeData.summary}
								<tr class="bg-gray-100 font-bold">
									<td class="border border-gray-300 px-3 py-2">합계</td>
									<td class="border border-gray-300 px-3 py-2 text-right">
										{rangeData.summary.totalRevenue.toLocaleString()}원
									</td>
									<td class="border border-gray-300 px-3 py-2 text-center">
										{rangeData.summary.totalRegistrants}명
									</td>
									<td class="border border-gray-300 px-3 py-2 text-center" colspan="2">
										평균 월 매출: {rangeData.summary.avgRevenue.toLocaleString()}원
									</td>
								</tr>
							{/if}
						</tbody>
					</table>
				</div>
			</div>
		{:else}
			<div class="text-center text-gray-500 py-8">
				데이터가 없습니다
			</div>
		{/if}
	</div>
</div>

<!-- 매출 수동 설정 모달 -->
{#if showRevenueModal && modalMonthKey}
	<RevenueAdjustModal
		monthKey={modalMonthKey}
		currentData={monthlyData}
		on:close={closeRevenueModal}
		on:adjusted={handleRevenueAdjusted}
	/>
{/if}
