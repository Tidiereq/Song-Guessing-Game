const state = {
  audio: new Audio(),
  maxListenTime: 0.5,
  track: null,
  loading: false,
  locked: false,
  genre: 'all',
  lastRandomGenre: null,
  currentPlaylist: null,
  sessionPool: []
};

const els = {
  maxTime: document.getElementById('maxTime'),
  status: document.getElementById('status'),
  guessInput: document.getElementById('guessInput'),
  suggestions: document.getElementById('suggestions'),
  guessBtn: document.getElementById('guessBtn'),
  revealBtn: document.getElementById('revealBtn'),
  nextBtn: document.getElementById('nextBtn'),
  result: document.getElementById('result'),
  cover: document.getElementById('cover'),
  title: document.getElementById('title'),
  artist: document.getElementById('artist'),
  link: document.getElementById('link'),
  timelineBar: document.getElementById('timelineBar'),
  timelineUnlocked: document.getElementById('timelineUnlocked'),
  timelinePlayhead: document.getElementById('timelinePlayhead'),
  timelineTicks: document.getElementById('timelineTicks'),
  timelinePointer: document.getElementById('timelinePointer'),
  timelineSeconds: document.getElementById('timelineSeconds'),
  bigPlayBtn: document.getElementById('bigPlayBtn'),
  skipBtn: document.getElementById('skipBtn'),
  timeDisplay: document.getElementById('timeDisplay'),
  revealModal: document.getElementById('revealModal'),
  modalCover: document.getElementById('modalCover'),
  modalTitle: document.getElementById('modalTitle'),
  modalArtist: document.getElementById('modalArtist'),
  modalLink: document.getElementById('modalLink'),
  modalNext: document.getElementById('modalNext')
};

function setStatus(text, tone = 'info') {
  els.status.textContent = text;
  els.status.classList.remove('success', 'warn', 'info');
  els.status.classList.add(tone);
}

function updateMaxTime() {
  els.maxTime.textContent = state.maxListenTime.toFixed(1).replace('.', ',');
  updateTimeline();
}

function randomTerm() {
  const letters = 'abcdefghijklmnopqrstuvwxyz';
  const letter = letters[Math.floor(Math.random() * letters.length)];
  return letter;
}

function randomCountry() {
  const list = ['us','pl'];
  return list[Math.floor(Math.random() * list.length)];
}

function popularCountries() {
  return ['us','gb','ca','au','nz','ie','pl'];
}

function playlistSeedsForGenre(g) {
  const m = {
    pop: ["Today's Hits","A-List Pop","Pop Hits","Top Pop","Best Pop","Pop Rising","New Pop","Global Pop","Pop Essentials","Fresh Pop"],
    hiphop: ["Rap Life","Hip-Hop Hits","A-List Hip-Hop","Today's Hip-Hop","Hip-Hop Essentials","New Hip-Hop","Global Hip-Hop","Trap","Rap Anthems","Hip-Hop Bangers"],
    rock: ["Rock Classics","A-List Rock","Rock Hits","New Rock","Modern Rock","Alternative Rock","Indie Rock","Global Rock","Rock Anthems","Best Rock"],
    dance: ["Dance Hits","Top Dance","Club Dance","Dance Party","Dance Essentials","Dancefloor","Global Dance","EDM Dance","Dance Pop","Fresh Dance"],
    electronic: ["EDM Hits","A-List Electronic","New Electronic","Global Electronic","Electro House","Techno","Trance","Bass Music","Electronica","Electronic Focus"],
    alternative: ["Alternative Hits","A-List Alternative","Indie Hits","Indie Essentials","Modern Alternative","New Alternative","Indie Pop","Global Alternative","Alt Anthems","Alternative Focus"],
    rnb: ["R&B Now","A-List R&B","R&B Hits","New R&B","Soul Hits","Modern R&B","Smooth R&B","Global R&B","R&B Essentials","Contemporary R&B"]
  };
  return m[g] || m.pop;
}
function randomGenre() {
  const weighted = [
    'pop','pop','pop',
    'hiphop','hiphop','hiphop',
    'rock','rock','rock',
    'rnb','rnb',
    'alternative','alternative',
    'dance',
    'electronic'
  ];
  let pick = weighted[Math.floor(Math.random() * weighted.length)];
  if (state.lastRandomGenre && weighted.length > 1 && pick === state.lastRandomGenre) {
    const alt = weighted.filter(g => g !== state.lastRandomGenre);
    pick = alt[Math.floor(Math.random() * alt.length)];
  }
  state.lastRandomGenre = pick;
  return pick;
}
function idOfSong(it) {
  const a = it.trackId;
  const b = (it.trackName || '') + '|' + (it.artistName || '');
  return String(a || b);
}

function formatTime(sec) {
  const s = Math.floor(sec % 60).toString().padStart(2, '0');
  const m = Math.floor(sec / 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const t = arr[i];
    arr[i] = arr[j];
    arr[j] = t;
  }
  return arr;
}
function loadRecentIds() {
  try {
    const raw = localStorage.getItem('recentIds') || '[]';
    const arr = JSON.parse(raw);
    if (Array.isArray(arr)) {
      state.recentIds = arr.slice(0, 200);
    }
  } catch {
    state.recentIds = [];
  }
}
function saveRecentIds() {
  try {
    localStorage.setItem('recentIds', JSON.stringify(state.recentIds || []));
  } catch {}
}
function escapeReg(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
function highlight(text, query) {
  const tokens = String(query || '').trim().split(/\s+/).filter(Boolean);
  if (!tokens.length) return text;
  const re = new RegExp(tokens.map(escapeReg).join('|'), 'ig');
  return String(text || '').replace(re, m => `<mark>${m}</mark>`);
}
function holidayLike(s) {
  if (!s) return false;
  return /christmas|xmas|holiday|noel|navidad|weihnachts|jul/i.test(s);
}
function scoreText(a, b) {
  const A = tokenSet(a);
  const B = tokenSet(b);
  let inter = 0;
  for (const x of A) if (B.has(x)) inter++;
  const union = A.size + B.size - inter;
  return union ? inter / union : 0;
}
let selectedIndex = -1;
async function fetchSuggestions(q) {
  if (!q || q.trim().length < 2) {
    els.suggestions.innerHTML = '';
    return;
  }
  const url = `https://itunes.apple.com/search?term=${encodeURIComponent(q)}&media=music&entity=song&limit=8`;
  try {
    const res = await fetch(url);
    const data = await res.json();
    let results = (data.results || []).filter(r => r.trackName && r.artistName);
    results = results.filter(r => !(String(r.primaryGenreName || '').toLowerCase().includes('holiday') || holidayLike(r.trackName) || holidayLike(r.collectionName)));
    if (state.genre !== 'all') {
      const g = state.genre;
      results = results.filter(r => matchGenre(String(r.primaryGenreName || ''), g));
    }
    renderSuggestions(results, q);
  } catch {
    els.suggestions.innerHTML = '';
  }
}
function renderSuggestions(items, q) {
  if (!items.length) {
    els.suggestions.innerHTML = '';
    return;
  }
  const ranked = items.map(it => {
    const s = Math.max(
      scoreText(it.trackName || '', q || ''),
      scoreText(it.artistName || '', q || '')
    );
    return { it, s };
  }).sort((a, b) => b.s - a.s);
  const html = `
    <div class="list">
      ${ranked.map(({it}, idx) => `
        <div class="suggestion-item ${idx===0?'active':''}" data-title="${it.trackName}" data-artist="${it.artistName}">
          <div class="suggestion-cover" style="background-image:url('${it.artworkUrl60 || it.artworkUrl100 || ''}')"></div>
          <div class="suggestion-text">
            <div class="title">${highlight(it.trackName, q)}</div>
            <div class="artist">${highlight(it.artistName, q)}</div>
          </div>
        </div>
      `).join('')}
    </div>
  `;
  els.suggestions.innerHTML = html;
  const nodes = Array.from(els.suggestions.querySelectorAll('.suggestion-item'));
  selectedIndex = nodes.length ? 0 : -1;
  nodes.forEach((el, i) => {
    el.addEventListener('click', () => {
      const t = el.getAttribute('data-title') || '';
      const a = el.getAttribute('data-artist') || '';
      els.guessInput.value = `${t} - ${a}`;
      els.suggestions.innerHTML = '';
      const val = els.guessInput.value;
      if (val.trim()) {
        const ok = checkGuess(val);
        if (ok) {
          setStatus('Brawo! Trafione!', 'success');
          showResult();
          triggerWinAnimation();
          showRevealModal();
          lockAndAutoplay();
        } else {
          setStatus('Nie trafione. Dodaj kolejne 5 s lub wybierz sugestię z listy.', 'warn');
        }
      }
    });
    el.addEventListener('mouseenter', () => {
      nodes.forEach(n => n.classList.remove('active'));
      el.classList.add('active');
      selectedIndex = i;
    });
  });
}
function debounce(fn, ms) {
  let t = 0;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}
const debouncedSuggest = debounce(fetchSuggestions, 200);

function enableControls() {
  state.locked = false;
  els.guessInput.disabled = false;
  els.guessBtn.disabled = false;
  els.skipBtn.disabled = false;
  els.bigPlayBtn.disabled = false;
  els.revealBtn.disabled = false;
}
function lockAndAutoplay() {
  state.locked = true;
  els.guessInput.disabled = true;
  els.guessBtn.disabled = true;
  els.skipBtn.disabled = true;
  els.bigPlayBtn.disabled = true;
  els.revealBtn.disabled = true;
  els.suggestions.innerHTML = '';
  state.maxListenTime = 30;
  updateMaxTime();
  setStatus('Utwór ujawniony — kliknij „Nowa piosenka”, aby kontynuować.', 'info');
  try {
    state.audio.currentTime = 0;
    state.audio.play().catch(() => {});
  } catch {}
}

async function fetchRandomTrack() {
  state.loading = true;
  setStatus('Ładowanie piosenki…');
  state.maxListenTime = 0.5;
  updateMaxTime();
  els.result.style.display = 'none';
  try {
    const ok = await tryRandomTrack();
    if (ok) {
      setStatus('Gotowe. Kliknij przycisk Play.', 'info');
      enableControls();
    } else {
      setStatus('Problem z pobraniem. Spróbuj ponownie.', 'warn');
    }
  } catch (e) {
    setStatus('Problem z pobraniem. Spróbuj ponownie.', 'warn');
  } finally {
    state.loading = false;
    updateTimeline(true);
  }
}

async function tryRandomTrack() {
  const g = state.genre === 'all' ? randomGenre() : state.genre;
  const steps = [
    async () => { await fetchFromSinglePlaylist(g, 60); },
    async () => { await fetchFromPlaylists(g, 10, 50); },
    async () => { await fetchFromPlaylists(g, 15, 60); },
    async () => { await fetchPopularAggregate(popularCountries(), 200); },
    async () => { await fetchPopularTrack(randomCountry(), 200); }
  ];
  for (const s of steps) {
    try {
      await s();
      return true;
    } catch {}
  }
  return false;
}

function pickSeedAndCountry(genre) {
  const seeds = playlistSeedsForGenre(genre);
  const seed = seeds[Math.floor(Math.random() * seeds.length)];
  const countries = popularCountries();
  const country = countries[Math.floor(Math.random() * countries.length)];
  return { seed, country };
}
async function fetchFromSinglePlaylist(genre, perLimit = 60) {
  const { seed, country } = pickSeedAndCountry(genre);
  const url = `https://itunes.apple.com/search?term=${encodeURIComponent(seed)}&media=music&entity=song&limit=${perLimit}&country=${encodeURIComponent(country)}`;
  const res = await fetch(url);
  const data = await res.json();
  let items = (data.results || []).filter(x => x.previewUrl && x.trackName && x.artistName);
  items = items.filter(r => !(String(r.primaryGenreName || '').toLowerCase().includes('holiday') || holidayLike(r.trackName) || holidayLike(r.collectionName)));
  if (genre !== 'all') {
    items = items.filter(r => matchGenre(String(r.primaryGenreName || ''), genre));
  }
  const seen = new Set();
  const deduped = [];
  for (const it of items) {
    const id = idOfSong(it);
    if (!seen.has(id)) {
      seen.add(id);
      deduped.push(it);
    }
  }
  loadRecentIds();
  let available = deduped.map(idOfSong).filter(id => !(state.recentIds || []).includes(id));
  if (!state.sessionPool || state.sessionPool.length === 0) {
    state.sessionPool = shuffle(available.slice());
    if (!state.sessionPool.length) {
      state.recentIds = [];
      saveRecentIds();
      available = deduped.map(idOfSong);
      state.sessionPool = shuffle(available.slice());
    }
  }
  if (!deduped.length || !state.sessionPool.length) throw new Error('Brak popularnych utworów z podglądem');
  const pickId = state.sessionPool.pop();
  const pick = deduped.find(it => idOfSong(it) === pickId) || deduped[Math.floor(Math.random() * deduped.length)];
  state.recentIds.push(pickId);
  if (state.recentIds.length > 200) state.recentIds.shift();
  saveRecentIds();
  state.currentPlaylist = { name: seed, country };
  state.track = {
    previewUrl: pick.previewUrl || '',
    trackName: pick.trackName || '',
    artistName: pick.artistName || '',
    artwork: pick.artworkUrl100 || pick.artworkUrl60 || '',
    trackViewUrl: pick.trackViewUrl || pick.collectionViewUrl || ''
  };
  if (!state.track.previewUrl) throw new Error('Brak preview URL');
  state.audio.src = state.track.previewUrl;
  state.audio.pause();
  state.audio.currentTime = 0;
  updateTimeline(true);
}

async function fetchPopularTrack(country = 'pl', limit = 200) {
  const url = `https://itunes.apple.com/WebObjects/MZStoreServices.woa/ws/RSS/topsongs/limit=${limit}/json?cc=${encodeURIComponent(country)}`;
  const res = await fetch(url);
  const data = await res.json();
  const feed = data.feed || {};
  let entries = feed.entry || [];
  if (!Array.isArray(entries)) entries = [entries];
  const withPreview = entries.filter(e => {
    const links = e.link || [];
    const arr = Array.isArray(links) ? links : [links];
    return arr.some(l => l.attributes && l.attributes.rel === 'enclosure' && String(l.attributes.type || '').startsWith('audio'));
  });
  const notHoliday = withPreview.filter(e => {
    const cat = e.category && e.category.attributes ? (e.category.attributes.label || e.category.attributes.term || '') : '';
    const name = e['im:name']?.label || '';
    const coll = e['im:collection']?.['im:name']?.label || '';
    return !(holidayLike(cat) || holidayLike(name) || holidayLike(coll));
  });
  let pool = notHoliday.length ? notHoliday : withPreview;
  if (state.genre !== 'all') {
    pool = pool.filter(e => {
      const cat = e.category && e.category.attributes ? (e.category.attributes.label || e.category.attributes.term || '') : '';
      return matchGenre(cat, state.genre);
    });
    if (!pool.length) pool = notHoliday.length ? notHoliday : withPreview;
  }
  const idOf = (e) => {
    const a = e.id && e.id.attributes && e.id.attributes['im:id'];
    const b = e.id && e.id.label;
    const c = (e['im:name']?.label || '') + '|' + (e['im:artist']?.label || '');
    return String(a || b || c);
  };
  if (!state.recentIds) state.recentIds = [];
  let candidates = pool.filter(e => !state.recentIds.includes(idOf(e)));
  if (!candidates.length) {
    state.recentIds = [];
    candidates = pool.slice();
  }
  if (!pool.length) throw new Error('Brak popularnych utworów z podglądem');
  const pick = candidates[Math.floor(Math.random() * candidates.length)];
  const pickId = idOf(pick);
  state.recentIds.push(pickId);
  if (state.recentIds.length > 12) state.recentIds.shift();
  const links = Array.isArray(pick.link) ? pick.link : [pick.link];
  const preview = links.find(l => l.attributes && l.attributes.rel === 'enclosure');
  const page = links.find(l => l.attributes && l.attributes.rel === 'alternate' && l.attributes.type === 'text/html');
  const images = Array.isArray(pick['im:image']) ? pick['im:image'] : [pick['im:image']];
  const artwork = images.length ? images[images.length - 1].label : '';
  state.track = {
    previewUrl: preview?.attributes?.href || '',
    trackName: pick['im:name']?.label || '',
    artistName: pick['im:artist']?.label || '',
    artwork,
    trackViewUrl: page?.attributes?.href || ''
  };
  if (!state.track.previewUrl) throw new Error('Brak preview URL');
  state.audio.src = state.track.previewUrl;
  state.audio.pause();
  state.audio.currentTime = 0;
  updateTimeline(true);
}

async function fetchPopularAggregate(countries = ['us','pl'], perCountryLimit = 200) {
  const results = await Promise.all(countries.map(async (c) => {
    try {
      const url = `https://itunes.apple.com/WebObjects/MZStoreServices.woa/ws/RSS/topsongs/limit=${perCountryLimit}/json?cc=${encodeURIComponent(c)}`;
      const res = await fetch(url);
      const data = await res.json();
      const feed = data.feed || {};
      let entries = feed.entry || [];
      if (!Array.isArray(entries)) entries = [entries];
      return entries;
    } catch {
      return [];
    }
  }));
  let entries = results.flat();
  const withPreview = entries.filter(e => {
    const links = e.link || [];
    const arr = Array.isArray(links) ? links : [links];
    return arr.some(l => l.attributes && l.attributes.rel === 'enclosure' && String(l.attributes.type || '').startsWith('audio'));
  });
  const notHoliday = withPreview.filter(e => {
    const cat = e.category && e.category.attributes ? (e.category.attributes.label || e.category.attributes.term || '') : '';
    const name = e['im:name']?.label || '';
    const coll = e['im:collection']?.['im:name']?.label || '';
    return !(holidayLike(cat) || holidayLike(name) || holidayLike(coll));
  });
  let pool = notHoliday.length ? notHoliday : withPreview;
  if (state.genre !== 'all') {
    pool = pool.filter(e => {
      const cat = e.category && e.category.attributes ? (e.category.attributes.label || e.category.attributes.term || '') : '';
      return matchGenre(cat, state.genre);
    });
    if (!pool.length) pool = notHoliday.length ? notHoliday : withPreview;
  }
  const idOf = (e) => {
    const a = e.id && e.id.attributes && e.id.attributes['im:id'];
    const b = e.id && e.id.label;
    const c = (e['im:name']?.label || '') + '|' + (e['im:artist']?.label || '');
    return String(a || b || c);
  };
  const counts = new Map();
  for (const e of pool) {
    const id = idOf(e);
    counts.set(id, (counts.get(id) || 0) + 1);
  }
  const minFreq = Math.max(2, Math.floor(countries.length * 0.3));
  const veryPopular = pool.filter(e => (counts.get(idOf(e)) || 0) >= minFreq);
  const basePool = veryPopular.length ? veryPopular : pool;
  const seen = new Set();
  const deduped = [];
  for (const e of basePool) {
    const id = idOf(e);
    if (!seen.has(id)) {
      seen.add(id);
      deduped.push(e);
    }
  }
  if (!state.recentIds) loadRecentIds();
  let available = deduped.map(e => idOf(e)).filter(id => !(state.recentIds || []).includes(id));
  if (!state.sessionPool || state.sessionPool.length === 0) {
    state.sessionPool = shuffle(available.slice());
    if (!state.sessionPool.length) {
      state.recentIds = [];
      saveRecentIds();
      available = deduped.map(e => idOf(e));
      state.sessionPool = shuffle(available.slice());
    }
  }
  if (!deduped.length || !state.sessionPool.length) throw new Error('Brak popularnych utworów z podglądem');
  const pickId = state.sessionPool.pop();
  const pick = deduped.find(e => idOf(e) === pickId) || deduped[Math.floor(Math.random() * deduped.length)];
  state.recentIds.push(pickId);
  if (state.recentIds.length > 200) state.recentIds.shift();
  saveRecentIds();
  const links = Array.isArray(pick.link) ? pick.link : [pick.link];
  const preview = links.find(l => l.attributes && l.attributes.rel === 'enclosure');
  const page = links.find(l => l.attributes && l.attributes.rel === 'alternate' && l.attributes.type === 'text/html');
  const images = Array.isArray(pick['im:image']) ? pick['im:image'] : [pick['im:image']];
  const artwork = images.length ? images[images.length - 1].label : '';
  state.track = {
    previewUrl: preview?.attributes?.href || '',
    trackName: pick['im:name']?.label || '',
    artistName: pick['im:artist']?.label || '',
    artwork,
    trackViewUrl: page?.attributes?.href || ''
  };
  if (!state.track.previewUrl) throw new Error('Brak preview URL');
  state.audio.src = state.track.previewUrl;
  state.audio.pause();
  state.audio.currentTime = 0;
  updateTimeline(true);
}

async function fetchFromPlaylists(genre, seedsCount = 10, perSeedLimit = 50) {
  function pickSeeds() {
    const src = playlistSeedsForGenre(genre).slice();
    for (let i = src.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const t = src[i]; src[i] = src[j]; src[j] = t;
    }
    return src.slice(0, Math.min(seedsCount, src.length));
  }
  const seeds = pickSeeds();
  const countries = popularCountries();
  const queries = seeds.map(seed => {
    const country = countries[Math.floor(Math.random() * countries.length)];
    const url = `https://itunes.apple.com/search?term=${encodeURIComponent(seed)}&media=music&entity=song&limit=${perSeedLimit}&country=${encodeURIComponent(country)}`;
    return fetch(url).then(r => r.json()).then(d => d.results || []).catch(() => []);
  });
  const all = (await Promise.all(queries)).flat();
  let items = all.filter(x => x.previewUrl && x.trackName && x.artistName);
  items = items.filter(r => !(String(r.primaryGenreName || '').toLowerCase().includes('holiday') || holidayLike(r.trackName) || holidayLike(r.collectionName)));
  if (genre !== 'all') {
    items = items.filter(r => matchGenre(String(r.primaryGenreName || ''), genre));
  }
  const counts = new Map();
  for (const it of items) {
    const id = idOfSong(it);
    counts.set(id, (counts.get(id) || 0) + 1);
  }
  const minCount = 2;
  const popularOnly = items.filter(it => (counts.get(idOfSong(it)) || 0) >= minCount);
  const seen = new Set();
  const deduped = [];
  for (const it of popularOnly.length ? popularOnly : items) {
    const id = idOfSong(it);
    if (!seen.has(id)) {
      seen.add(id);
      deduped.push(it);
    }
  }
  loadRecentIds();
  let available = deduped.map(idOfSong).filter(id => !(state.recentIds || []).includes(id));
  if (!state.sessionPool || state.sessionPool.length === 0) {
    state.sessionPool = shuffle(available.slice());
    if (!state.sessionPool.length) {
      state.recentIds = [];
      saveRecentIds();
      available = deduped.map(idOfSong);
      state.sessionPool = shuffle(available.slice());
    }
  }
  if (!deduped.length || !state.sessionPool.length) throw new Error('Brak popularnych utworów z podglądem');
  const pickId = state.sessionPool.pop();
  const pick = deduped.find(it => idOfSong(it) === pickId) || deduped[Math.floor(Math.random() * deduped.length)];
  state.recentIds.push(pickId);
  if (state.recentIds.length > 200) state.recentIds.shift();
  saveRecentIds();
  state.track = {
    previewUrl: pick.previewUrl || '',
    trackName: pick.trackName || '',
    artistName: pick.artistName || '',
    artwork: pick.artworkUrl100 || pick.artworkUrl60 || '',
    trackViewUrl: pick.trackViewUrl || pick.collectionViewUrl || ''
  };
  if (!state.track.previewUrl) throw new Error('Brak preview URL');
  state.audio.src = state.track.previewUrl;
  state.audio.pause();
  state.audio.currentTime = 0;
  updateTimeline(true);
}

function playSnippet() {
  if (!state.track) return;
  state.audio.pause();
  state.audio.currentTime = 0;
  state.audio.play().then(() => {
  }).catch(() => {
    setStatus('Przeglądarka zablokowała odtwarzanie. Kliknij przycisk i spróbuj ponownie.', 'warn');
  });
  els.bigPlayBtn.classList.add('playing');
}

function unlockMore(seconds) {
  const maxPreview = 30;
  state.maxListenTime = Math.min(maxPreview, state.maxListenTime + seconds);
  updateMaxTime();
  if (state.audio.paused && state.track) {
    state.audio.play().catch(() => {});
  }
}

function normalizeText(s) {
  return s.toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[()"'’‘.,!?\[\]-]/g, '')
    .trim();
}

function tokenSet(str) {
  return new Set(normalizeText(str).split(' ').filter(Boolean));
}

function jaccard(aSet, bSet) {
  let inter = 0;
  for (const x of aSet) if (bSet.has(x)) inter++;
  const union = aSet.size + bSet.size - inter;
  return union ? inter / union : 0;
}

function checkGuess(input) {
  if (!state.track) return false;
  const guess = normalizeText(input);
  const title = normalizeText(state.track.trackName);
  const artist = normalizeText(state.track.artistName);
  const guessSet = tokenSet(guess);
  const titleSet = tokenSet(title);
  const artistSet = tokenSet(artist);
  const scoreTitle = jaccard(guessSet, titleSet);
  const scoreArtist = jaccard(guessSet, artistSet);
  const scoreCombined = jaccard(guessSet, tokenSet(title + ' ' + artist));
  const ok = (scoreTitle > 0.6 && scoreArtist > 0.4) || scoreCombined > 0.55;
  return ok;
}

function showResult() {
  if (!state.track) return;
  els.result.style.display = 'grid';
  els.title.textContent = state.track.trackName;
  els.artist.textContent = state.track.artistName;
  els.cover.style.backgroundImage = state.track.artwork ? `url(${state.track.artwork})` : 'none';
  if (state.track.trackViewUrl) {
    els.link.href = state.track.trackViewUrl;
    els.link.style.display = 'inline';
  } else {
    els.link.style.display = 'none';
  }
}

function showRevealModal() {
  if (!state.track) return;
  els.modalTitle.textContent = state.track.trackName || '';
  els.modalArtist.textContent = state.track.artistName || '';
  els.modalCover.style.backgroundImage = state.track.artwork ? `url(${state.track.artwork})` : 'none';
  if (state.track.trackViewUrl) {
    els.modalLink.href = state.track.trackViewUrl;
    els.modalLink.style.display = 'inline';
  } else {
    els.modalLink.style.display = 'none';
  }
  els.revealModal.style.display = 'flex';
}

function hideRevealModal() {
  els.revealModal.style.display = 'none';
}

function triggerWinAnimation() {
  els.bigPlayBtn.classList.add('win-glow');
  els.timelineBar.classList.add('win');
  els.cover.classList.add('win');
  setTimeout(() => {
    els.bigPlayBtn.classList.remove('win-glow');
    els.timelineBar.classList.remove('win');
    els.cover.classList.remove('win');
  }, 1000);
  makeConfetti(1000, 160);
}

function updateTimeline(resetPointer = false) {
  const total = 30;
  const unlockedRatio = Math.min(1, state.maxListenTime / total);
  els.timelineUnlocked.style.width = `${unlockedRatio * 100}%`;
  const current = Math.min(state.audio.currentTime || 0, state.maxListenTime);
  const playRatio = Math.min(1, current / total);
  els.timelinePlayhead.style.left = `${playRatio * 100}%`;
  els.timelineSeconds.textContent = `${state.maxListenTime.toFixed(1)} s`;
  const barRect = els.timelineBar.getBoundingClientRect();
  const pointerLeft = barRect.left + barRect.width * unlockedRatio;
  const containerRect = els.timelinePointer.getBoundingClientRect();
  const offset = pointerLeft - containerRect.left;
  els.timelineSeconds.style.left = `${offset}px`;
  els.timeDisplay.textContent = `${formatTime(current)} / ${formatTime(total)}`;
}

els.guessBtn.addEventListener('click', () => {
  if (state.locked) return;
  const val = els.guessInput.value;
  if (!val.trim()) return;
  const ok = checkGuess(val);
  if (ok) {
    setStatus('Brawo! Trafione!', 'success');
    showResult();
    triggerWinAnimation();
    showRevealModal();
    lockAndAutoplay();
  } else {
    setStatus('Nie trafione. Dodaj kolejne 5 s lub wybierz sugestię z listy.', 'warn');
  }
});
els.guessInput.addEventListener('input', (e) => {
  if (state.locked) return;
  debouncedSuggest(e.target.value);
});
els.guessInput.addEventListener('keydown', (e) => {
  const list = Array.from(els.suggestions.querySelectorAll('.suggestion-item'));
  if (!list.length) return;
  if (e.key === 'ArrowDown') {
    e.preventDefault();
    selectedIndex = Math.min(list.length - 1, selectedIndex + 1);
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    selectedIndex = Math.max(0, selectedIndex - 1);
  } else if (e.key === 'Enter') {
    e.preventDefault();
    const el = list[selectedIndex];
    if (el) el.click();
    return;
  } else if (e.key === 'Escape') {
    els.suggestions.innerHTML = '';
    return;
  } else {
    return;
  }
  list.forEach(n => n.classList.remove('active'));
  if (list[selectedIndex]) list[selectedIndex].classList.add('active');
});
document.addEventListener('click', (e) => {
  if (!els.suggestions.contains(e.target) && e.target !== els.guessInput) {
    els.suggestions.innerHTML = '';
  }
});
els.revealBtn.addEventListener('click', () => {
  if (state.locked) return;
  showResult();
  lockAndAutoplay();
  showRevealModal();
});
els.nextBtn.addEventListener('click', async () => {
  state.audio.pause();
  els.guessInput.value = '';
  await fetchRandomTrack();
  playSnippet();
  hideRevealModal();
});

els.bigPlayBtn.addEventListener('click', () => {
  if (state.locked) return;
  if (!state.track) return;
  if (state.audio.paused) {
    playSnippet();
  } else {
    state.audio.pause();
    els.bigPlayBtn.classList.remove('playing');
  }
  els.bigPlayBtn.classList.add('ripple');
  setTimeout(() => els.bigPlayBtn.classList.remove('ripple'), 350);
});

els.skipBtn.addEventListener('click', () => {
  if (state.locked) return;
  unlockMore(5);
  if (state.maxListenTime >= 30) {
    setStatus('Koniec odsłuchu — odpowiedź poniżej.');
    showResult();
    lockAndAutoplay();
  }
});

state.audio.addEventListener('timeupdate', () => {
  updateTimeline();
  if (state.audio.currentTime >= state.maxListenTime - 0.001) {
    state.audio.pause();
  }
});

let dragging = false;
function ratioFromClientX(clientX) {
  const rect = els.timelineBar.getBoundingClientRect();
  const x = Math.min(Math.max(clientX - rect.left, 0), rect.width);
  return x / rect.width;
}
function seekToRatio(ratio) {
  if (state.locked) return;
  const total = 30;
  const unlockedRatio = Math.min(1, state.maxListenTime / total);
  const clamped = Math.min(Math.max(ratio, 0), unlockedRatio);
  const target = clamped * total;
  state.audio.currentTime = Math.min(target, state.maxListenTime - 0.001);
  updateTimeline();
  if (state.audio.paused && state.track) {
    state.audio.play().catch(() => {});
  }
}
els.timelineBar.addEventListener('mousedown', (e) => {
  dragging = true;
  seekToRatio(ratioFromClientX(e.clientX));
});
window.addEventListener('mousemove', (e) => {
  if (!dragging) return;
  seekToRatio(ratioFromClientX(e.clientX));
});
window.addEventListener('mouseup', () => {
  dragging = false;
});
els.timelineBar.addEventListener('touchstart', (e) => {
  dragging = true;
  const t = e.touches[0];
  seekToRatio(ratioFromClientX(t.clientX));
}, { passive: true });
window.addEventListener('touchmove', (e) => {
  if (!dragging) return;
  const t = e.touches[0];
  seekToRatio(ratioFromClientX(t.clientX));
}, { passive: true });
window.addEventListener('touchend', () => {
  dragging = false;
});
state.audio.addEventListener('pause', () => {
  els.bigPlayBtn.classList.remove('playing');
  els.bigPlayBtn.classList.add('pulsing');
  els.timelineBar.classList.remove('playing');
});
state.audio.addEventListener('play', () => {
  els.bigPlayBtn.classList.add('playing');
  els.bigPlayBtn.classList.remove('pulsing');
  els.timelineBar.classList.add('playing');
});

fetchRandomTrack();

els.modalNext.addEventListener('click', async () => {
  state.audio.pause();
  els.guessInput.value = '';
  hideRevealModal();
  await fetchRandomTrack();
  playSnippet();
});

function matchGenre(catLabel, g) {
  const s = String(catLabel || '').toLowerCase();
  if (g === 'pop') return s.includes('pop');
  if (g === 'hiphop') return s.includes('hip-hop') || s.includes('hip hop') || s.includes('rap');
  if (g === 'rock') return s.includes('rock');
  if (g === 'dance') return s.includes('dance');
  if (g === 'electronic') return s.includes('electronic') || s.includes('electro');
  if (g === 'alternative') return s.includes('alternative');
  if (g === 'rnb') return s.includes('r&b') || s.includes('rnb') || s.includes('soul');
  return true;
}
els.genreSelect = document.getElementById('genreSelect');
els.genreSelect.addEventListener('change', async () => {
  state.genre = els.genreSelect.value || 'all';
  state.recentIds = [];
  state.audio.pause();
  els.guessInput.value = '';
  hideRevealModal();
  await fetchRandomTrack();
  playSnippet();
});

function makeConfetti(duration = 1200, count = 120) {
  const canvas = document.createElement('canvas');
  canvas.style.position = 'fixed';
  canvas.style.inset = '0';
  canvas.style.pointerEvents = 'none';
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  document.body.appendChild(canvas);
  const ctx = canvas.getContext('2d');
  const colors = ['#2ecc71','#6c8cff','#ffd166','#ff5c7a','#a0e7e5'];
  const parts = [];
  const cx = canvas.width / 2;
  const cy = canvas.height * 0.25;
  for (let i = 0; i < count; i++) {
    parts.push({
      x: cx + (Math.random() - 0.5) * 120,
      y: cy + (Math.random() - 0.5) * 40,
      vx: (Math.random() - 0.5) * 6,
      vy: Math.random() * -3 - 1,
      g: 0.12 + Math.random() * 0.08,
      s: 4 + Math.random() * 4,
      a: 1,
      rot: Math.random() * Math.PI * 2,
      vr: (Math.random() - 0.5) * 0.2,
      color: colors[i % colors.length]
    });
  }
  let start = performance.now();
  function tick(t) {
    const elapsed = t - start;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    parts.forEach(p => {
      p.vy += p.g;
      p.x += p.vx;
      p.y += p.vy;
      p.rot += p.vr;
      p.a = Math.max(0, 1 - elapsed / duration);
      ctx.save();
      ctx.globalAlpha = p.a;
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.s, -p.s, p.s * 2, p.s * 2);
      ctx.restore();
    });
    if (elapsed < duration) {
      requestAnimationFrame(tick);
    } else {
      canvas.remove();
    }
  }
  requestAnimationFrame(tick);
}
