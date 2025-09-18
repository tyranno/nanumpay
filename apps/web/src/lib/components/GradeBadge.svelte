<script>
	import { getGradeInfo, getGradeBadgeClass } from '$lib/utils/gradeColors.js';

	let { grade = 'F1', size = 'md', showLabel = false } = $props();

	const gradeInfo = $derived(getGradeInfo(grade));
	const badgeClass = $derived(getGradeBadgeClass(grade, size));
</script>

<span class="{badgeClass} inline-flex items-center gap-1 select-none">
	<span class="{grade === 'F8' ? 'font-black' : 'font-bold'}">
		{grade}
	</span>

	{#if showLabel}
		<span class="opacity-80">
			({gradeInfo.label})
		</span>
	{/if}
</span>

<style>
	/* F8 등급을 위한 특별한 애니메이션 */
	:global(.bg-gradient-to-r) {
		animation: shimmer 3s ease-in-out infinite;
		background-size: 200% 100%;
	}

	@keyframes shimmer {
		0% { background-position: -200% 0; }
		100% { background-position: 200% 0; }
	}
</style>