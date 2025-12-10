const sql = require('mssql');
const bcrypt = require('bcryptjs');
const { randomUUID } = require('crypto');
const fs = require('fs');
const path = require('path');

// Configuration
const config = process.env.DATABASE_URL
  ? {
      connectionString: process.env.DATABASE_URL,
    }
  : {
      user: process.env.SQL_USER,
      password: process.env.SQL_PASSWORD,
      server: process.env.SQL_SERVER || 'localhost',
      database: process.env.SQL_DATABASE || 'eventix',
      options: {
        encrypt: true,
        trustServerCertificate: true,
      },
    };

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
  console.log('Connecting to database...');
  try {
    const pool = await sql.connect(config);
    console.log('Connected.');

    // 0. Run Schema
    console.log('Applying schema...');
    const schemaPath = path.join(__dirname, '../azure/database/schema.sql');
    const schemaSql = fs.readFileSync(schemaPath, 'utf8');
    
    // Split by GO and remove USE statements (as we are already connected to the DB)
    const batches = schemaSql
      .split(/GO\s*$/im)
      .map(batch => batch.trim())
      .filter(batch => batch.length > 0);

    for (const batch of batches) {
      // Skip USE statements or CREATE DATABASE if we are already connected to the target DB
      if (batch.toUpperCase().startsWith('USE ') || batch.toUpperCase().startsWith('CREATE DATABASE ')) {
        continue;
      }
      try {
        await pool.query(batch);
      } catch (err) {
        // Ignore "There is already an object named..." errors if we want idempotency, 
        // but the schema uses IF NOT EXISTS so it should be fine.
        // However, if the error is about something else, we should log it.
        console.warn('Schema batch warning (might be harmless if exists):', err.message);
      }
    }
    console.log('Schema applied.');

    // 1. Clean existing data
    console.log('Cleaning tables...');
    // Order matters due to FK constraints
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

    // 2. Seed Users
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

    // 3. Seed Events
    console.log('Seeding Events...');
    const events = [];
    const startDate = new Date();

    // Generate 20 realistic events
    for (let i = 0; i < 20; i++) {
      const location = getRandomElement(LOCATIONS);
      const venue = getRandomElement(location.venues);
      const template = getRandomElement(EVENT_TEMPLATES);
      const artist = getRandomElement(ARTISTS);
      
      const title = template.title.replace('{Artist}', artist).replace('{City}', location.city);
      const description = template.description.replace('{Artist}', artist).replace('{City}', location.city);
      
      // Adjust title/desc for specific categories if needed
      if (template.category === 'Sports' && title.includes('Indonesia')) {
         // Keep as is
      } else if (template.category === 'Concert') {
         // Keep as is
      }

      const eventDate = addDays(startDate, getRandomInt(10, 180));
      const year = eventDate.getFullYear();
      const time = `${getRandomInt(18, 21)}:00`;

      // Image URLs (using Unsplash source for reliability)
      let imageUrl = 'https://images.unsplash.com/photo-1470229722913-7c0e2dbbafd3?q=80&w=2070&auto=format&fit=crop'; // Concert default
      if (template.category === 'Conference') imageUrl = 'https://images.unsplash.com/photo-1544531586-fde5298cdd40?q=80&w=2070&auto=format&fit=crop';
      if (template.category === 'Sports') imageUrl = 'https://images.unsplash.com/photo-1461896836934-ffe607ba8211?q=80&w=2070&auto=format&fit=crop';
      if (template.category === 'Theater') imageUrl = 'https://images.unsplash.com/photo-1507676184212-d03ab07a11d0?q=80&w=2069&auto=format&fit=crop';
      if (template.category === 'Festival') imageUrl = 'https://images.unsplash.com/photo-1533174072545-e8d4aa97edf9?q=80&w=1974&auto=format&fit=crop';

      const event = {
        id: randomUUID(),
        title,
        artist: template.category === 'Concert' ? artist : (template.category === 'Festival' ? 'Various Artists' : 'Eventix'),
        description,
        category: template.category,
        date: eventDate,
        time,
        year,
        venueName: venue,
        venueCity: location.city,
        venueCapacity: getRandomInt(5000, 50000),
        imageUrl,
        bannerImageUrl: imageUrl,
        isFeatured: i < 5 ? 1 : 0, // First 5 are featured
        basePrice: template.basePrice
      };

      events.push(event);

      await pool.request()
        .input('id', sql.NVarChar, event.id)
        .input('title', sql.NVarChar, event.title)
        .input('artist', sql.NVarChar, event.artist)
        .input('description', sql.NVarChar, event.description)
        .input('category', sql.NVarChar, event.category)
        .input('date', sql.DateTime2, event.date)
        .input('time', sql.NVarChar, event.time)
        .input('year', sql.Int, event.year)
        .input('venueName', sql.NVarChar, event.venueName)
        .input('venueCity', sql.NVarChar, event.venueCity)
        .input('venueCapacity', sql.Int, event.venueCapacity)
        .input('imageUrl', sql.NVarChar, event.imageUrl)
        .input('bannerImageUrl', sql.NVarChar, event.bannerImageUrl)
        .input('isFeatured', sql.Bit, event.isFeatured)
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

      let sortOrder = 1;
      for (const cat of categories) {
        const price = Math.floor(event.basePrice * cat.priceMultiplier);
        const qty = Math.floor(event.venueCapacity * cat.qtyPercent);
        
        await pool.request()
          .input('eventId', sql.NVarChar, event.id)
          .input('name', sql.NVarChar, cat.name)
          .input('displayName', sql.NVarChar, `${cat.name} Access`)
          .input('price', sql.Decimal(10, 2), price)
          .input('qty', sql.Int, qty)
          .input('sortOrder', sql.Int, sortOrder++)
          .query(`
            INSERT INTO TicketCategories (event_id, name, display_name, price, quantity_total, available_quantity, sort_order)
            VALUES (@eventId, @name, @displayName, @price, @qty, @qty, @sortOrder)
          `);
      }
    }

    console.log('Seeding completed successfully!');
  } catch (err) {
    console.error('Seeding failed:', err);
  } finally {
    // Close the pool if it was created
    // Note: mssql.connect returns a pool, but also sets the global pool. 
    // We can close the global pool.
    await sql.close();
  }
}

seed();
