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

	// Nanumpay 컬렉션 생성
	var collections = ['admins', 'users', 'monthlyrevenues', 'userpaymentplans', 'weeklypayments'];
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

	// monthlyrevenues
	dbx.monthlyrevenues.createIndex({ year: 1, month: 1 }, { unique: true });
	dbx.monthlyrevenues.createIndex({ isCalculated: 1 });

	// userpaymentplans
	dbx.userpaymentplans.createIndex({ userId: 1 });
	dbx.userpaymentplans.createIndex({ 'revenueMonth.year': 1, 'revenueMonth.month': 1 });

	// weeklypayments
	dbx.weeklypayments.createIndex({ userId: 1 });
	dbx.weeklypayments.createIndex({ year: 1, month: 1, week: 1 });
	dbx.weeklypayments.createIndex({ status: 1 });

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
			permissions: ['full_access'],
			isActive: true,
			loginAttempts: 0,
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
