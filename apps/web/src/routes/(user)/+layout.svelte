<script>
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import { onMount, onDestroy } from 'svelte';
	import { browser } from '$app/environment';
	import WindowsModal from '$lib/components/WindowsModal.svelte';

	let { data, children } = $props();
	let showLogoutModal = $state(false);
	let isLoggedOut = false; // 중복 로그아웃 방지

	function confirmLogout() {
		showLogoutModal = true;
	}

	async function logout(isAutoLogout = false) {
		// 중복 로그아웃 방지
		if (isLoggedOut) return;
		isLoggedOut = true;

		showLogoutModal = false;

		// 자동 로그아웃인 경우 콘솔에 기록
		if (isAutoLogout) {
			console.log('[보안] 자동 로그아웃 처리됨');
		}

		// 1. 서버 세션 삭제
		await fetch('/api/auth/logout', { method: 'POST' });

		// 2. 클라이언트 저장소 완전 정리
		localStorage.clear();
		sessionStorage.clear();

		// 3. 히스토리 대체 (뒤로가기 방지) + 새로고침 강제
		goto('/login', { replaceState: true, invalidateAll: true });
	}

	// 페이지를 벗어날 때 자동 로그아웃 - F5 새로고침 문제로 제거
	// F5 새로고침과 실제 페이지 이탈을 구분할 수 없어 제거함
	// function handleBeforeUnload(event) {
	// 	// 새로고침이나 페이지 이탈 시 로그아웃 처리
	// 	if (!isLoggedOut) {
	// 		// 동기적으로 로그아웃 API 호출 (Navigator.sendBeacon 사용)
	// 		if (browser && navigator.sendBeacon) {
	// 			navigator.sendBeacon('/api/auth/logout', new Blob(['{}'], { type: 'application/json' }));
	// 		}

	// 		// 로컬 스토리지 정리
	// 		localStorage.clear();
	// 		sessionStorage.clear();

	// 		// 로그아웃 플래그 설정
	// 		isLoggedOut = true;
	// 	}
	// }

	// 탭 숨김/표시 감지 (탭 전환, 최소화 등)
	function handleVisibilityChange() {
		if (browser && document.hidden) {
			// 탭이 비활성화될 때 (5분 후 자동 로그아웃 타이머 설정)
			inactivityTimer = setTimeout(() => {
				if (document.hidden && !isLoggedOut) {
					logout(true);
				}
			}, 5 * 60 * 1000); // 5분
		} else {
			// 탭이 활성화될 때 타이머 취소
			if (inactivityTimer) {
				clearTimeout(inactivityTimer);
				inactivityTimer = null;
			}
		}
	}

	// 뒤로가기 감지 및 처리
	function handlePopState(event) {
		// 사용자 페이지를 벗어나려고 할 때
		const validPaths = ['/dashboard', '/payment-history', '/organization-tree', '/profile'];
		const currentPath = $page.url.pathname;

		if (!validPaths.some(path => currentPath.startsWith(path))) {
			// 로그아웃 처리
			logout(true);
		}
	}

	let inactivityTimer = null;

	onMount(() => {
		if (browser) {
			// 페이지 이탈 이벤트 등록 - F5 문제로 제거
			// window.addEventListener('beforeunload', handleBeforeUnload);

			// 탭 전환 감지
			document.addEventListener('visibilitychange', handleVisibilityChange);

			// 뒤로가기 감지
			window.addEventListener('popstate', handlePopState);

			// 사용자 활동 감지 (마우스, 키보드)
			let activityTimer = null;
			const resetActivityTimer = () => {
				if (activityTimer) clearTimeout(activityTimer);
				// 30분 동안 활동이 없으면 자동 로그아웃
				activityTimer = setTimeout(() => {
					if (!isLoggedOut) {
						logout(true);
					}
				}, 30 * 60 * 1000); // 30분
			};

			// 활동 이벤트 리스너
			document.addEventListener('mousemove', resetActivityTimer);
			document.addEventListener('keypress', resetActivityTimer);
			document.addEventListener('click', resetActivityTimer);
			document.addEventListener('scroll', resetActivityTimer);

			// 초기 타이머 설정
			resetActivityTimer();

			// 클린업 함수 반환
			return () => {
				// window.removeEventListener('beforeunload', handleBeforeUnload); - F5 문제로 제거
				document.removeEventListener('visibilitychange', handleVisibilityChange);
				window.removeEventListener('popstate', handlePopState);
				document.removeEventListener('mousemove', resetActivityTimer);
				document.removeEventListener('keypress', resetActivityTimer);
				document.removeEventListener('click', resetActivityTimer);
				document.removeEventListener('scroll', resetActivityTimer);
				if (activityTimer) clearTimeout(activityTimer);
				if (inactivityTimer) clearTimeout(inactivityTimer);
			};
		}
	});

	onDestroy(() => {
		// 컴포넌트 파괴 시 타이머 정리
		if (inactivityTimer) {
			clearTimeout(inactivityTimer);
		}
	});


	function goBack() {
		// SvelteKit의 네비게이션을 사용하여 사용자 대시보드로 이동
		goto('/dashboard');
	}

	function goHome() {
		goto('/dashboard');
	}
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
		<div class="w-full px-4 sm:px-6 lg:px-8">
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
						<img src="/logo.png" alt="나눔페이" class="h-8 w-8 mr-3" />
						<h1 class="text-xl font-semibold text-blue-600">나눔페이</h1>
					</button>
				</div>
				<div class="flex items-center gap-3">
					{#if data.user}
						<div class="flex items-center gap-1.5">
							<img src="/icons/user-blue.svg" alt="지원자" class="h-4 w-4" />
							<span class="text-sm text-gray-700 hidden sm:inline">{data.user.loginId} 님</span>
						</div>
					{/if}
					<!-- 로그아웃 아이콘 버튼 -->
					<button
						onclick={confirmLogout}
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

	<main class="w-full pt-16">
		{@render children?.()}
	</main>
</div>

<!-- 로그아웃 확인 모달 -->
<WindowsModal
	isOpen={showLogoutModal}
	title="로그아웃"
	icon="/icons/logout-red.svg"
	size="sm"
	onClose={() => showLogoutModal = false}
>
	<div class="text-center py-4">
		<p class="text-gray-700 mb-4">로그아웃 하시겠습니까?</p>
	</div>

	<div slot="footer">
		<button
			onclick={() => showLogoutModal = false}
			class="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded hover:bg-gray-50 transition-colors"
		>
			취소
		</button>
		<button
			onclick={logout}
			class="px-4 py-2 text-sm font-medium text-white bg-gray-600 rounded hover:bg-gray-700 transition-colors"
		>
			로그아웃
		</button>
	</div>
</WindowsModal>