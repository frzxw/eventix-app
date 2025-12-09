import sql from 'mssql';

const config = {
  user: process.env.SQL_USER,
  password: process.env.SQL_PASSWORD,
  server: process.env.SQL_SERVER || 'localhost',
  database: process.env.SQL_DATABASE || 'eventix',
  options: {
    encrypt: true,
    trustServerCertificate: process.env.NODE_ENV !== 'production',
  },
};

let pool: any = null;

export async function getDb() {
  if (pool) return pool;
  try {
    pool = await sql.connect(config);
    return pool;
  } catch (err) {
    console.error('Database connection failed', err);
    throw err;
  }
}

export { sql };
