import React, { useEffect, useRef, useState } from 'react';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { useAnimation } from '../context/AnimationContext';

gsap.registerPlugin(ScrollTrigger);

/* ─── Scroll Progress Bar ────────────────────────────────────── */
export const ScrollProgressBar = () => {
  const barRef = useRef(null);
  const { config } = useAnimation();

  useEffect(() => {
    if (!config.scrollProgress || !barRef.current) return;
    const update = () => {
      const pct = (window.scrollY / (document.body.scrollHeight - window.innerHeight)) * 100;
      gsap.set(barRef.current, { width: `${pct}%` });
    };
    window.addEventListener('scroll', update, { passive: true });
    return () => window.removeEventListener('scroll', update);
  }, [config.scrollProgress]);

  if (!config.scrollProgress) return null;
  return (
    <div className="fixed top-0 left-0 right-0 h-[3px] z-[9999] bg-transparent">
      <div ref={barRef} className="h-full rounded-r-full" style={{ background: 'var(--theme-gradient)', width: '0%', boxShadow: '0 0 8px var(--glow-primary)' }}/>
    </div>
  );
};

/* ─── Floating Particles / Shapes ────────────────────────────── */
export const FloatingShapes = () => {
  const { config } = useAnimation();
  const containerRef = useRef(null);

  useEffect(() => {
    if (!config.pageFloatingShapes || !containerRef.current) return;
    const container = containerRef.current;
    const shapes = [...container.children];
    shapes.forEach((shape, i) => {
      gsap.to(shape, {
        y:        `${-30 - i * 15}px`,
        x:        `${(i % 2 === 0 ? 1 : -1) * (10 + i * 5)}px`,
        rotation: `${(i % 2 === 0 ? 1 : -1) * 25}`,
        duration: 4 + i * 1.5,
        yoyo:     true,
        repeat:   -1,
        ease:     'sine.inOut',
        delay:    i * 0.7,
      });
    });
  }, [config.pageFloatingShapes]);

  if (!config.pageFloatingShapes) return null;
  return (
    <div ref={containerRef} className="fixed inset-0 pointer-events-none overflow-hidden z-0" aria-hidden>
      {[
        { size: 120, top: '12%', left:  '5%',  opacity: 0.07, shape: 'circle' },
        { size:  80, top: '70%', right: '8%',  opacity: 0.05, shape: 'square' },
        { size: 160, top: '40%', left:  '90%', opacity: 0.04, shape: 'circle' },
        { size:  60, top: '20%', right: '20%', opacity: 0.06, shape: 'triangle' },
        { size:  90, top: '80%', left:  '15%', opacity: 0.05, shape: 'square' },
      ].map((s, i) => (
        <div key={i} style={{
          position: 'absolute', top: s.top, left: s.left, right: s.right,
          width: s.size, height: s.size, opacity: s.opacity,
          background: i % 2 === 0 ? 'var(--color-primary)' : 'var(--color-accent)',
          borderRadius: s.shape === 'circle' ? '50%' : s.shape === 'square' ? '20%' : '0',
          clipPath: s.shape === 'triangle' ? 'polygon(50% 0%, 0% 100%, 100% 100%)' : undefined,
          filter: 'blur(20px)',
        }}/>
      ))}
    </div>
  );
};

/* ─── 3D Tilt Hook ───────────────────────────────────────────── */
export function use3DTilt(ref, { rotMax = 15, scaleHover = 1.04, glowColor } = {}) {
  const { config } = useAnimation();
  useEffect(() => {
    const el = ref.current;
    if (!el || !config.cardTilt) return;
    if (window.matchMedia('(hover: none)').matches) return;
    const max = config.cardTiltMax || rotMax;
    let bounds;
    const onEnter = () => { bounds = el.getBoundingClientRect(); };
    const onMove  = (e) => {
      if (!bounds) bounds = el.getBoundingClientRect();
      const x = ((e.clientX - bounds.left) / bounds.width  - 0.5) * 2;
      const y = ((e.clientY - bounds.top)  / bounds.height - 0.5) * 2;
      gsap.to(el, { rotateY: x * max, rotateX: -y * max, scale: config.cardHoverGlow ? scaleHover : 1, transformPerspective: 1000, duration: 0.35, ease: 'power2.out', ...(glowColor && config.cardHoverGlow ? { boxShadow: `0 32px 80px ${glowColor}, 0 0 0 2px var(--color-primary)` } : {}) });
    };
    const onLeave = () => gsap.to(el, { rotateY: 0, rotateX: 0, scale: 1, boxShadow: '', duration: 0.8, ease: 'elastic.out(1, 0.5)' });
    el.addEventListener('mouseenter', onEnter);
    el.addEventListener('mousemove',  onMove);
    el.addEventListener('mouseleave', onLeave);
    return () => {
      el.removeEventListener('mouseenter', onEnter);
      el.removeEventListener('mousemove',  onMove);
      el.removeEventListener('mouseleave', onLeave);
    };
  }, [ref, rotMax, scaleHover, glowColor, config.cardTilt, config.cardTiltMax, config.cardHoverGlow]);
}

/* ─── Scroll Reveal Hook ─────────────────────────────────────── */
export function useScrollReveal(ref, opts = {}) {
  const { config } = useAnimation();
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const style  = config.sectionReveal || '3d';
    const stagger = opts.stagger ?? config.staggerDelay ?? 0.09;
    const pi      = config.parallaxIntensity ?? 1;
    const froms   = {
      '3d':   { opacity: 0, y: 70 * pi, rotateX: 18, transformPerspective: 900 },
      'slide':{ opacity: 0, y: 60 * pi },
      'fade': { opacity: 0, scale: 0.94 },
      'flip': { opacity: 0, rotateY: 45, transformPerspective: 900 },
    };
    const from = opts.from || froms[style] || froms['3d'];
    const to   = opts.to   || { opacity: 1, y: 0, rotateX: 0, rotateY: 0, scale: 1 };
    const targets = opts.targets ? gsap.utils.toArray(opts.targets, el) : el;
    const anim = gsap.fromTo(targets, from, {
      ...to, duration: opts.duration || 0.9, ease: opts.ease || 'power3.out',
      ...(stagger && opts.targets ? { stagger } : {}),
      scrollTrigger: { trigger: el, start: opts.start || 'top 87%', toggleActions: 'play none none none' },
    });
    return () => { anim.scrollTrigger?.kill(); anim.kill(); };
  }, [config.sectionReveal, config.staggerDelay, config.parallaxIntensity, opts.duration, opts.ease, opts.from, opts.stagger, opts.start, opts.targets, opts.to, ref]);
}

/* ─── Magnetic Button ────────────────────────────────────────── */
export const MagneticButton = ({ children, className, style, onClick, strength = 0.35, ...props }) => {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || window.matchMedia('(hover: none)').matches) return;
    const onMove  = (e) => {
      const rect = el.getBoundingClientRect();
      const x = (e.clientX - rect.left - rect.width  / 2) * strength;
      const y = (e.clientY - rect.top  - rect.height / 2) * strength;
      gsap.to(el, { x, y, duration: 0.4, ease: 'power2.out' });
    };
    const onLeave = () => gsap.to(el, { x: 0, y: 0, duration: 0.7, ease: 'elastic.out(1, 0.5)' });
    el.addEventListener('mousemove',  onMove);
    el.addEventListener('mouseleave', onLeave);
    return () => { el.removeEventListener('mousemove', onMove); el.removeEventListener('mouseleave', onLeave); };
  }, [strength]);
  return <button ref={ref} className={className} style={{ ...style, willChange: 'transform' }} onClick={onClick} {...props}>{children}</button>;
};

/* ─── 3D Card Wrapper ────────────────────────────────────────── */
export const Card3D = ({ children, className, style, rotMax = 15, ...props }) => {
  const ref = useRef(null);
  use3DTilt(ref, { rotMax, glowColor: 'var(--glow-primary)' });
  return (
    <div ref={ref} className={className} style={{ ...style, transformStyle: 'preserve-3d', willChange: 'transform' }} {...props}>
      {children}
    </div>
  );
};

/* ─── Parallax Section ───────────────────────────────────────── */
export const ParallaxSection = ({ children, speed = 0.4, className, style }) => {
  const ref    = useRef(null);
  const { config } = useAnimation();
  useEffect(() => {
    if (!ref.current || !config.bannerParallax) return;
    const pi = config.parallaxIntensity || 1;
    const st = ScrollTrigger.create({
      trigger: ref.current, start: 'top bottom', end: 'bottom top', scrub: 1,
      onUpdate: (s) => gsap.set(ref.current, { y: s.progress * 120 * speed * pi }),
    });
    return () => st.kill();
  }, [speed, config.bannerParallax, config.parallaxIntensity]);
  return <div ref={ref} className={className} style={{ ...style, willChange: 'transform' }}>{children}</div>;
};

/* ─── Text Reveal (character by character) ───────────────────── */
export const TextReveal = ({ text, tag: Tag = 'h2', className, style, delay = 0 }) => {
  const ref = useRef(null);
  useEffect(() => {
    if (!ref.current) return;
    const chars = [...ref.current.querySelectorAll('.char')];
    gsap.fromTo(chars,
      { opacity: 0, y: 50, rotateX: 30, transformPerspective: 600 },
      { opacity: 1, y: 0, rotateX: 0, duration: 0.6, stagger: 0.03, ease: 'power3.out', delay,
        scrollTrigger: { trigger: ref.current, start: 'top 88%', toggleActions: 'play none none none' } }
    );
  }, [delay]);

  const words = text.split(' ');
  return (
    <Tag ref={ref} className={className} style={{ ...style, overflow: 'hidden' }}>
      {words.map((word, wi) => (
        <span key={wi} style={{ display: 'inline-block', whiteSpace: 'nowrap', marginRight: '0.3em' }}>
          {[...word].map((char, ci) => (
            <span key={ci} className="char" style={{ display: 'inline-block' }}>{char}</span>
          ))}
        </span>
      ))}
    </Tag>
  );
};

/* ─── Glowing Orb ────────────────────────────────────────────── */
export const GlowOrb = ({ color, size = 300, top, left, right, bottom, opacity = 0.25, speed = 8, delay = 0 }) => {
  const ref = useRef(null);
  useEffect(() => {
    if (!ref.current) return;
    gsap.to(ref.current, { x: 40, y: -30, duration: speed, yoyo: true, repeat: -1, ease: 'sine.inOut', delay });
  }, [speed, delay]);
  return (
    <div ref={ref} className="absolute pointer-events-none will-change-transform"
      style={{ top, left, right, bottom, width: size, height: size }}>
      <div className="w-full h-full rounded-full morph-blob"
        style={{ background: color || 'var(--color-accent)', filter: 'blur(80px)', opacity }}/>
    </div>
  );
};

/* ─── Counter Animate ────────────────────────────────────────── */
export const AnimCounter = ({ end, suffix = '', prefix = '', duration = 2 }) => {
  const ref = useRef(null);
  const [val, setVal] = useState(0);
  useEffect(() => {
    if (!ref.current) return;
    const obj = { n: 0 };
    const st = ScrollTrigger.create({
      trigger: ref.current, start: 'top 88%', once: true,
      onEnter: () => gsap.to(obj, { n: end, duration, ease: 'power2.out', onUpdate: () => setVal(Math.round(obj.n)) }),
    });
    return () => st.kill();
  }, [end, duration]);
  return <span ref={ref}>{prefix}{val.toLocaleString()}{suffix}</span>;
};

/* ─── Image Reveal ───────────────────────────────────────────── */
export const ImageReveal = ({ src, alt, className, style }) => {
  const wrapRef  = useRef(null);
  const imgRef   = useRef(null);
  const clipRef  = useRef(null);
  useEffect(() => {
    if (!wrapRef.current) return;
    const tl = gsap.timeline({
      scrollTrigger: { trigger: wrapRef.current, start: 'top 85%', toggleActions: 'play none none none' },
    });
    tl.fromTo(clipRef.current, { scaleX: 0, transformOrigin: 'left center' }, { scaleX: 1, duration: 0.7, ease: 'power3.inOut' })
      .fromTo(imgRef.current, { scale: 1.3 }, { scale: 1, duration: 0.7, ease: 'power3.out' }, 0);
  }, []);
  return (
    <div ref={wrapRef} style={{ overflow: 'hidden', position: 'relative', ...style }}>
      <div ref={clipRef} style={{ position: 'absolute', inset: 0, background: 'var(--color-primary)', zIndex: 10, transformOrigin: 'right center' }}/>
      <img ref={imgRef} src={src} alt={alt} className={className} style={{ display: 'block', width: '100%' }}/>
    </div>
  );
};
