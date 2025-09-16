// scripts/release-win.cjs
'use strict';

const fs = require('fs');
const path = require('path');
const cp = require('child_process');

const ROOT = process.cwd();
const DIST = path.join(ROOT, 'dist');
const EXE = path.join(DIST, 'nanumpay.exe');

if (!fs.existsSync(EXE)) {
	console.error('dist/nanumpay.exe 가 없습니다. 먼저 `yarn exe:win` 실행하세요.');
	process.exit(1);
}

const pkg = require(path.join(ROOT, 'package.json'));
const version = pkg.version || '0.0.0';
const now = new Date();
const stamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;

const stageRoot = path.join(ROOT, '.stage', 'win');
const stageDist = path.join(stageRoot, 'dist');
const stageWin = path.join(stageRoot, 'install', 'win');
const stageDb = path.join(stageRoot, 'install', 'db');
const releaseDir = path.join(ROOT, 'release');
const nsisScript = path.join(ROOT, 'install', 'win', 'Nanumpay.nsi');

function ensureDir(p) {
	fs.mkdirSync(p, { recursive: true });
}
function copyFile(s, d) {
	ensureDir(path.dirname(d));
	fs.copyFileSync(s, d);
}
function exists(p) {
	try {
		fs.accessSync(p);
		return true;
	} catch {
		return false;
	}
}

function findMakensis() {
	const env = process.env.MAKENSIS;
	if (env && exists(env)) return env;
	const pf = process.env['ProgramFiles'] || 'C:\\Program Files';
	const pfx = process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)';
	const cands = [
		path.join(pf, 'NSIS', 'makensis.exe'),
		path.join(pfx, 'NSIS', 'makensis.exe'),
		path.join(pf, 'NSIS', 'Bin', 'makensis.exe'),
		path.join(pfx, 'NSIS', 'Bin', 'makensis.exe')
	];
	for (const c of cands) if (exists(c)) return c;
	try {
		const out = cp
			.execSync('where makensis', { stdio: ['ignore', 'pipe', 'ignore'] })
			.toString()
			.split(/\r?\n/)
			.find(Boolean);
		if (out && exists(out.trim())) return out.trim();
	} catch {
		/* empty */
	}
	throw new Error('makensis.exe 를 찾을 수 없습니다. NSIS 설치 또는 MAKENSIS 환경변수 지정 요망.');
}

// stage 정리/구성
fs.rmSync(stageRoot, { recursive: true, force: true });
ensureDir(stageDist);
ensureDir(stageWin);
ensureDir(stageDb);

// 실행파일
copyFile(EXE, path.join(stageDist, 'nanumpay.exe'));

// ▶ WinSW 바이너리(자체동작 빌드) 동봉: install/win/winsw.exe 를 리포에 넣어둬
['install.ps1', 'uninstall.ps1', 'db_init.bat', 'WinSW-x64.exe', 'WinSW-x86.exe'].forEach((f) => {
	const src = path.join(ROOT, 'install', 'win', f);
	if (!exists(src)) {
		console.error(`[release:win] 누락: ${src}`);
		process.exit(1);
	}
	copyFile(src, path.join(stageWin, f));
});

// DB 리소스(기존 그대로)
['init.mongo.js', 'indexes.users.json', 'schema.users.json'].forEach((f) => {
	const src = path.join(ROOT, 'install', 'db', f);
	if (!exists(src)) {
		console.error(`[release:win] 누락: ${src}`);
		process.exit(1);
	}
	copyFile(src, path.join(stageDb, f));
});

// ProgramData 기본 env 템플릿
const envTemplate = `PORT=3000
HOST=0.0.0.0
MONGODB_URI=mongodb://localhost:27017/nanumpay
JWT_SECRET=change-me
JWT_EXPIRES=7d
`;
fs.writeFileSync(path.join(stageWin, 'nanumpay.env'), envTemplate, 'utf8');

// NSIS 실행
ensureDir(releaseDir);
const outExe = path.join(releaseDir, `setup-NanumpayTree-${version}-${stamp}.exe`);
const makensis = findMakensis();
const args = [
	`/DVERSION=${version}`,
	`/DINPUT_DIR=${stageRoot}`,
	`/DOUT_EXE=${outExe}`,
	nsisScript
];

console.log(`[release:win] makensis: ${makensis}`);
cp.execFileSync(makensis, args, { stdio: 'inherit' });
console.log(`[release:win] OK -> ${outExe}`);
