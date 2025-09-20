import mongoose from 'mongoose';
import { connectDB } from '../src/lib/server/db.js';

async function dropIndexes() {
	try {
		await connectDB();
		console.log('Connected to MongoDB');

		// Drop all indexes on paymentschedules collection
		const db = mongoose.connection.db;
		await db.collection('paymentschedules').dropIndexes();
		console.log('Dropped all indexes on paymentschedules collection');

		// Drop all indexes on revenues collection
		await db.collection('revenues').dropIndexes();
		console.log('Dropped all indexes on revenues collection');

		// Drop all indexes on weeklypayments collection
		await db.collection('weeklypayments').dropIndexes();
		console.log('Dropped all indexes on weeklypayments collection');

	} catch (error) {
		console.error('Error:', error);
	} finally {
		await mongoose.disconnect();
		console.log('Disconnected from MongoDB');
	}
}

dropIndexes();