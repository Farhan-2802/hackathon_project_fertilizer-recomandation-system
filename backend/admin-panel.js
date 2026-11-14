(() => {
  'use strict';
  const TOKEN_KEY = 'terragrow_token';
  let currentUser = null;
  let crops = [];
  let fertilizers = [];
  let rules = [];

  const $ = (selector, root = document) => root.querySelector(selector);
  const el = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  };
  const token = () => localStorage.getItem(TOKEN_KEY);
  async function api(url, options = {}) {
    const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
    if (token()) headers.Authorization = `Bearer ${token()}`;
    const response = await fetch(url, { ...options, headers });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.message || `Request failed (${response.status})`);
    return data;
  }
  const notify = message => window.toast ? window.toast(message) : alert(message);
  const json = (value, fallback) => {
    try { return typeof value === 'string' ? JSON.parse(value) : (value ?? fallback); }
    catch (_) { return fallback; }
  };
  const number = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;

  function injectAdminFeedbackView() {
    if ($('#adminFeedback')) return;
    const navs = document.querySelectorAll('#sidebar .nav');
    const managementNav = navs[1] || navs[0];
    const button = el('button');
    button.dataset.view = 'adminFeedback';
    button.innerHTML = '<span class="ico">♡</span> Review user feedback';
    button.addEventListener('click', () => window.showView('adminFeedback'));
    managementNav.append(button);

    const main = $('main');
    const section = el('section', 'view');
    section.id = 'adminFeedback';
    section.innerHTML = `
      <div class="section-head admin-head"><div><h3>User feedback</h3><p>Review ratings and comments submitted with recommendations.</p></div><span class="pill">AGRONOMIST / ADMIN</span></div>
      <div class="panel admin-panel"><div class="admin-panel-title"><div><h3>Feedback inbox</h3><p class="sub">Record your review status and any action taken.</p></div><button class="secondary" id="refreshAdminFeedback" type="button">Refresh</button></div>
      <div id="adminFeedbackList" class="admin-feedback-list"><p class="sub">Loading feedback…</p></div></div>`;
    main.append(section);
    $('#refreshAdminFeedback').addEventListener('click', loadFeedback);
  }

  function applyRole(user) {
    currentUser = user;
    const isAdmin = user && user.role === 'agronomist';
    const managementNav = document.querySelectorAll('#sidebar .nav')[1];
    const managementLabel = document.querySelectorAll('#sidebar .nav-label')[1];
    if (managementLabel) managementLabel.style.display = isAdmin ? '' : 'none';
    if (managementNav) {
      managementNav.querySelectorAll('button[data-view="knowledge"],button[data-view="rules"]').forEach(b => {
        b.style.display = isAdmin ? '' : 'none';
      });
      const feedbackButton = managementNav.querySelector('button[data-view="adminFeedback"]');
      if (feedbackButton) feedbackButton.style.display = isAdmin ? '' : 'none';
    }
    if (isAdmin) {
      injectAdminFeedbackView();
      buildAdminViews();
      loadAdminData().catch(e => notify(e.message));
    } else {
      const feedbackSection = $('#adminFeedback');
      if (feedbackSection) feedbackSection.classList.remove('active');
    }
    const signout = $('#sidebar .side-bottom');
    if (signout) {
      const roleTag = $('#adminRoleTag');
      if (roleTag) roleTag.remove();
      if (user) {
        const tag = el('small', 'admin-role-tag', isAdmin ? 'AGRONOMIST / ADMIN' : 'FARMER / USER');
        tag.id = 'adminRoleTag';
        signout.prepend(tag);
      }
    }
  }

  function buildAdminViews() {
    const knowledge = $('#knowledge');
    if (knowledge && !knowledge.dataset.adminBuilt) {
      knowledge.dataset.adminBuilt = '1';
      knowledge.innerHTML = `
        <div class="section-head admin-head"><div><h3>Knowledge base management</h3><p>Maintain crop profiles and fertilizer catalogue records.</p></div><span class="pill">AGRONOMIST / ADMIN</span></div>
        <div class="admin-management-grid">
          <div class="panel admin-panel">
            <div class="admin-panel-title"><div><h3>Crop profiles</h3><p class="sub">Add or edit crop nutrient thresholds and recommended fertilizers.</p></div></div>
            <div id="adminCropList" class="admin-record-list"></div>
            <form id="cropEditor" class="admin-editor">
              <h4 id="cropEditorTitle">Add crop profile</h4><input type="hidden" id="cropId">
              <label>Crop name</label><input id="cropName" required maxlength="100" placeholder="e.g. Rice">
              <div class="admin-subtitle">Nutrient level thresholds (kg/ha)</div><p class="sub">Enter locally approved cut-offs; leave blank if a threshold is not defined.</p>
              <div class="admin-threshold-grid">
                ${['N','P','K'].map(k => `<div class="admin-threshold"><b>${k}</b><label>Low below</label><input type="number" step="0.1" id="${k.toLowerCase()}Low" value=""><label>Medium below</label><input type="number" step="0.1" id="${k.toLowerCase()}Medium" value=""><label>High above</label><input type="number" step="0.1" id="${k.toLowerCase()}High" value=""></div>`).join('')}
              </div>
              <div class="admin-fields-two"><div><label>Soil pH minimum</label><input id="cropPhMin" type="number" step="0.1" value="5.5"></div><div><label>Soil pH maximum</label><input id="cropPhMax" type="number" step="0.1" value="7.5"></div></div>
              <label>Recommended fertilizers (comma separated)</label><input id="cropFertilizers" placeholder="Urea, DAP, MOP">
              <label>Notes</label><textarea id="cropNotes" rows="2" placeholder="Crop-specific notes"></textarea>
              <div class="admin-actions"><button class="primary" type="submit">Save crop profile</button><button class="secondary" id="cancelCropEdit" type="button">Clear</button></div>
            </form>
          </div>
          <div class="panel admin-panel">
            <div class="admin-panel-title"><div><h3>Fertilizer catalogue</h3><p class="sub">Manage fertilizer type, nutrient composition, default dosage and timing.</p></div></div>
            <div id="adminFertilizerList" class="admin-record-list"></div>
            <form id="fertEditor" class="admin-editor">
              <h4 id="fertEditorTitle">Add fertilizer</h4><input type="hidden" id="fertilizerId">
              <label>Fertilizer name</label><input id="fertName" required placeholder="e.g. Urea">
              <label>Type</label><select id="fertType"><option>Urea</option><option>DAP</option><option>MOP</option><option>Organic</option><option>Other</option></select>
              <div class="admin-fields-three"><div><label>N (%)</label><input id="fertN" type="number" step="0.1" value="0"></div><div><label>P (%)</label><input id="fertP" type="number" step="0.1" value="0"></div><div><label>K (%)</label><input id="fertK" type="number" step="0.1" value="0"></div></div>
              <label>Default dosage (kg/ha)</label><input id="fertDosage" type="number" min="0" step="0.1" value="0">
              <label>Application timing</label><input id="fertTiming" placeholder="e.g. Basal / sowing">
              <label>Instructions</label><textarea id="fertInstructions" rows="2"></textarea>
              <div class="admin-actions"><button class="primary" type="submit">Save fertilizer</button><button class="secondary" id="cancelFertEdit" type="button">Clear</button></div>
            </form>
          </div>
        </div>`;
      $('#cropEditor').addEventListener('submit', saveCrop);
      $('#fertEditor').addEventListener('submit', saveFertilizer);
      $('#cancelCropEdit').addEventListener('click', resetCropForm);
      $('#cancelFertEdit').addEventListener('click', resetFertilizerForm);
    }

    const rulesView = $('#rules');
    if (rulesView && !rulesView.dataset.adminBuilt) {
      rulesView.dataset.adminBuilt = '1';
      rulesView.innerHTML = `
        <div class="section-head admin-head"><div><h3>Fertilizer rules & default dosage</h3><p>Adjust the conditions that drive fertilizer recommendations.</p></div><span class="pill">AGRONOMIST / ADMIN</span></div>
        <div class="panel admin-panel"><div class="admin-panel-title"><div><h3>Recommendation rules</h3><p class="sub">A matching active rule is used when a farmer requests a recommendation.</p></div><button class="secondary" id="refreshRules" type="button">Refresh</button></div>
          <div id="adminRuleList" class="admin-record-list"></div>
          <form id="ruleEditor" class="admin-editor">
            <h4 id="ruleEditorTitle">Add fertilizer rule</h4><input id="ruleId" type="hidden">
            <label>Rule name</label><input id="ruleName" required placeholder="e.g. Low nitrogen for vegetative growth">
            <label>Crop profile</label><select id="ruleCrop"><option value="">All crops</option></select>
            <div class="admin-fields-two">
              <div><label>N condition</label><select id="ruleN"><option value="">Any</option><option>Low</option><option>Medium</option><option>High</option></select></div>
              <div><label>P condition</label><select id="ruleP"><option value="">Any</option><option>Low</option><option>Medium</option><option>High</option></select></div>
              <div><label>K condition</label><select id="ruleK"><option value="">Any</option><option>Low</option><option>Medium</option><option>High</option></select></div>
              <div><label>Growth stage</label><select id="ruleStage"><option value="">Any stage</option><option>Sowing</option><option>Vegetative</option><option>Flowering</option><option>Fruiting</option></select></div>
              <div><label>Soil pH below (optional)</label><input id="rulePhBelow" type="number" step="0.1" placeholder="e.g. 5.5"></div>
              <div><label>Fertilizer</label><input id="ruleFertilizer" required placeholder="e.g. Urea"></div>
              <div><label>Dosage (kg/ha)</label><input id="ruleRate" type="number" min="0" step="0.1" required></div>
              <div><label>Application timing</label><input id="ruleTiming" placeholder="e.g. At sowing"></div>
            </div>
            <label>Recommendation note</label><textarea id="ruleReason" rows="2" placeholder="Why this recommendation is suitable"></textarea>
            <label class="admin-check"><input type="checkbox" id="ruleActive" checked> Rule active</label>
            <div class="admin-actions"><button class="primary" type="submit">Save rule</button><button class="secondary" id="cancelRuleEdit" type="button">Clear</button></div>
          </form>
        </div>`;
      $('#ruleEditor').addEventListener('submit', saveRule);
      $('#cancelRuleEdit').addEventListener('click', resetRuleForm);
      $('#refreshRules').addEventListener('click', loadRules);
    }
  }

  async function loadAdminData() {
    await Promise.all([loadCropsAndFertilizers(), loadRules(), loadFeedback()]);
  }
  async function loadCropsAndFertilizers() {
    const data = await api('/api/kb');
    crops = data.crops || [];
    fertilizers = data.fertilizers || [];
    renderCropList();
    renderFertilizerList();
    const select = $('#ruleCrop');
    if (select) {
      select.innerHTML = '<option value="">All crops</option>';
      crops.forEach(c => select.append(new Option(c.cropName, c.cropId)));
    }
  }
  function renderCropList() {
    const list = $('#adminCropList'); if (!list) return;
    list.replaceChildren();
    if (!crops.length) list.append(el('p','admin-empty','No crop profiles yet.'));
    crops.forEach(c => {
      const row = el('div','admin-record');
      const details = el('div','admin-record-info');
      details.append(el('b','',c.cropName));
      const npk = json(c.typicalNPK,{});
      const thresholdText = ['N','P','K'].map(k => `${k}: ${npk[k]?.low ?? '—'}/${npk[k]?.medium ?? '—'}/${npk[k]?.high ?? '—'}`).join(' · ');
      details.append(el('small','',thresholdText));
      row.append(details);
      const edit = el('button','secondary admin-small-btn','Edit');
      edit.type='button'; edit.addEventListener('click',()=>editCrop(c));
      row.append(edit); list.append(row);
    });
  }
  function editCrop(c) {
    const npk=json(c.typicalNPK,{});
    $('#cropId').value=c.cropId; $('#cropName').value=c.cropName;
    ['N','P','K'].forEach(k=>{
      const vals=npk[k]||{};
      $(`#${k.toLowerCase()}Low`).value=vals.low ?? '';
      $(`#${k.toLowerCase()}Medium`).value=vals.medium ?? '';
      $(`#${k.toLowerCase()}High`).value=vals.high ?? '';
    });
    $('#cropPhMin').value=npk.ph?.min ?? 5.5; $('#cropPhMax').value=npk.ph?.max ?? 7.5;
    const ferts=json(c.recommendedFertilizers,[]);
    $('#cropFertilizers').value=(Array.isArray(ferts)?ferts.map(f=>typeof f==='string'?f:f.fertilizer||f.name).filter(Boolean):[]).join(', ');
    $('#cropNotes').value=c.notes||''; $('#cropEditorTitle').textContent='Edit crop profile';
    $('#cropName').focus();
  }
  function resetCropForm() {
    $('#cropEditor').reset(); $('#cropId').value=''; $('#cropEditorTitle').textContent='Add crop profile';
    ['n','p','k'].forEach(k=>{ $(`#${k}Low`).value=''; $(`#${k}Medium`).value=''; $(`#${k}High`).value=''; });
    $('#cropPhMin').value=5.5; $('#cropPhMax').value=7.5;
  }
  async function saveCrop(event) {
    event.preventDefault();
    const typicalNPK={};
    ['N','P','K'].forEach(k=>{
      typicalNPK[k]={low:$(`#${k.toLowerCase()}Low`).value===''?null:number($(`#${k.toLowerCase()}Low`).value),medium:$(`#${k.toLowerCase()}Medium`).value===''?null:number($(`#${k.toLowerCase()}Medium`).value),high:$(`#${k.toLowerCase()}High`).value===''?null:number($(`#${k.toLowerCase()}High`).value)};
    });
    typicalNPK.ph={min:number($('#cropPhMin').value),max:number($('#cropPhMax').value)};
    const body={cropName:$('#cropName').value.trim(),typicalNPK,
      recommendedFertilizers:$('#cropFertilizers').value.split(',').map(x=>x.trim()).filter(Boolean),
      notes:$('#cropNotes').value.trim()};
    const id=$('#cropId').value;
    try {
      if(id) await api(`/api/admin/crops/${id}`,{method:'PUT',body:JSON.stringify(body)});
      else await api('/api/admin/crops',{method:'POST',body:JSON.stringify(body)});
      notify(id?'Crop profile updated.':'Crop profile added.');
      resetCropForm(); await loadCropsAndFertilizers();
    } catch(e){notify(e.message);}
  }
  function renderFertilizerList() {
    const list=$('#adminFertilizerList'); if(!list)return;
    list.replaceChildren();
    if(!fertilizers.length)list.append(el('p','admin-empty','No fertilizer entries yet.'));
    fertilizers.forEach(f=>{
      const row=el('div','admin-record');
      const info=el('div','admin-record-info');
      info.append(el('b','',f.name));
      info.append(el('small','',`${f.type} · ${f.defaultDosageKgPerHa||0} kg/ha · ${f.applicationTiming||'Timing not set'}`));
      row.append(info);
      const edit=el('button','secondary admin-small-btn','Edit'); edit.type='button'; edit.addEventListener('click',()=>editFertilizer(f));
      row.append(edit);list.append(row);
    });
  }
  function editFertilizer(f) {
    const comp=json(f.nutrientComposition,{});
    $('#fertilizerId').value=f.fertilizerId; $('#fertName').value=f.name; $('#fertType').value=f.type||'Other';
    $('#fertN').value=comp.N??0; $('#fertP').value=comp.P??0; $('#fertK').value=comp.K??0;
    $('#fertDosage').value=f.defaultDosageKgPerHa??0; $('#fertTiming').value=f.applicationTiming||'';
    $('#fertInstructions').value=f.instructions||''; $('#fertEditorTitle').textContent='Edit fertilizer';
  }
  function resetFertilizerForm(){ $('#fertEditor').reset();$('#fertilizerId').value='';$('#fertEditorTitle').textContent='Add fertilizer'; }
  async function saveFertilizer(event){
    event.preventDefault();
    const body={name:$('#fertName').value.trim(),type:$('#fertType').value,
      nutrientComposition:{N:number($('#fertN').value),P:number($('#fertP').value),K:number($('#fertK').value)},
      defaultDosageKgPerHa:number($('#fertDosage').value),applicationTiming:$('#fertTiming').value.trim(),
      instructions:$('#fertInstructions').value.trim()};
    const id=$('#fertilizerId').value;
    try{
      if(id)await api(`/api/admin/fertilizers/${id}`,{method:'PUT',body:JSON.stringify(body)});
      else await api('/api/admin/fertilizers',{method:'POST',body:JSON.stringify(body)});
      notify(id?'Fertilizer updated.':'Fertilizer added.');resetFertilizerForm();await loadCropsAndFertilizers();
    }catch(e){notify(e.message);}
  }

  async function loadRules(){
    try{
      const data=await api('/api/admin/rules');rules=data.rules||[];renderRules();
    }catch(e){notify(e.message);}
  }
  function renderRules(){
    const list=$('#adminRuleList');if(!list)return;list.replaceChildren();
    if(!rules.length)list.append(el('p','admin-empty','No rules saved yet.'));
    rules.forEach(r=>{
      const row=el('div','admin-record');
      const info=el('div','admin-record-info');info.append(el('b','',r.ruleName));
      const condition=json(r.conditionData,{});
      const recommendation=json(r.recommendations,[]);
      const conditionLabel=Object.entries(condition).map(([k,v])=>`${k}: ${v}`).join(' · ')||'General condition';
      const recLabel=recommendation.map(x=>`${x.fertilizer||x.name||'Fertilizer'} ${x.rateKgPerHa??x.rate??''} kg/ha`).join(', ');
      info.append(el('small','',`${conditionLabel} → ${recLabel} · ${r.isActive==='0'?'Inactive':'Active'}`));
      row.append(info);const edit=el('button','secondary admin-small-btn','Edit');edit.type='button';edit.addEventListener('click',()=>editRule(r));row.append(edit);list.append(row);
    });
  }
  function editRule(r){
    const c=json(r.conditionData,{}), rec=(json(r.recommendations,[])[0]||{});
    $('#ruleId').value=r.ruleId;$('#ruleName').value=r.ruleName;
    $('#ruleCrop').value=r.cropId||'';
    $('#ruleN').value=c.n||c.nitrogen||'';$('#ruleP').value=c.p||c.phosphorus||'';$('#ruleK').value=c.k||c.potassium||'';
    $('#ruleStage').value=c.growthStage||c.stage||'';
    $('#rulePhBelow').value=c.phBelow??'';
    $('#ruleFertilizer').value=rec.fertilizer||rec.name||'';
    $('#ruleRate').value=rec.rateKgPerHa??rec.rate??0;
    $('#ruleTiming').value=rec.timing||rec.applicationTiming||'';
    $('#ruleReason').value=rec.reason||'';
    $('#ruleActive').checked=r.isActive!=='0';$('#ruleEditorTitle').textContent='Edit fertilizer rule';
  }
  function resetRuleForm(){$('#ruleEditor').reset();$('#ruleId').value='';$('#ruleEditorTitle').textContent='Add fertilizer rule';$('#ruleActive').checked=true;}
  async function saveRule(event){
    event.preventDefault();
    const conditionData={};
    ['n','p','k'].forEach(k=>{if($(`#rule${k.toUpperCase()}`).value)conditionData[k]=$(`#rule${k.toUpperCase()}`).value;});
    if($('#ruleStage').value)conditionData.growthStage=$('#ruleStage').value;
    if($('#rulePhBelow').value!=='')conditionData.phBelow=number($('#rulePhBelow').value);
    const body={ruleName:$('#ruleName').value.trim(),cropId:$('#ruleCrop').value,
      conditionData,recommendations:[{fertilizer:$('#ruleFertilizer').value.trim(),rateKgPerHa:number($('#ruleRate').value),
        timing:$('#ruleTiming').value.trim(),reason:$('#ruleReason').value.trim()}],isActive:$('#ruleActive').checked};
    const id=$('#ruleId').value;
    try{
      if(id){body.ruleId=id;await api('/api/admin/rules',{method:'PUT',body:JSON.stringify(body)});}
      else await api('/api/admin/rules',{method:'POST',body:JSON.stringify(body)});
      notify(id?'Fertilizer rule updated.':'Fertilizer rule added.');resetRuleForm();await loadRules();
    }catch(e){notify(e.message);}
  }

  async function loadFeedback(){
    const list=$('#adminFeedbackList');if(!list||!currentUser||currentUser.role!=='agronomist')return;
    try{
      const data=await api('/api/admin/feedback');list.replaceChildren();
      const rows=data.feedback||[];
      if(!rows.length){list.append(el('p','admin-empty','No user feedback submitted yet.'));return;}
      rows.forEach(f=>{
        const card=el('article','admin-feedback-card');
        const top=el('div','admin-feedback-top');
        const identity=el('div');identity.append(el('b','',`${f.userName} · ${f.cropName}`),el('small','',`${f.userEmail} · ${new Date(f.createdAt).toLocaleString()}`));
        top.append(identity,el('span','admin-rating',`★ ${f.rating}/5`));card.append(top);
        card.append(el('p','admin-feedback-comment',f.comments||'No comment provided.'));
        const controls=el('div','admin-feedback-controls');
        const status=el('select');['Pending','Reviewed','Actioned'].forEach(v=>status.append(new Option(v,v)));
        status.value=f.reviewStatus||'Pending';
        const note=el('textarea');note.rows=2;note.placeholder='Admin review note / action taken';note.value=f.adminNote||'';
        const save=el('button','primary','Save review');save.type='button';
        save.addEventListener('click',async()=>{
          try{await api(`/api/admin/feedback/${f.feedbackId}`,{method:'PUT',body:JSON.stringify({reviewStatus:status.value,adminNote:note.value})});notify('Feedback review saved.');}
          catch(e){notify(e.message);}
        });
        controls.append(status,note,save);card.append(controls);list.append(card);
      });
    }catch(e){list.replaceChildren(el('p','admin-empty',e.message));}
  }

  function bindAuthLifecycle(){
    if(typeof window.authenticate==='function'){
      const original=window.authenticate;
      window.authenticate=async function(...args){
        await original.apply(this,args);
        const t=token();if(!t)return;
        try{const data=await api('/api/auth/me');applyRole(data.user);}catch(_){}
      };
    }
    if(typeof window.logout==='function'){
      const originalLogout=window.logout;
      window.logout=function(...args){originalLogout.apply(this,args);currentUser=null;applyRole(null);};
    }
    const originalShow=window.showView;
    if(typeof originalShow==='function'){
      window.showView=function(id){
        if((id==='knowledge'||id==='rules'||id==='adminFeedback')&&(!currentUser||currentUser.role!=='agronomist')){
          notify('Agronomist/admin login is required for this section.');return;
        }
        originalShow(id);
        if(id==='adminFeedback')loadFeedback();
        const title=$('#pageTitle');if(title&&id==='adminFeedback')title.textContent='Review user feedback';
      };
    }
  }

  document.addEventListener('DOMContentLoaded',async()=>{
    bindAuthLifecycle();
    injectAdminFeedbackView();
    window.addEventListener('terragrow:session-ready', event => {
      if (event.detail && event.detail.user) applyRole(event.detail.user);
    });
    applyRole(null);
  });
})();
