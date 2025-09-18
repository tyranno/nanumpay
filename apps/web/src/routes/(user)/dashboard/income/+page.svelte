<script>
	import { onMount } from 'svelte';

	let incomeHistory = [];
	let currentGrade = 'F2';
	let isLoading = true;

	onMount(async () => {
		const today = new Date();

		incomeHistory = [
			{
				date: '01월 01일',
				time: '',
				applicant: '',
				item: 'F1',
				grade: 'F2',
				commission: 'F1+F2',
				total: '총액*3.3%',
				paymentDate: '1/10',
				paymentAmount: currentGrade
			},
			{
				date: '01월 02일',
				time: '',
				applicant: '',
				item: '',
				grade: '',
				commission: '',
				total: '',
				paymentDate: '2/10',
				paymentAmount: currentGrade
			},
			{
				date: '01월 03일',
				time: '',
				applicant: '',
				item: '',
				grade: '',
				commission: '',
				total: '',
				paymentDate: '3/10',
				paymentAmount: currentGrade
			}
		];

		isLoading = false;
	});
</script>

<svelte:head>
	<title>내용역비정보 - 나눔페이</title>
</svelte:head>

{#if isLoading}
	<div class="flex justify-center items-center h-64">
		<div class="text-gray-500">로딩 중...</div>
	</div>
{:else}
	<div class="px-4 py-6 sm:px-0">
		<div class="bg-white shadow overflow-hidden sm:rounded-lg">
			<div class="px-4 py-5 sm:px-6 border-b border-gray-200 bg-gray-50">
				<h3 class="text-lg leading-6 font-medium text-gray-900">내용역비정보</h3>
				<p class="mt-1 text-sm text-gray-600">기간별 용역비 지급 내역</p>
			</div>
			<div class="overflow-x-auto">
				<table class="min-w-full">
					<thead>
						<tr class="border-b border-gray-200 bg-gray-50">
							<th rowspan="2" class="px-3 py-3 text-left text-xs font-medium text-gray-700 uppercase border-r">날짜</th>
							<th colspan="5" class="px-3 py-3 text-center text-xs font-medium text-gray-700 uppercase border-r">적용</th>
							<th colspan="2" class="px-3 py-3 text-center text-xs font-medium text-gray-700 uppercase">적용 등급</th>
						</tr>
						<tr class="border-b border-gray-200 bg-gray-50">
							<th class="px-3 py-2 text-left text-xs font-medium text-gray-700">시간</th>
							<th class="px-3 py-2 text-left text-xs font-medium text-gray-700">신청</th>
							<th class="px-3 py-2 text-left text-xs font-medium text-gray-700">종목</th>
							<th class="px-3 py-2 text-left text-xs font-medium text-gray-700">%공제 금</th>
							<th class="px-3 py-2 text-left text-xs font-medium text-gray-700 border-r">회차</th>
							<th class="px-3 py-2 text-left text-xs font-medium text-gray-700">지급일</th>
							<th class="px-3 py-2 text-left text-xs font-medium text-gray-700">지급액</th>
						</tr>
					</thead>
					<tbody>
						{#each incomeHistory as item}
							<tr class="border-b border-gray-100">
								<td class="px-3 py-3 text-sm text-gray-900 border-r">{item.date}</td>
								<td class="px-3 py-3 text-sm text-gray-900">{item.time}</td>
								<td class="px-3 py-3 text-sm text-gray-900">{item.applicant}</td>
								<td class="px-3 py-3 text-sm text-gray-900">{item.item}</td>
								<td class="px-3 py-3 text-sm text-gray-900">{item.total}</td>
								<td class="px-3 py-3 text-sm text-gray-900 border-r">{item.paymentDate}</td>
								<td class="px-3 py-3 text-sm text-gray-900">{item.paymentAmount}</td>
								<td class="px-3 py-3 text-sm text-gray-900">{item.paymentAmount}</td>
							</tr>
						{/each}
						<tr class="border-b border-gray-100">
							<td class="px-3 py-3 text-sm font-medium text-gray-900 border-r">합계</td>
							<td class="px-3 py-3 text-sm text-gray-900"></td>
							<td class="px-3 py-3 text-sm text-gray-900"></td>
							<td class="px-3 py-3 text-sm text-gray-900"></td>
							<td class="px-3 py-3 text-sm text-gray-900"></td>
							<td class="px-3 py-3 text-sm text-gray-900 border-r"></td>
							<td class="px-3 py-3 text-sm text-gray-900"></td>
							<td class="px-3 py-3 text-sm text-gray-900"></td>
						</tr>
					</tbody>
				</table>
			</div>
		</div>

		<div class="mt-6 bg-white shadow overflow-hidden sm:rounded-lg">
			<div class="px-4 py-5 sm:px-6 border-b border-gray-200 bg-gray-50">
				<h3 class="text-lg leading-6 font-medium text-gray-900">등급 정보</h3>
			</div>
			<div class="px-4 py-5">
				<div class="grid grid-cols-2 gap-4">
					<div>
						<p class="text-sm font-medium text-gray-700">현재 등급</p>
						<p class="mt-1 text-2xl font-bold text-blue-600">{currentGrade}</p>
					</div>
					<div>
						<p class="text-sm font-medium text-gray-700">다음 등급 조건</p>
						<p class="mt-1 text-sm text-gray-600">F3: 나의 아래 조직이 F2등급이 2개 존재하는 경우</p>
					</div>
				</div>
			</div>
		</div>
	</div>
{/if}