import React, { useEffect, useState, useCallback } from 'react';
import { THEMES, THEME_CATEGORIES, FONTS, STORE_TEMPLATES, TEMPLATE_CATEGORIES, applyTheme, writeCache } from '../../context/ThemeContext';
import { useTheme } from '../../context/ThemeContext';
import API from '../../utils/api';
import toast from 'react-hot-toast';

const ColorSwatch = ({ color, onChange, label }) => (
  <div className="flex items-center gap-3">
    <div className="relative flex-shrink-0">
      <input type="color" value={color} onChange={e => onChange(e.target.value)}
        className="w-10 h-10 rounded-xl cursor-pointer border-2 border-white shadow-md"
        style={{ padding: 2 }} />
    </div>
    <div className="min-w-0">
      <p className="text-xs font-medium text-gray-700">{label}</p>
      <p className="text-xs text-gray-400 font-mono">{color}</p>
    </div>
  </div>
);

const TEMPLATE_PREVIEW = {
  classic: ['#15803d', '#84cc16'],
  modern: ['#2563eb', '#06b6d4'],
  minimal: ['#f8fafc', '#cbd5e1'],
  luxury: ['#111827', '#d4af37'],
  fashion: ['#be123c', '#f9a8d4'],
  electronics: ['#0f172a', '#38bdf8'],
  mobile: ['#0f172a', '#38bdf8'],
  grocery: ['#16a34a', '#bef264'],
  beauty: ['#db2777', '#fbcfe8'],
  furniture: ['#78350f', '#f59e0b'],
  jewelry: ['#111827', '#d4af37'],
  sports: ['#ea580c', '#fde047'],
  automotive: ['#020617', '#22d3ee'],
  kids: ['#7c3aed', '#facc15'],
  books: ['#92400e', '#fde68a'],
  pharmacy: ['#0f766e', '#99f6e4'],
  b2b: ['#334155', '#94a3b8'],
  marketplace: ['#4f46e5', '#f97316'],
  neon: ['#020617', '#22d3ee'],
  organic: ['#4d7c0f', '#bef264'],
  premiumApple: ['#111827', '#e5e7eb'],
  sriLanka: ['#b91c1c', '#facc15'],
  wholesale: ['#334155', '#94a3b8'],
  startup: ['#7c3aed', '#06b6d4'],
};

const TemplateCard = ({ id, template, active, onSelect }) => {
  const [a, b] = TEMPLATE_PREVIEW[id] || ['#6366f1', '#22d3ee'];
  const darkPreview = ['luxury', 'electronics', 'mobile', 'automotive', 'neon', 'premiumApple'].includes(id);
  return (
    <button type="button" onClick={() => onSelect(id)}
      className={`text-left relative overflow-hidden rounded-2xl border-2 bg-white transition-all ${active ? 'border-primary shadow-lg scale-[1.02]' : 'border-gray-100 hover:border-gray-200 hover:shadow-md'}`}>
      <div
        className="h-24 p-3"
        style={{
          background: `radial-gradient(circle at 18% 18%, rgba(255,255,255,0.55), transparent 34%), linear-gradient(135deg, ${a}, ${b})`,
        }}
      >
        <div
          className="h-8 rounded-xl mb-2"
          style={{
            background: darkPreview ? 'rgba(15,23,42,0.72)' : 'rgba(255,255,255,0.82)',
            boxShadow: '0 10px 24px rgba(15,23,42,0.16)',
          }}
        />
        <div className="grid grid-cols-3 gap-2">
          {[0, 1, 2].map(i => (
            <span
              key={i}
              className="block h-8 rounded-lg"
              style={{
                background: darkPreview ? 'rgba(15,23,42,0.62)' : 'rgba(255,255,255,0.78)',
                boxShadow: '0 8px 18px rgba(15,23,42,0.12)',
              }}
            />
          ))}
        </div>
      </div>
      <div className="p-3">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="text-sm font-bold text-gray-900">{template.name}</p>
            <p className="text-xs text-gray-500 mt-1 leading-snug">{template.description}</p>
          </div>
          {active && <span className="text-primary font-bold text-sm">✓</span>}
        </div>
      </div>
    </button>
  );
};

const ThemeCard = ({ id, theme, active, onSelect }) => (
  <div onClick={() => onSelect(id)}
    className={`relative cursor-pointer rounded-2xl overflow-hidden border-2 transition-all ${active ? 'border-primary shadow-lg scale-105' : 'border-transparent hover:border-gray-200'}`}>
    <div className="h-20" style={{ background: theme.gradient }} />
    <div className="absolute inset-0 flex items-end p-2">
      <div className="bg-white/90 backdrop-blur rounded-lg px-2 py-1 w-full">
        <p className="text-xs font-bold text-gray-800 truncate">{theme.name}</p>
      </div>
    </div>
    {active && (
      <div className="absolute top-2 right-2 w-6 h-6 bg-white rounded-full flex items-center justify-center shadow">
        <span className="text-primary text-xs font-bold">✓</span>
      </div>
    )}
  </div>
);

export default function ThemeBuilder() {
  const { settings, themeKey, darkMode, setDarkMode, refreshTheme } = useTheme();
  const [activeTab, setActiveTab] = useState('themes');
  const [selectedTheme, setSelectedTheme] = useState(themeKey || 'default');
  const [selectedTemplate, setSelectedTemplate] = useState(settings?.storeTemplate || settings?.template || settings?.layoutTemplate || 'classic');
  const [selectedFont, setSelectedFont] = useState(settings?.fontStyle || settings?.fontFamily || 'default');
  const [customColors, setCustomColors] = useState({
    primary: settings?.primaryColor || THEMES[themeKey || 'default']?.primary || '#b5451b',
    primaryDark: settings?.primaryDarkColor || THEMES[themeKey || 'default']?.primaryDark || '#8b3214',
    primaryLight: settings?.primaryLightColor || THEMES[themeKey || 'default']?.primaryLight || '#e8643c',
    accent: settings?.secondaryColor || THEMES[themeKey || 'default']?.accent || '#f0a500',
  });
  const [customCSS, setCustomCSS] = useState(settings?.customCSS || '');
  const [saving, setSaving] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [templateFilter, setTemplateFilter] = useState('all');

  useEffect(() => {
    if (!settings) return;
    const nextTheme = settings.theme || 'default';
    const nextTemplate = settings.storeTemplate || settings.template || settings.layoutTemplate || 'classic';
    const nextFont = settings.fontStyle || settings.fontFamily || 'default';
    setSelectedTheme(nextTheme);
    setSelectedTemplate(nextTemplate);
    setSelectedFont(nextFont);
    setCustomColors({
      primary: settings.primaryColor || THEMES[nextTheme]?.primary || '#b5451b',
      primaryDark: settings.primaryDarkColor || THEMES[nextTheme]?.primaryDark || '#8b3214',
      primaryLight: settings.primaryLightColor || THEMES[nextTheme]?.primaryLight || '#e8643c',
      accent: settings.secondaryColor || settings.accentColor || THEMES[nextTheme]?.accent || '#f0a500',
    });
    setCustomCSS(settings.customCSS || '');
  }, [settings]);

  const applyPreview = useCallback((themeId, font, colors, dark, template = selectedTemplate) => {
    const merged = {
      ...settings,
      theme: themeId,
      fontStyle: font,
      fontFamily: font,
      primaryColor: colors.primary,
      primaryDarkColor: colors.primaryDark,
      primaryLightColor: colors.primaryLight,
      secondaryColor: colors.accent,
      darkMode: dark,
      storeTemplate: template,
      customCSS,
    };
    applyTheme(merged);
    writeCache(merged);
  }, [settings, customCSS, selectedTemplate]);

  const handleThemeSelect = (id) => {
    setSelectedTheme(id);
    const t = THEMES[id];
    const newColors = {
      primary: t.primary,
      primaryDark: t.primaryDark,
      primaryLight: t.primaryLight,
      accent: t.accent,
    };
    setCustomColors(newColors);
    applyPreview(id, selectedFont, newColors, darkMode);
  };

  const handleFontSelect = (key) => {
    setSelectedFont(key);
    applyPreview(selectedTheme, key, customColors, darkMode);
  };


  const handleTemplateSelect = (id) => {
    setSelectedTemplate(id);
    applyPreview(selectedTheme, selectedFont, customColors, darkMode, id);
  };

  const handleColorChange = (key, val) => {
    const newColors = { ...customColors, [key]: val };
    setCustomColors(newColors);
    applyPreview(selectedTheme, selectedFont, newColors, darkMode);
  };

  const handleDarkMode = (val) => {
    setDarkMode(val);
    applyPreview(selectedTheme, selectedFont, customColors, val);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const payload = {
        theme: selectedTheme,
        fontStyle: selectedFont,
        fontFamily: selectedFont,
        primaryColor: customColors.primary,
        primaryDarkColor: customColors.primaryDark,
        primaryLightColor: customColors.primaryLight,
        secondaryColor: customColors.accent,
        darkMode,
        storeTemplate: selectedTemplate,
        customCSS,
      };
      await API.put('/settings', payload);
      writeCache({ ...settings, ...payload });
      applyTheme({ ...settings, ...payload });
      toast.success('Theme saved & applied!');
      refreshTheme();
    } catch {
      toast.error('Failed to save theme');
    }
    setSaving(false);
  };

  const resetColors = () => {
    const t = THEMES[selectedTheme];
    const reset = { primary: t.primary, primaryDark: t.primaryDark, primaryLight: t.primaryLight, accent: t.accent };
    setCustomColors(reset);
    applyPreview(selectedTheme, selectedFont, reset, darkMode);
  };

  const displayThemes = categoryFilter === 'all'
    ? Object.entries(THEMES)
    : (THEME_CATEGORIES[categoryFilter]?.themes || []).map(id => [id, THEMES[id]]);

  const displayTemplates = templateFilter === 'all'
    ? Object.entries(STORE_TEMPLATES)
    : (TEMPLATE_CATEGORIES[templateFilter]?.templates || []).map(id => [id, STORE_TEMPLATES[id]]);

  const tabs = [
    { id: 'themes', label: '🎨 Themes', icon: '🎨' },
    { id: 'templates', label: '🧩 Templates', icon: '🧩' },
    { id: 'fonts', label: '🔤 Fonts', icon: '🔤' },
    { id: 'colors', label: '🖌️ Colors', icon: '🖌️' },
    { id: 'mode', label: '🌙 Mode', icon: '🌙' },
    { id: 'css', label: '⌨️ CSS', icon: '⌨️' },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900 font-display">Theme Builder</h1>
          <p className="text-sm text-gray-500 mt-0.5">Customize your store's appearance in real-time</p>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={resetColors} className="text-sm text-gray-500 hover:text-gray-700 border border-gray-200 px-4 py-2 rounded-xl hover:bg-gray-50 transition-all">
            Reset Colors
          </button>
          <button onClick={handleSave} disabled={saving}
            className="btn-primary text-sm px-6 py-2.5 flex items-center gap-2">
            {saving ? <span className="animate-spin">⟳</span> : '✓'}
            {saving ? 'Saving...' : 'Save & Apply'}
          </button>
        </div>
      </div>

      {/* Live Preview Banner */}
      <div className="rounded-2xl overflow-hidden border border-gray-100">
        <div style={{ background: THEMES[selectedTheme]?.gradient || '' }} className="h-3" />
        <div className="bg-white px-5 py-3 flex items-center gap-4">
          <div className="w-8 h-8 rounded-full" style={{ background: customColors.primary }} />
          <div>
            <p className="text-sm font-bold text-gray-900" style={{ fontFamily: FONTS[selectedFont]?.display }}>
              {THEMES[selectedTheme]?.name}
            </p>
            <p className="text-xs text-gray-400">{FONTS[selectedFont]?.name} · {STORE_TEMPLATES[selectedTemplate]?.name}</p>
          </div>
          <div className="flex gap-2 ml-auto">
            {[customColors.primary, customColors.primaryLight, customColors.accent].map((c, i) => (
              <div key={i} className="w-6 h-6 rounded-full border-2 border-white shadow" style={{ background: c }} />
            ))}
          </div>
        </div>
      </div>

      {/* Tab Nav */}
      <div className="flex gap-2 bg-gray-100 rounded-2xl p-1.5">
        {tabs.map(t => (
          <button key={t.id} onClick={() => setActiveTab(t.id)}
            className={`flex-1 text-xs font-semibold py-2 px-3 rounded-xl transition-all ${activeTab === t.id ? 'bg-white shadow text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}>
            <span className="hidden sm:inline">{t.label}</span>
            <span className="sm:hidden">{t.icon}</span>
          </button>
        ))}
      </div>

      {/* ── THEMES TAB ── */}
      {activeTab === 'themes' && (
        <div className="space-y-4">
          {/* Category Filter */}
          <div className="flex gap-2 overflow-x-auto pb-1">
            <button onClick={() => setCategoryFilter('all')}
              className={`flex-shrink-0 text-xs font-medium px-4 py-1.5 rounded-full transition-all ${categoryFilter === 'all' ? 'bg-primary text-white' : 'bg-white border border-gray-200 text-gray-600 hover:border-gray-300'}`}>
              All ({Object.keys(THEMES).length})
            </button>
            {Object.entries(THEME_CATEGORIES).map(([id, cat]) => (
              <button key={id} onClick={() => setCategoryFilter(id)}
                className={`flex-shrink-0 text-xs font-medium px-4 py-1.5 rounded-full transition-all ${categoryFilter === id ? 'bg-primary text-white' : 'bg-white border border-gray-200 text-gray-600 hover:border-gray-300'}`}>
                {cat.label}
              </button>
            ))}
          </div>

          {/* Theme Grid */}
          <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 gap-3">
            {displayThemes.map(([id, theme]) => theme && (
              <ThemeCard key={id} id={id} theme={theme} active={selectedTheme === id} onSelect={handleThemeSelect} />
            ))}
          </div>
        </div>
      )}


      {/* ── TEMPLATES TAB ── */}
      {activeTab === 'templates' && (
        <div className="space-y-4">
          <div className="bg-blue-50 border border-blue-100 rounded-2xl p-4">
            <p className="text-sm font-semibold text-blue-900">Storefront UI Templates</p>
            <p className="text-xs text-blue-700 mt-1">Templates change the storefront visual system with CSS only: cards, radius, shadows, density, hero feel and product-grid style. No backend API, database, auth or checkout logic is changed.</p>
          </div>
          <div className="flex gap-2 overflow-x-auto pb-1">
            <button onClick={() => setTemplateFilter('all')}
              className={`flex-shrink-0 text-xs font-medium px-4 py-1.5 rounded-full transition-all ${templateFilter === 'all' ? 'bg-primary text-white' : 'bg-white border border-gray-200 text-gray-600 hover:border-gray-300'}`}>
              All ({Object.keys(STORE_TEMPLATES).length})
            </button>
            {Object.entries(TEMPLATE_CATEGORIES).map(([id, cat]) => (
              <button key={id} onClick={() => setTemplateFilter(id)}
                className={`flex-shrink-0 text-xs font-medium px-4 py-1.5 rounded-full transition-all ${templateFilter === id ? 'bg-primary text-white' : 'bg-white border border-gray-200 text-gray-600 hover:border-gray-300'}`}>
                {cat.label}
              </button>
            ))}
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {displayTemplates.map(([id, template]) => template && (
              <TemplateCard key={id} id={id} template={template} active={selectedTemplate === id} onSelect={handleTemplateSelect} />
            ))}
          </div>
        </div>
      )}

      {/* ── FONTS TAB ── */}
      {activeTab === 'fonts' && (
        <div className="grid sm:grid-cols-2 gap-3">
          {Object.entries(FONTS).map(([key, font]) => (
            <div key={key} onClick={() => handleFontSelect(key)}
              className={`cursor-pointer p-4 rounded-2xl border-2 transition-all ${selectedFont === key ? 'border-primary bg-primary/5' : 'border-gray-100 hover:border-gray-200 bg-white'}`}>
              <div className="flex items-start justify-between mb-3">
                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{key}</p>
                  <p className="text-sm font-medium text-gray-700 mt-0.5">{font.name}</p>
                </div>
                {selectedFont === key && <span className="text-primary font-bold text-sm">✓</span>}
              </div>
              <div>
                <p className="text-xl font-bold text-gray-900 leading-tight" style={{ fontFamily: font.display }}>
                  StoreKit Store
                </p>
                <p className="text-sm text-gray-500 mt-1" style={{ fontFamily: font.body }}>
                  Beautiful products for everyone
                </p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── COLORS TAB ── */}
      {activeTab === 'colors' && (
        <div className="bg-white rounded-2xl border border-gray-100 p-6 space-y-6">
          <div>
            <h3 className="text-sm font-semibold text-gray-900 mb-1">Custom Color Palette</h3>
            <p className="text-xs text-gray-500">Override the theme's default colors with your brand colors</p>
          </div>
          <div className="grid sm:grid-cols-2 gap-6">
            <ColorSwatch color={customColors.primary} onChange={v => handleColorChange('primary', v)} label="Primary Color" />
            <ColorSwatch color={customColors.primaryDark} onChange={v => handleColorChange('primaryDark', v)} label="Primary Dark" />
            <ColorSwatch color={customColors.primaryLight} onChange={v => handleColorChange('primaryLight', v)} label="Primary Light" />
            <ColorSwatch color={customColors.accent} onChange={v => handleColorChange('accent', v)} label="Accent / Secondary" />
          </div>
          <div className="p-4 rounded-xl" style={{ background: `linear-gradient(135deg, ${customColors.primary}, ${customColors.primaryLight}, ${customColors.accent})` }}>
            <p className="text-white font-bold text-sm">Live Color Preview</p>
            <p className="text-white/70 text-xs mt-0.5">This gradient uses your selected colors</p>
          </div>
          <div className="flex gap-3">
            <button onClick={resetColors} className="text-sm text-gray-500 border border-gray-200 px-4 py-2 rounded-xl hover:bg-gray-50 transition-all">
              Reset to Theme Defaults
            </button>
          </div>
        </div>
      )}

      {/* ── MODE TAB ── */}
      {activeTab === 'mode' && (
        <div className="space-y-4">
          <div className="grid sm:grid-cols-2 gap-4">
            {[
              { val: false, label: 'Light Mode', icon: '☀️', desc: 'Clean, bright interface with white backgrounds' },
              { val: true,  label: 'Dark Mode',  icon: '🌙', desc: 'Easy on the eyes with dark backgrounds' },
            ].map(opt => (
              <div key={String(opt.val)} onClick={() => handleDarkMode(opt.val)}
                className={`cursor-pointer p-5 rounded-2xl border-2 transition-all ${darkMode === opt.val ? 'border-primary bg-primary/5' : 'border-gray-100 hover:border-gray-200 bg-white'}`}>
                <div className="flex items-center justify-between mb-3">
                  <span className="text-3xl">{opt.icon}</span>
                  {darkMode === opt.val && <span className="text-primary font-bold text-sm">Active ✓</span>}
                </div>
                <p className="font-semibold text-gray-900">{opt.label}</p>
                <p className="text-sm text-gray-500 mt-1">{opt.desc}</p>
                <div className={`mt-4 rounded-xl p-3 flex gap-2 ${opt.val ? 'bg-gray-900' : 'bg-gray-50'}`}>
                  {[0,1,2].map(i => <div key={i} className={`h-2 rounded-full ${opt.val ? 'bg-gray-700' : 'bg-gray-200'}`} style={{ width: `${(i+1)*30}%` }} />)}
                </div>
              </div>
            ))}
          </div>
          <div className="bg-amber-50 border border-amber-100 rounded-2xl p-4">
            <p className="text-sm font-semibold text-amber-800 mb-1">💡 Pro Tip</p>
            <p className="text-sm text-amber-600">Dark mode applies to the entire storefront including the customer-facing site. Make sure your product images look good on dark backgrounds.</p>
          </div>
        </div>
      )}

      {/* ── CUSTOM CSS TAB ── */}
      {activeTab === 'css' && (
        <div className="space-y-4">
          <div className="bg-white rounded-2xl border border-gray-100 p-5">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h3 className="text-sm font-semibold text-gray-900">Custom CSS</h3>
                <p className="text-xs text-gray-500 mt-0.5">Advanced customization with raw CSS. Applied store-wide.</p>
              </div>
            </div>
            <textarea
              value={customCSS}
              onChange={e => setCustomCSS(e.target.value)}
              rows={16}
              placeholder={`/* Custom CSS — Examples */\n\n/* Round all buttons more */\n.btn-primary { border-radius: 50px !important; }\n\n/* Custom hero font size */\n.hero-title { font-size: 5rem !important; }\n\n/* Hide newsletter bar */\n.newsletter-bar { display: none; }\n\n/* Add custom shadow to product cards */\n.product-card { box-shadow: 0 20px 60px rgba(0,0,0,0.12); }`}
              className="w-full font-mono text-xs bg-gray-900 text-green-400 rounded-xl p-4 border-0 resize-none focus:ring-2 focus:ring-primary/30 outline-none"
            />
          </div>
          <div className="bg-red-50 border border-red-100 rounded-xl p-3">
            <p className="text-xs text-red-700 font-medium">⚠️ Custom CSS is applied to the live site immediately on save. Test carefully before saving.</p>
          </div>
        </div>
      )}
    </div>
  );
}
