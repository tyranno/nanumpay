// MongoDB 초기화 스크립트 - Nanumpay MLM System
// 외부 --eval 로 주입되는 전역 변수 사용:
//   DB_NAME, ADMIN_LOGIN_ID, ADMIN_NAME, ADMIN_HASH, FORCE
(function () {
	function bool(v, dflt) {
		if (typeof v === 'boolean') return v;
		if (typeof v === 'string') return v.toLowerCase() === 'true';
		return dflt;
	}

	var dbName = typeof DB_NAME !== 'undefined' && DB_NAME ? DB_NAME : 'nanumpay';
	var loginId = typeof ADMIN_LOGIN_ID !== 'undefined' ? ADMIN_LOGIN_ID : '관리자';
	var name = typeof ADMIN_NAME !== 'undefined' ? ADMIN_NAME : '시스템관리자';
	var hash = typeof ADMIN_HASH !== 'undefined' ? ADMIN_HASH : ''; // bcrypt 해시
	var force = bool(typeof FORCE !== 'undefined' ? FORCE : false, false);

	var dbx = db.getSiblingDB(dbName);

	// ⭐ v8.0: 기존 컬렉션 모두 삭제 (--force 옵션 시)
	if (force) {
		print('[init] --force 옵션: 기존 컬렉션 모두 삭제');
		var allCollections = dbx.getCollectionNames();
		allCollections.forEach(function (colName) {
			// admins만 유지, 나머지 모두 삭제
			if (colName !== 'admins') {
				dbx.getCollection(colName).drop();
				print('[init] Dropped collection: ' + colName);
			}
		});
	}

	// ⭐ v8.0: 필수 컬렉션 생성
	// 1) admins
	if (dbx.getCollectionNames().indexOf('admins') < 0) {
		dbx.createCollection('admins');
		print('[init] Created collection: admins');
	}

	// 2) useraccounts
	if (dbx.getCollectionNames().indexOf('useraccounts') < 0) {
		dbx.createCollection('useraccounts');
		print('[init] Created collection: useraccounts');
	}

	// 3) planneraccounts
	if (dbx.getCollectionNames().indexOf('planneraccounts') < 0) {
		dbx.createCollection('planneraccounts');
		print('[init] Created collection: planneraccounts');
	}

	// ⭐ v8.0: 인덱스 생성
	// admins
	dbx.admins.createIndex({ loginId: 1 }, { unique: true });
	dbx.admins.createIndex({ createdAt: 1 });
	print('[init] Indexes created for admins collection');

	// useraccounts
	dbx.useraccounts.createIndex({ loginId: 1 }, { unique: true });
	dbx.useraccounts.createIndex({ status: 1 });
	print('[init] Indexes created for useraccounts collection');

	// planneraccounts
	dbx.planneraccounts.createIndex({ loginId: 1 }, { unique: true });
	dbx.planneraccounts.createIndex({ status: 1 });
	print('[init] Indexes created for planneraccounts collection');

	// 관리자 생성 (admins 컬렉션에)
	if (!hash) {
		print('[init] SKIP admin creation: ADMIN_HASH is empty (provide via wrapper)');
		return;
	}

	var col = dbx.getCollection('admins');
	var exists = col.findOne({ loginId: loginId });

	if (!exists) {
		col.insertOne({
			name: name,
			loginId: loginId,
			passwordHash: hash,
			type: 'admin',
			status: 'active',
			createdAt: new Date()
		});
		print('[init] Created admin "' + loginId + '" in admins collection');
	} else if (force) {
		col.updateOne(
			{ loginId: loginId },
			{ $set: { name: name, passwordHash: hash, updatedAt: new Date() } }
		);
		print('[init] Updated admin "' + loginId + '" in admins collection');
	} else {
		print('[init] Admin "' + loginId + '" already exists (use FORCE=true to reset)');
	}
})();
