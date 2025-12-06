<script>
	import '../app.css';

	let { children } = $props();
	// 폰트 크기 설정은 app.css에서 CSS 미디어 쿼리로 처리
</script>

{@render children?.()}
