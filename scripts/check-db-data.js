const sql = require('mssql');
const { CosmosClient } = require('@azure/cosmos');

// Disable TLS verification for local emulator if needed
if (process.env.COSMOS_ENDPOINT?.includes('localhost') || !process.env.COSMOS_ENDPOINT) {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
}

const sqlConfig = {
    user: process.env.SQL_USER || 'sa',
    password: process.env.SQL_PASSWORD || 'StrongPassword123!',
    server: process.env.SQL_SERVER || 'localhost',
    database: process.env.SQL_DATABASE || 'eventix',
    options: {
        encrypt: true,
        trustServerCertificate: true,
    },
};

const cosmosEndpoint = process.env.COSMOS_ENDPOINT || 'https://localhost:8081';
const cosmosKey = process.env.COSMOS_KEY || 'C2y6yDjf5/R+ob0N8A7Cgv30VRDJIWEHLM+4QDU5DE2nQ9nDuVTqobD4b8mGGyPMbIZnqyMsEcaGQy67XIw/Jw==';
const cosmosDatabaseId = process.env.COSMOS_DATABASE || 'eventix';
const cosmosContainerId = 'events';

const cosmosClient = new CosmosClient({ endpoint: cosmosEndpoint, key: cosmosKey });

async function checkData() {
    try {
        console.log('--- SQL Server ---');
        await sql.connect(sqlConfig);
        const sqlResult = await sql.query`SELECT TOP 5 id, title, category FROM Events`;
        const sqlCountResult = await sql.query`SELECT COUNT(*) as count FROM Events`;
        console.log('Total Events in SQL:', sqlCountResult.recordset[0].count);
        console.table(sqlResult.recordset);

        console.log('\n--- Cosmos DB ---');
        const container = cosmosClient.database(cosmosDatabaseId).container(cosmosContainerId);
        const { resources: cosmosEvents } = await container.items.query("SELECT TOP 5 c.id, c.title, c.category FROM c").fetchAll();
        const { resources: cosmosCount } = await container.items.query("SELECT VALUE COUNT(1) FROM c").fetchAll();
        
        console.log('Total Events in Cosmos:', cosmosCount[0]);
        console.table(cosmosEvents);

    } catch (err) {
        console.error('Error querying database:', err);
    } finally {
        await sql.close();
    }
}

checkData();
