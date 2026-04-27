/**
 * ============================================================
 * PatrimônioGest — modules/monitoramento.js
 * ============================================================
 * Módulo de Monitoramento Unificado.
 *
 * Combina dados do Inventário Realizado (AppState.inv) com o
 * Patrimônio Geral (AppState.invBD) em uma única visão.
 *
 * Responsabilidades:
 *  - KPIs consolidados das duas fontes
 *  - Três gráficos: donut por tipo, barras de % dep., evolução mensal
 *  - Tabela expansível com paginação "carregar mais"
 *  - Autocomplete de busca individual
 *  - Painel de detalhe do item selecionado
 *  - Geração e impressão de relatório em nova janela
 * ============================================================
 */

import { fmt, fmtDate, AppState, MESES_PT } from '../core/config.js';
import { calcDep, getAlerts }                from '../core/depreciacao.js';
import { getTipoColor }                       from '../core/config.js';
import { carregarPatrimonioGeral }            from '../core/database.js';
import { showToast, setSyncStatus }           from '../core/ui.js';

// Instâncias Chart.js
let _monChartDep    = null;
let _monChartBarras = null;
let _monChartTipo   = null;   // evolução mensal

// Paginação da tabela
let _monTabelaPage  = 0;
const MON_PAGE_SIZE = 50;

// ─────────────────────────────────────────────────────────────
// FONTE DE DADOS COMBINADA
// ─────────────────────────────────────────────────────────────

/**
 * Retorna a lista combinada de itens aplicando os filtros ativos
 * de fonte, tipo, setor e busca textual.
 *
 * @returns {Array} Lista filtrada de itens (inv + invBD)
 */
export function monGetAllItems() {
  const fonte = document.getElementById('mon-fonte')?.value || 'ambos';
  const tipo  = document.getElementById('mon-ftipo')?.value || '';
  const busca = (document.getElementById('mon-tabela-busca')?.value || '').toLowerCase();

  let items = [];
  if (fonte !== 'bd')  items = items.concat(AppState.inv.map((i) => ({ ...i, _origem: 'inv' })));
  if (fonte !== 'inv') items = items.concat(AppState.invBD.map((i) => ({ ...i, _origem: 'bd' })));

  if (tipo)  items = items.filter((i) => i.tipo === tipo);
  if (busca) items = items.filter((i) =>
    i.desc.toLowerCase().includes(busca)  ||
    (i.tipo           || '').toLowerCase().includes(busca) ||
    (i.filial         || '').toLowerCase().includes(busca) ||
    (i.n_patrimonio   || '').toLowerCase().includes(busca)
  );

  return items;
}

// ─────────────────────────────────────────────────────────────
// RENDER PRINCIPAL
// ─────────────────────────────────────────────────────────────

/**
 * Renderiza toda a página de Monitoramento.
 * Exposto globalmente como window.renderMonitoramento.
 */
export function renderMonitoramento() {
  monRenderStats();
  monRenderCharts();
  _monTabelaPage = 0;
  monRenderTable();
  monRenderTipoFilter();
}

// ─────────────────────────────────────────────────────────────
// KPIs
// ─────────────────────────────────────────────────────────────

/**
 * Atualiza os cards de KPI do monitoramento.
 */
export function monRenderStats() {
  const items    = monGetAllItems();
  const acomp    = items.filter((i) => !i.status || i.status === 'acompanhamento').length;
  const alertas  = items.filter((i) => calcDep(i).restMeses <= 12 && i.status !== 'perdido').length;
  const perdidos = items.filter((i) => i.status === 'perdido').length;
  const valAtual = items.reduce((s, i) => s + calcDep(i).vc, 0);

  const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
  set('mon-total',   items.length);
  set('mon-acomp',   acomp);
  set('mon-alertas', alertas);
  set('mon-perdidos', perdidos);
  set('mon-valor',   fmt(valAtual));

  // Badge no menu
  const nb = document.getElementById('nb-monitor');
  if (nb) { nb.textContent = alertas; nb.classList.toggle('show', alertas > 0); }
}

// ─────────────────────────────────────────────────────────────
// FILTROS DE TIPO E SETOR
// ─────────────────────────────────────────────────────────────

/**
 * Popula os dropdowns de tipo e setor com os valores únicos
 * encontrados nos itens combinados.
 */
export function monRenderTipoFilter() {
  const selTipo = document.getElementById('mon-tabela-tipo');
  if (selTipo) {
    const tipos  = [...new Set(monGetAllItems().map((i) => i.tipo || 'Outros'))].sort();
    const atual  = selTipo.value;
    selTipo.innerHTML = '<option value="">Todos os tipos</option>'
      + tipos.map((t) => `<option value="${t}"${t === atual ? ' selected' : ''}>${t}</option>`).join('');
  }

  const selSetor = document.getElementById('mon-tabela-setor');
  if (selSetor) {
    const setores = [...new Set(monGetAllItems().map((i) => i.centro_custo || '').filter(Boolean))].sort();
    const atual   = selSetor.value;
    selSetor.innerHTML = '<option value="">Todos os setores</option>'
      + setores.map((s) => `<option value="${s}"${s === atual ? ' selected' : ''}>${s}</option>`).join('');
  }
}

// ─────────────────────────────────────────────────────────────
// GRÁFICOS
// ─────────────────────────────────────────────────────────────

/**
 * Renderiza os três gráficos do monitoramento:
 *  1. Donut — depreciação acumulada por tipo
 *  2. Barras horizontais — Top 10 por % depreciado
 *  3. Linha — evolução da depreciação acumulada nos últimos 12 meses
 */
export function monRenderCharts() {
  const items = monGetAllItems();

  // ── 1. Donut: dep. acumulada por tipo ───────────────────────
  const tipoMap = {};
  items.forEach((i) => {
    const { da } = calcDep(i), t = i.tipo || 'Outros';
    tipoMap[t] = (tipoMap[t] || 0) + da;
  });
  const tL = Object.keys(tipoMap);
  const tD = tL.map((k) => parseFloat(tipoMap[k].toFixed(2)));
  const tC = tL.map((k) => getTipoColor(k));

  if (_monChartDep) _monChartDep.destroy();
  const ctx1 = document.getElementById('mon-chart-dep')?.getContext('2d');
  if (ctx1) {
    _monChartDep = new Chart(ctx1, {
      type: 'doughnut',
      data: {
        labels:   tL.length ? tL : ['Sem dados'],
        datasets: [{ data: tD.length ? tD : [1], backgroundColor: tD.length ? tC : ['#212630'], borderColor: '#13161b', borderWidth: 3 }],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: {
          legend:  { labels: { color: '#8b9099', font: { size: 11, family: 'DM Sans' } } },
          tooltip: { backgroundColor: '#1a1e25', callbacks: { label: (c) => ' ' + fmt(c.parsed) } },
        },
      },
    });
  }

  // ── 2. Barras horizontais: Top 10 % depreciado ───────────────
  const sorted = [...items]
    .sort((a, b) => (calcDep(b).da / Math.max(b.val, 1)) - (calcDep(a).da / Math.max(a.val, 1)))
    .slice(0, 10);

  if (_monChartBarras) _monChartBarras.destroy();
  const ctx2 = document.getElementById('mon-chart-barras')?.getContext('2d');
  if (ctx2) {
    _monChartBarras = new Chart(ctx2, {
      type: 'bar',
      data: {
        labels:   sorted.map((i) => i.desc.length > 15 ? i.desc.slice(0, 15) + '…' : i.desc),
        datasets: [{
          label:           '% Depreciado',
          data:            sorted.map((i) => Math.min(100, (calcDep(i).da / Math.max(i.val, 1)) * 100).toFixed(1)),
          backgroundColor: sorted.map((i) => getTipoColor(i.tipo) + 'bb'),
          borderColor:     sorted.map((i) => getTipoColor(i.tipo)),
          borderWidth:     1, borderRadius: 4,
        }],
      },
      options: {
        indexAxis: 'y', responsive: true, maintainAspectRatio: false,
        plugins: {
          legend:  { display: false },
          tooltip: { backgroundColor: '#1a1e25', callbacks: { label: (c) => ' ' + c.parsed.x + '% depreciado' } },
        },
        scales: {
          x: { max: 100, ticks: { color: '#555b65', callback: (v) => v + '%', font: { size: 9, family: 'DM Mono' } }, grid: { color: 'rgba(255,255,255,0.04)' }, border: { color: 'transparent' } },
          y: { ticks: { color: '#555b65', font: { size: 9 } }, grid: { color: 'rgba(255,255,255,0.04)' } },
        },
      },
    });
  }

  // ── 3. Linha: evolução mensal da depreciação acumulada ───────
  const agora    = new Date();
  const labMeses = [], dataDep = [];

  for (let m = 11; m >= 0; m--) {
    const d       = new Date(agora.getFullYear(), agora.getMonth() - m, 1);
    const fakeHoje = new Date(d.getFullYear(), d.getMonth() + 1, 0);
    labMeses.push(MESES_PT[d.getMonth()].slice(0, 3) + '/' + String(d.getFullYear()).slice(2));

    const dep = items.reduce((s, i) => {
      const dt = new Date(i.dt + 'T00:00:00');
      if (dt > fakeHoje) return s;
      const diasUso = Math.max(0, (fakeHoje - dt) / (1000 * 60 * 60 * 24));
      const dm      = (i.val - (i.res || 0)) / (i.vd * 12);
      return s + Math.min(dm * (diasUso / 30), i.val - (i.res || 0));
    }, 0);

    dataDep.push(parseFloat(dep.toFixed(2)));
  }

  if (_monChartTipo) _monChartTipo.destroy();
  const ctx3 = document.getElementById('mon-chart-evolucao')?.getContext('2d');
  if (ctx3) {
    _monChartTipo = new Chart(ctx3, {
      type: 'line',
      data: {
        labels:   labMeses,
        datasets: [{
          label:           'Dep. acumulada',
          data:            dataDep,
          borderColor:     '#00d4aa',
          backgroundColor: 'rgba(0,212,170,0.07)',
          fill:            true, tension: 0.4,
          pointRadius:     3, pointBackgroundColor: '#00d4aa', pointBorderColor: '#0d0f12', pointBorderWidth: 2,
        }],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false }, tooltip: { backgroundColor: '#1a1e25', callbacks: { label: (c) => ' ' + fmt(c.parsed.y) } } },
        scales: {
          y: { ticks: { color: '#555b65', callback: (v) => fmt(v), font: { family: 'DM Mono', size: 9 } }, grid: { color: 'rgba(255,255,255,0.04)' }, border: { color: 'transparent' } },
          x: { ticks: { color: '#555b65', font: { size: 9 } }, grid: { color: 'rgba(255,255,255,0.04)' } },
        },
      },
    });
  }
}

// ─────────────────────────────────────────────────────────────
// TABELA COM PAGINAÇÃO
// ─────────────────────────────────────────────────────────────

/**
 * Renderiza a tabela de monitoramento com paginação progressiva
 * ("carregar mais"). Cada linha tem um bloco expansível de detalhes.
 *
 * @param {boolean} [resetPage=false] - Se true, volta para a primeira página
 */
export function monRenderTable(resetPage) {
  if (resetPage) _monTabelaPage = 0;

  const tipoFiltro  = (document.getElementById('mon-tabela-tipo')?.value  || '').toLowerCase();
  const setorFiltro = (document.getElementById('mon-tabela-setor')?.value || '');
  const tbody       = document.getElementById('mon-tbody');
  if (!tbody) return;

  let items = monGetAllItems();
  if (tipoFiltro)  items = items.filter((i) => (i.tipo || '').toLowerCase() === tipoFiltro);
  if (setorFiltro) items = items.filter((i) => (i.centro_custo || '') === setorFiltro);

  const total   = items.length;
  const fim     = (_monTabelaPage + 1) * MON_PAGE_SIZE;
  const visiveis = items.slice(0, fim);
  const temMais  = fim < total;

  if (!visiveis.length) {
    tbody.innerHTML = `<tr><td colspan="3" style="text-align:center;padding:32px;color:var(--text3)">Nenhum item encontrado</td></tr>`;
    const btnWrap = document.getElementById('mon-load-more-wrap');
    if (btnWrap) btnWrap.style.display = 'none';
    return;
  }

  tbody.innerHTML = visiveis.map((item, idx) => {
    const { da, vc, restMeses } = calcDep(item);
    const col       = getTipoColor(item.tipo);
    const isPerdido = item.status === 'perdido';
    const isAlert   = restMeses <= 12;
    const pct       = Math.min(100, (da / Math.max(item.val, 1)) * 100).toFixed(0);

    const statusBadge = isPerdido
      ? `<span style="font-size:9px;padding:2px 6px;border-radius:10px;background:var(--red-dim);color:var(--red)">⚠️ Perdido</span>`
      : isAlert
        ? `<span style="font-size:9px;padding:2px 6px;border-radius:10px;background:var(--amber-dim);color:var(--amber)">${restMeses}m</span>`
        : `<span style="font-size:9px;padding:2px 6px;border-radius:10px;background:var(--accent-dim);color:var(--accent)">Ativo</span>`;

    const origemBadge = item._origem === 'bd'
      ? `<span style="font-size:9px;padding:2px 6px;border-radius:10px;background:var(--blue-dim);color:var(--blue)">🗄️ BD</span>`
      : `<span style="font-size:9px;padding:2px 6px;border-radius:10px;background:var(--purple-dim);color:var(--purple)">📋 Inv.</span>`;

    const extraInfo = item._origem === 'bd' && (item.filial || item.modelo || item.n_patrimonio)
      ? `${item.n_patrimonio ? '<span style="color:var(--text3)">#' + item.n_patrimonio + '</span> · ' : ''}${item.filial ? '<span style="color:var(--text3)">' + item.filial + '</span>' : ''}`
      : '';

    const detalheId = `mon-det-${idx}`;

    return `
      <tr style="${isPerdido ? 'opacity:.65' : ''}">
        <td style="padding:6px 10px">
          <div style="display:flex;align-items:center;gap:8px">
            <button onclick="monToggleDetalhe('${detalheId}')"
              id="btn-${detalheId}"
              style="width:20px;height:20px;border-radius:50%;border:1px solid var(--border);background:var(--bg3);color:var(--text2);cursor:pointer;font-size:12px;display:flex;align-items:center;justify-content:center;flex-shrink:0;transition:all .15s">+</button>
            <span style="width:8px;height:8px;border-radius:50%;background:${isPerdido ? 'var(--red)' : col};flex-shrink:0;display:inline-block"></span>
            <div style="min-width:0">
              <div style="font-size:12px;font-weight:500;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:300px">${item.desc}</div>
              ${extraInfo ? `<div style="font-size:10px;margin-top:1px">${extraInfo}</div>` : ''}
            </div>
            <span style="font-size:10px;padding:2px 7px;border-radius:10px;background:${col}22;color:${col};white-space:nowrap;flex-shrink:0">${item.tipo || '—'}</span>
          </div>
          <!-- Bloco de detalhe expansível -->
          <div id="${detalheId}" style="display:none;margin-top:6px;margin-left:28px;padding:10px 12px;background:var(--bg3);border:1px solid var(--border);border-radius:8px">
            <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:8px">
              <div><div style="font-size:9px;color:var(--text3);margin-bottom:2px">AQUISIÇÃO</div><div style="font-size:11px;font-weight:500;color:var(--text)">${fmtDate(item.dt)}</div></div>
              <div><div style="font-size:9px;color:var(--text3);margin-bottom:2px">VALOR ORIGINAL</div><div style="font-size:11px;font-weight:500;color:var(--text)">${fmt(item.val)}</div></div>
              <div><div style="font-size:9px;color:var(--text3);margin-bottom:2px">DEP. ACUMULADA</div><div style="font-size:11px;font-weight:500;color:var(--blue)">${fmt(da)}</div></div>
              <div><div style="font-size:9px;color:var(--text3);margin-bottom:2px">VALOR ATUAL</div><div style="font-size:11px;font-weight:600;color:var(--accent)">${fmt(vc)}</div></div>
            </div>
            <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:8px">
              ${item.n_patrimonio ? `<div><div style="font-size:9px;color:var(--text3);margin-bottom:2px">Nº PATRIMÔNIO</div><div style="font-size:11px;color:var(--text)">${item.n_patrimonio}</div></div>` : ''}
              ${item.filial       ? `<div><div style="font-size:9px;color:var(--text3);margin-bottom:2px">FILIAL</div><div style="font-size:11px;color:var(--text)">${item.filial}</div></div>` : ''}
              ${item.prod         ? `<div><div style="font-size:9px;color:var(--text3);margin-bottom:2px">MARCA</div><div style="font-size:11px;color:var(--text)">${item.prod}</div></div>` : ''}
              ${item.modelo       ? `<div><div style="font-size:9px;color:var(--text3);margin-bottom:2px">MODELO</div><div style="font-size:11px;color:var(--text)">${item.modelo}</div></div>` : ''}
              <div><div style="font-size:9px;color:var(--text3);margin-bottom:2px">COLABORADOR</div><div style="font-size:11px;font-weight:500;color:var(--text)">${item.obs || '—'}</div></div>
            </div>
            <div style="display:flex;align-items:center;gap:6px">
              <div style="flex:1;height:4px;background:var(--border);border-radius:2px;overflow:hidden">
                <div style="width:${pct}%;height:100%;background:${parseFloat(pct) > 80 ? 'var(--red)' : parseFloat(pct) > 50 ? 'var(--amber)' : 'var(--accent)'};border-radius:2px"></div>
              </div>
              <span style="font-size:10px;color:var(--text3);flex-shrink:0">${pct}% dep.</span>
              ${statusBadge} ${origemBadge}
            </div>
          </div>
        </td>
      </tr>`;
  }).join('');

  // ── Botão "Carregar mais" ────────────────────────────────────
  let btnWrap = document.getElementById('mon-load-more-wrap');
  if (!btnWrap) {
    btnWrap    = document.createElement('div');
    btnWrap.id = 'mon-load-more-wrap';
    btnWrap.style.cssText = 'text-align:center;padding:16px';
    tbody.closest('table').after(btnWrap);
  }
  btnWrap.style.display = 'block';
  btnWrap.innerHTML = temMais
    ? `<button class="btn btn-ghost" onclick="monCarregarMais()" style="font-size:12px">
         Carregar mais — exibindo ${fim > total ? total : fim} de ${total} itens
       </button>`
    : `<div style="font-size:11px;color:var(--text3);padding:8px">Exibindo todos os ${total} itens</div>`;
}

/**
 * Expande ou colapsa o bloco de detalhe de um item da tabela.
 *
 * @param {string} id - ID do elemento de detalhe
 */
export function monToggleDetalhe(id) {
  const el  = document.getElementById(id);
  const btn = document.getElementById('btn-' + id);
  if (!el) return;
  const aberto = el.style.display === 'block';
  el.style.display     = aberto ? 'none'             : 'block';
  btn.textContent      = aberto ? '+'                : '−';
  btn.style.background = aberto ? 'var(--bg3)'       : 'var(--accent-dim)';
  btn.style.color      = aberto ? 'var(--text2)'     : 'var(--accent)';
  btn.style.borderColor = aberto ? 'var(--border)'   : 'var(--accent)';
}

/**
 * Carrega mais itens na tabela (próxima "página").
 */
export function monCarregarMais() {
  _monTabelaPage++;
  monRenderTable();
}

// ─────────────────────────────────────────────────────────────
// CONEXÃO COM O BANCO (botão manual)
// ─────────────────────────────────────────────────────────────

/**
 * Dispara o carregamento do Patrimônio Geral manualmente
 * (chamado pelo botão "Conectar BD" na interface).
 */
export async function monConectarBD() {
  const statusEl = document.getElementById('mon-conn-status');
  if (statusEl) { statusEl.textContent = '⏳ Conectando ao Supabase...'; statusEl.style.color = 'var(--text3)'; }

  const ok = await carregarPatrimonioGeral((qtd) => {
    if (statusEl) statusEl.textContent = `⏳ Carregando... ${qtd} itens`;
  });

  if (ok) {
    if (statusEl) { statusEl.textContent = `✅ ${AppState.invBD.length} itens carregados`; statusEl.style.color = 'var(--accent)'; }
    showToast(`✅ ${AppState.invBD.length} itens sincronizados!`, 'success');
    renderMonitoramento();
  } else {
    if (statusEl) { statusEl.textContent = '❌ Erro na conexão.'; statusEl.style.color = 'var(--red)'; }
    showToast('❌ Falha na sincronização.', 'error');
  }
}

// ─────────────────────────────────────────────────────────────
// RELATÓRIO DE MONITORAMENTO
// ─────────────────────────────────────────────────────────────

/**
 * Gera o relatório de monitoramento em overlay dentro da própria página.
 */
export function monGerarRelatorio() {
  const items = _getItemsFiltrados();
  if (!items.length) { showToast('Nenhum item para gerar relatório.', 'warning'); return; }

  const totalOrig = items.reduce((s, i) => s + i.val, 0);
  const totalDep  = items.reduce((s, i) => s + calcDep(i).da, 0);
  const totalCont = items.reduce((s, i) => s + calcDep(i).vc, 0);

  document.getElementById('mon-rel-sub').textContent =
    `${items.length} item${items.length !== 1 ? 's' : ''} · gerado em ${new Date().toLocaleString('pt-BR')}`;

  document.getElementById('mon-rel-resumo').innerHTML = `
    <div class="res-card"><div class="res-label">Total de itens</div><div class="res-value" style="color:var(--text)">${items.length}</div></div>
    <div class="res-card"><div class="res-label">Valor original</div><div class="res-value" style="color:var(--amber);font-size:14px">${fmt(totalOrig)}</div></div>
    <div class="res-card"><div class="res-label">Dep. acumulada</div><div class="res-value" style="color:var(--blue);font-size:14px">${fmt(totalDep)}</div></div>
    <div class="res-card" style="border-color:rgba(0,212,170,.3)"><div class="res-label">Valor atual total</div><div class="res-value" style="color:var(--accent);font-size:14px">${fmt(totalCont)}</div></div>`;

  const porSetor = {};
  items.forEach((i) => { const s = i.centro_custo || 'Sem setor'; if (!porSetor[s]) porSetor[s] = []; porSetor[s].push(i); });

  document.getElementById('mon-rel-corpo').innerHTML = Object.entries(porSetor).map(([setor, sitens]) => `
    <div style="margin-bottom:18px">
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px">
        <span style="font-size:11px;font-weight:600;color:var(--accent);text-transform:uppercase;letter-spacing:.08em">${setor}</span>
        <div style="flex:1;height:1px;background:var(--border)"></div>
        <span style="font-size:11px;color:var(--text3)">${sitens.length} item${sitens.length !== 1 ? 's' : ''}</span>
      </div>
      <div style="background:var(--bg3);border:1px solid var(--border);border-radius:var(--r);overflow:hidden">
        ${sitens.map((item, idx) => {
          const { da, vc, restMeses } = calcDep(item);
          const col       = getTipoColor(item.tipo);
          const isPerdido = item.status === 'perdido';
          const statusBadge = isPerdido
            ? `<span style="font-size:9px;padding:2px 7px;border-radius:10px;background:var(--red-dim);color:var(--red)">⚠️ Perdido</span>`
            : restMeses <= 12
              ? `<span style="font-size:9px;padding:2px 7px;border-radius:10px;background:var(--amber-dim);color:var(--amber)">${restMeses === 0 ? 'VENCIDO' : restMeses + 'm rest.'}</span>`
              : `<span style="font-size:9px;padding:2px 7px;border-radius:10px;background:var(--accent-dim);color:var(--accent)">Ativo</span>`;
          return `
            <div style="display:flex;align-items:center;gap:10px;padding:9px 14px;${idx < sitens.length - 1 ? 'border-bottom:1px solid var(--border)' : ''}">
              <span style="width:8px;height:8px;border-radius:50%;background:${isPerdido ? 'var(--red)' : col};flex-shrink:0"></span>
              <span style="flex:1;font-size:12px;font-weight:500;color:var(--text);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${item.desc}</span>
              <span style="font-size:10px;color:var(--text3);font-family:'DM Mono',monospace">${fmt(vc)}</span>
              <span style="font-size:9px;padding:2px 7px;border-radius:10px;background:${getTipoColor(item.tipo)}22;color:${getTipoColor(item.tipo)}">${item.tipo || '—'}</span>
              ${statusBadge}
            </div>`;
        }).join('')}
      </div>
    </div>`).join('');

  document.getElementById('mon-relatorio-overlay').classList.add('open');
}

export function monFecharRelatorio() {
  document.getElementById('mon-relatorio-overlay').classList.remove('open');
}

/**
 * Abre uma nova janela e imprime o relatório de monitoramento.
 */
export function monImprimirRelatorio() {
  const items = _getItemsFiltrados();
  if (!items.length) { showToast('Nenhum item para imprimir.', 'warning'); return; }

  const agora    = new Date().toLocaleString('pt-BR');
  const fmtDt    = (s) => { if (!s) return '—'; const d = new Date(s); return isNaN(d) ? s : d.toLocaleDateString('pt-BR'); };
  const totalOrig = items.reduce((s, i) => s + i.val, 0);
  const totalDep  = items.reduce((s, i) => s + calcDep(i).da, 0);
  const totalCont = items.reduce((s, i) => s + calcDep(i).vc, 0);
  const totalRes  = items.reduce((s, i) => s + (i.res || 0), 0);
  const alertas   = items.filter((i) => calcDep(i).restMeses <= 12 && i.status !== 'perdido');
  const vencidos  = alertas.filter((i) => calcDep(i).restMeses === 0);
  const proximos  = alertas.filter((i) => calcDep(i).restMeses  > 0);

  const alertasHtml = !alertas.length
    ? '<p style="color:#6b7280;font-size:12px">Nenhum alerta.</p>'
    : alertas.map((item) => {
        const { restMeses } = calcDep(item), isV = restMeses === 0;
        return `<div style="display:flex;justify-content:space-between;padding:7px 12px;margin-bottom:5px;border-radius:6px;background:${isV ? '#fef2f2' : '#fffbeb'};border:1px solid ${isV ? '#fca5a5' : '#fde68a'}">
          <span style="font-size:12px;font-weight:500">${item.desc} <span style="color:#6b7280;font-weight:400">· ${item.centro_custo || '—'} · ${item.filial || '—'}</span></span>
          <span style="font-size:12px;font-weight:600;color:${isV ? '#dc2626' : '#d97706'}">${isV ? 'VENCIDO' : restMeses + ' meses restantes'}</span>
        </div>`;
      }).join('');

  const linhas = items.map((item) => {
    const { da, vc, dm, restMeses } = calcDep(item);
    const pct       = Math.min(100, (da / Math.max(item.val, 1)) * 100).toFixed(1);
    const isPerdido = item.status === 'perdido';
    const statusHtml = isPerdido
      ? `<span style="color:#dc2626;font-weight:600">⚠️ Perdido</span>`
      : restMeses === 0 ? `<span style="color:#dc2626;font-weight:600">VENCIDO</span>`
      : restMeses <= 12 ? `<span style="color:#d97706">${restMeses}m rest.</span>`
      : `<span style="color:#16a34a">Ativo</span>`;

    return `<tr style="${isPerdido ? 'opacity:.6' : ''}">
      <td style="font-weight:500;padding:7px 10px;border-bottom:1px solid #f3f4f6">${item.desc}</td>
      <td style="padding:7px 10px;border-bottom:1px solid #f3f4f6;color:#6b7280">${item.tipo || '—'}</td>
      <td style="padding:7px 10px;border-bottom:1px solid #f3f4f6;color:#6b7280">${item.centro_custo || '—'}</td>
      <td style="padding:7px 10px;border-bottom:1px solid #f3f4f6;color:#6b7280">${item.filial || '—'}</td>
      <td style="padding:7px 10px;border-bottom:1px solid #f3f4f6;font-style:italic;color:#6b7280">${item.obs || '—'}</td>
      <td style="padding:7px 10px;border-bottom:1px solid #f3f4f6;text-align:right">${fmt(item.val)}</td>
      <td style="padding:7px 10px;border-bottom:1px solid #f3f4f6;text-align:right;color:#2563eb">${fmt(da)}</td>
      <td style="padding:7px 10px;border-bottom:1px solid #f3f4f6;text-align:right;color:#7c3aed">${fmt(item.res || 0)}</td>
      <td style="padding:7px 10px;border-bottom:1px solid #f3f4f6;text-align:right;color:#d97706">${fmt(dm)}/mês</td>
      <td style="padding:7px 10px;border-bottom:1px solid #f3f4f6;text-align:right">${pct}%</td>
      <td style="padding:7px 10px;border-bottom:1px solid #f3f4f6;text-align:right;color:#059669;font-weight:600">${fmt(vc)}</td>
      <td style="padding:7px 10px;border-bottom:1px solid #f3f4f6;text-align:center">${statusHtml}</td>
    </tr>`;
  }).join('');

  const win = window.open('', '_blank');
  win.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8">
  <title>Relatório de Monitoramento</title>
  <style>body{font-family:'DM Sans',Arial,sans-serif;color:#111;padding:32px;max-width:1400px;margin:0 auto;font-size:13px}h1{font-size:22px;font-weight:700;margin-bottom:2px}.sub{font-size:12px;color:#6b7280;margin-top:2px}.kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:24px}.kpi{border:1px solid #e5e7eb;border-radius:8px;padding:12px 14px}.kpi-label{font-size:10px;color:#6b7280;text-transform:uppercase;letter-spacing:.05em;margin-bottom:4px}.kpi-val{font-size:18px;font-weight:700}.section{font-size:13px;font-weight:600;margin:20px 0 10px;padding-bottom:6px;border-bottom:1px solid #e5e7eb}table{width:100%;border-collapse:collapse;font-size:11px}thead tr{background:#f9fafb}th{padding:8px 10px;text-align:left;border-bottom:2px solid #e5e7eb;font-size:10px;text-transform:uppercase;color:#6b7280}tfoot tr{background:#f9fafb;font-weight:600}.footer{margin-top:24px;padding-top:12px;border-top:1px solid #e5e7eb;font-size:10px;color:#9ca3af;display:flex;justify-content:space-between}</style>
  </head><body>
  <h1>PatriX — Gestão Patrimonial</h1>
  <div class="sub">Relatório de Monitoramento · ${agora} · ${items.length} itens · Vencidos: <strong style="color:#dc2626">${vencidos.length}</strong> · Próximos: <strong style="color:#d97706">${proximos.length}</strong></div>
  <div class="kpis">
    <div class="kpi" style="background:#f0fdf4;border-color:#bbf7d0"><div class="kpi-label">Valor Total Original</div><div class="kpi-val" style="color:#16a34a">${fmt(totalOrig)}</div></div>
    <div class="kpi" style="background:#eff6ff;border-color:#bfdbfe"><div class="kpi-label">Dep. Acumulada</div><div class="kpi-val" style="color:#2563eb">${fmt(totalDep)}</div></div>
    <div class="kpi" style="background:#f0fdf4;border-color:#bbf7d0"><div class="kpi-label">Valor Atual Total</div><div class="kpi-val" style="color:#059669">${fmt(totalCont)}</div></div>
    <div class="kpi" style="background:#faf5ff;border-color:#e9d5ff"><div class="kpi-label">Total Residual</div><div class="kpi-val" style="color:#7c3aed">${fmt(totalRes)}</div></div>
  </div>
  <div class="section">⚠️ Alertas (${alertas.length})</div>${alertasHtml}
  <div class="section">📋 Detalhamento dos itens</div>
  <table>
    <thead><tr><th>Bem</th><th>Tipo</th><th>C. Custo</th><th>Filial</th><th>Com quem</th><th style="text-align:right">Val. Original</th><th style="text-align:right">Dep. Acum.</th><th style="text-align:right">Residual</th><th style="text-align:right">Dep./Mês</th><th style="text-align:right">% Dep.</th><th style="text-align:right;color:#059669">Val. Atual</th><th style="text-align:center">Status</th></tr></thead>
    <tbody>${linhas}</tbody>
    <tfoot><tr><td colspan="5">TOTAIS</td><td style="text-align:right">${fmt(totalOrig)}</td><td style="text-align:right;color:#2563eb">${fmt(totalDep)}</td><td style="text-align:right;color:#7c3aed">${fmt(totalRes)}</td><td colspan="2"></td><td style="text-align:right;color:#059669">${fmt(totalCont)}</td><td></td></tr></tfoot>
  </table>
  <div class="footer"><span>PatriX — Gestão Patrimonial</span><span>${agora}</span></div>
  </body></html>`);
  win.document.close();
  setTimeout(() => win.print(), 400);
}

// ─────────────────────────────────────────────────────────────
// HELPERS INTERNOS
// ─────────────────────────────────────────────────────────────

/**
 * Retorna lista filtrada considerando os filtros da tabela.
 * @private
 */
function _getItemsFiltrados() {
  let list          = monGetAllItems();
  const tipoFiltro  = (document.getElementById('mon-tabela-tipo')?.value  || '').toLowerCase();
  const setorFiltro = (document.getElementById('mon-tabela-setor')?.value || '');
  const busca       = (document.getElementById('mon-tabela-busca')?.value || '').toLowerCase();

  if (tipoFiltro)  list = list.filter((i) => (i.tipo || '').toLowerCase() === tipoFiltro);
  if (setorFiltro) list = list.filter((i) => (i.centro_custo || '') === setorFiltro);
  if (busca)       list = list.filter((i) =>
    i.desc.toLowerCase().includes(busca) ||
    (i.tipo || '').toLowerCase().includes(busca) ||
    (i.filial || '').toLowerCase().includes(busca) ||
    (i.n_patrimonio || '').toLowerCase().includes(busca)
  );
  return list;
}