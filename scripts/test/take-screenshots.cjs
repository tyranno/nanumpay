#!/usr/bin/env node
/**
 * 앱스토어 등록용 스크린샷 생성 스크립트
 * Playwright를 사용하여 관리자/사용자/설계사 페이지 스크린샷
 */
'use strict';

const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const BASE_URL = 'http://localhost:3100';
const OUTPUT_DIR = path.join(__dirname, '../../apps/app/docs/reg/screenshots');

// 계정 정보
const ACCOUNTS = {
	admin: { loginId: '관리자', password: 'admin1234!!', type: 'admin' },
	user: { loginId: '사장님', password: '0000', type: 'user' },
	planner: { loginId: '설계사', password: '0000', type: 'planner' }
};

// 관리자 페이지 목록
const ADMIN_PAGES = [
	{ name: 'home', path: '/admin', title: '관리자 홈' },
	{ name: 'members', path: '/admin/members', title: '용역자 관리' },
	{ name: 'organization', path: '/admin/organization', title: '조직도' },
	{ name: 'payment', path: '/admin/payment', title: '용역비 관리대장' },
	{ name: 'planner-commission', path: '/admin/planner-commission', title: '설계사 수수료' },
	{ name: 'tax', path: '/admin/tax', title: '세금 관리' },
	{ name: 'settings', path: '/admin/settings', title: '설정' }
];

// 사용자 페이지 목록
const USER_PAGES = [
	{ name: 'home', path: '/dashboard', title: '대시보드' },
	{ name: 'income', path: '/dashboard/income', title: '수입 내역' },
	{ name: 'network', path: '/dashboard/network', title: '네트워크' },
	{ name: 'profile', path: '/dashboard/profile', title: '프로필' }
];

// 설계사 페이지 목록
const PLANNER_PAGES = [
	{ name: 'home', path: '/planner', title: '설계사 홈' }
];

async function closeAllAlerts(page) {
	// 여러 종류의 알림창/모달 닫기 시도
	const closeSelectors = [
		'button:has-text("확인")',
		'button:has-text("닫기")',
		'button:has-text("OK")',
		'button:has-text("다음에")',
		'button:has-text("나중에")',
		'button:has-text("건너뛰기")',
		'.modal button.close',
		'.modal-footer button',
		'[data-dismiss="modal"]',
		'.alert button',
		'button.btn-close',
		'.swal2-confirm',
		'.swal2-close'
	];

	let closedCount = 0;
	for (let round = 0; round < 5; round++) {
		let closedThisRound = false;

		for (const selector of closeSelectors) {
			try {
				const btn = page.locator(selector).first();
				if (await btn.isVisible({ timeout: 300 }).catch(() => false)) {
					await btn.click();
					await page.waitForTimeout(300);
					closedCount++;
					closedThisRound = true;
					break;
				}
			} catch (e) {
				// 무시
			}
		}

		if (!closedThisRound) break;
	}

	if (closedCount > 0) {
		console.log(`   🔔 알림창 ${closedCount}개 닫음`);
	}
	return closedCount;
}

async function login(page, account) {
	console.log(`🔐 ${account.type} 로그인: ${account.loginId}`);

	await page.goto(`${BASE_URL}/login`);
	await page.waitForLoadState('networkidle');

	// 로그인 폼 입력
	await page.fill('input[name="loginId"], input[placeholder*="아이디"]', account.loginId);
	await page.fill('input[name="password"], input[type="password"]', account.password);

	// 역할 선택 (사용자/설계사인 경우)
	if (account.type === 'user') {
		const userRadio = page.locator('input[value="user"], label:has-text("용역자")');
		if (await userRadio.count() > 0) {
			await userRadio.first().click();
		}
	} else if (account.type === 'planner') {
		const plannerRadio = page.locator('input[value="planner"], label:has-text("설계사")');
		if (await plannerRadio.count() > 0) {
			await plannerRadio.first().click();
		}
	}

	// 로그인 버튼 클릭
	await page.click('button[type="submit"], button:has-text("로그인")');
	await page.waitForLoadState('networkidle');
	await page.waitForTimeout(1500);

	// 로그인 후 알림창 닫기 (암호 설정, 보험 관련 등)
	await closeAllAlerts(page);
	await page.waitForTimeout(500);

	console.log(`✅ 로그인 성공`);
}

async function takeScreenshot(page, outputPath, name) {
	await page.waitForLoadState('networkidle');
	await page.waitForTimeout(500);

	const filePath = path.join(outputPath, `${name}.png`);
	await page.screenshot({ path: filePath, fullPage: false });
	console.log(`   📸 ${name}.png`);
}

async function capturePages(page, pages, outputDir, role) {
	const roleDir = path.join(outputDir, role);
	fs.mkdirSync(roleDir, { recursive: true });

	console.log(`\n📁 ${role} 페이지 스크린샷 (${pages.length}개)`);

	for (const pageInfo of pages) {
		try {
			await page.goto(`${BASE_URL}${pageInfo.path}`);
			await page.waitForLoadState('networkidle');
			await page.waitForTimeout(500);

			// 알림창 닫기
			await closeAllAlerts(page);

			await takeScreenshot(page, roleDir, pageInfo.name);
		} catch (error) {
			console.log(`   ❌ ${pageInfo.name} 실패: ${error.message}`);
		}
	}
}

async function main() {
	console.log('🚀 앱스토어 스크린샷 생성 시작\n');
	console.log(`📂 출력 경로: ${OUTPUT_DIR}\n`);

	// 출력 디렉토리 생성
	fs.mkdirSync(OUTPUT_DIR, { recursive: true });

	const browser = await chromium.launch({ headless: true });
	const context = await browser.newContext({
		viewport: { width: 1280, height: 800 }
	});
	const page = await context.newPage();

	try {
		// 1. 관리자 스크린샷
		await login(page, ACCOUNTS.admin);
		await capturePages(page, ADMIN_PAGES, OUTPUT_DIR, 'admin');

		// 로그아웃
		await page.goto(`${BASE_URL}/logout`);
		await page.waitForTimeout(500);

		// 2. 사용자 스크린샷
		await login(page, ACCOUNTS.user);
		await capturePages(page, USER_PAGES, OUTPUT_DIR, 'user');

		// 로그아웃
		await page.goto(`${BASE_URL}/logout`);
		await page.waitForTimeout(500);

		// 3. 설계사 스크린샷
		await login(page, ACCOUNTS.planner);
		await capturePages(page, PLANNER_PAGES, OUTPUT_DIR, 'planner');

		console.log('\n✅ 스크린샷 생성 완료!');
		console.log(`📂 ${OUTPUT_DIR}`);

	} catch (error) {
		console.error(`\n❌ 오류: ${error.message}`);
	} finally {
		await browser.close();
	}
}

main();
