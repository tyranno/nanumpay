<script>
	import { onMount } from 'svelte';
	import GradeBadge from '$lib/components/GradeBadge.svelte';
	import { getGradeInfo } from '$lib/utils/gradeColors.js';

	let totalRevenue = 0;
	let currentMonth = '';
	let currentWeek = '';
	let paymentSchedule = [];
	let isLoading = true;

	const gradeRatios = {
		F1: { ratio: 24, count: 255, amount: 0 },
		F2: { ratio: 19, count: 120, amount: 0 },
		F3: { ratio: 14, count: 60, amount: 0 },
		F4: { ratio: 9, count: 30, amount: 0 },
		F5: { ratio: 5, count: 10, amount: 0 },
		F6: { ratio: 3, count: 3, amount: 0 },
		F7: { ratio: 2, count: 2, amount: 0 },
		F8: { ratio: 1, count: 1, amount: 0 }
	};

	onMount(async () => {
		const today = new Date();
		currentMonth = `${today.getMonth() + 1}월`;
		currentWeek = `${Math.ceil(today.getDate() / 7)}주차`;

		totalRevenue = 10000000;

		Object.keys(gradeRatios).forEach(grade => {
			gradeRatios[grade].amount = Math.round(totalRevenue * gradeRatios[grade].ratio / 100 / 10);
		});

		paymentSchedule = [
			{ no: 1, grade: '홍길동1', phone: '010-1234-5678', account: '1002-066-361313', payment: 30000, date: '2025-09-05' },
			{ no: 2, grade: '홍길동2', phone: '010-1234-5678', account: '1002-066-361312', payment: 70000, date: '2025-09-05' },
			{ no: 3, grade: '홍길동3', phone: '010-1234-5678', account: '345-546-123456', payment: 120000, date: '2025-09-05' },
			{ no: 4, grade: '홍길동4', phone: '', account: '345-546-123457', payment: 30000, date: '2025-09-05' },
			{ no: 5, grade: '', phone: '', account: '345-546-123458', payment: 200000, date: '2025-09-05' },
			{ no: 6, grade: '', phone: '', account: '345-546-123459', payment: 120000, date: '2025-09-05' }
		];

		isLoading = false;
	});
</script>

<svelte:head>
	<title>관리자 홈 - 나눔페이</title>
</svelte:head>

<style>
	.filter-blue {
		filter: invert(37%) sepia(93%) saturate(2201%) hue-rotate(198deg) brightness(95%) contrast(91%);
	}
	.filter-emerald {
		filter: invert(67%) sepia(60%) saturate(528%) hue-rotate(118deg) brightness(91%) contrast(91%);
	}
	.filter-purple {
		filter: invert(33%) sepia(59%) saturate(1354%) hue-rotate(242deg) brightness(95%) contrast(91%);
	}
	.filter-amber {
		filter: invert(72%) sepia(78%) saturate(631%) hue-rotate(5deg) brightness(97%) contrast(96%);
	}
</style>

{#if isLoading}
	<div class="flex justify-center items-center h-64">
		<div class="text-gray-500">로딩 중...</div>
	</div>
{:else}
	<div class="px-4 py-6 sm:px-0">
		<div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
			<div class="bg-white shadow overflow-hidden sm:rounded-lg">
				<div class="px-4 py-3 border-b border-gray-200 bg-gray-50">
					<h3 class="text-lg leading-6 font-medium text-gray-900">
						총매출 {currentMonth}/10회 {totalRevenue.toLocaleString()}원(1회)
					</h3>
					<p class="mt-1 text-sm text-gray-500">일-8월31일</p>
				</div>
				<div class="px-4 py-3">
					<table class="min-w-full">
						<thead>
							<tr class="border-b border-gray-200">
								<th class="px-3 py-2 text-left text-xs font-medium text-gray-700">등급</th>
								<th class="px-3 py-2 text-center text-xs font-medium text-gray-700">인원</th>
								<th class="px-3 py-2 text-right text-xs font-medium text-gray-700">금액</th>
							</tr>
						</thead>
						<tbody>
							{#each Object.entries(gradeRatios) as [grade, data]}
								<tr class="border-b border-gray-100">
									<td class="px-3 py-2">
										<GradeBadge {grade} size="sm" />
									</td>
									<td class="px-3 py-2 text-sm text-center text-gray-900">{data.count}</td>
									<td class="px-3 py-2 text-sm text-right text-gray-900">
										{data.amount.toLocaleString()}
									</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
			</div>

			<div class="bg-white shadow overflow-hidden sm:rounded-lg">
				<div class="px-4 py-3 border-b border-gray-200 bg-gray-50">
					<h3 class="text-lg leading-6 font-medium text-gray-900">용역비지급명부</h3>
				</div>
				<div class="px-4 py-3">
					<table class="min-w-full">
						<thead>
							<tr class="border-b border-gray-200">
								<th class="px-2 py-2 text-left text-xs font-medium text-gray-700">순번</th>
								<th class="px-2 py-2 text-left text-xs font-medium text-gray-700">성명</th>
								<th class="px-2 py-2 text-left text-xs font-medium text-gray-700">은행</th>
								<th class="px-2 py-2 text-left text-xs font-medium text-gray-700">계좌번호</th>
								<th class="px-2 py-2 text-right text-xs font-medium text-gray-700">금액</th>
							</tr>
						</thead>
						<tbody>
							{#each paymentSchedule as item}
								<tr class="border-b border-gray-100">
									<td class="px-2 py-2 text-sm text-gray-900">{item.no}</td>
									<td class="px-2 py-2 text-sm text-gray-900">{item.grade}</td>
									<td class="px-2 py-2 text-sm text-gray-900">하나</td>
									<td class="px-2 py-2 text-sm text-gray-900">{item.account}</td>
									<td class="px-2 py-2 text-sm text-right bg-yellow-100 text-gray-900">
										{item.payment.toLocaleString()}
									</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
			</div>
		</div>

		<div class="mt-6 bg-white shadow overflow-hidden sm:rounded-lg">
			<div class="px-4 py-5 sm:px-6 border-b border-gray-200 bg-gray-50">
				<h3 class="text-lg leading-6 font-medium text-gray-900">빠른 메뉴</h3>
			</div>
			<div class="px-4 py-4">
				<div class="grid grid-cols-1 md:grid-cols-3 gap-4">
					<a href="/admin/payment" class="block">
						<div class="bg-gradient-to-br from-blue-50 to-blue-100 hover:from-blue-100 hover:to-blue-200 rounded-lg p-4 text-center transition-all shadow-sm hover:shadow-md">
							<div class="inline-block p-2 bg-white rounded-lg shadow-sm mb-2">
								<img src="/icons/money.svg" alt="용역비" class="h-8 w-8 filter-blue" />
							</div>
							<p class="text-sm font-medium text-blue-900">용역비 지급명부</p>
						</div>
					</a>
					<a href="/admin/members" class="block">
						<div class="bg-gradient-to-br from-emerald-50 to-emerald-100 hover:from-emerald-100 hover:to-emerald-200 rounded-lg p-4 text-center transition-all shadow-sm hover:shadow-md">
							<div class="inline-block p-2 bg-white rounded-lg shadow-sm mb-2">
								<img src="/icons/users.svg" alt="용역자" class="h-8 w-8 filter-emerald" />
							</div>
							<p class="text-sm font-medium text-emerald-900">용역자 관리명부</p>
						</div>
					</a>
					<a href="/admin/organization" class="block">
						<div class="bg-gradient-to-br from-purple-50 to-purple-100 hover:from-purple-100 hover:to-purple-200 rounded-lg p-4 text-center transition-all shadow-sm hover:shadow-md">
							<div class="inline-block p-2 bg-white rounded-lg shadow-sm mb-2">
								<img src="/icons/chart.svg" alt="조직도" class="h-8 w-8 filter-purple" />
							</div>
							<p class="text-sm font-medium text-purple-900">용역자 산하정보</p>
						</div>
					</a>
				</div>
			</div>
		</div>
	</div>
{/if}