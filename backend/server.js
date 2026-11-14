require('dotenv').config();
const path = require('path');
const fs = require('fs/promises');
const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const store = require('./csv-store');

const app = express();
const PORT = Number(process.env.PORT || 3000);
const SECRET = process.env.JWT_SECRET;
if (!SECRET || SECRET === 'CHANGE_THIS_TO_A_LONG_RANDOM_SECRET') {
  console.error('Please create .env and set a private JWT_SECRET before starting.');
  process.exit(1);
}

app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: false }));
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 30, standardHeaders: true, legacyHeaders: false });

const clean = (v, max = 180) => {
  if (v === undefined || v === null) return '';
  return String(v).trim().slice(0, max);
};
const parse = (v, fallback = {}) => {
  try { return v ? JSON.parse(v) : fallback; } catch (_) { return fallback; }
};
const now = () => new Date().toISOString();

function makeToken(user) {
  return jwt.sign({ userId: Number(user.userId), email: user.email, role: user.role }, SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' });
}
async function auth(req, res, next) {
  try {
    const header = req.headers.authorization || '';
    if (!header.startsWith('Bearer ')) return res.status(401).json({ message: 'Please sign in first.' });
    const payload = jwt.verify(header.slice(7), SECRET);
    const users = await store.read('users');
    const user = users.find(u => Number(u.userId) === Number(payload.userId));
    if (!user) return res.status(401).json({ message: 'Account not found.' });
    req.user = { userId: Number(user.userId), name: user.name, role: user.role, email: user.email, phone: user.phone, location: user.location };
    next();
  } catch (_) { return res.status(401).json({ message: 'Your session expired. Please sign in again.' }); }
}
function adminOnly(req, res, next) {
  if (req.user.role !== 'agronomist') return res.status(403).json({ message: 'Agronomist/admin access required.' });
  next();
}

async function generatePlan(input) {
  const hectares = input.unit === 'acre' ? input.area * 0.404686 : input.area;
  const crops = await store.read('crops');
  const crop = crops.find(c => c.cropName.toLowerCase() === input.crop.toLowerCase());
  const cropId = crop ? String(crop.cropId) : '';
  const rules = (await store.read('rules')).filter(r => r.isActive !== '0');
  const items = [];
  const schedule = [];
  const valueFor = (condition, key) => condition[key] ?? condition[{ n: 'nitrogen', p: 'phosphorus', k: 'potassium' }[key]];
  for (const rule of rules) {
    if (rule.cropId && cropId && String(rule.cropId) !== cropId) continue;
    const condition = parse(rule.conditionData, {});
    const nutrientMatches = ['n','p','k'].every(key => valueFor(condition, key) === undefined || String(valueFor(condition, key)).toLowerCase() === String(input[key]).toLowerCase());
    const phMatches = condition.phBelow === undefined || input.ph < Number(condition.phBelow);
    const phAboveMatches = condition.phAbove === undefined || input.ph > Number(condition.phAbove);
    const stageCondition = condition.growthStage ?? condition.stage;
    const stageMatches = !stageCondition || String(stageCondition).toLowerCase() === input.stage.toLowerCase();
    const cropCondition = condition.cropName;
    const cropMatches = !cropCondition || String(cropCondition).toLowerCase() === input.crop.toLowerCase();
    if (!nutrientMatches || !phMatches || !phAboveMatches || !stageMatches || !cropMatches) continue;
    const recs = parse(rule.recommendations, []);
    for (const rec of recs) {
      const rate = Number(rec.rateKgPerHa ?? rec.rate ?? 0);
      const isExpert = !Number.isFinite(rate) || rate <= 0;
      items.push({
        name: clean(rec.fertilizer || rec.name || 'Agronomist review', 120),
        why: clean(rec.reason || rule.ruleName, 300),
        rate: isExpert ? 0 : rate,
        quantity: isExpert ? null : Math.round(rate * hectares * 10) / 10
      });
      if (rec.timing || rec.applicationTiming) {
        schedule.push({ timing: clean(rec.timing || rec.applicationTiming, 150), instruction: clean(rec.instruction || `Apply ${rec.fertilizer || rec.name || 'as recommended'} according to crop and soil-test guidance.`, 500) });
      }
    }
  }
  if (input.ph < 5.5 && !items.some(item => item.name.toLowerCase().includes('soil pH'.toLowerCase()))) {
    items.push({ name: 'Soil pH review', why: 'Acidic soil detected. Seek local agronomist advice before corrective amendment.', rate: 0, quantity: null });
  }
  if (!items.length) {
    const defaultFertilizer = (await store.read('fertilizers')).find(f => f.type === 'Organic') || { name: 'Well-decomposed compost', defaultDosageKgPerHa: '1000', instructions: 'Organic matter support. Maintain soil health and retest as needed.' };
    const rate = Number(defaultFertilizer.defaultDosageKgPerHa) || 1000;
    items.push({ name: defaultFertilizer.name, why: defaultFertilizer.instructions || 'General soil-health support. Confirm with a soil test.', rate, quantity: Math.round(rate * hectares * 10) / 10 });
  }
  if (!schedule.length) {
    schedule.push(
      { timing: 'At planting / next application', instruction: 'Apply suitable basal nutrients according to crop calendar and local soil-test guidance.' },
      { timing: `During ${input.stage.toLowerCase()} growth`, instruction: 'Monitor crop colour and growth. Apply split nutrients only when advised for the crop.' },
      { timing: 'Before the next growth stage', instruction: 'Reassess crop condition and soil moisture; avoid application immediately before heavy rain.' }
    );
  }
  return {
    crop: input.crop, stage: input.stage, area: input.area, unit: input.unit, hectares,
    ph: input.ph, n: input.n, p: input.p, k: input.k, farm: input.farm, location: input.location,
    items, schedule
  };
}
function validatePlan(b) {
  const area = Number(b.area), ph = Number(b.ph);
  if (!Number.isFinite(area) || area <= 0 || area > 1000000) return 'Enter a valid field area.';
  if (!Number.isFinite(ph) || ph < 0 || ph > 14) return 'Soil pH must be between 0 and 14.';
  if (!['hectare','acre'].includes(b.unit)) return 'Choose hectare or acre.';
  if (!clean(b.crop, 100) || !clean(b.stage, 50)) return 'Crop and growth stage are required.';
  if (![b.n,b.p,b.k].every(x => ['Low','Medium','High'].includes(x))) return 'Choose valid N, P and K levels.';
  return '';
}
async function createRecommendation(userId, body, saved) {
  const error = validatePlan(body);
  if (error) throw Object.assign(new Error(error), { status: 400 });
  const input = {
    farm: clean(body.farm, 150), location: clean(body.location, 180),
    crop: clean(body.crop, 100), stage: clean(body.stage, 50),
    area: Number(body.area), unit: body.unit, ph: Number(body.ph),
    n: body.n, p: body.p, k: body.k
  };
  const crops = await store.read('crops');
  const crop = crops.find(c => c.cropName.toLowerCase() === input.crop.toLowerCase());
  const generated = await generatePlan(input);
  const row = await store.insert('recommendations', {
    userId: String(userId), cropId: crop ? crop.cropId : '',
    cropName: input.crop, soilInput: JSON.stringify(input), growthStage: input.stage,
    area: String(input.area), areaUnit: input.unit,
    generatedRecommendations: JSON.stringify(generated),
    isSaved: saved ? '1' : '0', generatedAt: now(), savedAt: saved ? now() : ''
  }, 'recId');
  return { recId: Number(row.recId), recommendation: generated, isSaved: saved };
}

app.get('/api/health', async (req, res) => {
  try { await store.ensureFiles(); res.json({ status: 'ok', storage: 'CSV files', dataDirectory: 'data/' }); }
  catch (e) { res.status(500).json({ status: 'error', message: e.message }); }
});

/* Auth: create credentials first, then login with those credentials. */
app.post('/api/auth/register', authLimiter, async (req, res) => {
  try {
    const name = clean(req.body.name || req.body.fullName, 120);
    const email = clean(req.body.email, 190).toLowerCase();
    const password = typeof req.body.password === 'string' ? req.body.password : '';
    if (!name || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ message: 'Enter your name and a valid email.' });
    if (password.length < 8) return res.status(400).json({ message: 'Password must be at least 8 characters.' });
    const users = await store.read('users');
    if (users.some(u => u.email.toLowerCase() === email)) return res.status(409).json({ message: 'This email already has an account. Please sign in.' });
    const passwordHash = await bcrypt.hash(password, 10);
    const user = await store.insert('users', {
      name, role: 'user', email, passwordHash,
      phone: clean(req.body.phone, 25), location: clean(req.body.location, 180), createdAt: now()
    }, 'userId');
    res.status(201).json({ message: 'Account created. Please sign in with your new credentials.', user: { userId: Number(user.userId), name, email } });
  } catch (e) { console.error(e); res.status(500).json({ message: 'Could not create account.' }); }
});

app.post('/api/auth/login', authLimiter, async (req, res) => {
  try {
    const email = clean(req.body.email, 190).toLowerCase();
    const password = typeof req.body.password === 'string' ? req.body.password : '';
    const users = await store.read('users');
    const user = users.find(u => u.email.toLowerCase() === email);
    if (!user || !(await bcrypt.compare(password, user.passwordHash))) return res.status(401).json({ message: 'Incorrect email or password.' });
    const safeUser = { userId: Number(user.userId), name: user.name, role: user.role, email: user.email, phone: user.phone, location: user.location };
    res.json({ token: makeToken(user), user: safeUser });
  } catch (e) { console.error(e); res.status(500).json({ message: 'Could not sign in.' }); }
});
app.get('/api/auth/me', auth, (req, res) => res.json({ user: req.user }));
app.post('/api/auth/logout', auth, (req, res) => res.json({ message: 'Signed out.' }));

/* Public crop catalogue and knowledge base. */
app.get('/api/crops', async (req, res) => {
  const crops = await store.read('crops');
  res.json({ crops: crops.map(c => ({ ...c, typicalNPK: parse(c.typicalNPK), recommendedFertilizers: parse(c.recommendedFertilizers, []) })) });
});
app.get('/api/kb', async (req, res) => {
  const crops = await store.read('crops'), fertilizers = await store.read('fertilizers');
  res.json({
    crops: crops.map(c => ({ ...c, typicalNPK: parse(c.typicalNPK), recommendedFertilizers: parse(c.recommendedFertilizers, []) })),
    fertilizers: fertilizers.map(f => ({ ...f, nutrientComposition: parse(f.nutrientComposition) }))
  });
});

/* Paper API: submit soil data, then retrieve/save the recommendation. */
app.post('/api/recommendations/request', auth, async (req, res) => {
  try { res.status(201).json({ message: 'Recommendation generated.', ...await createRecommendation(req.user.userId, req.body, false) }); }
  catch (e) { res.status(e.status || 500).json({ message: e.message || 'Could not generate recommendation.' }); }
});
app.post('/api/recommendations', auth, async (req, res) => {
  try { res.status(201).json({ message: 'Recommendation saved.', ...await createRecommendation(req.user.userId, req.body, true) }); }
  catch (e) { res.status(e.status || 500).json({ message: e.message || 'Could not save recommendation.' }); }
});
app.get('/api/recommendations/user/:userId', auth, async (req, res) => {
  if (Number(req.params.userId) !== req.user.userId && req.user.role !== 'agronomist') return res.status(403).json({ message: 'You can only view your own history.' });
  const rows = (await store.read('recommendations')).filter(r => Number(r.userId) === Number(req.params.userId)).sort((a,b) => b.generatedAt.localeCompare(a.generatedAt));
  res.json({ recommendations: rows.map(r => ({ ...r, soilInput: parse(r.soilInput), generatedRecommendations: parse(r.generatedRecommendations) })) });
});
app.get('/api/recommendations/:id', auth, async (req, res) => {
  const row = (await store.read('recommendations')).find(r => Number(r.recId) === Number(req.params.id));
  if (!row) return res.status(404).json({ message: 'Recommendation not found.' });
  if (Number(row.userId) !== req.user.userId && req.user.role !== 'agronomist') return res.status(403).json({ message: 'You cannot view this recommendation.' });
  res.json({ recommendation: { ...row, soilInput: parse(row.soilInput), generatedRecommendations: parse(row.generatedRecommendations) } });
});
app.post('/api/recommendations/:id/save', auth, async (req, res) => {
  const row = await store.update('recommendations', r => Number(r.recId) === Number(req.params.id) && Number(r.userId) === req.user.userId,
    r => ({ ...r, isSaved: '1', savedAt: r.savedAt || now() }));
  if (!row) return res.status(404).json({ message: 'Recommendation not found for this account.' });
  res.json({ message: 'Recommendation saved.' });
});
app.post('/api/recommendations/:id/feedback', auth, async (req, res) => {
  const rating = Number(req.body.rating);
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) return res.status(400).json({ message: 'Rating must be between 1 and 5.' });
  const recommendations = await store.read('recommendations');
  const rec = recommendations.find(r => Number(r.recId) === Number(req.params.id) && Number(r.userId) === req.user.userId);
  if (!rec) return res.status(404).json({ message: 'Recommendation not found for this account.' });
  const feedback = await store.insert('feedback', {
    recId: String(rec.recId), userId: String(req.user.userId), rating: String(rating),
    comments: clean(req.body.comments || req.body.comment, 5000),
    reviewStatus: 'Pending', adminNote: '', reviewedAt: '', createdAt: now()
  }, 'feedbackId');
  res.status(201).json({ message: 'Feedback saved.', feedbackId: Number(feedback.feedbackId) });
});

/* Admin endpoints. Promote an account with: npm run make-admin -- email@example.com */
app.post('/api/admin/crops', auth, adminOnly, async (req, res) => {
  const cropName = clean(req.body.cropName || req.body.name, 100);
  if (!cropName) return res.status(400).json({ message: 'Crop name is required.' });
  const rows = await store.read('crops');
  if (rows.some(c => c.cropName.toLowerCase() === cropName.toLowerCase())) return res.status(409).json({ message: 'Crop already exists.' });
  const row = await store.insert('crops', {
    cropName, typicalNPK: JSON.stringify(req.body.typicalNPK || {}),
    recommendedFertilizers: JSON.stringify(req.body.recommendedFertilizers || []),
    notes: clean(req.body.notes, 5000), createdAt: now()
  }, 'cropId');
  res.status(201).json({ cropId: Number(row.cropId), cropName });
});
app.put('/api/admin/crops/:id', auth, adminOnly, async (req, res) => {
  const row = await store.update('crops', c => Number(c.cropId) === Number(req.params.id), c => ({
    ...c, cropName: clean(req.body.cropName || req.body.name, 100) || c.cropName,
    typicalNPK: req.body.typicalNPK ? JSON.stringify(req.body.typicalNPK) : c.typicalNPK,
    recommendedFertilizers: req.body.recommendedFertilizers ? JSON.stringify(req.body.recommendedFertilizers) : c.recommendedFertilizers,
    notes: req.body.notes === undefined ? c.notes : clean(req.body.notes, 5000)
  }));
  if (!row) return res.status(404).json({ message: 'Crop not found.' });
  res.json({ message: 'Crop profile updated.' });
});
app.post('/api/admin/fertilizers', auth, adminOnly, async (req, res) => {
  const name = clean(req.body.name, 120);
  if (!name) return res.status(400).json({ message: 'Fertilizer name is required.' });
  const rows = await store.read('fertilizers');
  if (rows.some(f => f.name.toLowerCase() === name.toLowerCase())) return res.status(409).json({ message: 'Fertilizer already exists.' });
  const row = await store.insert('fertilizers', {
    name, nutrientComposition: JSON.stringify(req.body.nutrientComposition || {}),
    type: ['Urea','DAP','Organic','MOP','Other'].includes(req.body.type) ? req.body.type : 'Other',
    instructions: clean(req.body.instructions, 5000),
    defaultDosageKgPerHa: String(Math.max(0, Number(req.body.defaultDosageKgPerHa) || 0)),
    applicationTiming: clean(req.body.applicationTiming, 300), createdAt: now()
  }, 'fertilizerId');
  res.status(201).json({ fertilizerId: Number(row.fertilizerId), name });
});
app.put('/api/admin/fertilizers/:id', auth, adminOnly, async (req, res) => {
  const row = await store.update('fertilizers', f => Number(f.fertilizerId) === Number(req.params.id), f => ({
    ...f,
    name: clean(req.body.name, 120) || f.name,
    nutrientComposition: req.body.nutrientComposition === undefined ? f.nutrientComposition : JSON.stringify(req.body.nutrientComposition),
    type: req.body.type && ['Urea','DAP','Organic','MOP','Other'].includes(req.body.type) ? req.body.type : f.type,
    instructions: req.body.instructions === undefined ? f.instructions : clean(req.body.instructions, 5000),
    defaultDosageKgPerHa: req.body.defaultDosageKgPerHa === undefined ? f.defaultDosageKgPerHa : String(Math.max(0, Number(req.body.defaultDosageKgPerHa) || 0)),
    applicationTiming: req.body.applicationTiming === undefined ? f.applicationTiming : clean(req.body.applicationTiming, 300)
  }));
  if (!row) return res.status(404).json({ message: 'Fertilizer not found.' });
  res.json({ message: 'Fertilizer profile updated.' });
});
app.post('/api/admin/rules', auth, adminOnly, async (req, res) => {
  const ruleName = clean(req.body.ruleName || req.body.name, 150);
  if (!ruleName || !req.body.conditionData || !req.body.recommendations) return res.status(400).json({ message: 'Rule name, condition and recommendations are required.' });
  const row = await store.insert('rules', {
    cropId: clean(req.body.cropId), ruleName,
    conditionData: JSON.stringify(req.body.conditionData), recommendations: JSON.stringify(req.body.recommendations),
    isActive: '1', updatedBy: String(req.user.userId), createdAt: now(), updatedAt: now()
  }, 'ruleId');
  res.status(201).json({ ruleId: Number(row.ruleId), ruleName });
});
app.put('/api/admin/rules', auth, adminOnly, async (req, res) => {
  if (!req.body.ruleId) return res.status(400).json({ message: 'ruleId is required.' });
  const row = await store.update('rules', r => Number(r.ruleId) === Number(req.body.ruleId), r => ({
    ...r, ruleName: clean(req.body.ruleName, 150) || r.ruleName,
    cropId: req.body.cropId === undefined ? r.cropId : clean(req.body.cropId),
    conditionData: req.body.conditionData ? JSON.stringify(req.body.conditionData) : r.conditionData,
    recommendations: req.body.recommendations ? JSON.stringify(req.body.recommendations) : r.recommendations,
    isActive: req.body.isActive === undefined ? r.isActive : (req.body.isActive ? '1' : '0'),
    updatedBy: String(req.user.userId), updatedAt: now()
  }));
  if (!row) return res.status(404).json({ message: 'Rule not found.' });
  res.json({ message: 'Fertilizer rule updated.' });
});
app.get('/api/admin/rules', auth, adminOnly, async (req, res) => {
  const rules = await store.read('rules');
  res.json({ rules: rules.map(r => ({ ...r, conditionData: parse(r.conditionData), recommendations: parse(r.recommendations) })) });
});
app.get('/api/admin/feedback', auth, adminOnly, async (req, res) => {
  const [feedback, users, recommendations] = await Promise.all([
    store.read('feedback'), store.read('users'), store.read('recommendations')
  ]);
  const rows = feedback.map(f => {
    const user = users.find(u => Number(u.userId) === Number(f.userId));
    const rec = recommendations.find(r => Number(r.recId) === Number(f.recId));
    return { ...f, userName: user ? user.name : 'Unknown user', userEmail: user ? user.email : '',
      cropName: rec ? rec.cropName : 'Unknown crop', reviewStatus: f.reviewStatus || 'Pending', adminNote: f.adminNote || '' };
  }).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  res.json({ feedback: rows });
});
app.put('/api/admin/feedback/:id', auth, adminOnly, async (req, res) => {
  const allowed = ['Pending', 'Reviewed', 'Actioned'];
  if (req.body.reviewStatus && !allowed.includes(req.body.reviewStatus)) return res.status(400).json({ message: 'Invalid feedback review status.' });
  const row = await store.update('feedback', f => Number(f.feedbackId) === Number(req.params.id), f => ({
    ...f, reviewStatus: req.body.reviewStatus || f.reviewStatus || 'Reviewed',
    adminNote: req.body.adminNote === undefined ? (f.adminNote || '') : clean(req.body.adminNote, 2000), reviewedAt: now()
  }));
  if (!row) return res.status(404).json({ message: 'Feedback not found.' });
  res.json({ message: 'Feedback review saved.' });
});

/* Static frontend. Inject bridge after the original script, without editing original files. */
const projectRoot = path.resolve(__dirname, '..');
app.get('/', async (req, res) => {
  let html = await fs.readFile(path.join(projectRoot, 'index.html'), 'utf8');
  html = html.replace('</head>', '  <link rel="stylesheet" href="/admin-panel.css">\n</head>');
  html = html.replace('</body>', '  <script src="/integration.js"></script>\n  <script src="/admin-panel.js"></script>\n</body>');
  res.type('html').send(html);
});
app.use(express.static(projectRoot, { index: false }));
app.get('/integration.js', (req, res) => res.sendFile(path.join(__dirname, 'integration.js')));
app.get('/admin-panel.js', (req, res) => res.sendFile(path.join(__dirname, 'admin-panel.js')));
app.get('/admin-panel.css', (req, res) => res.sendFile(path.join(__dirname, 'admin-panel.css')));
app.use((req, res) => res.status(404).json({ message: 'Route not found.' }));

(async () => {
  await store.ensureFiles();
  app.listen(PORT, () => console.log(`TerraGrow is running at http://localhost:${PORT} (CSV file storage)`));
})().catch(error => { console.error(error); process.exit(1); });
