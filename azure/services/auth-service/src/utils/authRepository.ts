import sql from 'mssql';
import { getDb } from './db';

export interface User {
  id: string;
  email: string;
  passwordHash: string;
  firstName: string;
  lastName: string;
  phone?: string;
  emailVerified: boolean;
}

export interface Session {
  id: string;
  userId: string;
  tokenHash: string;
  refreshTokenHash: string;
  expiresAt: Date;
  revokedAt?: Date;
}

export async function findUserByEmail(email: string): Promise<User | null> {
  const pool = await getDb();
  const result = await pool.request()
    .input('email', sql.NVarChar, email)
    .query('SELECT * FROM Users WHERE email = @email');
  return result.recordset[0] || null;
}

export async function findUserById(id: string): Promise<User | null> {
  const pool = await getDb();
  const result = await pool.request()
    .input('id', sql.NVarChar, id)
    .query('SELECT * FROM Users WHERE id = @id');
  return result.recordset[0] || null;
}

export async function createUser(user: {
  email: string;
  passwordHash: string;
  firstName: string;
  lastName: string;
  phone?: string | null;
  emailVerified: boolean;
}): Promise<User> {
  const pool = await getDb();
  const result = await pool.request()
    .input('email', sql.NVarChar, user.email)
    .input('passwordHash', sql.NVarChar, user.passwordHash)
    .input('firstName', sql.NVarChar, user.firstName)
    .input('lastName', sql.NVarChar, user.lastName)
    .input('phone', sql.NVarChar, user.phone)
    .input('emailVerified', sql.Bit, user.emailVerified)
    .query(`
      INSERT INTO Users (email, passwordHash, firstName, lastName, phone, emailVerified)
      OUTPUT INSERTED.*
      VALUES (@email, @passwordHash, @firstName, @lastName, @phone, @emailVerified)
    `);
  return result.recordset[0];
}

export async function createSession(session: {
  userId: string;
  tokenHash: string;
  refreshTokenHash: string;
  expiresAt: Date;
  deviceInfo: string | null;
  ipAddress: string | null;
}): Promise<void> {
  const pool = await getDb();
  await pool.request()
    .input('userId', sql.NVarChar, session.userId)
    .input('tokenHash', sql.NVarChar, session.tokenHash)
    .input('refreshTokenHash', sql.NVarChar, session.refreshTokenHash)
    .input('expiresAt', sql.DateTime2, session.expiresAt)
    .input('deviceInfo', sql.NVarChar, session.deviceInfo)
    .input('ipAddress', sql.NVarChar, session.ipAddress)
    .query(`
      INSERT INTO Sessions (userId, tokenHash, refreshTokenHash, expiresAt, deviceInfo, ipAddress)
      VALUES (@userId, @tokenHash, @refreshTokenHash, @expiresAt, @deviceInfo, @ipAddress)
    `);
}

export async function createAuditLog(log: {
  userId: string;
  action: string;
  resourceType: string;
  resourceId: string;
  changes: string | null;
  ipAddress: string | null;
  userAgent: string | null;
}): Promise<void> {
  const pool = await getDb();
  await pool.request()
    .input('userId', sql.NVarChar, log.userId)
    .input('action', sql.NVarChar, log.action)
    .input('resourceType', sql.NVarChar, log.resourceType)
    .input('resourceId', sql.NVarChar, log.resourceId)
    .input('changes', sql.NVarChar, log.changes)
    .input('ipAddress', sql.NVarChar, log.ipAddress)
    .input('userAgent', sql.NVarChar, log.userAgent)
    .query(`
      INSERT INTO AuditLogs (userId, action, resourceType, resourceId, changes, ipAddress, userAgent)
      VALUES (@userId, @action, @resourceType, @resourceId, @changes, @ipAddress, @userAgent)
    `);
}

export async function updateUserEmailVerified(userId: string): Promise<User> {
  const pool = await getDb();
  const result = await pool.request()
    .input('id', sql.NVarChar, userId)
    .query(`
      UPDATE Users SET emailVerified = 1
      OUTPUT INSERTED.*
      WHERE id = @id
    `);
  return result.recordset[0];
}

export async function deleteSessionsByUserId(userId: string): Promise<void> {
  const pool = await getDb();
  await pool.request()
    .input('userId', sql.NVarChar, userId)
    .query('DELETE FROM Sessions WHERE userId = @userId');
}

export async function findSessionsByUserId(userId: string, limit: number): Promise<Session[]> {
  const pool = await getDb();
  const result = await pool.request()
    .input('userId', sql.NVarChar, userId)
    .input('limit', sql.Int, limit)
    .query('SELECT TOP (@limit) * FROM Sessions WHERE userId = @userId ORDER BY createdAt DESC');
  return result.recordset;
}

export async function updateSession(sessionId: string, updates: {
  tokenHash: string;
  refreshTokenHash: string;
  expiresAt: Date;
}): Promise<void> {
  const pool = await getDb();
  await pool.request()
    .input('id', sql.NVarChar, sessionId)
    .input('tokenHash', sql.NVarChar, updates.tokenHash)
    .input('refreshTokenHash', sql.NVarChar, updates.refreshTokenHash)
    .input('expiresAt', sql.DateTime2, updates.expiresAt)
    .query(`
      UPDATE Sessions
      SET tokenHash = @tokenHash, refreshTokenHash = @refreshTokenHash, expiresAt = @expiresAt
      WHERE id = @id
    `);
}
