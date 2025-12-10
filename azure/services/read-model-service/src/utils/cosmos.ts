import { CosmosClient } from '@azure/cosmos';

const endpoint = process.env.COSMOS_ENDPOINT;
const key = process.env.COSMOS_KEY;

// Disable TLS verification for local Cosmos DB Emulator
if (process.env.NODE_ENV !== 'production' && (!endpoint || endpoint.includes('localhost') || endpoint.includes('127.0.0.1'))) {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
}

const client = new CosmosClient({ 
  endpoint: endpoint || 'https://localhost:8081', 
  key: key || 'C2y6yDjf5/R+ob0N8A7Cgv30VRDJIWEHLM+4QDU5DE2nQ9nDuVTqobD4b8mGGyPMbIZnqyMsEcaGQy67XIw/Jw==' 
});
const databaseId = process.env.COSMOS_DATABASE || 'eventix';
const database = client.database(databaseId);

export const containers = {
  tickets: database.container('tickets'),
  orders: database.container('orders'),
  events: database.container('events'),
};
