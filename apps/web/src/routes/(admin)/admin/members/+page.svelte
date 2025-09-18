<script>
	import { onMount } from 'svelte';

	let members = [];
	let isLoading = true;
	let newMember = {
		name: '',
		ssn: '',
		phone: '',
		bank: '',
		account: '',
		salesPerson: '',
		relationship: '',
		settlementType: '',
		relationshipNote: '',
		site: '',
		grade: ''
	};

	onMount(async () => {
		members = [
			{
				no: 1,
				date: '2025-09-05',
				name: '홍길동',
				ssn: '20250101-1234567',
				phone: '',
				bank: '하나',
				account: '1002-066-361313',
				salesPerson: '강길동1',
				relationship: '장일상',
				settlementType: '4545-5600',
				relationshipNote: '건강플러스',
				site: '삼성생명',
				grade: 'F1'
			},
			{
				no: 2,
				date: '2025-09-05',
				name: '서남식',
				ssn: '20240101-1234567',
				phone: '',
				bank: '하나',
				account: '1002-066-361212',
				salesPerson: '강길동1',
				relationship: '장일상',
				settlementType: '',
				relationshipNote: '시야보험',
				site: '시A',
				grade: 'F2'
			},
			{
				no: 3,
				date: '2025-09-05',
				name: '김희우',
				ssn: '20230101-1234568',
				phone: '',
				bank: 'KB',
				account: '345-546-123456',
				salesPerson: '서남식',
				relationship: '서남식',
				settlementType: '',
				relationshipNote: 'DB저축생보험',
				site: 'DB',
				grade: 'F3'
			},
			{
				no: 4,
				date: '2025-09-05',
				name: '',
				ssn: '20230101-1234569',
				phone: '',
				bank: '',
				account: '345-546-123457',
				salesPerson: '',
				relationship: '',
				settlementType: '',
				relationshipNote: '',
				site: '',
				grade: 'F1'
			},
			{
				no: 5,
				date: '2025-09-05',
				name: '',
				ssn: '20230101-1234570',
				phone: '',
				bank: '',
				account: '345-546-123458',
				salesPerson: '',
				relationship: '',
				settlementType: '',
				relationshipNote: '',
				site: '',
				grade: 'F4'
			},
			{
				no: 6,
				date: '2025-09-05',
				name: '',
				ssn: '20230101-1234571',
				phone: '',
				bank: '',
				account: '345-546-123459',
				salesPerson: '',
				relationship: '',
				settlementType: '',
				relationshipNote: '',
				site: '',
				grade: 'F3'
			}
		];
		isLoading = false;
	});

	function addMember() {
		const newNo = members.length + 1;
		const today = new Date();
		const dateStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

		members = [...members, {
			no: newNo,
			date: dateStr,
			...newMember,
			grade: 'F1'
		}];

		newMember = {
			name: '',
			ssn: '',
			phone: '',
			bank: '',
			account: '',
			salesPerson: '',
			relationship: '',
			settlementType: '',
			relationshipNote: '',
			site: '',
			grade: ''
		};
	}

	function handleFileUpload(event) {
		const file = event.target.files[0];
		if (file) {
			console.log('Excel file uploaded:', file.name);
		}
	}
</script>

<svelte:head>
	<title>용역자관리명부 - 나눔페이</title>
</svelte:head>

{#if isLoading}
	<div class="flex justify-center items-center h-64">
		<div class="text-gray-500">로딩 중...</div>
	</div>
{:else}
	<div class="px-4 py-6 sm:px-0">
		<div class="mb-4 flex justify-between">
			<div>
				<input
					type="file"
					accept=".xlsx,.xls"
					on:change={handleFileUpload}
					class="hidden"
					id="excel-upload"
				/>
				<label for="excel-upload" class="cursor-pointer bg-blue-500 text-white px-4 py-2 rounded-md hover:bg-blue-600">
					엑셀 업로드
				</label>
			</div>
		</div>

		<div class="bg-white shadow overflow-hidden sm:rounded-lg">
			<div class="px-4 py-5 sm:px-6 border-b border-gray-200 bg-gray-50">
				<h3 class="text-lg leading-6 font-medium text-gray-900">용역자관리명부</h3>
			</div>
			<div class="overflow-x-auto">
				<table class="min-w-full">
					<thead>
						<tr class="border-b border-gray-200 bg-gray-50">
							<th class="px-2 py-2 text-left text-xs font-medium text-gray-700">순번</th>
							<th class="px-2 py-2 text-left text-xs font-medium text-gray-700">날짜</th>
							<th class="px-2 py-2 text-left text-xs font-medium text-gray-700">성명</th>
							<th class="px-2 py-2 text-left text-xs font-medium text-gray-700">연락처</th>
							<th class="px-2 py-2 text-left text-xs font-medium text-gray-700">주민번호</th>
							<th class="px-2 py-2 text-left text-xs font-medium text-gray-700">은행</th>
							<th class="px-2 py-2 text-left text-xs font-medium text-gray-700">계좌번호</th>
							<th class="px-2 py-2 text-left text-xs font-medium text-gray-700">판매인</th>
							<th class="px-2 py-2 text-left text-xs font-medium text-gray-700">연락처</th>
							<th class="px-2 py-2 text-left text-xs font-medium text-gray-700">설계사</th>
							<th class="px-2 py-2 text-left text-xs font-medium text-gray-700">연락처</th>
							<th class="px-2 py-2 text-left text-xs font-medium text-gray-700">보험상품명</th>
							<th class="px-2 py-2 text-left text-xs font-medium text-gray-700">보험회사</th>
							<th class="px-2 py-2 text-left text-xs font-medium text-gray-700">직급</th>
						</tr>
					</thead>
					<tbody>
						{#each members as member}
							<tr class="border-b border-gray-100">
								<td class="px-2 py-2 text-sm text-gray-900">{member.no}</td>
								<td class="px-2 py-2 text-sm text-gray-900">{member.date}</td>
								<td class="px-2 py-2 text-sm text-gray-900">{member.name}</td>
								<td class="px-2 py-2 text-sm text-gray-900">{member.phone}</td>
								<td class="px-2 py-2 text-sm text-gray-900">{member.ssn}</td>
								<td class="px-2 py-2 text-sm text-gray-900">{member.bank}</td>
								<td class="px-2 py-2 text-sm text-gray-900">{member.account}</td>
								<td class="px-2 py-2 text-sm text-gray-900">{member.salesPerson}</td>
								<td class="px-2 py-2 text-sm text-gray-900">{member.relationship}</td>
								<td class="px-2 py-2 text-sm text-gray-900">{member.settlementType}</td>
								<td class="px-2 py-2 text-sm text-gray-900">{member.relationshipNote}</td>
								<td class="px-2 py-2 text-sm text-gray-900">{member.relationshipNote}</td>
								<td class="px-2 py-2 text-sm text-gray-900">{member.site}</td>
								<td class="px-2 py-2 text-sm text-gray-900 font-medium">{member.grade}</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		</div>

		<div class="mt-6 bg-white shadow overflow-hidden sm:rounded-lg">
			<div class="px-4 py-5 sm:px-6 border-b border-gray-200 bg-gray-50">
				<h3 class="text-lg leading-6 font-medium text-gray-900">신규 용역자 등록</h3>
			</div>
			<div class="px-4 py-4">
				<div class="grid grid-cols-1 md:grid-cols-3 gap-4">
					<div>
						<label class="block text-sm font-medium text-gray-700">성명</label>
						<input
							type="text"
							bind:value={newMember.name}
							class="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
						/>
					</div>
					<div>
						<label class="block text-sm font-medium text-gray-700">주민번호</label>
						<input
							type="text"
							bind:value={newMember.ssn}
							class="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
						/>
					</div>
					<div>
						<label class="block text-sm font-medium text-gray-700">연락처</label>
						<input
							type="text"
							bind:value={newMember.phone}
							class="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
						/>
					</div>
					<div>
						<label class="block text-sm font-medium text-gray-700">은행</label>
						<input
							type="text"
							bind:value={newMember.bank}
							class="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
						/>
					</div>
					<div>
						<label class="block text-sm font-medium text-gray-700">계좌번호</label>
						<input
							type="text"
							bind:value={newMember.account}
							class="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
						/>
					</div>
					<div>
						<label class="block text-sm font-medium text-gray-700">판매인</label>
						<input
							type="text"
							bind:value={newMember.salesPerson}
							class="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
						/>
					</div>
				</div>
				<div class="mt-4">
					<button
						on:click={addMember}
						class="bg-blue-500 text-white px-4 py-2 rounded-md hover:bg-blue-600"
					>
						등록
					</button>
				</div>
			</div>
		</div>
	</div>
{/if}