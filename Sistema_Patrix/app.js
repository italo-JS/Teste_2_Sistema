/**
 * ═══════════════════════════════════════════════════════════════
 * app.js  —  PatriX v2.4
 * Entry point principal da aplicação
 * ═══════════════════════════════════════════════════════════════
 */

// ── CORE ──────────────────────────────────────────────────────
import { AppState, hoje, supabase }   from './core/config.js';
import { calcDep }                     from './core/depreciacao.js';
import {
  carregarInventario,
  salvarItemInventario,
  removerItemInventario,
  atualizarStatusItem,
  carregarPatrimonioGeral,
  iniciarRealtimeSync,
  saveHistLocal,
  loadHistLocal,
} from './core/database.js';
import {
  showToast,
  setSyncStatus,
  toggleSidebar,
  initSidebar,
  goPage,
  updateBadges,
} from './core/ui.js';

// ── MÓDULOS ────────────────────────────────────────────────────
import {
  calcular,
  limpar,
  getResidualValue,
  autoResidual,
  toggleResidual,
  setStatus,
  initAutoComplete as initCalcAutoComplete,
  initCategoriaListener,
} from './modules/calculadora.js';

import {
  renderInvTable,
  adicionar,
  remover,
  toggleStatusItem,
  imprimirRelatorio,
} from './modules/inventario.js';

import {
  renderDashboard,
  renderDashAcomp,
  initDashAutoComplete,
} from './modules/dashboard.js';

import {
  renderDepPage,
  renderDepAlerts,
} from './modules/depreciacao.js';

import { renderMensalPage }  from './modules/mensal.js';
import { renderHistPage }    from './modules/historico.js';

import {
  renderMonitoramento,
  monConectarBD,
  monGerarRelatorio,
  monFecharRelatorio,
  monImprimirRelatorio,
  monCarregarMais,
  monToggleDetalhe,
  monRenderTable,
} from './modules/monitoramento.js';

import {
  carregarEPI,
  epiRenderTabela,
  epiVerDetalhe,
  epiLimparFiltros,
  epiAbrirNovoItem,
  epiFecharModal,
  epiSalvarNovoItem,
  epiGerarRelatorio,
  epiFecharRelatorio,
  epiImprimirRelatorio,
  epiFiltrarPorMes,
} from './modules/epi.js';

import {
  carregarConfiguracoes,
  salvarConfiguracoes,
  salvarConfigBD,
  resetarConfiguracoes,
  testarConexao,
  limparHistoricoLocal,
  limparTudoLocal,
  toggleBDCard,
} from './modules/configuracoes.js';

// ════════════════════════════════════════════════════════════════
// EXPOSIÇÃO GLOBAL
// ════════════════════════════════════════════════════════════════

// Navegação e UI global
window.goPage          = (id, el) => goPage(id, el, _pageRenders);
window.toggleSidebar   = toggleSidebar;
window.sincronizar     = sincronizar;
window.showToast       = showToast;

// Calculadora
window.calcular        = calcular;
window.limpar          = limpar;
window.autoResidual    = autoResidual;
window.toggleResidual  = toggleResidual;
window.setStatus       = setStatus;

// Inventário
window.adicionar         = adicionar;
window.remover           = remover;
window.toggleStatusItem  = toggleStatusItem;
window.imprimirRelatorio = imprimirRelatorio;
window.renderInvTable    = renderInvTable;

// Dashboard
window.renderDashboard    = renderDashboard;
window.renderDashAcomp    = renderDashAcomp;
window.initDashAutoComplete = initDashAutoComplete;

// Depreciação
window.renderDepPage   = renderDepPage;

// Mensal
window.renderMensalPage = renderMensalPage;

// Histórico
window.renderHistPage  = renderHistPage;

// Monitoramento
window.renderMonitoramento  = renderMonitoramento;
window.monConectarBD        = monConectarBD;
window.monGerarRelatorio    = monGerarRelatorio;
window.monFecharRelatorio   = monFecharRelatorio;
window.monImprimirRelatorio = monImprimirRelatorio;
window.monCarregarMais      = monCarregarMais;
window.monToggleDetalhe     = monToggleDetalhe;
window.monRenderTable       = monRenderTable;

// EPI / Fardamento
window.carregarEPI          = carregarEPI;
window.epiRenderTabela      = epiRenderTabela;
window.epiVerDetalhe        = epiVerDetalhe;
window.epiLimparFiltros     = epiLimparFiltros;
window.epiAbrirNovoItem     = epiAbrirNovoItem;
window.epiFecharModal       = epiFecharModal;
window.epiSalvarNovoItem    = epiSalvarNovoItem;
window.epiGerarRelatorio    = epiGerarRelatorio;
window.epiFecharRelatorio   = epiFecharRelatorio;
window.epiImprimirRelatorio = epiImprimirRelatorio;
window.epiFiltrarPorMes     = epiFiltrarPorMes;

// Configurações
window.carregarConfiguracoes  = carregarConfiguracoes;
window.salvarConfiguracoes    = salvarConfiguracoes;
window.salvarConfigBD         = salvarConfigBD;
window.resetarConfiguracoes   = resetarConfiguracoes;
window.testarConexao          = testarConexao;
window.limparHistoricoLocal   = limparHistoricoLocal;
window.limparTudoLocal        = limparTudoLocal;
window.toggleBDCard           = toggleBDCard;

// ════════════════════════════════════════════════════════════════
// MAPA DE RENDERS POR PÁGINA
// ════════════════════════════════════════════════════════════════
const _pageRenders = {
  dashboard:     renderDashboard,
  inventario:    renderInvTable,
  depreciacao:   renderDepPage,
  mensal:        renderMensalPage,
  historico:     renderHistPage,
  monitoramento: renderMonitoramento,
  epi:           carregarEPI,
};

// ════════════════════════════════════════════════════════════════
// sincronizar
// ════════════════════════════════════════════════════════════════
async function sincronizar() {
  setSyncStatus('loading', 'Sincronizando...');

  const ok = await carregarInventario();

  if (ok) {
    updateBadges();
    renderDashboard();
    renderInvTable();
    setSyncStatus('ok', 'Supabase — ' + new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }));
    showToast('✅ Inventário sincronizado!', 'success');
  } else {
    setSyncStatus('err', 'Erro na sincronização');
    showToast('❌ Não foi possível sincronizar.', 'error');
  }
}

// ════════════════════════════════════════════════════════════════
// DOMContentLoaded — inicialização da aplicação
// ════════════════════════════════════════════════════════════════
document.addEventListener('DOMContentLoaded', async function () {

  // ── 1. Sidebar ──────────────────────────────────────────────
  initSidebar();

  // ── 2. Data de hoje nos elementos de cabeçalho ──────────────
  const dataStr = hoje.toLocaleDateString('pt-BR');
  const sfData  = document.getElementById('sf-data');
  const tbData  = document.getElementById('tb-data');
  if (sfData) sfData.textContent = dataStr;
  if (tbData) tbData.textContent = dataStr;

  const dataEl = document.getElementById('data');
  if (dataEl) dataEl.valueAsDate = hoje;

  // ── 3. Listener: campo residual ─────────────────────────────
  const residualEl = document.getElementById('residual');
  if (residualEl) {
    residualEl.addEventListener('input', function () {
      this.dataset.manual = 'true';
    });
  }

  // ── 4. Listener: categoria da calculadora ───────────────────
  initCategoriaListener();

  // ── 5. AutoComplete da calculadora ──────────────────────────
  initCalcAutoComplete();

  // ── 6. Carga inicial do inventário ──────────────────────────
  const overlay     = document.getElementById('loading-overlay');
  const loadingText = document.getElementById('loading-text');

  try { loadHistLocal(); }      catch (e) {}
  try { updateBadges(); }       catch (e) {}
  try { renderDashboard(); }    catch (e) {}

  try {
    if (loadingText) loadingText.textContent = 'Carregando inventário do banco...';

    const ok = await carregarInventario();

    if (ok) {
      setSyncStatus('ok', 'Supabase — ' + new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }));
      try { updateBadges(); }    catch (e) {}
      try { renderDashboard(); } catch (e) {}
    } else {
      setSyncStatus('warn', 'Sem conexão ao banco');
    }
  } catch (e) {
    console.warn('Erro ao inicializar inventário:', e);
  }

  // ── 7. Auto-sync: Patrimônio_Geral ──────────────────────────
  try {
    if (loadingText) loadingText.textContent = 'Carregando dados do Patrimônio Geral...';
    if (overlay) overlay.classList.remove('hidden');

    await carregarPatrimonioGeral((count) => {
      if (loadingText) loadingText.textContent = `Carregando BD... ${count} itens`;
    });

    const alertas = AppState.invBD.filter(
      i => calcDep(i).restMeses <= 12 && i.status !== 'perdido'
    ).length;
    const nb = document.getElementById('nb-monitor');
    if (nb) {
      nb.textContent = alertas;
      nb.classList.toggle('show', alertas > 0);
    }

    console.log(`✅ BD auto-sincronizado: ${AppState.invBD.length} itens`);
  } catch (e) {
    console.warn('Auto-sync BD error:', e);
  }

  // ── 8. Realtime subscription ─────────────────────────────────
  try {
    iniciarRealtimeSync(async () => {
      await carregarInventario();
      updateBadges();
      renderDashboard();
      renderInvTable();
      setSyncStatus(
        'ok',
        'Supabase — ' + new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
      );
    });
  } catch (e) {
    console.warn('Realtime erro:', e);
  }

  // ── 9. Configurações persistidas ────────────────────────────
  try { carregarConfiguracoes(); } catch (e) {}

  // ── 10. Esconde overlay de loading ──────────────────────────
  if (overlay) overlay.classList.add('hidden');
});