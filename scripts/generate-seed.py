import os
import json

events = [
  {
    "id": "evt-001",
    "title": "Neon Waves Festival 2025",
    "artist": "Various Artists",
    "category": "festival",
    "date": "2025-07-15",
    "time": "14:00",
    "venueName": "Jakarta International Expo",
    "venueCity": "Jakarta",
    "venueAddress": "Jl. Gatot Subroto, Jakarta Pusat, DKI Jakarta 10270",
    "venueCapacity": 50000,
    "imageUrl": "https://images.unsplash.com/photo-1533174072545-7a4b6ad7a6c3?w=800&h=600&fit=crop",
    "description": "Experience three days of electronic music across 5 stages featuring the world's top DJs and emerging artists. Join us for an unforgettable journey through sound and light.",
    "year": 2025,
    "isFeatured": 1,
    "ticketCategories": [
      {
        "id": "cat-001-1",
        "name": "GENERAL",
        "display_name": "General Admission",
        "price": 2990000,
        "total_quantity": 30000,
        "available_quantity": 15000,
        "max_per_order": 4
      },
      {
        "id": "cat-001-2",
        "name": "VIP",
        "display_name": "VIP Package",
        "price": 7490000,
        "total_quantity": 2000,
        "available_quantity": 450,
        "max_per_order": 4
      },
      {
        "id": "cat-001-3",
        "name": "VVIP",
        "display_name": "VVIP Ultra",
        "price": 15000000,
        "total_quantity": 100,
        "available_quantity": 10,
        "max_per_order": 2
      }
    ]
  }
]

sql_statements = []
sql_statements.append("USE eventix;")
sql_statements.append("GO")
sql_statements.append("DELETE FROM TicketCategories;")
sql_statements.append("DELETE FROM Events;")

for evt in events:
    desc = evt['description'].replace("'", "''")
    sql_statements.append(f"INSERT INTO Events (id, title, artist, description, category, date, time, year, venueName, venueAddress, venueCity, venueCapacity, imageUrl, isFeatured) VALUES ('{evt['id']}', '{evt['title']}', '{evt['artist']}', '{desc}', '{evt['category']}', '{evt['date']}', '{evt['time']}', {evt['year']}, '{evt['venueName']}', '{evt['venueAddress']}', '{evt['venueCity']}', {evt['venueCapacity']}, '{evt['imageUrl']}', {evt['isFeatured']});")
    
    for cat in evt['ticketCategories']:
        sql_statements.append(f"INSERT INTO TicketCategories (id, event_id, name, display_name, price, quantity_total, available_quantity) VALUES ('{cat['id']}', '{evt['id']}', '{cat['name']}', '{cat['display_name']}', {cat['price']}, {cat['total_quantity']}, {cat['available_quantity']});")

sql_statements.append("GO")

output_path = os.path.join(os.path.dirname(__file__), '../azure/database/seed.sql')
with open(output_path, 'w') as f:
    f.write('\n'.join(sql_statements))

print(f"Generated seed.sql at {output_path}")
