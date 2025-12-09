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
  await redis.set(key, quantity);
  console.log(`Set ${key} to ${quantity}`);
  
  await redis.set(`inventory:${eventId}:cat-001-2`, 450);
  console.log(`Set inventory:${eventId}:cat-001-2 to 450`);

  await redis.set(`inventory:${eventId}:cat-001-3`, 10);
  console.log(`Set inventory:${eventId}:cat-001-3 to 10`);

  redis.disconnect();
}

main().catch(console.error);
