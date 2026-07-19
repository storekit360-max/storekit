'use strict';

const PlatformPermission = require('../models/PlatformPermission');
const PlatformRole = require('../models/PlatformRole');
const permissionRegistry = require('../config/platformPermissions');

async function synchronizePermissionRegistry() {
  if (!permissionRegistry.definitions.length) return;
  await PlatformPermission.bulkWrite(permissionRegistry.definitions.map(permission => ({
    updateOne: {
      filter: { key: permission.key },
      update: { $set: { ...permission, system: true, active: true } },
      upsert: true,
    },
  })), { ordered: false });
}

async function getUserPermissions(user) {
  if (!user || user.role !== 'superadmin') return new Set();
  // Compatibility gate: existing owners without assignments keep full access.
  // Once every operator has an explicit role, this fallback can be disabled by env.
  if (!user.platformRoleIds?.length && process.env.REQUIRE_EXPLICIT_PLATFORM_ROLE !== 'true') {
    return new Set(permissionRegistry.keys);
  }
  const roles = await PlatformRole.find({ _id: { $in: user.platformRoleIds || [] }, active: true }).select('permissions').lean();
  return new Set(roles.flatMap(role => role.permissions || []));
}

async function attachPlatformPermissions(req, _res, next) {
  try {
    req.platformPermissions = await getUserPermissions(req.user);
    next();
  } catch (error) { next(error); }
}

function requirePlatformPermission(permission) {
  return (req, res, next) => {
    if (!req.platformPermissions?.has(permission)) {
      return res.status(403).json({ message: 'You do not have permission to perform this action', permission });
    }
    next();
  };
}

module.exports = { synchronizePermissionRegistry, getUserPermissions, attachPlatformPermissions, requirePlatformPermission };
