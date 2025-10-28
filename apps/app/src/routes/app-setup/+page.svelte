<script>
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { browser } from '$app/environment';
	import { Preferences } from '@capacitor/preferences';
	import { checkServerConnection } from '$lib/server-check.js';
	import { DEFAULT_SERVER_URL } from '$lib/config.js';

	let serverUrl = '';
	let errorMessage = '';
	let isChecking = false;
	let successMessage = '';
	let debugInfo = [];

	function addDebug(msg) {
		debugInfo = [...debugInfo, `[${new Date().toLocaleTimeString()}] ${msg}`];
	}

	onMount(async () => {
		if (browser) {
			// URL 쿼리 파라미터에서 에러 메시지 확인
			const params = new URLSearchParams(window.location.search);
			const error = params.get('error');
			if (error) {
				errorMessage = error;
			}

			// 기존에 저장된 URL 불러오기
			const { value } = await Preferences.get({ key: 'serverUrl' });
			if (value) {
				serverUrl = value;
			} else {
				// 저장된 값이 없으면 기본 URL 사용
				serverUrl = DEFAULT_SERVER_URL;
			}
		}
	});

	async function testConnection() {
		addDebug('연결 테스트 시작');
		if (!serverUrl) {
			errorMessage = 'URL을 입력해주세요';
			addDebug('에러: URL 미입력');
			return;
		}

		addDebug(`테스트할 URL: ${serverUrl}`);
		errorMessage = '';
		successMessage = '';
		isChecking = true;

		addDebug('서버 연결 확인 중...');
		const result = await checkServerConnection(serverUrl);
		isChecking = false;

		addDebug(`연결 결과: ${result.success ? '성공' : '실패'}`);
		addDebug(`result 객체: ${JSON.stringify(result)}`);
		if (result.success) {
			successMessage = '서버 연결 성공!';
			addDebug('✅ 서버 연결 성공!');
		} else {
			errorMessage = result.error || '서버에 연결할 수 없습니다';
			addDebug(`❌ 에러 메시지: ${result.error || '없음'}`);
			addDebug(`❌ URL: ${result.url || '없음'}`);
		}
	}

	async function saveUrl() {
		addDebug('저장 및 접속 시작');
		if (!serverUrl) {
			errorMessage = 'URL을 입력해주세요';
			addDebug('에러: URL 미입력');
			return;
		}

		addDebug(`저장할 URL: ${serverUrl}`);
		// 서버 연결 테스트
		errorMessage = '';
		successMessage = '';
		isChecking = true;

		addDebug('서버 연결 확인 중...');
		const result = await checkServerConnection(serverUrl);
		isChecking = false;

		addDebug(`연결 결과: ${result.success ? '성공' : '실패'}`);
		addDebug(`result 객체: ${JSON.stringify(result)}`);
		if (result.success) {
			// 저장
			addDebug('Preferences에 URL 저장 중...');
			await Preferences.set({ key: 'serverUrl', value: serverUrl });
			successMessage = '저장되었습니다. 접속 중...';
			addDebug('✅ 저장 완료, 메인 페이지로 이동');

			// 잠시 후 메인 페이지로 이동
			setTimeout(() => {
				goto('/');
			}, 500);
		} else {
			errorMessage = result.error || '서버에 연결할 수 없습니다';
			addDebug(`❌ 에러 메시지: ${result.error || '없음'}`);
			addDebug(`❌ URL: ${result.url || '없음'}`);
		}
	}
</script>

<div class="flex h-screen flex-col items-center justify-center space-y-4 p-6">
	<h1 class="text-xl font-bold">NanumPay 서버 설정</h1>

	<div class="w-full max-w-md space-y-4">
		<div>
			<label for="serverUrl" class="mb-1 block text-sm font-medium text-gray-700">
				서버 주소
			</label>
			<input
				id="serverUrl"
				type="text"
				bind:value={serverUrl}
				placeholder="http://localhost:3100 또는 https://your-domain.com"
				class="w-full rounded border p-3 focus:border-blue-500 focus:outline-none"
				disabled={isChecking}
			/>
		</div>

		{#if errorMessage}
			<div class="rounded bg-red-50 p-3 text-sm text-red-600">
				{errorMessage}
			</div>
		{/if}

		{#if successMessage}
			<div class="rounded bg-green-50 p-3 text-sm text-green-600">
				{successMessage}
			</div>
		{/if}

		<div class="flex gap-2">
			<button
				on:click={testConnection}
				class="flex-1 rounded border border-blue-500 px-4 py-2 text-blue-500 hover:bg-blue-50 disabled:opacity-50"
				disabled={isChecking}
			>
				{isChecking ? '확인 중...' : '연결 테스트'}
			</button>

			<button
				on:click={saveUrl}
				class="flex-1 rounded bg-blue-500 px-4 py-2 text-white hover:bg-blue-600 disabled:opacity-50"
				disabled={isChecking}
			>
				{isChecking ? '확인 중...' : '저장 후 접속'}
			</button>
		</div>

		<div class="text-center text-xs text-gray-500">
			기본 서버 주소: {DEFAULT_SERVER_URL}
		</div>
	</div>
</div>
