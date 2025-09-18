// UI 테마 설정
export const theme = {
	// 버튼 스타일
	button: {
		// 크기
		size: {
			xs: 'px-2 py-1 text-xs',
			sm: 'px-3 py-1.5 text-sm',
			md: 'px-4 py-2 text-base',
			lg: 'px-6 py-3 text-lg'
		},
		// 색상 변형
		variant: {
			primary: 'bg-blue-600 text-white hover:bg-blue-700 focus:ring-2 focus:ring-blue-500',
			secondary: 'bg-gray-600 text-white hover:bg-gray-700 focus:ring-2 focus:ring-gray-500',
			success: 'bg-green-600 text-white hover:bg-green-700 focus:ring-2 focus:ring-green-500',
			danger: 'bg-red-600 text-white hover:bg-red-700 focus:ring-2 focus:ring-red-500',
			warning: 'bg-yellow-600 text-white hover:bg-yellow-700 focus:ring-2 focus:ring-yellow-500',
			outline: 'border border-gray-300 text-gray-700 hover:bg-gray-50 focus:ring-2 focus:ring-gray-500',
			ghost: 'text-gray-700 hover:bg-gray-100 focus:ring-2 focus:ring-gray-500'
		},
		// 아이콘 버튼
		icon: {
			xs: 'p-1',
			sm: 'p-1.5',
			md: 'p-2',
			lg: 'p-3'
		},
		// 기본 스타일
		base: 'inline-flex items-center justify-center font-medium rounded-md transition-colors focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed'
	},

	// 입력 필드 스타일
	input: {
		size: {
			sm: 'px-3 py-1.5 text-sm',
			md: 'px-4 py-2 text-base',
			lg: 'px-4 py-3 text-lg'
		},
		base: 'w-full border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors'
	},

	// 선택 박스 스타일
	select: {
		size: {
			sm: 'pl-3 pr-10 py-1.5 text-sm',
			md: 'pl-4 pr-10 py-2 text-base',
			lg: 'pl-4 pr-10 py-3 text-lg'
		},
		base: 'appearance-none bg-white border border-gray-300 rounded-md hover:border-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors cursor-pointer bg-no-repeat',
		backgroundImage: "background-image: url('/icons/chevron-down.svg'); background-position: right 0.5rem center; background-size: 1.5em 1.5em;"
	},

	// 모달 스타일
	modal: {
		overlay: 'fixed inset-0 bg-gray-600 bg-opacity-50 flex items-center justify-center z-50',
		container: {
			sm: 'bg-white rounded-lg p-4 w-full max-w-md max-h-[85vh] overflow-y-auto',
			md: 'bg-white rounded-lg p-6 w-full max-w-2xl max-h-[85vh] overflow-y-auto',
			lg: 'bg-white rounded-lg p-6 w-full max-w-3xl max-h-[85vh] overflow-y-auto',
			xl: 'bg-white rounded-lg p-6 w-full max-w-4xl max-h-[90vh] overflow-y-auto'
		}
	},

	// 카드 스타일
	card: {
		base: 'bg-white rounded-lg shadow',
		padding: {
			sm: 'p-3',
			md: 'p-4',
			lg: 'p-6'
		}
	},

	// 테이블 스타일
	table: {
		container: 'bg-white rounded-lg shadow overflow-hidden',
		wrapper: 'overflow-x-auto',
		base: 'divide-y divide-gray-200',
		minWidth: 'min-width: 1000px;',
		thead: 'bg-gray-50',
		th: {
			base: 'px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap',
			sortable: 'cursor-pointer hover:bg-gray-100'
		},
		td: {
			base: 'px-3 py-2 text-sm text-gray-700 whitespace-nowrap',
			sticky: 'sticky left-0 z-10 bg-white border-r border-gray-100'
		},
		row: 'hover:bg-gray-50'
	},

	// 페이지네이션 스타일
	pagination: {
		container: 'isolate inline-flex -space-x-px rounded-md shadow-sm',
		button: {
			base: 'relative inline-flex items-center px-3 py-1 text-sm font-medium border transition-all duration-200',
			active: 'z-20 bg-blue-600 border-blue-600 text-white shadow-lg transform scale-105',
			inactive: 'text-gray-700 bg-white border-gray-300 hover:bg-gray-50 hover:text-gray-900 focus:z-20 focus:outline-none focus:ring-2 focus:ring-blue-500'
		},
		arrow: {
			base: 'relative inline-flex items-center px-1.5 py-1 text-gray-400 ring-1 ring-inset ring-gray-300 hover:bg-gray-50 focus:z-20 focus:outline-offset-0 disabled:opacity-50 disabled:cursor-not-allowed',
			first: 'rounded-l-md',
			last: 'rounded-r-md'
		},
		dots: 'relative inline-flex items-center px-2 py-1 text-sm text-gray-700 bg-white border border-gray-300'
	},

	// 아이콘 크기
	icon: {
		xs: 'w-3 h-3',
		sm: 'w-3.5 h-3.5',
		md: 'w-4 h-4',
		lg: 'w-5 h-5',
		xl: 'w-6 h-6'
	},

	// 레이블 스타일
	label: {
		base: 'block text-sm font-medium text-gray-700 mb-1'
	},

	// 헤더 스타일
	header: {
		h1: 'text-2xl font-bold text-gray-800',
		h2: 'text-xl font-bold text-gray-800',
		h3: 'text-lg font-medium text-gray-900',
		h4: 'text-sm font-semibold text-gray-900',
		subtitle: 'text-gray-600 mt-1'
	},

	// 색상 팔레트
	colors: {
		primary: 'blue',
		secondary: 'gray',
		success: 'green',
		danger: 'red',
		warning: 'yellow',
		info: 'indigo'
	}
};

// 유틸리티 함수: 클래스 조합
export function cn(...classes) {
	return classes.filter(Boolean).join(' ');
}

// 버튼 클래스 생성 함수
export function getButtonClass(variant = 'primary', size = 'sm', isIcon = false) {
	const sizeClass = isIcon ? theme.button.icon[size] : theme.button.size[size];
	return cn(theme.button.base, theme.button.variant[variant], sizeClass);
}

// 입력 필드 클래스 생성 함수
export function getInputClass(size = 'md') {
	return cn(theme.input.base, theme.input.size[size]);
}

// 선택 박스 클래스 생성 함수
export function getSelectClass(size = 'sm') {
	return cn(theme.select.base, theme.select.size[size]);
}

// 모달 클래스 생성 함수
export function getModalClass(size = 'md') {
	return {
		overlay: theme.modal.overlay,
		container: theme.modal.container[size]
	};
}