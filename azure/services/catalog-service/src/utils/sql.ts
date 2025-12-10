import sql from 'mssql';

const config: any = process.env.DATABASE_URL
    ? {
        // @ts-ignore
        connectionString: process.env.DATABASE_URL,
    }
    : {
        user: process.env.SQL_USER || 'sa',
        password: process.env.SQL_PASSWORD || 'StrongPassword123!',
        server: process.env.SQL_SERVER || 'localhost',
        database: process.env.SQL_DATABASE || 'eventix',
        options: {
            encrypt: true,
            trustServerCertificate: process.env.NODE_ENV !== 'production',
        },
    };

let pool: any = null;

export async function getSqlPool(): Promise<any> {
    if (!pool) {
        try {
            pool = await sql.connect(config);
        } catch (err) {
            console.error('Failed to connect to SQL Server', err);
            throw err;
        }
    }
    return pool;
}
