// scripts/deploy.cjs
// 본 서버 (www.nanumasset.com) 배포용 스크립트
'use strict';

const fs = require('fs');
const path = require('path');
const cp = require('child_process');

const ROOT = process.cwd();
const RELEASE_DIR = path.join(ROOT, 'apps', 'web', 'release');
const SSH_KEY = path.join(process.env.HOME, '.ssh', 'nanumasset.pem');
const PROD_SERVER = '15.164.130.106';
const PROD_PORT = 3100;
const PROD_USER = 'ubuntu'; // nanumpay 배포용 사용자
const DOMAIN = 'www.nanumasset.com';

// 본 서버: 기본 HTTP+HTTPS 병행, --redirect 옵션 시 HTTPS 전용
const REDIRECT_MODE = process.argv.includes('--redirect');

// 설정 검증
function validateConfig() {
	console.log('[deploy] 배포 설정 검증 중...');

	// SSH 키 파일 확인
	if (!fs.existsSync(SSH_KEY)) {
		console.error(`❌ SSH 키 파일이 없습니다: ${SSH_KEY}`);
		console.error('   ~/.ssh/nanumasset 파일이 있는지 확인하세요.');
		process.exit(1);
	}

	// SSH 키 권한 확인 (600이어야 함)
	const stats = fs.statSync(SSH_KEY);
	const mode = stats.mode & parseInt('777', 8);
	if (mode !== parseInt('600', 8)) {
		console.warn(`⚠️  SSH 키 파일 권한이 올바르지 않습니다: ${mode.toString(8)}`);
		console.warn('   다음 명령으로 권한을 수정하세요:');
		console.warn(`   chmod 600 ${SSH_KEY}`);
	}

	// release 디렉토리 확인
	if (!fs.existsSync(RELEASE_DIR)) {
		console.error(`❌ release 디렉토리가 없습니다: ${RELEASE_DIR}`);
		console.error('   먼저 `pnpm release:linux` 명령을 실행하여 .deb 패키지를 생성하세요.');
		process.exit(1);
	}

	console.log('✅ 배포 설정 검증 완료');
}

// 최신 릴리스 폴더 찾기 (타임스탬프 폴더)
function findLatestRelease() {
	const dirs = fs
		.readdirSync(RELEASE_DIR)
		.filter((f) => {
			const fullPath = path.join(RELEASE_DIR, f);
			return fs.statSync(fullPath).isDirectory();
		})
		.map((f) => ({
			name: f,
			path: path.join(RELEASE_DIR, f),
			mtime: fs.statSync(path.join(RELEASE_DIR, f)).mtime
		}))
		.sort((a, b) => b.mtime - a.mtime);

	if (dirs.length === 0) {
		console.error('❌ 릴리스 폴더를 찾을 수 없습니다.');
		console.error('   먼저 `pnpm release:linux` 명령을 실행하여 패키지를 생성하세요.');
		process.exit(1);
	}

	const latest = dirs[0];

	// install.sh 확인
	const installScript = path.join(latest.path, 'install.sh');
	if (!fs.existsSync(installScript)) {
		console.error(`❌ install.sh가 없습니다: ${latest.name}`);
		process.exit(1);
	}

	// README.md 확인
	const readme = path.join(latest.path, 'README.md');
	if (!fs.existsSync(readme)) {
		console.warn(`⚠️  README.md가 없습니다: ${latest.name}`);
	}

	console.log(`📦 최신 릴리스 폴더: ${latest.name}`);
	return latest;
}

// SSH 연결 테스트
function testSSHConnection() {
	console.log(`🔗 SSH 연결 테스트: ${PROD_USER}@${PROD_SERVER}`);

	try {
		cp.execSync(
			`ssh -i "${SSH_KEY}" -o StrictHostKeyChecking=no -o ConnectTimeout=10 ${PROD_USER}@${PROD_SERVER} "echo 'SSH 연결 성공'"`,
			{
				stdio: ['ignore', 'pipe', 'pipe'],
				timeout: 15000
			}
		);
		console.log('✅ SSH 연결 성공');
	} catch (error) {
		console.error('❌ SSH 연결 실패');
		console.error('   다음을 확인하세요:');
		console.error('   1. 서버 주소가 올바른지 확인');
		console.error('   2. SSH 키 파일이 올바른지 확인');
		console.error('   3. 서버가 실행 중인지 확인');
		console.error('   4. 방화벽 설정 확인');
		process.exit(1);
	}
}

// 릴리스 폴더 업로드 (DEB + install.sh + README.md)
function uploadRelease(release) {
	console.log(`📤 릴리스 패키지 업로드 중: ${release.name}`);

	const remotePath = `~/nanumpay-release`;

	try {
		// 원격 디렉토리 생성 및 기존 파일 정리
		cp.execSync(
			`ssh -i "${SSH_KEY}" -o StrictHostKeyChecking=no ${PROD_USER}@${PROD_SERVER} "rm -rf ${remotePath} && mkdir -p ${remotePath}"`,
			{
				stdio: 'inherit'
			}
		);

		// 릴리스 폴더 전체 업로드
		cp.execSync(
			`scp -i "${SSH_KEY}" -o StrictHostKeyChecking=no -r "${release.path}"/* ${PROD_USER}@${PROD_SERVER}:${remotePath}/`,
			{
				stdio: 'inherit'
			}
		);
		console.log('✅ 릴리스 패키지 업로드 완료');
		console.log('   - DEB 파일');
		console.log('   - install.sh');
		console.log('   - README.md');
		return remotePath;
	} catch (error) {
		console.error('❌ 파일 업로드 실패');
		console.error(error.message);
		process.exit(1);
	}
}

// install.sh를 사용한 자동 설치 (nginx 설정 보존)
function installPackage(remotePath) {
	console.log('🔧 install.sh를 사용하여 자동 설치 중...');

	const commands = [
		'# 릴리스 디렉토리로 이동',
		`cd ${remotePath}`,
		'',
		'# 기존 nginx 설정 백업 (커스텀 SSL 설정 보존)',
		'echo "📋 nginx 설정 백업 중..."',
		'if [ -f /etc/nginx/sites-available/nanumpay ]; then',
		'  sudo cp /etc/nginx/sites-available/nanumpay /tmp/nginx-nanumpay.backup',
		'  echo "✅ nginx 설정 백업 완료"',
		'fi',
		'',
		'# install.sh 실행 (자동으로 nginx, 의존성, nanumpay 설치)',
		'echo "📦 install.sh 실행 중..."',
		'sudo bash install.sh',
		'',
		'# nginx 설정 복원 (커스텀 SSL 설정)',
		'echo "📋 nginx 설정 복원 중..."',
		'if [ -f /tmp/nginx-nanumpay.backup ]; then',
		'  sudo cp /tmp/nginx-nanumpay.backup /etc/nginx/sites-available/nanumpay',
		'  sudo rm -f /tmp/nginx-nanumpay.backup',
		'  echo "✅ nginx 설정 복원 완료"',
		'fi',
		'',
		'# nginx symlink 확인 및 생성',
		'if [ ! -L /etc/nginx/sites-enabled/nanumpay ]; then',
		'  sudo ln -sf /etc/nginx/sites-available/nanumpay /etc/nginx/sites-enabled/nanumpay',
		'  echo "✅ nginx symlink 생성"',
		'fi',
		'',
		'# nginx 설정 테스트 및 reload',
		'if sudo nginx -t 2>&1 | grep -q "successful"; then',
		'  sudo systemctl reload nginx',
		'  echo "✅ nginx reload 완료"',
		'else',
		'  echo "⚠️  nginx 설정 테스트 실패 - 수동 확인 필요"',
		'fi',
		'',
		'# 방화벽 설정 (포트 80, 443, 3100)',
		'echo "🔥 방화벽 설정 중..."',
		'if command -v ufw >/dev/null 2>&1; then',
		'  UFW_STATUS=$(sudo ufw status | head -1)',
		'  if echo "$UFW_STATUS" | grep -q "Status: active"; then',
		'    sudo ufw allow 80/tcp || true',
		'    sudo ufw allow 443/tcp || true',
		'    sudo ufw allow 3100/tcp || true',
		'    echo "✅ 포트 80, 443, 3100 허용 완료"',
		'  fi',
		'fi',
		'',
		'echo "✅ 배포 완료!"'
	];

	const script = commands.join('\n');

	try {
		cp.execSync(
			`ssh -i "${SSH_KEY}" -o StrictHostKeyChecking=no ${PROD_USER}@${PROD_SERVER} '${script}'`,
			{
				stdio: 'inherit'
			}
		);
		console.log('✅ 패키지 설치 및 서비스 시작 완료');
	} catch (error) {
		console.error('❌ 패키지 설치 실패');
		console.error('서버에 SSH로 접속하여 수동으로 확인하세요:');
		console.error(`ssh -i "${SSH_KEY}" ${PROD_USER}@${PROD_SERVER}`);
		process.exit(1);
	}
}

// SSL 설정 (자동)
function setupSSL() {
	const mode = REDIRECT_MODE ? 'HTTPS 전용 (HTTP 리다이렉트)' : 'HTTP + HTTPS 병행';
	const redirectFlag = REDIRECT_MODE ? ' --redirect' : '';

	console.log('🔐 SSL 인증서 설정 중...');
	console.log(`   도메인: ${DOMAIN}`);
	console.log(`   모드: ${mode}`);

	const sslCommands = [
		'# SSL 설정 스크립트 실행',
		`if [ -f "/opt/nanumpay/ssl/setup-ssl.sh" ]; then`,
		`  sudo /opt/nanumpay/ssl/setup-ssl.sh ${DOMAIN}${redirectFlag}`,
		`else`,
		`  echo "⚠️  SSL 설정 스크립트가 없습니다"`,
		`  echo "   패키지를 다시 설치하거나 수동으로 설정하세요"`,
		`fi`
	];

	const script = sslCommands.join('\n');

	try {
		cp.execSync(
			`ssh -i "${SSH_KEY}" -o StrictHostKeyChecking=no ${PROD_USER}@${PROD_SERVER} '${script}'`,
			{
				stdio: 'inherit'
			}
		);
		console.log('✅ SSL 설정 완료');
	} catch (error) {
		console.warn('⚠️  SSL 설정 중 오류 발생 (HTTP는 정상 작동)');
		console.warn('   서버에 접속하여 수동으로 설정하세요:');
		console.warn(`   sudo /opt/nanumpay/ssl/setup-ssl.sh ${DOMAIN}${redirectFlag}`);
	}
}

// 배포 후 상태 확인
function verifyDeployment() {
	console.log('🔍 배포 상태 확인 중...');

	try {
		// 포트 80 (Nginx) 확인
		const port80Result = cp
			.execSync(
				`ssh -i "${SSH_KEY}" -o StrictHostKeyChecking=no ${PROD_USER}@${PROD_SERVER} "curl -s -o /dev/null -w '%{http_code}' http://localhost || echo 'CURL_FAILED'"`,
				{
					stdio: ['ignore', 'pipe', 'ignore'],
					encoding: 'utf8'
				}
			)
			.trim();

		// 포트 3100 (Nanumpay) 확인
		const port3100Result = cp
			.execSync(
				`ssh -i "${SSH_KEY}" -o StrictHostKeyChecking=no ${PROD_USER}@${PROD_SERVER} "curl -s -o /dev/null -w '%{http_code}' http://localhost:${PROD_PORT} || echo 'CURL_FAILED'"`,
				{
					stdio: ['ignore', 'pipe', 'ignore'],
					encoding: 'utf8'
				}
			)
			.trim();

		console.log('');
		console.log('📊 서비스 상태:');

		if (port80Result === '200' || port80Result === '302') {
			console.log('✅ Nginx (포트 80): 정상');
		} else {
			console.warn(`⚠️  Nginx (포트 80): 응답 코드 ${port80Result}`);
		}

		if (port3100Result === '200' || port3100Result === '302') {
			console.log('✅ Nanumpay (포트 3100): 정상');
		} else {
			console.warn(`⚠️  Nanumpay (포트 3100): 응답 코드 ${port3100Result}`);
		}

		// 외부 접속 테스트 (포트 80)
		console.log('');
		console.log('🌍 외부 접속 테스트 중...');
		try {
			const externalTest80 = cp
				.execSync(
					`curl -s -o /dev/null -w '%{http_code}' --connect-timeout 10 http://${PROD_SERVER} || echo 'EXTERNAL_FAILED'`,
					{
						stdio: ['ignore', 'pipe', 'ignore'],
						encoding: 'utf8',
						timeout: 15000
					}
				)
				.trim();

			if (externalTest80 === '200' || externalTest80 === '302') {
				console.log('✅ 외부에서 포트 80 접속 가능');
			} else if (externalTest80 === 'EXTERNAL_FAILED') {
				console.warn('⚠️  외부 접속 실패 - 방화벽/보안그룹 확인 필요');
				console.warn('   AWS EC2인 경우 보안 그룹에서 포트 80을 허용하세요');
			} else {
				console.warn(`⚠️  외부 접속 응답 코드: ${externalTest80}`);
			}
		} catch (error) {
			console.warn('⚠️  외부 접속 테스트 실패 - 방화벽 설정을 확인하세요');
		}
	} catch (error) {
		console.warn('⚠️  상태 확인 중 오류 발생 (정상적일 수 있음)');
	}

	console.log('');
	console.log('📋 수동 확인 명령어:');
	console.log(`ssh -i "${SSH_KEY}" ${PROD_USER}@${PROD_SERVER}`);
	console.log('sudo systemctl status nginx');
	console.log('sudo systemctl status nanumpay');
	console.log('sudo systemctl status mongod');
	console.log('sudo journalctl -u nanumpay -f');
	console.log('sudo nginx -t');
	console.log('sudo ufw status');
	console.log('');
	console.log('🔗 브라우저에서 확인:');
	console.log(`   HTTP:  http://${DOMAIN}`);
	console.log(`   HTTPS: https://${DOMAIN} (SSL 설정 후)`);
	console.log(`   직접:  http://${PROD_SERVER}:${PROD_PORT}`);
}

// 메인 함수
function main() {
	console.log('🚀 NanumPay 본 서버 배포 시작');
	console.log('==============================');
	console.log(`📍 대상 서버: ${PROD_SERVER}`);
	console.log(`📍 도메인: ${DOMAIN}`);
	console.log(`🔐 SSL: ${REDIRECT_MODE ? 'HTTPS 전용' : 'HTTP+HTTPS 병행'}`);
	console.log('');

	try {
		// 1. 설정 검증
		validateConfig();

		// 2. 최신 릴리스 폴더 찾기
		const release = findLatestRelease();

		// 3. SSH 연결 테스트
		testSSHConnection();

		// 4. 릴리스 패키지 업로드 (DEB + install.sh + README.md)
		const remotePath = uploadRelease(release);

		// 5. install.sh를 사용한 자동 설치
		installPackage(remotePath);

		// 6. SSL 설정 (자동)
		setupSSL();

		// 7. 배포 상태 확인
		verifyDeployment();

		console.log('');
		console.log('🎉 배포가 성공적으로 완료되었습니다!');
		console.log('');
		console.log('📋 배포된 내용:');
		console.log(`   - 릴리스: ${release.name}`);
		console.log('   - Nginx (포트 80/443)');
		console.log('   - Nanumpay (포트 3100)');
		console.log('   - MongoDB');
		console.log("   - SSL 인증서 (Let's Encrypt)");
	} catch (error) {
		console.error('❌ 배포 실패:', error.message);
		process.exit(1);
	}
}

// 스크립트 실행
if (require.main === module) {
	main();
}
