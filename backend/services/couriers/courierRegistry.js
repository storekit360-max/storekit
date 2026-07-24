'use strict';
const providers = require('../../config/courierProviders');
const KoombiyoProvider = require('./koombiyo/KoombiyoProvider');
const constructors = { koombiyo: KoombiyoProvider };
function definitions() { return Object.values(providers); }
function definition(provider) { return providers[String(provider || '').toLowerCase()]; }
function create(provider, config) { const Ctor = constructors[provider]; if (!Ctor) throw Object.assign(new Error('Unsupported courier provider'), { status: 400 }); return new Ctor(config); }
module.exports = { definitions, definition, create };
