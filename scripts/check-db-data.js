const sql = require('mssql');

const config = {
    user: process.env.SQL_USER,
    password: process.env.SQL_PASSWORD,
    server: process.env.SQL_SERVER,
    database: process.env.SQL_DATABASE,
    options: {
        encrypt: true,
        trustServerCertificate: true,
    },
};

async function checkData() {
    try {
        await sql.connect(config);
        const result = await sql.query`SELECT TOP 5 id, title, category FROM Events`;
        console.log('Events found:', result.recordset.length);
        console.table(result.recordset);
    } catch (err) {
        console.error('Error querying database:', err);
    } finally {
        await sql.close();
    }
}

checkData();
