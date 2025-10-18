<script>
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';

	let { data, children } = $props();

	async function logout() {
		// 1. 서버 세션 삭제
		await fetch('/api/auth/logout', { method: 'POST' });

		// 2. 클라이언트 저장소 완전 정리
		localStorage.clear();
		sessionStorage.clear();

		// 3. 히스토리 대체 (뒤로가기 방지) + 새로고침 강제
		goto('/login', { replaceState: true, invalidateAll: true });
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
		if (path.includes('/dashboard/income')) return '내용역비정보';
		if (path.includes('/dashboard/network')) return '나의 산하정보';
		if (path.includes('/dashboard/profile')) return '내 정보';
		return '';
	})
</script>

<style>
	.filter-gray {
		filter: invert(40%) sepia(10%) saturate(200%) hue-rotate(180deg) brightness(95%) contrast(90%);
	}
	.filter-red-icon {
		filter: invert(31%) sepia(98%) saturate(4031%) hue-rotate(346deg) brightness(92%) contrast(93%);
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
				<div class="flex items-center gap-3">
					{#if data.user}
						<span class="text-sm text-gray-700 hidden sm:inline">{data.user.name}님</span>
					{/if}
					<!-- 로그아웃 아이콘 버튼 -->
					<button
						onclick={logout}
						class="p-2 rounded-lg bg-gradient-to-r from-red-50 to-pink-50 hover:from-red-100 hover:to-pink-100 transition-all shadow-sm hover:shadow-md"
						title="로그아웃"
						type="button"
					>
						<img src="/icons/logout-red.svg" alt="로그아웃" class="h-5 w-5 filter-red-icon" />
					</button>
				</div>
			</div>
		</div>
	</nav>

	<main class="max-w-7xl mx-auto pt-20 py-6 sm:px-6 lg:px-8">
		{@render children?.()}
	</main>
</div>