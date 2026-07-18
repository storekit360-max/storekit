'use strict';

const groups = [
  { tier: 'core', label: 'Core Features', description: 'Primary store administration modules.', items: [
    ['products','Products','📦',true],['orders','Orders','🧾',true],['categories','Categories','🗂️',true],['customers','Customers','👥',true],
    ['coupons','Coupons','🎟️',false],['giftCards','Gift Cards','🎁',false],['banners','Banners & Popups','🖼️',false],['seasonal','Seasonal Themes','❄️',false],
    ['deals','Deals & Offers','🔥',false],['reviews','Reviews','⭐',false],['subscribers','Subscribers','📬',false],['returns','Returns & Refunds','↩️',false],
    ['seo','SEO Tools','🔍',false],['layoutEditor','Layout Builder','🧩',false],['themeBuilder','Theme Builder','🎨',false],['animations','Animations','✨',false],
    ['socialMedia','Social Media','📱',false],['automation','Automation Rules','⚙️',false],['backup','Backup Center','💾',false],
  ]},
  { tier: 'sub', label: 'Sub Features', description: 'Capabilities that extend core modules.', items: [
    ['analytics','Analytics Dashboard','📊',false],['customDomain','Custom Domain','🌐',true],['metaPixel','Meta Pixel Tracking','📈',false],
    ['wishlist','Wishlist','❤️',false],['newsletter','Newsletter Subscription','💌',false],['guestCheckout','Guest Checkout','👤',true],['reviewApproval','Review Approval Workflow','✅',false],
  ]},
  { tier: 'minor', label: 'Operational Controls', description: 'Fine-grained store behavior and safety controls.', items: [
    ['autoConfirmOrders','Auto-Confirm Orders','✅',false],['autoCancelDecision','Auto Cancel Decision','🤖',false],['maintenanceMode','Maintenance Mode','⚠️',false],
  ]},
];

const catalog = groups.map(group => ({ ...group, items: group.items.map(([key,label,icon,defaultValue]) => ({ key,label,icon,default:defaultValue })) }));
const keys = catalog.flatMap(group => group.items.map(item => item.key));

module.exports = { catalog, keys };
