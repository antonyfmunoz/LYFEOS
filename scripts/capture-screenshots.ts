import puppeteer from 'puppeteer-core';

const CHROMIUM_PATH = '/nix/store/zi4f80l169xlmivz8vja8wlphq74qqk0-chromium-125.0.6422.141/bin/chromium';
const BASE_URL = 'http://localhost:5000';
const OUTPUT_DIR = '/home/runner/workspace/client/public/images';

async function captureScreenshots() {
  const browser = await puppeteer.launch({
    executablePath: CHROMIUM_PATH,
    headless: 'shell',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu', '--disable-dev-shm-usage', '--disable-web-security'],
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800, deviceScaleFactor: 2 });

  console.log('Setting tutorial completion flags in localStorage...');
  await page.goto(`${BASE_URL}/login`, { waitUntil: 'load', timeout: 60000 });
  await new Promise(r => setTimeout(r, 3000));
  
  await page.evaluate(() => {
    localStorage.setItem('lyfeos-dashboard-tutorial-completed', 'true');
    localStorage.setItem('lyfeos-missions-tutorial-completed', 'true');
    localStorage.setItem('lyfeos-ai-tutorial-completed', 'true');
    localStorage.setItem('lyfeos-profile-tutorial-completed', 'true');
    localStorage.setItem('lyfeos-chronilog-tutorial-completed', 'true');
    localStorage.setItem('lyfeos-sidebar-tutorial-completed', 'true');
    localStorage.setItem('lyfeos-mobile-nav-tutorial-completed', 'true');
  });

  console.log('Logging in as demo user...');
  await page.type('input#identifier', 'alex.chen@demo.lyfeos.com');
  await page.type('input#password', 'demo123456');
  await page.click('button[type="submit"]');
  
  await new Promise(r => setTimeout(r, 8000));
  console.log('After login, current URL:', page.url());

  const pages = [
    { url: '/dashboard', name: 'preview-dashboard.png', wait: 6000 },
    { url: '/missions', name: 'preview-mission-flow.png', wait: 6000 },
    { url: '/ai', name: 'preview-nova-chat.png', wait: 6000 },
    { url: '/profile', name: 'preview-affirmation.png', wait: 6000 },
  ];

  for (const p of pages) {
    console.log(`Navigating to ${p.url}...`);
    await page.goto(`${BASE_URL}${p.url}`, { waitUntil: 'load', timeout: 60000 });
    await new Promise(r => setTimeout(r, p.wait));
    await page.screenshot({ path: `${OUTPUT_DIR}/${p.name}`, fullPage: false });
    console.log(`Saved ${p.name}`);
  }

  await browser.close();
  console.log('\nAll screenshots captured!');
}

captureScreenshots().catch(console.error);
