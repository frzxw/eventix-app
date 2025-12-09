export const SERVICE_URLS = {
  auth: process.env.AUTH_SERVICE_URL || 'http://localhost:7071/api',
  catalog: process.env.CATALOG_SERVICE_URL || 'http://localhost:7072/api',
  inventory: process.env.INVENTORY_SERVICE_URL || 'http://localhost:7073/api',
  order: process.env.ORDER_SERVICE_URL || 'http://localhost:7074/api',
  payment: process.env.PAYMENT_SERVICE_URL || 'http://localhost:7075/api',
  ticket: process.env.TICKET_SERVICE_URL || 'http://localhost:7076/api',
};
