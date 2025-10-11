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

	// FORCE 옵션이면 모든 컬렉션 삭제
	if (force) {
		print('[init] FORCE mode: Dropping all collections...');
		var existingCollections = dbx.getCollectionNames();
		existingCollections.forEach(function(colName) {
			if (colName !== 'system.indexes') {
				dbx.getCollection(colName).drop();
				print('[init] Dropped collection: ' + colName);
			}
		});
	}

	// Nanumpay v5.0 컬렉션 생성
	var collections = [
		'admins',
		'users',
		'monthlyregistrations',
		'monthlytreesnapshots',
		'weeklypaymentplans',
		'weeklypaymentsummary'
	];
	collections.forEach(function(colName) {
		if (dbx.getCollectionNames().indexOf(colName) < 0) {
			dbx.createCollection(colName);
			print('[init] Created collection: ' + colName);
		}
	});

	// 인덱스 생성
	// admins
	dbx.admins.createIndex({ loginId: 1 }, { unique: true });
	dbx.admins.createIndex({ createdAt: 1 });

	// users
	dbx.users.createIndex({ loginId: 1 }, { unique: true });
	dbx.users.createIndex({ parentId: 1 });
	dbx.users.createIndex({ leftChildId: 1 });
	dbx.users.createIndex({ rightChildId: 1 });
	dbx.users.createIndex({ grade: 1 });
	dbx.users.createIndex({ status: 1 });
	dbx.users.createIndex({ createdAt: 1 });
	dbx.users.createIndex({ sequence: 1 }, { unique: true });

	// monthlyregistrations (v5.0)
	dbx.monthlyregistrations.createIndex({ monthKey: 1 }, { unique: true });
	dbx.monthlyregistrations.createIndex({ 'registrations.userId': 1 });

	// monthlytreesnapshots (v5.0)
	dbx.monthlytreesnapshots.createIndex({ monthKey: 1 }, { unique: true });
	dbx.monthlytreesnapshots.createIndex({ snapshotDate: 1 });
	dbx.monthlytreesnapshots.createIndex({ 'users.userId': 1 });

	// weeklypaymentplans (v5.0)
	dbx.weeklypaymentplans.createIndex({ userId: 1 });
	dbx.weeklypaymentplans.createIndex({ planType: 1 });
	dbx.weeklypaymentplans.createIndex({ baseGrade: 1 });
	dbx.weeklypaymentplans.createIndex({ revenueMonth: 1 });
	dbx.weeklypaymentplans.createIndex({ planStatus: 1 });
	dbx.weeklypaymentplans.createIndex({ 'installments.weekNumber': 1 });
	dbx.weeklypaymentplans.createIndex({ 'installments.status': 1 });

	// weeklypaymentsummary (v5.0)
	dbx.weeklypaymentsummary.createIndex({ weekNumber: 1 }, { unique: true });
	dbx.weeklypaymentsummary.createIndex({ weekDate: 1 });
	dbx.weeklypaymentsummary.createIndex({ monthKey: 1 });
	dbx.weeklypaymentsummary.createIndex({ status: 1 });

	print('[init] Indexes created for all collections');

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
