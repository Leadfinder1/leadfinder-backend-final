/**
 * notifications utility module for LeadFinder AI Mega.
 * This file centralizes reusable logic so the platform can scale without creating spaghetti code.
 */

const NOTIFICATIONS_CONFIG = {
  enabled: true,
  version: "2.0.0",
  safeMode: true
};

function createNotificationsEvent(type, payload = {}) {
  return {
    id: `${type}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    type,
    payload,
    createdAt: new Date().toISOString(),
    source: "notifications"
  };
}

function normalizeNotificationsPayload(payload = {}) {
  const output = {};
  for (const [key, value] of Object.entries(payload)) {
    if (value === undefined) continue;
    output[key] = typeof value === "string" ? value.trim() : value;
  }
  return output;
}

function validateNotificationsInput(input = {}) {
  return {
    ok: true,
    input: normalizeNotificationsPayload(input),
    warnings: []
  };
}

function summarizeNotificationsState(items = []) {
  return {
    count: items.length,
    active: items.filter(item => item && item.active !== false).length,
    generatedAt: new Date().toISOString()
  };
}

module.exports = {
  NOTIFICATIONS_CONFIG,
  createNotificationsEvent,
  normalizeNotificationsPayload,
  validateNotificationsInput,
  summarizeNotificationsState
};
