'use strict';

const definitions = [
  { key: 'platform.name', group: 'platform', label: 'Platform name', type: 'string', defaultValue: 'StoreKit', minLength: 2, maxLength: 80, public: true },
  { key: 'platform.logoUrl', group: 'platform', label: 'Platform logo URL', type: 'url', defaultValue: '', maxLength: 1000, public: true, allowEmpty: true },
  { key: 'platform.faviconUrl', group: 'platform', label: 'Platform favicon URL', type: 'url', defaultValue: '', maxLength: 1000, public: true, allowEmpty: true },
  { key: 'platform.primaryColor', group: 'platform', label: 'Primary color', type: 'color', defaultValue: '#4f46e5', public: true },
  { key: 'platform.defaultTheme', group: 'platform', label: 'Default theme', type: 'enum', options: ['light', 'dark', 'system'], defaultValue: 'system', public: true },
  { key: 'localization.language', group: 'localization', label: 'Default language', type: 'enum', options: ['en', 'si', 'ta'], defaultValue: 'en', public: true },
  { key: 'localization.timezone', group: 'localization', label: 'Default timezone', type: 'string', defaultValue: 'Asia/Colombo', minLength: 3, maxLength: 100, public: true },
  { key: 'localization.currency', group: 'localization', label: 'Default currency', type: 'string', defaultValue: 'LKR', pattern: '^[A-Z]{3}$', public: true },
  { key: 'support.email', group: 'support', label: 'Support email', type: 'email', defaultValue: '', maxLength: 320, public: true, allowEmpty: true },
  { key: 'support.phone', group: 'support', label: 'Support phone', type: 'string', defaultValue: '', maxLength: 40, public: true, allowEmpty: true },
  { key: 'support.chatWidgetEnabled', group: 'support', label: 'Chat widget enabled', type: 'boolean', defaultValue: false, public: true },
  { key: 'legal.privacyUrl', group: 'legal', label: 'Privacy policy URL', type: 'url', defaultValue: '', maxLength: 1000, public: true, allowEmpty: true },
  { key: 'legal.termsUrl', group: 'legal', label: 'Terms URL', type: 'url', defaultValue: '', maxLength: 1000, public: true, allowEmpty: true },
  { key: 'registration.enabled', group: 'access', label: 'Open registration', type: 'boolean', defaultValue: true, public: true },
  { key: 'registration.invitationOnly', group: 'access', label: 'Invitation only', type: 'boolean', defaultValue: false, public: true },
  { key: 'maintenance.enabled', group: 'operations', label: 'Maintenance mode', type: 'boolean', defaultValue: false, public: true },
  { key: 'maintenance.message', group: 'operations', label: 'Maintenance message', type: 'string', defaultValue: 'StoreKit is undergoing scheduled maintenance. Please try again shortly.', minLength: 10, maxLength: 500, public: true },
  { key: 'security.passwordMinLength', group: 'security', label: 'Minimum password length', type: 'number', defaultValue: 8, min: 8, max: 128, public: false },
  { key: 'security.passwordRequireUppercase', group: 'security', label: 'Require uppercase password character', type: 'boolean', defaultValue: true, public: false },
  { key: 'security.passwordRequireLowercase', group: 'security', label: 'Require lowercase password character', type: 'boolean', defaultValue: true, public: false },
  { key: 'security.passwordRequireNumber', group: 'security', label: 'Require password number', type: 'boolean', defaultValue: true, public: false },
  { key: 'security.passwordRequireSpecial', group: 'security', label: 'Require password special character', type: 'boolean', defaultValue: true, public: false },
  { key: 'security.mfaPolicy', group: 'security', label: 'Platform operator MFA policy', type: 'enum', options: ['optional', 'platform_required'], defaultValue: 'optional', public: false },
  { key: 'security.sessionTimeoutMinutes', group: 'security', label: 'Session lifetime in minutes', type: 'number', defaultValue: 43200, min: 15, max: 43200, public: false },
  { key: 'security.cookiePolicy', group: 'security', label: 'Cookie consent policy', type: 'enum', options: ['essential_only', 'consent_required'], defaultValue: 'consent_required', public: true },
  { key: 'localization.allowedCountries', group: 'localization', label: 'Allowed checkout countries (ISO codes)', type: 'string', defaultValue: 'LK', pattern: '^[A-Z]{2}(,[A-Z]{2})*$', maxLength: 300, public: true },
  { key: 'localization.taxInclusive', group: 'localization', label: 'Default tax-inclusive pricing', type: 'boolean', defaultValue: false, public: true },
  { key: 'uploads.imageMaxMb', group: 'limits', label: 'Maximum image size (MB)', type: 'number', defaultValue: 10, min: 1, max: 50, public: false },
  { key: 'uploads.documentMaxMb', group: 'limits', label: 'Maximum PDF/document size (MB)', type: 'number', defaultValue: 10, min: 1, max: 50, public: false },
  { key: 'uploads.videoMaxMb', group: 'limits', label: 'Maximum video size (MB)', type: 'number', defaultValue: 50, min: 1, max: 500, public: false },
  { key: 'uploads.bulkArchiveMaxMb', group: 'limits', label: 'Maximum bulk archive size (MB)', type: 'number', defaultValue: 200, min: 10, max: 500, public: false },
];

const byKey = new Map(definitions.map(definition => [definition.key, definition]));
const groups = definitions.reduce((result, definition) => {
  (result[definition.group] ||= []).push(definition);
  return result;
}, {});

module.exports = { definitions, byKey, groups };
