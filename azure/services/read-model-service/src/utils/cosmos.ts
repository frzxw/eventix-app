import { CosmosClient } from '@azure/cosmos';

const endpoint = process.env.COSMOS_ENDPOINT || '';
const key = process.env.COSMOS_KEY || '';
const databaseId = process.env.COSMOS_DATABASE || 'eventix';

const client = new CosmosClient({ endpoint, key });
const database = client.database(databaseId);

export const containers = {
  tickets: database.container('tickets'),
  orders: database.container('orders'),
  events: database.container('events'),
};
