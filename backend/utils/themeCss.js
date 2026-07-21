const MAX_CUSTOM_CSS_LENGTH = 20000;

// Custom CSS is intentionally an appearance-only escape hatch. Layout rules are
// owned by the selected storefront template so a colour tweak cannot collapse
// navigation, checkout, product grids, or the admin application.
const ALLOWED_PROPERTIES = /^(?:color|background-color|background-image|background-position|background-repeat|background-size|border-color|border-style|border-radius|box-shadow|text-shadow|text-decoration|text-decoration-color|text-transform|font-family|font-style|font-weight|outline-color|caret-color|accent-color|fill|stroke|stroke-width)$/i;

function sanitizeThemeCss(input) {
  const source = String(input || '').slice(0, MAX_CUSTOM_CSS_LENGTH)
    .replace(/@(?:import|charset|namespace|supports|page|font-face|keyframes)[\s\S]*?(?:;|\}\s*)/gi, '')
    .replace(/expression\s*\(|javascript\s*:|data\s*:\s*text\/html/gi, '');

  return source.replace(/([^{}]+)\{([^{}]*)\}/g, (_rule, rawSelector, body) => {
    const selector = rawSelector.trim();
    if (!selector || selector.startsWith('@') || /(?:^|[\s,>+~])(?:html|body|#root)(?:$|[\s,.#:[>+~])/i.test(selector)) return '';
    const declarations = body.split(';').map(part => part.trim()).filter(Boolean).filter(part => {
      const colon = part.indexOf(':');
      if (colon < 1) return false;
      return ALLOWED_PROPERTIES.test(part.slice(0, colon).trim());
    });
    if (!declarations.length) return '';
    const scoped = selector.split(',').map(item => {
      const clean = item.trim();
      return clean.startsWith('.customer-storefront') ? clean : `.customer-storefront ${clean}`;
    }).join(', ');
    return `${scoped} { ${declarations.join('; ')}; }`;
  }).trim();
}

module.exports = { sanitizeThemeCss, MAX_CUSTOM_CSS_LENGTH };
