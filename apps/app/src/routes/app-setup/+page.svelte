<script>
	import { onMount } from 'svelte';
	import { Storage } from '@capacitor/storage';

	let serverUrl = '';

	async function saveUrl() {
		if (!serverUrl) return;

		// 저장
		await Storage.set({ key: 'serverUrl', value: serverUrl });

		// 저장 후 바로 이동
		window.location.href = serverUrl;
	}
</script>

<div class="flex h-screen flex-col items-center justify-center space-y-4 p-6">
	<h1 class="text-xl font-bold">NanumPay 서버 설정</h1>

	<input
		type="text"
		bind:value={serverUrl}
		placeholder="https://your-server-address"
		class="w-80 rounded border p-2"
	/>

	<button on:click={saveUrl} class="rounded bg-blue-500 px-4 py-2 text-white hover:bg-blue-600">
		저장 후 접속
	</button>
</div>
