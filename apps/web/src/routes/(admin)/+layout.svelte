<script>
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';

	let { children } = $props();
	let sidebarOpen = $state(false);

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
		// SvelteKit의 네비게이션을 사용하여 관리자 홈으로 이동
		goto('/admin');
	}

	function goHome() {
		goto('/admin');
	}

	function toggleSidebar() {
		sidebarOpen = !sidebarOpen;
	}

	function closeSidebar() {
		sidebarOpen = false;
	}

	function navigateTo(path) {
		goto(path);
		closeSidebar();
	}
</script>

<style>
	.filter-gray {
		filter: invert(40%) sepia(10%) saturate(200%) hue-rotate(180deg) brightness(95%) contrast(90%);
	}
	.filter-red-icon {
		filter: invert(31%) sepia(98%) saturate(4031%) hue-rotate(346deg) brightness(92%) contrast(93%);
	}
	.filter-blue-icon {
		filter: invert(42%) sepia(77%) saturate(1677%) hue-rotate(200deg) brightness(97%) contrast(94%);
	}
	.filter-emerald-icon {
		filter: invert(58%) sepia(34%) saturate(1342%) hue-rotate(107deg) brightness(95%) contrast(94%);
	}
	.filter-purple-icon {
		filter: invert(41%) sepia(48%) saturate(2359%) hue-rotate(245deg) brightness(95%) contrast(94%);
	}
</style>

<div class="min-h-screen bg-gray-100">
	<!-- 네비게이션 바 -->
	<nav class="fixed top-0 left-0 right-0 bg-white shadow-sm z-50">
		<div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
			<div class="flex justify-between h-16">
				<div class="flex items-center gap-2">
					{#if $page.url.pathname !== '/admin'}
						<button
							onclick={goBack}
							class="p-2 rounded-lg bg-gradient-to-br from-gray-50 to-gray-100 hover:from-gray-100 hover:to-gray-200 transition-all shadow-sm hover:shadow-md"
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
						<h1 class="text-xl font-semibold text-blue-600">나눔페이 관리자</h1>
					</button>
				</div>
				<div class="flex items-center gap-3">
					<span class="text-sm text-gray-500 hidden sm:inline">관리자 모드</span>
					<!-- 로그아웃 아이콘 버튼 -->
					<button
						onclick={logout}
						class="p-2 rounded-lg bg-gradient-to-r from-red-50 to-pink-50 hover:from-red-100 hover:to-pink-100 transition-all shadow-sm hover:shadow-md"
						title="로그아웃"
						type="button"
					>
						<img src="/icons/logout-red.svg" alt="로그아웃" class="h-5 w-5 filter-red-icon" />
					</button>
					<!-- 햄버거 메뉴 버튼 -->
					<button
						onclick={toggleSidebar}
						class="p-2 rounded-lg bg-gradient-to-br from-gray-50 to-gray-100 hover:from-gray-100 hover:to-gray-200 transition-all shadow-sm hover:shadow-md"
						title="메뉴"
						type="button"
					>
						<img src="/icons/menu-gray.svg" alt="메뉴" class="h-6 w-6 filter-gray" />
					</button>
				</div>
			</div>
		</div>
	</nav>

	<!-- 사이드바 오버레이 (배경 클릭 시 닫기) -->
	{#if sidebarOpen}
		<div
			class="fixed inset-0 bg-black/20 z-40 transition-opacity duration-300"
			onclick={closeSidebar}
			role="button"
			tabindex="-1"
			aria-label="사이드바 닫기"
		></div>
	{/if}

	<!-- 사이드바 -->
	<aside class="fixed top-0 right-0 h-full w-64 bg-white/95 backdrop-blur-sm shadow-xl z-50 transform transition-transform duration-300 {sidebarOpen ? 'translate-x-0' : 'translate-x-full'}">
		<div class="flex flex-col h-full">
			<!-- 사이드바 헤더 -->
			<div class="flex items-center justify-between p-4 border-b border-gray-200">
				<h2 class="text-lg font-semibold text-gray-900">메뉴</h2>
				<button
					onclick={closeSidebar}
					class="p-1 rounded-lg hover:bg-gray-100 transition-colors"
					type="button"
				>
					<img src="/icons/close-gray.svg" alt="닫기" class="h-6 w-6 filter-gray" />
				</button>
			</div>

			<!-- 메뉴 항목 -->
			<nav class="flex-1 overflow-y-auto p-4">
				<div class="space-y-2">
					<button
						onclick={() => navigateTo('/admin')}
						class="w-full flex items-center gap-3 px-4 py-3 rounded-lg hover:bg-gray-50 transition-colors group"
						type="button"
					>
						<div class="w-10 h-10 bg-gray-100 rounded-lg flex items-center justify-center group-hover:scale-110 transition-transform">
							<img src="/icons/home-gray.svg" alt="홈" class="h-5 w-5 filter-gray" />
						</div>
						<span class="text-sm font-medium text-gray-900">관리자 홈</span>
					</button>

					<button
						onclick={() => navigateTo('/admin/payment')}
						class="w-full flex items-center gap-3 px-4 py-3 rounded-lg hover:bg-blue-50 transition-colors group"
						type="button"
					>
						<div class="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center group-hover:scale-110 transition-transform">
							<img src="/icons/money-blue.svg" alt="용역비" class="h-5 w-5 filter-blue-icon" />
						</div>
						<span class="text-sm font-medium text-gray-900">용역비 지급명부</span>
					</button>

					<button
						onclick={() => navigateTo('/admin/members')}
						class="w-full flex items-center gap-3 px-4 py-3 rounded-lg hover:bg-emerald-50 transition-colors group"
						type="button"
					>
						<div class="w-10 h-10 bg-emerald-100 rounded-lg flex items-center justify-center group-hover:scale-110 transition-transform">
							<img src="/icons/users-emerald.svg" alt="용역자" class="h-5 w-5 filter-emerald-icon" />
						</div>
						<span class="text-sm font-medium text-gray-900">용역자 관리명부</span>
					</button>

					<button
						onclick={() => navigateTo('/admin/organization')}
						class="w-full flex items-center gap-3 px-4 py-3 rounded-lg hover:bg-purple-50 transition-colors group"
						type="button"
					>
						<div class="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center group-hover:scale-110 transition-transform">
							<img src="/icons/organization-purple.svg" alt="조직도" class="h-5 w-5 filter-purple-icon" />
						</div>
						<span class="text-sm font-medium text-gray-900">용역자 산하정보</span>
					</button>
				</div>
			</nav>
		</div>
	</aside>

	<main class="max-w-7xl mx-auto pt-20 py-6 sm:px-6 lg:px-8">
		{@render children?.()}
	</main>
</div>