const sql = require('mssql');
const { CosmosClient } = require('@azure/cosmos');
const bcrypt = require('bcryptjs');
const { randomUUID } = require('crypto');
const fs = require('fs');
const path = require('path');

// Disable TLS verification for local emulator if needed
if (process.env.COSMOS_ENDPOINT?.includes('localhost') || !process.env.COSMOS_ENDPOINT) {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
}

// SQL Configuration
const sqlConfig = process.env.DATABASE_URL
  ? {
      connectionString: process.env.DATABASE_URL,
    }
  : {
      user: process.env.SQL_USER || 'sa',
      password: process.env.SQL_PASSWORD || 'StrongPassword123!',
      server: process.env.SQL_SERVER || 'localhost',
      database: process.env.SQL_DATABASE || 'eventix',
      options: {
        encrypt: true,
        trustServerCertificate: true,
      },
    };

// Cosmos Configuration
const cosmosEndpoint = process.env.COSMOS_ENDPOINT || 'https://localhost:8081';
const cosmosKey = process.env.COSMOS_KEY || 'C2y6yDjf5/R+ob0N8A7Cgv30VRDJIWEHLM+4QDU5DE2nQ9nDuVTqobD4b8mGGyPMbIZnqyMsEcaGQy67XIw/Jw==';
const cosmosDatabaseId = process.env.COSMOS_DATABASE || 'eventix';
const cosmosContainerId = 'events';

const cosmosClient = new CosmosClient({ endpoint: cosmosEndpoint, key: cosmosKey });

const LOCATIONS = [
  { city: 'Jakarta', venues: ['Gelora Bung Karno Stadium', 'Jakarta International Stadium', 'Istora Senayan', 'Jakarta Convention Center'] },
  { city: 'Bali', venues: ['GWK Cultural Park', 'Bali Nusa Dua Convention Center'] },
  { city: 'Surabaya', venues: ['Gelora Bung Tomo', 'Grand City Convention Hall'] },
  { city: 'Bandung', venues: ['Gelora Bandung Lautan Api', 'Sabuga'] }
];

const ARTISTS = [
  'Coldplay', 'Taylor Swift', 'Ed Sheeran', 'Bruno Mars', 'Adele', 
  'Dewa 19', 'Sheila On 7', 'Tulus', 'Raisa', 'Noah'
];

const EVENT_TEMPLATES = [
  {
    title: '{Artist} World Tour 2025',
    description: 'Experience the magic of {Artist} live! A spectacular show featuring hits from their latest album and classics. Don\'t miss this once in a lifetime opportunity.',
    category: 'Concert',
    basePrice: 1500000
  },
  {
    title: '{City} Tech Summit 2025',
    description: 'The biggest tech conference in {City}. Join industry leaders for 3 days of innovation, networking, and workshops on AI, Cloud, and Web3.',
    category: 'Conference',
    basePrice: 2500000
  },
  {
    title: '{City} Jazz Festival',
    description: 'A weekend of smooth jazz and good vibes. Featuring international and local jazz legends.',
    category: 'Festival',
    basePrice: 800000
  },
  {
    title: 'The Lion King - {City}',
    description: 'The award-winning musical comes to {City}. Experience the stunning visuals and unforgettable music.',
    category: 'Theater',
    basePrice: 1200000
  },
  {
    title: 'Indonesia vs Argentina',
    description: 'International Friendly Match. Witness the clash of titans at the national stadium.',
    category: 'Sports',
    basePrice: 500000
  }
];

function getRandomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function getRandomElement(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function addDays(date, days) {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

async function seed() {
  console.log('Connecting to SQL database...');
  const pool = await sql.connect(sqlConfig);
  console.log('Connected to SQL.');

  console.log('Connecting to Cosmos DB...');
  const { database } = await cosmosClient.databases.createIfNotExists({ id: cosmosDatabaseId });
  const { container } = await database.containers.createIfNotExists({ id: cosmosContainerId, partitionKey: '/id' });
  console.log('Connected to Cosmos DB.');

  try {
    // 0. Run Schema (SQL)
    console.log('Applying SQL schema...');
    const schemaPath = path.join(__dirname, '../azure/database/schema.sql');
    const schemaSql = fs.readFileSync(schemaPath, 'utf8');
    
    const batches = schemaSql
      .split(/GO\s*$/im)
      .map(batch => batch.trim())
      .filter(batch => batch.length > 0);

    for (const batch of batches) {
      if (batch.toUpperCase().startsWith('USE ') || batch.toUpperCase().startsWith('CREATE DATABASE ')) {
        continue;
      }
      try {
        await pool.query(batch);
      } catch (err) {
        console.warn('Schema batch warning:', err.message);
      }
    }
    console.log('SQL Schema applied.');

    // 1. Clean existing data
    console.log('Cleaning SQL tables...');
    await pool.query(`
      DELETE FROM PaymentLogs;
      DELETE FROM Tickets;
      DELETE FROM OrderItems;
      DELETE FROM Orders;
      DELETE FROM TicketCategories;
      DELETE FROM EventReviews;
      DELETE FROM Events;
      DELETE FROM Sessions;
      DELETE FROM Users;
    `);

    console.log('Cleaning Cosmos DB container...');
    // Recreating container is faster for full reset.
    await container.delete();
    await database.containers.createIfNotExists({ id: cosmosContainerId, partitionKey: '/id' });
    console.log('Cosmos DB cleaned.');

    // 2. Seed Users (SQL only for now, unless we want users in Cosmos too)
    console.log('Seeding Users...');
    const passwordHash = await bcrypt.hash('Password123!', 10);
    
    const users = [
      {
        id: randomUUID(),
        email: 'admin@eventix.com',
        firstName: 'Admin',
        lastName: 'User',
        role: 'admin'
      },
      {
        id: randomUUID(),
        email: 'user@example.com',
        firstName: 'John',
        lastName: 'Doe',
        role: 'user'
      },
      {
        id: randomUUID(),
        email: 'jane@example.com',
        firstName: 'Jane',
        lastName: 'Smith',
        role: 'user'
      }
    ];

    for (const user of users) {
      await pool.request()
        .input('id', sql.NVarChar, user.id)
        .input('email', sql.NVarChar, user.email)
        .input('passwordHash', sql.NVarChar, passwordHash)
        .input('firstName', sql.NVarChar, user.firstName)
        .input('lastName', sql.NVarChar, user.lastName)
        .query(`
          INSERT INTO Users (id, email, passwordHash, firstName, lastName, emailVerified)
          VALUES (@id, @email, @passwordHash, @firstName, @lastName, 1)
        `);
    }

    // 3. Seed Events (SQL + Cosmos)
    console.log('Seeding Events...');
    const startDate = new Date();

    for (let i = 0; i < 20; i++) {
      const location = getRandomElement(LOCATIONS);
      const venueName = getRandomElement(location.venues);
      const template = getRandomElement(EVENT_TEMPLATES);
      const artist = getRandomElement(ARTISTS);
      
      const title = template.title.replace('{Artist}', artist).replace('{City}', location.city);
      const description = template.description.replace('{Artist}', artist).replace('{City}', location.city);
      
      const eventDate = addDays(startDate, getRandomInt(10, 180));
      const year = eventDate.getFullYear();
      const time = `${getRandomInt(18, 21)}:00`;

      let imageUrl = 'https://images.unsplash.com/photo-1470229722913-7c0e2dbbafd3?q=80&w=2070&auto=format&fit=crop';
      if (template.category === 'Conference') imageUrl = 'https://images.unsplash.com/photo-1544531586-fde5298cdd40?q=80&w=2070&auto=format&fit=crop';
      if (template.category === 'Sports') imageUrl = 'https://images.unsplash.com/photo-1461896836934-ffe607ba8211?q=80&w=2070&auto=format&fit=crop';
      if (template.category === 'Theater') imageUrl = 'https://images.unsplash.com/photo-1507676184212-d03ab07a11d0?q=80&w=2069&auto=format&fit=crop';
      if (template.category === 'Festival') imageUrl = 'https://images.unsplash.com/photo-1533174072545-e8d4aa97edf9?q=80&w=1974&auto=format&fit=crop';

      const venueCapacity = getRandomInt(5000, 50000);
      const isFeatured = i < 5 ? 1 : 0;

      const eventId = randomUUID();

      // Insert into SQL
      await pool.request()
        .input('id', sql.NVarChar, eventId)
        .input('title', sql.NVarChar, title)
        .input('artist', sql.NVarChar, template.category === 'Concert' ? artist : (template.category === 'Festival' ? 'Various Artists' : 'Eventix'))
        .input('description', sql.NVarChar, description)
        .input('category', sql.NVarChar, template.category)
        .input('date', sql.DateTime2, eventDate)
        .input('time', sql.NVarChar, time)
        .input('year', sql.Int, year)
        .input('venueName', sql.NVarChar, venueName)
        .input('venueCity', sql.NVarChar, location.city)
        .input('venueCapacity', sql.Int, venueCapacity)
        .input('imageUrl', sql.NVarChar, imageUrl)
        .input('bannerImageUrl', sql.NVarChar, imageUrl)
        .input('isFeatured', sql.Bit, isFeatured)
        .query(`
          INSERT INTO Events (id, title, artist, description, category, date, time, year, venueName, venueCity, venueCapacity, imageUrl, bannerImageUrl, isFeatured)
          VALUES (@id, @title, @artist, @description, @category, @date, @time, @year, @venueName, @venueCity, @venueCapacity, @imageUrl, @bannerImageUrl, @isFeatured)
        `);

      // Seed Ticket Categories
      const categories = [
        { name: 'VIP', priceMultiplier: 2.5, qtyPercent: 0.1 },
        { name: 'Platinum', priceMultiplier: 1.8, qtyPercent: 0.2 },
        { name: 'Gold', priceMultiplier: 1.2, qtyPercent: 0.3 },
        { name: 'Silver', priceMultiplier: 1.0, qtyPercent: 0.4 }
      ];

      const cosmosCategories = [];
      let sortOrder = 1;
      for (const cat of categories) {
        const price = Math.floor(template.basePrice * cat.priceMultiplier);
        const qty = Math.floor(venueCapacity * cat.qtyPercent);
        const catId = randomUUID();
        
        // Insert into SQL
        await pool.request()
          .input('id', sql.NVarChar, catId)
          .input('eventId', sql.NVarChar, eventId)
          .input('name', sql.NVarChar, cat.name)
          .input('displayName', sql.NVarChar, `${cat.name} Access`)
          .input('price', sql.Decimal(10, 2), price)
          .input('qty', sql.Int, qty)
          .input('sortOrder', sql.Int, sortOrder)
          .query(`
            INSERT INTO TicketCategories (id, event_id, name, display_name, price, quantity_total, available_quantity, sort_order)
            VALUES (@id, @eventId, @name, @displayName, @price, @qty, @qty, @sortOrder)
          `);

        // Prepare for Cosmos
        cosmosCategories.push({
          id: catId,
          name: cat.name,
          displayName: `${cat.name} Access`,
          price: price,
          currency: 'IDR',
          total: qty,
          available: qty,
          status: 'available',
          benefits: [],
          sortOrder: sortOrder
        });
        sortOrder++;
      }

      // Insert into Cosmos DB
      const prices = cosmosCategories.map(c => c.price);
      const pricing = {
        min: Math.min(...prices),
        max: Math.max(...prices),
        currency: 'IDR'
      };

      const eventDoc = {
        id: eventId,
        title,
        artist: template.category === 'Concert' ? artist : (template.category === 'Festival' ? 'Various Artists' : 'Eventix'),
        description,
        category: template.category,
        date: eventDate.toISOString().split('T')[0],
        time,
        venue: {
          name: venueName,
          city: location.city,
          address: `${venueName}, ${location.city}`,
          capacity: venueCapacity
        },
        image: imageUrl,
        bannerImage: imageUrl,
        featured: Boolean(isFeatured),
        viewCount: getRandomInt(0, 1000),
        tags: [template.category, location.city],
        ticketCategories: cosmosCategories,
        pricing
      };

      // Re-fetch container to ensure we are using the fresh one
      const freshContainer = database.container(cosmosContainerId);
      await freshContainer.items.create(eventDoc);
      process.stdout.write('.');
    }

    console.log('\nSeeding completed successfully!');
  } catch (err) {
    console.error('Seeding failed:', err);
  } finally {
    await sql.close();
  }
}

seed();
