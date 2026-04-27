/**
 * ============================================================
 * PatrimônioGest — modules/dashboard.js
 * ============================================================
 * Módulo do Dashboard principal.
 *
 * Responsabilidades:
 *  - Cards de KPI (valor contábil, depreciação, qtd, alertas)
 *  - Gráfico de distribuição por tipo (donut)
 *  - Gráfico Top 8 maiores depreciações (barras)
 *  - Painel de itens perdidos/quebrados
 *  - Painel de acompanhamento individual (com autocomplete e gráfico)
 *  - Chamada ao painel de alertas (compartilhado com Depreciação)
 * ============================================================
 */

import { fmt, fmtDate, AppState }  from '../core/config.js';
import { calcDep, getAlerts }       from '../core/depreciacao.js';
import { getTipoColor }              from '../core/config.js';
import { chartOpts }                 from '../core/ui.js';
import { renderDepAlerts }           from './depreciacao.js';

// Referências às instâncias Chart.js — destruídas antes de recriar
let _chartTipo  = null;
let _chartTop   = null;
let _chartAcomp = null;

// ─────────────────────────────────────────────────────────────
// RENDER PRINCIPAL
// ─────────────────────────────────────────────────────────────

/**
 * Renderiza todo o dashboard:
 * KPIs → gráficos → alertas → painel de perdidos → acompanhamento.
 *
 * Exposto globalmente como window.renderDashboard para chamadas
 * cruzadas de outros módulos.
 */
export function renderDashboard() {
  const totalInv = AppState.inv.reduce((s, i) => s + i.val,          0);
  const totalDep = AppState.inv.reduce((s, i) => s + calcDep(i).da,  0);
  const pct      = totalInv > 0 ? ((totalDep / totalInv) * 100).toFixed(1) : '0';

  // ── KPI Cards ────────────────────────────────────────────────
  document.getElementById('ds-contabil').textContent = fmt(totalInv - totalDep);
  document.getElementById('ds-dep').textContent      = fmt(totalDep);
  document.getElementById('ds-qtd').textContent      = AppState.inv.length;
  document.getElementById('ds-alertas').textContent  = getAlerts(AppState.inv).length;
  document.getElementById('ds-pct').textContent      = pct + '% dep.';
  document.getElementById('ds-perdidos').textContent = AppState.inv.filter((i) => i.status === 'perdido').length;
  document.getElementById('ds-acomp').textContent    = AppState.inv.filter((i) => !i.status || i.status === 'acompanhamento').length;

  // ── Gráfico: distribuição de valor contábil por tipo ────────
  const tipoMap = {};
  AppState.inv.forEach((item) => {
    const t = item.tipo || 'Outros';
    tipoMap[t] = (tipoMap[t] || 0) + calcDep(item).vc;
  });
  const tL = Object.keys(tipoMap);
  const tD = tL.map((k) => parseFloat(tipoMap[k].toFixed(2)));
  const tC = tL.map((k) => getTipoColor(k));

  if (_chartTipo) _chartTipo.destroy();
  _chartTipo = new Chart(document.getElementById('chart-tipo').getContext('2d'), {
    type: 'doughnut',
    data: {
      labels:   tL.length ? tL : ['Sem dados'],
      datasets: [{
        data:            tD.length ? tD : [1],
        backgroundColor: tD.length ? tC : ['#212630'],
        borderColor:     '#13161b',
        borderWidth:     3,
      }],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend:  { labels: { color: '#8b9099', font: { size: 11, family: 'DM Sans' } } },
        tooltip: { backgroundColor: '#1a1e25', callbacks: { label: (c) => ' ' + fmt(c.parsed) } },
      },
    },
  });

  // ── Gráfico: Top 8 depreciações acumuladas ───────────────────
  const top8 = [...AppState.inv].sort((a, b) => calcDep(b).da - calcDep(a).da).slice(0, 8);

  if (_chartTop) _chartTop.destroy();
  _chartTop = new Chart(document.getElementById('chart-top').getContext('2d'), {
    type: 'bar',
    data: {
      labels:   top8.map((i) => i.desc.length > 10 ? i.desc.slice(0, 10) + '…' : i.desc),
      datasets: [{
        data:            top8.map((i) => parseFloat(calcDep(i).da.toFixed(2))),
        backgroundColor: top8.map((i) => getTipoColor(i.tipo)),
        borderRadius:    4,
      }],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend:  { display: false },
        tooltip: { backgroundColor: '#1a1e25', callbacks: { label: (c) => ' ' + fmt(c.parsed.y) } },
      },
      scales: {
        y: { ticks: { color: '#555b65', callback: (v) => fmt(v), font: { size: 9, family: 'DM Mono' } }, grid: { color: 'rgba(255,255,255,0.04)' }, border: { color: 'transparent' } },
        x: { ticks: { color: '#555b65', font: { size: 9 } }, grid: { color: 'rgba(255,255,255,0.04)' } },
      },
    },
  });

  // ── Demais painéis ───────────────────────────────────────────
  renderDepAlerts();
  renderDashPerdidos();

  // Atualiza painel de acompanhamento se houver item selecionado
  if (AppState.dashSelectedId) {
    const still = AppState.inv.find((i) => i.id === AppState.dashSelectedId);
    if (!still && window._dashAcReset) window._dashAcReset();
    else renderDashAcomp();
  }
}

// ─────────────────────────────────────────────────────────────
// PAINEL DE PERDIDOS / QUEBRADOS
// ─────────────────────────────────────────────────────────────

/**
 * Renderiza o card de itens marcados como perdidos/quebrados.
 * Oculta o card se não houver nenhum.
 */
export function renderDashPerdidos() {
  const perdidos = AppState.inv.filter((i) => i.status === 'perdido');
  const card     = document.getElementById('dash-perdidos-card');
  const body     = document.getElementById('dash-perdidos-body');
  if (!card) return;

  if (!perdidos.length) { card.style.display = 'none'; return; }

  card.style.display = 'block';
  document.getElementById('dash-nperdidos').textContent =
    perdidos.length + ' item' + (perdidos.length !== 1 ? 's' : '');

  body.innerHTML = perdidos.map((item) => {
    const { da, vc } = calcDep(item);
    const col = getTipoColor(item.tipo);
    return `
      <div class="alert-card urgent" style="margin-bottom:8px">
        <div class="alert-icon" style="background:var(--red-dim)">
          <svg viewBox="0 0 24 24" fill="none" stroke="var(--red)" stroke-width="2" width="16" height="16">
            <circle cx="12" cy="12" r="10"/>
            <line x1="15" y1="9"  x2="9"  y2="15"/>
            <line x1="9"  y1="9"  x2="15" y2="15"/>
          </svg>
        </div>
        <div class="alert-info">
          <div class="alert-name">
            <span class="inv-dot" style="background:${col}"></span>${item.desc}
          </div>
          <div class="alert-detail">
            ${item.tipo || '—'} · Adq. ${fmtDate(item.dt)}${item.obs ? ' · 📝 ' + item.obs : ''}
          </div>
        </div>
        <div class="alert-right">
          <div style="font-size:12px;font-weight:600;color:var(--red)">Val. original: ${fmt(item.val)}</div>
          <div style="font-size:11px;color:var(--text3)">Dep. acum.: ${fmt(da)} · Valor atual: ${fmt(vc)}</div>
        </div>
      </div>`;
  }).join('');
}

// ─────────────────────────────────────────────────────────────
// PAINEL DE ACOMPANHAMENTO INDIVIDUAL
// ─────────────────────────────────────────────────────────────

/**
 * Renderiza os detalhes de acompanhamento do item selecionado no autocomplete.
 * Inclui cards de valor, barra de progresso e gráfico de curva de depreciação.
 */
export function renderDashAcomp() {
  const id = AppState.dashSelectedId;
  const emptyEl   = document.getElementById('dash-acomp-empty');
  const contentEl = document.getElementById('dash-acomp-content');
  const badgeEl   = document.getElementById('dash-acomp-badge');

  if (!id) {
    emptyEl.style.display   = 'block';
    contentEl.style.display = 'none';
    badgeEl.style.display   = 'none';
    return;
  }

  const item = AppState.inv.find((i) => i.id === id);
  if (!item) return;

  emptyEl.style.display   = 'none';
  contentEl.style.display = 'block';
  badgeEl.style.display   = 'inline-block';

  const isPerdido = item.status === 'perdido';

  // Badge de status
  badgeEl.textContent        = isPerdido ? '⚠️ Perdido' : '📊 Em Acompanhamento';
  badgeEl.style.background   = isPerdido ? 'var(--red-dim)'    : 'var(--purple-dim)';
  badgeEl.style.color        = isPerdido ? 'var(--red)'        : 'var(--purple)';

  const { da, vc, dm, meses, restMeses } = calcDep(item);
  const pct       = Math.min(100, (da / item.val) * 100).toFixed(1);
  const barColor  = parseFloat(pct) > 80 ? 'var(--red)' : parseFloat(pct) > 50 ? 'var(--amber)' : 'var(--accent)';

  // Aviso visual se perdido
  const avisoHtml = isPerdido
    ? `<div class="notice notice-red" style="margin-bottom:14px">
         <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
           <circle cx="12" cy="12" r="10"/>
           <line x1="15" y1="9" x2="9" y2="15"/>
           <line x1="9"  y1="9" x2="15" y2="15"/>
         </svg>
         Item <strong>Perdido / Quebrado</strong>${item.obs ? ' — ' + item.obs : ''}.
         Os valores abaixo refletem a depreciação até hoje.
       </div>`
    : '';

  // KPI cards do item selecionado
  document.getElementById('dash-acomp-cards').innerHTML = avisoHtml + `
    <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px">
      <div class="res-card">
        <div class="res-label">Valor Original</div>
        <div class="res-value" style="font-size:15px">${fmt(item.val)}</div>
        <div style="font-size:10px;color:var(--text3);margin-top:3px">Adq. em ${fmtDate(item.dt)}</div>
      </div>
      <div class="res-card" style="border-color:rgba(78,158,255,.25)">
        <div class="res-label">Dep. Acumulada</div>
        <div class="res-value" style="font-size:15px;color:var(--blue)">${fmt(da)}</div>
        <div style="font-size:10px;color:var(--text3);margin-top:3px">${fmt(dm)}/mês</div>
      </div>
      <div class="res-card" style="border-color:rgba(0,212,170,.3);background:rgba(0,212,170,.04)">
        <div class="res-label" style="color:var(--accent)">Valor Atual</div>
        <div class="res-value" style="font-size:15px;color:var(--accent)">${fmt(vc)}</div>
        <div style="font-size:10px;color:var(--text3);margin-top:3px">Residual: ${fmt(item.res || 0)}</div>
      </div>
      <div class="res-card">
        <div class="res-label">Vida Restante</div>
        <div class="res-value" style="font-size:15px;color:${restMeses === 0 ? 'var(--red)' : restMeses <= 12 ? 'var(--amber)' : 'var(--text)'}">
          ${restMeses === 0 ? 'VENCIDO' : restMeses + ' meses'}
        </div>
        <div style="font-size:10px;color:var(--text3);margin-top:3px">
          Vida: ${item.vd < 1 ? Math.round(item.vd * 12) + 'm' : item.vd + 'a'}
        </div>
      </div>
    </div>`;

  // Barra de progresso da depreciação
  document.getElementById('dash-acomp-pct').textContent = pct + '% depreciado';
  const bar = document.getElementById('dash-acomp-bar');
  bar.style.width      = pct + '%';
  bar.style.background = barColor;

  // ── Gráfico de curva completa de depreciação ──────────────────
  const labels      = ['Aquisição'];
  const dataVals    = [parseFloat(item.val.toFixed(2))];
  const totalMeses  = Math.ceil(item.vd * 12);
  const depMensal   = (item.val - (item.res || 0)) / (item.vd * 12);

  for (let m = 1; m <= totalMeses; m++) {
    const dep = Math.min(depMensal * m, item.val - (item.res || 0));
    labels.push('M' + m);
    dataVals.push(parseFloat(Math.max(item.val - dep, item.res || 0).toFixed(2)));
  }

  const mesUso = Math.round(meses); // posição atual na curva

  if (_chartAcomp) _chartAcomp.destroy();
  _chartAcomp = new Chart(document.getElementById('chart-acomp').getContext('2d'), {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label:           'Valor do Bem',
        data:            dataVals,
        borderColor:     isPerdido ? '#ff5c5c' : '#00d4aa',
        backgroundColor: isPerdido ? 'rgba(255,92,92,0.07)' : 'rgba(0,212,170,0.07)',
        fill:            true,
        tension:         0.4,
        // Ponto maior na posição atual
        pointRadius:          (c) => c.dataIndex === mesUso ? 7 : 2,
        pointBackgroundColor: (c) => c.dataIndex === mesUso ? '#f5a623' : isPerdido ? '#ff5c5c' : '#00d4aa',
        pointBorderColor:     '#0d0f12',
        pointBorderWidth:     (c) => c.dataIndex === mesUso ? 2 : 1,
      }],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: '#1a1e25',
          callbacks: {
            label:      (c) => ' ' + fmt(c.parsed.y),
            afterLabel: (c) => c.dataIndex === mesUso ? '← Posição atual' : '',
          },
        },
      },
      scales: {
        y: { ticks: { color: '#555b65', callback: (v) => fmt(v), font: { family: 'DM Mono', size: 9 } }, grid: { color: 'rgba(255,255,255,0.04)' }, border: { color: 'transparent' } },
        x: { ticks: { color: '#555b65', font: { size: 9 }, maxTicksLimit: 12 }, grid: { color: 'rgba(255,255,255,0.04)' }, border: { color: 'transparent' } },
      },
    },
  });
}

// ─────────────────────────────────────────────────────────────
// AUTOCOMPLETE DO PAINEL DE ACOMPANHAMENTO
// ─────────────────────────────────────────────────────────────

/**
 * Inicializa o autocomplete do campo de busca do painel de acompanhamento.
 *
 * Expõe no window:
 *   dashAcInput(q), dashAcFocus(), dashAcClear(), dashAcKeyNav(e)
 *   _dashAcPick(id), _dashAcReset()
 */
export function initDashAutoComplete() {
  let dsVisible  = [];
  let dsKbd      = -1;
  let dsSelected = null;

  const g = (id) => document.getElementById(id);

  // Monta a lista filtrável
  function openList(q) {
    const ql = (q || '').toLowerCase();
    dsVisible = [];
    dsKbd     = -1;

    const listEl = g('dash-ac-list');
    const groups = {};
    const source = ql
      ? AppState.inv.filter((i) =>
          i.desc.toLowerCase().includes(ql) || (i.tipo || '').toLowerCase().includes(ql))
      : [...AppState.inv];

    source.forEach((item) => {
      const gr = item.tipo || 'Outros';
      if (!groups[gr]) groups[gr] = [];
      groups[gr].push(item);
      dsVisible.push(item);
    });

    if (!dsVisible.length) {
      listEl.innerHTML = `<div class="ac-empty">Nenhum item encontrado</div>`;
    } else {
      let html = '', idx = 0;
      for (const [grp, items] of Object.entries(groups)) {
        html += `<div class="ac-group-label">${grp}</div>`;
        for (const item of items) {
          const isPerdido = item.status === 'perdido';
          const col       = getTipoColor(item.tipo);
          const vida      = item.vd < 1 ? Math.round(item.vd * 12) + 'm' : item.vd + 'a';

          html += `<div class="ac-option${dsSelected === item.id ? ' selected' : ''}"
                       data-idx="${idx}"
                       onmousedown="window._dashAcPick('${item.id}')">
                     <span style="display:flex;align-items:center;gap:7px">
                       <span style="width:7px;height:7px;border-radius:50%;background:${col};flex-shrink:0;display:inline-block"></span>
                       ${item.desc}
                     </span>
                     <span style="display:flex;align-items:center;gap:6px">
                       <span class="ac-opt-meta" style="color:${isPerdido ? 'var(--red)' : 'var(--purple)'}">
                         ${isPerdido ? '⚠️ Perdido' : '📊 Acomp.'}
                       </span>
                       <span class="ac-opt-meta">${vida}</span>
                     </span>
                   </div>`;
          idx++;
        }
      }
      listEl.innerHTML = html;
    }
    g('dash-ac-dropdown').classList.add('open');
  }

  function closeList() {
    g('dash-ac-dropdown').classList.remove('open');
    dsKbd = -1;
  }

  // ── API pública ────────────────────────────────────────────────

  window.dashAcInput = (q) => {
    dsSelected = null;
    g('dash-ac-clear').classList.toggle('show', q.length > 0);
    g('dash-ac-input').classList.remove('has-value');
    openList(q);
  };

  window.dashAcFocus = () => openList(g('dash-ac-input').value || '');

  window._dashAcPick = (id) => {
    const item = AppState.inv.find((i) => i.id === id);
    if (!item) return;

    dsSelected            = id;
    AppState.dashSelectedId = id;

    const inp     = g('dash-ac-input');
    inp.value     = item.desc;
    inp.classList.add('has-value');
    g('dash-ac-clear').classList.add('show');
    closeList();

    const isPerdido = item.status === 'perdido';
    const pill      = g('dash-selected-pill');

    g('dash-pill-dot').style.background  = isPerdido ? 'var(--red)' : 'var(--accent)';
    g('dash-pill-nome').textContent       = item.desc;

    const statusEl       = g('dash-pill-status');
    statusEl.textContent  = isPerdido ? '⚠️ Perdido' : '📊 Em Acompanhamento';
    statusEl.style.background = isPerdido ? 'var(--red-dim)'    : 'var(--purple-dim)';
    statusEl.style.color      = isPerdido ? 'var(--red)'        : 'var(--purple)';

    pill.style.display = 'flex';
    renderDashAcomp();
  };

  window.dashAcClear = () => {
    dsSelected              = null;
    AppState.dashSelectedId = null;
    const inp = g('dash-ac-input');
    inp.value = '';
    inp.classList.remove('has-value');
    g('dash-ac-clear').classList.remove('show');
    closeList();
    g('dash-selected-pill').style.display    = 'none';
    g('dash-acomp-empty').style.display      = 'block';
    g('dash-acomp-content').style.display    = 'none';
    g('dash-acomp-badge').style.display      = 'none';
    inp.focus();
  };

  window.dashAcKeyNav = (e) => {
    const dropEl = g('dash-ac-dropdown');
    if (!dropEl.classList.contains('open')) {
      if (e.key === 'ArrowDown') { e.preventDefault(); openList(g('dash-ac-input').value || ''); }
      return;
    }
    const opts = g('dash-ac-list').querySelectorAll('.ac-option');
    if      (e.key === 'ArrowDown')  { e.preventDefault(); dsKbd = Math.min(dsKbd + 1, dsVisible.length - 1); }
    else if (e.key === 'ArrowUp')    { e.preventDefault(); dsKbd = Math.max(dsKbd - 1, 0); }
    else if (e.key === 'Enter')      { e.preventDefault(); if (dsKbd >= 0 && dsVisible[dsKbd]) window._dashAcPick(dsVisible[dsKbd].id); return; }
    else if (e.key === 'Escape')     { if (dsSelected) { const it = AppState.inv.find((i) => i.id === dsSelected); if (it) g('dash-ac-input').value = it.desc; } closeList(); return; }
    else return;
    opts.forEach((o, i) => o.classList.toggle('kbd', i === dsKbd));
    if (opts[dsKbd]) opts[dsKbd].scrollIntoView({ block: 'nearest' });
  };

  window._dashAcReset = () => {
    dsSelected              = null;
    AppState.dashSelectedId = null;
    const inp = g('dash-ac-input');
    if (inp) { inp.value = ''; inp.classList.remove('has-value'); }
    g('dash-ac-clear')?.classList.remove('show');
    closeList();
  };

  // Fecha ao clicar fora
  document.addEventListener('mousedown', (e) => {
    if (!g('dash-ac-wrap')?.contains(e.target)) {
      if (dsSelected) {
        const it = AppState.inv.find((i) => i.id === dsSelected);
        if (it) g('dash-ac-input').value = it.desc;
      }
      closeList();
    }
  });
}