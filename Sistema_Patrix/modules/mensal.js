/**
 * ============================================================
 * PatrimônioGest — modules/mensal.js
 * ============================================================
 * Módulo do Relatório Mensal.
 *
 * Agrupa os itens por mês de lançamento, exibe KPIs mensais,
 * gráfico misto (barras de quantidade + linha de valor) e
 * blocos acordeão por mês com tabela de itens.
 * ============================================================
 */

import { fmt, fmtDate, AppState, MESES_PT, hoje } from '../core/config.js';
import { calcDep }                                  from '../core/depreciacao.js';
import { getTipoColor }                              from '../core/config.js';
import { toggleMes }                                 from '../core/ui.js';

let _chartMensal = null;

/**
 * Renderiza toda a página de Relatório Mensal.
 * Exposto globalmente como window.renderMensalPage.
 */
export function renderMensalPage() {
  const agora     = new Date();
  const anoAtual  = agora.getFullYear();
  const mesAtual  = agora.getMonth();

  // ── Agrupamento por mês de lançamento ────────────────────────
  const mesMap = {};
  AppState.inv.forEach((item) => {
    const d   = item.addedAt ? new Date(item.addedAt) : new Date(item.dt + 'T00:00:00');
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    if (!mesMap[key]) mesMap[key] = [];
    mesMap[key].push(item);
  });

  // Descobre o mês/ano mais antigo para criar a série completa
  let minAno = anoAtual, minMes = mesAtual;
  AppState.inv.forEach((item) => {
    const d = item.addedAt ? new Date(item.addedAt) : new Date(item.dt + 'T00:00:00');
    if (d.getFullYear() < minAno || (d.getFullYear() === minAno && d.getMonth() < minMes)) {
      minAno = d.getFullYear();
      minMes = d.getMonth();
    }
  });

  // Gera array de todos os meses desde o mais antigo até hoje
  const todos = [];
  let a = minAno, m = minMes;
  while (a < anoAtual || (a === anoAtual && m <= mesAtual)) {
    todos.push({ ano: a, mes: m, key: `${a}-${String(m + 1).padStart(2, '0')}` });
    m++;
    if (m > 11) { m = 0; a++; }
  }

  const comItens = todos.filter((k) => mesMap[k.key]);

  // ── KPI totais ───────────────────────────────────────────────
  document.getElementById('ms-meses').textContent       = comItens.length;
  document.getElementById('ms-total-itens').textContent  = AppState.inv.length;
  document.getElementById('ms-total-val').textContent    = fmt(AppState.inv.reduce((s, i) => s + i.val, 0));
  document.getElementById('ms-total-dep').textContent    = fmt(AppState.inv.reduce((s, i) => s + calcDep(i).da, 0));
  document.getElementById('ms-badge').textContent        = todos.length + ' meses';

  // ── Gráfico misto: qtd (barras) + valor (linha) ──────────────
  const chartLabels = todos.map((k) => MESES_PT[k.mes].slice(0, 3) + '/' + String(k.ano).slice(2));
  const chartQtd    = todos.map((k) => (mesMap[k.key] || []).length);
  const chartVal    = todos.map((k) =>
    parseFloat((mesMap[k.key] || []).reduce((s, i) => s + i.val, 0).toFixed(2))
  );

  if (_chartMensal) _chartMensal.destroy();
  _chartMensal = new Chart(document.getElementById('chart-mensal').getContext('2d'), {
    type: 'bar',
    data: {
      labels: chartLabels,
      datasets: [
        {
          label:           'Qtd. lançada',
          data:            chartQtd,
          backgroundColor: 'rgba(167,139,250,0.55)',
          borderColor:     '#a78bfa',
          borderWidth:     1,
          yAxisID:         'y2',
          borderRadius:    4,
        },
        {
          label:           'Valor original (R$)',
          data:            chartVal,
          type:            'line',
          borderColor:     '#00d4aa',
          backgroundColor: 'rgba(0,212,170,0.08)',
          fill:            true,
          tension:         0.4,
          pointRadius:     4,
          pointBackgroundColor: '#00d4aa',
          pointBorderColor:     '#0d0f12',
          pointBorderWidth:     2,
          yAxisID:         'y1',
        },
      ],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend:  { labels: { color: '#8b9099', font: { size: 11, family: 'DM Sans' } } },
        tooltip: { backgroundColor: '#1a1e25' },
      },
      scales: {
        y1: { position: 'left',  ticks: { color: '#555b65', callback: (v) => fmt(v), font: { size: 9, family: 'DM Mono' } }, grid: { color: 'rgba(255,255,255,0.04)' }, border: { color: 'transparent' } },
        y2: { position: 'right', ticks: { color: '#555b65', stepSize: 1, font: { size: 9 } }, grid: { display: false }, border: { color: 'transparent' } },
        x:  { ticks: { color: '#555b65', font: { size: 9 } }, grid: { color: 'rgba(255,255,255,0.04)' }, border: { color: 'transparent' } },
      },
    },
  });

  // ── Blocos acordeão por mês (do mais recente para o mais antigo) ──
  const container = document.getElementById('mensal-blocos');
  container.innerHTML = '';

  if (!todos.length) {
    container.innerHTML = `<div class="empty">
      <div class="empty-title">Nenhum dado</div>
      <div class="empty-sub">Adicione bens ao inventário</div>
    </div>`;
    return;
  }

  [...todos].reverse().forEach((km, idx) => {
    const items   = mesMap[km.key] || [];
    const qtd     = items.length;
    const valMes  = items.reduce((s, i) => s + i.val, 0);
    const depMes  = items.reduce((s, i) => s + calcDep(i).da, 0);
    const valAtualMes = items.reduce((s, i) => s + calcDep(i).vc, 0);
    const nomeMes = MESES_PT[km.mes] + ' ' + km.ano;
    const blockId = 'mb-' + km.key.replace('-', '_');

    const div = document.createElement('div');
    div.className = 'month-block';

    div.innerHTML = `
      <div class="month-header ${idx === 0 ? 'open' : ''}" onclick="toggleMes('${blockId}', this)">
        <div class="month-title">
          <span>${nomeMes}</span>
          ${qtd
            ? `<span class="badge badge-purple" style="font-size:10px">${qtd} lançamento${qtd !== 1 ? 's' : ''}</span>`
            : `<span class="badge" style="background:var(--bg3);color:var(--text3);font-size:10px">Sem lançamentos</span>`}
        </div>
        <div class="month-meta">
          ${qtd ? `<span style="font-size:11px;color:var(--text3);font-family:'DM Mono',monospace">${fmt(valMes)}</span>` : ''}
          <svg class="month-chevron ${idx === 0 ? 'open' : ''}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="6 9 12 15 18 9"/>
          </svg>
        </div>
      </div>
      <div class="month-body ${idx === 0 ? 'open' : ''}" id="${blockId}">
        ${qtd
          ? `<div class="month-stats-bar">
               <div class="ms-item"><div class="ms-label">Lançamentos</div><div class="ms-val" style="color:var(--purple)">${qtd}</div></div>
               <div class="ms-item"><div class="ms-label">Valor Original</div><div class="ms-val" style="color:var(--amber)">${fmt(valMes)}</div></div>
               <div class="ms-item"><div class="ms-label">Dep. Acumulada</div><div class="ms-val" style="color:var(--blue)">${fmt(depMes)}</div></div>
               <div class="ms-item"><div class="ms-label">Valor Atual</div><div class="ms-val" style="color:var(--accent)">${fmt(valAtualMes)}</div></div>
             </div>
             <div class="table-wrap">
               <table>
                 <thead>
                   <tr>
                     <th>Bem</th><th>Tipo</th><th>Aquisição</th><th>Orig.</th>
                     <th>Dep. Acum.</th><th>Dep./mês</th>
                     <th style="color:var(--accent)">Valor Atual</th>
                   </tr>
                 </thead>
                 <tbody>
                   ${items.map((item) => {
                     const { da, vc, dm } = calcDep(item);
                     const col = getTipoColor(item.tipo);
                     return `
                       <tr>
                         <td class="td-bold">
                           <span class="inv-dot" style="background:${col}"></span>${item.desc}
                         </td>
                         <td><span class="pill pill-tipo" style="font-size:10px">${item.tipo || '—'}</span></td>
                         <td>${fmtDate(item.dt)}</td>
                         <td>${fmt(item.val)}</td>
                         <td style="color:var(--blue)">${fmt(da)}</td>
                         <td style="color:var(--amber)">${fmt(dm)}/mês</td>
                         <td class="val-now-cell"><span class="val-now">${fmt(vc)}</span></td>
                       </tr>`;
                   }).join('')}
                 </tbody>
               </table>
             </div>`
          : `<div style="padding:20px 22px;color:var(--text3);font-size:12px;text-align:center">
               Nenhum bem lançado em ${nomeMes}
             </div>`}
      </div>`;

    container.appendChild(div);
  });
}