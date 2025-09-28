// scripts/deploy.cjs
'use strict';

const fs = require('fs');
const path = require('path');
const cp = require('child_process');

const ROOT = process.cwd();
const RELEASE_DIR = path.join(ROOT, 'release');
const SSH_KEY = path.join(process.env.HOME, '.ssh', 'ocp_tyranno');
const PROD_SERVER = '34.170.107.151';
const PROD_PORT = 3100;
const PROD_USER = 'tyranno'; // nanumpay 배포용 사용자

// 설정 검증
function validateConfig() {
	console.log('[deploy] 배포 설정 검증 중...');

	// SSH 키 파일 확인
	if (!fs.existsSync(SSH_KEY)) {
		console.error(`❌ SSH 키 파일이 없습니다: ${SSH_KEY}`);
		console.error('   ~/.ssh/ocp_tyranno 파일이 있는지 확인하세요.');
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

// 최신 .deb 파일 찾기
function findLatestDeb() {
	const files = fs.readdirSync(RELEASE_DIR)
		.filter(f => f.endsWith('.deb') && f.startsWith('nanumpay'))
		.map(f => ({
			name: f,
			path: path.join(RELEASE_DIR, f),
			mtime: fs.statSync(path.join(RELEASE_DIR, f)).mtime
		}))
		.sort((a, b) => b.mtime - a.mtime);

	if (files.length === 0) {
		console.error('❌ .deb 파일을 찾을 수 없습니다.');
		console.error('   먼저 `pnpm release:linux` 명령을 실행하여 패키지를 생성하세요.');
		process.exit(1);
	}

	const latest = files[0];
	console.log(`📦 최신 .deb 파일: ${latest.name}`);
	return latest;
}

// SSH 연결 테스트
function testSSHConnection() {
	console.log(`🔗 SSH 연결 테스트: ${PROD_USER}@${PROD_SERVER}`);

	try {
		cp.execSync(`ssh -i "${SSH_KEY}" -o StrictHostKeyChecking=no -o ConnectTimeout=10 ${PROD_USER}@${PROD_SERVER} "echo 'SSH 연결 성공'"`, {
			stdio: ['ignore', 'pipe', 'pipe'],
			timeout: 15000
		});
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

// .deb 파일 업로드
function uploadDeb(debFile) {
	console.log(`📤 .deb 파일 업로드 중: ${debFile.name}`);

	const remotePath = `~/nanumpay/${debFile.name}`;

	try {
		cp.execSync(`scp -i "${SSH_KEY}" -o StrictHostKeyChecking=no "${debFile.path}" ${PROD_USER}@${PROD_SERVER}:${remotePath}`, {
			stdio: 'inherit'
		});
		console.log('✅ 파일 업로드 완료');
		return remotePath;
	} catch (error) {
		console.error('❌ 파일 업로드 실패');
		console.error(error.message);
		process.exit(1);
	}
}

// 기존 서비스 중지 및 패키지 설치
function installPackage(remotePath) {
	console.log('🔧 서비스 중지 및 패키지 설치 중...');

	const commands = [
		'# nanumpay 디렉토리 생성',
		'mkdir -p ~/nanumpay',
		'',
		'# 기존 서비스 중지 (있는 경우)',
		'sudo systemctl stop nanumpay.service || true',
		'sudo systemctl disable nanumpay.service || true',
		'',
		'# 기존 패키지 제거 (있는 경우)',
		'sudo dpkg -r nanumpay || true',
		'',
		'# MongoDB 설치 확인 및 설치',
		'echo "🗄️ MongoDB 설치 확인 중..."',
		'if ! command -v mongod >/dev/null 2>&1; then',
		'  echo "MongoDB가 설치되어 있지 않습니다. 설치를 진행합니다..."',
		'  # MongoDB 공식 GPG 키 추가',
		'  curl -fsSL https://pgp.mongodb.com/server-7.0.asc | sudo gpg -o /usr/share/keyrings/mongodb-server-7.0.gpg --dearmor',
		'  # MongoDB 저장소 추가',
		'  echo "deb [ arch=amd64,arm64 signed-by=/usr/share/keyrings/mongodb-server-7.0.gpg ] https://repo.mongodb.org/apt/ubuntu jammy/mongodb-org/7.0 multiverse" | sudo tee /etc/apt/sources.list.d/mongodb-org-7.0.list',
		'  # 패키지 목록 업데이트',
		'  sudo apt-get update',
		'  # MongoDB 설치',
		'  sudo apt-get install -y mongodb-org',
		'  # MongoDB 서비스 시작 및 활성화',
		'  sudo systemctl start mongod',
		'  sudo systemctl enable mongod',
		'  echo "✅ MongoDB 설치 및 시작 완료"',
		'else',
		'  echo "✅ MongoDB가 이미 설치되어 있습니다"',
		'  # MongoDB 서비스 상태 확인 및 시작',
		'  if ! sudo systemctl is-active --quiet mongod; then',
		'    echo "MongoDB 서비스를 시작합니다..."',
		'    sudo systemctl start mongod',
		'  fi',
		'fi',
		'',
		'# 새 패키지 설치',
		`sudo dpkg -i ${remotePath}`,
		'',
		'# 의존성 문제 해결 (있는 경우)',
		'sudo apt-get install -f -y',
		'',
		'# 방화벽 설정 확인 및 포트 열기',
		'echo "🔥 방화벽 설정 확인 중..."',
		'if command -v ufw >/dev/null 2>&1; then',
		'  # UFW가 설치되어 있는 경우',
		'  UFW_STATUS=$(sudo ufw status | head -1)',
		'  echo "방화벽 상태: $UFW_STATUS"',
		'  if echo "$UFW_STATUS" | grep -q "Status: active"; then',
		'    # UFW가 활성화된 경우 포트 3100 확인',
		'    if ! sudo ufw status | grep -q "3100"; then',
		'      echo "포트 3100을 방화벽에서 허용합니다..."',
		'      sudo ufw allow 3100/tcp',
		'      echo "✅ 포트 3100 허용 완료"',
		'    else',
		'      echo "✅ 포트 3100이 이미 허용되어 있습니다"',
		'    fi',
		'  else',
		'    echo "ℹ️ UFW가 비활성화되어 있습니다"',
		'  fi',
		'else',
		'  echo "ℹ️ UFW가 설치되어 있지 않습니다"',
		'fi',
		'',
		'# iptables 확인 (추가 보안)',
		'if command -v iptables >/dev/null 2>&1; then',
		'  echo "📋 현재 iptables 규칙 확인..."',
		'  sudo iptables -L INPUT -n | grep -q ":3100" || echo "⚠️  iptables에서 포트 3100 규칙을 확인하세요"',
		'fi',
		'',
		'# 서비스 상태 확인',
		'echo "📊 서비스 상태 확인..."',
		'echo "🗄️ MongoDB 상태:"',
		'sudo systemctl status mongod --no-pager -l || echo "MongoDB 상태 확인 실패"',
		'echo ""',
		'echo "🚀 NanumPay 서비스 상태:"',
		'sudo systemctl status nanumpay.service --no-pager -l || echo "NanumPay 서비스 상태 확인 실패"',
		'',
		'# 임시 파일 정리',
		`rm -f ${remotePath}`,
		'',
		'echo "✅ 배포 완료!"'
	];

	const script = commands.join('\n');

	try {
		cp.execSync(`ssh -i "${SSH_KEY}" -o StrictHostKeyChecking=no ${PROD_USER}@${PROD_SERVER} '${script}'`, {
			stdio: 'inherit'
		});
		console.log('✅ 패키지 설치 및 서비스 시작 완료');
	} catch (error) {
		console.error('❌ 패키지 설치 실패');
		console.error('서버에 SSH로 접속하여 수동으로 확인하세요:');
		console.error(`ssh -i "${SSH_KEY}" ${PROD_USER}@${PROD_SERVER}`);
		process.exit(1);
	}
}

// 배포 후 상태 확인
function verifyDeployment() {
	console.log('🔍 배포 상태 확인 중...');

	try {
		const result = cp.execSync(`ssh -i "${SSH_KEY}" -o StrictHostKeyChecking=no ${PROD_USER}@${PROD_SERVER} "curl -s -o /dev/null -w '%{http_code}' http://localhost:${PROD_PORT} || echo 'CURL_FAILED'"`, {
			stdio: ['ignore', 'pipe', 'ignore'],
			encoding: 'utf8'
		}).trim();

		if (result === '200') {
			console.log('✅ 서비스가 정상적으로 실행 중입니다');
			console.log(`🌐 서비스 URL: http://${PROD_SERVER}:${PROD_PORT}`);

			// 외부 접속 테스트
			console.log('🌍 외부 접속 테스트 중...');
			try {
				const externalTest = cp.execSync(`curl -s -o /dev/null -w '%{http_code}' --connect-timeout 10 http://${PROD_SERVER}:${PROD_PORT} || echo 'EXTERNAL_FAILED'`, {
					stdio: ['ignore', 'pipe', 'ignore'],
					encoding: 'utf8',
					timeout: 15000
				}).trim();

				if (externalTest === '200') {
					console.log('✅ 외부에서 접속 가능합니다');
				} else if (externalTest === 'EXTERNAL_FAILED') {
					console.warn('⚠️  외부 접속 실패 - 방화벽/보안그룹 확인 필요');
					console.warn(`   AWS EC2인 경우 보안 그룹에서 포트 ${PROD_PORT}을 허용하세요`);
				} else {
					console.warn(`⚠️  외부 접속 응답 코드: ${externalTest}`);
				}
			} catch (error) {
				console.warn('⚠️  외부 접속 테스트 실패 - 방화벽 설정을 확인하세요');
			}

		} else if (result === 'CURL_FAILED') {
			console.warn('⚠️  서버 내부 curl 명령이 실패했습니다. 서비스 로그를 확인하세요.');
		} else {
			console.warn(`⚠️  HTTP 응답 코드: ${result}`);
		}
	} catch (error) {
		console.warn('⚠️  상태 확인 중 오류 발생 (정상적일 수 있음)');
	}

	console.log('');
	console.log('📋 수동 확인 명령어:');
	console.log(`ssh -i "${SSH_KEY}" ${PROD_USER}@${PROD_SERVER}`);
	console.log('sudo systemctl status mongod');
	console.log('sudo systemctl status nanumpay.service');
	console.log('sudo journalctl -u nanumpay.service -f');
	console.log('mongo --eval "db.adminCommand(\'listCollections\')"');
	console.log('sudo ufw status');
	console.log('');
	console.log('🔗 브라우저에서 확인:');
	console.log(`http://${PROD_SERVER}:${PROD_PORT}`);
}

// 메인 함수
function main() {
	console.log('🚀 NanumPay 프로덕션 배포 시작');
	console.log('==============================');

	try {
		// 1. 설정 검증
		validateConfig();

		// 2. 최신 .deb 파일 찾기
		const debFile = findLatestDeb();

		// 3. SSH 연결 테스트
		testSSHConnection();

		// 4. .deb 파일 업로드
		const remotePath = uploadDeb(debFile);

		// 5. 패키지 설치
		installPackage(remotePath);

		// 6. 배포 상태 확인
		verifyDeployment();

		console.log('');
		console.log('🎉 배포가 성공적으로 완료되었습니다!');

	} catch (error) {
		console.error('❌ 배포 실패:', error.message);
		process.exit(1);
	}
}

// 스크립트 실행
if (require.main === module) {
	main();
}