/**
 * ============================================================
 * PatrimônioGest — modules/historico.js
 * ============================================================
 * Módulo de Histórico de Atividades.
 *
 * Exibe uma timeline cronológica de adições/remoções do
 * inventário, estatísticas consolidadas e gráfico de evolução
 * do patrimônio total ao longo do tempo.
 * ============================================================
 */

import { fmt, fmtDate, AppState } from '../core/config.js';
import { calcDep }                 from '../core/depreciacao.js';
import { getTipoColor }             from '../core/config.js';
import { chartOpts }                from '../core/ui.js';

let _chartHist = null;

/**
 * Renderiza a página completa de Histórico.
 * Exposto globalmente como window.renderHistPage.
 */
export function renderHistPage() {
  _renderTimeline();
  _renderStats();
  _renderGrafico();
  _renderTabelaValores();
}

// ─────────────────────────────────────────────────────────────
// TIMELINE
// ─────────────────────────────────────────────────────────────

/**
 * Renderiza a lista cronológica de eventos (adições e remoções).
 */
function _renderTimeline() {
  const body = document.getElementById('hist-body');

  if (!AppState.historico.length) {
    body.innerHTML = `
      <div class="empty">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <circle cx="12" cy="12" r="10"/>
          <path d="M12 6v6l4 2"/>
        </svg>
        <div class="empty-title">Sem atividades</div>
        <div class="empty-sub">Adicione bens ao inventário</div>
      </div>`;
    return;
  }

  body.innerHTML = [...AppState.historico]
    .reverse()
    .map((h) => {
      const isAdd = h.type === 'add';
      const cor   = isAdd ? 'var(--accent)' : 'var(--red)';
      const ts    = h.ts instanceof Date ? h.ts : new Date(h.ts);

      return `
        <div class="hist-item">
          <div class="hist-dot" style="background:${cor}"></div>
          <div class="hist-body">
            <div class="hist-title">${isAdd ? 'Bem adicionado' : 'Bem removido'}: ${h.desc}</div>
            <div class="hist-meta">
              ${ts.toLocaleString('pt-BR')}
              ${isAdd ? ` · ${h.tipo || ''} · ${h.prod || ''}` : ''}
            </div>
          </div>
          <div class="hist-val" style="color:${cor}">${fmt(h.val)}</div>
        </div>`;
    })
    .join('');
}

// ─────────────────────────────────────────────────────────────
// ESTATÍSTICAS
// ─────────────────────────────────────────────────────────────

/**
 * Preenche os cards de estatísticas consolidadas do inventário.
 */
function _renderStats() {
  const ids = ['hs-valioso', 'hs-maiorDep', 'hs-medio', 'hs-total', 'hs-residual', 'hs-taxa'];

  if (!AppState.inv.length) {
    ids.forEach((id) => (document.getElementById(id).textContent = '—'));
    return;
  }

  const sorted    = [...AppState.inv].sort((a, b) => b.val - a.val);
  const maiorDep  = [...AppState.inv].sort((a, b) => calcDep(b).da - calcDep(a).da)[0];
  const totalInv  = AppState.inv.reduce((s, i) => s + i.val,          0);
  const totalCont = AppState.inv.reduce((s, i) => s + calcDep(i).vc,  0);
  const taxaMedia = AppState.inv.reduce((s, i) => s + (100 / i.vd), 0) / AppState.inv.length;

  document.getElementById('hs-valioso').textContent  = sorted[0].desc;
  document.getElementById('hs-maiorDep').textContent = fmt(calcDep(maiorDep).da) + ' — ' + maiorDep.desc;
  document.getElementById('hs-medio').textContent    = fmt(totalInv / AppState.inv.length);
  document.getElementById('hs-total').textContent    = fmt(totalInv);
  document.getElementById('hs-residual').textContent = fmt(totalCont);
  document.getElementById('hs-taxa').textContent     = taxaMedia.toFixed(1) + '% a.a.';
}

// ─────────────────────────────────────────────────────────────
// GRÁFICO DE EVOLUÇÃO DO PATRIMÔNIO
// ─────────────────────────────────────────────────────────────

/**
 * Gráfico de linha mostrando a evolução do valor total do patrimônio
 * à medida que novos itens foram sendo adicionados.
 */
function _renderGrafico() {
  const adds = AppState.historico.filter((h) => h.type === 'add');
  let running = 0;

  if (_chartHist) _chartHist.destroy();
  _chartHist = new Chart(document.getElementById('chart-hist').getContext('2d'), {
    type: 'line',
    data: {
      labels:   adds.length ? adds.map((h) => h.desc.length > 10 ? h.desc.slice(0, 10) + '…' : h.desc) : ['—'],
      datasets: [{
        label:           'Patrimônio Total',
        data:            adds.length ? adds.map((h) => { running += h.val; return parseFloat(running.toFixed(2)); }) : [0],
        borderColor:     '#a78bfa',
        backgroundColor: 'rgba(167,139,250,0.07)',
        fill:            true,
        tension:         0.4,
        pointRadius:     4,
        pointBackgroundColor: '#a78bfa',
        pointBorderColor:     '#0d0f12',
        pointBorderWidth:     2,
      }],
    },
    options: chartOpts(fmt),
  });
}

// ─────────────────────────────────────────────────────────────
// TABELA DE VALORES ATUAIS
// ─────────────────────────────────────────────────────────────

/**
 * Renderiza tabela com todos os itens ordenados por valor contábil decrescente,
 * incluindo data de lançamento, depreciação acumulada e valor atual.
 */
function _renderTabelaValores() {
  const hvTbody = document.getElementById('hist-valor-tbody');
  if (!hvTbody) return;

  if (!AppState.inv.length) {
    hvTbody.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:24px;color:var(--text3)">
      Nenhum bem no inventário</td></tr>`;
    return;
  }

  hvTbody.innerHTML = [...AppState.inv]
    .sort((a, b) => calcDep(b).vc - calcDep(a).vc)
    .map((item) => {
      const { da, vc } = calcDep(item);
      const col = getTipoColor(item.tipo);
      const ts  = item.addedAt
        ? new Date(item.addedAt).toLocaleDateString('pt-BR')
        : fmtDate(item.dt);

      return `
        <tr>
          <td class="td-bold">
            <span class="inv-dot" style="background:${col}"></span>${item.desc}
          </td>
          <td><span class="pill pill-tipo" style="font-size:10px">${item.tipo || '—'}</span></td>
          <td>${ts}</td>
          <td>${fmt(item.val)}</td>
          <td style="color:var(--blue)">${fmt(da)}</td>
          <td class="val-now-cell"><span class="val-now">${fmt(vc)}</span></td>
        </tr>`;
    })
    .join('');
}