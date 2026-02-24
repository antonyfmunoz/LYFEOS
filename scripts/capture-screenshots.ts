import puppeteer from 'puppeteer-core';

const CHROMIUM_PATH = '/nix/store/zi4f80l169xlmivz8vja8wlphq74qqk0-chromium-125.0.6422.141/bin/chromium';
const BASE_URL = 'http://localhost:5000';
const OUTPUT_DIR = '/home/runner/workspace/client/public/images';

const VIEWPORTS = [
  { label: 'desktop', width: 1280, height: 800, suffix: '' },
  { label: 'mobile', width: 390, height: 844, suffix: '-mobile' },
];

const PAGES = [
  { url: '/dashboard', name: 'preview-dashboard', wait: 6000 },
  { url: '/missions', name: 'preview-mission-flow', wait: 6000 },
  { url: '/ai', name: 'preview-nova-chat', wait: 6000 },
  { url: '/profile', name: 'preview-affirmation', wait: 6000 },
];

async function captureScreenshots() {
  const browser = await puppeteer.launch({
    executablePath: CHROMIUM_PATH,
    headless: 'shell',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu', '--disable-dev-shm-usage', '--disable-web-security'],
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800, deviceScaleFactor: 2 });

  console.log('Setting tutorial completion flags and access in localStorage...');
  await page.goto(`${BASE_URL}/login?access=beta`, { waitUntil: 'load', timeout: 60000 });
  await new Promise(r => setTimeout(r, 3000));
  
  await page.evaluate(() => {
    localStorage.setItem('lyfeos-dashboard-tutorial-completed', 'true');
    localStorage.setItem('lyfeos-missions-tutorial-completed', 'true');
    localStorage.setItem('lyfeos-ai-tutorial-completed', 'true');
    localStorage.setItem('lyfeos-profile-tutorial-completed', 'true');
    localStorage.setItem('lyfeos-chronilog-tutorial-completed', 'true');
    localStorage.setItem('lyfeos-sidebar-tutorial-completed', 'true');
    localStorage.setItem('lyfeos-mobile-nav-tutorial-completed', 'true');
    localStorage.setItem('lyfeos_access', 'true');
  });

  await page.goto(`${BASE_URL}/login`, { waitUntil: 'load', timeout: 60000 });
  await new Promise(r => setTimeout(r, 3000));

  console.log('Logging in as demo user...');
  await page.type('input#identifier', 'alex.chen@demo.lyfeos.com');
  await page.type('input#password', 'demo123456');
  await page.click('button[type="submit"]');
  
  await new Promise(r => setTimeout(r, 8000));
  console.log('After login, current URL:', page.url());

  for (const vp of VIEWPORTS) {
    console.log(`\n=== Capturing ${vp.label} screenshots (${vp.width}x${vp.height}) ===`);
    await page.setViewport({ width: vp.width, height: vp.height, deviceScaleFactor: 2 });

    for (const p of PAGES) {
      const filename = `${p.name}${vp.suffix}.png`;
      console.log(`Navigating to ${p.url}...`);
      await page.goto(`${BASE_URL}${p.url}`, { waitUntil: 'load', timeout: 60000 });
      await new Promise(r => setTimeout(r, p.wait));
      await page.screenshot({ path: `${OUTPUT_DIR}/${filename}`, fullPage: false });
      console.log(`Saved ${filename}`);
    }
  }

  await browser.close();
  console.log('\nAll screenshots captured!');
}

captureScreenshots().catch(console.error);
