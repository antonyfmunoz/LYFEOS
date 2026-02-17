(function() {
  var savedTheme = localStorage.getItem('lyfeos-theme');
  if (savedTheme === 'light') {
    document.documentElement.classList.add('light-theme');
    document.documentElement.classList.remove('dark-theme');
  } else {
    document.documentElement.classList.add('dark-theme');
    document.documentElement.classList.remove('light-theme');
  }

  var path = window.location.pathname.replace(/\/+$/, '') || '/';
  var isNeutralPage = path === '/login' || path === '/register' || path === '/forgot-password' || path === '/reset-password' || path === '/onboarding' || path === '/';
  var color = isNeutralPage ? '#ffffff' : localStorage.getItem('lyfeos-primary-color');
  if (color) {
    var hex = color.replace(/^#/, '');
    var ri = parseInt(hex.substring(0, 2), 16);
    var gi = parseInt(hex.substring(2, 4), 16);
    var bi = parseInt(hex.substring(4, 6), 16);
    var r = ri / 255, g = gi / 255, b = bi / 255;
    var max = Math.max(r, g, b), min = Math.min(r, g, b);
    var l = (max + min) / 2, h, s;
    if (max === min) { h = 0; s = 0; }
    else {
      s = l > 0.5 ? (max - min) / (2 - max - min) : (max - min) / (max + min);
      switch (max) {
        case r: h = (g - b) / (max - min) + (g < b ? 6 : 0); break;
        case g: h = (b - r) / (max - min) + 2; break;
        case b: h = (r - g) / (max - min) + 4; break;
        default: h = 0;
      }
      h /= 6;
    }
    h = Math.round(h * 360);
    s = Math.round(s * 100);
    l = Math.round(l * 100);
    var hsl = h + ' ' + s + '% ' + l + '%';
    var el = document.documentElement;
    el.style.setProperty('--primary', hsl);
    el.style.setProperty('--primary-hsl', hsl);
    el.style.setProperty('--primary-color', color);
    el.style.setProperty('--primary-glow-light', 'rgba(' + ri + ',' + gi + ',' + bi + ',0.3)');
    el.style.setProperty('--primary-glow-medium', 'rgba(' + ri + ',' + gi + ',' + bi + ',0.5)');
    el.style.setProperty('--primary-glow-strong', 'rgba(' + ri + ',' + gi + ',' + bi + ',0.7)');
    el.style.setProperty('--primary-bg-subtle', 'rgba(' + ri + ',' + gi + ',' + bi + ',0.1)');
    el.style.setProperty('--primary-bg-light', 'rgba(' + ri + ',' + gi + ',' + bi + ',0.2)');
    el.style.setProperty('--primary-border-subtle', 'rgba(' + ri + ',' + gi + ',' + bi + ',0.2)');
    el.style.setProperty('--primary-shadow', 'rgba(' + ri + ',' + gi + ',' + bi + ',0.3)');
  }
})();
