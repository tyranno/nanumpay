<script>
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { browser } from '$app/environment';

	let isLoading = true;

	onMount(async () => {
		if (browser) {
			// Capacitor Storage 로드
			const { Storage } = await import('@capacitor/storage');

			// 저장된 서버 주소 확인
			const { value } = await Storage.get({ key: 'serverUrl' });

			if (value) {
				// 이미 서버 주소가 있으면 바로 해당 웹으로 이동
				window.location.href = value;
			} else {
				// 서버 주소 없으면 설정 화면으로 이동
				goto('/app-setup');
			}
		}
		isLoading = false;
	});
</script>

{#if isLoading}
	<div class="flex h-screen items-center justify-center text-gray-500">Loading...</div>
{/if}
