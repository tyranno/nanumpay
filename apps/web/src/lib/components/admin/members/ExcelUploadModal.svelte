<script>
	import WindowsModal from '$lib/components/WindowsModal.svelte';

	export let isOpen = false;
	export let isUploading = false;
	export let uploadFiles = [];  // 단일 → 복수로 변경
	export let uploadProgress = null;  // 진행 상황 추가
	export let onClose = () => {};
	export let onFileSelect = (event) => {};
	export let onUpload = () => {};

	// input file 요소에 접근하기 위한 변수
	let fileInput;

	// 드래그 앤 드롭 관련 변수
	let draggedIndex = null;
	let dragOverIndex = null;

	// 파일 삭제 시 input value 초기화
	function removeFile(index) {
		uploadFiles = uploadFiles.filter((_, i) => i !== index);
		// 모든 파일이 삭제되면 input value 초기화
		if (uploadFiles.length === 0 && fileInput) {
			fileInput.value = '';
		}
	}

	// 드래그 시작
	function handleDragStart(event, index) {
		draggedIndex = index;
		event.dataTransfer.effectAllowed = 'move';
		event.dataTransfer.setData('text/html', event.currentTarget);
		// 드래그 중 투명도 조정
		event.currentTarget.style.opacity = '0.4';
	}

	// 드래그 종료
	function handleDragEnd(event) {
		event.currentTarget.style.opacity = '1';
		draggedIndex = null;
		dragOverIndex = null;
	}

	// 드래그 오버
	function handleDragOver(event, index) {
		event.preventDefault();
		event.dataTransfer.dropEffect = 'move';
		dragOverIndex = index;
		return false;
	}

	// 드래그 리브
	function handleDragLeave(event) {
		// 현재 요소를 벗어날 때만 dragOverIndex 초기화
		if (!event.currentTarget.contains(event.relatedTarget)) {
			dragOverIndex = null;
		}
	}

	// 드롭
	function handleDrop(event, dropIndex) {
		event.preventDefault();
		event.stopPropagation();

		if (draggedIndex === null || draggedIndex === dropIndex) {
			dragOverIndex = null;
			return;
		}

		// 배열 재정렬
		const newFiles = [...uploadFiles];
		const [draggedFile] = newFiles.splice(draggedIndex, 1);
		newFiles.splice(dropIndex, 0, draggedFile);
		uploadFiles = newFiles;

		dragOverIndex = null;
		return false;
	}
</script>

<WindowsModal
	{isOpen}
	title="엑셀 파일 업로드"
	icon="/icons/excel.svg"
	size={isUploading ? 'xs' : 'sm'}
	{onClose}
>
	<!-- 파일 선택 (다중 선택 지원) -->
	<div class="mb-3">
		<input
			bind:this={fileInput}
			type="file"
			accept=".xlsx"
			multiple
			onchange={onFileSelect}
			id="excel-upload"
			class="hidden"
		/>
		<label
			for="excel-upload"
			class="block w-full px-3 py-2 bg-white border-2 border-dashed border-gray-300 rounded cursor-pointer hover:border-blue-400 hover:bg-blue-50 transition-all"
		>
			<div class="flex items-center justify-center gap-2">
				<img src="/icons/upload.svg" alt="Upload" class="w-4 h-4" />
				<span class="text-xs font-medium text-gray-600">
					{uploadFiles.length > 0 ? '다른 파일 선택' : '파일 선택 (여러 개 가능)'}
				</span>
			</div>
		</label>
	</div>

	<!-- 선택된 파일 목록 표시 -->
	{#if uploadFiles.length > 0}
		<div class="mb-3 max-h-32 overflow-y-auto">
			<p class="text-xs font-semibold text-gray-700 mb-1.5">
				선택된 파일 ({uploadFiles.length}개)
				{#if uploadFiles.length > 1}
					<span class="text-gray-500 font-normal ml-1">• 드래그하여 순서 변경</span>
				{/if}
			</p>
			<div class="space-y-1.5">
				{#each uploadFiles as file, index (file.name + index)}
					<div
						draggable="true"
						ondragstart={(e) => handleDragStart(e, index)}
						ondragend={handleDragEnd}
						ondragover={(e) => handleDragOver(e, index)}
						ondragleave={handleDragLeave}
						ondrop={(e) => handleDrop(e, index)}
						class="p-1.5 bg-blue-50 border border-blue-200 rounded transition-all cursor-move {dragOverIndex === index && draggedIndex !== index ? 'border-blue-500 border-2 bg-blue-100' : ''}"
					>
						<div class="flex items-center gap-1.5">
							<!-- 드래그 핸들 아이콘 -->
							<svg class="w-3.5 h-3.5 text-blue-400 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
								<path d="M7 2a2 2 0 1 0 .001 4.001A2 2 0 0 0 7 2zm0 6a2 2 0 1 0 .001 4.001A2 2 0 0 0 7 8zm0 6a2 2 0 1 0 .001 4.001A2 2 0 0 0 7 14zm6-8a2 2 0 1 0-.001-4.001A2 2 0 0 0 13 6zm0 2a2 2 0 1 0 .001 4.001A2 2 0 0 0 13 8zm0 6a2 2 0 1 0 .001 4.001A2 2 0 0 0 13 14z"></path>
							</svg>
							<span class="text-xs font-semibold text-blue-900 w-5">{index + 1}.</span>
							<img src="/icons/check-circle-blue.svg" alt="Check" class="w-3.5 h-3.5" />
							<div class="flex-1 min-w-0">
								<p class="text-xs text-blue-700 truncate">{file.name}</p>
							</div>
							<button
								onclick={() => removeFile(index)}
								class="w-4 h-4 bg-blue-100 rounded-full flex items-center justify-center hover:bg-blue-200 transition-colors flex-shrink-0"
							>
								<img src="/icons/close-blue.svg" alt="Close" class="w-2 h-2" />
							</button>
						</div>
					</div>
				{/each}
			</div>
		</div>
	{/if}

	<!-- 주의사항 -->
	<div class="p-2 bg-amber-50 border border-amber-200 rounded">
		<div class="flex items-start gap-1.5">
			<img src="/icons/edit-blue.svg" alt="Info" class="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
			<div class="text-xs text-amber-700">
				<p class="mb-1">엑셀 양식:
					<a href="/지원자_등록_양식.xlsx" download class="underline font-semibold hover:text-amber-900">
						다운로드
					</a>
				</p>
				<p class="mb-0.5">• 형식 맞지 않으면 등록 안됨</p>
				<p class="mb-0.5">• 판매인은 기존 지원자여야 함</p>
				<p>• 비밀번호: 전화번호 뒤 4자리</p>
			</div>
		</div>
	</div>

	<!-- 로딩 오버레이 (진행 상황 표시) - 컴팩트 버전 -->
	{#if isUploading}
		<div class="absolute inset-0 bg-white bg-opacity-95 rounded-lg flex flex-col items-center justify-center z-10">
			<div class="text-center w-full px-6 py-4">
				<!-- 회전하는 서클 -->
				<div class="relative w-16 h-16 mx-auto mb-3">
					<svg class="animate-spin" viewBox="0 0 50 50">
						<circle
							class="stroke-gray-200"
							cx="25"
							cy="25"
							r="20"
							fill="none"
							stroke-width="4"
						></circle>
						<circle
							class="stroke-blue-600"
							cx="25"
							cy="25"
							r="20"
							fill="none"
							stroke-width="4"
							stroke-dasharray="80 40"
							stroke-linecap="round"
						></circle>
					</svg>
					{#if uploadProgress}
						<div class="absolute inset-0 flex items-center justify-center">
							<span class="text-sm font-bold text-blue-600">
								{Math.round((uploadProgress.current / uploadProgress.total) * 100)}%
							</span>
						</div>
					{/if}
				</div>

				{#if uploadProgress}
					<p class="text-sm font-semibold text-gray-700">
						{uploadProgress.current} / {uploadProgress.total}
					</p>
					<p class="text-xs text-gray-500 mt-1 truncate max-w-xs mx-auto">{uploadProgress.fileName}</p>
				{:else}
					<p class="text-sm font-semibold text-gray-700">업로드 준비 중...</p>
				{/if}
			</div>
		</div>
	{/if}

	<svelte:fragment slot="footer">
		<button
			onclick={onClose}
			disabled={isUploading}
			class="px-3 py-1.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
		>
			취소
		</button>
		<button
			onclick={onUpload}
			disabled={uploadFiles.length === 0 || isUploading}
			class="px-3 py-1.5 text-sm font-medium text-white bg-green-600 rounded hover:bg-green-700 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed"
		>
			<span class="flex items-center gap-2">
				{#if isUploading}
					<img src="/icons/spinner-white.svg" alt="Loading" class="animate-spin h-4 w-4" />
					처리 중...
				{:else}
					<img src="/icons/upload-white.svg" alt="Upload" class="w-4 h-4" />
					{uploadFiles.length > 0 ? `${uploadFiles.length}개 파일 업로드` : '업로드'}
				{/if}
			</span>
		</button>
	</svelte:fragment>
</WindowsModal>
