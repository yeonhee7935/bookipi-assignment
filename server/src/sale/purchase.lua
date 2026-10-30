-- Decides one purchase attempt atomically: the sale window, one-per-user and stock
-- are all checked against Redis state and Redis' clock, then the unit is taken.
-- Redis runs a script to completion without interleaving other commands, so no two
-- attempts can race, and every API replica gets the same answer for the same moment.
--
-- KEYS[1] meta       (hash: startsAt, endsAt in epoch ms)
-- KEYS[2] stock      (string counter)
-- KEYS[3] purchases  (hash: userId -> purchasedAt ms)
-- KEYS[4] events     (stream consumed by the order worker)
-- ARGV[1] userId

local window = redis.call('HMGET', KEYS[1], 'startsAt', 'endsAt')
if not window[1] then
  return 'NO_SALE'
end

local time = redis.call('TIME')
local now = tonumber(time[1]) * 1000 + math.floor(tonumber(time[2]) / 1000)
if now < tonumber(window[1]) then
  return 'NOT_STARTED'
end
if now >= tonumber(window[2]) then
  return 'ENDED'
end

if redis.call('HEXISTS', KEYS[3], ARGV[1]) == 1 then
  return 'ALREADY_PURCHASED'
end

if tonumber(redis.call('GET', KEYS[2]) or '0') <= 0 then
  return 'SOLD_OUT'
end

redis.call('DECR', KEYS[2])
redis.call('HSET', KEYS[3], ARGV[1], now)
-- Writing the event in the same script means a reservation can never exist
-- without its persistence event (no dual-write gap between Redis and a queue).
redis.call('XADD', KEYS[4], '*', 'userId', ARGV[1], 'purchasedAt', now)
return 'SUCCESS'
