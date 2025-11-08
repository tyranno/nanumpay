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

	/** 모달 크기: 'xs' | 'sm' | 'md' | 'lg' | 'xl' */
	export let size = "md";

	/** 닫기 콜백 함수 */
	export let onClose = () => {};

	/** 푸터 표시 여부 */
	export let showFooter = true;

	// 크기별 max-width 매핑
	const sizeMap = {
		xs: 'max-w-xs sm:max-w-xs',          // 384px
		sm: 'max-w-[95vw] sm:max-w-sm',      // 모바일 95%, PC 640px
		md: 'max-w-[95vw] sm:max-w-md',      // 모바일 95%, PC 768px
		lg: 'max-w-[95vw] sm:max-w-lg',      // 모바일 95%, PC 896px
		xl: 'max-w-[95vw] sm:max-w-2xl'      // 모바일 95%, PC 1024px
	};

	// 크기별 본문 높이 매핑 (업로드 진행 시 컴팩트하게)
	const bodyHeightMap = {
		xs: 'max-h-32',    // 작게 (업로드 진행 중)
		sm: 'max-h-none',  // 제한 없음
		md: 'max-h-none',
		lg: 'max-h-none',
		xl: 'max-h-none'
	};

	// 반응형으로 maxWidth와 bodyHeight 계산
	$: maxWidth = sizeMap[size] || sizeMap.md;
	$: bodyHeight = bodyHeightMap[size] || bodyHeightMap.md;

	// 드래그 관련 상태
	let isDragging = false;
	let modalElement;
	let offsetX = 0;
	let offsetY = 0;
	let posX = 0;
	let posY = 0;

	function handleMouseDown(e) {
		// 닫기 버튼 클릭 시 드래그 방지
		if (e.target.closest('button')) return;

		isDragging = true;
		const rect = modalElement.getBoundingClientRect();
		offsetX = e.clientX - rect.left;
		offsetY = e.clientY - rect.top;
	}

	function handleMouseMove(e) {
		if (!isDragging) return;

		posX = e.clientX - offsetX;
		posY = e.clientY - offsetY;

		// 화면 밖으로 나가지 않도록 제한
		const maxX = window.innerWidth - modalElement.offsetWidth;
		const maxY = window.innerHeight - modalElement.offsetHeight;

		posX = Math.max(0, Math.min(posX, maxX));
		posY = Math.max(0, Math.min(posY, maxY));
	}

	function handleMouseUp() {
		isDragging = false;
	}
</script>

<svelte:window
	onmousemove={handleMouseMove}
	onmouseup={handleMouseUp}
/>

{#if isOpen}
	<div class="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-2 sm:p-4">
		<div
			bind:this={modalElement}
			class="bg-white rounded-lg shadow-xl w-full {maxWidth} border border-gray-200"
			style="{posX !== 0 || posY !== 0 ? `position: absolute; left: ${posX}px; top: ${posY}px;` : ''}"
		>
			<!-- Windows 스타일 타이틀바 -->
			<div
				class="bg-gradient-to-r from-blue-500 to-blue-600 px-3 py-1.5 flex items-center justify-between select-none rounded-t-lg cursor-move"
				onmousedown={handleMouseDown}
			>
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
			<div class="p-4 {bodyHeight} overflow-y-auto">
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
