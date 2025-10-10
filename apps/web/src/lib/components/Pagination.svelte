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
				pages.push(i);
			}
			
			if (currentPage < totalPages - 3) {
				pages.push('...');
			}
			
			pages.push(totalPages);
		}
		
		return pages;
	})();
</script>

<div class="pagination">
	<button
		onclick={() => goToPage(currentPage - 1)}
		disabled={currentPage === 1}
		class="page-button"
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
	>
		다음
	</button>

	<div class="page-info">
		총 {totalItems}개 중 {(currentPage - 1) * itemsPerPage + 1}-{Math.min(currentPage * itemsPerPage, totalItems)}개 표시
	</div>
</div>

<style>
	.pagination {
		display: flex;
		justify-content: center;
		align-items: center;
		gap: 10px;
		padding: 20px;
		background: #f8f9fa;
		border-top: 1px solid #ddd;
	}

	.page-button {
		padding: 8px 16px;
		background: white;
		border: 1px solid #ddd;
		border-radius: 4px;
		cursor: pointer;
		font-size: 14px;
		transition: all 0.2s;
	}

	.page-button:hover:not(:disabled) {
		background: #e9ecef;
	}

	.page-button:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.page-numbers {
		display: flex;
		align-items: center;
		gap: 5px;
	}

	.page-number {
		min-width: 36px;
		height: 36px;
		padding: 0;
		background: white;
		border: 1px solid #ddd;
		border-radius: 4px;
		cursor: pointer;
		font-size: 14px;
		transition: all 0.2s;
	}

	.page-number:hover {
		background: #e9ecef;
	}

	.page-number.active {
		background: #007bff;
		color: white;
		border-color: #007bff;
	}

	.page-dots {
		padding: 0 8px;
		color: #999;
	}

	.page-info {
		margin-left: 20px;
		font-size: 14px;
		color: #666;
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
			font-size: 12px;
		}

		.page-numbers {
			gap: 3px;
		}

		.page-number {
			min-width: 32px;
			height: 32px;
			font-size: 12px;
		}

		.page-info {
			width: 100%;
			text-align: center;
			margin-left: 0;
			margin-top: 8px;
			font-size: 12px;
		}
	}
</style>
