const Redis = require('ioredis');

const redis = new Redis({ 
    host: process.env.REDIS_HOST || 'localhost', 
    port: Number(process.env.REDIS_PORT) || 6379,
    password: process.env.REDIS_PASSWORD
});

async function main() {
  console.log('🧹 Flushing Redis database...');
  await redis.flushall();
  console.log('✅ Redis flushed.');

  console.log('🌱 Seeding Inventory...');
  const eventId = 'evt-001';
  
  // Seed 50,000 tickets (Coldplay scale)
  // Use HSET because the Lua script expects a Hash with 'available' field
  await redis.hset(`inventory:${eventId}:cat-001-1`, {
    available: 50000,
    total: 50000,
    pending: 0,
    version: 1
  });
  console.log(`Set inventory:${eventId}:cat-001-1 to 50000 (Hash)`);
  
  await redis.hset(`inventory:${eventId}:cat-001-2`, {
    available: 10000,
    total: 10000,
    pending: 0,
    version: 1
  });

  await redis.hset(`inventory:${eventId}:cat-001-3`, {
    available: 5000,
    total: 5000,
    pending: 0,
    version: 1
  });

  console.log('🚀 Ready for Ticket War!');
  redis.disconnect();
}

main().catch(console.error);
