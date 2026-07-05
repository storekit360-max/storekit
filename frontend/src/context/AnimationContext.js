import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import API from '../utils/api';

const AnimationContext = createContext({});

export const ANIMATION_DEFAULTS = {
  // Hero
  heroStyle:           'cinematic',   // cinematic | minimal | bold | glass
  heroParallax:        true,
  heroOrbs:            true,
  heroOrbCount:        4,
  heroDotGrid:         true,
  heroScanlines:       false,
  heroWave:            true,
  heroTextStyle:       '3d',          // 3d | slide | fade | typewriter
  heroAutoplay:        true,
  heroInterval:        6000,
  // Cards
  cardTilt:            true,
  cardTiltMax:         16,
  cardShine:           true,
  cardImageParallax:   true,
  cardHoverGlow:       true,
  cardRevealStyle:     '3d',          // 3d | fade | slide | flip
  // Page
  pageParticles:       false,
  pageFloatingShapes:  true,
  cursorTrail:         false,
  sectionReveal:       '3d',          // 3d | slide | fade
  staggerDelay:        0.09,
  // Toast
  cartToastStyle:      'cinematic',   // cinematic | minimal | pill
  cartToastPos:        'bottom-right',
  cartToastDuration:   3000,
  // Scroll
  scrollProgress:      true,
  parallaxIntensity:   1.0,           // 0 = off, 1 = normal, 2 = strong
  // Banner
  bannerParallax:      true,
  bannerShine:         true,
  bannerScale:         true,
  // Performance
  reducedMotion:       false,
  gpuAccelerate:       true,
};

export const AnimationProvider = ({ children }) => {
  const [config, setConfig] = useState(ANIMATION_DEFAULTS);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    try {
      const { data } = await API.get('/settings');
      if (data?.animationConfig) {
        setConfig({ ...ANIMATION_DEFAULTS, ...JSON.parse(data.animationConfig) });
      }
    } catch {}
    setLoaded(true);
  }, []);

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
