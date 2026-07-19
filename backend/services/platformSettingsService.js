'use strict';

const PlatformSetting = require('../models/PlatformSetting');
const registry = require('../config/platformSettingsRegistry');

let cache = null;
let cacheExpiresAt = 0;
const CACHE_MS = 30000;

function validateValue(definition, input) {
  if (definition.type === 'boolean') {
    if (typeof input !== 'boolean') throw new Error(`${definition.label} must be true or false`);
    return input;
  }
  if (definition.type === 'number') {
    const value = Number(input);
    if (!Number.isFinite(value)) throw new Error(`${definition.label} must be a number`);
    if (definition.min !== undefined && value < definition.min) throw new Error(`${definition.label} must be at least ${definition.min}`);
    if (definition.max !== undefined && value > definition.max) throw new Error(`${definition.label} must be at most ${definition.max}`);
    return value;
  }
  const value = String(input ?? '').trim();
  if (!value && definition.allowEmpty) return '';
  if (definition.minLength && value.length < definition.minLength) throw new Error(`${definition.label} must contain at least ${definition.minLength} characters`);
  if (definition.maxLength && value.length > definition.maxLength) throw new Error(`${definition.label} cannot exceed ${definition.maxLength} characters`);
  if (definition.type === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) throw new Error(`${definition.label} must be a valid email address`);
  if (definition.type === 'url') {
    let parsed;
    try { parsed = new URL(value); } catch (_) { throw new Error(`${definition.label} must be a valid HTTPS URL`); }
    if (parsed.protocol !== 'https:' && !(process.env.NODE_ENV !== 'production' && parsed.protocol === 'http:')) throw new Error(`${definition.label} must use HTTPS`);
    return parsed.toString();
  }
  if (definition.type === 'color' && !/^#[0-9a-f]{6}$/i.test(value)) throw new Error(`${definition.label} must be a six-digit hex color`);
  if (definition.type === 'enum' && !definition.options.includes(value)) throw new Error(`${definition.label} has an unsupported value`);
  if (definition.pattern && !(new RegExp(definition.pattern).test(value))) throw new Error(`${definition.label} has an invalid format`);
  return value;
}

function defaults() {
  return Object.fromEntries(registry.definitions.map(definition => [definition.key, definition.defaultValue]));
}

async function getAllSettings({ force = false } = {}) {
  if (!force && cache && cacheExpiresAt > Date.now()) return { ...cache };
  const documents = await PlatformSetting.find().lean();
  cache = { ...defaults(), ...Object.fromEntries(documents.map(document => [document.key, document.value])) };
  cacheExpiresAt = Date.now() + CACHE_MS;
  return { ...cache };
}

async function getSetting(key) {
  const settings = await getAllSettings();
  return settings[key];
}

async function updateSettings(updates, actorId) {
  if (!updates || typeof updates !== 'object' || Array.isArray(updates)) throw new Error('Settings payload must be an object');
  const entries = Object.entries(updates);
  if (!entries.length) throw new Error('At least one setting is required');
  if (entries.length > registry.definitions.length) throw new Error('Too many settings in one request');
  const normalized = {};
  for (const [key, input] of entries) {
    const definition = registry.byKey.get(key);
    if (!definition) throw new Error(`Unknown platform setting: ${key}`);
    normalized[key] = validateValue(definition, input);
  }
  await PlatformSetting.bulkWrite(Object.entries(normalized).map(([key, value]) => {
    const definition = registry.byKey.get(key);
    return { updateOne: { filter: { key }, update: { $set: { key, group: definition.group, value, valueType: definition.type, updatedBy: actorId } }, upsert: true } };
  }), { ordered: true });
  cache = null; cacheExpiresAt = 0;
  return normalized;
}

function publicSettings(all) {
  return Object.fromEntries(registry.definitions.filter(definition => definition.public).map(definition => [definition.key, all[definition.key]]));
}

function invalidateSettingsCache() { cache = null; cacheExpiresAt = 0; }

module.exports = { defaults, getAllSettings, getSetting, invalidateSettingsCache, publicSettings, updateSettings, validateValue };
