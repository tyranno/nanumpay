<script>
	import { onMount } from 'svelte';

	let currentMonth = '';
	let currentWeek = '';
	let weeklyPaymentInfo = null;
	let monthlyRevenues = [];
	let isLoading = true;

	onMount(async () => {
		await loadWeeklyPaymentInfo();
	});

	async function loadWeeklyPaymentInfo() {
		try {
			const response = await fetch('/api/admin/weekly-payment-info');
			if (response.ok) {
				const data = await response.json();

				// 현재 월, 주차 설정
				currentMonth = data.currentMonth || (new Date().getMonth() + 1);
				const today = new Date();
				currentWeek = `${Math.ceil(today.getDate() / 7)}주차`;

				// 이번 주 지급액 정보 설정
				weeklyPaymentInfo = data.weeklyPayment || null;

				// 월별 매출 데이터 설정 (지급 구성 표시용)
				monthlyRevenues = data.monthlyRevenues || [];
			} else {
				const errorData = await response.json();
				console.error('Weekly payment info API error:', errorData);
			}
		} catch (error) {
			console.error('Error loading weekly payment info:', error);
		} finally {
			isLoading = false;
		}
	}
</script>

{#if isLoading}
	<div class="bg-white shadow-sm rounded-lg p-6">
		<div class="flex justify-center items-center h-64">
			<div class="text-gray-500">로딩 중...</div>
		</div>
	</div>
{:else}
	<div class="bg-white shadow-sm rounded-lg overflow-hidden h-full">
		<div class="px-4 py-3 border-b border-gray-200 bg-gradient-to-r from-gray-50 to-gray-100">
			<h3 class="text-base sm:text-lg font-medium text-gray-900 h-6">용역비 지급명부</h3>
			<p class="mt-1 text-xs sm:text-sm text-gray-500">이번 주 지급 현황</p>
		</div>
		<div class="px-3 sm:px-4 py-3">
			<div class="space-y-3">
				<!-- 이번 주 정보 -->
				<div class="bg-blue-50 rounded-lg p-2 sm:p-3">
					<div class="flex justify-between items-center">
						<p class="text-xs sm:text-sm font-medium text-gray-700">이번 주</p>
						<p class="text-sm sm:text-base font-bold text-blue-900">{new Date().getFullYear()}년 {currentMonth}월 {currentWeek}</p>
					</div>
				</div>

				<!-- 이번 주 지급 구성 -->
				<div class="space-y-1">
					<p class="text-xs sm:text-sm font-medium text-gray-700 mb-2">이번 주 지급 구성</p>

					<div class="max-h-48 overflow-y-auto space-y-1">
						{#if monthlyRevenues}
							{@const currentDate = new Date()}
							{@const currentWeekNumber = Math.ceil(currentDate.getDate() / 7)}

							<!-- 최대 3개월 이전 매출까지 확인 (10주 = 약 2.5개월) -->
							{#each [1, 2, 3] as monthsBack}
								{@const sourceDate = new Date(currentDate.getFullYear(), currentDate.getMonth() - monthsBack, 1)}
								{@const sourceYear = sourceDate.getFullYear()}
								{@const sourceMonth = sourceDate.getMonth() + 1}

								<!-- 해당 매출이 지급되기 시작한 후 경과 주 수 계산 -->
								{@const weeksSincePaymentStart = monthsBack * 4 + currentWeekNumber - 4}
								{@const paymentRound = weeksSincePaymentStart > 0 && weeksSincePaymentStart <= 10 ? weeksSincePaymentStart : 0}

								<!-- 해당 월의 매출 데이터 찾기 -->
								{@const monthRevenue = monthlyRevenues.find(r => r.year === sourceYear && r.month === sourceMonth)}

								{#if paymentRound > 0 && paymentRound <= 10 && monthRevenue && monthRevenue.totalRevenue > 0}
									<div class="bg-gray-50 hover:bg-gray-100 rounded p-2 text-xs">
										<div class="flex justify-between items-center">
											<div class="flex items-center space-x-2">
												<span class="font-medium text-gray-700">{sourceYear}.{sourceMonth}월 매출</span>
												<span class="text-gray-500">({paymentRound}/10회차)</span>
											</div>
											<div class="text-right">
												<span class="font-semibold text-gray-900">
													{Math.round((monthRevenue.revenuePerInstallment || 0)/10000).toLocaleString()}만
												</span>
												<span class="text-gray-500 ml-1">(회당)</span>
											</div>
										</div>
									</div>
								{/if}
							{/each}

							{#if !monthlyRevenues.some(r => r.totalRevenue > 0)}
								<div class="text-xs text-gray-500 text-center py-2">
									아직 계산된 매출이 없습니다
								</div>
							{/if}
						{:else}
							<div class="text-xs text-gray-500 text-center py-2">
								매출 데이터를 불러오는 중...
							</div>
						{/if}
					</div>
				</div>

				<!-- 총 지급액 요약 -->
				<div class="border-t pt-3 bg-gradient-to-r from-blue-50 to-indigo-50 rounded-lg p-3">
					<div class="grid grid-cols-2 gap-2">
						<div>
							<p class="text-xs text-gray-600">총 지급</p>
							<p class="text-sm sm:text-base font-bold text-gray-900">
								{weeklyPaymentInfo ? Math.round(weeklyPaymentInfo.totalAmount/10000).toLocaleString() : '-'}만원
							</p>
						</div>
						<div>
							<p class="text-xs text-gray-600">실지급(세후)</p>
							<p class="text-sm sm:text-base font-bold text-green-900">
								{weeklyPaymentInfo ? Math.round(weeklyPaymentInfo.totalNet/10000).toLocaleString() : '-'}만원
							</p>
						</div>
					</div>
				</div>
			</div>
		</div>
	</div>
{/if}