// Small stroke icons for the homepage. Decorative: they always sit next to text.
const svg = (size) => ({
  width: size,
  height: size,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
  focusable: false,
});

export const Check = ({ size = 16 }) => (
  <svg {...svg(size)}><path d="M5 12.5l4.2 4.2L19 7" /></svg>
);
export const Cross = ({ size = 16 }) => (
  <svg {...svg(size)}><path d="M7 7l10 10M17 7L7 17" /></svg>
);
export const Heart = ({ size = 16 }) => (
  <svg {...svg(size)}><path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z" /></svg>
);
export const Lock = ({ size = 20 }) => (
  <svg {...svg(size)}><rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></svg>
);
export const Menu = ({ open }) => (
  <svg {...svg(22)}>{open ? <path d="M6 6l12 12M18 6L6 18" /> : <path d="M4 7h16M4 12h16M4 17h16" />}</svg>
);
