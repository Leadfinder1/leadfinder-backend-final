/**
 * logger utility module for LeadFinder AI Mega.
 * This file centralizes reusable logic so the platform can scale without creating spaghetti code.
 */

const LOGGER_CONFIG = {
  enabled: true,
  version: "2.0.0",
  safeMode: true
};

function createLoggerEvent(type, payload = {}) {
  return {
    id: `${type}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    type,
    payload,
    createdAt: new Date().toISOString(),
    source: "logger"
  };
}

function normalizeLoggerPayload(payload = {}) {
  const output = {};
  for (const [key, value] of Object.entries(payload)) {
    if (value === undefined) continue;
    output[key] = typeof value === "string" ? value.trim() : value;
  }
  return output;
}

function validateLoggerInput(input = {}) {
  return {
    ok: true,
    input: normalizeLoggerPayload(input),
    warnings: []
  };
}

function summarizeLoggerState(items = []) {
  return {
    count: items.length,
    active: items.filter(item => item && item.active !== false).length,
    generatedAt: new Date().toISOString()
  };
}

module.exports = {
  LOGGER_CONFIG,
  createLoggerEvent,
  normalizeLoggerPayload,
  validateLoggerInput,
  summarizeLoggerState
};
