<script>
	import GradePaymentCard from '$lib/components/admin/GradePaymentCard.svelte';
	import WeeklyPaymentCard from '$lib/components/admin/WeeklyPaymentCard.svelte';
</script>

<svelte:head>
	<title>관리자 홈 - 나눔페이</title>
</svelte:head>

<div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-6">
	<div class="grid grid-cols-1 lg:grid-cols-2 gap-4 lg:gap-6">
		<!-- 왼쪽 카드: 등급별 지급 정보 -->
		<GradePaymentCard />

		<!-- 오른쪽 카드: 용역비 지급명부 -->
		<WeeklyPaymentCard />
	</div>

	<!-- 빠른 메뉴 섹션 -->
	<div class="mt-4 lg:mt-6 bg-white shadow-sm rounded-lg overflow-hidden">
		<div class="px-4 py-3 border-b border-gray-200 bg-gradient-to-r from-gray-50 to-gray-100">
			<h3 class="text-base sm:text-lg font-medium text-gray-900">빠른 메뉴</h3>
		</div>
		<div class="p-3 sm:p-4">
			<div class="grid grid-cols-3 gap-2 sm:gap-3 lg:gap-4">
				<a href="/admin/payment" class="block group">
					<div class="bg-gradient-to-br from-blue-50 to-blue-100 hover:from-blue-100 hover:to-blue-200 rounded-lg p-3 sm:p-4 text-center transition-all shadow-sm hover:shadow-md">
						<div class="inline-flex items-center justify-center w-10 h-10 sm:w-12 sm:h-12 bg-white rounded-lg shadow-sm mb-2 group-hover:scale-110 transition-transform">
							<svg class="w-5 h-5 sm:w-6 sm:h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
							</svg>
						</div>
						<p class="text-xs sm:text-sm font-medium text-blue-900">용역비 지급명부</p>
					</div>
				</a>
				<a href="/admin/members" class="block group">
					<div class="bg-gradient-to-br from-emerald-50 to-emerald-100 hover:from-emerald-100 hover:to-emerald-200 rounded-lg p-3 sm:p-4 text-center transition-all shadow-sm hover:shadow-md">
						<div class="inline-flex items-center justify-center w-10 h-10 sm:w-12 sm:h-12 bg-white rounded-lg shadow-sm mb-2 group-hover:scale-110 transition-transform">
							<svg class="w-5 h-5 sm:w-6 sm:h-6 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"></path>
							</svg>
						</div>
						<p class="text-xs sm:text-sm font-medium text-emerald-900">용역자 관리명부</p>
					</div>
				</a>
				<a href="/admin/organization" class="block group">
					<div class="bg-gradient-to-br from-purple-50 to-purple-100 hover:from-purple-100 hover:to-purple-200 rounded-lg p-3 sm:p-4 text-center transition-all shadow-sm hover:shadow-md">
						<div class="inline-flex items-center justify-center w-10 h-10 sm:w-12 sm:h-12 bg-white rounded-lg shadow-sm mb-2 group-hover:scale-110 transition-transform">
							<svg class="w-5 h-5 sm:w-6 sm:h-6 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"></path>
							</svg>
						</div>
						<p class="text-xs sm:text-sm font-medium text-purple-900">용역자 산하정보</p>
					</div>
				</a>
			</div>
		</div>
	</div>
</div>