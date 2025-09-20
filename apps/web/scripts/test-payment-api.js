import fetch from 'node-fetch';

const BASE_URL = 'http://localhost:5173'; // 개발 서버 URL

async function testPaymentAPI() {
	console.log('=== 결제 API 테스트 시작 ===\n');

	// 1. 2025년 7월 1주차 테스트
	console.log('1. 2025년 7월 1주차 데이터 조회 테스트');
	try {
		const response = await fetch(`${BASE_URL}/api/admin/payment/schedule?year=2025&month=7&week=1`);
		const data = await response.json();

		console.log('응답 상태:', response.status);
		console.log('응답 데이터:', JSON.stringify(data, null, 2));

		if (data.success && data.data) {
			console.log('성공: 데이터 반환됨');
			console.log(`- 대상자 수: ${data.data.payments?.length || 0}명`);
			console.log(`- 총 지급액: ${data.data.totalPayment?.toLocaleString() || 0}원`);
		} else {
			console.log('실패:', data.error || '알 수 없는 오류');
		}
	} catch (error) {
		console.error('API 호출 오류:', error.message);
	}

	console.log('\n');

	// 2. 2025년 8월 1주차 테스트 (여러 매출의 분할금이 합쳐지는 주차)
	console.log('2. 2025년 8월 1주차 데이터 조회 테스트');
	try {
		const response = await fetch(`${BASE_URL}/api/admin/payment/schedule?year=2025&month=8&week=1`);
		const data = await response.json();

		console.log('응답 상태:', response.status);
		console.log('응답 데이터:', JSON.stringify(data, null, 2));

		if (data.success && data.data) {
			console.log('성공: 데이터 반환됨');
			console.log(`- 대상자 수: ${data.data.payments?.length || 0}명`);
			console.log(`- 총 지급액: ${data.data.totalPayment?.toLocaleString() || 0}원`);
		} else {
			console.log('실패:', data.error || '알 수 없는 오류');
		}
	} catch (error) {
		console.error('API 호출 오류:', error.message);
	}

	console.log('\n');

	// 3. 잘못된 파라미터 테스트
	console.log('3. 잘못된 파라미터 테스트');
	try {
		const response = await fetch(`${BASE_URL}/api/admin/payment/schedule?year=2024&month=1&week=1`);
		const data = await response.json();

		console.log('응답 상태:', response.status);
		console.log('응답 메시지:', data.error || data.message);
	} catch (error) {
		console.error('API 호출 오류:', error.message);
	}

	console.log('\n=== 결제 API 테스트 완료 ===');
}

testPaymentAPI().catch(console.error);