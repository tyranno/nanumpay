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
const dbDir = path.join(optDir, 'db');
const toolsDir = path.join(optDir, 'tools');

fs.rmSync(stage, { recursive: true, force: true });
[debian, optDir, etcDir, sysdDir, dbDir, toolsDir].forEach((d) =>
	fs.mkdirSync(d, { recursive: true })
);

// 1) 단일 실행파일
fs.copyFileSync(BIN, path.join(optDir, 'nanumpay'));
fs.chmodSync(path.join(optDir, 'nanumpay'), 0o755);

// 2) 환경파일(설정 샘플)
fs.writeFileSync(
	path.join(etcDir, 'nanumpay.env'),
	`PORT=3000
HOST=0.0.0.0
MONGODB_URI=mongodb://localhost:27017/nanumpay
JWT_SECRET=change-me
JWT_EXPIRES=7d
`
);

// 3) ★ DB 리소스: 기존 파일 그대로 포함
const srcDbDir = path.join(ROOT, 'install', 'db');
['init.mongo.js', 'indexes.users.json', 'schema.users.json'].forEach((f) => {
	const src = path.join(srcDbDir, f);
	if (!fs.existsSync(src)) {
		console.error(`[release:linux] 누락: ${src}`);
		process.exit(1);
	}
	fs.copyFileSync(src, path.join(dbDir, f));
});

// 4) ★ 리눅스 초기화 스크립트: 기존 경로 유지(리포지토리), 설치 위치는 /opt/nanumpay/tools/db_init.sh
const linuxInitShSrc = path.join(ROOT, 'install', 'linux', 'db_init.sh');
if (!fs.existsSync(linuxInitShSrc)) {
	console.error(`[release:linux] 누락: ${linuxInitShSrc}`);
	process.exit(1);
}
const linuxInitShDst = path.join(toolsDir, 'db_init.sh');
fs.copyFileSync(linuxInitShSrc, linuxInitShDst);
fs.chmodSync(linuxInitShDst, 0o755);

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
Depends: adduser, systemd, bash
Recommends: mongosh, apache2-utils | whois
Description: Nanumpay (SvelteKit) single-binary service
 Nanumpay allowance app packaged as a single executable.
`;
fs.writeFileSync(path.join(debian, 'control'), control);

// 7) conffiles (설정 파일로 취급 → 업그레이드 시 보존/머지)
fs.writeFileSync(
	path.join(debian, 'conffiles'),
	`/etc/nanumpay/nanumpay.env
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
const dbArgs = [];
dbArgs.push(`"--uri=\\"$MONGODB_URI\\""`);
if (seedHash) {
	dbArgs.push(`"--hash=${seedHash.replace(/"/g, '\\"')}"`);
} else if (seedPass) {
	dbArgs.push(`"--password=${seedPass.replace(/"/g, '\\"')}"`);
}
// (원하면 여기에 --loginId= --name= --role= 추가 가능)

const postinst = `#!/bin/bash
set -e

# 전용 사용자/권한
id -u nanumpay >/dev/null 2>&1 || adduser --system --group --no-create-home nanumpay
chown -R nanumpay:nanumpay /opt/nanumpay

# systemd 등록
systemctl daemon-reload
systemctl enable nanumpay.service

# 환경파일에서 MONGODB_URI 로드
ENV_FILE="/etc/nanumpay/nanumpay.env"
if [ -f "$ENV_FILE" ]; then
  # shellcheck disable=SC1090
  . "$ENV_FILE"
fi

# DB 초기화 (mongosh 없으면 내부에서 스킵)
if [ -x /opt/nanumpay/tools/db_init.sh ]; then
  /opt/nanumpay/tools/db_init.sh ${dbArgs.join(' ')} || true
fi

# 서비스 시작
systemctl restart nanumpay.service || systemctl start nanumpay.service
`;
fs.writeFileSync(path.join(debian, 'postinst'), postinst);
fs.chmodSync(path.join(debian, 'postinst'), 0o755);

const prerm = `#!/bin/bash
set -e
systemctl stop nanumpay.service || true
systemctl disable nanumpay.service || true
systemctl daemon-reload || true
`;
fs.writeFileSync(path.join(debian, 'prerm'), prerm);
fs.chmodSync(path.join(debian, 'prerm'), 0o755);

// 9) .deb 생성
const outDir = path.join(ROOT, 'release');
fs.mkdirSync(outDir, { recursive: true });
const debOut = path.join(outDir, `nanumpay_${version}-${stamp}_amd64.deb`);

cp.execFileSync('dpkg-deb', ['--build', pkgDir, debOut], { stdio: 'inherit' });
console.log(`[deb] ${debOut}`);
if (seedPass)
	console.log(`[seed] admin password baked at build-time (hash ${seedHash ? 'yes' : 'no'}).`);
