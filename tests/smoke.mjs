// Smoke test: add / edit / delete / threshold / corrupt storage / storage failure / reload / export+import.
// Run: npm install && npx playwright install chromium && npm test
// Hermetic: the pinned FullCalendar (npm devDependency, same bytes jsDelivr serves) is substituted for the CDN
// request, so the SRI attribute is still enforced by the browser. Google Fonts is stubbed out.
// Set CHROME_PATH to use a specific Chrome binary.
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const PAGE = new URL('../index.html', import.meta.url).href;
const FC_JS = new URL('../node_modules/fullcalendar/index.global.min.js', import.meta.url);
const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const sri = 'sha384-' + createHash('sha384').update(readFileSync(FC_JS)).digest('base64');
if (!html.includes(`integrity="${sri}"`) || !html.includes('fullcalendar@6.1.15/')) {
  console.log('FAIL index.html SRI hash / pinned version does not match fullcalendar@6.1.15');
  process.exit(1);
}
const TODAY = '2026-10-03'; // fixed clock: 23:30 in Vancouver, 06:30 UTC next day (the UTC-parsing edge)

const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined });

let failures = 0;
async function scenario(name, fn, { viewport, init } = {}) {
  const context = await browser.newContext({ timezoneId: 'America/Vancouver', viewport, acceptDownloads: true });
  await context.route('https://cdn.jsdelivr.net/**', (r) => r.fulfill({
    path: FC_JS.pathname, contentType: 'application/javascript', headers: { 'access-control-allow-origin': '*' } }));
  await context.route('https://fonts.googleapis.com/**', (r) => r.fulfill({ body: '', contentType: 'text/css' }));
  const page = await context.newPage();
  const problems = [];
  page.on('console', (m) => { if (m.type() === 'error') problems.push('console: ' + m.text()); });
  page.on('pageerror', (e) => problems.push('pageerror: ' + e.message));
  page.on('dialog', (d) => d.accept());
  await page.clock.setFixedTime(new Date('2026-10-04T06:30:00Z'));
  if (init) await page.addInitScript(init);
  try {
    await page.goto(PAGE);
    await page.waitForSelector('.fc-daygrid-day[data-date]');
    await fn(page);
    if (problems.length) throw new Error(problems.join('; '));
    console.log('PASS ' + name);
  } catch (e) {
    failures++;
    console.log('FAIL ' + name + ': ' + e.message);
  }
  await context.close();
}

const eq = (a, b, what) => { if (a !== b) throw new Error(`${what}: expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`); };
const cell = (page, d) => page.locator(`.fc-daygrid-day[data-date="${d}"]`);
const total = (page, d) => cell(page, d).locator('.total-display').textContent();
const openDay = (page, d) => cell(page, d).click();
async function add(page, name, amount, remark = '') {
  await page.fill('#name-input', name);
  await page.fill('#amount-input', amount);
  await page.fill('#remark-input', remark);
  await page.click('#save-entry');
}

await scenario('fresh load seeds fake demo data on the right (local) day', async (page) => {
  eq(await total(page, TODAY), '$84.50', 'today total');
  eq(await cell(page, TODAY).evaluate((c) => c.classList.contains('fc-day-today')), true, 'today cell');
  eq(await page.locator('#banners .banner').count(), 0, 'banners');
  await page.click('.fc-prev-button'); // the high-spend demo day is 9 days ago, in September
  eq(await total(page, '2026-09-24'), '$3,020.00', 'demo red day total');
  eq(await cell(page, '2026-09-24').evaluate((c) => c.classList.contains('day-high')), true, 'demo red day');
});

await scenario('add, edit, delete update totals (integer cents, no float drift)', async (page) => {
  await openDay(page, TODAY);
  await add(page, 'Smoke A', '10.10');
  await add(page, 'Smoke B', '20.20');
  eq(await page.textContent('#total-amount'), 'Total: $114.80', 'popup total after add');
  await page.click('button[aria-label="Edit Smoke A"]');
  await page.fill('#amount-input', '5');
  await page.click('#save-entry');
  eq(await page.textContent('#total-amount'), 'Total: $109.70', 'popup total after edit');
  await page.click('button[aria-label="Delete Smoke B"]');
  eq(await page.textContent('#total-amount'), 'Total: $89.50', 'popup total after delete');
  await page.click('#close-modal');
  eq(await total(page, TODAY), '$89.50', 'cell total');
});

await scenario('validation rejects bad input and renders names as text', async (page) => {
  await openDay(page, '2026-10-15');
  await add(page, '', '5');
  eq(await page.textContent('#form-error'), 'Please enter a name.', 'empty name');
  for (const bad of ['abc', '1e3', '1.234', '1000000.01']) {
    await add(page, 'x', bad);
    eq((await page.textContent('#form-error')).startsWith('Enter an amount'), true, 'bad amount ' + bad);
  }
  await add(page, '<img src=x onerror="window.__pwned=1">', '1');
  eq(await page.evaluate(() => window.__pwned), undefined, 'script injection');
  eq(await page.locator('#entry-list img').count(), 0, 'no injected elements');
});

await scenario('3000 threshold: exactly 3000.00 is green, 3000.01 is red, refunds are green', async (page) => {
  await openDay(page, '2026-10-15');
  await add(page, 'Big', '3000.00');
  eq(await cell(page, '2026-10-15').evaluate((c) => c.className.includes('day-low')), true, 'exactly 3000 green');
  await add(page, 'Penny', '0.01');
  eq(await cell(page, '2026-10-15').evaluate((c) => c.className.includes('day-high')), true, '3000.01 red');
  await add(page, 'Refund', '-5000');
  eq(await total(page, '2026-10-15'), '-$1,999.99', 'negative total');
  eq(await cell(page, '2026-10-15').evaluate((c) => c.className.includes('day-low')), true, 'negative green');
});

await scenario('Go to date lands on the picked day, not the previous one', async (page) => {
  await page.fill('#date-search', '2026-03-01');
  await page.click('#goto-date');
  eq(await page.textContent('.fc-toolbar-title'), 'March 2026', 'title');
  eq(await cell(page, '2026-03-01').locator('.fc-daygrid-day-number').textContent(), '1', 'day cell');
  await page.fill('#date-search', '');
  await page.click('#goto-date');
  eq((await page.textContent('#status')).startsWith('Pick a valid date'), true, 'empty date message');
});

await scenario('entries survive reload', async (page) => {
  await openDay(page, '2026-10-20');
  await add(page, 'Persist me', '12.34');
  await page.reload();
  await page.waitForSelector('.fc-daygrid-day[data-date]');
  eq(await total(page, '2026-10-20'), '$12.34', 'after reload');
});

await scenario('corrupt storage shows a banner, keeps a raw copy, app still works', async (page) => {
  await page.evaluate(() => localStorage.setItem('veerjis-calendar', '{not json'));
  await page.reload();
  await page.waitForSelector('.fc-daygrid-day[data-date]');
  eq((await page.textContent('#banners')).includes('could not be read'), true, 'banner');
  eq(await page.evaluate(() => localStorage.getItem('veerjis-calendar-corrupt')), '{not json', 'raw copy kept');
  await openDay(page, TODAY);
  await add(page, 'After corrupt', '1');
  eq(await total(page, TODAY), '$1.00', 'works after corrupt');
  await page.reload();
  await page.waitForSelector('.fc-daygrid-day[data-date]');
  eq(await total(page, TODAY), '$1.00', 'saved after corrupt');
});

await scenario('wrong-shaped and newer-version data is treated as unreadable', async (page) => {
  await page.evaluate(() => localStorage.setItem('veerjis-calendar', JSON.stringify({ version: 99, entries: {} })));
  await page.reload();
  await page.waitForSelector('.fc-daygrid-day[data-date]');
  eq(await page.locator('#banners .banner.error').count(), 1, 'banner');
});

await scenario('quota exceeded: warns, keeps the entry in memory', async (page) => {
  await openDay(page, TODAY);
  await page.evaluate(() => {
    Storage.prototype.setItem = () => { throw new DOMException('full', 'QuotaExceededError'); };
  });
  await add(page, 'Unsaved', '2');
  eq((await page.textContent('#banners')).includes('storage is full'), true, 'banner');
  eq((await page.textContent('#entry-list')).includes('Unsaved'), true, 'entry still listed');
});

await scenario('storage blocked (private mode): app loads in memory with a warning', async (page) => {
  eq((await page.textContent('#banners')).includes('unavailable'), true, 'banner');
  eq(await total(page, TODAY), '$84.50', 'demo still shown');
}, { init: () => {
  Object.defineProperty(window, 'localStorage', { get() { throw new DOMException('denied', 'SecurityError'); } });
} });

await scenario('export then import round-trips', async (page) => {
  await openDay(page, '2026-10-21');
  await add(page, 'Round trip', '7.07');
  await page.click('#close-modal');
  const [download] = await Promise.all([page.waitForEvent('download'), page.click('#export-json')]);
  const path = await download.path();
  const data = JSON.parse(readFileSync(path, 'utf8'));
  eq(data.version, 2, 'version');
  eq(data.entries['2026-10-21'][0].cents, 707, 'cents');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.waitForSelector('.fc-daygrid-day[data-date]');
  await page.setInputFiles('#import-file', path);
  await page.waitForFunction(() => document.querySelector('#status').textContent.startsWith('Imported'));
  eq(await total(page, '2026-10-21'), '$7.07', 'after import');
  await page.setInputFiles('#import-file', { name: 'bad.json', mimeType: 'application/json', buffer: Buffer.from('nope') });
  await page.waitForFunction(() => document.querySelector('#status').textContent.startsWith('Import failed'));
  eq(await total(page, '2026-10-21'), '$7.07', 'bad import changed nothing');
});

await scenario('keyboard: Enter opens popup, focus is trapped, Escape restores focus', async (page) => {
  await page.focus(`.fc-daygrid-day[data-date="${TODAY}"]`);
  await page.keyboard.press('Enter');
  eq(await page.evaluate(() => document.activeElement.id), 'name-input', 'focus in popup');
  for (let i = 0; i < 12; i++) {
    await page.keyboard.press('Tab');
    eq(await page.evaluate(() => !!document.activeElement.closest('.modal-content')), true, 'focus stays in popup');
  }
  await page.keyboard.press('Escape');
  eq(await page.locator('#entryModal').isHidden(), true, 'closed');
  eq(await page.evaluate(() => document.activeElement.getAttribute('data-date')), TODAY, 'focus restored');
  await page.keyboard.press('ArrowRight');
  eq(await page.evaluate(() => document.activeElement.getAttribute('data-date')), '2026-10-04', 'arrow moves');
});

await scenario('forecast: projections are dashed and separate, summary matches pace, red over threshold, refunds reduce pace', async (page) => {
  const cents = (t) => Math.round(parseFloat(t.replace(/[$,]/g, '')) * 100);
  let sum = 0;
  for (const d of ['2026-10-01', '2026-10-02', '2026-10-03']) {
    const t = await cell(page, d).locator('.total-display').allTextContents();
    if (t.length) sum += cents(t[0]);
  }
  const fmt = (c) => '$' + (Math.floor(c / 100)).toLocaleString('en-US') + '.' + String(c % 100).padStart(2, '0');
  eq(await page.locator('#forecast-summary').textContent(), 'At this pace: ' + fmt(Math.round(sum * 31 / 3)) + ' by October 31', 'demo summary');
  eq(await cell(page, '2026-10-10').locator('.projected-display').textContent(), '~' + fmt(Math.round(sum * 10 / 3)), 'day 10 projection');
  eq(await cell(page, '2026-10-10').locator('.total-display').count(), 0, 'no real total on projected day');
  eq(await cell(page, TODAY).locator('.projected-display').count(), 0, 'no projection on today');
  // Over threshold: add 20,000.00 today -> pace > $3,000/day -> red.
  await openDay(page, TODAY);
  await add(page, 'Big', '20000.00');
  await page.keyboard.press('Escape');
  eq(await page.locator('#forecast-summary').evaluate((e) => e.classList.contains('over')), true, 'red over threshold');
  // Refund drags pace back under.
  await openDay(page, TODAY);
  await add(page, 'Refund', '-20000.00');
  await page.keyboard.press('Escape');
  eq(await page.locator('#forecast-summary').evaluate((e) => e.classList.contains('over')), false, 'neutral after refund');
});

await scenario('forecast: no entries this month shows the prompt; refund-only month is negative', async (page) => {
  eq(await page.locator('#forecast-summary').textContent(), 'Add entries to see your forecast', 'empty prompt');
  eq(await page.locator('.projected-display').count(), 0, 'no projections');
  await openDay(page, TODAY);
  await add(page, 'Refund', '-30.00');
  await page.keyboard.press('Escape');
  eq(await page.locator('#forecast-summary').textContent(), 'At this pace: -$310.00 by October 31', 'refund pace');
  eq(await page.locator('#forecast-summary').evaluate((e) => e.classList.contains('over')), false, 'neutral');
}, { init: () => localStorage.setItem('veerjis-calendar', JSON.stringify({ version: 2, entries: {} })) });

await scenario('mobile viewport: no horizontal scroll, popup fits', async (page) => {
  eq(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true, 'page width');
  await openDay(page, TODAY);
  const box = await page.locator('.modal-content').boundingBox();
  eq(box.x >= 0 && box.x + box.width <= 375, true, 'popup within viewport');
}, { viewport: { width: 375, height: 667 } });

await browser.close();
console.log(failures ? `${failures} scenario(s) failed` : 'All scenarios passed');
process.exit(failures ? 1 : 0);
