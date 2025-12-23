// scripts/deploy.cjs
// [DEPRECATED] 본 서버 배포는 deploy_asset.cjs로 이관되었습니다.
'use strict';

console.log('');
console.log('⚠️  deploy.cjs는 더 이상 사용되지 않습니다.');
console.log('');
console.log('📦 본 서버 배포가 deploy_asset.cjs로 이관되었습니다.');
console.log('');
console.log('   다음 명령어를 사용하세요:');
console.log('   pnpm release:deploy:asset          # HTTP+HTTPS 병행');
console.log('   pnpm release:deploy:asset -- --redirect  # HTTPS 전용');
console.log('');
console.log('📍 대상 서버: www.nanumasset.com (3.39.101.252)');
console.log('');

process.exit(0);
