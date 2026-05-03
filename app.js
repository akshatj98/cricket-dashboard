// Sample articles shown immediately while live feeds load (or if all feeds fail)
const SAMPLE_ARTICLES = [
  { id:'s1', title:'Rohit Sharma leads India to dominant Test series victory', description:'India clinched the series 3-1 after a commanding performance in the final Test, with Rohit Sharma leading from the front with a brilliant century.', link:'#', pubDate: new Date(Date.now()-3600000).toISOString(), image:'', source:'BBC Sport',    team:'india',   format:'test' },
  { id:'s2', title:'Ben Stokes inspires England fightback in second ODI',       description:'England captain Ben Stokes played a match-winning knock of 87 as the hosts staged a dramatic comeback to level the series.', link:'#', pubDate: new Date(Date.now()-7200000).toISOString(), image:'', source:'BBC Sport',    team:'england', format:'odi'  },
  { id:'s3', title:'Jasprit Bumrah takes five-wicket haul in T20 thriller',     description:'Bumrah was unplayable on a tricky Wankhede surface, finishing with 5/19 as India bowled out Australia for 112.', link:'#', pubDate: new Date(Date.now()-10800000).toISOString(), image:'', source:'Cricinfo',   team:'india',   format:'t20'  },
  { id:'s4', title:'IPL 2025: Mumbai Indians pip CSK in last-over finish',      description:'A last-ball six from Hardik Pandya sealed a nail-biting victory for MI, extending their winning streak to four games.', link:'#', pubDate: new Date(Date.now()-14400000).toISOString(), image:'', source:'Google News', team:'india',   format:'ipl'  },
  { id:'s5', title:'Root surpasses Tendulkar\'s run tally in historic Ashes Test', description:'Joe Root became the highest run-scorer in Test cricket history, passing Sachin Tendulkar\'s record of 15,921 runs.', link:'#', pubDate: new Date(Date.now()-18000000).toISOString(), image:'', source:'BBC Sport',   team:'england', format:'test' },
  { id:'s6', title:'Shubman Gill century guides India to series lead',           description:'An elegant 134 from Shubman Gill anchored India\'s total as they posted 342 in the first ODI at Headingley.', link:'#', pubDate: new Date(Date.now()-21600000).toISOString(), image:'', source:'Cricinfo',   team:'both',    format:'odi'  },
];

// CORS proxies — tried in order until one succeeds per feed
const PROXIES = [
  url => `https://api.rss2json.com/v1/api.json?count=30&rss_url=${encodeURIComponent(url)}`,
  url => `https://api.allorigins.win/get?url=${encodeURIComponent(url)}`,
];

const FEEDS = [
  { url: 'https://feeds.bbci.co.uk/sport/cricket/rss.xml',                                         source: 'BBC Sport'    },
  { url: 'https://news.google.com/rss/search?q=india+cricket&hl=en-IN&gl=IN&ceid=IN:en',           source: 'Google News'  },
  { url: 'https://news.google.com/rss/search?q=england+cricket&hl=en-GB&gl=GB&ceid=GB:en',         source: 'Google News'  },
  { url: 'https://news.google.com/rss/search?q=IPL+2025&hl=en-IN&gl=IN&ceid=IN:en',               source: 'Google News'  },
  { url: 'https://news.google.com/rss/search?q=cricket+espncricinfo&hl=en-IN&gl=IN&ceid=IN:en',    source: 'Cricinfo'     },
];

const INDIA_KW   = ['india','indian','bcci','virat','rohit','bumrah','kohli','dhoni','shami','jadeja','iyer','gill','hardik','rahul','ashwin','siraj'];
const ENGLAND_KW = ['england','english','ecb','root','stokes','bairstow','anderson','broad','archer','wood','atkinson','duckett','crawley','foakes','buttler'];
const TEST_KW    = ['test match','test cricket','test series','ashes','first test','second test','third test','fourth test','fifth test'];
const ODI_KW     = ['odi','one day','one-day','world cup','50 over','50-over','cwc'];
const T20_KW     = ['t20','t-20','twenty20','twenty-20','it20','blast'];
const IPL_KW     = ['ipl','indian premier league','csk','mi ','mumbai indians','chennai super kings','rcb','royal challengers','kkr','kolkata','srh','sunrisers','delhi capitals','pbks','punjab kings','rr ','rajasthan royals','lsg','lucknow','gujarat titans'];

// ── State ────────────────────────────────────────────────────
let allArticles = [];
let savedIds    = new Set(JSON.parse(localStorage.getItem('cricket_saved') || '[]'));
let readIds     = new Set(JSON.parse(localStorage.getItem('cricket_read')  || '[]'));
let activeTeam   = 'all';
let activeFormat = 'all';
let searchQuery  = '';

// ── Init ─────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  setupListeners();
  loadFeeds();
  setInterval(loadFeeds, 5 * 60 * 1000);
});

function setupListeners() {
  document.getElementById('refreshBtn').addEventListener('click', loadFeeds);

  document.getElementById('teamFilters').addEventListener('click', e => {
    const btn = e.target.closest('[data-team]');
    if (!btn) return;
    activeTeam = btn.dataset.team;
    document.querySelectorAll('#teamFilters .filter-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    renderGrid();
  });

  document.getElementById('formatFilters').addEventListener('click', e => {
    const btn = e.target.closest('[data-format]');
    if (!btn) return;
    activeFormat = btn.dataset.format;
    document.querySelectorAll('#formatFilters .filter-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    renderGrid();
  });

  document.getElementById('searchInput').addEventListener('input', e => {
    searchQuery = e.target.value.toLowerCase().trim();
    renderGrid();
  });
}

// ── Data loading ──────────────────────────────────────────────
async function loadFeeds() {
  // Show sample data immediately so the UI is never blank
  if (allArticles.length === 0) {
    allArticles = SAMPLE_ARTICLES.map(a => ({ ...a, isSample: true }));
    setLoading(false);
    renderGrid();
    updateStats();
  }

  setLoading(true);
  hideError();

  // Stagger requests 400ms apart to avoid rate-limiting on free proxies
  const results = [];
  for (let i = 0; i < FEEDS.length; i++) {
    if (i > 0) await delay(400);
    results.push(fetchFeedWithFallback(FEEDS[i]));
  }
  const settled = await Promise.allSettled(results);

  const articles  = [];
  const seenTitles = new Set();
  let successCount = 0;

  for (const result of settled) {
    if (result.status === 'fulfilled' && result.value.length > 0) {
      successCount++;
      for (const article of result.value) {
        const key = article.title.toLowerCase().slice(0, 60);
        if (!seenTitles.has(key)) {
          seenTitles.add(key);
          articles.push(article);
        }
      }
    }
  }

  articles.sort((a, b) => new Date(b.pubDate) - new Date(a.pubDate));
  allArticles = articles;

  setLoading(false);
  updateLastUpdated();

  if (successCount === 0) {
    // Restore sample data so the UI isn't empty
    allArticles = SAMPLE_ARTICLES.map(a => ({ ...a, isSample: true }));
    showError('Live feeds could not load (network or CORS issue). Showing sample data. Deploy to GitHub Pages for full live news.');
  } else {
    hideError();
  }
  renderGrid();
  updateStats();
}

async function fetchFeedWithFallback({ url, source }) {
  // 1. corsproxy.io — returns raw response with CORS headers, most reliable
  try {
    const items = await fetchViaCorsproxy(url, source);
    if (items.length > 0) return items;
  } catch (e) { /* fall through */ }

  // 2. allorigins.win — wraps response in JSON {contents: "..."}
  try {
    const items = await fetchViaAllOrigins(url, source);
    if (items.length > 0) return items;
  } catch (e) { /* fall through */ }

  // 3. rss2json.com — free tier, rate-limited but useful as last resort
  try {
    const items = await fetchViaRss2Json(url, source);
    if (items.length > 0) return items;
  } catch (e) { /* fall through */ }

  return [];
}

async function fetchViaCorsproxy(url, source) {
  const res = await fetchWithTimeout(`https://corsproxy.io/?url=${encodeURIComponent(url)}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const xml = await res.text();
  return parseRawXml(xml, source);
}

async function fetchViaAllOrigins(url, source) {
  const res = await fetchWithTimeout(`https://api.allorigins.win/get?url=${encodeURIComponent(url)}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  if (!data.contents) throw new Error('No contents');
  return parseRawXml(data.contents, source);
}

async function fetchViaRss2Json(url, source) {
  const res = await fetchWithTimeout(`https://api.rss2json.com/v1/api.json?count=30&rss_url=${encodeURIComponent(url)}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  if (data.status !== 'ok' || !data.items?.length) throw new Error('No items');
  return data.items.map(item => parseRss2JsonItem(item, source));
}

function parseRss2JsonItem(item, source) {
  return {
    id:          safeB64(item.link || item.title),
    title:       stripHtml(item.title || ''),
    description: stripHtml(item.description || item.content || ''),
    link:        item.link || '#',
    pubDate:     item.pubDate,
    image:       item.thumbnail || item.enclosure?.link || extractImage(item.description) || '',
    source,
    team:        detectTeam(`${item.title} ${item.description || ''}`),
    format:      detectFormat(`${item.title} ${item.description || ''}`),
  };
}

function parseRawXml(xmlStr, source) {
  const doc   = new DOMParser().parseFromString(xmlStr, 'text/xml');
  const items = Array.from(doc.querySelectorAll('item'));
  return items.slice(0, 30).map(el => {
    const title = el.querySelector('title')?.textContent || '';
    const desc  = el.querySelector('description')?.textContent || '';
    const link  = el.querySelector('link')?.textContent || el.querySelector('guid')?.textContent || '#';
    const date  = el.querySelector('pubDate')?.textContent || '';
    const enc   = el.querySelector('enclosure')?.getAttribute('url') || '';
    return {
      id:          safeB64(link || title),
      title:       stripHtml(title),
      description: stripHtml(desc),
      link,
      pubDate:     date,
      image:       enc || extractImage(desc),
      source,
      team:        detectTeam(`${title} ${desc}`),
      format:      detectFormat(`${title} ${desc}`),
    };
  });
}

function fetchWithTimeout(url, ms = 10000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  return fetch(url, { signal: controller.signal }).finally(() => clearTimeout(timer));
}

// ── Detection ─────────────────────────────────────────────────
function detectTeam(text) {
  const t = text.toLowerCase();
  const isIn = INDIA_KW.some(k => t.includes(k));
  const isEn = ENGLAND_KW.some(k => t.includes(k));
  if (isIn && isEn) return 'both';
  if (isIn)  return 'india';
  if (isEn)  return 'england';
  return 'other';
}

function detectFormat(text) {
  const t = text.toLowerCase();
  if (IPL_KW.some(k => t.includes(k)))  return 'ipl';
  if (TEST_KW.some(k => t.includes(k))) return 'test';
  if (ODI_KW.some(k => t.includes(k)))  return 'odi';
  if (T20_KW.some(k => t.includes(k)))  return 't20';
  return 'other';
}

// ── Filtering ─────────────────────────────────────────────────
function getFilteredArticles() {
  return allArticles.filter(a => {
    if (activeTeam === 'saved'   && !savedIds.has(a.id)) return false;
    if (activeTeam === 'india'   && a.team !== 'india'   && a.team !== 'both') return false;
    if (activeTeam === 'england' && a.team !== 'england' && a.team !== 'both') return false;
    if (activeFormat !== 'all'   && a.format !== activeFormat) return false;
    if (searchQuery) {
      const hay = (a.title + ' ' + a.description).toLowerCase();
      if (!hay.includes(searchQuery)) return false;
    }
    return true;
  });
}

// ── Rendering ─────────────────────────────────────────────────
function renderGrid() {
  const grid     = document.getElementById('newsGrid');
  const emptyEl  = document.getElementById('emptyState');
  const filtered = getFilteredArticles();

  grid.innerHTML = '';

  if (filtered.length === 0) {
    emptyEl.classList.remove('hidden');
    return;
  }
  emptyEl.classList.add('hidden');

  const template = document.getElementById('cardTemplate');
  const fragment = document.createDocumentFragment();

  for (const a of filtered) {
    const clone = template.content.cloneNode(true);
    const card  = clone.querySelector('.news-card');

    if (a.team === 'india')   card.classList.add('team-india');
    if (a.team === 'england') card.classList.add('team-england');
    if (a.team === 'both')    card.classList.add('team-both');
    if (savedIds.has(a.id))   card.classList.add('is-saved');
    if (readIds.has(a.id))    card.classList.add('is-read');
    card.dataset.id = a.id;

    const badge = clone.querySelector('.source-badge');
    badge.textContent = a.isSample ? '📋 DEMO' : a.source;
    if (a.isSample) badge.style.cssText = 'background:#1a2a1a;color:#4ade80;border:1px solid #4ade80';

    const teamTag = clone.querySelector('.team-tag');
    if (a.team === 'india')        { teamTag.textContent = '🇮🇳 India';    teamTag.classList.add('india-tag');   }
    else if (a.team === 'england') { teamTag.textContent = '🏴󠁧󠁢󠁥󠁮󠁧󠁿 England';  teamTag.classList.add('england-tag'); }
    else if (a.team === 'both')    { teamTag.textContent = '🌍 Both';      teamTag.classList.add('india-tag');   }

    const formatTag = clone.querySelector('.format-tag');
    if (a.format !== 'other') {
      formatTag.textContent = a.format.toUpperCase();
      formatTag.classList.add(`${a.format}-tag`, 'visible');
    }

    const imgWrap = clone.querySelector('.card-image-wrap');
    const img     = clone.querySelector('.card-image');
    if (a.image) {
      img.src = a.image;
      img.alt = a.title;
      img.onerror = () => imgWrap.classList.add('no-image');
    } else {
      imgWrap.classList.add('no-image');
    }

    clone.querySelector('.card-title').textContent       = a.title;
    clone.querySelector('.card-description').textContent = a.description.slice(0, 160);
    clone.querySelector('.card-time').textContent        = timeAgo(a.pubDate);
    clone.querySelector('.card-link').href               = a.link;

    const saveBtn = clone.querySelector('.save-btn');
    if (savedIds.has(a.id)) saveBtn.classList.add('active');
    saveBtn.addEventListener('click', () => toggleSave(a.id));

    const readBtn = clone.querySelector('.read-btn');
    if (readIds.has(a.id)) readBtn.classList.add('active');
    readBtn.addEventListener('click', () => toggleRead(a.id));

    clone.querySelector('.card-link').addEventListener('click', () => markRead(a.id));

    fragment.appendChild(clone);
  }

  grid.appendChild(fragment);
}

// ── Actions ───────────────────────────────────────────────────
function toggleSave(id) {
  savedIds.has(id) ? savedIds.delete(id) : savedIds.add(id);
  persistSets();
  renderGrid();
  updateStats();
}

function toggleRead(id) {
  readIds.has(id) ? readIds.delete(id) : readIds.add(id);
  persistSets();
  renderGrid();
  updateStats();
}

function markRead(id) {
  readIds.add(id);
  persistSets();
}

function persistSets() {
  localStorage.setItem('cricket_saved', JSON.stringify([...savedIds]));
  localStorage.setItem('cricket_read',  JSON.stringify([...readIds]));
}

// ── UI helpers ────────────────────────────────────────────────
function setLoading(on) {
  document.getElementById('loadingState').classList.toggle('hidden', !on);
  document.getElementById('newsGrid').classList.toggle('hidden', on);
  document.getElementById('refreshIcon').classList.toggle('spinning', on);
}

function showError(msg) {
  const el = document.getElementById('errorState');
  el.querySelector('.error-text').textContent = msg;
  el.classList.remove('hidden');
}
function hideError() {
  document.getElementById('errorState').classList.add('hidden');
}

function updateLastUpdated() {
  const now = new Date();
  document.getElementById('lastUpdated').textContent =
    `Last updated: ${now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
}

function updateStats() {
  document.getElementById('statTotal').textContent   = allArticles.length;
  document.getElementById('statIndia').textContent   = allArticles.filter(a => a.team === 'india'   || a.team === 'both').length;
  document.getElementById('statEngland').textContent = allArticles.filter(a => a.team === 'england' || a.team === 'both').length;
  document.getElementById('statSaved').textContent   = savedIds.size;
  document.getElementById('statRead').textContent    = readIds.size;
}

function timeAgo(dateStr) {
  if (!dateStr) return '';
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1)  return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24)  return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function stripHtml(html) {
  return html.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
             .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').trim();
}

function extractImage(html) {
  if (!html) return '';
  const m = html.match(/<img[^>]+src=["']([^"']+)["']/i);
  return m ? m[1] : '';
}

function safeB64(str) {
  try { return btoa(unescape(encodeURIComponent(str))).slice(0, 32); }
  catch { return Math.random().toString(36).slice(2); }
}

function delay(ms) {
  return new Promise(r => setTimeout(r, ms));
}
