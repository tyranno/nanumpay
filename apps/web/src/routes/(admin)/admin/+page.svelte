<script>
	import { onMount } from 'svelte';

	let stats = {
		totalUsers: 0,
		activeUsers: 0,
		todayRegistrations: 0,
		totalRevenue: 0
	};

	let recentUsers = [];
	let isLoading = true;

	onMount(async () => {
		try {
			const response = await fetch('/api/admin/dashboard');
			if (response.ok) {
				const data = await response.json();
				stats = data.stats;
				recentUsers = data.recentUsers;
			}
		} catch (error) {
			console.error('Failed to load dashboard data:', error);
		} finally {
			isLoading = false;
		}
	});
</script>

<svelte:head>
	<title>관리자 대시보드 - 나눔에셋</title>
</svelte:head>

{#if isLoading}
	<div class="flex justify-center items-center h-64">
		<div class="text-gray-500">로딩 중...</div>
	</div>
{:else}
	<div class="px-4 py-6 sm:px-0">
		<div class="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
			<div class="bg-white overflow-hidden shadow rounded-lg">
				<div class="px-4 py-5 sm:p-6">
					<dt class="text-sm font-medium text-gray-500 truncate">전체 사용자</dt>
					<dd class="mt-1 text-3xl font-semibold text-gray-900">{stats.totalUsers}</dd>
				</div>
			</div>

			<div class="bg-white overflow-hidden shadow rounded-lg">
				<div class="px-4 py-5 sm:p-6">
					<dt class="text-sm font-medium text-gray-500 truncate">활성 사용자</dt>
					<dd class="mt-1 text-3xl font-semibold text-gray-900">{stats.activeUsers}</dd>
				</div>
			</div>

			<div class="bg-white overflow-hidden shadow rounded-lg">
				<div class="px-4 py-5 sm:p-6">
					<dt class="text-sm font-medium text-gray-500 truncate">오늘 가입</dt>
					<dd class="mt-1 text-3xl font-semibold text-gray-900">{stats.todayRegistrations}</dd>
				</div>
			</div>

			<div class="bg-white overflow-hidden shadow rounded-lg">
				<div class="px-4 py-5 sm:p-6">
					<dt class="text-sm font-medium text-gray-500 truncate">총 매출</dt>
					<dd class="mt-1 text-3xl font-semibold text-gray-900">
						₩{stats.totalRevenue.toLocaleString()}
					</dd>
				</div>
			</div>
		</div>

		<div class="mt-8">
			<div class="bg-white shadow overflow-hidden sm:rounded-lg">
				<div class="px-4 py-5 sm:px-6">
					<h3 class="text-lg leading-6 font-medium text-gray-900">최근 가입 사용자</h3>
				</div>
				<div class="border-t border-gray-200">
					<table class="min-w-full divide-y divide-gray-200">
						<thead class="bg-gray-50">
							<tr>
								<th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
									이름
								</th>
								<th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
									아이디
								</th>
								<th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
									가입일
								</th>
								<th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
									상태
								</th>
							</tr>
						</thead>
						<tbody class="bg-white divide-y divide-gray-200">
							{#each recentUsers as user}
								<tr>
									<td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
										{user.name}
									</td>
									<td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
										{user.loginId}
									</td>
									<td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
										{new Date(user.createdAt).toLocaleDateString()}
									</td>
									<td class="px-6 py-4 whitespace-nowrap">
										<span class="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-green-100 text-green-800">
											활성
										</span>
									</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
			</div>
		</div>
	</div>
{/if}