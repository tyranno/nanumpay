<script>
	import WindowsModal from '$lib/components/WindowsModal.svelte';

	export let isOpen = false;
	export let isUploading = false;
	export let uploadFiles = [];  // 단일 → 복수로 변경
	export let uploadProgress = null;  // 진행 상황 추가
	export let onClose = () => {};
	export let onFileSelect = (event) => {};
	export let onUpload = () => {};
</script>

<WindowsModal
	{isOpen}
	title="엑셀 파일 업로드"
	icon="/icons/excel.svg"
	size="md"
	{onClose}
>
	<!-- 파일 선택 (다중 선택 지원) -->
	<div class="mb-4">
		<input
			type="file"
			accept=".xlsx"
			multiple
			onchange={onFileSelect}
			id="excel-upload"
			class="hidden"
		/>
		<label
			for="excel-upload"
			class="block w-full px-4 py-3 bg-white border-2 border-dashed border-gray-300 rounded cursor-pointer hover:border-blue-400 hover:bg-blue-50 transition-all"
		>
			<div class="flex items-center justify-center gap-2">
				<img src="/icons/upload.svg" alt="Upload" class="w-5 h-5" />
				<span class="text-sm font-medium text-gray-600">
					{uploadFiles.length > 0 ? '다른 파일 선택' : '파일 선택하기 (여러 개 가능)'}
				</span>
			</div>
		</label>
	</div>

	<!-- 선택된 파일 목록 표시 -->
	{#if uploadFiles.length > 0}
		<div class="mb-4 max-h-60 overflow-y-auto">
			<p class="text-xs font-semibold text-gray-700 mb-2">선택된 파일 ({uploadFiles.length}개)</p>
			<div class="space-y-2">
				{#each uploadFiles as file, index}
					<div class="p-2 bg-blue-50 border border-blue-200 rounded">
						<div class="flex items-center gap-2">
							<span class="text-xs font-semibold text-blue-900 w-6">{index + 1}.</span>
							<img src="/icons/check-circle-blue.svg" alt="Check" class="w-4 h-4" />
							<div class="flex-1 min-w-0">
								<p class="text-xs text-blue-700 truncate">{file.name}</p>
							</div>
							<button
								onclick={() => {
									uploadFiles = uploadFiles.filter((_, i) => i !== index);
								}}
								class="w-5 h-5 bg-blue-100 rounded-full flex items-center justify-center hover:bg-blue-200 transition-colors"
							>
								<img src="/icons/close-blue.svg" alt="Close" class="w-2.5 h-2.5" />
							</button>
						</div>
					</div>
				{/each}
			</div>
		</div>
	{/if}

	<!-- 주의사항 -->
	<div class="p-3 bg-amber-50 border border-amber-200 rounded">
		<div class="flex items-start gap-2">
			<img src="/icons/edit-blue.svg" alt="Info" class="w-4 h-4 mt-0.5 flex-shrink-0" />
			<div class="text-xs text-amber-700">
				<p class="mb-1.5">엑셀 양식 및 예제 데이터:
					<a href="/용역자_등록_양식.xlsx" download class="underline font-semibold hover:text-amber-900">
						다운로드
					</a>
				</p>
				<p class="mb-1.5">• 형식 맞지 않으면 등록이 안됩니다.</p>
				<p class="mb-1.5">• 판매인은 기존 용역자에 등록되어 있어야 합니다.</p>
				<p>• 비밀번호: 전화번호 뒤 4자리</p>
			</div>
		</div>
	</div>

	<!-- 로딩 오버레이 (진행 상황 표시) -->
	{#if isUploading}
		<div class="absolute inset-0 bg-white bg-opacity-95 rounded-lg flex flex-col items-center justify-center z-10">
			<div class="text-center w-full px-8">
				<img src="/icons/spinner-blue.svg" alt="Loading" class="animate-spin h-12 w-12 mx-auto mb-3" />
				{#if uploadProgress}
					<p class="text-base font-semibold text-gray-700">
						{uploadProgress.current} / {uploadProgress.total} 처리 중...
					</p>
					<p class="text-sm text-gray-500 mt-1">{uploadProgress.fileName}</p>
					<!-- 프로그레스 바 -->
					<div class="mt-3 w-full bg-gray-200 rounded-full h-2">
						<div
							class="bg-blue-600 h-2 rounded-full transition-all duration-300"
							style="width: {(uploadProgress.current / uploadProgress.total) * 100}%"
						></div>
					</div>
				{:else}
					<p class="text-base font-semibold text-gray-700">업로드 준비 중...</p>
					<p class="text-sm text-gray-500 mt-1">잠시만 기다려주세요.</p>
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
