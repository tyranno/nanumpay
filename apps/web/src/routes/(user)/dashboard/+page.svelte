<script>
	import { onMount } from 'svelte';

	let userInfo = $state(null);
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
		endMonth: currentMonth,
		grade: ''
	});

	// 페이지네이션 상태
	let currentPage = $state(1);
	let itemsPerPage = $state(10);
	let totalPages = $state(1);
	let itemsPerPageOptions = [10, 20, 50, 100];

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
				paymentSummary = data.summary;
				allPayments = data.payments;
				console.log('✅ allPayments 설정됨:', allPayments.length, '건');
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
		const grade = filters.grade;

		// 필터링 (API에서 이미 주별로 그룹화되어 옴)
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

			// 등급 필터 (grades 배열에 포함 여부 확인)
			if (grade && !payment.grades.includes(grade)) {
				return false;
			}

			return true;
		});

		filteredPayments = filtered;
		currentPage = 1;
	});

	// 페이지네이션 업데이트 (필터나 페이지가 변경될 때마다)
	$effect(() => {
		const total = Math.ceil(filteredPayments.length / itemsPerPage);
		const startIndex = (currentPage - 1) * itemsPerPage;
		const endIndex = startIndex + itemsPerPage;
		const displayed = filteredPayments.slice(startIndex, endIndex);

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
		filters.grade = '';
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

	// 등급 목록
	const grades = ['F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8'];
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
				<div class="space-y-1">
					<div class="flex justify-between">
						<span class="text-sm text-indigo-700">이름</span>
						<span class="text-sm font-medium text-indigo-900">{userInfo?.name || '-'}</span>
					</div>
					<div class="flex justify-between">
						<span class="text-sm text-indigo-700">아이디</span>
						<span class="text-sm font-medium text-indigo-900">{userInfo?.loginId || '-'}</span>
					</div>
					<div class="flex items-center justify-between">
						<span class="text-sm text-indigo-700">현재 등급</span>
						<div class="flex items-center gap-2">
							{#if userInfo?.grade}
								<a href="/dashboard/network" class="cursor-pointer transition-transform hover:scale-110">
									<img
										src="/icons/{userInfo.grade}.svg"
										alt={userInfo.grade}
										class="h-8 w-8"
										title="{userInfo.grade} 등급 - 클릭하여 산하 정보 보기"
									/>
								</a>
							{:else}
								<span class="text-lg font-bold text-indigo-900">-</span>
							{/if}
						</div>
					</div>
					{#if userInfo?.grade && ['F3', 'F4', 'F5', 'F6', 'F7', 'F8'].includes(userInfo.grade)}
						<div class="flex justify-between">
							<span class="text-sm text-indigo-700">보험</span>
							<span
								class="text-sm font-medium {userInfo?.insuranceActive
									? 'text-green-600'
									: 'text-red-600'}"
							>
								{userInfo?.insuranceActive ? '가입' : '미가입'}
							</span>
						</div>
					{/if}
				</div>
			</div>

			<!-- 용역비 요약 카드 -->
			<div class="rounded-lg bg-gradient-to-br from-green-50 to-emerald-100 p-3 shadow-md">
				<div class="mb-2 flex items-center gap-2">
					<img src="/icons/money.svg" alt="용역비" class="h-5 w-5" />
					<h3 class="text-base font-bold text-emerald-900">용역비 요약</h3>
				</div>
				<div class="space-y-1">
					<div class="flex justify-between">
						<span class="text-sm text-emerald-700">이번주 금액</span>
						<span class="text-lg font-bold text-emerald-900"
							>{formatAmount(paymentSummary?.thisWeekAmount)}</span
						>
					</div>
					<div class="flex justify-between">
						<span class="text-sm text-emerald-700">이번달 금액</span>
						<span class="text-sm font-medium text-emerald-900"
							>{formatAmount(paymentSummary?.thisMonthAmount)}</span
						>
					</div>
					<div class="flex justify-between border-t border-emerald-200 pt-2">
						<span class="text-sm text-emerald-700">지급 예정액</span>
						<span class="text-sm font-medium text-emerald-900"
							>{formatAmount(paymentSummary?.upcomingAmount)}</span
						>
					</div>
				</div>
			</div>
		</div>

		<!-- 용역비 지급 내역 테이블 -->
		<div class="overflow-hidden rounded-lg bg-white shadow">
			<div class="border-b border-gray-200 bg-gray-50 px-4 py-5">
				<div class="flex items-center gap-2">
					<img src="/icons/receipt.svg" alt="용역비" class="h-5 w-5" />
					<h3 class="text-base font-bold text-gray-900">용역비 지급 내역</h3>
				</div>
				<p class="mt-1 text-sm text-gray-600">주차별 용역비 지급 내역입니다</p>
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

					<!-- 등급 -->
					<div class="w-32">
						<label class="mb-1 block text-xs font-medium text-gray-700">등급</label>
						<select
							bind:value={filters.grade}
							class="w-full rounded-md border border-gray-300 px-2 py-1 text-sm focus:border-blue-500 focus:outline-none"
						>
							<option value="">전체</option>
							{#each grades as grade}
								<option value={grade}>{grade}</option>
							{/each}
						</select>
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

			</div>

			<!-- 총 건수 및 페이지당 보기 갯수 -->
			<div class="flex items-center justify-between bg-white px-4 py-2">
				<div class="text-sm text-gray-600">
					총 <span class="font-semibold text-gray-900">{filteredPayments.length}</span>건
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
							<th class="table-header">지급일</th>
							<th class="table-header">등급</th>
							<th class="table-header">지급액</th>
							<th class="table-header">세금</th>
							<th class="table-header">실수령액</th>
						</tr>
					</thead>
					<tbody class="divide-y divide-gray-200 bg-white">
						{#if displayedPayments.length === 0}
							<tr>
								<td colspan="5" class="px-6 py-8 text-center text-sm text-gray-500">
									지급 내역이 없습니다
								</td>
							</tr>
						{:else}
							{#each displayedPayments as payment}
								<tr class="hover:bg-gray-50">
									<td class="table-cell">{formatDate(payment.weekDate)}</td>
									<td class="table-cell">
										<div class="flex items-center justify-center gap-1">
											{#each payment.grades as grade}
												<img
													src="/icons/{grade}.svg"
													alt={grade}
													class="h-5 w-5"
													title="{grade} 등급"
												/>
											{/each}
										</div>
									</td>
									<td class="table-cell text-right">{formatAmount(payment.amount)}</td>
									<td class="table-cell text-right">{formatAmount(payment.tax)}</td>
									<td class="table-cell text-right font-medium"
										>{formatAmount(payment.netAmount)}</td
									>
								</tr>
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
