<script>
	export let node; // { label, ... }
</script>

<div style="display:flex; align-items:center; gap:6px; padding:6px 10px;">
	<img src="https://dummyimage.com/20x20/3b82f6/ffffff.png&text=+" alt="" width="20" height="20" />
	<div>
		<div style="font-weight:700; line-height:1;">{node.label}</div>
		<div style="font-size:12px; color:#64748b;">depth 기반 역할/메모 가능</div>
	</div>
</div>
