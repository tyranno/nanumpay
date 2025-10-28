<script>
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { browser } from '$app/environment';
	import { DEFAULT_SERVER_URL } from '$lib/config.js';
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

			let urlToCheck = value || DEFAULT_SERVER_URL;

			// 서버 연결 확인
			const result = await checkServerConnection(urlToCheck);

			if (result.success) {
				// 연결 성공 - 저장되지 않았다면 저장
				if (!value) {
					await Preferences.set({ key: 'serverUrl', value: DEFAULT_SERVER_URL });
				}

				// 웹 서버로 완전히 이동
				window.location.href = result.url;
			} else {
				// 연결 실패 - 설정 화면으로 이동
				const errorMsg = result.error || '서버에 연결할 수 없습니다';
				goto('/app-setup?error=' + encodeURIComponent(errorMsg));
			}
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
