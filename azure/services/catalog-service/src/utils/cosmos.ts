import { CosmosClient } from '@azure/cosmos';

const endpoint = process.env.COSMOS_ENDPOINT;
const key = process.env.COSMOS_KEY;

// Disable TLS verification for local Cosmos DB Emulator
if (process.env.NODE_ENV !== 'production' && (!endpoint || endpoint.includes('localhost') || endpoint.includes('127.0.0.1'))) {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
}

// Only throw if we are in a context where we expect to connect (e.g. not during build)
// But for safety, we can just log a warning if missing, or let it fail when used.
if (!endpoint || !key) {
  console.warn('COSMOS_ENDPOINT or COSMOS_KEY is missing. Cosmos DB operations will fail.');
}

const client = new CosmosClient({ 
  endpoint: endpoint || 'https://localhost:8081', 
  key: key || 'C2y6yDjf5/R+ob0N8A7Cgv30VRDJIWEHLM+4QDU5DE2nQ9nDuVTqobD4b8mGGyPMbIZnqyMsEcaGQy67XIw/Jw==' 
});

const databaseId = process.env.COSMOS_DATABASE || 'eventix';
const database = client.database(databaseId);

export const containers = {
  events: database.container('events'),
  ticketCategories: database.container('ticketCategories'),
  reservations: database.container('reservations'),
  orders: database.container('orders'),
  tickets: database.container('tickets'),
  idempotency: database.container('idempotency'),
};

export default client;
