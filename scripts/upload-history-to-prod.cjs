/**
 * 프로덕션 DB에 UploadHistory 레코드 추가 스크립트
 * 엑셀 파일을 gzip 압축하여 DB에 저장
 *
 * 사용법: node scripts/upload-history-to-prod.cjs
 */

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { MongoClient } = require('mongodb');

// 프로덕션 DB 연결 정보
const PROD_DB_URI = 'mongodb://localhost:27017/nanumpay';  // SSH 터널링 후 localhost로 접근

// 파일 매핑 정보
const FILE_MAPPINGS = [
    {
        localFile: 'test-data/verfify2/용역자명단_기본3명.xlsx',
        originalFileName: '계약자관리명부(10월)-기본3명.xlsx',
        savedFileName: `upload_${Date.now()}_1.xlsx`,
        created: 3,
        uploadedAt: new Date('2025-12-14T23:51:00+09:00')
    },
    {
        localFile: 'test-data/verfify2/계약자관리명부(10월).xlsx',
        originalFileName: '계약자관리명부(10월).xlsx',
        savedFileName: `upload_${Date.now()}_2.xlsx`,
        created: 53,
        uploadedAt: new Date('2025-12-14T23:51:00+09:00')
    },
    {
        localFile: 'test-data/verfify2/계약자관리명부(11월).xlsx',
        originalFileName: '계약자관리명부(11월).xlsx',
        savedFileName: `upload_${Date.now()}_3.xlsx`,
        created: 80,
        uploadedAt: new Date('2025-12-14T23:51:00+09:00')
    },
    {
        localFile: 'test-data/verfify2/계약자관리명부(12월).xlsx',
        originalFileName: '계약자관리명부(12월).xlsx',
        savedFileName: `upload_${Date.now()}_4.xlsx`,
        created: 116,
        uploadedAt: new Date('2025-12-31T21:38:00+09:00')
    }
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
    console.log('=== UploadHistory 프로덕션 DB 업로드 스크립트 ===\n');

    // 1. 파일 존재 확인
    console.log('1. 파일 확인 중...');
    for (const mapping of FILE_MAPPINGS) {
        const fullPath = path.join(process.cwd(), mapping.localFile);
        if (!fs.existsSync(fullPath)) {
            console.error(`  ❌ 파일 없음: ${mapping.localFile}`);
            process.exit(1);
        }
        const stats = fs.statSync(fullPath);
        console.log(`  ✅ ${mapping.originalFileName} (${(stats.size / 1024).toFixed(1)} KB)`);
    }

    // 2. 압축 및 데이터 준비
    console.log('\n2. 파일 압축 중...');
    const records = [];
    for (const mapping of FILE_MAPPINGS) {
        const fullPath = path.join(process.cwd(), mapping.localFile);
        const { compressed, originalSize, compressedSize } = await compressFile(fullPath);

        const record = {
            originalFileName: mapping.originalFileName,
            savedFileName: mapping.savedFileName,
            fileData: compressed,
            fileSize: originalSize,
            compressedSize: compressedSize,
            uploadedBy: {
                userName: '관리자'
            },
            registrationResult: {
                created: mapping.created,
                failed: 0,
                total: mapping.created
            },
            uploadedAt: mapping.uploadedAt,
            createdAt: mapping.uploadedAt,
            updatedAt: mapping.uploadedAt
        };

        records.push(record);
        console.log(`  ✅ ${mapping.originalFileName}: ${(originalSize/1024).toFixed(1)}KB → ${(compressedSize/1024).toFixed(1)}KB (${((1-compressedSize/originalSize)*100).toFixed(0)}% 압축)`);
    }

    // 3. 데이터 미리보기
    console.log('\n3. 삽입할 데이터 미리보기:');
    console.log('─'.repeat(80));
    for (const record of records) {
        console.log(`  파일명: ${record.originalFileName}`);
        console.log(`  등록수: ${record.registrationResult.created}명`);
        console.log(`  업로드: ${record.uploadedAt.toLocaleString('ko-KR')}`);
        console.log(`  크기: ${(record.fileSize/1024).toFixed(1)}KB (압축: ${(record.compressedSize/1024).toFixed(1)}KB)`);
        console.log('─'.repeat(80));
    }

    // 4. 사용자 확인
    console.log('\n⚠️  위 데이터를 프로덕션 DB에 삽입합니다.');
    console.log('   계속하려면 --execute 옵션을 추가하세요.');
    console.log('   예: node scripts/upload-history-to-prod.cjs --execute\n');

    if (!process.argv.includes('--execute')) {
        console.log('(dry-run 모드 - 실제 삽입하지 않음)');
        return;
    }

    // 5. DB 연결 및 삽입
    console.log('\n4. 프로덕션 DB 연결 중...');

    const client = new MongoClient(PROD_DB_URI);
    try {
        await client.connect();
        console.log('  ✅ DB 연결 성공');

        const db = client.db('nanumpay');
        const collection = db.collection('uploadhistories');

        // 기존 레코드 확인
        const existingCount = await collection.countDocuments();
        console.log(`  현재 레코드 수: ${existingCount}`);

        // 삽입
        console.log('\n5. 데이터 삽입 중...');
        for (const record of records) {
            // 중복 체크 (같은 파일명 있는지)
            const existing = await collection.findOne({ originalFileName: record.originalFileName });
            if (existing) {
                console.log(`  ⚠️  ${record.originalFileName} - 이미 존재함, 스킵`);
                continue;
            }

            await collection.insertOne(record);
            console.log(`  ✅ ${record.originalFileName} 삽입 완료`);
        }

        // 결과 확인
        const newCount = await collection.countDocuments();
        console.log(`\n✅ 완료! 레코드 수: ${existingCount} → ${newCount}`);

    } catch (error) {
        console.error('❌ DB 오류:', error.message);
        process.exit(1);
    } finally {
        await client.close();
    }
}

main().catch(console.error);
