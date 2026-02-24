import puppeteer from 'puppeteer-core';

const CHROMIUM_PATH = '/nix/store/zi4f80l169xlmivz8vja8wlphq74qqk0-chromium-125.0.6422.141/bin/chromium';
const BASE_URL = 'http://localhost:5000';
const OUTPUT_DIR = '/home/runner/workspace/client/public/images';

const HIDE_TUTORIAL_CSS = `
  div[style*="z-index: 10000"], 
  div[style*="z-index:10000"] { 
    display: none !important; 
  }
`;

const PAGES = [
  { url: '/dashboard', name: 'preview-dashboard', wait: 3000 },
  { url: '/missions', name: 'preview-mission-flow', wait: 3000 },
  { url: '/ai', name: 'preview-nova-chat', wait: 3000 },
  { url: '/profile', name: 'preview-affirmation', wait: 3000 },
];

async function hideTutorials(page: any) {
  await page.addStyleTag({ content: HIDE_TUTORIAL_CSS });
  await page.evaluate(() => {
    document.querySelectorAll('div').forEach(el => {
      const style = el.getAttribute('style') || '';
      if (style.includes('10000')) {
        (el as HTMLElement).style.display = 'none';
      }
    });
  });
  await new Promise(r => setTimeout(r, 300));
}

async function loginOnPage(page: any) {
  await page.goto(`${BASE_URL}/login?access=beta`, { waitUntil: 'load', timeout: 60000 });
  await new Promise(r => setTimeout(r, 2000));
  await page.evaluate(() => { localStorage.setItem('lyfeos_access', 'true'); });
  await page.goto(`${BASE_URL}/login`, { waitUntil: 'load', timeout: 60000 });
  await new Promise(r => setTimeout(r, 2000));

  console.log('Logging in...');
  await page.type('input#identifier', 'alex.chen@demo.lyfeos.com');
  await page.type('input#password', 'demo123456');
  await page.click('button[type="submit"]');
  await new Promise(r => setTimeout(r, 5000));

  let attempts = 0;
  while (attempts < 5) {
    await page.goto(`${BASE_URL}/dashboard`, { waitUntil: 'load', timeout: 30000 });
    await new Promise(r => setTimeout(r, 2000));
    if (!page.url().includes('/login') && !page.url().includes('/waitlist') && !page.url().includes('/ceremony')) {
      break;
    }
    attempts++;
    console.log(`Auth not ready (attempt ${attempts}), at: ${page.url()}, retrying...`);
    await new Promise(r => setTimeout(r, 1500));
  }
  console.log('Logged in, at:', page.url());

  await page.evaluate(() => {
    return fetch('/api/profile', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ completedTutorials: ['dashboard', 'missions', 'profile', 'chronilog', 'ai'] }),
    });
  });
}

async function captureScreenshots() {
  const browser = await puppeteer.launch({
    executablePath: CHROMIUM_PATH,
    headless: 'shell',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu', '--disable-dev-shm-usage', '--disable-web-security'],
  });

  console.log('=== Desktop screenshots (1280x800) ===');
  const desktopPage = await browser.newPage();
  await desktopPage.setViewport({ width: 1280, height: 800, deviceScaleFactor: 2 });
  await loginOnPage(desktopPage);

  for (const p of PAGES) {
    console.log(`Navigating to ${p.url}...`);
    await desktopPage.goto(`${BASE_URL}${p.url}`, { waitUntil: 'load', timeout: 60000 });
    await new Promise(r => setTimeout(r, p.wait));
    await hideTutorials(desktopPage);
    await desktopPage.screenshot({ path: `${OUTPUT_DIR}/${p.name}.png`, fullPage: false });
    console.log(`Saved ${p.name}.png`);
  }
  await desktopPage.close();

  console.log('\n=== Mobile screenshots (390x844) ===');
  const mobilePage = await browser.newPage();
  await mobilePage.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 });
  await loginOnPage(mobilePage);

  for (const p of PAGES) {
    console.log(`Navigating to ${p.url}...`);
    await mobilePage.goto(`${BASE_URL}${p.url}`, { waitUntil: 'load', timeout: 60000 });
    await new Promise(r => setTimeout(r, p.wait));

    const url = mobilePage.url();
    if (url.includes('/login') || url.includes('/waitlist')) {
      console.log(`  WARNING: redirected to ${url}`);
    }

    await hideTutorials(mobilePage);
    await mobilePage.screenshot({ path: `${OUTPUT_DIR}/${p.name}-mobile.png`, fullPage: false });
    console.log(`Saved ${p.name}-mobile.png (at: ${mobilePage.url()})`);
  }
  await mobilePage.close();

  await browser.close();
  console.log('\nAll screenshots captured!');
}

captureScreenshots().catch(console.error);
