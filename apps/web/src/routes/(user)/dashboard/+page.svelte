<script>
	import { onMount } from 'svelte';

	let userInfo = {
		nickname: '',
		name: '',
		phone1: '',
		bank: '',
		account: '',
		phone2: '',
		assistant: '',
		manager: '',
		salesOffice: '',
		manager2: '',
		phone3: '',
		manager3: '',
		phone4: '',
		supervisor: ''
	};

	let editMode = false;
	let isLoading = true;

	onMount(async () => {
		userInfo = {
			nickname: '이름',
			name: '전화번호',
			phone1: '은행',
			bank: '계좌',
			account: '주민번호',
			phone2: '보험',
			assistant: '보험회사',
			manager: '',
			salesOffice: '소속/지사',
			manager2: '설계사',
			phone3: '설계사 전화번호',
			manager3: '',
			phone4: '판매인',
			supervisor: '판매인 전화번호'
		};
		isLoading = false;
	});

	function toggleEdit() {
		editMode = !editMode;
	}

	function saveInfo() {
		console.log('Saving user info:', userInfo);
		editMode = false;
	}
</script>

<svelte:head>
	<title>사용자 홈 - 나눔페이</title>
</svelte:head>

<style>
	.filter-indigo {
		filter: invert(30%) sepia(100%) saturate(1247%) hue-rotate(203deg) brightness(90%) contrast(97%);
	}
	.filter-teal {
		filter: invert(72%) sepia(18%) saturate(2124%) hue-rotate(136deg) brightness(92%) contrast(88%);
	}
</style>

{#if isLoading}
	<div class="flex justify-center items-center h-64">
		<div class="text-gray-500">로딩 중...</div>
	</div>
{:else}
	<div class="px-4 py-6 sm:px-0">
		<div class="bg-white shadow overflow-hidden sm:rounded-lg">
			<div class="px-4 py-5 sm:px-6 border-b border-gray-200 bg-gray-50 flex justify-between items-center">
				<h3 class="text-lg leading-6 font-medium text-gray-900">사용자 정보</h3>
				<button
					on:click={toggleEdit}
					class="bg-blue-500 text-white px-4 py-2 rounded-md hover:bg-blue-600 text-sm"
				>
					{editMode ? '취소' : '편집'}
				</button>
			</div>
			<div class="px-4 py-5">
				<div class="grid grid-cols-2 gap-4">
					<div class="space-y-4">
						<div class="flex items-center">
							<label class="w-32 text-sm font-medium text-gray-700">닉네임</label>
							{#if editMode}
								<input type="text" bind:value={userInfo.nickname} class="flex-1 border-gray-300 rounded-md shadow-sm" />
							{:else}
								<span class="text-sm text-gray-900">{userInfo.nickname}</span>
							{/if}
						</div>
						<div class="flex items-center">
							<label class="w-32 text-sm font-medium text-gray-700">이름</label>
							{#if editMode}
								<input type="text" bind:value={userInfo.name} class="flex-1 border-gray-300 rounded-md shadow-sm" />
							{:else}
								<span class="text-sm text-gray-900">{userInfo.name}</span>
							{/if}
						</div>
						<div class="flex items-center">
							<label class="w-32 text-sm font-medium text-gray-700">전화번호</label>
							{#if editMode}
								<input type="text" bind:value={userInfo.phone1} class="flex-1 border-gray-300 rounded-md shadow-sm" />
							{:else}
								<span class="text-sm text-gray-900">{userInfo.phone1}</span>
							{/if}
						</div>
						<div class="flex items-center">
							<label class="w-32 text-sm font-medium text-gray-700">은행</label>
							{#if editMode}
								<input type="text" bind:value={userInfo.bank} class="flex-1 border-gray-300 rounded-md shadow-sm" />
							{:else}
								<span class="text-sm text-gray-900">{userInfo.bank}</span>
							{/if}
						</div>
						<div class="flex items-center">
							<label class="w-32 text-sm font-medium text-gray-700">계좌</label>
							{#if editMode}
								<input type="text" bind:value={userInfo.account} class="flex-1 border-gray-300 rounded-md shadow-sm" />
							{:else}
								<span class="text-sm text-gray-900">{userInfo.account}</span>
							{/if}
						</div>
						<div class="flex items-center">
							<label class="w-32 text-sm font-medium text-gray-700">주민번호</label>
							{#if editMode}
								<input type="text" bind:value={userInfo.phone2} class="flex-1 border-gray-300 rounded-md shadow-sm" />
							{:else}
								<span class="text-sm text-gray-900">{userInfo.phone2}</span>
							{/if}
						</div>
						<div class="flex items-center">
							<label class="w-32 text-sm font-medium text-gray-700">보험</label>
							{#if editMode}
								<input type="text" bind:value={userInfo.assistant} class="flex-1 border-gray-300 rounded-md shadow-sm" />
							{:else}
								<span class="text-sm text-gray-900">{userInfo.assistant}</span>
							{/if}
						</div>
						<div class="flex items-center">
							<label class="w-32 text-sm font-medium text-gray-700">보험회사</label>
							{#if editMode}
								<input type="text" bind:value={userInfo.manager} class="flex-1 border-gray-300 rounded-md shadow-sm" />
							{:else}
								<span class="text-sm text-gray-900">{userInfo.manager}</span>
							{/if}
						</div>
					</div>

					<div class="space-y-4">
						<div class="flex items-center">
							<label class="w-32 text-sm font-medium text-gray-700">소속/지사</label>
							{#if editMode}
								<input type="text" bind:value={userInfo.salesOffice} class="flex-1 border-gray-300 rounded-md shadow-sm" />
							{:else}
								<span class="text-sm text-gray-900">{userInfo.salesOffice}</span>
							{/if}
						</div>
						<div class="flex items-center">
							<label class="w-32 text-sm font-medium text-gray-700">설계사</label>
							{#if editMode}
								<input type="text" bind:value={userInfo.manager2} class="flex-1 border-gray-300 rounded-md shadow-sm" />
							{:else}
								<span class="text-sm text-gray-900">{userInfo.manager2}</span>
							{/if}
						</div>
						<div class="flex items-center">
							<label class="w-32 text-sm font-medium text-gray-700">설계사 전화번호</label>
							{#if editMode}
								<input type="text" bind:value={userInfo.phone3} class="flex-1 border-gray-300 rounded-md shadow-sm" />
							{:else}
								<span class="text-sm text-gray-900">{userInfo.phone3}</span>
							{/if}
						</div>
						<div class="flex items-center">
							<label class="w-32 text-sm font-medium text-gray-700">&nbsp;</label>
							<span class="text-sm text-gray-900">&nbsp;</span>
						</div>
						<div class="flex items-center">
							<label class="w-32 text-sm font-medium text-gray-700">판매인</label>
							{#if editMode}
								<input type="text" bind:value={userInfo.phone4} class="flex-1 border-gray-300 rounded-md shadow-sm" />
							{:else}
								<span class="text-sm text-gray-900">{userInfo.phone4}</span>
							{/if}
						</div>
						<div class="flex items-center">
							<label class="w-32 text-sm font-medium text-gray-700">판매인 전화번호</label>
							{#if editMode}
								<input type="text" bind:value={userInfo.supervisor} class="flex-1 border-gray-300 rounded-md shadow-sm" />
							{:else}
								<span class="text-sm text-gray-900">{userInfo.supervisor}</span>
							{/if}
						</div>
					</div>
				</div>

				{#if editMode}
					<div class="mt-6 flex justify-end">
						<button
							on:click={saveInfo}
							class="bg-green-500 text-white px-6 py-2 rounded-md hover:bg-green-600"
						>
							저장
						</button>
					</div>
				{/if}
			</div>
		</div>

		<div class="mt-6 bg-white shadow overflow-hidden sm:rounded-lg">
			<div class="px-4 py-5 sm:px-6 border-b border-gray-200 bg-gray-50">
				<h3 class="text-lg leading-6 font-medium text-gray-900">빠른 메뉴</h3>
			</div>
			<div class="px-4 py-4">
				<div class="grid grid-cols-1 md:grid-cols-2 gap-4">
					<a href="/dashboard/income" class="block">
						<div class="bg-gradient-to-br from-blue-50 to-indigo-100 hover:from-blue-100 hover:to-indigo-200 rounded-xl p-6 transition-all shadow-md hover:shadow-lg">
							<div class="flex items-center">
								<div class="p-3 bg-white rounded-lg shadow-sm mr-4">
									<img src="/icons/money.svg" alt="용역비" class="h-10 w-10 filter-indigo" />
								</div>
								<div>
									<p class="text-lg font-semibold text-indigo-900">내용역비정보</p>
									<p class="text-sm text-indigo-600 mt-1">지급 내역 및 등급 정보 확인</p>
								</div>
							</div>
						</div>
					</a>
					<a href="/dashboard/network" class="block">
						<div class="bg-gradient-to-br from-teal-50 to-cyan-100 hover:from-teal-100 hover:to-cyan-200 rounded-xl p-6 transition-all shadow-md hover:shadow-lg">
							<div class="flex items-center">
								<div class="p-3 bg-white rounded-lg shadow-sm mr-4">
									<img src="/icons/chart.svg" alt="조직도" class="h-10 w-10 filter-teal" />
								</div>
								<div>
									<p class="text-lg font-semibold text-teal-900">나의 산하정보</p>
									<p class="text-sm text-teal-600 mt-1">나의 조직 구조 확인</p>
								</div>
							</div>
						</div>
					</a>
				</div>
			</div>
		</div>
	</div>
{/if}