import { getDb, sql } from './db';

export interface Event {
  id: string;
  title: string;
  artist: string;
  description: string;
  category: string;
  date: Date;
  time: string;
  year: number;
  organizerId: string;
  status: string;
  venueName: string;
  venueAddress?: string;
  venueCity: string;
  venueCapacity: number;
  imageUrl?: string;
  bannerImageUrl?: string;
  tags?: string;
  isFeatured: boolean;
  viewCount: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface TicketCategory {
  id: string;
  event_id: string;
  name: string;
  display_name: string;
  description?: string;
  price: number;
  total_quantity: number;
  available_quantity: number;
  max_per_order: number;
  sale_start_date?: Date;
  sale_end_date?: Date;
}

export async function findEventById(id: string): Promise<Event | null> {
  const pool = await getDb();
  const result = await pool.request()
    .input('id', sql.NVarChar, id)
    .query('SELECT * FROM Events WHERE id = @id');
  return result.recordset[0] || null;
}

export async function findTicketCategoriesByIds(ids: string[]): Promise<TicketCategory[]> {
  if (ids.length === 0) return [];
  const pool = await getDb();
  const request = pool.request();
  
  const params = ids.map((id, index) => {
    const paramName = `id${index}`;
    request.input(paramName, sql.NVarChar, id);
    return `@${paramName}`;
  });
  
  const query = `SELECT * FROM TicketCategories WHERE id IN (${params.join(', ')})`;
  const result = await request.query(query);
  return result.recordset;
}
