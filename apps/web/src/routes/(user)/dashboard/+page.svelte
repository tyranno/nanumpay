<script>
	import { onMount } from 'svelte';
	import GradeBadge from '$lib/components/GradeBadge.svelte';

	let userInfo = $state(null);
	let allRegistrations = $state([]); // ⭐ v8.0: 모든 등록 정보
	let paymentSummary = $state(null);
	let allPayments = $state([]); // 전체 데이터
	let filteredPayments = $state([]); // 필터링된 데이터
	let displayedPayments = $state([]); // 현재 페이지에 표시할 데이터
	let isLoading = $state(true);
	let error = $state(null);

	// 현재 월 계산 (YYYY-MM 형식)
	const currentMonth = (() => {
		const now = new Date();
		return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
	})();

	// 필터 상태
	let filters = $state({
		startMonth: currentMonth,
		endMonth: currentMonth
	});

	// 페이지네이션 상태
	let currentPage = $state(1);
	let itemsPerPage = $state(5); // ⭐ 기본값 5개
	let totalPages = $state(1);
	let itemsPerPageOptions = [5, 10, 20, 50];

	onMount(async () => {
		try {
			const response = await fetch('/api/user/payments');
			const data = await response.json();

			console.log('🔥 API 응답:', data);

			if (!response.ok) {
				throw new Error(data.message || '용역비 정보를 불러오는데 실패했습니다.');
			}

			if (data.success) {
				userInfo = data.user;
				allRegistrations = data.allRegistrations || []; // ⭐ v8.0
				paymentSummary = data.summary;
				allPayments = data.payments;
				console.log('✅ allPayments 설정됨:', allPayments.length, '건');
				console.log('✅ allRegistrations 설정됨:', allRegistrations.length, '건');
				console.log('📅 첫 번째 데이터:', allPayments[0]);
			} else {
				throw new Error('용역비 정보가 없습니다.');
			}
		} catch (err) {
			console.error('❌ Error loading payments:', err);
			error = err.message;
		} finally {
			isLoading = false;
		}
	});

	// 필터가 변경될 때마다 자동으로 적용
	$effect(() => {
		// 필터만 추적
		const startMonth = filters.startMonth;
		const endMonth = filters.endMonth;

		console.log('🔍 필터 적용:', { startMonth, endMonth, allPaymentsCount: allPayments.length });

		// ⭐ v8.0: 개별 행 필터링
		const filtered = allPayments.filter((payment) => {
			const paymentDate = new Date(payment.weekDate);
			const paymentMonth = `${paymentDate.getFullYear()}-${String(paymentDate.getMonth() + 1).padStart(2, '0')}`;

			// 시작 월 필터 (YYYY-MM 형식) - 이상(>=)
			if (startMonth && paymentMonth < startMonth) {
				return false;
			}

			// 종료 월 필터 (YYYY-MM 형식) - 이하(<=)
			if (endMonth && paymentMonth > endMonth) {
				return false;
			}

			return true;
		});

		console.log('✅ 필터링 결과:', filtered.length, '건');
		filteredPayments = filtered;
		currentPage = 1;
	});

	// ⭐ v8.0: 주차별로 그룹화 (날짜 기준)
	let groupedPayments = $state([]);
	let periodSummary = $state({ totalAmount: 0, totalTax: 0, totalNet: 0 }); // ⭐ 기간 총액

	$effect(() => {
		// 주차별 그룹화 + 사용자별 등급 집계
		const grouped = new Map();
		let periodTotal = 0;
		let periodTax = 0;
		let periodNet = 0;

		for (const payment of filteredPayments) {
			const weekKey = payment.weekDate;

			if (!grouped.has(weekKey)) {
				grouped.set(weekKey, {
					weekDate: payment.weekDate,
					weekNumber: payment.weekNumber,
					users: [],
					userGrades: new Map(), // ⭐ 사용자별 등급 집계 (userId_regNum -> gradeCount)
					totalAmount: 0,
					totalTax: 0,
					totalNet: 0
				});
			}

			const group = grouped.get(weekKey);
			group.users.push(payment);

			// ⭐ 사용자별 등급 집계
			const userKey = `${payment.userId}_${payment.registrationNumber}`;
			if (!group.userGrades.has(userKey)) {
				group.userGrades.set(userKey, {});
			}
			const gradeCount = group.userGrades.get(userKey);
			gradeCount[payment.grade] = (gradeCount[payment.grade] || 0) + 1;

			group.totalAmount += payment.amount || 0;
			group.totalTax += payment.tax || 0;
			group.totalNet += payment.netAmount || 0;

			periodTotal += payment.amount || 0;
			periodTax += payment.tax || 0;
			periodNet += payment.netAmount || 0;
		}

		// ⭐ 각 사용자에게 등급 정보 추가
		for (const group of grouped.values()) {
			group.users.sort((a, b) => a.registrationNumber - b.registrationNumber);

			// 각 payment에 해당 사용자의 등급 집계 정보 추가
			for (const user of group.users) {
				const userKey = `${user.userId}_${user.registrationNumber}`;
				user.gradeCount = group.userGrades.get(userKey);
			}
		}

		groupedPayments = Array.from(grouped.values());
		periodSummary = { totalAmount: periodTotal, totalTax: periodTax, totalNet: periodNet };
	});

	// 페이지네이션 업데이트 (필터나 페이지가 변경될 때마다)
	$effect(() => {
		const total = Math.ceil(groupedPayments.length / itemsPerPage);
		const startIndex = (currentPage - 1) * itemsPerPage;
		const endIndex = startIndex + itemsPerPage;
		const displayed = groupedPayments.slice(startIndex, endIndex);

		totalPages = total;
		displayedPayments = displayed;
	});

	// 페이지 변경
	function goToPage(page) {
		if (page < 1 || page > totalPages) return;
		currentPage = page;
	}

	// 필터 초기화
	function resetFilters() {
		filters.startMonth = currentMonth;
		filters.endMonth = currentMonth;
	}

	// 날짜 포맷팅
	function formatDate(dateStr) {
		if (!dateStr) return '-';
		const date = new Date(dateStr);
		return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
	}

	// 금액 포맷팅
	function formatAmount(amount) {
		if (!amount && amount !== 0) return '-';
		return amount.toLocaleString() + '원';
	}

	// ⭐ 지급액 내역 계산 (50:25:25)
	function calculateBreakdown(amount) {
		if (!amount) return { 영업: 0, 홍보: 0, 판촉: 0 };
		return {
			영업: Math.round(amount * 0.5),
			홍보: Math.round(amount * 0.25),
			판촉: Math.round(amount * 0.25)
		};
	}

</script>

<svelte:head>
	<title>내 용역비 - 나눔페이</title>
</svelte:head>

{#if isLoading}
	<div class="flex h-screen items-center justify-center">
		<div class="text-gray-500">로딩 중...</div>
	</div>
{:else if error}
	<div class="flex h-screen items-center justify-center">
		<div class="text-center">
			<p class="mb-2 text-red-500">{error}</p>
		</div>
	</div>
{:else}
	<div class="container">
		<!-- 상단 요약 카드 -->
		<div class="mb-4 grid grid-cols-1 gap-3 md:grid-cols-2">
			<!-- 사용자 정보 카드 -->
			<div class="rounded-lg bg-gradient-to-br from-blue-50 to-indigo-100 p-3 shadow-md">
				<div class="mb-2 flex items-center justify-between">
					<div class="flex items-center gap-2">
						<img src="/icons/user.svg" alt="사용자" class="h-5 w-5 text-indigo-700" />
						<h3 class="text-base font-bold text-indigo-900">내 정보</h3>
					</div>
					<a
						href="/dashboard/profile"
						class="text-xs text-indigo-600 underline hover:text-indigo-800"
					>
						상세보기
					</a>
				</div>

				<!-- ⭐ v8.0: 여러 등록 정보 표시 -->
				{#if allRegistrations.length > 0}
					<div class="mb-2 rounded border border-indigo-200 bg-indigo-50 p-2">
						<div class="mb-1 border-b border-indigo-200 pb-1 text-xs font-semibold text-indigo-700">
							등록 계약 목록{#if userInfo?.canViewSubordinates} (클릭 시 산하정보 보기){/if}
						</div>
						<!-- ⭐ 스크롤 영역: 최대 3개 표시 -->
						<div class="max-h-[72px] overflow-y-auto">
							{#each allRegistrations as reg, index}
								{#if userInfo?.canViewSubordinates}
									<!-- ⭐ 권한 있음: 전체 리스트 항목 클릭 시 산하정보 이동 -->
									<a
										href="/dashboard/network?userId={reg.id}"
										class="flex items-center justify-between border-b border-indigo-200 py-1 text-indigo-600 last:border-b-0 hover:bg-indigo-100 transition-colors cursor-pointer rounded px-1"
										title="{reg.grade} 등급 - 산하정보 보기"
									>
										<span class="text-xs">{reg.name} ({formatDate(reg.createdAt)})</span>
										<img src="/icons/{reg.grade}.svg" alt={reg.grade} class="h-5 w-5" />
									</a>
								{:else}
									<!-- ⭐ 권한 없음: 클릭 불가능한 일반 목록 -->
									<div class="flex items-center justify-between border-b border-indigo-200 py-1 text-indigo-600 last:border-b-0">
										<span class="text-xs">{reg.name} ({formatDate(reg.createdAt)})</span>
										<img src="/icons/{reg.grade}.svg" alt={reg.grade} class="h-5 w-5" />
									</div>
								{/if}
							{/each}
						</div>
					</div>
				{/if}
			</div>

			<!-- 용역비 요약 카드 -->
			<div class="rounded-lg bg-gradient-to-br from-green-50 to-emerald-100 p-3 shadow-md">
				<div class="mb-2 flex items-center gap-2">
					<img src="/icons/money.svg" alt="용역비" class="h-5 w-5" />
					<h3 class="text-base font-bold text-emerald-900">용역비 요약</h3>
				</div>
				<table class="w-full text-xs">
					<thead>
						<tr class="border-b border-emerald-300">
							<th class="py-1 text-left font-semibold text-emerald-700">구분</th>
							<th class="py-1 text-right font-semibold text-emerald-700">총액</th>
							<th class="py-1 text-right font-semibold text-emerald-700">세금</th>
							<th class="py-1 text-right font-semibold text-emerald-700">실수령</th>
						</tr>
					</thead>
					<tbody>
						<tr class="border-b border-emerald-200">
							<td class="py-1 font-semibold text-emerald-700">이번주</td>
							<td class="py-1 text-right text-emerald-600">{formatAmount(paymentSummary?.thisWeek?.amount)}</td>
							<td class="py-1 text-right text-emerald-600">{formatAmount(paymentSummary?.thisWeek?.tax)}</td>
							<td class="py-1 text-right font-bold text-emerald-900">{formatAmount(paymentSummary?.thisWeek?.net)}</td>
						</tr>
						<tr class="border-b border-emerald-200">
							<td class="py-1 font-semibold text-emerald-700">이번달</td>
							<td class="py-1 text-right text-emerald-600">{formatAmount(paymentSummary?.thisMonth?.amount)}</td>
							<td class="py-1 text-right text-emerald-600">{formatAmount(paymentSummary?.thisMonth?.tax)}</td>
							<td class="py-1 text-right font-bold text-emerald-900">{formatAmount(paymentSummary?.thisMonth?.net)}</td>
						</tr>
						<tr>
							<td class="py-1 font-semibold text-emerald-700">수령예정</td>
							<td class="py-1 text-right text-emerald-600">{formatAmount(paymentSummary?.upcoming?.amount)}</td>
							<td class="py-1 text-right text-emerald-600">{formatAmount(paymentSummary?.upcoming?.tax)}</td>
							<td class="py-1 text-right font-bold text-emerald-900">{formatAmount(paymentSummary?.upcoming?.net)}</td>
						</tr>
					</tbody>
				</table>
			</div>
		</div>

		<!-- 용역비 수령 내역 테이블 -->
		<div class="overflow-hidden rounded-lg bg-white shadow">
			<div class="border-b border-gray-200 bg-gray-50 px-4 py-5">
				<div class="flex items-center gap-2">
					<img src="/icons/receipt.svg" alt="용역비" class="h-5 w-5" />
					<h3 class="text-base font-bold text-gray-900">용역비 수령 내역</h3>
				</div>
				<p class="mt-1 text-sm text-gray-600">주차별 용역비 수령 내역입니다</p>
			</div>

			<!-- 검색 필터 -->
			<div class="border-b border-gray-200 bg-white px-4 py-4">
				<div class="flex items-end gap-3">
					<!-- 시작 월 -->
					<div class="w-40">
						<label class="mb-1 block text-xs font-medium text-gray-700">시작</label>
						<input
							type="month"
							bind:value={filters.startMonth}
							class="w-full rounded-md border border-gray-300 px-2 py-1 text-sm focus:border-blue-500 focus:outline-none"
						/>
					</div>

					<!-- 종료 월 -->
					<div class="w-40">
						<label class="mb-1 block text-xs font-medium text-gray-700">종료</label>
						<input
							type="month"
							bind:value={filters.endMonth}
							class="w-full rounded-md border border-gray-300 px-2 py-1 text-sm focus:border-blue-500 focus:outline-none"
						/>
					</div>

					<!-- 초기화 아이콘 -->
					<button
						onclick={resetFilters}
						class="rounded-md border border-gray-300 bg-white p-1 text-gray-500 transition-colors hover:bg-gray-50 hover:text-gray-700"
						title="초기화"
					>
						<svg
							xmlns="http://www.w3.org/2000/svg"
							fill="none"
							viewBox="0 0 24 24"
							stroke="currentColor"
							class="h-4 w-4"
						>
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								stroke-width="2"
								d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
							/>
						</svg>
					</button>
				</div>

				<!-- ⭐ 기간 총액 정보 -->
				<div class="mt-4 rounded-md bg-blue-50 p-3">
					<div class="flex items-center justify-between text-sm">
						<span class="font-semibold text-blue-900">선택 기간 총액:</span>
						<div class="flex gap-6">
							<div class="text-right">
								<div class="text-xs text-blue-700">수령총액</div>
								<div class="font-bold text-blue-900">{formatAmount(periodSummary.totalAmount)}</div>
							</div>
							<div class="text-right">
								<div class="text-xs text-blue-700">세금</div>
								<div class="font-medium text-blue-900">{formatAmount(periodSummary.totalTax)}</div>
							</div>
							<div class="text-right">
								<div class="text-xs text-blue-700">실수령액</div>
								<div class="font-bold text-blue-900">{formatAmount(periodSummary.totalNet)}</div>
							</div>
						</div>
					</div>
				</div>

			</div>

			<!-- 총 건수 및 페이지당 보기 갯수 -->
			<div class="flex items-center justify-between bg-white px-4 py-2">
				<div class="text-sm text-gray-600">
					총 <span class="font-semibold text-gray-900">{groupedPayments.length}</span>주차
				</div>
				<div class="flex items-center gap-2">
					<label class="text-xs font-medium text-gray-700">페이지당:</label>
					<select
						bind:value={itemsPerPage}
						class="w-24 rounded-md border border-gray-300 px-3 py-1 text-sm focus:border-blue-500 focus:outline-none"
					>
						{#each itemsPerPageOptions as option}
							<option value={option}>{option}개</option>
						{/each}
					</select>
				</div>
			</div>

			<div class="overflow-x-auto">
				<table class="min-w-full divide-y divide-gray-200">
					<thead class="bg-gray-50">
						<tr>
							<th class="table-header">수령일</th>
							<th class="table-header">이름</th>
							<th class="table-header">등급</th>
							<th class="table-header">수령총액</th>
							<th class="table-header">수령액(영업/홍보/판촉)</th>
							<th class="table-header">세금</th>
							<th class="table-header">실수령액</th>
						</tr>
					</thead>
					<tbody class="divide-y divide-gray-200 bg-white">
						{#if displayedPayments.length === 0}
							<tr>
								<td colspan="7" class="px-6 py-8 text-center text-sm text-gray-500">
									지급 내역이 없습니다
								</td>
							</tr>
						{:else}
							{#each displayedPayments as weekGroup}
								{@const userKeysShown = new Set()} <!-- ⭐ 이미 등급 표시한 사용자 추적 -->
								{#each weekGroup.users as user, index}
									{@const breakdown = calculateBreakdown(user.amount)}
									{@const userKey = `${user.userId}_${user.registrationNumber}`}
									{@const isFirstOccurrence = !userKeysShown.has(userKey)}
									{@const _ = isFirstOccurrence ? userKeysShown.add(userKey) : null}

									<tr class="hover:bg-gray-50">
										{#if index === 0}
											<!-- 첫 번째 행만 지급일 표시 (rowspan) -->
											<td class="table-cell" rowspan={weekGroup.users.length}>
												{formatDate(weekGroup.weekDate)}
											</td>
										{/if}
										<td class="table-cell">{user.userName || '-'}</td>
										<!-- ⭐ 등급: 같은 사용자의 첫 번째 행에만 표시 (중앙정렬) -->
										<td class="table-cell">
											{#if isFirstOccurrence}
												<div class="flex flex-wrap items-center justify-center gap-1">
													{#each Object.entries(user.gradeCount).sort((a, b) => b[0].localeCompare(a[0])) as [grade, count]}
														<div class="flex items-center gap-0.5">
															<GradeBadge {grade} size="sm" />
															{#if count > 1}
																<span class="text-xs font-medium text-gray-600">x{count}</span>
															{/if}
														</div>
													{/each}
												</div>
											{/if}
										</td>
										{#if index === 0}
											<!-- ⭐ 수령총액: 첫 번째 행만 표시 (rowspan) -->
											<td class="table-cell text-right font-bold" rowspan={weekGroup.users.length}>
												{formatAmount(weekGroup.totalAmount)}
											</td>
										{/if}
										<!-- ⭐ 지급액: 2줄 (총합 + 내역) -->
										<td class="table-cell text-right">
											<div class="font-medium">{formatAmount(user.amount)}</div>
											<div class="text-xs text-gray-600">
												({breakdown.영업.toLocaleString()}/{breakdown.홍보.toLocaleString()}/{breakdown.판촉.toLocaleString()})
											</div>
										</td>
										<!-- ⭐ 세금, 실수령액 -->
										<td class="table-cell text-right">{formatAmount(user.tax)}</td>
										<td class="table-cell text-right font-medium">{formatAmount(user.netAmount)}</td>
									</tr>
								{/each}
							{/each}
						{/if}
					</tbody>
				</table>
			</div>

			<!-- 페이지네이션 -->
			{#if totalPages > 1}
				<div class="border-t border-gray-200 bg-gray-50 px-4 py-3">
					<div class="flex items-center justify-center gap-1">
						<button
							onclick={() => goToPage(currentPage - 1)}
							disabled={currentPage === 1}
							class="rounded-md border border-gray-300 bg-white px-3 py-1 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
						>
							이전
						</button>
						{#each Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
							const startPage = Math.max(1, Math.min(currentPage - 2, totalPages - 4));
							return startPage + i;
						}) as page}
							<button
								onclick={() => goToPage(page)}
								class="rounded-md border px-3 py-1 text-sm font-medium transition-colors {currentPage === page
									? 'border-blue-500 bg-blue-500 text-white'
									: 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'}"
							>
								{page}
							</button>
						{/each}
						<button
							onclick={() => goToPage(currentPage + 1)}
							disabled={currentPage === totalPages}
							class="rounded-md border border-gray-300 bg-white px-3 py-1 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
						>
							다음
						</button>
					</div>
				</div>
			{/if}
		</div>
	</div>
{/if}

<style>
	@reference "$lib/../app.css";

	.container {
		padding: 20px;
		max-width: 1400px;
		margin: 0 auto;
		background: white;
	}

	.title {
		font-size: 20px;
		font-weight: 700;
		text-align: center;
		margin-bottom: 20px;
		color: #1f2937;
	}

	.table-header {
		@apply border border-gray-300 px-2 py-1.5 text-center text-sm font-bold uppercase tracking-wider text-gray-900;
		min-width: 80px;
	}

	.table-cell {
		@apply whitespace-nowrap border border-gray-300 px-2 py-1.5 text-center text-sm text-gray-900;
		min-width: 80px;
	}

	/* 모바일 반응형 */
	@media (max-width: 480px) {
		.container {
			padding: 10px;
		}

		.title {
			font-size: 18px;
			margin-bottom: 15px;
		}

		.table-header,
		.table-cell {
			@apply px-2 py-2 text-xs;
		}
	}
</style>
