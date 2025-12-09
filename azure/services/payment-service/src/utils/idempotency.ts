import { getDb, sql } from './db';

export type IdempotencyStatus = 'processing' | 'completed' | 'failed';

export interface IdempotencyRecord {
  id: string;
  status: IdempotencyStatus;
  responseBody?: any;
  responseStatus?: number;
  createdAt: Date;
  lockedUntil?: Date;
}

export async function checkIdempotency(key: string): Promise<IdempotencyRecord | null> {
  if (!key) return null;

  const pool = await getDb();
  const result = await pool.request()
    .input('id', sql.NVarChar, key)
    .query('SELECT * FROM IdempotencyKeys WHERE id = @id');
  
  const record = result.recordset[0];
  if (!record) return null;

  return {
    ...record,
    responseBody: record.responseBody ? JSON.parse(record.responseBody) : undefined
  };
}

export async function lockIdempotencyKey(key: string): Promise<boolean> {
  if (!key) return false;

  const pool = await getDb();
  try {
    await pool.request()
      .input('id', sql.NVarChar, key)
      .input('status', sql.NVarChar, 'processing')
      .query('INSERT INTO IdempotencyKeys (id, status) VALUES (@id, @status)');
    return true;
  } catch (error: any) {
    // 2627 is violation of primary key constraint
    if (error.number === 2627 || error.code === 'EREQUEST') {
      return false;
    }
    throw error;
  }
}

export async function saveIdempotencyResult(
  key: string, 
  status: IdempotencyStatus, 
  responseStatus: number, 
  responseBody: any
): Promise<void> {
  if (!key) return;

  const pool = await getDb();
  await pool.request()
    .input('id', sql.NVarChar, key)
    .input('status', sql.NVarChar, status)
    .input('responseStatus', sql.Int, responseStatus)
    .input('responseBody', sql.NVarChar, JSON.stringify(responseBody))
    .query(`
      UPDATE IdempotencyKeys 
      SET status = @status, 
          responseStatus = @responseStatus, 
          responseBody = @responseBody 
      WHERE id = @id
    `);
}

export async function releaseIdempotencyLock(key: string): Promise<void> {
  if (!key) return;
  const pool = await getDb();
  await pool.request()
    .input('id', sql.NVarChar, key)
    .query('DELETE FROM IdempotencyKeys WHERE id = @id');
}
