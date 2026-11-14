let currentPlan = null, savedCount = 3, rating = 0;

let authMode = 'login';
function setAuthMode(mode) {
    authMode = mode; document.getElementById('loginTab').classList.toggle('active', mode === 'login'); document.getElementById('registerTab').classList.toggle('active', mode === 'register');
    document.getElementById('nameField').style.display = mode === 'register' ? 'block' : 'none'; document.getElementById('authOptions').style.display = mode === 'login' ? 'flex' : 'none';
    document.getElementById('authHeading').textContent = mode === 'login' ? 'Welcome back' : 'Create your farm account';
    document.getElementById('authIntro').textContent = mode === 'login' ? '' : '.';
    document.getElementById('authSubmit').innerHTML = mode === 'login' ? 'Sign in to TerraGrow&nbsp; →' : 'Create my account&nbsp; →'; document.getElementById('authPassword').autocomplete = mode === 'login' ? 'current-password' : 'new-password'; document.getElementById('authError').style.display = 'none';
}
function togglePassword() { let p = document.getElementById('authPassword'); p.type = p.type === 'password' ? 'text' : 'password'; document.querySelector('.show-pass').textContent = p.type === 'password' ? 'Show' : 'Hide' }
function authenticate() {
    const email = document.getElementById('authEmail').value.trim(), pass = document.getElementById('authPassword').value, name = document.getElementById('authName').value.trim(), err = document.getElementById('authError');
    if (authMode === 'register' && !name) { err.textContent = 'Please enter your name to create an account.'; err.style.display = 'block'; return }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { err.textContent = 'Please enter a valid email address.'; err.style.display = 'block'; return }
    if (pass.length < 4) { err.textContent = 'Please enter a password with at least 4 characters.'; err.style.display = 'block'; return }
    const displayName = authMode === 'register' ? name : email.split('@')[0].replace(/[._-]/g, ' ');
    document.getElementById('profileName').textContent = displayName; document.getElementById('profileAvatar').textContent = (displayName.trim()[0] || 'F').toUpperCase();
    document.getElementById('authScreen').style.display = 'none'; toast(authMode === 'register' ? 'Welcome to TerraGrow! Demo account created.' : 'Welcome back to TerraGrow!');
}
function logout() { document.getElementById('authScreen').style.display = 'grid'; document.getElementById('authPassword').value = ''; document.getElementById('authError').style.display = 'none'; setAuthMode('login') }

const titles = { dashboard: 'Good morning, farmer 🌱', new: 'Let’s understand your field', result: 'Your field, your plan', history: 'Your saved plans', knowledge: 'Grow your knowledge base', rules: 'The logic behind the plan', feedback: 'Your voice matters' };
function showView(id) { document.querySelectorAll('.view').forEach(v => v.classList.remove('active')); document.getElementById(id).classList.add('active'); document.querySelectorAll('.nav button').forEach(b => b.classList.toggle('active', b.dataset.view === id)); document.getElementById('pageTitle').textContent = titles[id] || 'TerraGrow'; document.getElementById('sidebar').classList.remove('open'); window.scrollTo(0, 0) }
document.querySelectorAll('.nav button').forEach(b => b.addEventListener('click', () => showView(b.dataset.view)));
function toggleMenu() { document.getElementById('sidebar').classList.toggle('open') }
function toast(msg) { let t = document.getElementById('toast'); t.textContent = msg; t.classList.add('show'); setTimeout(() => t.classList.remove('show'), 2400) }
function generatePlan() {
    const area = Number(document.getElementById('area').value), ph = Number(document.getElementById('ph').value);
    if (!area || area <= 0 || !Number.isFinite(area)) { toast('Please enter a valid field area.'); return }
    if (!Number.isFinite(ph) || ph < 0 || ph > 14) { toast('Please enter a valid soil pH between 0 and 14.'); return }
    const unit = document.getElementById('unit').value, ha = unit === 'acre' ? area * .404686 : area;
    const crop = document.getElementById('crop').value, stage = document.getElementById('stage').value, n = document.getElementById('n').value, p = document.getElementById('p').value, k = document.getElementById('k').value;
    let items = [];
    if (n === 'Low' || stage === 'Vegetative') items.push({ name: 'Urea', why: 'Nitrogen support for healthy leaf and stem growth.', rate: n === 'Low' ? 55 : 35 });
    if (p === 'Low' || stage === 'Sowing') items.push({ name: 'DAP', why: 'Supports early root development and establishment.', rate: p === 'Low' ? 50 : 35 });
    if (k === 'Low' || stage === 'Flowering' || stage === 'Fruiting') items.push({ name: 'MOP', why: 'Potassium support during reproductive growth.', rate: k === 'Low' ? 40 : 25 });
    if (items.length === 0) items.push({ name: 'Well-decomposed compost', why: 'Organic matter support. Maintain soil health and retest as needed.', rate: 1000 });
    if (ph < 5.5) items.push({ name: 'Soil pH review', why: 'Soil is acidic. Seek local agronomist advice before any corrective amendment.', rate: 0 });
    currentPlan = { crop, stage, area, unit, ha, ph, n, p, k, items, location: document.getElementById('location').value, farm: document.getElementById('farmName').value };
    document.getElementById('resultMeta').textContent = `${crop} · ${stage} stage · ${area} ${unit}${currentPlan.location ? ' · ' + currentPlan.location : ''}`;
    document.getElementById('fertCards').innerHTML = items.map((x, i) => `<div class="fert"><div class="fert-top"><span class="pill">${i === 0 ? 'Priority suggestion' : 'Nutrient support'}</span><span>🧪</span></div><h4>${x.name}</h4><p>${x.why}</p><div class="qty">${x.rate ? Math.round(x.rate * ha * 10) / 10 : 'Expert review'} <small>${x.rate ? 'kg estimated for your field' : ' '}</small></div><p class="hint">${x.rate ? x.rate + ' kg/ha · illustrative demo rate' : ''}</p></div>`).join('');
    const stages = [['At planting / next application', 'Apply the suitable basal nutrients according to the crop calendar and local soil-test guidance.'], ['During ' + stage.toLowerCase() + ' growth', 'Monitor crop colour and growth. Apply split nitrogen only when advised for the crop.'], ['Before the next growth stage', 'Reassess crop condition and soil moisture; avoid application immediately before heavy rain.']];
    document.getElementById('schedule').innerHTML = stages.map(s => `<div class="timing"><span class="dot"></span><div><b>${s[0]}</b><p>${s[1]}</p></div></div>`).join('');
    showView('result');
}
function savePlan() { if (!currentPlan) { toast('Generate a plan first.'); return } savedCount++; document.getElementById('statCount').textContent = String(savedCount).padStart(2, '0'); let p = currentPlan; let tr = document.createElement('tr'); tr.innerHTML = `<td>🌱 ${p.crop}</td><td>${p.stage}</td><td>${p.area} ${p.unit === 'hectare' ? 'ha' : 'acres'}</td><td>Just now</td><td><span class="status">Saved</span></td><td><button class="text-btn" onclick="toast('This is a saved demo plan')">View</button></td>`; document.getElementById('historyRows').prepend(tr); let a = document.createElement('div'); a.className = 'activity'; a.innerHTML = `<div class="crop-icon">🌱</div><div><b>${p.crop} · ${p.stage}</b><small>${p.area} ${p.unit === 'hectare' ? 'hectares' : 'acres'} · Just now</small></div><span class="pill">Saved</span>`; document.getElementById('recentList').prepend(a); toast('Recommendation saved in this demo session!'); showView('history') }
function addCrop() { let v = document.getElementById('newCrop').value.trim(); if (!v) return; let d = document.createElement('div'); d.className = 'activity'; d.innerHTML = `<div class="crop-icon">🌱</div><div><b>${v}</b><small>New crop profile · Demo</small></div><span class="pill">Added</span>`; document.getElementById('cropList').append(d); document.getElementById('newCrop').value = ''; toast('Crop added to demo knowledge base.') }
function addFert() { let v = document.getElementById('newFert').value.trim(); if (!v) return; let d = document.createElement('div'); d.className = 'activity'; d.innerHTML = `<div class="crop-icon">🧪</div><div><b>${v}</b><small>New fertilizer · Demo</small></div><span class="pill">Added</span>`; document.getElementById('newFert').value = ''; document.querySelector('#knowledge .admin-grid .panel:nth-child(2)').insertBefore(d, document.querySelector('#knowledge .admin-grid .panel:nth-child(2) .mini-form')); toast('Fertilizer added to demo catalogue.') }
function rate(n) { rating = n; document.querySelectorAll('#stars span').forEach((s, i) => s.textContent = i < n ? '★' : '☆') }
function sendFeedback() { if (!rating) { toast('Please select a star rating first.'); return } document.getElementById('comment').value = ''; rating = 0; rate(0); toast('Thank you! Feedback recorded in this demo.') }
document.getElementById('dateLine').textContent = new Intl.DateTimeFormat('en', { weekday: 'long', month: 'long', day: 'numeric' }).format(new Date()).toUpperCase();
