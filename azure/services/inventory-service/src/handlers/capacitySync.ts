import { InvocationContext } from '@azure/functions';
import { redis, loadScript } from '../utils/redisClient';
import { SYNC_INVENTORY_LUA } from '../utils/holdLuaScripts';
import { containers } from '../utils/cosmos';

type CapacityUpdateMessage = {
  eventId: string;
  categoryId: string;
  quantityTotal: number;
  quantitySold: number;
  quantityReserved: number;
  timestamp: string;
};

let syncInventorySha: string | undefined;

async function ensureScriptsLoaded(): Promise<void> {
  if (!syncInventorySha) {
    syncInventorySha = await loadScript(SYNC_INVENTORY_LUA);
  }
}

function normalizeMessage(message: unknown): CapacityUpdateMessage | null {
    if (typeof message === 'object' && message !== null) {
        return message as CapacityUpdateMessage;
    }
    return null;
}

export async function capacitySyncHandler(message: unknown, context: InvocationContext): Promise<void> {
  const payload = normalizeMessage(message);
  if (!payload?.eventId || !payload?.categoryId) {
    context.log('CapacitySync: skipping invalid message');
    return;
  }

  const { eventId, categoryId, quantityTotal, quantitySold, quantityReserved } = payload;
  const inventoryKey = `inventory:${eventId}:${categoryId}`;

  try {
    await ensureScriptsLoaded();
    
    // Update Redis
    await redis.evalsha(
      syncInventorySha!,
      1, // numKeys
      inventoryKey,
      String(quantityTotal),
      String(quantitySold),
      String(quantityReserved)
    );
    
    // Update Cosmos Read Model
    const container = containers.ticketCategories;
    const partitionKey = `${eventId}#${categoryId}`;
    // Note: In a real scenario, we'd update the read model here.
    // For now, we just log.
    context.log(`Capacity synced for ${eventId}:${categoryId}`);

  } catch (error) {
    context.error('CapacitySync: failed', error);
    throw error; // Retry
  }
}
