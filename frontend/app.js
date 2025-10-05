/**
 * RecrAI - SPA Frontend (meuapp completo + dashboard PRO)
 * - Sem dependências externas (apenas RemixIcon via index.html)
 * - Canvas puro para gráficos interativos
 * - Dispara 'recrAI:ready' após a 1ª view renderizar (para fechar o splash)
 */

document.addEventListener('DOMContentLoaded', () => {
  // =====================================================================
  // STATE
  // =====================================================================
  const state = {
    theme: localStorage.getItem('recrai-theme') || 'dark',
    api: {
      url: localStorage.getItem('recrai-backend-url') || window.BACKEND_URL || '',
      prefix: localStorage.getItem('recrai-api-prefix')  || window.API_PREFIX  || '',
    },
    selectedJobId: localStorage.getItem('recrai-selected-job-id') || '',
    compareIds: JSON.parse(localStorage.getItem('recrai-compare-list') || '[]'),
    hiddenCvIds: JSON.parse(localStorage.getItem('recrai-hidden-cvs') || '[]'),

    // dashboard runtime
    autoRefresh: JSON.parse(localStorage.getItem('recrai-dash-autorefresh') || 'false'),
    autoTimer: null,
  };

  const appRoot   = document.getElementById('app-root');
  const toastRoot = document.getElementById('toast-root');
  const modalRoot = document.getElementById('modal-root');

  // Renomear menu
  const talentsLink = document.querySelector('.nav-link[data-view="candidates"] span');
  if (talentsLink) talentsLink.textContent = 'Banco de Talentos';

  // =====================================================================
  // UTILS
  // =====================================================================
  const isUUID = (s='') => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(s).trim());
  const normalizeScore = (v) => { let n = Number(v); if (Number.isNaN(n)) return 0; if (n<=10) n*=10; return Math.max(0, Math.min(100, Math.round(n))); };
  const formatDate = (iso) => { try { return new Date(iso).toLocaleString('pt-BR'); } catch { return iso || ''; } };

  const apiBase = () => `${state.api.url}${state.api.prefix}`;
  const api = (p='') => `${apiBase()}${p}`;

  async function fetchJSON(path, opt = {}) {
    const url = api(path);
    const headers = { ...(opt.headers||{}) };
    if (opt.body && !('Content-Type' in headers)) headers['Content-Type'] = 'application/json';
    const res = await fetch(url, { mode:'cors', ...opt, headers });
    const text = await res.text();
    const json = text ? JSON.parse(text) : null;
    if (!res.ok) throw new Error(json?.detail || json?.error || `HTTP ${res.status}`);
    return json;
  }
  async function postFormData(path, formData) {
    const url = api(path);
    const res = await fetch(url, { method: 'POST', body: formData, mode:'cors' });
    const text = await res.text();
    const json = text ? JSON.parse(text) : null;
    if (!res.ok) throw new Error(json?.detail || json?.error || `HTTP ${res.status}`);
    return json;
  }

  function showToast(msg, type='info', ms=3500) {
    const el = document.createElement('div');
    el.className = `toast ${type}`;
    const icon = type==='success' ? 'ri-checkbox-circle-line' : type==='error' ? 'ri-error-warning-line' : 'ri-information-line';
    el.innerHTML = `<i class="${icon}"></i><p>${msg}</p>`;
    toastRoot.appendChild(el);
    setTimeout(()=> el.remove(), ms);
  }
  function applyTheme() {
    document.documentElement.setAttribute('data-theme', state.theme);
    const btn = document.getElementById('theme-toggle');
    if (btn) btn.querySelector('i').className = state.theme==='dark' ? 'ri-moon-line' : 'ri-sun-line';
  }

  // ---------- matching (fit por vaga) ----------
  const WEIGHTS = { fit: 0.6, base: 0.4 };

  const ACCENTS = { a:/[àáâãä]/g, e:/[èéêë]/g, i:/[ìíîï]/g, o:/[òóôõö]/g, u:/[ùúûü]/g, c:/[ç]/g, n:/[ñ]/g };
  const deaccent = (s='') => s
    .toLowerCase()
    .replace(ACCENTS.a,'a').replace(ACCENTS.e,'e').replace(ACCENTS.i,'i')
    .replace(ACCENTS.o,'o').replace(ACCENTS.u,'u').replace(ACCENTS.c,'c').replace(ACCENTS.n,'n');
  const clean = (s='') => deaccent(String(s)).replace(/[^a-z0-9+#./ ]+/g,' ').replace(/\s+/g,' ').trim();

  const CANON = new Map([
    ['js','javascript'], ['nodejs','node'], ['node.js','node'],
    ['typescript','ts'], ['postgres','postgresql'], ['postgre','postgresql'],
    ['rest','api'], ['apis','api'], ['api rest','api'], ['apis rest','api'],
    ['ci/cd','cicd'], ['ci cd','cicd'], ['ci','cicd'], ['cd','cicd'],
    ['docker compose','docker'], ['k8s','kubernetes']
  ]);
  function canonize(term='') {
    let t = clean(term);
    t = t.replace(/\./g,' ');
    t = CANON.get(t) || t;
    return t;
  }
  function tokenizeRich(textOrArray) {
    const parts = Array.isArray(textOrArray) ? textOrArray : [textOrArray];
    const toks = new Set();
    for (const p of parts) {
      const t = canonize(p);
      if (!t) continue;
      const words = t.split(' ').filter(Boolean);
      words.forEach(w => toks.add(CANON.get(w) || w));
      for (let i=0;i<words.length-1;i++) {
        const bi = `${words[i]} ${words[i+1]}`.trim();
        if (bi.length>2) toks.add(CANON.get(bi) || bi);
      }
      toks.add(words.join('')); // versão colada (ci cd -> cicd)
    }
    return toks;
  }
  function requirementFit(requirements=[], candidate) {
    const candidateBag = tokenizeRich([ ...(candidate.skills || []), candidate.area || '', candidate.summary || '' ]);
    const includesMatch = (a,b) => a===b || a.includes(b) || b.includes(a);
    const reqs = (requirements || []).map(r => canonize(r)).filter(Boolean);
    if (!reqs.length) return 0;
    let hit = 0;
    for (const req of reqs) {
      const reqTokens = tokenizeRich(req);
      let ok = false;
      for (const rt of reqTokens) {
        for (const ct of candidateBag) {
          if (includesMatch(ct, rt)) { ok = true; break; }
        }
        if (ok) break;
      }
      if (ok) hit++;
    }
    return Math.round(100 * (hit / reqs.length));
  }

  // ---------- exclusão hard/soft ----------
  async function deleteCandidate(id) {
    try {
      const res = await fetch(api(`/cvs/${id}`), { method:'DELETE' });
      if (res.ok) { showToast('Talento removido do banco.', 'success'); return true; }
      throw new Error('DELETE não suportado');
    } catch {
      if (!state.hiddenCvIds.includes(id)) {
        state.hiddenCvIds.push(id);
        localStorage.setItem('recrai-hidden-cvs', JSON.stringify(state.hiddenCvIds));
      }
      showToast('Ocultado localmente (backend sem DELETE).', 'success');
      return true;
    }
  }

  // =====================================================================
  // ROUTER
  // =====================================================================
  const Router = () => {
    const routes = [
      { re:/^#\/?$/,                 name:'dashboard' },
      { re:/^#\/jobs$/,              name:'jobs' },
      { re:/^#\/analyze$/,           name:'analyze' },
      { re:/^#\/candidates$/,        name:'candidates' },
      { re:/^#\/candidate\/([^/]+)$/,name:'candidateDetail' },
      { re:/^#\/compare$/,           name:'compare' },
      { re:/^#\/settings$/,          name:'settings' },
    ];
    const navLinks = [...document.querySelectorAll('.nav-link[data-view]')];

    function match(h){
      for(const r of routes){ const m=h.match(r.re); if(m) return {name:r.name, params:m.slice(1)} }
      return {name:'dashboard', params:[]};
    }
    function highlight(n){ navLinks.forEach(a => a.classList.toggle('active', a.dataset.view===n)); }

    // render retorna uma Promise que resolve após a view terminar
    async function render(h){
      const {name, params} = match(h);
      highlight(name);
      if (!views[name]) return;
      await views[name](...params);
    }

    let firstRenderDone = false;
    return {
      start(){
        const doRender = async () => {
          await render(location.hash || '#/');
          // dispara o "ready" apenas uma vez, após a 1ª renderização
          if (!firstRenderDone) {
            firstRenderDone = true;
            window.dispatchEvent(new Event('recrAI:ready'));
          }
        };
        window.addEventListener('hashchange', doRender);
        doRender();
      },
      navigate(p){ if(location.hash!==`#${p}`) location.hash=`#${p}`; }
    };
  };
  const router = Router();

  // =====================================================================
  // MODAL (global)
  // =====================================================================
  function showModal({ title, content, footer }) {
    modalRoot.innerHTML = `
      <div class="modal-overlay"></div>
      <div class="modal-container">
        <div class="modal-header">
          <h2>${title}</h2>
          <button class="btn-ghost close-modal"><i class="ri-close-line"></i></button>
        </div>
        <div class="modal-body">${content}</div>
        ${footer? `<div class="modal-footer">${footer}</div>` : ''}
      </div>
    `;
    const overlay = modalRoot.querySelector('.modal-overlay');
    const container = modalRoot.querySelector('.modal-container');
    setTimeout(()=>{ overlay.classList.add('open'); container.classList.add('open'); }, 10);
    const close = () => { overlay.classList.remove('open'); container.classList.remove('open'); setTimeout(()=> modalRoot.innerHTML='', 250); };
    modalRoot.addEventListener('click', (e)=>{ if(e.target.classList.contains('modal-overlay') || e.target.closest('.close-modal')) close(); });
    return { closeModal: close };
  }

  // =====================================================================
  // DASHBOARD HELPERS (gráficos e interações)
  // =====================================================================
  function animateCounter(el, to, dur=800) {
    const from = Number(el.textContent || 0) || 0;
    const start = performance.now();
    function step(t) {
      const k = Math.min(1, (t - start)/dur);
      el.textContent = Math.round(from + (to - from) * (1 - Math.pow(1-k,3)));
      if (k<1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }

  // tooltip básico para canvas
  function makeTooltip() {
    const tip = document.createElement('div');
    tip.style.position = 'fixed';
    tip.style.zIndex = '999';
    tip.style.pointerEvents = 'none';
    tip.style.padding = '6px 8px';
    tip.style.borderRadius = '8px';
    tip.style.fontSize = '12px';
    tip.style.color = 'var(--c-text)';
    tip.style.background = 'var(--c-elev)';
    tip.style.border = '1px solid var(--c-border)';
    tip.style.boxShadow = '0 8px 24px rgba(0,0,0,.25)';
    tip.style.transform = 'translate(-50%,-120%)';
    tip.style.opacity = '0';
    document.body.appendChild(tip);
    return {
      show(x,y,html){ tip.innerHTML = html; tip.style.left=`${x}px`; tip.style.top=`${y}px`; tip.style.opacity='1'; },
      hide(){ tip.style.opacity='0'; }
    };
  }

  // histogram
  function drawHistogram(canvas, data) {
    const ctx = canvas.getContext('2d');
    const bins = Array(11).fill(0);
    data.forEach(s => bins[Math.min(10, Math.floor(s/10))]++);
    const w = canvas.width, h = canvas.height, bw = w/bins.length, max = Math.max(...bins, 1);
    ctx.clearRect(0,0,w,h);
    ctx.font='12px Inter, sans-serif';
    ctx.strokeStyle=getComputedStyle(document.documentElement).getPropertyValue('--c-border').trim();
    ctx.fillStyle=getComputedStyle(document.documentElement).getPropertyValue('--c-primary').trim();
    ctx.beginPath(); ctx.moveTo(0,h-22); ctx.lineTo(w,h-22); ctx.stroke();

    const bars = [];
    bins.forEach((c,i)=>{
      const bh=(c/max)*(h-42);
      const x=i*bw+6, y=(h-22)-bh, width=bw-12, height=bh;
      ctx.fillRect(x,y,width,height);
      ctx.fillStyle=getComputedStyle(document.documentElement).getPropertyValue('--c-text-secondary').trim();
      const label=(i===10)?'100':`${i*10}-${i*10+9}`;
      ctx.fillText(label,i*bw+8,h-6);
      ctx.fillStyle=getComputedStyle(document.documentElement).getPropertyValue('--c-primary').trim();
      bars.push({x,y,width,height,count:c,label});
    });
    return bars;
  }

  // sparkline (últimos 14 dias)
  function drawSparkline(canvas, points) {
    const ctx=canvas.getContext('2d'), w=canvas.width, h=canvas.height;
    ctx.clearRect(0,0,w,h);
    const max=Math.max(...points, 1), min=Math.min(...points, 0);
    const pad=6, dx=w/(points.length-1||1);
    ctx.beginPath();
    points.forEach((v,i)=> {
      const x=i*dx, y=h - ((v-min)/(max-min||1))*(h-pad*2) - pad;
      i? ctx.lineTo(x,y) : ctx.moveTo(x,y);
    });
    ctx.strokeStyle=getComputedStyle(document.documentElement).getPropertyValue('--c-primary').trim();
    ctx.lineWidth=2; ctx.stroke();
  }

  // donut por áreas
  function drawDonut(canvas, segments) {
    const ctx = canvas.getContext('2d'), w=canvas.width, h=canvas.height;
    const cx=w/2, cy=h/2, r=Math.min(w,h)/2-6, ir=r*0.6;
    ctx.clearRect(0,0,w,h);
    const total = segments.reduce((a,b)=>a+b.value,0) || 1;
    let a0=-Math.PI/2;
    const colors = [
      '#5dd1ff','#7af9cf','#7ca7ff','#f59e0b','#ef4444','#22c55e','#a78bfa','#fb7185'
    ];
    segments.forEach((s,i)=>{
      const ang = (s.value/total)*Math.PI*2;
      ctx.beginPath();
      ctx.moveTo(cx,cy);
      ctx.arc(cx,cy,r,a0,a0+ang);
      ctx.closePath();
      ctx.fillStyle = colors[i%colors.length];
      ctx.fill();
      a0 += ang;
    });
    // buraco
    ctx.globalCompositeOperation='destination-out';
    ctx.beginPath(); ctx.arc(cx,cy,ir,0,Math.PI*2); ctx.fill();
    ctx.globalCompositeOperation='source-over';
  }

  // barras horizontais de skills
  function drawHBar(canvas, items) {
    const ctx=canvas.getContext('2d'), w=canvas.width, h=canvas.height;
    ctx.clearRect(0,0,w,h);
    const pad=8, lineH = Math.min(26, (h - pad*2) / items.length);
    const max = Math.max(...items.map(i=>i.value), 1);
    ctx.font='12px Inter, sans-serif';
    items.forEach((it,idx)=>{
      const y = pad + idx*lineH + 2;
      const bw = (it.value/max) * (w*0.7);
      ctx.fillStyle='var(--c-elev-2)'; ctx.fillRect(115,y, w-130, lineH-6);
      ctx.fillStyle='var(--c-primary)'; ctx.fillRect(115,y, bw, lineH-6);
      ctx.fillStyle='var(--c-text)'; ctx.fillText(it.label, 8, y+lineH-10);
      ctx.fillStyle='var(--c-text-secondary)'; ctx.fillText(it.value, Math.max(118+bw-18, 118), y+lineH-10);
    });
  }

  // =====================================================================
  // VIEWS
  // =====================================================================
  const views = {
    // --------------------------- DASHBOARD --------------------------------
    async dashboard() {
      // layout
      const tpl = `
        <div class="view-container">
          <div style="display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap">
            <h1>Dashboard</h1>
            <div style="display:flex;gap:8px;align-items:center;">
              <select id="dash-job" class="form-control" style="width:260px;"></select>
              <label style="display:inline-flex;align-items:center;gap:6px;font-size:13px;color:var(--c-text-secondary)">
                <input type="checkbox" id="dash-auto" ${state.autoRefresh?'checked':''}/> Atualização automática
              </label>
              <button class="btn" id="dash-refresh"><i class="ri-refresh-line"></i> Atualizar</button>
            </div>
          </div>

          <div class="dashboard-grid">
            <div class="card stat-card">
              <div class="label">Status do Backend</div>
              <div class="value" id="health-val"><div class="skeleton-line" style="width:60%"></div></div>
              <div id="info-val" class="label" style="margin-top:6px;"></div>
            </div>

            <div class="card stat-card">
              <div class="label">Talentos no banco</div>
              <div class="value" id="kpi-talentos">—</div>
              <canvas id="sparkline" width="220" height="56" style="margin-top:6px;"></canvas>
            </div>

            <div class="card stat-card">
              <div class="label">Vagas Criadas</div>
              <div class="value" id="kpi-vagas">—</div>
              <div class="label"><a href="#/jobs">Gerenciar vagas</a></div>
            </div>

            <div class="card wide">
              <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
                <div class="label">Distribuição de Scores (interativo)</div>
                <div class="label" id="hist-legend"></div>
              </div>
              <canvas id="score-chart" width="1180" height="260" style="max-width:100%;"></canvas>
            </div>

            <div class="card" style="grid-column: span 6;">
              <h3 style="margin-bottom:6px;">Áreas dos talentos</h3>
              <canvas id="donut" width="560" height="280" style="max-width:100%"></canvas>
              <div id="donut-legend" class="label" style="margin-top:6px;"></div>
            </div>

            <div class="card" style="grid-column: span 6;">
              <h3 style="margin-bottom:6px;">Top skills no banco</h3>
              <canvas id="skills-bar" width="560" height="280" style="max-width:100%"></canvas>
            </div>

            <div class="card" style="grid-column: span 12;">
              <h3 style="margin-bottom:6px;">Ações rápidas</h3>
              <div style="display:flex;gap:8px;flex-wrap:wrap;">
                <a class="btn btn-primary" href="#/analyze"><i class="ri-sparkling-2-line"></i> Analisar Currículo</a>
                <a class="btn" href="#/jobs"><i class="ri-briefcase-4-line"></i> Criar Vaga</a>
                <a class="btn" href="#/candidates"><i class="ri-team-line"></i> Banco de Talentos</a>
              </div>
            </div>
          </div>
        </div>
      `;
      appRoot.innerHTML = tpl;

      // dados
      let jobs=[]; let cvs=[];
      async function loadData() {
        try {
          await fetchJSON('/health'); document.getElementById('health-val').innerHTML = `<span style="color:var(--c-success)">Online</span>`;
        } catch { document.getElementById('health-val').innerHTML = `<span style="color:var(--c-error)">Offline</span>`; }

        try {
          const info = await fetchJSON('/info');
          document.getElementById('info-val').innerHTML = `<strong>Versão:</strong> ${info.version||'N/A'} &nbsp;|&nbsp; <strong>Modelo:</strong> ${info.model_id||'N/A'}`;
        } catch {}

        try { jobs = await fetchJSON('/jobs'); } catch { jobs=[]; }
        try { cvs  = (await fetchJSON('/cvs')).filter(x=>!state.hiddenCvIds.includes(x.id)); } catch { cvs=[]; }

        // preencher select vaga
        const jobSel = document.getElementById('dash-job');
        jobSel.innerHTML = `<option value="">Todos os talentos</option>` + (jobs||[]).map(j=>`<option value="${j.id}">${j.title}</option>`).join('');
        // manter seleção anterior
        if (state.selectedJobId) jobSel.value = state.selectedJobId;
        jobSel.addEventListener('change', renderAll);
      }

      // KPIs / charts
      const sparkEl = document.getElementById('sparkline');
      const histEl  = document.getElementById('score-chart');
      const donutEl = document.getElementById('donut');
      const skillsEl= document.getElementById('skills-bar');
      const tip     = makeTooltip();

      function renderAll() {
        const jobId = document.getElementById('dash-job').value;
        const scoped = jobId ? cvs.filter(c=>String(c.job_id||'')===String(jobId)) : cvs;

        // KPI talentos e vagas
        animateCounter(document.getElementById('kpi-talentos'), scoped.length);
        animateCounter(document.getElementById('kpi-vagas'), jobs.length);

        // sparkline: novos por dia (últimos 14)
        const byDay = Array(14).fill(0);
        const now = new Date();
        scoped.forEach(c=>{
          const d = new Date(c.created_at||Date.now());
          const diff = Math.floor((now - d)/(24*3600*1000));
          if (diff>=0 && diff<14) byDay[13-diff]++; // cronológico
        });
        drawSparkline(sparkEl, byDay);

        // histograma interativo
        const scores = scoped.map(x => normalizeScore(x.score)).filter(n => !Number.isNaN(n));
        const bars = drawHistogram(histEl, scores);
        document.getElementById('hist-legend').textContent = `${scores.length} avaliações`;
        histEl.onmousemove = (e)=>{
          const r = histEl.getBoundingClientRect();
          const x = e.clientX - r.left, y = e.clientY - r.top;
          const bar = bars.find(b => x>=b.x && x<=b.x+b.width && y>=b.y && y<=b.y+b.height);
          if (bar) tip.show(e.clientX, e.clientY, `<strong>${bar.label}</strong><br/>${bar.count} talento(s)`); else tip.hide();
        };
        histEl.onmouseleave = () => tip.hide();

        // donut áreas
        const areasMap = new Map();
        scoped.forEach(c => { const a=(c.area||'Outros').trim()||'Outros'; areasMap.set(a, (areasMap.get(a)||0)+1); });
        const areasArr = [...areasMap.entries()].sort((a,b)=>b[1]-a[1]);
        const top = areasArr.slice(0,6).map(([label,value])=>({label,value}));
        const otherSum = areasArr.slice(6).reduce((s,[_l,v])=>s+v,0);
        if (otherSum) top.push({label:'Outros', value:otherSum});
        drawDonut(donutEl, top);
        document.getElementById('donut-legend').innerHTML = top.map(s=>`${s.label} <strong>(${s.value})</strong>`).join(' • ');

        // top skills (top 8)
        const f = new Map();
        scoped.forEach(c => (c.skills||[]).forEach(s => f.set(s, (f.get(s)||0)+1)));
        const items = [...f.entries()].sort((a,b)=>b[1]-a[1]).slice(0,8).map(([label,value])=>({label,value}));
        drawHBar(skillsEl, items);
      }

      // controles
      document.getElementById('dash-refresh').addEventListener('click', async ()=>{
        await loadData(); renderAll(); showToast('Dashboard atualizado', 'success');
      });
      const auto = document.getElementById('dash-auto');
      auto.addEventListener('change', ()=>{
        state.autoRefresh = auto.checked;
        localStorage.setItem('recrai-dash-autorefresh', JSON.stringify(state.autoRefresh));
        setupAuto();
      });
      function setupAuto(){
        if (state.autoTimer) { clearInterval(state.autoTimer); state.autoTimer = null; }
        if (state.autoRefresh) {
          state.autoTimer = setInterval(async ()=>{ try{ await loadData(); renderAll(); }catch{} }, 30000);
        }
      }

      // inicial
      await loadData();
      renderAll();
      setupAuto();
    },

    // --------------------------- VAGAS ------------------------------------
    async jobs() {
      let jobs = []; try { jobs = await fetchJSON('/jobs'); } catch {}
      const allCvs = (await fetchJSON('/cvs')).filter(cv => !state.hiddenCvIds.includes(cv.id));

      const topForJob = (job) => {
        const reqs = job.requirements || [];
        const arr = allCvs.map(cv => {
          const fit = requirementFit(reqs, cv);
          const combined = Math.round(WEIGHTS.fit*fit + WEIGHTS.base*normalizeScore(cv.score));
          return { ...cv, fit, combined };
        }).sort((a,b)=> b.combined - a.combined).slice(0,8);

        return arr.map(cv => `
          <div class="card" style="margin:0;">
            <div style="display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;">
              <div>
                <strong>${cv.name || 'Talento'}</strong>
                <div class="label">${cv.area || '—'}</div>
              </div>
              <div style="display:flex;gap:8px;align-items:center;">
                <span class="chip">Fit ${cv.fit}%</span>
                <span class="badge">Rank ${cv.combined}</span>
                <a class="btn btn-secondary" href="#/candidate/${cv.id}">Ver</a>
              </div>
            </div>
          </div>
        `).join('');
      };

      const listHtml = (jobs||[]).map(job => `
        <div class="card">
          <h3>${job.title}</h3>
          <p style="color:var(--c-text-secondary)">${job.description}</p>
          <div style="margin-top:8px;display:flex;flex-wrap:wrap;gap:6px;">
            ${(job.requirements||[]).map(r=>`<span class="chip">${r}</span>`).join('')}
          </div>

          <div style="margin-top:12px;display:flex;gap:8px;flex-wrap:wrap;">
            <button class="btn-secondary select-job-btn" data-id="${job.id}"><i class="ri-check-line"></i> Selecionar</button>
            <button class="btn" data-modal-job="${job.id}"><i class="ri-scales-3-line"></i> Top Talentos</button>
          </div>

          <div style="margin-top:12px;">
            <div class="label">Sugestões</div>
            <div id="top-${job.id}" class="grid-cards" style="margin-top:8px;">${topForJob(job)}</div>
          </div>
        </div>
      `).join('');

      const tpl = `
        <div class="view-container">
          <h1>Vagas</h1>
          <div class="two-col">
            <div id="jobs-col">
              ${jobs?.length ? listHtml : `<div class="card"><div class="empty-state"><i class="ri-briefcase-4-line"></i><h3>Nenhuma vaga cadastrada</h3><p>Crie uma nova vaga ao lado.</p></div></div>`}
            </div>
            <div>
              <div class="card">
                <h3>Cadastrar nova vaga</h3>
                <form id="job-form">
                  <div class="form-group"><label for="title">Título</label><input id="title" name="title" class="form-control" required></div>
                  <div class="form-group"><label for="description">Descrição curta</label><input id="description" name="description" class="form-control" required></div>
                  <div class="form-group"><label for="details">Detalhes completos</label><textarea id="details" name="details" class="form-control" required></textarea></div>
                  <div class="form-group">
                    <label for="requirements">Requisitos (vírgula)</label>
                    <input id="requirements" name="requirements" class="form-control" placeholder="React, Node, SQL" required>
                    <div id="req-preview" style="margin-top:8px;display:flex;gap:6px;flex-wrap:wrap;"></div>
                  </div>
                  <button class="btn btn-primary" type="submit"><i class="ri-save-3-line"></i> Publicar</button>
                </form>
              </div>
            </div>
          </div>
        </div>
      `;
      appRoot.innerHTML = tpl;

      const reqInput = document.getElementById('requirements');
      const reqPrev  = document.getElementById('req-preview');
      const refreshReq = () => {
        const parts = (reqInput.value||'').split(',').map(s=>s.trim()).filter(Boolean);
        reqPrev.innerHTML = parts.map(p=>`<span class="chip">${p}</span>`).join('');
      };
      reqInput.addEventListener('input', refreshReq);
      refreshReq();

      document.querySelectorAll('.select-job-btn').forEach(b=>{
        b.addEventListener('click', () => {
          const id = b.getAttribute('data-id');
          state.selectedJobId = id;
          localStorage.setItem('recrai-selected-job-id', id);
          showToast('Vaga selecionada. Vá para Analisar.', 'success');
        });
      });

      document.querySelectorAll('[data-modal-job]').forEach(btn=>{
        btn.addEventListener('click', ()=>{
          const job = jobs.find(j=> String(j.id)===String(btn.getAttribute('data-modal-job')));
          if (!job) return;
          const topHtml = topForJob(job);
          showModal({
            title: `Top Talentos — ${job.title}`,
            content: `<div class="grid-cards">${topHtml || '<div class="empty-state"><p>Nenhuma sugestão.</p></div>'}</div>`,
            footer: `<button class="btn btn-secondary close-modal">Fechar</button>`
          });
        });
      });

      document.getElementById('job-form').addEventListener('submit', async (e)=>{
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        const data = Object.fromEntries(fd.entries());
        data.requirements = (data.requirements||'').split(',').map(s=>s.trim()).filter(Boolean);
        try {
          const out = await fetchJSON('/jobs', { method:'POST', body: JSON.stringify(data) });
          showToast('Vaga publicada!', 'success');
          const job = out.job || data;
          const html = topForJob(job);
          showModal({
            title: 'Talentos sugeridos para a nova vaga',
            content: html ? `<div class="grid-cards">${html}</div>` : '<div class="empty-state"><p>Nenhum talento encontrado.</p></div>',
            footer: `<a class="btn btn-primary" href="#/candidates">Ir para Banco de Talentos</a>`
          });
          router.navigate('/jobs');
        } catch (err) { showToast(err.message, 'error'); }
      });
    },

    // --------------------------- ANALISAR ---------------------------------
    async analyze() {
      let jobs=[]; try{ jobs=await fetchJSON('/jobs'); }catch{}
      const opts = [`<option value="">Analisar sem vaga</option>`, ...(jobs||[]).map(j=>`<option value="${j.id}" ${String(state.selectedJobId)===String(j.id)?'selected':''}>${j.title}</option>`) ].join('');
      const tpl = `
        <div class="view-container">
          <h1>Analisar Currículos</h1>
          <div class="card">
            <div class="form-group"><label for="job-select">Associar a uma Vaga (opcional)</label><select id="job-select" class="form-control">${opts}</select></div>
            <div class="tabs"><button class="tab-btn active" data-tab="single">1 PDF</button><button class="tab-btn" data-tab="batch">Vários PDFs</button><button class="tab-btn" data-tab="text">Colar Texto</button></div>
            <div id="tab-single" class="tab-content active"><div class="drop-zone" id="dz-single"><i class="ri-upload-cloud-2-line"></i><p>Arraste e solte um PDF ou clique.</p><input type="file" id="f-single" class="hidden" accept=".pdf"></div><p id="name-single" style="text-align:center;margin-top:8px;"></p></div>
            <div id="tab-batch" class="tab-content"><div class="drop-zone" id="dz-batch"><i class="ri-upload-cloud-2-line"></i><p>Arraste múltiplos PDFs ou clique.</p><input type="file" id="f-batch" class="hidden" accept=".pdf" multiple></div><p id="name-batch" style="text-align:center;margin-top:8px;"></p></div>
            <div id="tab-text" class="tab-content"><div class="form-group"><label for="cv-text">Cole o conteúdo do currículo</label><textarea id="cv-text" class="form-control" rows="10"></textarea></div></div>
            <div style="margin-top:12px;"><button class="btn btn-primary" id="analyze-btn"><i class="ri-sparkling-2-line"></i> Analisar</button><div class="progress-bar hidden" id="prog"><div class="progress-bar-inner" id="prog-i"></div></div></div>
          </div>
        </div>`;
      appRoot.innerHTML = tpl;

      const tabs=[...document.querySelectorAll('.tab-btn')], blocks=[...document.querySelectorAll('.tab-content')];
      tabs.forEach(t=>t.addEventListener('click',()=>{ tabs.forEach(x=>x.classList.remove('active')); t.classList.add('active'); blocks.forEach(b=>b.classList.remove('active')); document.getElementById(`tab-${t.dataset.tab}`).classList.add('active'); }));
      const bindDZ = (id, inputId, nameId) => {
        const dz = document.getElementById(id), input = document.getElementById(inputId), nameEl = document.getElementById(nameId);
        dz.addEventListener('click', ()=> input.click());
        dz.addEventListener('dragover', e=>{e.preventDefault(); dz.classList.add('drag-over');});
        dz.addEventListener('dragleave', ()=> dz.classList.remove('drag-over'));
        dz.addEventListener('drop', e=>{e.preventDefault(); dz.classList.remove('drag-over'); input.files = e.dataTransfer.files; upd();});
        input.addEventListener('change', upd);
        function upd(){ const n = input.files.length; nameEl.textContent = n? (n===1? input.files[0].name : `${n} arquivos`):''; }
      };
      bindDZ('dz-single','f-single','name-single');
      bindDZ('dz-batch','f-batch','name-batch');

      document.getElementById('analyze-btn').addEventListener('click', async ()=>{
        const jobSel=document.getElementById('job-select'); const jobVal=String(jobSel.value||''); const jobTxt=jobSel.options[jobSel.selectedIndex]?.text||'';
        const active=[...document.querySelectorAll('.tab-btn')].find(x=>x.classList.contains('active'))?.dataset.tab || 'single';
        const prog=document.getElementById('prog'), pi=document.getElementById('prog-i'); prog.classList.remove('hidden'); pi.style.width='0%';
        let p=0; const tm=setInterval(()=>{ p=Math.min(92,p+6+Math.random()*6); pi.style.width=`${p}%`; },240);
        try {
          const fd=new FormData();
          if (jobVal) fd.append(isUUID(jobVal) ? 'job_id' : 'job', isUUID(jobVal) ? jobVal : jobTxt);
          if (active==='single') { const f=document.getElementById('f-single').files[0]; if(!f) throw new Error('Selecione um PDF.'); fd.append('file',f); await postFormData('/analyze_cv',fd); }
          else if (active==='batch') { const files=document.getElementById('f-batch').files; if(!files.length) throw new Error('Selecione PDFs.'); for(const f of files) fd.append('files',f); await postFormData('/analyze_cv_batch_multipart',fd); }
          else { const txt=document.getElementById('cv-text').value.trim(); if(!txt) throw new Error('Texto vazio.'); fd.append('cv_text',txt); await postFormData('/analyze_cv',fd); }
          pi.style.width='100%'; showToast('Análise concluída!', 'success'); setTimeout(()=> router.navigate('/candidates'), 700);
        } catch(e){ showToast(e.message,'error'); } finally { clearInterval(tm); setTimeout(()=>{ prog.classList.add('hidden'); pi.style.width='0%'; }, 500); }
      });
    },

    // --------------------------- BANCO DE TALENTOS ------------------------
    async candidates() {
      appRoot.innerHTML = `<div class="view-container"><div class="grid-cards"><div class="card skeleton"><div class="skeleton-line"></div></div></div></div>`;
      let list=[]; try{ list = await fetchJSON('/cvs'); }catch{}
      list = list.filter(cv => !state.hiddenCvIds.includes(cv.id));
      if (!list.length) {
        return appRoot.innerHTML = `
          <div class="view-container">
            <div class="card"><div class="empty-state">
              <i class="ri-team-line"></i><h3>Banco de Talentos vazio</h3>
              <p>Vá para “Analisar” para adicionar novos talentos.</p>
              <a class="btn btn-primary" href="#/analyze">Analisar</a>
            </div></div></div>`;
      }
      const cards = [...list].reverse().map(cv=>`
        <div class="card">
          <div style="display:flex;justify-content:space-between;align-items:center;">
            <div>
              <strong>${cv.name || 'Talento'}</strong>
              <div class="label">${cv.area || '—'} • ${formatDate(cv.created_at)}</div>
            </div>
            <div style="display:flex;gap:8px;align-items:center;">
              <button class="btn-danger del-btn" data-id="${cv.id}" title="Excluir / ocultar"><i class="ri-delete-bin-6-line"></i></button>
              <input type="checkbox" class="compare-check" data-id="${cv.id}" title="Selecionar para comparar">
            </div>
          </div>
          <div class="score-bar" style="margin-top:8px;"><div class="score-bar-inner" style="width:${normalizeScore(cv.score)}%"></div></div>
          <div style="display:flex;gap:8px;align-items:center;margin-top:8px;">
            <span class="badge">${normalizeScore(cv.score)} / 100</span>
            ${cv.job_title ? `<span class="chip">${cv.job_title}</span>` : ''}
          </div>
          <p style="color:var(--c-text-secondary);margin-top:8px;">${cv.summary || ''}</p>
          <div style="margin-top:10px;">
            <a class="btn btn-secondary" href="#/candidate/${cv.id}">Ver Detalhes</a>
          </div>
        </div>
      `).join('');

      appRoot.innerHTML = `
        <div class="view-container">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
            <h1>Banco de Talentos</h1>
            <button class="btn btn-primary" id="cmp" disabled><i class="ri-scales-3-line"></i> Comparar</button>
          </div>
          <div class="grid-cards">${cards}</div>
        </div>`;

      const cmp = document.getElementById('cmp');
      const upd = () => {
        const ids = [...document.querySelectorAll('.compare-check:checked')].map(c=>c.dataset.id);
        state.compareIds = ids; localStorage.setItem('recrai-compare-list', JSON.stringify(ids));
        cmp.disabled = ids.length < 2;
      };
      document.querySelectorAll('.compare-check').forEach(c=> c.addEventListener('change', upd));
      cmp.addEventListener('click', ()=> !cmp.disabled && router.navigate('/compare'));

      document.querySelectorAll('.del-btn').forEach(btn=>{
        btn.addEventListener('click', async ()=>{
          const id = btn.getAttribute('data-id');
          const ok = await deleteCandidate(id);
          if (ok) router.navigate('/candidates');
        });
      });
    },

    // --------------------------- DETALHE ----------------------------------
    async candidateDetail(id) {
      appRoot.innerHTML = `<div class="view-container"><div class="card skeleton"><div class="skeleton-line"></div></div></div>`;
      const cv = await fetchJSON(`/cvs/${id}`); if (state.hiddenCvIds.includes(cv.id)) return router.navigate('/candidates');
      const jobs = await fetchJSON('/jobs');

      const suggest = () => {
        return (jobs||[]).map(job=>{
          const fit = requirementFit(job.requirements || [], cv);
          const combined = Math.round(WEIGHTS.fit*fit + WEIGHTS.base*normalizeScore(cv.score));
          return { job, fit, combined };
        }).sort((a,b)=> b.combined - a.combined).slice(0,6);
      };
      const sug = suggest();

      const section = (title, html) => {
        if (!html || (Array.isArray(html) && !html.length)) return '';
        return `<div class="card"><h3 class="section-title">${title}</h3><div>${html}</div></div>`;
      };

      const tpl = `
        <div class="view-container">
          <h1>Detalhe do Talento</h1>

          <div class="card" style="margin-bottom:16px;">
            <div style="display:flex;justify-content:space-between;align-items:center;gap:16px;flex-wrap:wrap;">
              <div>
                <h3 style="margin:0">${cv.name || 'Talento'}</h3>
                <div class="label">${cv.area || ''} • ${formatDate(cv.created_at)}</div>
              </div>
              <div style="min-width:240px;">
                <div class="score-bar"><div class="score-bar-inner" style="width:${normalizeScore(cv.score)}%"></div></div>
                <div style="text-align:right;margin-top:6px;"><span class="badge">${normalizeScore(cv.score)} / 100</span></div>
              </div>
            </div>
            ${cv.job_title ? `<div style="margin-top:10px;"><span class="chip">Vaga: ${cv.job_title}</span></div>` : ''}

            <div style="margin-top:10px;display:flex;gap:8px;flex-wrap:wrap;">
              <button class="btn-danger" id="del-detail"><i class="ri-delete-bin-6-line"></i> Excluir / Ocultar</button>
              <button class="btn btn-secondary" id="copy-q"><i class="ri-file-copy-line"></i> Copiar Perguntas</button>
              <button class="btn btn-secondary" id="exp-json"><i class="ri-download-2-line"></i> Exportar JSON</button>
            </div>
          </div>

          ${section('Resumo', cv.summary || '—')}
          ${section('Educação', cv.education || '—')}
          ${section('Skills', (cv.skills||[]).map(s=>`<span class="chip">${s}</span>`).join(' ') || '—')}
          ${section('Perguntas de Entrevista', (cv.interview_questions||[]).length ? `<ul>${cv.interview_questions.map(q=>`<li>${q}</li>`).join('')}</ul>` : '—')}
          ${section('Pontos Fortes', (cv.strengths||[]).length ? `<ul>${cv.strengths.map(s=>`<li>${s}</li>`).join('')}</ul>` : '—')}
          ${section('Áreas para Desenvolvimento', (cv.areas_for_development||[]).length ? `<ul>${cv.areas_for_development.map(a=>`<li>${a}</li>`).join('')}</ul>` : '—')}
          ${section('Considerações Importantes', (cv.important_considerations||[]).length ? `<ul>${cv.important_considerations.map(i=>`<li>${i}</li>`).join('')}</ul>` : '—')}
          ${section('Recomendações Finais', cv.final_recommendations || '—')}

          <div class="card">
            <h3 class="section-title">Vagas sugeridas</h3>
            ${sug.length ? `<div class="grid-cards">
              ${sug.map(x=>`
                <div class="card" style="margin:0;">
                  <strong>${x.job.title}</strong>
                  <div class="label" style="margin:6px 0 8px;">${x.job.description}</div>
                  <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:8px;">
                    ${(x.job.requirements||[]).map(r=>`<span class="chip">${r}</span>`).join('')}
                  </div>
                  <div style="display:flex;gap:8px;align-items:center;justify-content:space-between;">
                    <span class="chip">Fit ${x.fit}%</span>
                    <span class="badge">Rank ${x.combined}</span>
                  </div>
                </div>`).join('')}
            </div>` : `<div class="empty-state"><p>Sem sugestões.</p></div>`}
          </div>
        </div>
      `;
      appRoot.innerHTML = tpl;

      document.getElementById('copy-q').addEventListener('click', ()=> navigator.clipboard.writeText((cv.interview_questions||[]).join('\n')).then(()=>showToast('Copiado!', 'success')));
      document.getElementById('exp-json').addEventListener('click', ()=> {
        const blob = new Blob([JSON.stringify(cv, null, 2)], {type:'application/json'});
        const url  = URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url; a.download=`recrai_cv_${cv.id}.json`; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
      });
      document.getElementById('del-detail').addEventListener('click', async ()=>{
        const ok = await deleteCandidate(cv.id);
        if (ok) router.navigate('/candidates');
      });
    },

    // --------------------------- COMPARAR ---------------------------------
    async compare() {
      const ids = state.compareIds || [];
      if (ids.length < 2) {
        return appRoot.innerHTML = `
          <div class="view-container"><div class="card">
            <div class="empty-state"><i class="ri-scales-3-line"></i><h3>Selecione pelo menos dois</h3>
            <a class="btn btn-primary" href="#/candidates">Voltar</a></div>
          </div></div>`;
      }
      const data = await Promise.all(ids.map(id=>fetchJSON(`/cvs/${id}`)));
      const filtered = data.filter(d => !state.hiddenCvIds.includes(d.id));
      const best = Math.max(...filtered.map(d=>normalizeScore(d.score)));
      const row = (label, cols) => `<tr><td><strong>${label}</strong></td>${cols.map(c=>`<td>${c}</td>`).join('')}</tr>`;
      const tpl = `
        <div class="view-container">
          <h1>Comparar Talentos</h1>
          <div class="card" style="overflow-x:auto;">
            <table class="compare-table">
              <thead><tr><th>Critério</th>${filtered.map(d=>`<th>${d.name || 'Talento'}</th>`).join('')}</tr></thead>
              <tbody>
                ${row('Score', filtered.map(d => { const s=normalizeScore(d.score); const hl=s===best?`style="background:var(--c-success);color:#fff"`:''; return `<span class="badge" ${hl}>${s}</span>`; }))}
                ${row('Top Skills', filtered.map(d => (d.skills||[]).slice(0,3).join(', ')))}
                ${row('Forças', filtered.map(d => (d.strengths||[]).join(', ')))}
                ${row('Recomendação', filtered.map(d => d.final_recommendations || '—'))}
              </tbody>
            </table>
          </div>
        </div>`;
      appRoot.innerHTML = tpl;
    },

    // --------------------------- CONFIG -----------------------------------
    async settings() {
      const tpl=`
        <div class="view-container">
          <h1>Configurações</h1>
          <div class="card">
            <h3>Conexão</h3>
            <form id="api-form">
              <div class="form-group"><label for="burl">URL do Backend</label><input id="burl" class="form-control" value="\${state.api.url}"></div>
              <div class="form-group"><label for="pref">Prefixo da API</label><input id="pref" class="form-control" value="\${state.api.prefix}"></div>
              <button class="btn btn-primary">Salvar e testar</button>
            </form>
          </div>
          <div class="card" style="margin-top:16px;">
            <h3>Preferências</h3>
            <div class="form-group">
              <label for="theme-sel">Tema</label>
              <select id="theme-sel" class="form-control">
                <option value="light" \${state.theme==='light'?'selected':''}>Claro</option>
                <option value="dark" \${state.theme==='dark'?'selected':''}>Escuro</option>
              </select>
            </div>
          </div>
        </div>`;
      appRoot.innerHTML = tpl.replace(/\$\{(.+?)\}/g, (_,expr)=>eval(expr));

      document.getElementById('api-form').addEventListener('submit', async (e)=>{
        e.preventDefault();
        const url  = document.getElementById('burl').value.trim();
        const pref = document.getElementById('pref').value.trim();
        state.api.url = url; state.api.prefix = pref;
        localStorage.setItem('recrai-backend-url', url);
        localStorage.setItem('recrai-api-prefix', pref);
        try { await fetchJSON('/health'); showToast('Conexão OK!', 'success'); }
        catch { showToast('Falha ao conectar.', 'error'); }
      });
      document.getElementById('theme-sel').addEventListener('change', (e)=>{
        state.theme = e.target.value; localStorage.setItem('recrai-theme', state.theme); applyTheme();
      });
    }
  };

  // =====================================================================
  // GLOBAL
  // =====================================================================
  document.getElementById('theme-toggle')?.addEventListener('click', () => {
    state.theme = state.theme==='dark' ? 'light' : 'dark';
    localStorage.setItem('recrai-theme', state.theme);
    applyTheme();
  });

  // tema + rota inicial
  applyTheme();
  if (!location.hash) location.hash = '#/';

  // inicia o router (ele disparará 'recrAI:ready' após a 1ª view)
  router.start();
});
