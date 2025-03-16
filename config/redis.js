import Redis from 'ioredis';
import { redisConfig } from '../config';

const redisClient = new Redis(redisConfig.REDIS_URL, {
  tls: {
    rejectUnauthorized: false
  },
  enableReadyCheck: false,
  maxRetriesPerRequest: null
});

export default redisClient;