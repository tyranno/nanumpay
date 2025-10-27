<script>
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { browser } from '$app/environment';
	import { DEFAULT_SERVER_URL } from '$lib/config.js';
	import { checkServerConnection } from '$lib/server-check.js';

	let isChecking = true;
	let debugInfo = [];

	function addDebug(msg) {
		debugInfo = [...debugInfo, `[${new Date().toLocaleTimeString()}] ${msg}`];
	}

	onMount(async () => {
		if (browser) {
			await initializeApp();
		}
	});

	async function initializeApp() {
		try {
			addDebug('앱 초기화 시작');

			// Capacitor Preferences 로드
			addDebug('Preferences 모듈 로딩 중...');
			const { Preferences } = await import('@capacitor/preferences');
			addDebug('Preferences 모듈 로드 완료');

			// 저장된 서버 주소 확인
			addDebug('저장된 서버 주소 확인 중...');
			const { value } = await Preferences.get({ key: 'serverUrl' });
			addDebug(`저장된 URL: ${value || '없음'}`);

			let urlToCheck = value || DEFAULT_SERVER_URL;
			addDebug(`체크할 URL: ${urlToCheck}`);

			// 서버 연결 확인
			addDebug('서버 연결 확인 시작...');
			const result = await checkServerConnection(urlToCheck);
			addDebug(`연결 결과: ${result.success ? '성공' : '실패'}`);

			if (!result.success) {
				addDebug(`에러: ${result.error}`);
			}

			if (result.success) {
				addDebug('서버로 이동 중...');
				// 연결 성공 - 저장되지 않았다면 저장
				if (!value) {
					await Preferences.set({ key: 'serverUrl', value: DEFAULT_SERVER_URL });
				}

				// 웹 서버로 완전히 이동
				window.location.href = result.url;
			} else {
				// 연결 실패 - 설정 화면으로 이동
				addDebug('설정 화면으로 이동...');
				const errorMsg = result.error || '서버에 연결할 수 없습니다';
				setTimeout(() => {
					goto('/app-setup?error=' + encodeURIComponent(errorMsg));
				}, 2000); // 디버그 정보 확인을 위해 2초 대기
			}
		} catch (error) {
			addDebug(`치명적 에러: ${error.message}`);
			console.error(error);
		}
	}
</script>

<div class="flex h-screen flex-col items-center justify-center gap-4 p-4 text-gray-500">
	<div class="text-lg font-semibold">NanumPay</div>
	{#if isChecking}
		<div class="text-sm">서버 연결 확인 중...</div>
		<div class="h-1 w-32 animate-pulse rounded-full bg-blue-500"></div>
	{/if}

	<!-- 디버그 정보 -->
	{#if debugInfo.length > 0}
		<div class="mt-4 w-full max-w-2xl rounded border border-gray-300 bg-gray-50 p-3">
			<div class="mb-2 text-xs font-bold text-gray-700">🐛 디버그 로그</div>
			<div class="max-h-32 overflow-y-auto space-y-1 text-xs font-mono">
				{#each debugInfo as info}
					<div class="text-gray-600">{info}</div>
				{/each}
			</div>
		</div>
	{/if}
</div>
