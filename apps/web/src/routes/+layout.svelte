<script>
	import '../app.css';
	import { onMount } from 'svelte';

	let { children } = $props();

	// 고정 폰트 크기 설정: 모바일 100%, PC 110%
	onMount(() => {
		function applyFontSize() {
			const isMobile = window.innerWidth < 768;
			document.documentElement.style.fontSize = isMobile ? '100%' : '110%';
		}

		applyFontSize();
		window.addEventListener('resize', applyFontSize);

		return () => {
			window.removeEventListener('resize', applyFontSize);
		};
	});
</script>

{@render children?.()}
