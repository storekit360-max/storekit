import React, { useState, useEffect } from 'react';
import { useAnimation, ANIMATION_DEFAULTS } from '../../context/AnimationContext';
import toast from 'react-hot-toast';

const Toggle = ({ label, desc, value, onChange, preview }) => (
  <div className="flex items-center justify-between py-3 border-b border-gray-50 last:border-0">
    <div className="flex-1 pr-4">
      <p className="text-sm font-semibold text-gray-800">{label}</p>
      {desc && <p className="text-xs text-gray-400 mt-0.5">{desc}</p>}
      {preview && <p className="text-xs mt-1 italic" style={{ color: 'var(--color-primary)' }}>✨ {preview}</p>}
    </div>
    <div onClick={onChange}
      className={`w-12 h-6 rounded-full cursor-pointer relative flex-shrink-0 transition-all ${value ? '' : 'bg-gray-200'}`}
      style={{ background: value ? 'var(--theme-gradient)' : undefined }}>
      <div className={`w-5 h-5 bg-white rounded-full absolute top-0.5 shadow-sm transition-all`} style={{ left: value ? 26 : 2 }}/>
    </div>
  </div>
);

const Slider = ({ label, desc, value, min, max, step = 0.1, unit = '', onChange }) => (
  <div className="py-3 border-b border-gray-50 last:border-0">
    <div className="flex items-center justify-between mb-2">
      <div>
        <p className="text-sm font-semibold text-gray-800">{label}</p>
        {desc && <p className="text-xs text-gray-400">{desc}</p>}
      </div>
      <span className="text-sm font-bold" style={{ color: 'var(--color-primary)' }}>{value}{unit}</span>
    </div>
    <input type="range" min={min} max={max} step={step} value={value}
      onChange={e => onChange(step < 1 ? parseFloat(e.target.value) : parseInt(e.target.value))}
      className="w-full h-2 rounded-full outline-none cursor-pointer"
      style={{ accentColor: 'var(--color-primary)' }}/>
  </div>
);

const Select = ({ label, desc, value, options, onChange }) => (
  <div className="py-3 border-b border-gray-50 last:border-0">
    <label className="form-label">{label}</label>
    {desc && <p className="text-xs text-gray-400 mb-1.5">{desc}</p>}
    <select value={value} onChange={e => onChange(e.target.value)} className="form-input">
      {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  </div>
);

const Section = ({ title, icon, children }) => (
  <div className="bg-white rounded-2xl border border-gray-100 p-5 mb-4">
    <h3 className="font-bold text-gray-900 mb-4 flex items-center gap-2 text-base">
      <span className="text-xl">{icon}</span>{title}
    </h3>
    {children}
  </div>
);

export default function AnimationSettings() {
  const { config, save } = useAnimation();
  const [local, setLocal] = useState(config);
  const [saving, setSaving] = useState(false);

  useEffect(() => { setLocal(config); }, [config]);

  const set = (key, value) => setLocal(p => ({ ...p, [key]: value }));

  const handleSave = async () => {
    setSaving(true);
    await save(local);
    toast.success('🎬 Animation settings saved! Refresh to see changes.');
    setSaving(false);
  };

  const handleReset = async () => {
    if (!window.confirm('Reset all animations to defaults?')) return;
    setLocal(ANIMATION_DEFAULTS);
    await save(ANIMATION_DEFAULTS);
    toast.success('Reset to defaults');
  };

  const presets = [
    { name: '🎬 Cinematic', values: { heroStyle:'cinematic', cardTilt:true, cardShine:true, cardImageParallax:true, cardHoverGlow:true, pageFloatingShapes:true, scrollProgress:true, bannerParallax:true, sectionReveal:'3d', heroOrbs:true, heroWave:true, heroTextStyle:'3d', parallaxIntensity:1.2 } },
    { name: '⚡ Minimal', values: { heroStyle:'minimal', cardTilt:false, cardShine:false, cardImageParallax:false, cardHoverGlow:false, pageFloatingShapes:false, scrollProgress:false, bannerParallax:false, sectionReveal:'fade', heroOrbs:false, heroWave:false, heroTextStyle:'fade', parallaxIntensity:0 } },
    { name: '🔥 Bold 3D', values: { heroStyle:'bold', cardTilt:true, cardShine:true, cardImageParallax:true, cardHoverGlow:true, pageFloatingShapes:true, scrollProgress:true, bannerParallax:true, sectionReveal:'flip', heroOrbs:true, heroWave:true, heroTextStyle:'3d', cardTiltMax:22, parallaxIntensity:1.5 } },
    { name: '🌊 Glass', values: { heroStyle:'glass', cardTilt:true, cardShine:true, cardImageParallax:false, cardHoverGlow:true, pageFloatingShapes:false, scrollProgress:true, bannerParallax:true, sectionReveal:'slide', heroOrbs:true, heroWave:true, heroTextStyle:'slide', parallaxIntensity:0.8 } },
    { name: '♿ Accessible', values: { ...ANIMATION_DEFAULTS, reducedMotion:true, cardTilt:false, pageFloatingShapes:false, heroOrbs:false, bannerParallax:false, parallaxIntensity:0 } },
  ];

  return (
    <div>
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <h2 className="font-display text-xl font-bold text-gray-900">🎬 Cinematic Settings</h2>
          <p className="text-sm text-gray-500">Control every animation and 3D effect across the site</p>
        </div>
        <div className="flex gap-2">
          <button onClick={handleReset} className="btn-outline text-sm py-2 px-4">Reset</button>
          <button onClick={handleSave} disabled={saving} className="btn-primary text-sm">
            {saving ? 'Saving...' : '✓ Save & Apply'}
          </button>
        </div>
      </div>

      {/* Presets */}
      <div className="bg-white rounded-2xl border border-gray-100 p-5 mb-4">
        <h3 className="font-bold text-gray-900 mb-3 text-base">⚡ Quick Presets</h3>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
          {presets.map(preset => (
            <button key={preset.name} onClick={() => { setLocal(p => ({ ...p, ...preset.values })); toast.success(`${preset.name} preset applied!`); }}
              className="p-3 rounded-2xl border-2 border-gray-100 hover:border-primary hover:shadow-md transition-all text-center cursor-pointer group">
              <p className="font-bold text-sm text-gray-800 group-hover:opacity-75">{preset.name}</p>
            </button>
          ))}
        </div>
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        {/* Hero Section */}
        <Section title="Hero Slider" icon="🎭">
          <Select label="Hero Style" desc="Visual style of the hero section"
            value={local.heroStyle}
            options={[
              { value:'cinematic', label:'🎬 Cinematic (orbs + dots + noise)' },
              { value:'minimal',   label:'⚪ Minimal (clean gradient)' },
              { value:'bold',      label:'🔥 Bold (high contrast)' },
              { value:'glass',     label:'🌊 Glass morphism' },
            ]}
            onChange={v => set('heroStyle', v)}/>
          <Select label="Text Entrance Effect"
            value={local.heroTextStyle}
            options={[
              { value:'3d',         label:'3D Flip-in (rotateX)' },
              { value:'slide',      label:'Slide up' },
              { value:'fade',       label:'Fade in' },
              { value:'typewriter', label:'Typewriter' },
            ]}
            onChange={v => set('heroTextStyle', v)}/>
          <Toggle label="Parallax Background" desc="Background moves at 40% scroll speed" value={local.heroParallax} onChange={() => set('heroParallax', !local.heroParallax)} preview="Depth effect on scroll"/>
          <Toggle label="Floating 3D Orbs" desc="Animated glowing blobs in hero" value={local.heroOrbs} onChange={() => set('heroOrbs', !local.heroOrbs)} preview="Morphing color orbs"/>
          <Toggle label="Dot Grid Pattern" desc="Subtle dot grid overlay" value={local.heroDotGrid} onChange={() => set('heroDotGrid', !local.heroDotGrid)}/>
          <Toggle label="Scanlines Effect" desc="CRT-style scanline overlay (cyberpunk)" value={local.heroScanlines} onChange={() => set('heroScanlines', !local.heroScanlines)}/>
          <Toggle label="Wave Bottom" desc="SVG wave cut between hero and content" value={local.heroWave} onChange={() => set('heroWave', !local.heroWave)}/>
          <Toggle label="Auto-play Slider" value={local.heroAutoplay} onChange={() => set('heroAutoplay', !local.heroAutoplay)}/>
          <Slider label="Slide Interval" desc="Time between auto-slide (ms)" value={local.heroInterval} min={2000} max={12000} step={500} unit="ms" onChange={v => set('heroInterval', v)}/>
          {local.heroOrbs && <Slider label="Orb Count" value={local.heroOrbCount} min={1} max={6} step={1} onChange={v => set('heroOrbCount', v)}/>}
        </Section>

        {/* Product Cards */}
        <Section title="Product Cards" icon="🃏">
          <Toggle label="3D Tilt on Hover" desc="Cards tilt toward cursor position" value={local.cardTilt} onChange={() => set('cardTilt', !local.cardTilt)} preview="Mouse-tracked perspective tilt"/>
          {local.cardTilt && <Slider label="Tilt Strength" desc="Max rotation angle in degrees" value={local.cardTiltMax} min={4} max={30} step={1} unit="°" onChange={v => set('cardTiltMax', v)}/>}
          <Toggle label="Shine Sweep" desc="Light sweep effect on hover" value={local.cardShine} onChange={() => set('cardShine', !local.cardShine)} preview="Glossy light reflection"/>
          <Toggle label="Image Parallax" desc="Image moves independently inside card" value={local.cardImageParallax} onChange={() => set('cardImageParallax', !local.cardImageParallax)} preview="Floating image effect"/>
          <Toggle label="Glow on Hover" desc="Primary color glow shadow" value={local.cardHoverGlow} onChange={() => set('cardHoverGlow', !local.cardHoverGlow)} preview="Colored shadow around card"/>
          <Select label="Scroll Reveal Style" desc="How cards appear when entering viewport"
            value={local.cardRevealStyle}
            options={[
              { value:'3d',   label:'3D Flip from below (rotateX)' },
              { value:'slide',label:'Slide up' },
              { value:'fade', label:'Fade + scale' },
              { value:'flip', label:'3D Y-axis flip' },
            ]}
            onChange={v => set('cardRevealStyle', v)}/>
        </Section>

        {/* Page & Scroll */}
        <Section title="Page & Scroll" icon="📜">
          <Toggle label="Scroll Progress Bar" desc="Gradient progress bar at top of page" value={local.scrollProgress} onChange={() => set('scrollProgress', !local.scrollProgress)} preview="Thin gradient bar at top"/>
          <Toggle label="Floating Background Shapes" desc="Subtle floating shapes in page background" value={local.pageFloatingShapes} onChange={() => set('pageFloatingShapes', !local.pageFloatingShapes)} preview="Blurred geometric shapes"/>
          <Select label="Section Reveal Style" desc="Animation when sections enter viewport"
            value={local.sectionReveal}
            options={[
              { value:'3d',   label:'3D Perspective flip' },
              { value:'slide',label:'Slide up' },
              { value:'fade', label:'Fade + scale' },
              { value:'flip', label:'Y-axis 3D flip' },
            ]}
            onChange={v => set('sectionReveal', v)}/>
          <Slider label="Parallax Intensity" desc="0 = off, 1 = normal, 2 = dramatic" value={local.parallaxIntensity} min={0} max={2} step={0.1} onChange={v => set('parallaxIntensity', v)}/>
          <Slider label="Stagger Delay" desc="Delay between staggered items (seconds)" value={local.staggerDelay} min={0.02} max={0.25} step={0.01} unit="s" onChange={v => set('staggerDelay', v)}/>
        </Section>

        {/* Banners */}
        <Section title="Banners & Images" icon="🖼️">
          <Toggle label="Banner Parallax" desc="Promo banner images scroll at different speed" value={local.bannerParallax} onChange={() => set('bannerParallax', !local.bannerParallax)} preview="Deep parallax depth effect"/>
          <Toggle label="Banner Shine Sweep" desc="Light sweep on banner hover" value={local.bannerShine} onChange={() => set('bannerShine', !local.bannerShine)}/>
          <Toggle label="Banner Scale on Hover" desc="Image zooms slightly on hover" value={local.bannerScale} onChange={() => set('bannerScale', !local.bannerScale)}/>
        </Section>

        {/* Cart Toast */}
        <Section title="Add to Cart Notification" icon="🛒">
          <Select label="Toast Style"
            value={local.cartToastStyle}
            options={[
              { value:'cinematic', label:'🎬 Cinematic (image + glow border)' },
              { value:'minimal',   label:'⚪ Minimal (text only)' },
              { value:'pill',      label:'💊 Pill (compact badge)' },
            ]}
            onChange={v => set('cartToastStyle', v)}/>
          <Select label="Toast Position"
            value={local.cartToastPos}
            options={[
              { value:'bottom-right', label:'Bottom Right' },
              { value:'bottom-left',  label:'Bottom Left' },
              { value:'top-right',    label:'Top Right' },
              { value:'top-left',     label:'Top Left' },
              { value:'bottom-center',label:'Bottom Center' },
            ]}
            onChange={v => set('cartToastPos', v)}/>
          <Slider label="Toast Duration" value={local.cartToastDuration} min={1000} max={6000} step={500} unit="ms" onChange={v => set('cartToastDuration', v)}/>
        </Section>

        {/* Performance */}
        <Section title="Performance & Accessibility" icon="⚙️">
          <Toggle label="Reduced Motion Mode" desc="Disables all animations for accessibility" value={local.reducedMotion} onChange={() => set('reducedMotion', !local.reducedMotion)} preview="Respects system prefers-reduced-motion"/>
          <Toggle label="GPU Acceleration" desc="Forces GPU compositing (will-change: transform)" value={local.gpuAccelerate} onChange={() => set('gpuAccelerate', !local.gpuAccelerate)}/>
          <div className="mt-4 p-3 bg-blue-50 border border-blue-100 rounded-xl">
            <p className="text-xs text-blue-700 font-semibold mb-1">💡 Performance Tips</p>
            <ul className="text-xs text-blue-600 space-y-1">
              <li>• Turn off floating shapes on low-end devices</li>
              <li>• Reduce parallax intensity for mobile</li>
              <li>• Reduce motion mode for accessibility compliance</li>
            </ul>
          </div>
        </Section>
      </div>

      {/* Save bar */}
      <div className="sticky bottom-0 bg-white border-t border-gray-100 p-4 flex items-center justify-between mt-4 -mx-4 sm:-mx-6 px-4 sm:px-6 rounded-b-2xl">
        <p className="text-xs text-gray-400">Changes apply after page refresh</p>
        <div className="flex gap-3">
          <button onClick={handleReset} className="btn-outline text-sm py-2 px-4">Reset to Defaults</button>
          <button onClick={handleSave} disabled={saving} className="btn-primary text-sm">
            {saving ? 'Saving...' : '✓ Save Animation Settings'}
          </button>
        </div>
      </div>
    </div>
  );
}
