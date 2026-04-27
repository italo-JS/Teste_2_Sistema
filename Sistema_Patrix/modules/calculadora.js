/**
 * ============================================================
 * PatrimônioGest — modules/calculadora.js
 * ============================================================
 * Módulo da Calculadora de Depreciação.
 *
 * Responsabilidades:
 *  - Leitura e validação dos campos do formulário
 *  - Cálculo via motor de depreciação (core/depreciacao.js)
 *  - Renderização dos resultados (cards, tabela, gráfico)
 *  - Autocomplete de categorias de bem
 *  - Toggle de valor residual
 *  - Botão "Adicionar ao Inventário" (delega ao módulo inventário)
 * ============================================================
 */

import { fmt, fmtDate, AppState, hoje } from '../core/config.js';
import { calcDepMetodo, gerarSerie }     from '../core/depreciacao.js';
import { chartOpts }                      from '../core/ui.js';

// Referência à instância do gráfico para destruição antes de recriar
let _chartInst = null;

// ─────────────────────────────────────────────────────────────
// VALOR RESIDUAL
// ─────────────────────────────────────────────────────────────

/**
 * Retorna o valor residual considerando a flag usarResidual.
 * Se desabilitado, retorna 0.
 *
 * @returns {number}
 */
export function getResidualValue() {
  return AppState.usarResidual
    ? parseFloat(document.getElementById('residual').value) || 0
    : 0;
}

/**
 * Preenche automaticamente o residual como 20% do valor de aquisição,
 * exceto se o usuário já editou o campo manualmente.
 */
export function autoResidual() {
  if (!AppState.usarResidual) return;
  const resEl = document.getElementById('residual');
  const val   = parseFloat(document.getElementById('valor').value) || 0;
  if (!resEl.dataset.manual) {
    resEl.value = val > 0 ? (val * 0.20).toFixed(2) : '';
  }
}

/**
 * Alterna o uso do valor residual (checkbox personalizado).
 * Atualiza visual do botão e habilita/desabilita o campo.
 */
export function toggleResidual() {
  AppState.usarResidual = !AppState.usarResidual;

  const box    = document.getElementById('res-toggle-box');
  const check  = document.getElementById('res-toggle-check');
  const label  = document.getElementById('res-toggle-label');
  const input  = document.getElementById('residual');
  const hint   = document.getElementById('res-hint');

  box.style.background  = AppState.usarResidual ? 'var(--accent)'  : 'transparent';
  box.style.borderColor = AppState.usarResidual ? 'var(--accent)'  : 'var(--text3)';
  check.style.display   = AppState.usarResidual ? 'block'          : 'none';
  label.textContent     = AppState.usarResidual
    ? 'Sim, considerar valor residual'
    : 'Não, ignorar valor residual';
  label.style.color     = AppState.usarResidual ? 'var(--text)'    : 'var(--text3)';
  input.disabled        = !AppState.usarResidual;
  input.style.opacity   = AppState.usarResidual ? '1'              : '0.35';

  if (!AppState.usarResidual) {
    input.value = '0';
    delete input.dataset.manual;
  }

  hint.textContent = AppState.usarResidual
    ? 'Calculado automaticamente como 20% do valor de aquisição'
    : 'Depreciação calculada sobre 100% do valor original';
  hint.style.color = AppState.usarResidual ? 'var(--text3)' : 'var(--amber)';

  if (AppState.usarResidual) autoResidual();
}

// ─────────────────────────────────────────────────────────────
// STATUS DO ITEM (Acompanhamento vs Perdido)
// ─────────────────────────────────────────────────────────────

/**
 * Atualiza o status visual e interno do item a ser cadastrado.
 *
 * @param {'acompanhamento'|'perdido'} s
 */
export function setStatus(s) {
  AppState.itemStatus = s;

  const isPerdido = s === 'perdido';
  const aEl       = document.getElementById('status-acomp');
  const pEl       = document.getElementById('status-perdido');
  const pDot      = document.getElementById('status-perdido-dot');

  // Estilo do botão Acompanhamento
  aEl.style.border     = `2px solid ${isPerdido ? 'var(--border)' : 'var(--accent)'}`;
  aEl.style.background = isPerdido ? 'transparent' : 'var(--accent-dim)';

  // Estilo do botão Perdido
  pEl.style.border     = `2px solid ${isPerdido ? 'var(--red)' : 'var(--border)'}`;
  pEl.style.background = isPerdido ? 'var(--red-dim)' : 'transparent';

  // Dot interno do botão Perdido
  pDot.style.borderColor                     = isPerdido ? 'var(--red)'  : 'var(--text3)';
  pDot.style.background                      = isPerdido ? 'var(--red)'  : 'transparent';
  pDot.querySelector('div').style.background = isPerdido ? '#fff'        : 'transparent';

  document.getElementById('status-perdido-label').style.color = isPerdido ? 'var(--red)' : 'var(--text2)';

  // Campo de observação só aparece se Perdido
  document.getElementById('status-obs-wrap').style.display = isPerdido ? 'block' : 'none';
}

// ─────────────────────────────────────────────────────────────
// CALCULAR (botão principal)
// ─────────────────────────────────────────────────────────────

/**
 * Lê os campos do formulário, valida, calcula e exibe os resultados.
 * Chamado pelo botão "Calcular Depreciação".
 */
export function calcular() {
  // ── Leitura dos campos ──────────────────────────────────────
  const val    = parseFloat(document.getElementById('valor').value)  || 0;
  const dtStr  = document.getElementById('data').value;
  const vd     = parseFloat(document.getElementById('vida').value)   || 1;
  const taxa   = parseFloat(document.getElementById('taxa').value)   || 0;
  const metodo = document.getElementById('metodo').value;
  const res    = getResidualValue();
  const desc   = document.getElementById('descricao').value || 'Bem';
  const prod   = document.getElementById('produto').value;
  const tipo   = document.getElementById('tipo').value;

  // ── Validação básica ────────────────────────────────────────
  if (!val || !dtStr || !vd) {
    alert('Preencha valor, data e vida útil.');
    return;
  }

  // ── Cálculo ─────────────────────────────────────────────────
  const { depMensal, depAnual, depAcum, valCont, meses } =
    calcDepMetodo({ val, dtStr, vd, res, metodo, taxa });

  const restMeses = Math.max(0, Math.round(vd * 12 - meses));

  // ── Exibição dos cards de resultado ─────────────────────────
  document.getElementById('r-mensal').textContent   = fmt(depMensal);
  document.getElementById('r-anual').textContent    = fmt(depAnual);
  document.getElementById('r-acum').textContent     = fmt(depAcum);
  document.getElementById('r-contabil').textContent = fmt(valCont);
  document.getElementById('r-uso').textContent      = meses + ' meses';
  document.getElementById('r-rest').textContent     = restMeses + ' meses';

  // ── Cabeçalho do resultado ───────────────────────────────────
  document.getElementById('res-titulo').textContent = desc;
  document.getElementById('res-sub').textContent    = fmt(val) + ' — ' + fmtDate(dtStr);

  // Badges de produto e tipo
  const rpEl = document.getElementById('res-pills');
  rpEl.innerHTML = '';
  if (prod) rpEl.innerHTML += `<span class="badge badge-blue">${prod}</span>`;
  if (tipo) rpEl.innerHTML += `<span class="badge badge-green">${tipo}</span>`;

  // ── Série temporal ───────────────────────────────────────────
  const serie = gerarSerie({ val, vd, res, metodo, taxa });
  _renderTabela(serie.rows, val);
  _renderGrafico(serie.labels, serie.data);

  // Exibe o bloco de resultados (estava hidden)
  document.getElementById('results').classList.remove('hidden');
}

// ─────────────────────────────────────────────────────────────
// TABELA DE EVOLUÇÃO
// ─────────────────────────────────────────────────────────────

/**
 * Renderiza a tabela de evolução período a período.
 *
 * @param {Array}  rows - Gerado por gerarSerie()
 * @param {number} val  - Valor original (para % de depreciação)
 */
function _renderTabela(rows, val) {
  const tbody = document.getElementById('tbody');
  tbody.innerHTML = '';

  rows.forEach(({ periodo, valorInicial, depPeriodo, depAcum, novoValor }) => {
    const pct = ((depAcum / val) * 100).toFixed(1);
    const r   = tbody.insertRow();

    r.innerHTML = `
      <td class="td-bold">${periodo}</td>
      <td>${fmt(valorInicial)}</td>
      <td style="color:var(--red)">${fmt(depPeriodo)}</td>
      <td style="color:var(--blue)">${fmt(depAcum)}</td>
      <td style="color:var(--accent)">${fmt(novoValor)}</td>
      <td>
        <div class="mini-bar">
          <div class="mini-track">
            <div class="mini-fill" style="width:${pct}%"></div>
          </div>
          ${pct}%
        </div>
      </td>`;
  });
}

// ─────────────────────────────────────────────────────────────
// GRÁFICO DE EVOLUÇÃO
// ─────────────────────────────────────────────────────────────

/**
 * Renderiza o gráfico de linha com a curva de valor contábil.
 *
 * @param {string[]} labels - Rótulos do eixo X
 * @param {number[]} data   - Valores do eixo Y
 */
function _renderGrafico(labels, data) {
  if (_chartInst) _chartInst.destroy();

  _chartInst = new Chart(document.getElementById('grafico').getContext('2d'), {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label:            'Valor Contábil',
        data,
        borderColor:      '#00d4aa',
        backgroundColor:  'rgba(0,212,170,0.07)',
        fill:             true,
        tension:          0.4,
        pointRadius:      4,
        pointBackgroundColor: '#00d4aa',
        pointBorderColor:     '#0d0f12',
        pointBorderWidth:     2,
      }],
    },
    options: chartOpts(fmt),
  });
}

// ─────────────────────────────────────────────────────────────
// LIMPAR FORMULÁRIO
// ─────────────────────────────────────────────────────────────

/**
 * Reseta todos os campos do formulário da calculadora para os
 * valores padrão, pronto para um novo cadastro.
 */
export function limpar() {
  document.getElementById('categoria').selectedIndex  = 0;
  document.getElementById('metodo').selectedIndex     = 0;

  ['descricao', 'valor', 'vida', 'taxa'].forEach(
    (id) => (document.getElementById(id).value = '')
  );

  document.getElementById('produto').value = '';
  document.getElementById('tipo').value    = '';
  document.getElementById('pill-prod').textContent = '—';
  document.getElementById('pill-tipo').textContent = '—';

  // Restaura valor residual ativo
  if (!AppState.usarResidual) toggleResidual();

  // Restaura status para acompanhamento
  if (AppState.itemStatus !== 'acompanhamento') setStatus('acompanhamento');

  const obsInput = document.getElementById('status-obs');
  if (obsInput) obsInput.value = '';

  document.getElementById('residual').value = '0';
  delete document.getElementById('residual').dataset.manual;
  document.getElementById('data').valueAsDate = hoje;
  document.getElementById('results').classList.add('hidden');

  // Reseta o autocomplete de categoria
  if (window._acReset) window._acReset();
}

// ─────────────────────────────────────────────────────────────
// AUTOCOMPLETE DE CATEGORIAS
// ─────────────────────────────────────────────────────────────

/**
 * Inicializa o componente de autocomplete para o campo de categoria.
 * Lê as opções do <select> original e monta uma lista filtrável.
 *
 * Expõe no window:
 *   acOnFocus(), acOnInput(q), acPick(value), acClear(), acKeyNav(e), _acReset()
 */
export function initAutoComplete() {
  // Constrói lista de itens a partir do <select> existente no HTML
  const allItems = [];
  const sel = document.getElementById('categoria');

  for (const og of sel.querySelectorAll('optgroup')) {
    const group = og.getAttribute('label');
    for (const opt of og.querySelectorAll('option')) {
      if (!opt.value) continue;
      allItems.push({
        value: opt.value,
        label: opt.textContent.trim(),
        group,
        prod:  opt.getAttribute('data-prod')  || '',
        tipo:  opt.getAttribute('data-tipo')  || '',
        vida:  opt.getAttribute('data-vida')  || '',
        taxa:  opt.getAttribute('data-taxa')  || '',
      });
    }
  }

  // Estado interno do autocomplete
  let visibleItems  = [];
  let kbdIdx        = -1;
  let selectedValue = '';

  const inputEl  = document.getElementById('ac-input');
  const dropEl   = document.getElementById('ac-dropdown');
  const listEl   = document.getElementById('ac-list');
  const clearBtn = document.getElementById('ac-clear');
  const wrap     = document.getElementById('ac-wrap');

  // Escape de HTML para evitar XSS
  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  // Destaca o trecho que coincide com a busca
  const hl = (text, q) => {
    if (!q) return esc(text);
    return esc(text).replace(
      new RegExp('(' + q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')', 'gi'),
      '<mark>$1</mark>'
    );
  };

  // Abre e popula a lista de sugestões
  function openList(q) {
    const ql = (q || '').toLowerCase();
    visibleItems = [];
    kbdIdx       = -1;
    const groups = {};

    for (const item of allItems) {
      const match = !ql ||
        item.label.toLowerCase().includes(ql) ||
        item.group.toLowerCase().includes(ql);
      if (!match) continue;
      if (!groups[item.group]) groups[item.group] = [];
      groups[item.group].push(item);
      visibleItems.push(item);
    }

    if (!visibleItems.length) {
      listEl.innerHTML = `<div class="ac-empty">Nenhum resultado para "<strong>${esc(q)}</strong>"</div>`;
    } else {
      let html = '', idx = 0;
      for (const [grp, items] of Object.entries(groups)) {
        html += `<div class="ac-group-label">${esc(grp)}</div>`;
        for (const item of items) {
          const vida = item.vida
            ? (parseFloat(item.vida) < 1 ? Math.round(parseFloat(item.vida) * 12) + 'm' : item.vida + 'a')
            : '';
          html += `<div class="ac-option${item.value === selectedValue ? ' selected' : ''}"
                        onmousedown="acPick('${item.value}')">
                     <span>${hl(item.label, q)}</span>
                     ${vida ? `<span class="ac-opt-meta">${vida}</span>` : ''}
                   </div>`;
          idx++;
        }
      }
      listEl.innerHTML = html;
    }
    dropEl.classList.add('open');
  }

  function closeList() {
    dropEl.classList.remove('open');
    kbdIdx = -1;
  }

  // ── API pública exposta no window para chamadas inline no HTML ──

  window.acOnFocus = () => openList(selectedValue ? '' : inputEl.value);

  window.acOnInput = (q) => {
    selectedValue = '';
    const s = document.getElementById('categoria');
    s.selectedIndex = 0;
    s.dispatchEvent(new Event('change'));
    clearBtn.classList.toggle('show', q.length > 0);
    inputEl.classList.remove('has-value');
    openList(q);
  };

  window.acPick = (value) => {
    const item = allItems.find((i) => i.value === value);
    if (!item) return;
    selectedValue = value;
    inputEl.value = item.label;
    inputEl.classList.add('has-value');
    clearBtn.classList.add('show');
    const s = document.getElementById('categoria');
    s.value = value;
    s.dispatchEvent(new Event('change'));
    closeList();
  };

  window.acClear = () => {
    selectedValue = '';
    inputEl.value = '';
    inputEl.classList.remove('has-value');
    clearBtn.classList.remove('show');
    const s = document.getElementById('categoria');
    s.selectedIndex = 0;
    s.dispatchEvent(new Event('change'));
    closeList();
    inputEl.focus();
  };

  window.acKeyNav = (e) => {
    if (!dropEl.classList.contains('open')) {
      if (e.key === 'ArrowDown') { e.preventDefault(); openList(inputEl.value); }
      return;
    }
    const opts = listEl.querySelectorAll('.ac-option');
    if      (e.key === 'ArrowDown')  { e.preventDefault(); kbdIdx = Math.min(kbdIdx + 1, visibleItems.length - 1); }
    else if (e.key === 'ArrowUp')    { e.preventDefault(); kbdIdx = Math.max(kbdIdx - 1, 0); }
    else if (e.key === 'Enter')      { e.preventDefault(); if (kbdIdx >= 0 && visibleItems[kbdIdx]) window.acPick(visibleItems[kbdIdx].value); return; }
    else if (e.key === 'Escape')     { if (selectedValue) { const it = allItems.find((i) => i.value === selectedValue); if (it) inputEl.value = it.label; } closeList(); return; }
    else return;
    opts.forEach((o, i) => o.classList.toggle('kbd', i === kbdIdx));
    if (opts[kbdIdx]) opts[kbdIdx].scrollIntoView({ block: 'nearest' });
  };

  window._acReset = () => {
    selectedValue = '';
    inputEl.value = '';
    inputEl.classList.remove('has-value');
    clearBtn.classList.remove('show');
    closeList();
  };

  // Fecha lista ao clicar fora do componente
  document.addEventListener('mousedown', (e) => {
    if (!wrap.contains(e.target)) {
      if (selectedValue) {
        const it = allItems.find((i) => i.value === selectedValue);
        if (it) inputEl.value = it.label;
      }
      closeList();
    }
  });
}

// ─────────────────────────────────────────────────────────────
// LISTENER DE CATEGORIA (preenche campos ao selecionar)
// ─────────────────────────────────────────────────────────────

/**
 * Registra o listener no <select> de categoria para preencher
 * automaticamente produto, tipo, vida útil e taxa ao selecionar
 * um item predefinido.
 *
 * Chamado uma vez no init da aplicação.
 */
export function initCategoriaListener() {
  document.getElementById('categoria').addEventListener('change', function () {
    const opt  = this.options[this.selectedIndex];
    const prod = opt.getAttribute('data-prod') || '';
    const tipo = opt.getAttribute('data-tipo') || '';
    const vida = opt.getAttribute('data-vida') || '';
    const taxa = opt.getAttribute('data-taxa') || '';

    const prodEl = document.getElementById('produto');
    const tipoEl = document.getElementById('tipo');

    prodEl.value    = prod;
    tipoEl.value    = tipo;
    prodEl.readOnly = prod !== '';
    tipoEl.readOnly = tipo !== '';

    document.getElementById('pill-prod').textContent = prod || '—';
    document.getElementById('pill-tipo').textContent = tipo || '—';

    if (vida) document.getElementById('vida').value = vida;
    if (taxa) document.getElementById('taxa').value = taxa;
  });
}