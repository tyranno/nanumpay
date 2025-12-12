<script>
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { browser } from '$app/environment';
	import { DEFAULT_SERVER_URL, SERVER_URL_LIST } from '$lib/config.js';
	import { checkServerConnection } from '$lib/server-check.js';

	let isChecking = true;

	onMount(async () => {
		if (browser) {
			await initializeApp();
		}
	});

	async function initializeApp() {
		try {
			// Capacitor Preferences 로드
			const { Preferences } = await import('@capacitor/preferences');

			// 저장된 서버 주소 확인
			const { value } = await Preferences.get({ key: 'serverUrl' });

			// 저장된 URL이 있으면 먼저 시도, 없으면 URL 목록 순차 시도
			if (value) {
				const result = await checkServerConnection(value);
				if (result.success) {
					window.location.href = result.url;
					return;
				}
			}

			// URL 목록 순차 시도 (https 우선, http 후순위)
			for (const url of SERVER_URL_LIST) {
				console.log(`[App] 서버 연결 시도: ${url}`);
				const result = await checkServerConnection(url);

				if (result.success) {
					// 연결 성공 - URL 저장 후 이동
					await Preferences.set({ key: 'serverUrl', value: url });
					window.location.href = result.url;
					return;
				}
			}

			// 모든 URL 실패 - 설정 화면으로 이동
			goto('/app-setup?error=' + encodeURIComponent('서버에 연결할 수 없습니다'));
		} catch (error) {
			console.error(error);
			goto('/app-setup?error=' + encodeURIComponent(error.message));
		}
	}
</script>

<div class="flex h-screen flex-col items-center justify-center gap-4 p-4 text-gray-500">
	<div class="text-lg font-semibold">NanumPay</div>
	{#if isChecking}
		<div class="text-sm">서버 연결 확인 중...</div>
		<div class="h-1 w-32 animate-pulse rounded-full bg-blue-500"></div>
	{/if}


</div>
