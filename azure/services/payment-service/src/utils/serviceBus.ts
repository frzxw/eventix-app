import { ServiceBusClient, ServiceBusMessage } from '@azure/service-bus';
import { trackException } from './telemetry';

const connectionString = process.env.SERVICE_BUS_CONNECTION_STRING;
const finalizationQueueName = process.env.SERVICE_BUS_FINALIZATION_QUEUE || 'payment-confirmed';

let cachedClient: ServiceBusClient | null = null;

function getClient(): ServiceBusClient {
  if (!connectionString) {
    throw new Error('SERVICE_BUS_CONNECTION_STRING environment variable is not set');
  }

  if (!cachedClient) {
    cachedClient = new ServiceBusClient(connectionString);
  }

  return cachedClient;
}

export async function sendToQueue(queueName: string, messageBody: Record<string, unknown>, sessionId: string, subject: string = 'message'): Promise<void> {
  const client = getClient();

  const sender = client.createSender(queueName);
  const message: ServiceBusMessage = {
    body: messageBody,
    contentType: 'application/json',
    subject: subject,
    sessionId: sessionId,
    applicationProperties: {
      schemaVersion: '1.0.0',
    },
  };

  try {
    await sender.sendMessages(message);
  } catch (error) {
    trackException(error as Error, { queueName, subject });
    throw error;
  } finally {
    await sender.close();
  }
}

export async function sendToFinalizationQueue(messageBody: Record<string, unknown>): Promise<void> {
  const eventId = messageBody.eventId as string;
  await sendToQueue(finalizationQueueName, messageBody, eventId || 'default-session', 'payment.confirmed');
}

export async function closeServiceBus(): Promise<void> {
  if (cachedClient) {
    await cachedClient.close();
    cachedClient = null;
  }
}
