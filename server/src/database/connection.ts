import mongoose from 'mongoose';
import { env } from '../config/env.js';
import { logger } from '../shared/utils/logger.js';

export async function connectDatabase(uri = env.MONGODB_URI): Promise<void> {
  if (mongoose.connection.readyState === 1) {
    return;
  }

  mongoose.set('strictQuery', true);

  await mongoose.connect(uri, {
    autoIndex: true,
  });

  logger.info('Connected to MongoDB', { host: mongoose.connection.host, db: mongoose.connection.name });
}

export async function disconnectDatabase(): Promise<void> {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
    logger.info('Disconnected from MongoDB');
  }
}
