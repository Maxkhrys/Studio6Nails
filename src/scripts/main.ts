import Lenis from 'lenis';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);

const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ------------------------------------------------------------------
   Smooth scrolling (Lenis driven by GSAP's ticker)
   ------------------------------------------------------------------ */

let lenis: Lenis | null = null;

if (!reducedMotion) {
  lenis = new Lenis({ lerp: 0.09 });
  lenis.on('scroll', ScrollTrigger.update);
  gsap.ticker.add((time) => lenis!.raf(time * 1000));
  gsap.ticker.lagSmoothing(0);
}

// Smooth in-page anchors (native scroll-behavior handles reduced-motion)
document.querySelectorAll<HTMLAnchorElement>('a[href^="#"]').forEach((anchor) => {
  anchor.addEventListener('click', (event) => {
    const href = anchor.getAttribute('href');
    if (!href || href === '#') return;
    const target = document.querySelector(href);
    if (!target || !lenis) return;
    event.preventDefault();
    lenis.scrollTo(target as HTMLElement, { offset: href === '#top' ? 0 : -64 });
  });
});

/* ------------------------------------------------------------------
   Sticky nav — solidifies once the hero is left behind
   ------------------------------------------------------------------ */

ScrollTrigger.create({
  start: 60,
  end: 'max',
  toggleClass: { targets: '#site-nav', className: 'is-scrolled' },
});

/* ------------------------------------------------------------------
   Mobile nav toggle
   ------------------------------------------------------------------ */

const navToggle = document.querySelector<HTMLButtonElement>('[data-nav-toggle]');
const navMenu = document.querySelector<HTMLElement>('#nav-menu');

if (navToggle && navMenu) {
  navToggle.addEventListener('click', () => {
    const open = navMenu.classList.toggle('is-open');
    navToggle.setAttribute('aria-expanded', String(open));
    navToggle.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
    document.body.classList.toggle('nav-locked', open);
  });
  navMenu.querySelectorAll('a').forEach((link) =>
    link.addEventListener('click', () => {
      navMenu.classList.remove('is-open');
      navToggle.setAttribute('aria-expanded', 'false');
      document.body.classList.remove('nav-locked');
    }),
  );
}

/* ------------------------------------------------------------------
   Hero — fade in content, slow ken-burns zoom, gentle parallax
   ------------------------------------------------------------------ */

const heroFades = gsap.utils.toArray<HTMLElement>('[data-hero-fade]');
const heroImage = document.querySelector<HTMLElement>('.hero__media img');

if (reducedMotion) {
  gsap.set(heroFades, { clearProps: 'all' });
} else if (heroFades.length) {
  gsap
    .timeline({ delay: 0.25 })
    .fromTo(
      heroFades,
      { opacity: 0, y: 18 },
      { opacity: 1, y: 0, duration: 1.1, stagger: 0.13, ease: 'power2.out' },
    );

  if (heroImage) {
    gsap.fromTo(
      heroImage,
      { scale: 1.06 },
      { scale: 1.16, duration: 42, ease: 'sine.inOut', yoyo: true, repeat: -1 },
    );
    gsap.to('.hero__media', {
      yPercent: 12,
      ease: 'none',
      scrollTrigger: { trigger: '.hero', start: 'top top', end: 'bottom top', scrub: true },
    });
  }
}

/* ------------------------------------------------------------------
   Intro statement — words ink in as you read down (scroll-scrubbed)
   ------------------------------------------------------------------ */

const statementWords = gsap.utils.toArray<HTMLElement>('.statement__word');

if (statementWords.length && !reducedMotion) {
  gsap.to(statementWords, {
    opacity: 1,
    duration: 0.4,
    stagger: 0.08,
    ease: 'none',
    scrollTrigger: { trigger: '#intro', start: 'top 75%', end: 'bottom 60%', scrub: 0.6 },
  });
}

/* ------------------------------------------------------------------
   Media reveals — images unclip upward while the photo settles.
   One shared pattern for every photo on the site.
   ------------------------------------------------------------------ */

gsap.utils.toArray<HTMLElement>('[data-media]').forEach((figure) => {
  const image = figure.querySelector('img');

  if (reducedMotion) {
    gsap.set(figure, { clipPath: 'none' });
    figure.classList.add('is-revealed');
    return;
  }

  const tl = gsap.timeline({
    scrollTrigger: { trigger: figure, start: 'top 84%', once: true },
    onComplete: () => {
      figure.classList.add('is-revealed');
      if (image && !figure.hasAttribute('data-parallax')) {
        gsap.set(image, { clearProps: 'transform' });
      }
    },
  });

  tl.to(figure, { clipPath: 'inset(0% 0% 0% 0%)', duration: 1.3, ease: 'power3.inOut' });

  if (image) {
    tl.from(image, { scale: '+=0.14', duration: 1.5, ease: 'power3.out' }, 0);
  }
});

/* ------------------------------------------------------------------
   Depth parallax — data-parallax holds drift amplitude in percent
   ------------------------------------------------------------------ */

gsap.utils.toArray<HTMLElement>('[data-parallax]').forEach((element) => {
  if (reducedMotion) return;
  const target = element.querySelector('img') ?? element;
  const amount = parseFloat(element.dataset.parallax ?? '5');
  gsap.fromTo(
    target,
    { yPercent: -amount },
    {
      yPercent: amount,
      ease: 'none',
      scrollTrigger: { trigger: element, start: 'top bottom', end: 'bottom top', scrub: 0.4 },
    },
  );
});

/* ------------------------------------------------------------------
   Section reveals — calm entrances everywhere else
   ------------------------------------------------------------------ */

gsap.utils.toArray<HTMLElement>('[data-reveal]').forEach((element) => {
  if (reducedMotion) {
    gsap.set(element, { opacity: 1 });
    return;
  }
  gsap.fromTo(
    element,
    { opacity: 0, y: 44 },
    {
      opacity: 1,
      y: 0,
      duration: 1.1,
      ease: 'power3.out',
      scrollTrigger: { trigger: element, start: 'top 88%', once: true },
    },
  );
});
