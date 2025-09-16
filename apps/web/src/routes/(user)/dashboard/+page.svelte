<script>
	import { onMount } from 'svelte';

	let user = null;
	let networkInfo = {
		leftCount: 0,
		rightCount: 0,
		leftVolume: 0,
		rightVolume: 0
	};
	let isLoading = true;

	onMount(async () => {
		try {
			const response = await fetch('/api/user/dashboard');
			if (response.ok) {
				const data = await response.json();
				user = data.user;
				networkInfo = data.networkInfo;
			}
		} catch (error) {
			console.error('Failed to load dashboard:', error);
		} finally {
			isLoading = false;
		}
	});
</script>

{#if isLoading}
	<div class="flex justify-center items-center h-64">
		<div class="text-gray-500">로딩 중...</div>
	</div>
{:else if user}
	<div class="px-4 py-6 sm:px-0">
		<div class="bg-white overflow-hidden shadow rounded-lg mb-6">
			<div class="px-4 py-5 sm:px-6">
				<h3 class="text-lg leading-6 font-medium text-gray-900">내 정보</h3>
			</div>
			<div class="border-t border-gray-200 px-4 py-5 sm:px-6">
				<dl class="grid grid-cols-1 gap-x-4 gap-y-6 sm:grid-cols-2">
					<div>
						<dt class="text-sm font-medium text-gray-500">이름</dt>
						<dd class="mt-1 text-sm text-gray-900">{user.name}</dd>
					</div>
					<div>
						<dt class="text-sm font-medium text-gray-500">아이디</dt>
						<dd class="mt-1 text-sm text-gray-900">{user.loginId}</dd>
					</div>
					<div>
						<dt class="text-sm font-medium text-gray-500">잔액</dt>
						<dd class="mt-1 text-sm text-gray-900">₩{(user.balance || 0).toLocaleString()}</dd>
					</div>
					<div>
						<dt class="text-sm font-medium text-gray-500">총 수익</dt>
						<dd class="mt-1 text-sm text-gray-900">₩{(user.totalEarnings || 0).toLocaleString()}</dd>
					</div>
				</dl>
			</div>
		</div>

		<div class="grid grid-cols-1 gap-5 sm:grid-cols-2">
			<div class="bg-white overflow-hidden shadow rounded-lg">
				<div class="px-4 py-5 sm:p-6">
					<div class="flex items-center">
						<div class="flex-shrink-0 bg-blue-500 rounded-md p-3">
							<svg class="h-6 w-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
							</svg>
						</div>
						<div class="ml-5">
							<dt class="text-sm font-medium text-gray-500 truncate">왼쪽 네트워크</dt>
							<dd class="mt-1">
								<div class="text-lg font-semibold text-gray-900">{networkInfo.leftCount}명</div>
								<div class="text-sm text-gray-500">볼륨: ₩{networkInfo.leftVolume.toLocaleString()}</div>
							</dd>
						</div>
					</div>
				</div>
			</div>

			<div class="bg-white overflow-hidden shadow rounded-lg">
				<div class="px-4 py-5 sm:p-6">
					<div class="flex items-center">
						<div class="flex-shrink-0 bg-green-500 rounded-md p-3">
							<svg class="h-6 w-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
							</svg>
						</div>
						<div class="ml-5">
							<dt class="text-sm font-medium text-gray-500 truncate">오른쪽 네트워크</dt>
							<dd class="mt-1">
								<div class="text-lg font-semibold text-gray-900">{networkInfo.rightCount}명</div>
								<div class="text-sm text-gray-500">볼륨: ₩{networkInfo.rightVolume.toLocaleString()}</div>
							</dd>
						</div>
					</div>
				</div>
			</div>
		</div>

		<div class="mt-6 bg-white shadow rounded-lg">
			<div class="px-4 py-5 sm:px-6">
				<h3 class="text-lg leading-6 font-medium text-gray-900">네트워크 구조</h3>
			</div>
			<div class="border-t border-gray-200 px-4 py-5 sm:px-6">
				<div class="flex justify-center">
					<div class="text-center">
						<div class="w-20 h-20 bg-blue-500 text-white rounded-full flex items-center justify-center mx-auto mb-4">
							나
						</div>
						<div class="flex justify-center space-x-16">
							<div class="text-center">
								<div class="w-16 h-16 bg-blue-300 text-white rounded-full flex items-center justify-center">
									L
								</div>
								<div class="mt-2 text-sm text-gray-600">{networkInfo.leftCount}명</div>
							</div>
							<div class="text-center">
								<div class="w-16 h-16 bg-green-300 text-white rounded-full flex items-center justify-center">
									R
								</div>
								<div class="mt-2 text-sm text-gray-600">{networkInfo.rightCount}명</div>
							</div>
						</div>
					</div>
				</div>
			</div>
		</div>
	</div>
{/if}