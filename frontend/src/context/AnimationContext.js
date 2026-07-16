import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import API from '../utils/api';

const AnimationContext = createContext({});

export const ANIMATION_DEFAULTS = {
  // Hero
  heroStyle:           'cinematic',   // cinematic | minimal | bold | glass
  heroParallax:        false,
  heroOrbs:            false,
  heroOrbCount:        2,
  heroDotGrid:         false,
  heroScanlines:       false,
  heroWave:            true,
  heroTextStyle:       '3d',          // 3d | slide | fade | typewriter
  heroAutoplay:        true,
  heroInterval:        6000,
  // Cards
  cardTilt:            false,
  cardTiltMax:         8,
  cardShine:           false,
  cardImageParallax:   false,
  cardHoverGlow:       false,
  cardRevealStyle:     'fade',        // 3d | fade | slide | flip
  // Page
  pageParticles:       false,
  pageFloatingShapes:  false,
  cursorTrail:         false,
  sectionReveal:       'fade',        // 3d | slide | fade
  staggerDelay:        0.035,
  // Toast
  cartToastStyle:      'cinematic',   // cinematic | minimal | pill
  cartToastPos:        'bottom-right',
  cartToastDuration:   3000,
  // Scroll
  scrollProgress:      false,
  parallaxIntensity:   0.35,          // 0 = off, 1 = normal, 2 = strong
  // Banner
  bannerParallax:      false,
  bannerShine:         false,
  bannerScale:         true,
  // Performance
  reducedMotion:       false,
  gpuAccelerate:       true,
};

const SPEED_PROFILE_OVERRIDES = {
  heroParallax: false,
  heroOrbs: false,
  heroDotGrid: false,
  cardTilt: false,
  cardShine: false,
  cardImageParallax: false,
  cardHoverGlow: false,
  cardRevealStyle: 'fade',
  pageFloatingShapes: false,
  sectionReveal: 'fade',
  staggerDelay: 0.035,
  scrollProgress: false,
  parallaxIntensity: 0.35,
  bannerParallax: false,
  bannerShine: false,
};

const shouldPreferSpeed = () => {
  try {
    const nav = navigator || {};
    const conn = nav.connection || nav.mozConnection || nav.webkitConnection;
    return (
      window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches ||
      conn?.saveData ||
      ['slow-2g', '2g', '3g'].includes(conn?.effectiveType) ||
      (nav.deviceMemory && nav.deviceMemory <= 4) ||
      (nav.hardwareConcurrency && nav.hardwareConcurrency <= 4) ||
      window.innerWidth < 768
    );
  } catch {
    return true;
  }
};

const speedTune = (config) => (
  shouldPreferSpeed()
    ? { ...config, ...SPEED_PROFILE_OVERRIDES, reducedMotion: true }
    : config
);

const readAnimationConfig = (settings) => {
  try {
    return settings?.animationConfig
      ? speedTune({ ...ANIMATION_DEFAULTS, ...JSON.parse(settings.animationConfig) })
      : speedTune(ANIMATION_DEFAULTS);
  } catch {
    return speedTune(ANIMATION_DEFAULTS);
  }
};

export const AnimationProvider = ({ children }) => {
  const bootstrapSettings = typeof window !== 'undefined' ? window.__STOREKIT_BOOTSTRAP_SETTINGS__ : null;
  const [config, setConfig] = useState(() => readAnimationConfig(bootstrapSettings));
  const [loaded, setLoaded] = useState(Boolean(bootstrapSettings));

  const load = useCallback(async () => {
    // Theme bootstrap already carries animationConfig. Reusing it avoids a
    // second /settings request during the critical first render.
    if (bootstrapSettings) {
      setLoaded(true);
      return;
    }
    try {
      const { data } = await API.get('/settings', { cacheTTL: 5 * 60 * 1000 });
      if (data?.animationConfig) {
        setConfig(readAnimationConfig(data));
      }
    } catch {}
    setLoaded(true);
  }, [bootstrapSettings]);

  useEffect(() => { load(); }, [load]);

  const save = useCallback(async (updates) => {
    const next = { ...config, ...updates };
    setConfig(next);
    try { await API.put('/settings', { animationConfig: JSON.stringify(next) }); } catch {}
  }, [config]);

  return (
    <AnimationContext.Provider value={{ config, save, loaded }}>
      {children}
    </AnimationContext.Provider>
  );
};

export const useAnimation = () => useContext(AnimationContext);
