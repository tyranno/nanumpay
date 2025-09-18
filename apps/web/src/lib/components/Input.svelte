<script>
	import { getInputClass } from '$lib/theme.js';

	let {
		size = 'md',
		type = 'text',
		value = $bindable(),
		placeholder = '',
		disabled = false,
		oninput = null,
		class: className = '',
		...rest
	} = $props();

	$: inputClass = getInputClass(size) + ' ' + className;
</script>

<input
	{type}
	bind:value
	{placeholder}
	{disabled}
	{oninput}
	class={inputClass}
	{...rest}
/>