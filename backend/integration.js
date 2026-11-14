(() => {
  'use strict';
  const KEY = 'terragrow_token';
  let ratingValue = 0;
  let activeRecommendationId = null;

  async function api(url, options = {}) {
    const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
    const token = localStorage.getItem(KEY);
    if (token) headers.Authorization = `Bearer ${token}`;
    const response = await fetch(url, { ...options, headers });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.message || 'Request failed.');
    return body;
  }
  const toast = msg => typeof window.toast === 'function' ? window.toast(msg) : alert(msg);
  function showError(msg) {
    const el = document.getElementById('authError');
    el.textContent = msg;
    el.style.display = 'block';
  }
  function setProfile(user) {
    const name = user.name || user.email.split('@')[0];
    document.getElementById('profileName').textContent = name;
    document.getElementById('profileAvatar').textContent = (name[0] || 'F').toUpperCase();
  }

  async function loadHistory() {
    const data = await api(`/api/recommendations/user/${window.__tgUserId}`);
    const saved = (data.recommendations || []).filter(r => r.isSaved === '1');
    const body = document.getElementById('historyRows');
    body.replaceChildren();
    saved.forEach(r => {
      const tr = document.createElement('tr');
      [`🌱 ${r.cropName}`, r.growthStage, `${r.area} ${r.areaUnit === 'hectare' ? 'ha' : 'acres'}`,
       new Date(r.savedAt || r.generatedAt).toLocaleDateString()].forEach(value => {
        const td = document.createElement('td'); td.textContent = value; tr.append(td);
      });
      const statusCell = document.createElement('td');
      const status = document.createElement('span'); status.className = 'status'; status.textContent = 'Saved';
      statusCell.append(status); tr.append(statusCell);
      const actionCell = document.createElement('td');
      const button = document.createElement('button'); button.className = 'text-btn'; button.textContent = 'View';
      button.addEventListener('click', () => openRecommendation(r.recId));
      actionCell.append(button); tr.append(actionCell); body.append(tr);
    });
    if (!saved.length) body.innerHTML = '<tr><td colspan="6" class="empty">No saved recommendations yet.</td></tr>';
    document.getElementById('statCount').textContent = String(saved.length).padStart(2, '0');

    const recent = document.getElementById('recentList');
    recent.replaceChildren();
    saved.slice(0, 5).forEach(r => {
      const row = document.createElement('div'); row.className = 'activity';
      const icon = document.createElement('div'); icon.className = 'crop-icon'; icon.textContent = '🌱';
      const info = document.createElement('div');
      const title = document.createElement('b'); title.textContent = `${r.cropName} · ${r.growthStage}`;
      const small = document.createElement('small'); small.textContent = `${r.area} ${r.areaUnit === 'hectare' ? 'hectares' : 'acres'} · ${new Date(r.savedAt || r.generatedAt).toLocaleDateString()}`;
      info.append(title, small);
      const pill = document.createElement('span'); pill.className = 'pill'; pill.textContent = 'Saved';
      row.append(icon, info, pill); recent.append(row);
    });
    if (!saved.length) recent.innerHTML = '<div class="empty">No recommendations saved yet.</div>';
  }

  async function loadKnowledge() {
    const data = await api('/api/kb');
    const cropList = document.getElementById('cropList');
    cropList.replaceChildren();
    (data.crops || []).forEach(c => {
      const row = document.createElement('div'); row.className = 'activity';
      const icon = document.createElement('div'); icon.className = 'crop-icon'; icon.textContent = '🌱';
      const info = document.createElement('div');
      const title = document.createElement('b'); title.textContent = c.cropName;
      const small = document.createElement('small'); small.textContent = 'Crop profile';
      info.append(title, small); row.append(icon, info); cropList.append(row);
    });
    const cropForm = document.createElement('div'); cropForm.className = 'mini-form';
    cropForm.innerHTML = '<input id="newCrop" placeholder="Add crop name"><button class="primary" id="addCropButton" type="button">Add</button>';
    cropList.append(cropForm); document.getElementById('addCropButton').addEventListener('click', window.addCrop);

    const panel = document.querySelector('#knowledge .admin-grid .panel:nth-child(2)');
    panel.querySelectorAll('.activity').forEach(el => el.remove());
    const form = panel.querySelector('.mini-form');
    (data.fertilizers || []).forEach(f => {
      const row = document.createElement('div'); row.className = 'activity';
      const icon = document.createElement('div'); icon.className = 'crop-icon'; icon.textContent = '🧪';
      const info = document.createElement('div');
      const title = document.createElement('b'); title.textContent = f.name;
      const small = document.createElement('small'); small.textContent = `${f.type} · ${f.instructions || 'Fertilizer catalogue'}`;
      info.append(title, small); row.append(icon, info); panel.insertBefore(row, form);
    });
  }
  async function refresh() { await Promise.all([loadHistory(), loadKnowledge()]); }

  function renderRecommendation(result, meta) {
    document.getElementById('resultMeta').textContent = meta;
    const cards = document.getElementById('fertCards'); cards.replaceChildren();
    (result.items || []).forEach((item, index) => {
      const card = document.createElement('div'); card.className = 'fert';
      const top = document.createElement('div'); top.className = 'fert-top';
      const pill = document.createElement('span'); pill.className = 'pill'; pill.textContent = index === 0 ? 'Priority suggestion' : 'Nutrient support';
      const emoji = document.createElement('span'); emoji.textContent = '🧪'; top.append(pill, emoji);
      const heading = document.createElement('h4'); heading.textContent = item.name;
      const why = document.createElement('p'); why.textContent = item.why;
      const qty = document.createElement('div'); qty.className = 'qty';
      qty.textContent = item.quantity == null ? 'Expert review' : `${item.quantity} `;
      if (item.quantity != null) { const small = document.createElement('small'); small.textContent = 'kg estimated for your field'; qty.append(small); }
      const hint = document.createElement('p'); hint.className = 'hint'; hint.textContent = item.rate ? `${item.rate} kg/ha · illustrative demo rate` : '';
      card.append(top, heading, why, qty, hint); cards.append(card);
    });
    const schedule = document.getElementById('schedule'); schedule.replaceChildren();
    (result.schedule || []).forEach(s => {
      const row = document.createElement('div'); row.className = 'timing';
      const dot = document.createElement('span'); dot.className = 'dot';
      const info = document.createElement('div');
      const title = document.createElement('b'); title.textContent = s.timing;
      const p = document.createElement('p'); p.textContent = s.instruction;
      info.append(title, p); row.append(dot, info); schedule.append(row);
    });
  }

  async function openRecommendation(id) {
    try {
      const data = await api(`/api/recommendations/${id}`);
      const r = data.recommendation;
      activeRecommendationId = Number(r.recId);
      const generated = typeof r.generatedRecommendations === 'string' ? JSON.parse(r.generatedRecommendations) : r.generatedRecommendations;
      renderRecommendation(generated, `${r.cropName} · ${r.growthStage} stage · ${r.area} ${r.areaUnit}`);
      window.showView('result');
    } catch (e) { toast(e.message); }
  }

  window.authenticate = async function () {
    const mode = document.getElementById('registerTab').classList.contains('active') ? 'register' : 'login';
    const name = document.getElementById('authName').value.trim();
    const email = document.getElementById('authEmail').value.trim();
    const password = document.getElementById('authPassword').value;
    if (mode === 'register' && !name) return showError('Please enter your name.');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return showError('Please enter a valid email address.');
    if (mode === 'register' && password.length < 8) return showError('Use at least 8 characters for your password.');
    if (mode === 'login' && !password) return showError('Please enter your password.');
    const button = document.getElementById('authSubmit'); const oldText = button.textContent;
    button.disabled = true; button.textContent = 'Please wait...';
    try {
      if (mode === 'register') {
        await api('/api/auth/register', { method: 'POST', body: JSON.stringify({ name, email, password }) });
        window.setAuthMode('login');
        document.getElementById('authEmail').value = email;
        document.getElementById('authPassword').value = '';
        document.getElementById('authIntro').textContent = 'Account created. Please sign in with your new credentials.';
        toast('Account created. Now sign in.');
        return;
      }
      const data = await api('/api/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) });
      localStorage.setItem(KEY, data.token);
      window.__tgUserId = data.user.userId;
      setProfile(data.user);
      document.getElementById('authScreen').style.display = 'none';
      document.getElementById('authPassword').value = '';
      await refresh();
      window.showView('dashboard');
      toast('Welcome back to TerraGrow!');
    } catch (e) { showError(e.message); }
    finally { button.disabled = false; button.textContent = oldText; }
  };

  window.logout = function () {
    localStorage.removeItem(KEY);
    window.__tgUserId = null;
    activeRecommendationId = null;
    document.getElementById('authScreen').style.display = 'grid';
    document.getElementById('authPassword').value = '';
    document.getElementById('authError').style.display = 'none';
    window.setAuthMode('login');
  };

  const oldGenerate = window.generatePlan;
  window.generatePlan = async function () {
    oldGenerate();
    try {
      const plan = currentPlan;
      if (!plan) return;
      const data = await api('/api/recommendations/request', { method: 'POST', body: JSON.stringify(plan) });
      activeRecommendationId = data.recId;
      renderRecommendation(data.recommendation, `${plan.crop} · ${plan.stage} stage · ${plan.area} ${plan.unit}${plan.location ? ' · ' + plan.location : ''}`);
    } catch (e) { toast(`Could not save generated request: ${e.message}`); }
  };

  window.savePlan = async function () {
    if (!activeRecommendationId) return toast('Generate a recommendation first.');
    try {
      await api(`/api/recommendations/${activeRecommendationId}/save`, { method: 'POST' });
      await loadHistory();
      toast('Recommendation saved to CSV files.');
      window.showView('history');
    } catch (e) { toast(e.message); }
  };

  window.addCrop = async function () {
    const input = document.getElementById('newCrop');
    const cropName = input.value.trim();
    if (!cropName) return;
    try {
      await api('/api/admin/crops', { method: 'POST', body: JSON.stringify({ cropName }) });
      await loadKnowledge(); toast('Crop added to CSV storage.');
    } catch (e) { toast(e.message); }
  };
  window.addFert = async function () {
    const input = document.getElementById('newFert'); const name = input.value.trim();
    if (!name) return;
    try {
      await api('/api/admin/fertilizers', { method: 'POST', body: JSON.stringify({ name, type: 'Other' }) });
      input.value = ''; await loadKnowledge(); toast('Fertilizer added to CSV storage.');
    } catch (e) { toast(e.message); }
  };

  window.rate = function (value) {
    ratingValue = Number(value);
    document.querySelectorAll('#stars span').forEach((s, i) => s.textContent = i < ratingValue ? '★' : '☆');
  };
  window.sendFeedback = async function () {
    const comments = document.getElementById('comment').value.trim();
    if (!ratingValue) return toast('Please select a star rating first.');
    if (!activeRecommendationId) return toast('Generate or open a recommendation first.');
    try {
      await api(`/api/recommendations/${activeRecommendationId}/feedback`, {
        method: 'POST', body: JSON.stringify({ rating: ratingValue, comments })
      });
      document.getElementById('comment').value = ''; ratingValue = 0; window.rate(0);
      toast('Feedback saved to CSV files.');
    } catch (e) { toast(e.message); }
  };

  document.addEventListener('DOMContentLoaded', async () => {
    const token = localStorage.getItem(KEY);
    if (!token) return;
    try {
      const data = await api('/api/auth/me');
      window.__tgUserId = data.user.userId; setProfile(data.user);
      document.getElementById('authScreen').style.display = 'none';
      await refresh();
      window.dispatchEvent(new CustomEvent('terragrow:session-ready', { detail: { user: data.user } }));
    } catch (_) { localStorage.removeItem(KEY); }
  });
})();
