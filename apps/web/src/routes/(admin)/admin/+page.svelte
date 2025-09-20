<script>
	import { onMount } from 'svelte';
	import GradeBadge from '$lib/components/GradeBadge.svelte';
	import { getGradeInfo } from '$lib/utils/gradeColors.js';

	let totalRevenue = 0;
	let monthlyNewUsers = 0;
	let currentMonth = '';
	let currentWeek = '';
	let isLoading = true;
	let weeklyPaymentInfo = null;
	let isCalculating = false;
	let calculationMessage = '';

	let gradeRatios = {
		F1: { ratio: 24, count: 0, amount: 0, formula: '' },
		F2: { ratio: 19, count: 0, amount: 0, formula: '' },
		F3: { ratio: 14, count: 0, amount: 0, formula: '' },
		F4: { ratio: 9, count: 0, amount: 0, formula: '' },
		F5: { ratio: 5, count: 0, amount: 0, formula: '' },
		F6: { ratio: 3, count: 0, amount: 0, formula: '' },
		F7: { ratio: 2, count: 0, amount: 0, formula: '' },
		F8: { ratio: 1, count: 0, amount: 0, formula: '' }
	};

	onMount(async () => {
		try {
			// 대시보드 데이터 가져오기
			const response = await fetch('/api/admin/dashboard');
			if (response.ok) {
				const data = await response.json();

				// 이번 주 지급액 정보 설정
				if (data.stats?.weeklyPayment) {
					weeklyPaymentInfo = data.stats.weeklyPayment;
				}

				// 이번 달 신규 가입자 수와 총매출 설정
				if (data.stats?.monthlyNewUsers) {
					monthlyNewUsers = data.stats.monthlyNewUsers;
					totalRevenue = data.stats.monthlyRevenue || 0;
				}

				// 등급별 정보 업데이트
				if (data.stats?.gradeInfo) {
					Object.keys(gradeRatios).forEach(grade => {
						if (data.stats.gradeInfo[grade]) {
							gradeRatios[grade].count = data.stats.gradeInfo[grade].count || 0;
							gradeRatios[grade].amount = data.stats.gradeInfo[grade].amount || 0;
							gradeRatios[grade].ratio = data.stats.gradeInfo[grade].ratio || 0;

							// 산출식 생성
							const gradeIndex = parseInt(grade.substring(1));
							const nextGrade = `F${gradeIndex + 1}`;
							const currentCount = data.stats.gradeInfo[grade].count || 0;

							if (gradeIndex === 1) {
								const f2Count = data.stats.gradeInfo.F2?.count || 0;
								gradeRatios[grade].formula = `총매출×${gradeRatios[grade].ratio}%÷(${currentCount}+${f2Count})`;
							} else if (gradeIndex === 8) {
								gradeRatios[grade].formula = `총매출×${gradeRatios[grade].ratio}%÷${currentCount}`;
							} else {
								const nextCount = data.stats.gradeInfo[nextGrade]?.count || 0;
								gradeRatios[grade].formula = `총매출×${gradeRatios[grade].ratio}%÷(${currentCount}+${nextCount})`;
							}
						}
					});
				}

				// 현재 월 설정
				currentMonth = data.stats?.currentMonth || (new Date().getMonth() + 1);
			}

			const today = new Date();
			currentWeek = `${Math.ceil(today.getDate() / 7)}주차`;
		} catch (error) {
			console.error('Error loading dashboard data:', error);
		} finally {
			isLoading = false;
		}
	});

	// 월말 매출 계산 함수
	async function calculateMonthlyRevenue() {
		const confirmed = confirm(`${currentMonth}월 매출을 계산하고 지급 스케줄을 생성하시겠습니까?\n\n이 작업은 되돌릴 수 없습니다.`);
		if (!confirmed) return;

		isCalculating = true;
		calculationMessage = '';

		try {
			const currentYear = new Date().getFullYear();
			const response = await fetch('/api/admin/revenue/calculate', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({
					year: currentYear,
					month: currentMonth
				})
			});

			const result = await response.json();

			if (result.success) {
				calculationMessage = result.message;
				// 대시보드 데이터 새로고침
				setTimeout(() => {
					location.reload();
				}, 2000);
			} else {
				calculationMessage = `오류: ${result.message}`;
			}
		} catch (error) {
			console.error('Error calculating revenue:', error);
			calculationMessage = '매출 계산 중 오류가 발생했습니다.';
		} finally {
			isCalculating = false;
		}
	}
</script>

<svelte:head>
	<title>관리자 홈 - 나눔페이</title>
</svelte:head>


{#if isLoading}
	<div class="flex justify-center items-center h-64">
		<div class="text-gray-500">로딩 중...</div>
	</div>
{:else}
	<div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-6">
		<!-- 모바일용 헤더 요약 정보 -->
		<div class="mb-4 lg:hidden">
			<div class="bg-blue-600 text-white rounded-lg p-4">
				<h2 class="text-base font-semibold">{currentMonth}월 총매출</h2>
				<p class="text-2xl font-bold mt-1">{totalRevenue.toLocaleString()}원</p>
				<div class="grid grid-cols-2 gap-2 mt-3 text-sm">
					<div>
						<span class="opacity-90">신규가입:</span> {monthlyNewUsers}명
					</div>
					<div>
						<span class="opacity-90">회당:</span> {Math.round(totalRevenue / 10).toLocaleString()}원
					</div>
				</div>
			</div>
		</div>

		<div class="grid grid-cols-1 lg:grid-cols-2 gap-4 lg:gap-6">
			<!-- 왼쪽 카드: 등급별 지급 정보 -->
			<div class="bg-white shadow-sm rounded-lg overflow-hidden h-full">
				<div class="px-4 py-3 border-b border-gray-200 bg-gradient-to-r from-gray-50 to-gray-100">
					<div class="flex justify-between items-start">
						<div class="flex-1">
							<h3 class="text-base sm:text-lg font-medium text-gray-900 h-6">
								<span class="hidden lg:inline">등급별 지급 정보</span>
								<span class="lg:hidden">등급별 지급 정보</span>
							</h3>
							<p class="mt-1 text-xs sm:text-sm text-gray-500">
								<span class="hidden lg:inline">{currentMonth}월 총매출: {totalRevenue.toLocaleString()}원 | 신규: {monthlyNewUsers}명</span>
								<span class="lg:hidden">회당: {Math.round(totalRevenue / 10).toLocaleString()}원</span>
							</p>
						</div>
					</div>
					{#if calculationMessage}
						<div class="mt-2 p-2 bg-{calculationMessage.startsWith('오류') ? 'red' : 'green'}-50 text-{calculationMessage.startsWith('오류') ? 'red' : 'green'}-700 text-xs rounded">
							{calculationMessage}
						</div>
					{/if}
				</div>
				<div class="px-2 sm:px-4 py-3 overflow-x-auto">
					<table class="w-full text-sm">
						<thead>
							<tr class="border-b border-gray-200">
								<th class="px-2 sm:px-3 py-2 text-left text-xs font-medium text-gray-700">등급</th>
								<th class="px-2 sm:px-3 py-2 text-center text-xs font-medium text-gray-700">인원</th>
								<th class="px-2 sm:px-3 py-2 text-right text-xs font-medium text-gray-700">
									<span class="hidden sm:inline">1인당/회</span>
									<span class="sm:hidden">1인당</span>
								</th>
								<th class="px-2 sm:px-3 py-2 text-right text-xs font-medium text-gray-700">
									<span class="hidden sm:inline">전체/회</span>
									<span class="sm:hidden">전체</span>
								</th>
							</tr>
						</thead>
						<tbody>
							{#each Object.entries(gradeRatios) as [grade, data]}
								<tr class="border-b border-gray-100 hover:bg-gray-50 transition-colors">
									<td class="px-2 sm:px-3 py-2">
										<GradeBadge {grade} size="sm" />
									</td>
									<td class="px-2 sm:px-3 py-2 text-xs sm:text-sm text-center text-gray-900">{data.count}명</td>
									<td class="px-2 sm:px-3 py-2 text-xs sm:text-sm text-right text-gray-900 group">
										<div class="relative inline-block">
											<span class="cursor-help border-b border-dotted border-gray-400">
												<span class="hidden sm:inline">{data.amount.toLocaleString()}</span>
												<span class="sm:hidden">{Math.round(data.amount/1000).toLocaleString()}천</span>
											</span>
											{#if data.formula}
												<div class="absolute top-full right-0 mt-1 px-2 py-1 bg-gray-800 text-white text-xs rounded opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity whitespace-nowrap z-10 hidden sm:block">
													{data.formula}
													<div class="absolute bottom-full right-4 -mb-1">
														<div class="border-4 border-transparent border-b-gray-800"></div>
													</div>
												</div>
											{/if}
										</div>
									</td>
									<td class="px-2 sm:px-3 py-2 text-xs sm:text-sm text-right font-semibold text-blue-600">
										<span class="hidden sm:inline">{data.count > 0 ? (data.amount * data.count).toLocaleString() : '0'}원</span>
										<span class="sm:hidden">{data.count > 0 ? Math.round((data.amount * data.count)/10000).toLocaleString() : '0'}만</span>
									</td>
								</tr>
							{/each}
							<tr class="border-t-2 border-gray-300 bg-gray-50">
								<td class="px-2 sm:px-3 py-2 text-xs sm:text-sm font-semibold text-gray-900">합계</td>
								<td class="px-2 sm:px-3 py-2 text-xs sm:text-sm text-center font-semibold text-gray-900">
									{Object.values(gradeRatios).reduce((sum, data) => sum + data.count, 0)}명
								</td>
								<td class="px-2 sm:px-3 py-2"></td>
								<td class="px-2 sm:px-3 py-2 text-xs sm:text-sm text-right font-bold text-blue-900">
									<span class="hidden sm:inline">{Object.values(gradeRatios).reduce((sum, data) => sum + (data.count > 0 ? data.amount * data.count : 0), 0).toLocaleString()}원</span>
									<span class="sm:hidden">{Math.round(Object.values(gradeRatios).reduce((sum, data) => sum + (data.count > 0 ? data.amount * data.count : 0), 0)/10000).toLocaleString()}만</span>
								</td>
							</tr>
						</tbody>
					</table>
				</div>
			</div>

			<!-- 오른쪽 카드: 용역비 지급명부 -->
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
								<p class="text-sm sm:text-base font-bold text-blue-900">{new Date().getFullYear()}년 {currentMonth} {currentWeek}</p>
							</div>
						</div>

						<!-- 이번 주 지급 구성 -->
						<div class="space-y-1">
							<p class="text-xs sm:text-sm font-medium text-gray-700 mb-2">이번 주 지급 구성</p>

							<div class="max-h-48 overflow-y-auto space-y-1">
								{#each Array(3) as _, idx}
									{@const currentDate = new Date()}
									{@const currentWeekNumber = Math.ceil(currentDate.getDate() / 7)}
									{@const weeksAgo = idx * 4 + currentWeekNumber - 1}
									{@const monthsAgo = Math.floor(weeksAgo / 4)}
									{@const paymentRound = weeksAgo + 1}
									{@const sourceDate = new Date(currentDate.getFullYear(), currentDate.getMonth() - monthsAgo - 1, 1)}
									{@const sourceMonth = sourceDate.getMonth() + 1}
									{@const sourceYear = sourceDate.getFullYear()}

									{#if paymentRound <= 10}
										<div class="bg-gray-50 hover:bg-gray-100 rounded p-2 text-xs">
											<div class="flex justify-between items-center">
												<div class="flex items-center space-x-2">
													<span class="font-medium text-gray-700">{sourceYear}.{sourceMonth}월 매출</span>
													<span class="text-gray-500">({paymentRound}/10회차)</span>
												</div>
												<div class="text-right">
													<span class="font-semibold text-gray-900">
														{Math.round(totalRevenue / 10 / 10000).toLocaleString()}만
													</span>
													<span class="text-gray-500 ml-1">(회당)</span>
												</div>
											</div>
										</div>
									{/if}
								{/each}
							</div>

							<!-- 지급 계산 설명 -->
							<div class="bg-yellow-50 rounded p-2 text-xs">
								<div class="flex items-start space-x-1">
									<svg class="w-3 h-3 text-yellow-600 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
										<path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clip-rule="evenodd"/>
									</svg>
									<p class="text-gray-600">매출 발생 다음달부터 10주간 분할 지급</p>
								</div>
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
		</div>

		<!-- 빠른 메뉴 섹션 -->
		<div class="mt-4 lg:mt-6 bg-white shadow-sm rounded-lg overflow-hidden">
			<div class="px-4 py-3 border-b border-gray-200 bg-gradient-to-r from-gray-50 to-gray-100">
				<h3 class="text-base sm:text-lg font-medium text-gray-900">빠른 메뉴</h3>
			</div>
			<div class="p-3 sm:p-4">
				<div class="grid grid-cols-3 gap-2 sm:gap-3 lg:gap-4">
					<a href="/admin/payment" class="block group">
						<div class="bg-gradient-to-br from-blue-50 to-blue-100 hover:from-blue-100 hover:to-blue-200 rounded-lg p-3 sm:p-4 text-center transition-all shadow-sm hover:shadow-md">
							<div class="inline-flex items-center justify-center w-10 h-10 sm:w-12 sm:h-12 bg-white rounded-lg shadow-sm mb-2 group-hover:scale-110 transition-transform">
								<svg class="w-5 h-5 sm:w-6 sm:h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
									<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
								</svg>
							</div>
							<p class="text-xs sm:text-sm font-medium text-blue-900">용역비 지급명부</p>
						</div>
					</a>
					<a href="/admin/members" class="block group">
						<div class="bg-gradient-to-br from-emerald-50 to-emerald-100 hover:from-emerald-100 hover:to-emerald-200 rounded-lg p-3 sm:p-4 text-center transition-all shadow-sm hover:shadow-md">
							<div class="inline-flex items-center justify-center w-10 h-10 sm:w-12 sm:h-12 bg-white rounded-lg shadow-sm mb-2 group-hover:scale-110 transition-transform">
								<svg class="w-5 h-5 sm:w-6 sm:h-6 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
									<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"></path>
								</svg>
							</div>
							<p class="text-xs sm:text-sm font-medium text-emerald-900">용역자 관리명부</p>
						</div>
					</a>
					<a href="/admin/organization" class="block group">
						<div class="bg-gradient-to-br from-purple-50 to-purple-100 hover:from-purple-100 hover:to-purple-200 rounded-lg p-3 sm:p-4 text-center transition-all shadow-sm hover:shadow-md">
							<div class="inline-flex items-center justify-center w-10 h-10 sm:w-12 sm:h-12 bg-white rounded-lg shadow-sm mb-2 group-hover:scale-110 transition-transform">
								<svg class="w-5 h-5 sm:w-6 sm:h-6 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
									<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"></path>
								</svg>
							</div>
							<p class="text-xs sm:text-sm font-medium text-purple-900">용역자 산하정보</p>
						</div>
					</a>
				</div>
			</div>
		</div>
	</div>
{/if}