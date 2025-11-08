<script>
	/**
	 * 공통 페이지네이션 컴포넌트
	 * @prop {number} currentPage - 현재 페이지 번호
	 * @prop {number} totalPages - 전체 페이지 수
	 * @prop {number} totalItems - 전체 항목 수
	 * @prop {number} itemsPerPage - 페이지당 항목 수
	 * @prop {function} onPageChange - 페이지 변경 콜백 함수
	 */
	export let currentPage = 1;
	export let totalPages = 1;
	export let totalItems = 0;
	export let itemsPerPage = 20;
	export let onPageChange = (page) => {};

	function goToPage(page) {
		if (page >= 1 && page <= totalPages && page !== currentPage) {
			onPageChange(page);
		}
	}

	// 표시할 페이지 번호들을 계산
	$: pageNumbers = (() => {
		const pages = [];

		if (totalPages <= 0) {
			// 페이지가 없으면 빈 배열
			return pages;
		}

		if (totalPages === 1) {
			// 페이지가 1개면 1만 표시
			pages.push(1);
			return pages;
		}

		if (totalPages <= 7) {
			// 7페이지 이하면 모두 표시
			for (let i = 1; i <= totalPages; i++) {
				pages.push(i);
			}
		} else {
			// 7페이지 초과: 첫 페이지, 마지막 페이지, 현재 페이지 주변만 표시
			pages.push(1);

			if (currentPage > 4) {
				pages.push('...');
			}

			const start = Math.max(2, currentPage - 2);
			const end = Math.min(totalPages - 1, currentPage + 2);

			for (let i = start; i <= end; i++) {
				if (i > 1 && i < totalPages) {
					pages.push(i);
				}
			}

			if (currentPage < totalPages - 3) {
				pages.push('...');
			}

			if (totalPages > 1) {
				pages.push(totalPages);
			}
		}

		return pages;
	})();
</script>

<div class="pagination">
	<button
		onclick={() => goToPage(currentPage - 1)}
		disabled={currentPage === 1}
		class="page-button"
		title="이전 페이지"
	>
		이전
	</button>

	<div class="page-numbers">
		{#each pageNumbers as pageNum}
			{#if pageNum === '...'}
				<span class="page-dots">...</span>
			{:else}
				<button
					onclick={() => goToPage(pageNum)}
					class="page-number"
					class:active={pageNum === currentPage}
				>
					{pageNum}
				</button>
			{/if}
		{/each}
	</div>

	<button
		onclick={() => goToPage(currentPage + 1)}
		disabled={currentPage === totalPages}
		class="page-button"
		title="다음 페이지"
	>
		다음
	</button>

	<div class="page-info">
		총 {totalItems?.toLocaleString()}개 중 {((currentPage - 1) * itemsPerPage + 1).toLocaleString()}-{Math.min(currentPage * itemsPerPage, totalItems).toLocaleString()}개 표시
	</div>
</div>

<style>
	.pagination {
		display: flex;
		justify-content: center;
		align-items: center;
		gap: 5px;
		padding: 15px 20px;
		background: white;
		border-top: 1px solid #e5e7eb;
	}

	.page-button {
		padding: 6px 12px;
		background: white;
		border: 1px solid #d1d5db;
		border-radius: 4px;
		cursor: pointer;
		font-size: 0.8125rem;
		transition: all 0.15s;
		color: #374151;
		font-weight: 400;
		min-width: 60px;
	}

	.page-button:hover:not(:disabled) {
		background: #f9fafb;
		border-color: #9ca3af;
	}

	.page-button:disabled {
		opacity: 0.4;
		cursor: not-allowed;
		background: white;
		color: #9ca3af;
	}

	.page-numbers {
		display: flex;
		align-items: center;
		gap: 5px;
		margin: 0 10px;
	}

	.page-number {
		min-width: 38px;
		height: 38px;
		padding: 0;
		background: white;
		border: 1px solid #d1d5db;
		border-radius: 4px;
		cursor: pointer;
		font-size: 0.875rem;
		transition: all 0.15s;
		color: #374151;
		font-weight: 400;
		display: inline-flex;
		align-items: center;
		justify-content: center;
	}

	.page-number:hover {
		background: #f3f4f6;
		border-color: #9ca3af;
	}

	.page-number.active {
		background: #3b82f6;
		color: white;
		border-color: #3b82f6;
		font-weight: 500;
	}

	.page-dots {
		padding: 0 5px;
		color: #9ca3af;
		font-size: 0.875rem;
	}

	.page-info {
		margin-left: 20px;
		font-size: 0.8125rem;
		color: #6b7280;
		white-space: nowrap;
	}

	/* 반응형: 모바일 */
	@media (max-width: 640px) {
		.pagination {
			flex-wrap: wrap;
			padding: 10px;
			gap: 5px;
		}

		.page-button {
			padding: 6px 12px;
			font-size: 0.75rem;
		}

		.page-numbers {
			gap: 3px;
		}

		.page-number {
			min-width: 32px;
			height: 32px;
			font-size: 0.75rem;
		}

		.page-info {
			width: 100%;
			text-align: center;
			margin-left: 0;
			margin-top: 8px;
			font-size: 0.75rem;
		}
	}
</style>
