const mongoose = require('mongoose');
const env = require('./env');
const pino = require('pino');

const logger = pino({
  transport: env.NODE_ENV === 'development' ? { target: 'pino-pretty' } : undefined
});

let isConnected = false;

const connectDB = async (customUri = null) => {
  if (isConnected) {
    return;
  }

  const uri = customUri || env.MONGO_URI;

  try {
    const conn = await mongoose.connect(uri);
    isConnected = true;
    logger.info(`✅ MongoDB Connected: ${conn.connection.host}`);
  } catch (error) {
    logger.error(`❌ MongoDB Connection Error: ${error.message}`);
    if (env.NODE_ENV !== 'test') {
      process.exit(1);
    }
    throw error;
  }
};

const disconnectDB = async () => {
  if (!isConnected) {
    return;
  }

  try {
    await mongoose.disconnect();
    isConnected = false;
    logger.info('🔌 MongoDB Disconnected');
  } catch (error) {
    logger.error(`❌ MongoDB Disconnection Error: ${error.message}`);
    throw error;
  }
};

module.exports = {
  connectDB,
  disconnectDB
};
