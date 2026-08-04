const app = require('./src/app');
const env = require('./src/config/env');
const { connectDB } = require('./src/config/db');
const pino = require('pino');

const logger = pino({
  transport: env.NODE_ENV === 'development' ? { target: 'pino-pretty' } : undefined
});

const startServer = async () => {
  try {
    // 1. Connect to Database
    await connectDB();

    // 2. Start Listening
    const server = app.listen(env.PORT, () => {
      logger.info(`🚀 Server running in ${env.NODE_ENV} mode on port ${env.PORT}`);
    });

    // Handle process termination signals
    const gracefulShutdown = () => {
      logger.info('Received kill signal, shutting down gracefully...');
      server.close(async () => {
        logger.info('Closed out remaining connections');
        const { disconnectDB } = require('./src/config/db');
        await disconnectDB();
        process.exit(0);
      });
      
      // Force close after 10s
      setTimeout(() => {
        logger.error('Could not close connections in time, forcefully shutting down');
        process.exit(1);
      }, 10000);
    };

    process.on('SIGTERM', gracefulShutdown);
    process.on('SIGINT', gracefulShutdown);

  } catch (error) {
    logger.error(`❌ Server initialization failed: ${error.message}`);
    process.exit(1);
  }
};

// Handle unhandled promise rejections
process.on('unhandledRejection', (err) => {
  logger.error(`Unhandled Promise Rejection: ${err.message}`);
  logger.error(err.stack);
  // Optional: Graceful shutdown depending on severity
});

// Handle uncaught exceptions
process.on('uncaughtException', (err) => {
  logger.error(`Uncaught Exception: ${err.message}`);
  logger.error(err.stack);
  process.exit(1);
});

startServer();
