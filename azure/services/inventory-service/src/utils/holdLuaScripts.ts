export const ACQUIRE_HOLD_LUA = `
local payload = cjson.decode(ARGV[1])
local categoryCount = table.getn(payload.entries)
local holdKeyIndex = categoryCount + 1
local expirationSetIndex = categoryCount + 2
local holdKey = KEYS[holdKeyIndex]
local expirationSetKey = KEYS[expirationSetIndex]

if redis.call('EXISTS', holdKey) == 1 then
	return cjson.encode({ success = false, error = 'HOLD_ALREADY_EXISTS' })
end

for i = 1, categoryCount do
	local inventoryKey = KEYS[i]
	local entry = payload.entries[i]
	local requestQty = tonumber(entry.quantity)
	if requestQty <= 0 then
		return cjson.encode({ success = false, error = 'INVALID_QUANTITY', categoryId = entry.categoryId })
	end
	local available = tonumber(redis.call('HGET', inventoryKey, 'available') or '0')
	if available < requestQty then
		return cjson.encode({
			success = false,
			error = 'INSUFFICIENT_STOCK',
			categoryId = entry.categoryId,
			available = available
		})
	end
end

for i = 1, categoryCount do
	local inventoryKey = KEYS[i]
	local entry = payload.entries[i]
	local requestQty = tonumber(entry.quantity)
	redis.call('HINCRBY', inventoryKey, 'available', -requestQty)
	redis.call('HINCRBY', inventoryKey, 'pending', requestQty)
	redis.call('HINCRBY', inventoryKey, 'version', 1)
end

redis.call('HMSET', holdKey,
	'token', payload.holdToken,
	'status', 'held',
	'createdAt', payload.createdAtIso,
	'expiresAt', payload.expiresAtIso,
	'expiresAtEpoch', tostring(payload.expiresAtEpoch),
	'metadata', cjson.encode(payload.metadata or {}),
	'entries', cjson.encode(payload.entries),
	'traceId', payload.traceId or ''
)
redis.call('EXPIRE', holdKey, payload.keyTtlSeconds or payload.ttlSeconds)
redis.call('ZADD', expirationSetKey, payload.expiresAtEpoch, holdKey)

return cjson.encode({ success = true, holdToken = payload.holdToken, expiresAt = payload.expiresAtIso, expiresAtEpoch = payload.expiresAtEpoch })
`;

export const CLAIM_HOLD_LUA = `
local holdKey = KEYS[1]
local expirationSetKey = KEYS[2]
local holdToken = ARGV[1]

if redis.call('EXISTS', holdKey) == 0 then
    return cjson.encode({ success = false, error = 'HOLD_NOT_FOUND' })
end

local storedToken = redis.call('HGET', holdKey, 'token')
if storedToken ~= holdToken then
    return cjson.encode({ success = false, error = 'INVALID_TOKEN' })
end

local status = redis.call('HGET', holdKey, 'status')
if status ~= 'held' then
    return cjson.encode({ success = false, error = 'HOLD_NOT_ACTIVE', status = status })
end

redis.call('HSET', holdKey, 'status', 'claimed')
redis.call('ZREM', expirationSetKey, holdKey)
-- Extend TTL to allow for payment processing
redis.call('EXPIRE', holdKey, 3600) 

local entriesJson = redis.call('HGET', holdKey, 'entries')
return cjson.encode({ success = true, entries = cjson.decode(entriesJson) })
`;

export const RELEASE_HOLD_LUA = `
local holdKey = KEYS[1]
local expirationSetKey = KEYS[2]

if redis.call('EXISTS', holdKey) == 0 then
    return cjson.encode({ success = false, error = 'HOLD_NOT_FOUND' })
end

local status = redis.call('HGET', holdKey, 'status')
if status == 'released' or status == 'finalized' then
    return cjson.encode({ success = true, status = status })
end

local entriesJson = redis.call('HGET', holdKey, 'entries')
local entries = cjson.decode(entriesJson)

for i, entry in ipairs(entries) do
    local inventoryKey = 'inventory:' .. entry.eventId .. ':' .. entry.categoryId
    local quantity = tonumber(entry.quantity)
    redis.call('HINCRBY', inventoryKey, 'available', quantity)
    redis.call('HINCRBY', inventoryKey, 'pending', -quantity)
    redis.call('HINCRBY', inventoryKey, 'version', 1)
end

redis.call('HSET', holdKey, 'status', 'released')
redis.call('ZREM', expirationSetKey, holdKey)
redis.call('DEL', holdKey)

return cjson.encode({ success = true })
`;

export const FINALIZE_HOLD_LUA = `
local holdKey = KEYS[1]
local expirationSetKey = KEYS[2]

if redis.call('EXISTS', holdKey) == 0 then
    return cjson.encode({ success = false, error = 'HOLD_NOT_FOUND' })
end

local status = redis.call('HGET', holdKey, 'status')
if status ~= 'claimed' then
    return cjson.encode({ success = false, error = 'HOLD_NOT_CLAIMED', status = status })
end

local entriesJson = redis.call('HGET', holdKey, 'entries')
local entries = cjson.decode(entriesJson)

for i, entry in ipairs(entries) do
    local inventoryKey = 'inventory:' .. entry.eventId .. ':' .. entry.categoryId
    local quantity = tonumber(entry.quantity)
    redis.call('HINCRBY', inventoryKey, 'pending', -quantity)
    redis.call('HINCRBY', inventoryKey, 'sold', quantity)
    redis.call('HINCRBY', inventoryKey, 'version', 1)
end

redis.call('HSET', holdKey, 'status', 'finalized')
redis.call('ZREM', expirationSetKey, holdKey)
redis.call('DEL', holdKey)

return cjson.encode({ success = true })
`;

export const SYNC_INVENTORY_LUA = `
local inventoryKey = KEYS[1]
local total = tonumber(ARGV[1])
local sold = tonumber(ARGV[2])
local reserved = tonumber(ARGV[3])

redis.call('HSET', inventoryKey, 'total', total)
redis.call('HSET', inventoryKey, 'sold', sold)
redis.call('HSET', inventoryKey, 'reserved', reserved)

-- Recalculate available based on pending holds in Redis
local pending = tonumber(redis.call('HGET', inventoryKey, 'pending') or '0')
local available = total - sold - pending
if available < 0 then available = 0 end

redis.call('HSET', inventoryKey, 'available', available)
redis.call('HINCRBY', inventoryKey, 'version', 1)

return available
`;

export const CLEANUP_EXPIRED_HOLDS_LUA = `
local expirationSetKey = KEYS[1]
local nowEpoch = tonumber(ARGV[1])
local limit = tonumber(ARGV[2])

local expiredHolds = redis.call('ZRANGEBYSCORE', expirationSetKey, '-inf', nowEpoch, 'LIMIT', 0, limit)
local cleanedCount = 0

for i, holdKey in ipairs(expiredHolds) do
    local entriesJson = redis.call('HGET', holdKey, 'entries')
    if entriesJson then
        local entries = cjson.decode(entriesJson)
        for j, entry in ipairs(entries) do
            local inventoryKey = 'inventory:' .. entry.eventId .. ':' .. entry.categoryId
            local quantity = tonumber(entry.quantity)
            redis.call('HINCRBY', inventoryKey, 'available', quantity)
            redis.call('HINCRBY', inventoryKey, 'pending', -quantity)
            redis.call('HINCRBY', inventoryKey, 'version', 1)
        end
    end
    redis.call('DEL', holdKey)
    redis.call('ZREM', expirationSetKey, holdKey)
    cleanedCount = cleanedCount + 1
end

return cleanedCount
`;
