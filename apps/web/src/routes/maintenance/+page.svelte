<script>
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';

	let isChecking = true;

	onMount(async () => {
		// 2초마다 유지보수 모드 상태 확인
		const interval = setInterval(async () => {
			try {
				const response = await fetch('/api/maintenance/status');
				const data = await response.json();
				
				if (!data.maintenanceMode) {
					// 유지보수 모드 해제됨 - 로그인 페이지로
					clearInterval(interval);
					goto('/login');
				}
			} catch (error) {
				console.error('상태 확인 오류:', error);
			}
		}, 2000);

		isChecking = false;

		return () => clearInterval(interval);
	});
</script>

<svelte:head>
	<title>시스템 점검 중 - 나눔에셋</title>
</svelte:head>

<div class="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100">
	<div class="max-w-md w-full">
		<div class="bg-white rounded-lg shadow-xl p-8 text-center">
			<!-- 로고 -->
			<div class="flex items-center justify-center gap-4 mb-6">
				<img src="/logo.png" alt="나눔에셋" class="h-20 w-20" />
				<h1 class="text-3xl font-bold text-blue-600">나눔에셋</h1>
			</div>

			<!-- 점검 아이콘 -->
			<div class="mb-6">
				<div class="inline-flex items-center justify-center w-24 h-24 bg-yellow-100 rounded-full">
					<svg class="w-12 h-12 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
					</svg>
				</div>
			</div>

			<!-- 메시지 -->
			<h2 class="text-2xl font-bold text-gray-800 mb-4">시스템 점검 중입니다</h2>
			<p class="text-gray-600 mb-2">
				보다 나은 서비스 제공을 위해<br />
				시스템 점검을 진행하고 있습니다.
			</p>
			<p class="text-sm text-gray-500 mb-6">
				잠시 후 다시 이용해 주시기 바랍니다.
			</p>

			<!-- 로딩 인디케이터 -->
			<div class="flex justify-center items-center space-x-2 text-gray-400">
				<div class="w-2 h-2 bg-blue-600 rounded-full animate-bounce" style="animation-delay: 0s"></div>
				<div class="w-2 h-2 bg-blue-600 rounded-full animate-bounce" style="animation-delay: 0.2s"></div>
				<div class="w-2 h-2 bg-blue-600 rounded-full animate-bounce" style="animation-delay: 0.4s"></div>
			</div>

			<!-- 문의 -->
			<div class="mt-8 pt-6 border-t border-gray-200">
				<p class="text-xs text-gray-500">
					긴급한 문의사항이 있으시면<br />
					고객센터로 연락 주시기 바랍니다.
				</p>
			</div>
		</div>

		<p class="text-center text-xs text-gray-500 mt-6">
			© 2024 나눔에셋. All rights reserved.
		</p>
	</div>
</div>

<style>
	@keyframes bounce {
		0%, 100% {
			transform: translateY(0);
		}
		50% {
			transform: translateY(-10px);
		}
	}
	
	.animate-bounce {
		animation: bounce 1s infinite;
	}
</style>
