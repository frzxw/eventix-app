const Redis = require('ioredis');

const redis = new Redis({
  host: process.env.REDIS_HOST || 'localhost',
  port: Number(process.env.REDIS_PORT || '6379'),
  keyPrefix: process.env.REDIS_KEY_PREFIX || 'eventix:'
});

async function seed() {
  console.log('Seeding inventory...');
  
  const inventory = [
    { key: 'inventory:evt-001:cat-001-1', available: 15000, total: 30000, pending: 0, sold: 15000 },
    { key: 'inventory:evt-001:cat-001-2', available: 450, total: 2000, pending: 0, sold: 1550 },
    { key: 'inventory:evt-001:cat-001-3', available: 10, total: 100, pending: 0, sold: 90 }
  ];

  for (const item of inventory) {
    await redis.hset(item.key, {
      available: item.available,
      total: item.total,
      pending: item.pending,
      sold: item.sold
    });
    console.log(`Seeded ${item.key}`);
  }

  console.log('Done.');
  redis.disconnect();
}

seed().catch(console.error);
