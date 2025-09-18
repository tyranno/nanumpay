<script>
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';

	let { data, children } = $props();

	async function logout() {
		await fetch('/api/auth/logout', { method: 'POST' });
		goto('/login');
	}

	function goBack() {
		// SvelteKit의 네비게이션을 사용하여 사용자 대시보드로 이동
		goto('/dashboard');
	}

	function goHome() {
		goto('/dashboard');
	}

	// 현재 페이지에 따른 서브타이틀
	let pageTitle = $derived.by(() => {
		const path = $page.url.pathname;
		if (path === '/dashboard') return '홈';
		if (path.includes('/dashboard/income')) return '내용역비정보';
		if (path.includes('/dashboard/network')) return '나의 산하정보';
		return '';
	})
</script>

<style>
	.filter-gray {
		filter: invert(40%) sepia(10%) saturate(200%) hue-rotate(180deg) brightness(95%) contrast(90%);
	}
</style>

<div class="min-h-screen bg-gray-100">
	<nav class="fixed top-0 left-0 right-0 bg-white shadow-sm z-50">
		<div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
			<div class="flex justify-between h-16">
				<div class="flex items-center">
					{#if $page.url.pathname !== '/dashboard'}
						<button
							onclick={goBack}
							class="mr-3 p-2 rounded-lg bg-gradient-to-br from-gray-50 to-gray-100 hover:from-gray-100 hover:to-gray-200 transition-all shadow-sm hover:shadow-md"
							title="뒤로가기"
							type="button"
						>
							<img src="/icons/arrow-left.svg" alt="뒤로가기" class="h-5 w-5 filter-gray" />
						</button>
					{/if}
					<button
						onclick={goHome}
						class="flex items-center hover:opacity-80 transition-opacity"
						title="홈으로 이동"
					>
						<img src="/logo.svg" alt="나눔페이" class="h-8 w-8 mr-3" />
						<div class="flex items-center">
							<h1 class="text-xl font-semibold text-blue-600">나눔페이</h1>
							{#if pageTitle}
								<span class="mx-2 text-gray-400">|</span>
								<span class="text-lg font-medium text-gray-700">{pageTitle}</span>
							{/if}
						</div>
					</button>
				</div>
				<div class="flex items-center space-x-4">
					{#if data.user}
						<span class="text-gray-700">{data.user.name}님</span>
					{/if}
					<button
						onclick={logout}
						class="text-gray-500 hover:text-gray-700 px-3 py-2 rounded-md text-sm font-medium"
						type="button"
					>
						로그아웃
					</button>
				</div>
			</div>
		</div>
	</nav>

	<main class="max-w-7xl mx-auto pt-20 py-6 sm:px-6 lg:px-8">
		{@render children?.()}
	</main>
</div>