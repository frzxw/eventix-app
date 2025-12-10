import { HttpRequest, HttpResponseInit } from '@azure/functions';
import { z } from 'zod';
import { containers } from '../utils/cosmos';
import { formatZodError } from '../utils/validation';
import { SqlQuerySpec } from '@azure/cosmos';

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

    let queryText = "SELECT * FROM c WHERE 1=1";
    const parameters: { name: string; value: any }[] = [];

    if (category && category !== 'all') {
      queryText += " AND c.category = @category";
      parameters.push({ name: "@category", value: category });
    }
    if (city) {
      queryText += " AND c.venue.city = @city";
      parameters.push({ name: "@city", value: city });
    }
    if (date) {
      queryText += " AND c.date = @date";
      parameters.push({ name: "@date", value: date });
    }
    if (search) {
      queryText += " AND (CONTAINS(c.title, @search, true) OR CONTAINS(c.description, @search, true) OR CONTAINS(c.venue.city, @search, true))";
      parameters.push({ name: "@search", value: search });
    }

    // Get total count
    const countQuery: SqlQuerySpec = {
      query: queryText.replace("SELECT *", "SELECT VALUE COUNT(1)"),
      parameters
    };
    
    const { resources: countResult } = await containers.events.items.query(countQuery).fetchAll();
    const total = countResult[0];

    // Add sorting and pagination
    if (sort === 'popularity') {
      queryText += " ORDER BY c.viewCount DESC";
    } else {
      queryText += " ORDER BY c.date ASC";
    }
    
    queryText += " OFFSET @offset LIMIT @limit";
    parameters.push({ name: "@offset", value: offset });
    parameters.push({ name: "@limit", value: limit });

    const querySpec: SqlQuerySpec = {
      query: queryText,
      parameters
    };

    const { resources: events } = await containers.events.items.query(querySpec).fetchAll();

    return ok({ success: true, events, total, page, totalPages: Math.ceil(total / limit) });
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

    const { resource: event } = await containers.events.item(parsedParams.data.id, parsedParams.data.id).read();

    if (!event) return notFound('Event not found');

    // Related events
    const relatedQuery: SqlQuerySpec = {
      query: "SELECT TOP 6 * FROM c WHERE c.category = @category AND c.id != @id ORDER BY c.date ASC",
      parameters: [
        { name: "@category", value: event.category },
        { name: "@id", value: event.id }
      ]
    };
    
    const { resources: relatedEvents } = await containers.events.items.query(relatedQuery).fetchAll();

    return ok({ success: true, event, relatedEvents });
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

    const querySpec: SqlQuerySpec = {
      query: "SELECT TOP @limit * FROM c WHERE c.featured = true ORDER BY c.date ASC",
      parameters: [
        { name: "@limit", value: limit }
      ]
    };

    const { resources: events } = await containers.events.items.query(querySpec).fetchAll();

    return ok({ success: true, events });
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

    const querySpec: SqlQuerySpec = {
      query: "SELECT TOP 25 * FROM c WHERE CONTAINS(c.title, @q, true) OR CONTAINS(c.description, @q, true) OR CONTAINS(c.venue.name, @q, true) OR CONTAINS(c.venue.city, @q, true) ORDER BY c.date ASC",
      parameters: [
        { name: "@q", value: q }
      ]
    };

    const { resources: events } = await containers.events.items.query(querySpec).fetchAll();

    return ok({ success: true, events, total: events.length });
  } catch (e: any) {
    return fail(`Failed to search events: ${e?.message || 'Unknown error'}`);
  }
}
