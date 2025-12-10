const Redis = require('ioredis');

// Adjust connection details if needed
const redis = new Redis({ 
    host: process.env.REDIS_HOST || 'localhost', 
    port: Number(process.env.REDIS_PORT) || 6379,
    password: process.env.REDIS_PASSWORD
});

async function main() {
  const eventId = 'evt-001';
  const categoryId = 'cat-001-1';
  const quantity = 15000; // From seed.sql

  const key = `inventory:${eventId}:${categoryId}`;
  // Use HSET for compatibility with Lua scripts
  await redis.hset(key, {
    available: quantity,
    total: quantity,
    pending: 0,
    version: 1
  });
  console.log(`Set ${key} to ${quantity} (Hash)`);
  
  await redis.hset(`inventory:${eventId}:cat-001-2`, {
    available: 450,
    total: 450,
    pending: 0,
    version: 1
  });
  console.log(`Set inventory:${eventId}:cat-001-2 to 450 (Hash)`);

  await redis.hset(`inventory:${eventId}:cat-001-3`, {
    available: 10,
    total: 10,
    pending: 0,
    version: 1
  });
  console.log(`Set inventory:${eventId}:cat-001-3 to 10 (Hash)`);

  redis.disconnect();
}

main().catch(console.error);
