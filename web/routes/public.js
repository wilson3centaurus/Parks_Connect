import { Router } from 'express';
import axios from 'axios';

const router = Router();
const backendUrl = process.env.BACKEND_URL || 'http://localhost:4000';

// ── Wikipedia helpers ────────────────────────────────────────────────────────

const WIKI_CACHE = new Map();
const WIKI_TTL = 3_600_000; // 1 hour

const WIKI_TITLE = {
  HWG: 'Hwange_National_Park',
  VFA: 'Victoria_Falls_National_Park',
  MNA: 'Mana_Pools_National_Park',
  GNZ: 'Gonarezhou_National_Park',
  MTB: 'Matobo_Hills',
  NYG: 'Nyanga_National_Park',
  CHM: 'Chimanimani_National_Park',
  CHZ: 'Chizarira_National_Park',
  MTS: 'Matusadona_National_Park',
  ZMB: 'Zambezi_National_Park',
  KZM: 'Kazuma_Pan_National_Park'
};

async function fetchWiki(code, fallbackName) {
  const title = WIKI_TITLE[code] || fallbackName.replace(/ /g, '_');
  const cached = WIKI_CACHE.get(title);
  if (cached && Date.now() - cached.ts < WIKI_TTL) return cached.data;
  try {
    const resp = await axios.get(
      `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`,
      { timeout: 5000, headers: { 'User-Agent': 'ZimParks/1.0 (parks-connect-app)' } }
    );
    const data = {
      extract: resp.data.extract || '',
      thumbnail: resp.data.thumbnail?.source?.replace(/\/\d+px-/, '/640px-') || null
    };
    WIKI_CACHE.set(title, { data, ts: Date.now() });
    return data;
  } catch {
    return { extract: '', thumbnail: null };
  }
}

// Curated park data — supplements Wikipedia + DB data
const PARK_CURATED = {
  HWG: { established:1929, area:'14,651 km²', lat:-18.61, lng:26.74, bestTime:'May – Oct', animals:['African Elephant','Lion','African Wild Dog','Leopard','Buffalo','Cheetah','Giraffe','Zebra'], todo:['Self-drive game drives','Guided bush walks','Night drives','Birding (400+ species)','Elephant encounters','Photography safaris'] },
  VFA: { established:1952, area:'23 km²',     lat:-17.92, lng:25.83, bestTime:'Year-round', animals:['Hippo','Crocodile','Elephant','Buffalo','Vervet Monkey','Fish Eagle'], todo:['Victoria Falls viewpoints','White-water rafting','Bungee jumping (111 m)','Sunset Zambezi cruises','Helicopter flights','Micro-lighting'] },
  MNA: { established:1963, area:'2,196 km²',  lat:-15.77, lng:29.38, bestTime:'Apr – Oct', animals:['African Wild Dog','Buffalo','Elephant','Nyala','Hippo','Lion','Crocodile'], todo:['Canoe safaris on the Zambezi','Walking safaris','Fishing','Night game drives','Camping under stars','Bird watching'] },
  GNZ: { established:1975, area:'5,053 km²',  lat:-21.40, lng:31.80, bestTime:'May – Oct', animals:['Elephant','Lion','Buffalo','Nyala','Leopard','Wild Dog','Crocodile'], todo:['Game drives','Walking safaris','Limpopo River canoe trips','Baobab forest walks','Photography','Fishing'] },
  MTB: { established:1953, area:'424 km²',    lat:-20.52, lng:28.48, bestTime:'Year-round', animals:['White Rhino','Leopard','Sable Antelope','Vervet Monkey','Eagle Owl'], todo:['White rhino tracking','Cave painting trails','Granite boulder formations','Horse-riding','Historical sites (Cecil Rhodes grave)','Birding'] },
  NYG: { established:1926, area:'473 km²',    lat:-18.22, lng:32.75, bestTime:'Sep – Apr', animals:['Eland','Sable Antelope','Samango Monkey','Serval','Trout'], todo:['Hiking Mt Nyangani (2,592 m)','Trout fishing','Waterfalls exploration','Horse riding','Tea estate visits','Mountain biking'] },
  CHM: { established:1950, area:'171 km²',    lat:-19.78, lng:32.88, bestTime:'May – Oct', animals:['Sable Antelope','Eland','Klipspringer','Blue Duiker','Samango Monkey'], todo:['Chimanimani mountain hiking','Valley of Desolation','Bridal Veil Falls','Camping','Rock climbing','Butterfly watching'] },
  CHZ: { established:1975, area:'1,920 km²',  lat:-17.70, lng:27.88, bestTime:'May – Oct', animals:['Lion','Leopard','Elephant','Buffalo','Crocodile','Hippo'], todo:['Remote wilderness drives','Gorge walking','Scenic escarpment viewpoints','Birding (300+ species)','Fly camping'] },
  MTS: { established:1963, area:'1,400 km²',  lat:-16.88, lng:28.66, bestTime:'Apr – Oct', animals:['Lion','Elephant','Buffalo','Leopard','Hippo','Nile Crocodile','Waterbuck'], todo:['Lake Kariba boat safaris','Tiger fishing','Canoe trails','Game drives','Houseboat stays','Swimming'] },
  ZMB: { established:1979, area:'56 km²',     lat:-17.91, lng:25.52, bestTime:'Year-round', animals:['Elephant','Hippo','Buffalo','Giraffe','Waterbuck','Impala','Crocodile'], todo:['Zambezi game drives','Sunset river cruises','Fishing','Walking safaris','Birding','Canoe trips'] },
  KZM: { established:1999, area:'313 km²',    lat:-18.32, lng:25.86, bestTime:'May – Oct', animals:['Sable Antelope','Eland','Buffalo','Zebra','African Wild Dog'], todo:['Open pan game viewing','Birding (350+ species)','Photography','Walking safaris'] }
};

router.get('/parks', async (req, res) => {
  try {
    const dbParks = await axios.get(`${backendUrl}/api/parks`).then(r => r.data).catch(() => []);

    const parks = await Promise.all(
      dbParks.map(async park => {
        const wiki = await fetchWiki(park.code, park.name);
        const curated = PARK_CURATED[park.code] || {};
        return { ...park, wiki, curated };
      })
    );

    // Fill in any parks in curated data that aren't in DB yet
    const dbCodes = new Set(dbParks.map(p => p.code));
    for (const [code, curated] of Object.entries(PARK_CURATED)) {
      if (!dbCodes.has(code)) {
        const wiki = await fetchWiki(code, code);
        parks.push({ id: null, code, name: code, region: null, wiki, curated });
      }
    }

    res.render('tourist-parks', { layout: false, parks });
  } catch (err) {
    console.error('[/parks]', err.message);
    res.render('tourist-parks', { layout: false, parks: [] });
  }
});

router.get('/feedback', async (_req, res) => {
  try {
    const parks = await axios.get(`${backendUrl}/api/parks`).then((resp) => resp.data).catch(() => []);
    res.render('feedback', {
      layout: false,
      parks,
      values: {},
      errors: {},
      success: null
    });
  } catch (err) {
    console.error(err.response?.data || err.message);
    res.status(500).render('error', { message: 'Unable to load feedback form.' });
  }
});

router.post('/feedback', async (req, res) => {
  const values = {
    submitted_by: String(req.body?.submitted_by || '').trim(),
    park_id: String(req.body?.park_id || '').trim(),
    visit_date: String(req.body?.visit_date || '').trim(),
    rating: String(req.body?.rating || '').trim(),
    category: String(req.body?.category || '').trim(),
    comments: String(req.body?.comments || '').trim()
  };

  try {
    await axios.post(`${backendUrl}/api/feedback/public`, values);
    const parks = await axios.get(`${backendUrl}/api/parks`).then((resp) => resp.data).catch(() => []);
    return res.render('feedback', {
      layout: false,
      parks,
      values: {},
      errors: {},
      success: 'Feedback submitted successfully. Thank you for helping ZimParks improve the visitor experience.'
    });
  } catch (err) {
    const parks = await axios.get(`${backendUrl}/api/parks`).then((resp) => resp.data).catch(() => []);
    return res.status(400).render('feedback', {
      layout: false,
      parks,
      values,
      errors: err.response?.data?.errors || { form: err.response?.data?.message || 'Submission failed.' },
      success: null
    });
  }
});

export default router;
