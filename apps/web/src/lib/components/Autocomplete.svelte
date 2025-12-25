<script>
	/**
	 * 자동완성 입력 컴포넌트
	 * 사용자 입력에 따라 API를 호출하고 결과를 드롭다운으로 표시
	 */
	export let value = '';
	export let placeholder = '';
	export let apiUrl = '';
	export let label = '';
	export let disabled = false;
	export let required = false; // 필수 입력 여부
	export let onSelect = (item) => {};
	export let onInputChange = null; // 입력 변경 시 호출되는 콜백 (옵션)
	export let displayKey = 'name'; // 표시할 필드명
	export let subtextKey = ''; // 부가 정보 필드명 (옵션)
	export let responseKey = ''; // API 응답에서 배열을 가져올 키 (옵션)
	export let inputClass = 'w-full px-2 py-1.5 text-sm border border-gray-300 rounded-md';

	let suggestions = [];
	let showSuggestions = false;
	let isLoading = false;
	let searchTimer;
	let inputElement;
	let selectedIndex = -1;
	let justSelected = false; // 선택 직후 플래그

	async function handleInput(event) {
		const query = event.target.value;
		value = query;

		// 외부 콜백 호출 (있는 경우)
		if (onInputChange) {
			onInputChange(event);
		}

		// 선택 직후에는 드롭다운 열지 않음
		if (justSelected) {
			justSelected = false;
			return;
		}

		clearTimeout(searchTimer);

		if (query.length < 1) {
			suggestions = [];
			showSuggestions = false;
			return;
		}

		searchTimer = setTimeout(async () => {
			isLoading = true;
			try {
				const response = await fetch(`${apiUrl}?q=${encodeURIComponent(query)}`);
				const data = await response.json();

				// responseKey가 지정되면 해당 키 사용, 아니면 기본 키들 시도
				suggestions = responseKey ? (data[responseKey] || []) : (data.users || data.planners || data.accounts || []);
				showSuggestions = suggestions.length > 0;
				selectedIndex = -1;
			} catch (error) {
				console.error('Autocomplete search error:', error);
				suggestions = [];
				showSuggestions = false;
			} finally {
				isLoading = false;
			}
		}, 300);
	}

	function selectItem(item) {
		clearTimeout(searchTimer); // 진행 중인 검색 취소
		justSelected = true; // 선택 직후 플래그 설정
		value = item[displayKey];
		suggestions = [];
		showSuggestions = false;
		selectedIndex = -1;
		onSelect(item);
	}

	function handleKeydown(event) {
		if (!showSuggestions || suggestions.length === 0) return;

		switch (event.key) {
			case 'ArrowDown':
				event.preventDefault();
				selectedIndex = Math.min(selectedIndex + 1, suggestions.length - 1);
				break;
			case 'ArrowUp':
				event.preventDefault();
				selectedIndex = Math.max(selectedIndex - 1, -1);
				break;
			case 'Enter':
				event.preventDefault();
				if (selectedIndex >= 0 && selectedIndex < suggestions.length) {
					selectItem(suggestions[selectedIndex]);
				}
				break;
			case 'Escape':
				showSuggestions = false;
				selectedIndex = -1;
				break;
		}
	}

	function handleBlur() {
		// 드롭다운 클릭을 위해 약간의 지연
		setTimeout(() => {
			showSuggestions = false;
			selectedIndex = -1;
		}, 200);
	}
</script>

<div class="relative">
	{#if label}
		<label class="block text-xs font-medium text-gray-700 mb-0.5">
			{label}
			{#if required}
				<span class="text-red-500">*</span>
			{/if}
		</label>
	{/if}

	<div class="relative">
		<input
			bind:this={inputElement}
			type="text"
			{placeholder}
			{disabled}
			{required}
			{value}
			oninput={handleInput}
			onkeydown={handleKeydown}
			onblur={handleBlur}
			class={inputClass}
			autocomplete="off"
		/>

		{#if isLoading}
			<div class="absolute right-2 top-1/2 -translate-y-1/2">
				<div class="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
			</div>
		{/if}
	</div>

	{#if showSuggestions && suggestions.length > 0}
		<div class="absolute z-50 w-full mt-1 bg-white border border-gray-300 rounded-md shadow-lg max-h-60 overflow-y-auto">
			{#each suggestions as item, index}
				<button
					type="button"
					class="w-full px-3 py-2 text-left hover:bg-blue-50 transition-colors {index === selectedIndex ? 'bg-blue-100' : ''}"
					onmousedown={(e) => { e.preventDefault(); selectItem(item); }}
				>
					<div class="text-sm font-medium text-gray-900">{item[displayKey]}</div>
					{#if subtextKey && item[subtextKey]}
						<div class="text-xs text-gray-500">{item[subtextKey]}</div>
					{/if}
				</button>
			{/each}
		</div>
	{/if}
</div>
