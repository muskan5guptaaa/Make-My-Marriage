import { useEffect } from 'react';

// Eases .hm-reveal elements in as they scroll into view. Elements are visible by default:
// only ones still below the fold when the page loads are held back, and nothing is hidden
// for people who prefer reduced motion or browsers without IntersectionObserver.
export default function useReveal() {
  useEffect(() => {
    if (!('IntersectionObserver' in window)) return undefined;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return undefined;

    const below = [...document.querySelectorAll('.hm-reveal')].filter(
      (el) => el.getBoundingClientRect().top > window.innerHeight * 0.9,
    );
    below.forEach((el) => el.classList.add('is-waiting'));

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          entry.target.classList.remove('is-waiting');
          entry.target.classList.add('is-in');
          observer.unobserve(entry.target);
        }
      },
      { rootMargin: '0px 0px -8% 0px', threshold: 0.08 },
    );
    below.forEach((el) => observer.observe(el));
    return () => {
      observer.disconnect();
      below.forEach((el) => el.classList.remove('is-waiting'));
    };
  }, []);
}
