USE eventix;
GO
DELETE FROM TicketCategories;
DELETE FROM Events;
INSERT INTO Events (id, title, artist, description, category, date, time, year, venueName, venueAddress, venueCity, venueCapacity, imageUrl, isFeatured) VALUES ('evt-001', 'Neon Waves Festival 2025', 'Various Artists', 'Experience three days of electronic music across 5 stages featuring the world''s top DJs and emerging artists. Join us for an unforgettable journey through sound and light.', 'festival', '2025-07-15', '14:00', 2025, 'Jakarta International Expo', 'Jl. Gatot Subroto, Jakarta Pusat, DKI Jakarta 10270', 'Jakarta', 50000, 'https://images.unsplash.com/photo-1533174072545-7a4b6ad7a6c3?w=800&h=600&fit=crop', 1);
INSERT INTO TicketCategories (id, event_id, name, display_name, price, quantity_total, available_quantity) VALUES ('cat-001-1', 'evt-001', 'GENERAL', 'General Admission', 2990000, 30000, 15000);
INSERT INTO TicketCategories (id, event_id, name, display_name, price, quantity_total, available_quantity) VALUES ('cat-001-2', 'evt-001', 'VIP', 'VIP Package', 7490000, 2000, 450);
INSERT INTO TicketCategories (id, event_id, name, display_name, price, quantity_total, available_quantity) VALUES ('cat-001-3', 'evt-001', 'VVIP', 'VVIP Ultra', 15000000, 100, 10);
GO