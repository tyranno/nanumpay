/**
 * 프로덕션 DB UploadHistory fileData 업데이트 스크립트
 * 기존 레코드에 엑셀 파일 데이터(gzip 압축)를 추가
 *
 * 사용법:
 *   로컬: node scripts/update-upload-history-filedata.cjs
 *   원격: node scripts/update-upload-history-filedata.cjs --remote
 */

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { MongoClient } = require('mongodb');

// DB 연결 정보
const isRemote = process.argv.includes('--remote');
const DB_URI = isRemote
    ? 'mongodb://localhost:27018/nanumpay'  // SSH 터널 (로컬 27018 → 원격 27017)
    : 'mongodb://localhost:27017/nanumpay'; // 로컬

// 파일 매핑 정보 (DB의 originalFileName과 로컬 파일 매핑)
const FILE_MAPPINGS = [
    {
        originalFileName: '계약자관리명부(10월)-기본.xlsx',  // DB에 저장된 이름
        localFile: 'test-data/verfify2/용역자명단_기본3명.xlsx'
    },
    {
        originalFileName: '계약자관리명부(10월).xlsx',
        localFile: 'test-data/verfify2/계약자관리명부(10월).xlsx'
    },
    {
        originalFileName: '계약자관리명부(11월).xlsx',
        localFile: 'test-data/verfify2/계약자관리명부(11월).xlsx'
    }
    // 12월은 이미 fileData 있음
];

async function compressFile(filePath) {
    const fileBuffer = fs.readFileSync(filePath);
    const compressed = zlib.gzipSync(fileBuffer);
    return {
        original: fileBuffer,
        compressed: compressed,
        originalSize: fileBuffer.length,
        compressedSize: compressed.length
    };
}

async function main() {
    console.log('=== UploadHistory fileData 업데이트 스크립트 ===\n');
    console.log(`모드: ${isRemote ? '원격 (SSH 터널 필요)' : '로컬'}`);
    console.log(`DB URI: ${DB_URI}\n`);

    // 1. 파일 존재 확인
    console.log('1. 파일 확인 중...');
    for (const mapping of FILE_MAPPINGS) {
        const fullPath = path.join(process.cwd(), mapping.localFile);
        if (!fs.existsSync(fullPath)) {
            console.error(`  ❌ 파일 없음: ${mapping.localFile}`);
            process.exit(1);
        }
        const stats = fs.statSync(fullPath);
        console.log(`  ✅ ${mapping.originalFileName} ← ${path.basename(mapping.localFile)} (${(stats.size / 1024).toFixed(1)} KB)`);
    }

    // 2. 압축 및 데이터 준비
    console.log('\n2. 파일 압축 중...');
    const updates = [];
    for (const mapping of FILE_MAPPINGS) {
        const fullPath = path.join(process.cwd(), mapping.localFile);
        const { compressed, originalSize, compressedSize } = await compressFile(fullPath);

        updates.push({
            originalFileName: mapping.originalFileName,
            fileData: compressed,
            fileSize: originalSize,
            compressedSize: compressedSize
        });

        console.log(`  ✅ ${mapping.originalFileName}: ${(originalSize/1024).toFixed(1)}KB → ${(compressedSize/1024).toFixed(1)}KB (${((1-compressedSize/originalSize)*100).toFixed(0)}% 압축)`);
    }

    // 3. 미리보기
    console.log('\n3. 업데이트할 레코드:');
    console.log('─'.repeat(60));
    for (const update of updates) {
        console.log(`  ${update.originalFileName}`);
        console.log(`    fileSize: ${update.fileSize} → compressedSize: ${update.compressedSize}`);
    }
    console.log('─'.repeat(60));

    // 4. 실행 확인
    if (!process.argv.includes('--execute')) {
        console.log('\n⚠️  실제 업데이트를 하려면 --execute 옵션을 추가하세요.');
        console.log(`   예: node scripts/update-upload-history-filedata.cjs ${isRemote ? '--remote ' : ''}--execute\n`);
        console.log('(dry-run 모드 - 실제 업데이트하지 않음)');
        return;
    }

    // 5. DB 연결 및 업데이트
    console.log('\n4. DB 연결 중...');

    const client = new MongoClient(DB_URI);
    try {
        await client.connect();
        console.log('  ✅ DB 연결 성공');

        const db = client.db('nanumpay');
        const collection = db.collection('uploadhistories');

        // 기존 레코드 확인
        const existingCount = await collection.countDocuments();
        console.log(`  현재 레코드 수: ${existingCount}`);

        // 업데이트
        console.log('\n5. fileData 업데이트 중...');
        for (const update of updates) {
            // 기존 레코드 찾기
            const existing = await collection.findOne({ originalFileName: update.originalFileName });
            if (!existing) {
                console.log(`  ⚠️  ${update.originalFileName} - 레코드 없음, 스킵`);
                continue;
            }

            // fileData 이미 있는지 확인
            if (existing.fileData) {
                console.log(`  ⚠️  ${update.originalFileName} - fileData 이미 존재, 스킵`);
                continue;
            }

            // 업데이트
            await collection.updateOne(
                { _id: existing._id },
                {
                    $set: {
                        fileData: update.fileData,
                        fileSize: update.fileSize,
                        compressedSize: update.compressedSize
                    }
                }
            );
            console.log(`  ✅ ${update.originalFileName} 업데이트 완료`);
        }

        // 결과 확인
        const withFileData = await collection.countDocuments({ fileData: { $exists: true, $ne: null } });
        console.log(`\n✅ 완료! fileData 있는 레코드: ${withFileData}/${existingCount}`);

    } catch (error) {
        console.error('❌ DB 오류:', error.message);
        process.exit(1);
    } finally {
        await client.close();
    }
}

main().catch(console.error);
