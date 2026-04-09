/**
 * HR Market Watch — YachtWorld scraper
 * Runs daily via GitHub Actions, updates boats.json
 *
 * Usage: node scraper.js
 * Requires: node-fetch, cheerio (installed automatically by GitHub Action)
 */

const fs = require('fs');
const path = require('path');

// ── CONFIG ────────────────────────────────────────────────
const OUTPUT_FILE = path.join(__dirname, 'boats.json');
const SEARCH_URL  = 'https://www.yachtworld.com/boats-for-sale/type-sail/make-hallberg+rassy/?is_power=0';
const USER_AGENT  = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';
const DELAY_MS    = 2500; // polite delay between page requests

// ── HELPERS ───────────────────────────────────────────────
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function parsePrice(str) {
  if (!str) return null;
  const clean = str.replace(/[^0-9.]/g, '');
  const n = parseFloat(clean);
  return isNaN(n) ? null : Math.round(n);
}

function parseLength(str) {
  if (!str) return null;
  const m = str.match(/([\d.]+)\s*ft/i) || str.match(/([\d.]+)\s*m/i);
  if (!m) return null;
  let val = parseFloat(m[0]);
  if (str.toLowerCase().includes('m') && !str.toLowerCase().includes('ft')) val = Math.round(val * 3.281);
  return val;
}

function slugify(str) {
  return (str || '').toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
}

function normalizeStatus(raw) {
  if (!raw) return 'for-sale';
  const s = raw.toLowerCase();
  if (s.includes('sold')) return 'sold';
  if (s.includes('offer') || s.includes('contract') || s.includes('pending') || s.includes('under')) return 'under-offer';
  return 'for-sale';
}

// ── LOAD EXISTING DATA ────────────────────────────────────
function loadExisting() {
  try {
    if (fs.existsSync(OUTPUT_FILE)) {
      return JSON.parse(fs.readFileSync(OUTPUT_FILE, 'utf8'));
    }
  } catch (e) { console.warn('Could not load existing boats.json:', e.message); }
  return { last_updated: null, boats: [] };
}

// ── MERGE LOGIC ───────────────────────────────────────────
// Preserves price history, listed_date from previous runs
function mergeBoat(existing, fresh) {
  const merged = { ...existing, ...fresh };

  // Keep original listed_date (first time we saw it)
  if (existing.listed_date && !fresh.listed_date) {
    merged.listed_date = existing.listed_date;
  }

  // Track price changes
  const history = existing.price_history || [];
  const lastEntry = history[history.length - 1];
  if (fresh.price && (!lastEntry || lastEntry.price !== fresh.price)) {
    history.push({
      date: new Date().toISOString().split('T')[0],
      price: fresh.price,
      type: history.length === 0 ? 'listed' : (fresh.price < (lastEntry?.price || 0) ? 'reduction' : 'increase')
    });
  }
  merged.price_history = history;

  return merged;
}

// ── SCRAPE PAGE ───────────────────────────────────────────
async function scrapePage(fetch, cheerio, url) {
  console.log('Fetching:', url);
  const resp = await fetch(url, {
    headers: {
      'User-Agent': USER_AGENT,
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.5',
      'Accept-Encoding': 'gzip, deflate, br',
      'Connection': 'keep-alive',
    }
  });

  if (!resp.ok) {
    console.error('HTTP error:', resp.status, url);
    return [];
  }

  const html = await resp.text();
  const $ = cheerio.load(html);
  const boats = [];

  // YachtWorld listing cards — selectors as of 2025-2026
  // If scraper breaks, these selectors may need updating
  $('[class*="searchResultItem"], [class*="listing-card"], article[data-listing-id]').each((i, el) => {
    const $el = $(el);

    const listingId =
      $el.attr('data-listing-id') ||
      $el.find('[data-listing-id]').attr('data-listing-id') ||
      `yw-${Date.now()}-${i}`;

    const titleRaw =
      $el.find('[class*="make-model"], [class*="makeModel"], h2, h3').first().text().trim();

    const yearMatch = titleRaw.match(/\b(19|20)\d{2}\b/);
    const year = yearMatch ? parseInt(yearMatch[0]) : null;

    const model = titleRaw.replace(/\b(19|20)\d{2}\b/, '').replace(/hallberg.?rassy/i, '').trim() || 'Hallberg-Rassy';

    const priceRaw =
      $el.find('[class*="price"], [class*="Price"]').first().text().trim();
    const price = parsePrice(priceRaw);

    const location =
      $el.find('[class*="location"], [class*="Location"]').first().text().trim() || null;

    const lengthRaw =
      $el.find('[class*="length"], [class*="Length"]').first().text().trim();
    const length_ft = parseLength(lengthRaw);

    const imageUrl =
      $el.find('img').first().attr('src') ||
      $el.find('img').first().attr('data-src') || '';

    const listingHref =
      $el.find('a[href*="/boats-for-sale/"]').first().attr('href') || '';
    const listingUrl = listingHref.startsWith('http')
      ? listingHref
      : 'https://www.yachtworld.com' + listingHref;

    const statusRaw =
      $el.find('[class*="status"], [class*="Status"]').first().text().trim() || '';

    const brokerRaw =
      $el.find('[class*="broker"], [class*="dealer"], [class*="seller"]').first().text().trim() || '';
    const isPrivate = brokerRaw.toLowerCase().includes('private') || brokerRaw === '';

    if (!price && !titleRaw) return; // skip empty cards

    boats.push({
      id: `yw-${listingId}`,
      model: `Hallberg-Rassy ${model}`.replace(/\s+/g, ' ').trim(),
      year,
      length_ft,
      price,
      location: location || null,
      flag: null,
      status: normalizeStatus(statusRaw),
      listed_date: new Date().toISOString().split('T')[0], // will be overwritten by merge if already known
      broker: isPrivate ? null : (brokerRaw || null),
      private_sale: isPrivate,
      engine: null,
      hull: 'Fiberglass',
      listing_url: listingUrl || null,
      image_url: imageUrl || null,
      price_history: []
    });
  });

  return boats;
}

// ── PAGINATION ────────────────────────────────────────────
async function scrapeAllPages(fetch, cheerio) {
  const allBoats = [];
  let page = 1;
  const maxPages = 10; // safety cap

  while (page <= maxPages) {
    const url = page === 1 ? SEARCH_URL : `${SEARCH_URL}&page=${page}`;
    const boats = await scrapePage(fetch, cheerio, url);

    if (boats.length === 0) {
      console.log(`No boats on page ${page}, stopping.`);
      break;
    }

    allBoats.push(...boats);
    console.log(`Page ${page}: found ${boats.length} listings (total: ${allBoats.length})`);

    page++;
    await sleep(DELAY_MS);
  }

  return allBoats;
}

// ── MAIN ──────────────────────────────────────────────────
async function main() {
  console.log('=== HR Market Watch Scraper ===');
  console.log('Starting at', new Date().toISOString());

  // Dynamic imports (ESM-compatible node-fetch + cheerio)
  let fetch, cheerio;
  try {
    fetch = (await import('node-fetch')).default;
    cheerio = await import('cheerio');
  } catch (e) {
    console.error('Missing dependencies. Run: npm install node-fetch cheerio');
    process.exit(1);
  }

  const existing = loadExisting();
  const existingMap = {};
  (existing.boats || []).forEach(b => { existingMap[b.id] = b; });

  let freshBoats = [];
  try {
    freshBoats = await scrapeAllPages(fetch, cheerio);
  } catch (e) {
    console.error('Scrape failed:', e.message);
    // If scrape fails completely, preserve existing data
    console.log('Preserving existing data.');
    existing.last_updated = new Date().toISOString();
    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(existing, null, 2));
    process.exit(0);
  }

  // Merge fresh data with existing
  const freshMap = {};
  freshBoats.forEach(b => { freshMap[b.id] = b; });

  // Update existing boats with fresh data
  const mergedBoats = [];
  const seenIds = new Set();

  freshBoats.forEach(fresh => {
    const prev = existingMap[fresh.id];
    mergedBoats.push(prev ? mergeBoat(prev, fresh) : {
      ...fresh,
      price_history: fresh.price ? [{ date: fresh.listed_date, price: fresh.price, type: 'listed' }] : []
    });
    seenIds.add(fresh.id);
  });

  // Mark boats no longer appearing as sold/off-market
  (existing.boats || []).forEach(prev => {
    if (!seenIds.has(prev.id) && prev.status === 'for-sale') {
      console.log(`Boat no longer listed: ${prev.model} (${prev.id}) — marking as off-market`);
      mergedBoats.push({ ...prev, status: 'sold' });
    } else if (!seenIds.has(prev.id)) {
      mergedBoats.push(prev); // keep sold/under-offer boats as-is
    }
  });

  const output = {
    last_updated: new Date().toISOString(),
    total: mergedBoats.length,
    boats: mergedBoats
  };

  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(output, null, 2));
  console.log(`\nDone. ${mergedBoats.length} boats saved to boats.json`);
  console.log(`  For sale: ${mergedBoats.filter(b => b.status === 'for-sale').length}`);
  console.log(`  Under offer: ${mergedBoats.filter(b => b.status === 'under-offer').length}`);
  console.log(`  Sold/off-market: ${mergedBoats.filter(b => b.status === 'sold').length}`);
}

main().catch(e => {
  console.error('Fatal error:', e);
  process.exit(1);
});
