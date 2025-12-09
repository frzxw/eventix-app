import { ServiceBusClient } from '@azure/service-bus';

const connectionString = process.env.SERVICE_BUS_CONNECTION_STRING || '';
const sbClient = new ServiceBusClient(connectionString);

export async function sendToQueue(queueName: string, message: Record<string, unknown> & { id?: string; correlationId?: string }) {
  const sender = sbClient.createSender(queueName);
  try {
    await sender.sendMessages({
      body: message,
      contentType: 'application/json',
      messageId: message.id || undefined,
      correlationId: message.correlationId || undefined,
    });
  } finally {
    await sender.close();
  }
}

export async function publishToTopic(topicName: string, message: Record<string, unknown> & { id?: string; correlationId?: string }) {
  const sender = sbClient.createSender(topicName);
  try {
    await sender.sendMessages({
      body: message,
      contentType: 'application/json',
      messageId: message.id || undefined,
      correlationId: message.correlationId || undefined,
    });
  } finally {
    await sender.close();
  }
}
