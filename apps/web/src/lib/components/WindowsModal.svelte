<script>
	/**
	 * Windows 스타일 모달 컴포넌트
	 * @component
	 */

	/** 모달 열림/닫힘 상태 */
	export let isOpen = false;

	/** 모달 타이틀 */
	export let title = "";

	/** 타이틀바 아이콘 경로 (선택사항) */
	export let icon = null;

	/** 모달 크기: 'sm' | 'md' | 'lg' | 'xl' */
	export let size = "md";

	/** 닫기 콜백 함수 */
	export let onClose = () => {};

	/** 푸터 표시 여부 */
	export let showFooter = true;

	// 크기별 max-width 매핑
	const sizeMap = {
		sm: 'max-w-sm',    // 640px
		md: 'max-w-md',    // 768px
		lg: 'max-w-lg',    // 896px
		xl: 'max-w-2xl'    // 1024px
	};

	const maxWidth = sizeMap[size] || sizeMap.md;
</script>

{#if isOpen}
	<div class="fixed inset-0 bg-gray-600 bg-opacity-50 flex items-center justify-center z-50">
		<div class="bg-white rounded-lg shadow-xl w-full {maxWidth} border border-gray-200 relative">
			<!-- Windows 스타일 타이틀바 -->
			<div class="bg-gradient-to-r from-blue-500 to-blue-600 px-3 py-1.5 flex items-center justify-between select-none rounded-t-lg">
				<div class="flex items-center gap-2">
					{#if icon}
						<img src={icon} alt="Icon" class="w-4 h-4 filter brightness-0 invert" />
					{/if}
					<h3 class="text-sm font-medium text-white">{title}</h3>
				</div>
				<button
					onclick={onClose}
					class="w-7 h-7 flex items-center justify-center hover:bg-white/20 rounded transition-colors"
					title="닫기"
				>
					<img src="/icons/close-white.svg" alt="Close" class="w-3.5 h-3.5" />
				</button>
			</div>

			<!-- 본문 영역 -->
			<div class="p-4">
				<slot />
			</div>

			<!-- 푸터 영역 (선택사항) -->
			{#if showFooter}
				<div class="px-4 py-3 bg-gray-50 border-t border-gray-200 flex justify-end gap-2 rounded-b-lg">
					<slot name="footer" />
				</div>
			{/if}
		</div>
	</div>
{/if}
