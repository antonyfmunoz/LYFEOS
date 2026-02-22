export function hexToRGB(hex: string) {
  hex = hex.replace(/^#/, '');
  const r = parseInt(hex.substring(0, 2), 16);
  const g = parseInt(hex.substring(2, 4), 16);
  const b = parseInt(hex.substring(4, 6), 16);
  return { r, g, b };
}

export function hexToHSL(hex: string) {
  hex = hex.replace(/^#/, '');
  let r = parseInt(hex.substring(0, 2), 16) / 255;
  let g = parseInt(hex.substring(2, 4), 16) / 255;
  let b = parseInt(hex.substring(4, 6), 16) / 255;
  let max = Math.max(r, g, b);
  let min = Math.min(r, g, b);
  let l = (max + min) / 2;
  let h: number, s: number;
  if (max === min) {
    h = 0;
    s = 0;
  } else {
    s = l > 0.5 ? (max - min) / (2 - max - min) : (max - min) / (max + min);
    switch (max) {
      case r:
        h = (g - b) / (max - min) + (g < b ? 6 : 0);
        break;
      case g:
        h = (b - r) / (max - min) + 2;
        break;
      case b:
        h = (r - g) / (max - min) + 4;
        break;
      default:
        h = 0;
    }
    h /= 6;
  }
  h = Math.round(h! * 360);
  s = Math.round(s * 100);
  l = Math.round(l * 100);
  return `${h} ${s}% ${l}%`;
}

export function applyPrimaryColor(color: string) {
  const hsl = hexToHSL(color);
  document.documentElement.style.setProperty('--primary', hsl);
  document.documentElement.style.setProperty('--primary-hsl', hsl);
  document.documentElement.style.setProperty('--primary-color', color);
  const { r, g, b } = hexToRGB(color);
  document.documentElement.style.setProperty('--primary-glow-light', `rgba(${r}, ${g}, ${b}, 0.3)`);
  document.documentElement.style.setProperty('--primary-glow-medium', `rgba(${r}, ${g}, ${b}, 0.5)`);
  document.documentElement.style.setProperty('--primary-glow-strong', `rgba(${r}, ${g}, ${b}, 0.7)`);
  document.documentElement.style.setProperty('--primary-bg-subtle', `rgba(${r}, ${g}, ${b}, 0.1)`);
  document.documentElement.style.setProperty('--primary-bg-light', `rgba(${r}, ${g}, ${b}, 0.2)`);
  document.documentElement.style.setProperty('--primary-border-subtle', `rgba(${r}, ${g}, ${b}, 0.2)`);
  document.documentElement.style.setProperty('--primary-shadow', `rgba(${r}, ${g}, ${b}, 0.3)`);
  document.documentElement.style.setProperty('--secondary', hsl);
  document.documentElement.style.setProperty('--accent', hsl);
  localStorage.setItem('lyfeos-last-primary-color', color);
  localStorage.setItem('lyfeos-primary-color', color);
}
