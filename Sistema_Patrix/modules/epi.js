/**
 * ============================================================
 * PatrimônioGest — modules/epi.js
 * ============================================================
 * Módulo de EPI / Fardamento.
 *
 * Gerencia os itens da tabela `fardamentos_epi`:
 *  - KPIs (total, em acompanhamento, alertas, perdidos, quebrados)
 *  - Cinco gráficos: status, top valor, entregas mensais, colaborador, vencimento
 *  - Tabela com filtros e blocos expansíveis
 *  - Modal de novo item
 *  - Relatório em overlay e impressão em nova janela
 * ============================================================
 */

import { fmt, AppState, MESES_PT }        from '../core/config.js';
import { carregarEPI as dbCarregarEPI, salvarItemEPI } from '../core/database.js';
import { showToast }                        from '../core/ui.js';

// Instâncias Chart.js
let _epiChartStatus     = null;
let _epiChartTopValor   = null;
let _epiChartMensal     = null;
let _epiChartColab      = null;
let _epiChartVencimento = null;

// ─────────────────────────────────────────────────────────────
// INICIALIZAÇÃO
// ─────────────────────────────────────────────────────────────

/**
 * Carrega os dados do banco e renderiza a página EPI completa.
 * Exposto globalmente como window.carregarEPI.
 */
export async function carregarEPI() {
  const ok = await dbCarregarEPI();
  if (!ok) { showToast('❌ Falha ao carregar EPI/Fardamento.', 'error'); return; }

  epiRenderStats();
  epiRenderGraficos();
  epiPopularFiltros();
  epiRenderTabela();

  showToast(`✅ EPI/Fardamento: ${AppState.invEPI.length} itens carregados!`, 'success');
}

// ─────────────────────────────────────────────────────────────
// KPIs
// ─────────────────────────────────────────────────────────────

/**
 * Atualiza os cards de KPI da página EPI.
 */
export function epiRenderStats() {
  const total     = AppState.invEPI.length;
  const perdidos  = AppState.invEPI.filter((i) => (i.situacao || '').toLowerCase().includes('perdid')).length;
  const quebrados = AppState.invEPI.filter((i) => (i.situacao || '').toLowerCase().includes('quebrad')).length;
  const alertas   = AppState.invEPI.filter((i) => i.dias_restantes > 0 && i.dias_restantes <= 30).length;
  const acomp     = total - perdidos - quebrados;
  const valorTotal = AppState.invEPI.reduce((s, i) => s + i.total_nota, 0);

  const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
  set('epi-total',     total);
  set('epi-acomp',     acomp);
  set('epi-alertas',   alertas);
  set('epi-perdidos',  perdidos);
  set('epi-quebrados', quebrados);
  set('epi-valor',     fmt(valorTotal));
  set('epi-count-badge', total + ' itens');

  const nb = document.getElementById('nb-epi');
  if (nb) { nb.textContent = alertas; nb.classList.toggle('show', alertas > 0); }
}

// ─────────────────────────────────────────────────────────────
// GRÁFICOS
// ─────────────────────────────────────────────────────────────

/**
 * Renderiza os cinco gráficos da página EPI.
 *
 * @param {Array} [items] - Lista filtrada (padrão: todos os invEPI)
 */
export function epiRenderGraficos(items) {
  items = items || AppState.invEPI;

  // Cores de situação
  const situCores = {
    'em_uso':    '#639922', 'Em uso':    '#639922',
    'estoque':   '#4e9eff', 'Em estoque':'#4e9eff',
    'vencendo':  '#f5a623', 'Vencendo':  '#f5a623',
    'perdido':   '#ff5c5c', 'Perdido':   '#ff5c5c',
    'quebrado':  '#ff5c5c', 'Quebrado':  '#ff5c5c',
  };

  // ── 1. Donut: por situação ───────────────────────────────────
  const situMap = {};
  items.forEach((i) => { const s = i.situacao || 'Sem status'; situMap[s] = (situMap[s] || 0) + 1; });
  const situLabels = Object.keys(situMap);

  if (_epiChartStatus) _epiChartStatus.destroy();
  const ctx1 = document.getElementById('epi-chart-status')?.getContext('2d');
  if (ctx1) {
    _epiChartStatus = new Chart(ctx1, {
      type: 'doughnut',
      data: {
        labels:   situLabels,
        datasets: [{ data: situLabels.map((k) => situMap[k]), backgroundColor: situLabels.map((k) => situCores[k] || '#8b9099'), borderColor: '#13161b', borderWidth: 3 }],
      },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { labels: { color: '#8b9099', font: { size: 11 } } }, tooltip: { backgroundColor: '#1a1e25' } } },
    });
  }

  // ── 2. Barras horizontais: Top 6 por valor ───────────────────
  const prodMap = {};
  items.forEach((i) => { const k = i.produto || i.descricao || 'Sem nome'; prodMap[k] = (prodMap[k] || 0) + i.total_nota; });
  const top6 = Object.entries(prodMap).sort((a, b) => b[1] - a[1]).slice(0, 6);

  if (_epiChartTopValor) _epiChartTopValor.destroy();
  const ctx2 = document.getElementById('epi-chart-top-valor')?.getContext('2d');
  if (ctx2) {
    _epiChartTopValor = new Chart(ctx2, {
      type: 'bar',
      data: {
        labels:   top6.map((e) => e[0].length > 20 ? e[0].slice(0, 20) + '…' : e[0]),
        datasets: [{ label: 'Valor (R$)', data: top6.map((e) => parseFloat(e[1].toFixed(2))), backgroundColor: 'rgba(0,212,170,.18)', borderColor: 'rgba(0,212,170,.7)', borderWidth: 1, borderRadius: 6 }],
      },
      options: {
        indexAxis: 'y', responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false }, tooltip: { backgroundColor: '#1a1e25', callbacks: { label: (c) => ' ' + fmt(c.parsed.x) } } },
        scales: {
          x: { ticks: { color: '#555b65', font: { size: 9, family: 'DM Mono' }, callback: (v) => fmt(v) }, grid: { color: 'rgba(255,255,255,.04)' }, border: { color: 'transparent' } },
          y: { ticks: { color: '#8b9099', font: { size: 10 } }, grid: { display: false } },
        },
      },
    });
  }

  // ── 3. Barras: entregas por mês ──────────────────────────────
  const mesMap = {};
  items.forEach((i) => {
    if (!i.data_criacao) return;
    const d = new Date(i.data_criacao);
    if (isNaN(d)) return;
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    mesMap[key] = (mesMap[key] || 0) + 1;
  });
  const mesKeys   = Object.keys(mesMap).sort();
  const mesLabels = mesKeys.map((k) => { const [a, m] = k.split('-'); return MESES_PT[parseInt(m) - 1].slice(0, 3) + '/' + a.slice(2); });

  if (_epiChartMensal) _epiChartMensal.destroy();
  const ctx3 = document.getElementById('epi-chart-entregas')?.getContext('2d');
  if (ctx3) {
    _epiChartMensal = new Chart(ctx3, {
      type: 'bar',
      data: {
        labels:   mesLabels.length ? mesLabels : ['Sem dados'],
        datasets: [{
          label: 'Entregas', data: mesKeys.length ? mesKeys.map((k) => mesMap[k]) : [0],
          backgroundColor: 'rgba(0,212,170,.8)', borderColor: '#00ffd5', borderWidth: 2, borderRadius: 5,
        }],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false }, tooltip: { backgroundColor: '#1a1e25' } },
        scales: {
          y: { ticks: { color: '#555b65', font: { size: 9 } }, grid: { color: 'rgba(255,255,255,0.04)' }, border: { color: 'transparent' } },
          x: { ticks: { color: '#555b65', font: { size: 9 } }, grid: { color: 'rgba(255,255,255,0.04)' } },
        },
        onClick: (evt, elements) => {
          if (!elements.length) return;
          epiFiltrarPorMes(mesKeys[elements[0].index], mesLabels[elements[0].index]);
        },
      },
    });
  }

  // ── 4. Barras horizontais: Top 10 colaboradores ──────────────
  const colabMap = {};
  items.forEach((i) => { const n = i.nome_colaborador || 'Sem nome'; colabMap[n] = (colabMap[n] || 0) + i.total_nota; });
  const top10 = Object.entries(colabMap).sort((a, b) => b[1] - a[1]).slice(0, 10);

  if (_epiChartColab) _epiChartColab.destroy();
  const ctx4 = document.getElementById('epi-chart-colaborador')?.getContext('2d');
  if (ctx4) {
    _epiChartColab = new Chart(ctx4, {
      type: 'bar',
      data: {
        labels:   top10.map((e) => e[0].length > 20 ? e[0].slice(0, 20) + '…' : e[0]),
        datasets: [{ label: 'Valor total', data: top10.map((e) => parseFloat(e[1].toFixed(2))), backgroundColor: 'rgba(167,139,250,0.55)', borderColor: '#a78bfa', borderWidth: 1, borderRadius: 4 }],
      },
      options: {
        indexAxis: 'y', responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false }, tooltip: { backgroundColor: '#1a1e25', callbacks: { label: (c) => ' ' + fmt(c.parsed.x) } } },
        scales: {
          x: { ticks: { color: '#555b65', callback: (v) => fmt(v), font: { size: 9, family: 'DM Mono' } }, grid: { color: 'rgba(255,255,255,0.04)' }, border: { color: 'transparent' } },
          y: { ticks: { color: '#555b65', font: { size: 9 } }, grid: { color: 'rgba(255,255,255,0.04)' } },
        },
      },
    });
  }

  // ── 5. Donut: A vencer / Vencido / Sem vencimento ────────────
  const hoje2  = new Date();
  const vencMap = { 'A vencer': 0, 'Vencido': 0, 'Sem vencimento': 0 };
  items.forEach((i) => {
    if (!i.data_troca) { vencMap['Sem vencimento']++; return; }
    const d = new Date(i.data_troca);
    if (isNaN(d)) { vencMap['Sem vencimento']++; return; }
    d < hoje2 ? vencMap['Vencido']++ : vencMap['A vencer']++;
  });

  if (_epiChartVencimento) _epiChartVencimento.destroy();
  const ctx5 = document.getElementById('epi-chart-vencimento')?.getContext('2d');
  if (ctx5) {
    _epiChartVencimento = new Chart(ctx5, {
      type: 'doughnut',
      data: { labels: Object.keys(vencMap), datasets: [{ data: Object.values(vencMap), backgroundColor: ['#f5a623', '#ff5c5c', '#444c58'], borderColor: '#13161b', borderWidth: 3 }] },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { labels: { color: '#8b9099', font: { size: 11 } } }, tooltip: { backgroundColor: '#1a1e25' } } },
    });
  }
}

// ─────────────────────────────────────────────────────────────
// FILTROS
// ─────────────────────────────────────────────────────────────

/**
 * Popula os dropdowns de filtro com os valores únicos do invEPI.
 */
export function epiPopularFiltros() {
  const populaSelect = (id, items, getter) => {
    const sel = document.getElementById(id);
    if (!sel) return;
    const vals  = [...new Set(AppState.invEPI.map(getter).filter(Boolean))].sort();
    const atual = sel.value;
    sel.innerHTML = `<option value="">${items}</option>`
      + vals.map((v) => `<option value="${v}"${v === atual ? ' selected' : ''}>${v}</option>`).join('');
  };

  populaSelect('epi-f-setor',    'Todos os setores',    (i) => i.equipe);
  populaSelect('epi-f-tipo',     'Todos os tipos',      (i) => i.grupo_produto);
  populaSelect('epi-f-operacao', 'Todas as operações',  (i) => i.operacao_financeira);
  populaSelect('epi-f-frete',    'Todos os fretes',     (i) => i.tipo_frete);
}

// ─────────────────────────────────────────────────────────────
// TABELA
// ─────────────────────────────────────────────────────────────

/**
 * Renderiza a tabela de EPI com os filtros ativos aplicados.
 * Exibe até 100 itens por vez e atualiza os gráficos com o subset filtrado.
 */
export function epiRenderTabela() {
  const filtrados = epiGetItensFiltrados();
  epiRenderGraficos(filtrados);

  const tbody = document.getElementById('epi-tbody');
  if (!tbody) return;

  const fmtDt = (s) => { if (!s) return '—'; const d = new Date(s); return isNaN(d) ? s : d.toLocaleDateString('pt-BR'); };

  if (!filtrados.length) {
    tbody.innerHTML = `<tr><td colspan="9" style="text-align:center;padding:32px;color:var(--text3)">Nenhum item encontrado</td></tr>`;
  } else {
    tbody.innerHTML = filtrados.slice(0, 100).map((item, idx) => {
      const isAlerta  = item.dias_restantes > 0 && item.dias_restantes <= 30;
      const col       = item.grupo_produto === 'FARDAMENTO' ? '#f472b6' : '#fb923c';
      const detalheId = `epi-det-${idx}`;

      return `
        <tr>
          <td style="padding:6px 10px" colspan="9">
            <div style="display:flex;align-items:center;gap:8px">
              <button id="btn-epi-${idx}" onclick="epiVerDetalhe(${idx})"
                style="width:20px;height:20px;border-radius:50%;border:1px solid var(--border);background:var(--bg3);color:var(--text2);cursor:pointer;font-size:12px;display:flex;align-items:center;justify-content:center;flex-shrink:0;transition:all .15s">+</button>
              <span style="width:8px;height:8px;border-radius:50%;background:${col};flex-shrink:0;display:inline-block"></span>
              <span style="font-size:12px;font-weight:500;color:var(--text);flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${item.produto || item.descricao || '—'}</span>
              <span class="pill pill-tipo" style="font-size:10px;flex-shrink:0">${item.grupo_produto || '—'}</span>
              <span style="font-size:11px;color:var(--text2);flex-shrink:0">${item.nome_colaborador || '—'}</span>
              <span style="font-size:11px;color:var(--text3);flex-shrink:0">${item.equipe || '—'}</span>
              <span style="font-size:11px;color:var(--amber);font-family:'DM Mono',monospace;flex-shrink:0">${fmt(item.total_nota)}</span>
              <span class="badge" style="font-size:10px;flex-shrink:0">${item.situacao || 'Ativo'}</span>
              ${isAlerta ? `<span style="font-size:9px;padding:2px 7px;border-radius:10px;background:var(--amber-dim);color:var(--amber);flex-shrink:0">${item.dias_restantes}d</span>` : ''}
            </div>
            <!-- Bloco expansível de detalhe -->
            <div id="${detalheId}" style="display:none;margin-top:6px;margin-left:28px;padding:10px 12px;background:var(--bg3);border:1px solid var(--border);border-radius:8px">
              <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:8px">
                <div><div style="font-size:9px;color:var(--text3);margin-bottom:2px">COLABORADOR</div><div style="font-size:11px;font-weight:500;color:var(--text)">${item.nome_colaborador || '—'}</div></div>
                <div><div style="font-size:9px;color:var(--text3);margin-bottom:2px">EQUIPE</div><div style="font-size:11px;font-weight:500;color:var(--text)">${item.equipe || '—'}</div></div>
                <div><div style="font-size:9px;color:var(--text3);margin-bottom:2px">DATA CRIAÇÃO</div><div style="font-size:11px;font-weight:500;color:var(--text)">${fmtDt(item.data_criacao)}</div></div>
                <div><div style="font-size:9px;color:var(--text3);margin-bottom:2px">DATA TROCA</div><div style="font-size:11px;font-weight:500;color:${isAlerta ? 'var(--amber)' : 'var(--text)'}">${fmtDt(item.data_troca)}</div></div>
              </div>
              <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:8px">
                <div><div style="font-size:9px;color:var(--text3);margin-bottom:2px">TOTAL NOTA</div><div style="font-size:11px;font-weight:600;color:var(--amber)">${fmt(item.total_nota)}</div></div>
                <div><div style="font-size:9px;color:var(--text3);margin-bottom:2px">DEPRECIAÇÃO</div><div style="font-size:11px;font-weight:500;color:var(--blue)">${fmt(item.depreciacao)}</div></div>
                <div><div style="font-size:9px;color:var(--text3);margin-bottom:2px">V. RESIDUAL</div><div style="font-size:11px;font-weight:500;color:var(--purple)">${fmt(item.v_residual)}</div></div>
                <div><div style="font-size:9px;color:var(--text3);margin-bottom:2px">DIAS RESTANTES</div><div style="font-size:11px;font-weight:600;color:${isAlerta ? 'var(--red)' : 'var(--accent)'}">${item.dias_restantes}d</div></div>
              </div>
              ${item.observacao ? `<div style="font-size:10px;color:var(--text3);padding:6px 8px;background:var(--bg4);border-radius:6px">📝 ${item.observacao}</div>` : ''}
            </div>
          </td>
        </tr>`;
    }).join('');
  }

  const totalVal = filtrados.reduce((s, i) => s + i.total_nota, 0);
  document.getElementById('epi-valor-total').textContent = fmt(totalVal);
  const badge = document.getElementById('epi-count-badge');
  if (badge) badge.textContent = `${filtrados.length} itens`;
}

/**
 * Expande ou colapsa o bloco de detalhe de um item EPI.
 *
 * @param {number} idx - Índice do item na lista renderizada
 */
export function epiVerDetalhe(idx) {
  const el  = document.getElementById(`epi-det-${idx}`);
  const btn = document.getElementById(`btn-epi-${idx}`);
  if (!el || !btn) return;
  const aberto = el.style.display === 'block';
  el.style.display     = aberto ? 'none'             : 'block';
  btn.textContent      = aberto ? '+'                : '−';
  btn.style.background = aberto ? 'var(--bg3)'       : 'var(--accent-dim)';
  btn.style.color      = aberto ? 'var(--text2)'     : 'var(--accent)';
  btn.style.borderColor = aberto ? 'var(--border)'   : 'var(--accent)';
}

/**
 * Filtra a tabela EPI por mês específico (chamado ao clicar na barra do gráfico).
 *
 * @param {string} mesKey   - Chave 'AAAA-MM'
 * @param {string} mesLabel - Label legível para exibição
 */
export function epiFiltrarPorMes(mesKey, mesLabel) {
  const [ano, mes] = mesKey.split('-').map(Number);
  // Usa o campo de período como referência para o filtro
  const filtro = document.getElementById('epi-f-periodo');
  if (filtro) {
    // Aplica filtragem diretamente no array
    AppState._epiMesFiltro = { ano, mes };
  }
  epiRenderTabela();
}

/**
 * Limpa todos os filtros da página EPI e rerenderiza.
 */
export function epiLimparFiltros() {
  ['epi-busca', 'epi-f-tipo', 'epi-f-status', 'epi-f-setor', 'epi-f-periodo', 'epi-f-operacao', 'epi-f-frete']
    .forEach((id) => { const el = document.getElementById(id); if (el) el.value = ''; });
  AppState._epiMesFiltro = null;
  epiRenderTabela();
}

/**
 * Retorna os itens do invEPI filtrados conforme os controles da página.
 *
 * @returns {Array}
 */
export function epiGetItensFiltrados() {
  const busca     = (document.getElementById('epi-busca')?.value      || '').toLowerCase();
  const fTipo     = document.getElementById('epi-f-tipo')?.value      || '';
  const fStatus   = document.getElementById('epi-f-status')?.value    || '';
  const fSetor    = document.getElementById('epi-f-setor')?.value     || '';
  const fOperacao = document.getElementById('epi-f-operacao')?.value  || '';
  const fFrete    = document.getElementById('epi-f-frete')?.value     || '';
  const fPer      = document.getElementById('epi-f-periodo')?.value   || '';
  const hojeData  = new Date();

  return AppState.invEPI.filter((i) => {
    if (busca && !i.produto.toLowerCase().includes(busca)      &&
                 !(i.nome_colaborador || '').toLowerCase().includes(busca) &&
                 !(i.descricao        || '').toLowerCase().includes(busca) &&
                 !(i.equipe           || '').toLowerCase().includes(busca) &&
                 !(i.grupo_produto    || '').toLowerCase().includes(busca)) return false;
    if (fTipo     && (i.grupo_produto        || '') !== fTipo)     return false;
    if (fStatus   && (i.situacao             || '').toLowerCase() !== fStatus.toLowerCase()) return false;
    if (fSetor    && i.equipe !== fSetor)                          return false;
    if (fOperacao && i.operacao_financeira !== fOperacao)          return false;
    if (fFrete    && i.tipo_frete !== fFrete)                      return false;
    if (fPer) {
      const d = new Date(i.data_criacao);
      if (isNaN(d)) return false;
      if (fPer === 'mes'       && (d.getMonth() !== hojeData.getMonth() || d.getFullYear() !== hojeData.getFullYear())) return false;
      if (fPer === 'trimestre' && (hojeData - d) > 90 * 864e5) return false;
      if (fPer === 'ano'       && d.getFullYear() !== hojeData.getFullYear()) return false;
    }
    return true;
  });
}

// ─────────────────────────────────────────────────────────────
// MODAL NOVO ITEM
// ─────────────────────────────────────────────────────────────

export const epiAbrirNovoItem = () => document.getElementById('epi-modal-novo')?.classList.add('open');
export const epiFecharModal   = () => document.getElementById('epi-modal-novo')?.classList.remove('open');

/**
 * Lê o formulário do modal e insere o novo item no banco.
 */
export async function epiSalvarNovoItem() {
  const nome   = document.getElementById('epi-novo-nome').value.trim();
  const tipo   = document.getElementById('epi-novo-tipo').value;
  const colab  = document.getElementById('epi-novo-colaborador').value.trim();
  const setor  = document.getElementById('epi-novo-setor').value.trim();
  const dtEntr = document.getElementById('epi-novo-data-entrega').value;
  const dtVenc = document.getElementById('epi-novo-vencimento').value;
  const valor  = parseFloat(document.getElementById('epi-novo-valor').value) || 0;
  const codigo = document.getElementById('epi-novo-codigo').value.trim();
  const status = document.getElementById('epi-novo-status').value;
  const obs    = document.getElementById('epi-novo-obs').value.trim();

  if (!nome || !tipo) { showToast('⚠️ Preencha nome e tipo.', 'warning'); return; }

  const ok = await salvarItemEPI({ nome, tipo, colab, setor, dtEntrega: dtEntr, dtVenc, valor, codigo, status, obs });
  if (!ok) { showToast('❌ Erro ao salvar.', 'error'); return; }

  showToast('✅ Item salvo!', 'success');
  epiFecharModal();
  await carregarEPI();
}

// ─────────────────────────────────────────────────────────────
// RELATÓRIO EPI
// ─────────────────────────────────────────────────────────────

export function epiGerarRelatorio() {
  const items = epiGetItensFiltrados();
  if (!items.length) { showToast('Nenhum item para gerar relatório.', 'warning'); return; }

  const totalVal = items.reduce((s, i) => s + i.total_nota, 0);
  const totalDep = items.reduce((s, i) => s + i.depreciacao, 0);
  const alertas  = items.filter((i) => i.dias_restantes > 0 && i.dias_restantes <= 30).length;

  document.getElementById('epi-rel-sub').textContent =
    `${items.length} item${items.length !== 1 ? 's' : ''} · gerado em ${new Date().toLocaleString('pt-BR')}`;

  document.getElementById('epi-rel-resumo').innerHTML = `
    <div class="res-card"><div class="res-label">Total de itens</div><div class="res-value">${items.length}</div></div>
    <div class="res-card"><div class="res-label">Valor total</div><div class="res-value" style="color:var(--amber);font-size:14px">${fmt(totalVal)}</div></div>
    <div class="res-card"><div class="res-label">Depreciação</div><div class="res-value" style="color:var(--blue);font-size:14px">${fmt(totalDep)}</div></div>
    <div class="res-card"><div class="res-label">Alertas</div><div class="res-value" style="color:var(--amber)">${alertas}</div></div>`;

  const fmtDt   = (s) => { if (!s) return '—'; const d = new Date(s); return isNaN(d) ? s : d.toLocaleDateString('pt-BR'); };
  const porEquipe = {};
  items.forEach((i) => { const e = i.equipe || 'Sem equipe'; if (!porEquipe[e]) porEquipe[e] = []; porEquipe[e].push(i); });

  document.getElementById('epi-rel-corpo').innerHTML = Object.entries(porEquipe).map(([equipe, eitens]) => `
    <div style="margin-bottom:18px">
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px">
        <span style="font-size:11px;font-weight:600;color:var(--accent);text-transform:uppercase">${equipe}</span>
        <div style="flex:1;height:1px;background:var(--border)"></div>
        <span style="font-size:11px;color:var(--text3)">${eitens.length} item(s)</span>
      </div>
      <div style="background:var(--bg3);border:1px solid var(--border);border-radius:var(--r);overflow:hidden">
        ${eitens.map((item, idx) => `
          <div style="display:flex;align-items:center;gap:10px;padding:9px 14px;${idx < eitens.length - 1 ? 'border-bottom:1px solid var(--border)' : ''}">
            <span style="flex:1;font-size:12px;font-weight:500;color:var(--text)">${item.produto || item.descricao || '—'}</span>
            <span style="font-size:10px;color:var(--text3)">${item.nome_colaborador || '—'}</span>
            <span style="font-size:10px;color:var(--text3)">${fmtDt(item.data_criacao)}</span>
            <span style="font-size:10px;font-family:'DM Mono',monospace;color:var(--amber)">${fmt(item.total_nota)}</span>
            ${item.dias_restantes > 0 && item.dias_restantes <= 30 ? `<span style="font-size:9px;padding:2px 7px;border-radius:10px;background:var(--amber-dim);color:var(--amber)">${item.dias_restantes}d</span>` : ''}
          </div>`).join('')}
      </div>
    </div>`).join('');

  document.getElementById('epi-modal-relatorio')?.classList.add('open');
}

export const epiFecharRelatorio = () => document.getElementById('epi-modal-relatorio')?.classList.remove('open');

/**
 * Imprime o relatório de EPI em nova janela.
 */
export function epiImprimirRelatorio() {
  const items = epiGetItensFiltrados();
  if (!items.length) return;
  const agora = new Date().toLocaleString('pt-BR');
  const fmtDt = (s) => { if (!s) return '—'; const d = new Date(s); return isNaN(d) ? s : d.toLocaleDateString('pt-BR'); };

  const linhas = items.map((item) => `
    <tr>
      <td style="padding:6px 10px;font-weight:500">${item.produto || item.descricao || '—'}</td>
      <td style="padding:6px 10px;color:#6b7280">${item.grupo_produto || '—'}</td>
      <td style="padding:6px 10px;color:#6b7280">${item.nome_colaborador || '—'}</td>
      <td style="padding:6px 10px;color:#6b7280">${item.equipe || '—'}</td>
      <td style="padding:6px 10px">${fmtDt(item.data_criacao)}</td>
      <td style="padding:6px 10px">${fmtDt(item.data_troca)}</td>
      <td style="padding:6px 10px;text-align:right;color:#d97706">${fmt(item.total_nota)}</td>
      <td style="padding:6px 10px;text-align:right;color:#2563eb">${fmt(item.depreciacao)}</td>
      <td style="padding:6px 10px;text-align:center;color:${item.dias_restantes <= 30 ? '#dc2626' : '#16a34a'}">${item.dias_restantes}d</td>
      <td style="padding:6px 10px;font-style:italic;color:#6b7280">${item.situacao || '—'}</td>
    </tr>`).join('');

  const win = window.open('', '_blank');
  win.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Relatório EPI/Fardamento</title>
  <style>body{font-family:Arial,sans-serif;color:#111;padding:28px;font-size:12px}h1{font-size:20px;font-weight:700;margin-bottom:4px}.sub{color:#6b7280;font-size:11px;margin-bottom:20px}table{width:100%;border-collapse:collapse}thead tr{background:#f9fafb}th{padding:8px 10px;text-align:left;border-bottom:2px solid #e5e7eb;font-size:10px;text-transform:uppercase;color:#6b7280}tbody tr:nth-child(even){background:#f9fafb}td{border-bottom:1px solid #f3f4f6}.footer{margin-top:20px;font-size:10px;color:#9ca3af;display:flex;justify-content:space-between;padding-top:10px;border-top:1px solid #e5e7eb}</style>
  </head><body>
  <h1>Relatório EPI / Fardamento</h1>
  <div class="sub">Gerado em ${agora} · ${items.length} itens</div>
  <table>
    <thead><tr><th>Descrição</th><th>Grupo</th><th>Colaborador</th><th>Equipe</th><th>Criação</th><th>Troca</th><th style="text-align:right">Total Nota</th><th style="text-align:right">Depreciação</th><th style="text-align:center">Dias Rest.</th><th>Situação</th></tr></thead>
    <tbody>${linhas}</tbody>
  </table>
  <div class="footer"><span>PatriX — Gestão Patrimonial</span><span>${agora}</span></div>
  </body></html>`);
  win.document.close();
  setTimeout(() => win.print(), 400);
}