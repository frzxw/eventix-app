import { getDb, sql } from './db';

export interface Ticket {
  id: string;
  order_id: string;
  event_id: string;
  category_id: string;
  ticket_number: string;
  status: string;
  qr_code_url: string | null;
  qr_code_data: string;
  barcode_data: string;
  created_at: Date;
  updated_at: Date;
}

export async function createTicket(ticket: Omit<Ticket, 'created_at' | 'updated_at'>): Promise<Ticket> {
  const pool = await getDb();
  const result = await pool.request()
    .input('id', sql.UniqueIdentifier, ticket.id)
    .input('order_id', sql.UniqueIdentifier, ticket.order_id)
    .input('event_id', sql.UniqueIdentifier, ticket.event_id)
    .input('category_id', sql.UniqueIdentifier, ticket.category_id)
    .input('ticket_number', sql.NVarChar, ticket.ticket_number)
    .input('status', sql.NVarChar, ticket.status)
    .input('qr_code_url', sql.NVarChar, ticket.qr_code_url)
    .input('qr_code_data', sql.NVarChar, ticket.qr_code_data)
    .input('barcode_data', sql.NVarChar, ticket.barcode_data)
    .query(`
      INSERT INTO tickets (id, order_id, event_id, category_id, ticket_number, status, qr_code_url, qr_code_data, barcode_data)
      OUTPUT INSERTED.*
      VALUES (@id, @order_id, @event_id, @category_id, @ticket_number, @status, @qr_code_url, @qr_code_data, @barcode_data)
    `);
  return result.recordset[0];
}

export async function findTicketById(id: string): Promise<Ticket | null> {
  const pool = await getDb();
  const result = await pool.request()
    .input('id', sql.UniqueIdentifier, id)
    .query('SELECT * FROM tickets WHERE id = @id');
  return result.recordset[0] || null;
}

export async function findTicketsByOrderId(orderId: string): Promise<Ticket[]> {
  const pool = await getDb();
  const result = await pool.request()
    .input('order_id', sql.UniqueIdentifier, orderId)
    .query('SELECT * FROM tickets WHERE order_id = @order_id');
  return result.recordset;
}

