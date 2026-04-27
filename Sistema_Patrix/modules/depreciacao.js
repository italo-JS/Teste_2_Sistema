/**
 * ============================================================
 * PatrimônioGest — modules/depreciacao.js
 * ============================================================
 * Módulo de Análise de Depreciação.
 *
 * Responsabilidades:
 *  - Painel de alertas (vencidos e próximos do vencimento)
 *  - Gráfico de depreciação mensal por tipo (donut)
 *  - Gráfico Original vs Atual (barras agrupadas)
 *  - Tabela detalhada com barra de progresso por item
 *
 * A função renderDepAlerts() é reusada pelo Dashboard
 * (importada em modules/dashboard.js).
 * ============================================================
 */

import { fmt, fmtDate, AppState, MESES_PT } from '../core/config.js';
import { calcDep, getAlerts }                from '../core/depreciacao.js';
import { getTipoColor }                       from '../core/config.js';

// Instâncias Chart.js — destruídas antes de recriar
let _chartDepTipo  = null;
let _chartOrigCont = null;

// ─────────────────────────────────────────────────────────────
// RENDER PRINCIPAL DA PÁGINA
// ─────────────────────────────────────────────────────────────

/**
 * Renderiza toda a página de Análise de Depreciação.
 * Exposto globalmente como window.renderDepPage.
 */
export function renderDepPage() {
  renderDepAlerts();
  renderDepCharts();
  renderDepTable();
}

// ─────────────────────────────────────────────────────────────
// ALERTAS
// ─────────────────────────────────────────────────────────────

/**
 * Renderiza o painel de alertas de depreciação.
 * Separa os itens em "Vencidos" (restMeses === 0) e "Próximos" (≤ 12 meses).
 *
 * Também atualiza o mini-painel de alertas do Dashboard.
 * Isso permite reusar esta função nos dois contextos.
 */
export function renderDepAlerts() {
  const body    = document.getElementById('dep-alertas-body');
  const alerts  = getAlerts(AppState.inv).sort((a, b) => calcDep(a).restMeses - calcDep(b).restMeses);

  const vencidos = alerts.filter((i) => calcDep(i).restMeses === 0);
  const proximos = alerts.filter((i) => calcDep(i).restMeses  > 0);

  // Contadores nos chips do header do painel
  const vencEl = document.getElementById('dep-nalert-venc');
  const proxEl = document.getElementById('dep-nalert-prox');
  if (vencEl) vencEl.textContent = vencidos.length + ' vencido' + (vencidos.length !== 1 ? 's' : '');
  if (proxEl) proxEl.textContent = proximos.length + ' próximo' + (proximos.length !== 1 ? 's' : '');

  // Contador no card do dashboard
  const dashN = document.getElementById('dash-nalert');
  if (dashN) dashN.textContent = alerts.length + ' alerta' + (alerts.length !== 1 ? 's' : '');

  // Template de um card de alerta
  const makeAlerts = (list) =>
    list.map((item) => {
      const { restMeses } = calcDep(item);
      const isVencido     = restMeses === 0;
      const cor           = isVencido ? 'var(--red)'   : 'var(--amber)';
      const bg            = isVencido ? 'var(--red-dim)' : 'var(--amber-dim)';

      return `
        <div class="alert-card ${isVencido ? 'urgent' : 'warning'}">
          <div class="alert-icon" style="background:${bg}">
            <svg viewBox="0 0 24 24" fill="none" stroke="${cor}" stroke-width="2" width="16" height="16">
              <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
              <line x1="12" y1="9" x2="12" y2="13"/>
            </svg>
          </div>
          <div class="alert-info">
            <div class="alert-name">${item.desc}</div>
            <div class="alert-detail">${item.tipo || '—'} · Adquirido em ${fmtDate(item.dt)}</div>
          </div>
          <div class="alert-right">
            <div class="alert-days" style="color:${cor}">
              ${isVencido ? 'VENCIDO' : restMeses + ' meses'}
            </div>
            <div style="font-size:11px;color:var(--text3);margin-top:2px">
              ${isVencido ? 'Vida útil esgotada' : 'restantes'}
            </div>
          </div>
        </div>`;
    }).join('');

  // Estado vazio
  const emptyHtml = `
    <div class="empty">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
        <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>
      </svg>
      <div class="empty-title">Nenhum alerta</div>
      <div class="empty-sub">Todos os bens estão dentro da vida útil</div>
    </div>`;

  if (!alerts.length) {
    if (body) body.innerHTML = emptyHtml;
    const dashBody = document.getElementById('dash-alertas-body');
    if (dashBody) dashBody.innerHTML = emptyHtml;
    return;
  }

  if (body) body.innerHTML = makeAlerts(alerts);

  // Dashboard mostra apenas os 3 primeiros alertas
  const dashBody = document.getElementById('dash-alertas-body');
  if (dashBody) dashBody.innerHTML = makeAlerts(alerts.slice(0, 3));
}

// ─────────────────────────────────────────────────────────────
// GRÁFICOS
// ─────────────────────────────────────────────────────────────

/**
 * Renderiza os dois gráficos da página de depreciação:
 *  1. Donut: depreciação mensal por tipo
 *  2. Barras agrupadas: valor original vs valor atual (top 8)
 */
export function renderDepCharts() {
  // ── 1. Depreciação mensal por tipo ───────────────────────────
  const tipoMap = {};
  AppState.inv.forEach((item) => {
    const { dm } = calcDep(item);
    const t = item.tipo || 'Outros';
    tipoMap[t] = (tipoMap[t] || 0) + dm;
  });

  const tL = Object.keys(tipoMap);
  const tD = tL.map((k) => parseFloat(tipoMap[k].toFixed(2)));
  const tC = tL.map((k) => getTipoColor(k));

  if (_chartDepTipo) _chartDepTipo.destroy();
  _chartDepTipo = new Chart(document.getElementById('chart-dep-tipo').getContext('2d'), {
    type: 'doughnut',
    data: { labels: tL, datasets: [{ data: tD, backgroundColor: tC, borderColor: '#13161b', borderWidth: 3 }] },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend:  { labels: { color: '#8b9099', font: { size: 11, family: 'DM Sans' } } },
        tooltip: { backgroundColor: '#1a1e25', callbacks: { label: (c) => ' ' + fmt(c.parsed) + '/mês' } },
      },
    },
  });

  // ── 2. Original vs Atual — últimos 8 itens adicionados ──────
  const top8 = [...AppState.inv].slice(-8);

  if (_chartOrigCont) _chartOrigCont.destroy();
  _chartOrigCont = new Chart(document.getElementById('chart-orig-cont').getContext('2d'), {
    type: 'bar',
    data: {
      labels: top8.map((i) => i.desc.length > 12 ? i.desc.slice(0, 12) + '…' : i.desc),
      datasets: [
        {
          label:           'Valor Original',
          data:            top8.map((i) => i.val),
          backgroundColor: 'rgba(78,158,255,0.5)',
          borderColor:     '#4e9eff',
          borderWidth:     1,
        },
        {
          label:           'Valor Atual',
          data:            top8.map((i) => parseFloat(calcDep(i).vc.toFixed(2))),
          backgroundColor: 'rgba(0,212,170,0.5)',
          borderColor:     '#00d4aa',
          borderWidth:     1,
        },
      ],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend:  { labels: { color: '#8b9099', font: { size: 11 } } },
        tooltip: { backgroundColor: '#1a1e25', callbacks: { label: (c) => ' ' + fmt(c.parsed.y) } },
      },
      scales: {
        y: { ticks: { color: '#555b65', callback: (v) => fmt(v), font: { size: 9, family: 'DM Mono' } }, grid: { color: 'rgba(255,255,255,0.04)' }, border: { color: 'transparent' } },
        x: { ticks: { color: '#555b65', font: { size: 9 } }, grid: { color: 'rgba(255,255,255,0.04)' } },
      },
    },
  });
}

// ─────────────────────────────────────────────────────────────
// TABELA DETALHADA
// ─────────────────────────────────────────────────────────────

/**
 * Renderiza a tabela detalhada de depreciação com barra de progresso
 * e badge de status por item.
 */
export function renderDepTable() {
  const tbody = document.getElementById('dep-tbody');
  if (!tbody) return;

  tbody.innerHTML = '';

  if (!AppState.inv.length) {
    tbody.innerHTML = `<tr><td colspan="10" style="text-align:center;padding:28px;color:var(--text3)">
      Nenhum bem cadastrado</td></tr>`;
    return;
  }

  AppState.inv.forEach((item) => {
    const { da, vc, dm } = calcDep(item);
    const pct       = Math.min(100, (da / item.val) * 100).toFixed(1);
    const col       = getTipoColor(item.tipo);
    const isPerdido = item.status === 'perdido';

    // Cor da barra de progresso conforme nível de depreciação
    const barColor = isPerdido
      ? 'var(--red)'
      : parseFloat(pct) > 80 ? 'var(--red)'
      : parseFloat(pct) > 50 ? 'var(--amber)'
      : 'var(--accent)';

    const statusBadge = isPerdido
      ? `<span class="badge" style="font-size:9px;background:var(--red-dim);color:var(--red)">⚠️ Perdido</span>`
      : `<span class="badge" style="font-size:9px;background:var(--purple-dim);color:var(--purple)">📊 Acomp.</span>`;

    const r = tbody.insertRow();
    if (isPerdido) r.style.opacity = '0.65';

    r.innerHTML = `
      <td class="td-bold">
        <span class="inv-dot" style="background:${isPerdido ? 'var(--red)' : col}"></span>${item.desc}
      </td>
      <td><span class="pill pill-tipo" style="font-size:10px">${item.tipo || '—'}</span></td>
      <td>${fmt(item.val)}</td>
      <td style="color:var(--blue)">${fmt(da)}</td>
      <td style="color:var(--amber)">${fmt(dm)}/mês</td>
      <td style="color:var(--purple)">${fmt(item.res || 0)}</td>
      <td>${pct}%</td>
      <td class="val-now-cell"><span class="val-now">${fmt(vc)}</span></td>
      <td>${statusBadge}</td>
      <td>
        <div style="width:100px">
          <div class="progress-wrap">
            <div class="progress-fill" style="width:${pct}%;background:${barColor}"></div>
          </div>
        </div>
      </td>`;
  });
}