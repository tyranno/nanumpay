<script>
	import WindowsModal from '$lib/components/WindowsModal.svelte';

	export let isOpen = false;
	export let onClose = () => {};

	let history = [];
	let isLoading = true;
	let errorMessage = '';
	let downloadingId = null;

	// 삭제 확인 모달
	let showDeleteConfirm = false;
	let deleteTarget = null;
	let isDeleting = false;

	// 모달이 열릴 때 히스토리 로드
	$: if (isOpen) {
		loadHistory();
	}

	async function loadHistory() {
		isLoading = true;
		errorMessage = '';

		try {
			const response = await fetch('/api/admin/uploads');
			const result = await response.json();

			if (result.success) {
				history = result.history;
			} else {
				errorMessage = result.error || '히스토리를 불러올 수 없습니다.';
			}
		} catch (error) {
			console.error('Load history error:', error);
			errorMessage = '히스토리를 불러오는 중 오류가 발생했습니다.';
		} finally {
			isLoading = false;
		}
	}

	async function handleDownload(item) {
		downloadingId = item._id;

		try {
			const response = await fetch(`/api/admin/uploads/${item._id}`);

			if (!response.ok) {
				const result = await response.json();
				alert(result.error || '다운로드 실패');
				return;
			}

			// Blob으로 변환 후 다운로드
			const blob = await response.blob();
			const url = window.URL.createObjectURL(blob);
			const a = document.createElement('a');
			a.href = url;
			a.download = item.originalFileName;
			document.body.appendChild(a);
			a.click();
			document.body.removeChild(a);
			window.URL.revokeObjectURL(url);
		} catch (error) {
			console.error('Download error:', error);
			alert('다운로드 중 오류가 발생했습니다.');
		} finally {
			downloadingId = null;
		}
	}

	function handleDelete(item) {
		deleteTarget = item;
		showDeleteConfirm = true;
	}

	async function confirmDelete() {
		if (!deleteTarget) return;

		isDeleting = true;
		try {
			const response = await fetch(`/api/admin/uploads/${deleteTarget._id}`, {
				method: 'DELETE'
			});

			if (response.ok) {
				// 목록에서 제거
				history = history.filter((h) => h._id !== deleteTarget._id);
				showDeleteConfirm = false;
				deleteTarget = null;
			} else {
				const result = await response.json();
				alert(result.error || '삭제 실패');
			}
		} catch (error) {
			console.error('Delete error:', error);
			alert('삭제 중 오류가 발생했습니다.');
		} finally {
			isDeleting = false;
		}
	}

	function cancelDelete() {
		showDeleteConfirm = false;
		deleteTarget = null;
	}

	// 업로드 날짜/시간 포맷 (간결하게)
	function formatDate(dateStr) {
		const date = new Date(dateStr);
		const year = String(date.getFullYear()).slice(2);
		const month = String(date.getMonth() + 1).padStart(2, '0');
		const day = String(date.getDate()).padStart(2, '0');
		const hour = String(date.getHours()).padStart(2, '0');
		const minute = String(date.getMinutes()).padStart(2, '0');
		return `${year}.${month}.${day} ${hour}:${minute}`;
	}

	function formatFileSize(bytes) {
		if (bytes < 1024) return bytes + ' B';
		if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
		return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
	}
</script>

<WindowsModal {isOpen} title="업로드 히스토리" icon="/icons/excel.svg" size="md" {onClose}>
	<div class="history-container">
		{#if isLoading}
			<div class="loading-state">
				<div class="spinner"></div>
				<p>히스토리 로딩 중...</p>
			</div>
		{:else if errorMessage}
			<div class="error-state">
				<p>{errorMessage}</p>
				<button onclick={loadHistory} class="retry-btn">다시 시도</button>
			</div>
		{:else if history.length === 0}
			<div class="empty-state">
				<img src="/icons/excel.svg" alt="No files" class="empty-icon" />
				<p>업로드 히스토리가 없습니다.</p>
			</div>
		{:else}
			<table class="history-table">
				<thead>
					<tr>
						<th class="th-file">파일명</th>
						<th class="th-date">업로드</th>
						<th class="th-count">등록</th>
						<th class="th-actions">관리</th>
					</tr>
				</thead>
				<tbody>
					{#each history as item (item._id)}
						<tr class="history-row">
							<td class="td-file">
								<div class="file-cell">
									<img src="/icons/excel.svg" alt="Excel" class="file-icon" />
									<span class="file-name" title={item.originalFileName}>{item.originalFileName}</span>
								</div>
							</td>
							<td class="td-date">{formatDate(item.uploadedAt)}</td>
							<td class="td-count">
								{#if item.registrationResult?.total > 0}
									<span class="count-success">{item.registrationResult.created}명</span>
									{#if item.registrationResult.failed > 0}
										<span class="count-fail">({item.registrationResult.failed} 실패)</span>
									{/if}
								{:else}
									-
								{/if}
							</td>
							<td class="td-actions">
								<button
									onclick={() => handleDownload(item)}
									disabled={downloadingId === item._id}
									class="action-btn download-btn"
									title="다운로드"
								>
									{#if downloadingId === item._id}
										<span class="btn-spinner"></span>
									{:else}
										<svg class="btn-icon" viewBox="0 0 20 20" fill="currentColor">
											<path fill-rule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clip-rule="evenodd" />
										</svg>
									{/if}
								</button>
								<button onclick={() => handleDelete(item)} class="action-btn delete-btn" title="삭제">
									<svg class="btn-icon" viewBox="0 0 20 20" fill="currentColor">
										<path fill-rule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clip-rule="evenodd" />
									</svg>
								</button>
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		{/if}
	</div>

	<svelte:fragment slot="footer">
		<button onclick={onClose} class="close-btn"> 닫기 </button>
	</svelte:fragment>
</WindowsModal>

<!-- 삭제 확인 모달 -->
<WindowsModal
	isOpen={showDeleteConfirm}
	title="파일 삭제"
	icon="/icons/trash-red.svg"
	size="xs"
	onClose={cancelDelete}
>
	<div class="delete-confirm-content">
		<p class="delete-filename">{deleteTarget?.originalFileName}</p>
		<p class="delete-message">파일을 삭제하시겠습니까?</p>
		<p class="delete-warning">삭제된 파일은 복구할 수 없습니다.</p>
	</div>

	<svelte:fragment slot="footer">
		<button onclick={cancelDelete} class="cancel-btn" disabled={isDeleting}>취소</button>
		<button onclick={confirmDelete} class="confirm-delete-btn" disabled={isDeleting}>
			{#if isDeleting}
				삭제 중...
			{:else}
				삭제
			{/if}
		</button>
	</svelte:fragment>
</WindowsModal>

<style>
	.history-container {
		min-height: 200px;
		max-height: 400px;
		overflow-y: auto;
	}

	.loading-state,
	.error-state,
	.empty-state {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		padding: 40px 20px;
		color: #6b7280;
	}

	.spinner {
		width: 32px;
		height: 32px;
		border: 3px solid #e5e7eb;
		border-top-color: #3b82f6;
		border-radius: 50%;
		animation: spin 1s linear infinite;
		margin-bottom: 12px;
	}

	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}

	.empty-icon {
		width: 48px;
		height: 48px;
		opacity: 0.5;
		margin-bottom: 12px;
	}

	.retry-btn {
		margin-top: 12px;
		padding: 6px 16px;
		background: #3b82f6;
		color: white;
		border: none;
		border-radius: 4px;
		cursor: pointer;
		font-size: 13px;
	}

	.retry-btn:hover {
		background: #2563eb;
	}

	/* 테이블 스타일 */
	.history-table {
		width: 100%;
		border-collapse: collapse;
		font-size: 13px;
	}

	.history-table thead {
		background: #f3f4f6;
		position: sticky;
		top: 0;
	}

	.history-table th {
		padding: 8px 10px;
		text-align: left;
		font-weight: 600;
		color: #4b5563;
		border-bottom: 2px solid #e5e7eb;
		white-space: nowrap;
	}

	.th-file { }
	.th-date { width: 110px; }
	.th-count { width: 80px; }
	.th-actions { width: 70px; text-align: center; }

	.history-row {
		border-bottom: 1px solid #e5e7eb;
		transition: background 0.15s;
	}

	.history-row:hover {
		background: #f9fafb;
	}

	.history-table td {
		padding: 10px;
		vertical-align: middle;
	}

	/* 파일명 */
	.td-file {
		max-width: 200px;
	}

	.file-cell {
		display: flex;
		align-items: center;
		gap: 6px;
	}

	.file-icon {
		width: 16px;
		height: 16px;
		flex-shrink: 0;
	}

	.file-name {
		color: #374151;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	/* 날짜 */
	.td-date {
		color: #6b7280;
		font-size: 12px;
		white-space: nowrap;
	}

	/* 등록 수 */
	.td-count {
		white-space: nowrap;
	}

	.count-success {
		color: #059669;
		font-weight: 600;
	}

	.count-fail {
		color: #dc2626;
		font-size: 11px;
		margin-left: 2px;
	}

	/* 액션 버튼 */
	.td-actions {
		text-align: center;
		white-space: nowrap;
	}

	.action-btn {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 28px;
		height: 28px;
		border: none;
		border-radius: 4px;
		cursor: pointer;
		transition: all 0.15s;
		margin: 0 2px;
	}

	.download-btn {
		background: #3b82f6;
		color: white;
	}

	.download-btn:hover:not(:disabled) {
		background: #2563eb;
	}

	.download-btn:disabled {
		opacity: 0.6;
		cursor: not-allowed;
	}

	.delete-btn {
		background: #fee2e2;
		color: #dc2626;
	}

	.delete-btn:hover {
		background: #fecaca;
	}

	.btn-icon {
		width: 14px;
		height: 14px;
	}

	.btn-spinner {
		width: 12px;
		height: 12px;
		border: 2px solid rgba(255, 255, 255, 0.3);
		border-top-color: white;
		border-radius: 50%;
		animation: spin 0.8s linear infinite;
	}

	.close-btn {
		padding: 6px 20px;
		background: #6b7280;
		color: white;
		border: none;
		border-radius: 4px;
		cursor: pointer;
		font-size: 14px;
		transition: background 0.15s;
	}

	.close-btn:hover {
		background: #4b5563;
	}

	/* 삭제 확인 모달 */
	.delete-confirm-content {
		text-align: center;
		padding: 4px 0;
	}

	.delete-filename {
		font-size: 14px;
		font-weight: 600;
		color: #111827;
		margin-bottom: 4px;
		word-break: break-all;
	}

	.delete-message {
		font-size: 14px;
		color: #374151;
		margin-bottom: 8px;
	}

	.delete-warning {
		font-size: 12px;
		color: #dc2626;
	}

	.cancel-btn {
		padding: 6px 16px;
		background: #e5e7eb;
		color: #374151;
		border: none;
		border-radius: 4px;
		cursor: pointer;
		font-size: 13px;
		transition: background 0.15s;
	}

	.cancel-btn:hover:not(:disabled) {
		background: #d1d5db;
	}

	.confirm-delete-btn {
		padding: 6px 16px;
		background: #dc2626;
		color: white;
		border: none;
		border-radius: 4px;
		cursor: pointer;
		font-size: 13px;
		transition: background 0.15s;
	}

	.confirm-delete-btn:hover:not(:disabled) {
		background: #b91c1c;
	}

	.cancel-btn:disabled,
	.confirm-delete-btn:disabled {
		opacity: 0.6;
		cursor: not-allowed;
	}
</style>
