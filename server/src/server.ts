import http from 'http';
import { createApp } from './app.js';
import { env } from './config/env.js';
import { connectDatabase, disconnectDatabase } from './database/connection.js';
import { initializeSocketGateway } from './sockets/gateway.js';
import { ensureStorageDirectories } from './modules/attachments/attachments.service.js';
import { logger } from './shared/utils/logger.js';

async function bootstrap() {
  try {
    await connectDatabase();
    await ensureStorageDirectories();

    const app = createApp();
    const httpServer = http.createServer(app);
    const io = initializeSocketGateway(httpServer);

    httpServer.listen(env.PORT, () => {
      logger.info(`${env.APP_NAME} backend server listening on port ${env.PORT}`);
    });

    const shutdown = async (signal: string) => {
      logger.info(`Received ${signal}. Starting graceful shutdown...`);
      io.close();
      httpServer.close(async () => {
        await disconnectDatabase();
        process.exit(0);
      });
    };

    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGTERM', () => shutdown('SIGTERM'));
  } catch (err) {
    logger.error('Failed to start server', {
      error: err instanceof Error ? err.message : String(err),
    });
    process.exit(1);
  }
}

bootstrap();
