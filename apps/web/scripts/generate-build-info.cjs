'use strict';

const fs = require('fs');
const path = require('path');

const buildTime = new Date().toISOString();

const content = `// 이 파일은 빌드 시 자동 생성됩니다. 수동으로 수정하지 마세요.
export const BUILD_TIME = '${buildTime}';
`;

const outputPath = path.join(__dirname, '..', 'src', 'lib', 'buildInfo.js');

fs.writeFileSync(outputPath, content, 'utf8');
console.log(`✅ buildInfo.js 생성 완료: ${buildTime}`);
