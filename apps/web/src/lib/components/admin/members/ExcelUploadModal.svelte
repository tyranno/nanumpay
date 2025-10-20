<script>
	import WindowsModal from '$lib/components/WindowsModal.svelte';

	export let isOpen = false;
	export let isUploading = false;
	export let uploadFile = null;
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
	<!-- 엑셀 양식 다운로드 -->
	<div class="mb-4">
		<a
			href="/용역자_등록_양식.xlsx"
			download="용역자_등록_양식.xlsx"
			class="flex items-center justify-center gap-2 w-full px-3 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors text-sm font-medium"
		>
			<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
				<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
			</svg>
			엑셀 양식 다운로드 (예제 포함)
		</a>
	</div>

	<!-- 파일 선택 -->
	<div class="mb-4">
		<input
			type="file"
			accept=".xlsx"
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
					{uploadFile ? '다른 파일 선택' : '파일 선택하기'}
				</span>
			</div>
		</label>
	</div>

	<!-- 선택된 파일 표시 -->
	{#if uploadFile}
		<div class="mb-4 p-3 bg-blue-50 border border-blue-200 rounded">
			<div class="flex items-center gap-2">
				<img src="/icons/check-circle-blue.svg" alt="Check" class="w-5 h-5" />
				<div class="flex-1 min-w-0">
					<p class="text-xs font-semibold text-blue-900">선택된 파일</p>
					<p class="text-xs text-blue-700 truncate">{uploadFile.name}</p>
				</div>
				<button
					onclick={() => uploadFile = null}
					class="w-6 h-6 bg-blue-100 rounded-full flex items-center justify-center hover:bg-blue-200 transition-colors"
				>
					<img src="/icons/close-blue.svg" alt="Close" class="w-3 h-3" />
				</button>
			</div>
		</div>
	{/if}

	<!-- 파일 형식 안내 -->
	<div class="p-3 bg-amber-50 border border-amber-200 rounded">
		<div class="flex items-start gap-2">
			<svg class="w-4 h-4 text-amber-600 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
				<path fill-rule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clip-rule="evenodd" />
			</svg>
			<div class="text-xs text-amber-700">
				<p class="font-semibold mb-1">필수: 성명, 연락처, 지사, 판매인, 설계사, 주민번호, 설계사 연락처</p>
				<p class="mt-1"><span class="font-semibold">주의:</span> 날짜 컬럼이 매출 발생일로 기록됩니다.</p>
				<p class="mt-1">ID: 이름 자동생성, PW: 전화번호 뒤 4자리</p>
			</div>
		</div>
	</div>

	<!-- 로딩 오버레이 -->
	{#if isUploading}
		<div class="absolute inset-0 bg-white bg-opacity-95 rounded-lg flex flex-col items-center justify-center z-10">
			<div class="text-center">
				<img src="/icons/spinner-blue.svg" alt="Loading" class="animate-spin h-12 w-12 mx-auto mb-3" />
				<p class="text-base font-semibold text-gray-700">업로드 처리 중...</p>
				<p class="text-sm text-gray-500 mt-1">잠시만 기다려주세요.</p>
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
			disabled={!uploadFile || isUploading}
			class="px-3 py-1.5 text-sm font-medium text-white bg-green-600 rounded hover:bg-green-700 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed"
		>
			<span class="flex items-center gap-2">
				{#if isUploading}
					<img src="/icons/spinner-white.svg" alt="Loading" class="animate-spin h-4 w-4" />
					처리 중...
				{:else}
					<img src="/icons/upload-white.svg" alt="Upload" class="w-4 h-4" />
					업로드
				{/if}
			</span>
		</button>
	</svelte:fragment>
</WindowsModal>
