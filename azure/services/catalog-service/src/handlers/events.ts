import { HttpRequest, HttpResponseInit } from '@azure/functions';
import { z } from 'zod';
import { getSqlPool } from '../utils/sql';
import { formatZodError } from '../utils/validation';
import sql from 'mssql';

const listEventsQuerySchema = z
  .object({
    category: z.string().trim().min(1).optional(),
    city: z.string().trim().min(1).optional(),
    date: z
      .string()
      .trim()
      .regex(/^\d{4}-\d{2}-\d{2}$/u, 'date must use YYYY-MM-DD format')
      .optional(),
    search: z.string().trim().min(1).optional(),
    sort: z.enum(['date', 'popularity']).default('date'),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(50).default(12),
  })
  .strict();

const searchEventsQuerySchema = z
  .object({
    q: z.string().trim().optional(),
  })
  .strict();

const getEventParamsSchema = z.object({
  id: z.string(),
});

const featuredEventsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(20).default(12).optional(),
});

function optionalParam(value: string | null): string | undefined {
  if (!value) {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length ? trimmed : undefined;
}

function ok(body: any): HttpResponseInit { return { status: 200, jsonBody: body }; }
function badRequest(message: string): HttpResponseInit { return { status: 400, jsonBody: { success: false, error: 'BAD_REQUEST', message } }; }
function notFound(message: string): HttpResponseInit { return { status: 404, jsonBody: { success: false, error: 'NOT_FOUND', message } }; }
function fail(message: string): HttpResponseInit { return { status: 500, jsonBody: { success: false, error: 'SERVER_ERROR', message } }; }

export async function listEventsHandler(req: HttpRequest): Promise<HttpResponseInit> {
  try {
    const url = new URL(req.url);

    const parsedQuery = listEventsQuerySchema.safeParse({
      category: optionalParam(url.searchParams.get('category')),
      city: optionalParam(url.searchParams.get('city')),
      date: optionalParam(url.searchParams.get('date')),
      search: optionalParam(url.searchParams.get('search')),
      sort: optionalParam(url.searchParams.get('sort')),
      page: optionalParam(url.searchParams.get('page')),
      limit: optionalParam(url.searchParams.get('limit')),
    });

    if (!parsedQuery.success) {
      return badRequest(formatZodError(parsedQuery.error));
    }

    const { category, city, date, search, sort, page, limit } = parsedQuery.data;
    const offset = (page - 1) * limit;

    const pool = await getSqlPool();
    const request = pool.request();

    let queryText = "SELECT * FROM Events WHERE 1=1";
    let countQueryText = "SELECT COUNT(*) as total FROM Events WHERE 1=1";

    if (category && category !== 'all') {
      queryText += " AND category = @category";
      countQueryText += " AND category = @category";
      request.input('category', sql.NVarChar, category);
    }
    if (city) {
      queryText += " AND venueCity = @city";
      countQueryText += " AND venueCity = @city";
      request.input('city', sql.NVarChar, city);
    }
    if (date) {
      // Assuming date column is DATETIME2, we compare the date part
      queryText += " AND CAST(date AS DATE) = @date";
      countQueryText += " AND CAST(date AS DATE) = @date";
      request.input('date', sql.Date, new Date(date));
    }
    if (search) {
      queryText += " AND (title LIKE @search OR description LIKE @search OR venueCity LIKE @search)";
      countQueryText += " AND (title LIKE @search OR description LIKE @search OR venueCity LIKE @search)";
      request.input('search', sql.NVarChar, `%${search}%`);
    }

    const countResult = await request.query(countQueryText);
    const total = countResult.recordset[0].total;

    if (sort === 'popularity') {
      queryText += " ORDER BY viewCount DESC";
    } else {
      queryText += " ORDER BY date ASC";
    }
    
    queryText += " OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY";
    request.input('offset', sql.Int, offset);
    request.input('limit', sql.Int, limit);

    const result = await request.query(queryText);
    const events = result.recordset;

    // Fetch ticket categories for these events to calculate pricing
    const eventIds = events.map((e: any) => e.id);
    let ticketCategories: any[] = [];
    if (eventIds.length > 0) {
        const tcRequest = pool.request();
        const idsList = eventIds.map(id => `'${id.replace(/'/g, "''")}'`).join(',');
        const tcResult = await tcRequest.query(`SELECT * FROM TicketCategories WHERE event_id IN (${idsList})`);
        ticketCategories = tcResult.recordset;
    }

    const eventsWithDetails = events.map((event: any) => {
        const cats = ticketCategories.filter((tc: any) => tc.event_id === event.id);
        return transformEvent(event, cats);
    });

    return ok({ success: true, events: eventsWithDetails, total, page, totalPages: Math.ceil(total / limit) });
  } catch (e: any) {
    return fail(`Failed to list events: ${e?.message || 'Unknown error'}`);
  }
}

export async function getEventHandler(req: HttpRequest): Promise<HttpResponseInit> {
  try {
    const path = new URL(req.url).pathname;
    const id = path.split('/').pop();
    
    const parsedParams = getEventParamsSchema.safeParse({ id });
    if (!parsedParams.success) {
      return badRequest(formatZodError(parsedParams.error));
    }

    const pool = await getSqlPool();
    const request = pool.request();
    request.input('id', sql.NVarChar, parsedParams.data.id);

    const result = await request.query("SELECT * FROM Events WHERE id = @id");
    const event = result.recordset[0];

    if (!event) return notFound('Event not found');

    const tcResult = await request.query("SELECT * FROM TicketCategories WHERE event_id = @id");
    const categories = tcResult.recordset;

    // Related events
    const relatedRequest = pool.request();
    relatedRequest.input('category', sql.NVarChar, event.category);
    relatedRequest.input('id', sql.NVarChar, event.id);
    const relatedResult = await relatedRequest.query("SELECT TOP 6 * FROM Events WHERE category = @category AND id != @id ORDER BY date ASC");
    const relatedEvents = relatedResult.recordset;
    
    const relatedIds = relatedEvents.map((e: any) => e.id);
    let relatedCategories: any[] = [];
    if (relatedIds.length > 0) {
        const idsList = relatedIds.map(rid => `'${rid.replace(/'/g, "''")}'`).join(',');
        const rcResult = await pool.request().query(`SELECT * FROM TicketCategories WHERE event_id IN (${idsList})`);
        relatedCategories = rcResult.recordset;
    }

    const relatedEventsWithDetails = relatedEvents.map((e: any) => {
        const cats = relatedCategories.filter((tc: any) => tc.event_id === e.id);
        return transformEvent(e, cats);
    });

    return ok({ success: true, event: transformEvent(event, categories), relatedEvents: relatedEventsWithDetails });
  } catch (e: any) {
    return fail(`Failed to fetch event: ${e?.message || 'Unknown error'}`);
  }
}

export async function featuredEventsHandler(req: HttpRequest): Promise<HttpResponseInit> {
  try {
    const url = new URL(req.url);
    const parsedQuery = featuredEventsQuerySchema.safeParse({
      limit: optionalParam(url.searchParams.get('limit')),
    });

    if (!parsedQuery.success) {
      return badRequest(formatZodError(parsedQuery.error));
    }

    const limit = parsedQuery.data.limit || 12;

    const pool = await getSqlPool();
    const request = pool.request();
    request.input('limit', sql.Int, limit);

    const result = await request.query("SELECT TOP (@limit) * FROM Events WHERE isFeatured = 1 ORDER BY date ASC");
    const events = result.recordset;

    const eventIds = events.map((e: any) => e.id);
    let ticketCategories: any[] = [];
    if (eventIds.length > 0) {
        const idsList = eventIds.map(id => `'${id.replace(/'/g, "''")}'`).join(',');
        const tcResult = await pool.request().query(`SELECT * FROM TicketCategories WHERE event_id IN (${idsList})`);
        ticketCategories = tcResult.recordset;
    }

    const eventsWithDetails = events.map((event: any) => {
        const cats = ticketCategories.filter((tc: any) => tc.event_id === event.id);
        return transformEvent(event, cats);
    });

    return ok({ success: true, events: eventsWithDetails });
  } catch (e: any) {
    return fail(`Failed to fetch featured events: ${e?.message || 'Unknown error'}`);
  }
}

export async function searchEventsHandler(req: HttpRequest): Promise<HttpResponseInit> {
  try {
    const url = new URL(req.url);
    const parsedQuery = searchEventsQuerySchema.safeParse({ q: optionalParam(url.searchParams.get('q')) });
    if (!parsedQuery.success) {
      return badRequest(formatZodError(parsedQuery.error));
    }

    const q = parsedQuery.data.q || '';
    if (!q || q.length < 2) {
      return ok({ success: true, events: [], total: 0 });
    }

    const pool = await getSqlPool();
    const request = pool.request();
    request.input('q', sql.NVarChar, `%${q}%`);

    const result = await request.query("SELECT TOP 25 * FROM Events WHERE title LIKE @q OR description LIKE @q OR venueCity LIKE @q OR venueName LIKE @q ORDER BY date ASC");
    const events = result.recordset;

    const eventIds = events.map((e: any) => e.id);
    let ticketCategories: any[] = [];
    if (eventIds.length > 0) {
        const idsList = eventIds.map(id => `'${id.replace(/'/g, "''")}'`).join(',');
        const tcResult = await pool.request().query(`SELECT * FROM TicketCategories WHERE event_id IN (${idsList})`);
        ticketCategories = tcResult.recordset;
    }

    const eventsWithDetails = events.map((event: any) => {
        const cats = ticketCategories.filter((tc: any) => tc.event_id === event.id);
        return transformEvent(event, cats);
    });

    return ok({ success: true, events: eventsWithDetails, total: events.length });
  } catch (e: any) {
    return fail(`Failed to search events: ${e?.message || 'Unknown error'}`);
  }
}

function transformEvent(event: any, categories: any[]) {
  const ticketCategories = categories.map(mapTicketCategory);
  const pricing = derivePricing(ticketCategories);

  return {
    id: event.id,
    title: event.title,
    artist: event.artist ?? '',
    category: event.category,
    date: event.date instanceof Date ? event.date.toISOString().split('T')[0] : event.date, // Format YYYY-MM-DD
    time: event.time ?? '',
    venue: {
      name: event.venueName,
      city: event.venueCity,
      address: event.venueAddress ?? '',
      capacity: typeof event.venueCapacity === 'number' ? event.venueCapacity : 0,
    },
    image: event.imageUrl ?? '',
    bannerImage: event.bannerImageUrl ?? event.imageUrl ?? '',
    description: event.description ?? '',
    ticketCategories,
    pricing,
    featured: Boolean(event.isFeatured),
    tags: parseStringArray(event.tags),
  };
}

function mapTicketCategory(category: any) {
  const total = typeof category.total_quantity === 'number' ? category.total_quantity : 0;
  const available = typeof category.available_quantity === 'number' ? category.available_quantity : 0;
  const status = category.status || (available === 0 ? 'sold-out' : 'available');

  return {
    id: category.id,
    name: category.name ?? 'GENERAL',
    displayName: category.display_name ?? category.name ?? 'General Admission',
    price: Number(category.price ?? 0),
    currency: category.currency ?? 'IDR',
    available,
    total,
    status,
    benefits: parseStringArray(category.benefits),
  };
}

function derivePricing(ticketCategories: any[]) {
  if (ticketCategories.length === 0) {
    return {
      min: 0,
      max: 0,
      currency: 'IDR',
    };
  }

  const prices = ticketCategories.map((category) => category.price ?? 0);
  const currency = ticketCategories.find((category) => category.currency)?.currency ?? 'IDR';

  return {
    min: Math.min(...prices),
    max: Math.max(...prices),
    currency,
  };
}

function parseStringArray(value: unknown): string[] {
  if (!value) return [];
  if (Array.isArray(value)) return value.filter((item): item is string => typeof item === 'string');
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed)
        ? parsed.filter((item): item is string => typeof item === 'string')
        : [];
    } catch {
      return value.split(',').map((item) => item.trim()).filter(Boolean);
    }
  }
  return [];
}
