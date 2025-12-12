// scripts/release-linux.cjs
'use strict';

const fs = require('fs');
const path = require('path');
const cp = require('child_process');

// 빌드 시 해시 생성용(대상 서버엔 Node 불필요)
let bcrypt;
try {
	bcrypt = require('bcryptjs');
} catch {
	/* 선택사항 */
}

const ROOT = process.cwd();
const DIST = path.join(ROOT, 'dist');
const BIN = path.join(DIST, 'nanumpay'); // @jesterkit/exe-sveltekit 결과물

if (!fs.existsSync(BIN)) {
	console.error('dist/nanumpay 가 없습니다. 먼저 `yarn exe:linux` 실행하세요.');
	process.exit(1);
}

const pkg = require(path.join(ROOT, 'package.json'));
const version = pkg.version || '0.0.0';
const now = new Date();
const stamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(
	now.getDate()
).padStart(2, '0')}`;

const stage = path.join(ROOT, '.stage', `deb_${version}_${stamp}`);
const pkgDir = path.join(stage, `nanumpay_${version}-${stamp}_amd64`);
const debian = path.join(pkgDir, 'DEBIAN');
const optDir = path.join(pkgDir, 'opt', 'nanumpay');
const etcDir = path.join(pkgDir, 'etc', 'nanumpay');
const sysdDir = path.join(pkgDir, 'etc', 'systemd', 'system');
const nginxAvailableDir = path.join(pkgDir, 'etc', 'nginx', 'sites-available');
const dbDir = path.join(optDir, 'db');
const toolsDir = path.join(optDir, 'tools');
const binDir = path.join(optDir, 'bin');
const sslDir = path.join(optDir, 'ssl');
const staticDir = path.join(optDir, 'static');

fs.rmSync(stage, { recursive: true, force: true });
[debian, optDir, etcDir, sysdDir, nginxAvailableDir, dbDir, toolsDir, binDir, sslDir, staticDir].forEach((d) =>
	fs.mkdirSync(d, { recursive: true })
);

// 1) 단일 실행파일
fs.copyFileSync(BIN, path.join(optDir, 'nanumpay'));
fs.chmodSync(path.join(optDir, 'nanumpay'), 0o755);

// 2) 환경파일(설정 샘플)
fs.writeFileSync(
	path.join(etcDir, 'nanumpay.env'),
	`PORT=3100
HOST=0.0.0.0
MONGODB_URI=mongodb://localhost:27017/nanumpay
JWT_SECRET=change-me
JWT_EXPIRES=7d
`
);

// 3) DB 초기화 스크립트
const dbInitScript = path.join(ROOT, 'install', 'db', 'init.mongo.js');
if (!fs.existsSync(dbInitScript)) {
	console.error(`[release:linux] 누락: ${dbInitScript}`);
	process.exit(1);
}
fs.copyFileSync(dbInitScript, path.join(dbDir, 'init.mongo.js'));

// 4) ★ 리눅스 초기화 스크립트: 기존 경로 유지(리포지토리), 설치 위치는 /opt/nanumpay/tools/db_init.sh
const linuxInitShSrc = path.join(ROOT, 'install', 'linux', 'db_init.sh');
if (!fs.existsSync(linuxInitShSrc)) {
	console.error(`[release:linux] 누락: ${linuxInitShSrc}`);
	process.exit(1);
}
const linuxInitShDst = path.join(toolsDir, 'db_init.sh');
fs.copyFileSync(linuxInitShSrc, linuxInitShDst);
fs.chmodSync(linuxInitShDst, 0o755);

// 4-1) 백업 앱 빌드 및 복사
const backupAppDir = path.join(ROOT, '..', 'backup');
const backupBuildScript = path.join(backupAppDir, 'build.sh');
const backupBinary = path.join(backupAppDir, 'build', 'nanumpay-backup');

console.log('[backup] 백업 앱 빌드 시작...');
if (fs.existsSync(backupBuildScript)) {
	try {
		cp.execFileSync('bash', [backupBuildScript], {
			cwd: backupAppDir,
			stdio: 'inherit'
		});

		if (fs.existsSync(backupBinary)) {
			const backupDst = path.join(binDir, 'nanumpay-backup');
			fs.copyFileSync(backupBinary, backupDst);
			fs.chmodSync(backupDst, 0o755);
			console.log('[backup] ✅ 백업 앱 포함 완료');
		} else {
			console.error('[backup] ❌ 백업 앱 빌드 실패: 실행 파일 없음');
			process.exit(1);
		}
	} catch (error) {
		console.error('[backup] ❌ 백업 앱 빌드 실패:', error.message);
		process.exit(1);
	}
} else {
	console.warn('[backup] ⚠️  백업 앱 빌드 스크립트 없음 (건너뜀)');
}

// 4-2) Nginx 설정 파일 복사
const nginxConfigSrc = path.join(ROOT, 'install', 'linux', 'nginx', 'nanumpay');
if (fs.existsSync(nginxConfigSrc)) {
	fs.copyFileSync(nginxConfigSrc, path.join(nginxAvailableDir, 'nanumpay'));
	console.log('[nginx] ✅ Nginx 설정 파일 포함 완료');
} else {
	console.warn('[nginx] ⚠️  Nginx 설정 파일 없음 (건너뜀)');
}

// 4-3) SSL 설정 스크립트 복사
const sslSetupSrc = path.join(ROOT, 'install', 'linux', 'ssl', 'setup-ssl.sh');
if (fs.existsSync(sslSetupSrc)) {
	const sslSetupDst = path.join(sslDir, 'setup-ssl.sh');
	fs.copyFileSync(sslSetupSrc, sslSetupDst);
	fs.chmodSync(sslSetupDst, 0o755);
	console.log('[ssl] ✅ SSL 설정 스크립트 포함 완료');
} else {
	console.warn('[ssl] ⚠️  SSL 설정 스크립트 없음 (건너뜀)');
}

// 4-4) 정적 페이지 복사 (개인정보처리방침, 이용약관)
const staticSrcDir = path.join(ROOT, 'install', 'linux', 'static');
if (fs.existsSync(staticSrcDir)) {
	const staticFiles = ['privacy.html', 'terms.html'];
	let copiedCount = 0;
	for (const file of staticFiles) {
		const src = path.join(staticSrcDir, file);
		if (fs.existsSync(src)) {
			fs.copyFileSync(src, path.join(staticDir, file));
			copiedCount++;
		}
	}
	if (copiedCount > 0) {
		console.log(`[static] ✅ 정적 페이지 ${copiedCount}개 포함 완료 (privacy, terms)`);
	}
} else {
	console.warn('[static] ⚠️  정적 페이지 디렉토리 없음 (건너뜀)');
}

// 5) systemd 서비스
const service = `[Unit]
Description=Nanumpay EXE service
After=network-online.target

[Service]
Type=simple
EnvironmentFile=/etc/nanumpay/nanumpay.env
ExecStart=/opt/nanumpay/nanumpay
Restart=on-failure
User=nanumpay
Group=nanumpay
WorkingDirectory=/opt/nanumpay

[Install]
WantedBy=multi-user.target
`;
fs.writeFileSync(path.join(sysdDir, 'nanumpay.service'), service);

// 6) DEBIAN/control  (마지막 개행 유지)
const control = `Package: nanumpay
Version: ${version}-${stamp}
Section: web
Priority: optional
Architecture: amd64
Maintainer: Nanum Asset <support@nanumasset.example>
Depends: adduser, systemd, bash, nginx
Recommends: mongosh, apache2-utils | whois
Description: Nanumpay (SvelteKit) single-binary service
 Nanumpay allowance app packaged as a single executable.
`;
fs.writeFileSync(path.join(debian, 'control'), control);

// 7) conffiles (설정 파일로 취급 → 업그레이드 시 보존/머지)
fs.writeFileSync(
	path.join(debian, 'conffiles'),
	`/etc/nanumpay/nanumpay.env
/etc/nginx/sites-available/nanumpay
`
);

// 8) postinst / prerm
// 빌드 시 전달 가능한 시드 옵션(있으면 postinst가 db_init.sh에 넘김)
const seedPass = process.env.SEED_ADMIN_PASSWORD || '';
const seedHashEnv = process.env.SEED_ADMIN_HASH || '';
let seedHash = seedHashEnv;
if (!seedHash && seedPass && bcrypt) {
	try {
		seedHash = bcrypt.hashSync(seedPass, 10);
	} catch {
		/* empty */
	}
}

// db_init.sh 인자 문자열 구성
// - MONGODB_URI는 설치 시점의 /etc/nanumpay/nanumpay.env에서 읽어 --uri로 전달
// - 해시/패스워드는 빌드 시 고정하고 싶을 때만 포함
// - 필요하면 ADMIN_LOGIN_ID/NAME/ROLE도 SEED_ADMIN_* 로 추가 가능
// DB 초기화 인자들 - 간단한 형태로 변경
const dbArgs = [
	'--uri=mongodb://localhost:27017',
	'--loginId=관리자',
	'--name=관리자',
	'--role=admin'
];

if (seedHash) {
	dbArgs.push(`--hash=${seedHash}`);
} else if (seedPass) {
	dbArgs.push(`--password=${seedPass}`);
} else {
	// 기본 비밀번호 설정 (설치 후 변경 권장)
	dbArgs.push('--password=admin1234!!');
}

const postinst = `#!/bin/bash
set -e

# 전용 사용자/권한
id -u nanumpay >/dev/null 2>&1 || adduser --system --group --no-create-home nanumpay
chown -R nanumpay:nanumpay /opt/nanumpay

# 백업 디렉토리 생성 및 권한 설정
mkdir -p /opt/nanumpay/backups
mkdir -p /opt/nanumpay/logs
chown -R nanumpay:nanumpay /opt/nanumpay/backups
chown -R nanumpay:nanumpay /opt/nanumpay/logs
chmod 755 /opt/nanumpay/backups
chmod 755 /opt/nanumpay/logs

# systemd 등록
systemctl daemon-reload
systemctl enable nanumpay.service

# DB 초기화 (mongosh 없으면 내부에서 스킵)
echo "Checking database initialization..."
if command -v mongosh >/dev/null 2>&1 || command -v mongo >/dev/null 2>&1; then
    if [ -f "/opt/nanumpay/tools/db_init.sh" ]; then
        echo "Initializing database (admin account setup)..."
        if /opt/nanumpay/tools/db_init.sh ${dbArgs.join(' ')} 2>&1; then
            echo "Database initialization completed successfully"
        else
            echo "DB initialization skipped (admin may already exist or MongoDB not ready)"
        fi
    fi
else
    echo "MongoDB not found - skipping database initialization"
    echo "Please install MongoDB and run: sudo /opt/nanumpay/tools/db_init.sh"
fi

# 백업 앱 확인
if [ -f "/opt/nanumpay/bin/nanumpay-backup" ]; then
    echo "Backup system installed: /opt/nanumpay/bin/nanumpay-backup"
    echo "Configure backup settings in admin panel"
fi

# Nginx 설정 (필수 의존성이므로 항상 실행)
echo "Configuring Nginx reverse proxy..."

# Nginx 기본 사이트 비활성화 (nanumpay가 포트 80을 사용하도록)
if [ -L "/etc/nginx/sites-enabled/default" ]; then
    echo "Disabling Nginx default site..."
    rm -f /etc/nginx/sites-enabled/default
fi

# sites-enabled 심볼릭 링크 생성
if [ -f "/etc/nginx/sites-available/nanumpay" ]; then
    # 기존 심볼릭 링크 제거 (있으면)
    rm -f /etc/nginx/sites-enabled/nanumpay

    # 새 심볼릭 링크 생성
    ln -s /etc/nginx/sites-available/nanumpay /etc/nginx/sites-enabled/nanumpay

    # Nginx 설정 테스트
    if nginx -t 2>&1 | grep -q "successful"; then
        echo "Nginx configuration valid - reloading..."
        systemctl reload nginx || systemctl restart nginx
        echo "✅ Nginx reverse proxy configured"
        echo "   → Access: http://localhost (port 80)"
        echo "   → Backend: http://localhost:3100"
    else
        echo "⚠️  Nginx configuration test failed - please check manually"
        echo "   → Run: sudo nginx -t"
        rm -f /etc/nginx/sites-enabled/nanumpay
    fi
else
    echo "⚠️  Nginx config file missing: /etc/nginx/sites-available/nanumpay"
    echo "   → Please check package installation"
fi

# 서비스 시작
systemctl restart nanumpay.service || systemctl start nanumpay.service

# SSL 설정 안내
if [ -f "/opt/nanumpay/ssl/setup-ssl.sh" ]; then
    echo ""
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "HTTPS/SSL 설정 (선택사항)"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "도메인이 있다면 Let's Encrypt로 HTTPS를 설정할 수 있습니다:"
    echo ""
    echo "  # 테스트 서버 (HTTP+HTTPS 병행)"
    echo "  sudo /opt/nanumpay/ssl/setup-ssl.sh www.nanumpay.xyz"
    echo ""
    echo "  # 정식 서버 (HTTPS 전용)"
    echo "  sudo /opt/nanumpay/ssl/setup-ssl.sh www.nanumasset.com --redirect"
    echo ""
fi
`;
fs.writeFileSync(path.join(debian, 'postinst'), postinst);
fs.chmodSync(path.join(debian, 'postinst'), 0o755);

const prerm = `#!/bin/bash
set -e

# 백업 crontab 정리
echo "Cleaning up backup crontab entries..."
crontab -u nanumpay -l 2>/dev/null | grep -v '/opt/nanumpay/bin/nanumpay-backup' | crontab -u nanumpay - 2>/dev/null || true

# Nginx 설정 제거
if [ -L "/etc/nginx/sites-enabled/nanumpay" ]; then
    echo "Removing Nginx configuration..."
    rm -f /etc/nginx/sites-enabled/nanumpay
    if command -v nginx >/dev/null 2>&1; then
        systemctl reload nginx || systemctl restart nginx || true
    fi
fi

# 서비스 중지
systemctl stop nanumpay.service || true
systemctl disable nanumpay.service || true
systemctl daemon-reload || true
`;
fs.writeFileSync(path.join(debian, 'prerm'), prerm);
fs.chmodSync(path.join(debian, 'prerm'), 0o755);

// 9) .deb 생성 - 타임스탬프 폴더에 저장
const releaseBase = path.join(ROOT, 'release');
const releaseDir = path.join(releaseBase, `${version}-${stamp}`);
fs.mkdirSync(releaseDir, { recursive: true });

const debOut = path.join(releaseDir, `nanumpay_${version}-${stamp}_amd64.deb`);

cp.execFileSync('dpkg-deb', ['--build', pkgDir, debOut], { stdio: 'inherit' });
console.log(`[deb] ${debOut}`);

// 10) install.sh 생성
const installScriptDst = path.join(releaseDir, 'install.sh');
const installScript = `#!/bin/bash

# Nanumpay 설치 스크립트
# 필요한 의존성을 먼저 확인하고 DEB 패키지를 설치합니다

set -e

# 색상 정의
RED='\\033[0;31m'
GREEN='\\033[0;32m'
YELLOW='\\033[1;33m'
BLUE='\\033[0;34m'
NC='\\033[0m' # No Color

echo "========================================="
echo "  Nanumpay 설치 스크립트"
echo "========================================="
echo ""

# Root 권한 확인
if [ "$EUID" -ne 0 ]; then
    echo -e "\${RED}❌ 이 스크립트는 root 권한이 필요합니다.\${NC}"
    echo -e "\${YELLOW}   sudo ./install.sh 로 실행해주세요\${NC}"
    exit 1
fi

# 현재 디렉토리에서 DEB 파일 찾기
SCRIPT_DIR="$(cd "$(dirname "\${BASH_SOURCE[0]}")" && pwd)"
DEB_FILE=$(ls -t "$SCRIPT_DIR"/nanumpay_*.deb 2>/dev/null | head -1)

if [ -z "$DEB_FILE" ]; then
    echo -e "\${RED}❌ DEB 파일을 찾을 수 없습니다\${NC}"
    echo -e "\${YELLOW}   이 스크립트를 DEB 파일과 같은 디렉토리에 두고 실행하세요\${NC}"
    exit 1
fi

echo -e "\${GREEN}✓\${NC} DEB 파일 발견: $(basename "$DEB_FILE")"
echo ""

# 1. 시스템 업데이트
echo -e "\${BLUE}[1/4]\${NC} 패키지 목록 업데이트 중..."
apt-get update -qq

# 2. 필수 의존성 확인 및 설치
echo -e "\${BLUE}[2/4]\${NC} 필수 의존성 확인 중..."

REQUIRED_PACKAGES="nginx adduser systemd bash curl gnupg lsb-release"
MISSING_PACKAGES=""

for pkg in $REQUIRED_PACKAGES; do
    if ! dpkg -l | grep -q "^ii  $pkg"; then
        MISSING_PACKAGES="$MISSING_PACKAGES $pkg"
    fi
done

if [ -n "$MISSING_PACKAGES" ]; then
    echo -e "\${YELLOW}   설치 필요:\$MISSING_PACKAGES\${NC}"
    echo -e "\${BLUE}   의존성 패키지 설치 중...\${NC}"
    apt-get install -y $MISSING_PACKAGES
    echo -e "\${GREEN}✓\${NC} 의존성 패키지 설치 완료"
else
    echo -e "\${GREEN}✓\${NC} 모든 의존성이 이미 설치되어 있습니다"
fi
echo ""

# 3. MongoDB 설치 확인
echo -e "\${BLUE}[3/4]\${NC} MongoDB 설치 확인 중..."

if ! command -v mongod >/dev/null 2>&1; then
    echo -e "\${YELLOW}   MongoDB가 설치되어 있지 않습니다. 설치를 진행합니다...\${NC}"

    curl -fsSL https://pgp.mongodb.com/server-8.0.asc | gpg -o /usr/share/keyrings/mongodb-server-8.0.gpg --dearmor
    echo "deb [ arch=amd64,arm64 signed-by=/usr/share/keyrings/mongodb-server-8.0.gpg ] https://repo.mongodb.org/apt/ubuntu \$(lsb_release -cs)/mongodb-org/8.0 multiverse" | tee /etc/apt/sources.list.d/mongodb-org-8.0.list

    apt-get update -qq
    apt-get install -y mongodb-org mongosh

    systemctl start mongod
    systemctl enable mongod

    echo -e "\${GREEN}✓\${NC} MongoDB 설치 및 시작 완료"
else
    echo -e "\${GREEN}✓\${NC} MongoDB가 이미 설치되어 있습니다"
    if ! systemctl is-active --quiet mongod; then
        systemctl start mongod
    fi
fi
echo ""

# 4. Nanumpay 패키지 설치
echo -e "\${BLUE}[4/4]\${NC} Nanumpay 패키지 설치 중..."

# 기존 패키지가 설치되어 있는지 확인
if dpkg -l | grep -q "^ii.*nanumpay"; then
    INSTALLED_VERSION=$(dpkg -l | grep "^ii.*nanumpay" | awk '{print $3}')
    echo -e "\${YELLOW}   기존 버전이 설치되어 있습니다: $INSTALLED_VERSION\${NC}"
    echo -e "\${BLUE}   기존 패키지 제거 중...\${NC}"
    apt-get remove -y nanumpay
fi

# DEB 패키지 설치
echo -e "\${BLUE}   DEB 패키지 설치 중...\${NC}"
if apt install -y "$DEB_FILE"; then
    echo -e "\${GREEN}✓\${NC} Nanumpay 설치 완료!"
else
    echo -e "\${RED}❌ 설치 실패\${NC}"
    exit 1
fi

echo ""
echo "========================================="
echo -e "\${GREEN}  설치 완료!\${NC}"
echo "========================================="
echo ""

# 서비스 상태 확인
if systemctl is-active --quiet nanumpay; then
    echo -e "\${GREEN}✓\${NC} Nanumpay 서비스가 실행 중입니다"
else
    echo -e "\${YELLOW}⚠\${NC} Nanumpay 서비스가 실행되지 않고 있습니다"
    echo -e "\${BLUE}   시작 명령: sudo systemctl start nanumpay\${NC}"
fi

if systemctl is-active --quiet nginx; then
    echo -e "\${GREEN}✓\${NC} Nginx가 실행 중입니다"
else
    echo -e "\${YELLOW}⚠\${NC} Nginx가 실행되지 않고 있습니다"
    echo -e "\${BLUE}   시작 명령: sudo systemctl start nginx\${NC}"
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo -e "\${BLUE}접속 정보:\${NC}"
echo "  URL: http://localhost"
echo "  관리자: http://localhost/admin"
echo "  계정: 관리자 / admin1234!!"
echo ""
echo -e "\${BLUE}서비스 관리:\${NC}"
echo "  상태: sudo systemctl status nanumpay"
echo "  시작: sudo systemctl start nanumpay"
echo "  중지: sudo systemctl stop nanumpay"
echo "  재시작: sudo systemctl restart nanumpay"
echo "  로그: sudo journalctl -u nanumpay -f"
echo ""
echo -e "\${BLUE}HTTPS/SSL 설정 (선택사항):\${NC}"
echo "  # 테스트 서버 (HTTP+HTTPS 병행)"
echo "  sudo /opt/nanumpay/ssl/setup-ssl.sh www.nanumpay.xyz"
echo ""
echo "  # 정식 서버 (HTTPS 전용)"
echo "  sudo /opt/nanumpay/ssl/setup-ssl.sh www.nanumasset.com --redirect"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo -e "\${GREEN}브라우저에서 http://localhost 로 접속하세요!\${NC}"
echo ""
`;
fs.writeFileSync(installScriptDst, installScript);
fs.chmodSync(installScriptDst, 0o755);
console.log(`[install.sh] ${installScriptDst}`);

// 11) README.md 생성
const readmeDst = path.join(releaseDir, 'README.md');
const readmeContent = `# Nanumpay 설치 가이드

## 📦 패키지 내용

- \`nanumpay_${version}-${stamp}_amd64.deb\` - Nanumpay 메인 패키지
- \`install.sh\` - 자동 설치 스크립트 (권장)
- \`README.md\` - 이 파일

---

## 🚀 설치 방법

### 방법 1: 자동 설치 스크립트 (권장)

\`\`\`bash
sudo ./install.sh
\`\`\`

### 방법 2: apt 사용

\`\`\`bash
sudo apt install ./nanumpay_*.deb
\`\`\`

### 방법 3: dpkg 사용

\`\`\`bash
sudo dpkg -i nanumpay_*.deb
sudo apt-get install -f
\`\`\`

---

## 📋 필수 요구사항

### 자동 설치되는 항목
- **nginx** - 웹 서버 (포트 80)
- adduser, systemd, bash

### 별도 설치 필요
- **MongoDB** - 데이터베이스 (localhost:27017)

---

## ✅ 설치 후

브라우저에서 접속:
- **URL**: http://localhost
- **관리자**: http://localhost/admin
- **계정**: 관리자 / admin1234!!

서비스 관리:
\`\`\`bash
sudo systemctl status nanumpay
sudo systemctl restart nanumpay
sudo journalctl -u nanumpay -f
\`\`\`

---

## 🔐 HTTPS/SSL 설정 (선택사항)

도메인이 있다면 Let's Encrypt로 HTTPS를 설정할 수 있습니다.

### 테스트 서버 (HTTP+HTTPS 병행)
\`\`\`bash
sudo /opt/nanumpay/ssl/setup-ssl.sh www.nanumpay.xyz
\`\`\`

### 정식 서버 (HTTPS 전용)
\`\`\`bash
sudo /opt/nanumpay/ssl/setup-ssl.sh www.nanumasset.com --redirect
\`\`\`

### SSL 관리 명령어
\`\`\`bash
# 인증서 상태 확인
sudo certbot certificates

# 수동 갱신
sudo certbot renew

# 갱신 테스트
sudo certbot renew --dry-run
\`\`\`

> 📌 인증서는 90일마다 만료되며, 설치 시 자동 갱신이 설정됩니다.

---

**버전**: ${version}-${stamp}
**© 2024 나눔에셋 (Nanum Asset)**
`;
fs.writeFileSync(readmeDst, readmeContent);
console.log(`[README.md] ${readmeDst}`);

console.log(`\n✅ 릴리스 패키지 생성 완료: ${releaseDir}`);
console.log(`   - nanumpay_${version}-${stamp}_amd64.deb`);
console.log(`   - install.sh`);
console.log(`   - README.md`);

if (seedPass)
	console.log(`\n[seed] admin password baked at build-time (hash ${seedHash ? 'yes' : 'no'}).`);
