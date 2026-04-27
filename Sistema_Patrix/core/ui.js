/**
 * ============================================================
 * PatrimônioGest — core/ui.js
 * ============================================================
 * Utilitários de interface compartilhados entre todos os módulos:
 *
 *  - Toast de notificação
 *  - Indicador de sincronização (dot + texto)
 *  - Sidebar (colapsar / expandir)
 *  - Navegação entre páginas
 *  - Opções padrão para Chart.js
 *  - Badges de contagem (inventário, alertas)
 *
 * Nenhum módulo de página deve reimplementar estas funções.
 * ============================================================
 */

import { fmt, AppState } from './config.js';
import { calcDep, getAlerts } from './depreciacao.js';

// ─────────────────────────────────────────────────────────────
// TOAST
// ─────────────────────────────────────────────────────────────

let _toastTimer;

/**
 * Exibe um toast de notificação flutuante por 3,5 segundos.
 *
 * @param {string} msg             - Texto a exibir
 * @param {'success'|'error'|'warning'} [type='success']
 */
export function showToast(msg, type = 'success') {
  const toast = document.getElementById('toast');
  const dot   = document.getElementById('toast-dot');
  const msgEl = document.getElementById('toast-msg');

  msgEl.textContent = msg;
  dot.style.background = { success: 'var(--accent)', error: 'var(--red)' }[type] || 'var(--amber)';
  toast.className = `toast ${type} show`;

  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => toast.classList.remove('show'), 3500);
}

// ─────────────────────────────────────────────────────────────
// STATUS DE SINCRONIZAÇÃO
// ─────────────────────────────────────────────────────────────

/**
 * Atualiza o indicador visual de sincronização com o banco.
 *
 * @param {'ok'|'loading'|'err'|'warn'} state
 * @param {string} text - Mensagem descritiva exibida ao lado do dot
 */
export function setSyncStatus(state, text) {
  const dot = document.getElementById('sync-dot');
  const txt = document.getElementById('sync-text');

  if (dot) dot.className = 'sync-dot ' + state;
  if (txt) {
    txt.textContent = text;
    txt.style.color = {
      ok:      'var(--accent)',
      loading: 'var(--blue)',
      err:     'var(--red)',
    }[state] || 'var(--amber)';
  }
}

// ─────────────────────────────────────────────────────────────
// SIDEBAR
// ─────────────────────────────────────────────────────────────

/**
 * Alterna o estado expandido/colapsado da sidebar.
 * Persiste a preferência no localStorage.
 */
export function toggleSidebar() {
  const sidebar  = document.querySelector('.sidebar');
  const icon     = document.getElementById('sidebar-toggle-icon');
  const expanded = sidebar.classList.toggle('expanded');

  document.body.classList.toggle('sidebar-open', expanded);
  localStorage.setItem('sidebar_expanded', expanded ? '1' : '0');

  if (icon) {
    // Seta para esquerda quando aberta, para direita quando fechada
    icon.innerHTML = expanded
      ? '<path d="M15 18l-6-6 6-6"/>'
      : '<path d="M9 18l6-6-6-6"/>';
  }
}

/**
 * Restaura o estado da sidebar conforme a última preferência salva.
 * Chamado no DOMContentLoaded.
 */
export function initSidebar() {
  const sidebar = document.querySelector('.sidebar');
  const icon    = document.getElementById('sidebar-toggle-icon');

  if (localStorage.getItem('sidebar_expanded') === '1') {
    sidebar.classList.add('expanded');
    document.body.classList.add('sidebar-open');
    if (icon) icon.innerHTML = '<path d="M15 18l-6-6 6-6"/>';
  } else {
    sidebar.classList.remove('expanded');
    document.body.classList.remove('sidebar-open');
    if (icon) icon.innerHTML = '<path d="M9 18l6-6-6-6"/>';
  }
}

// ─────────────────────────────────────────────────────────────
// NAVEGAÇÃO ENTRE PÁGINAS
// ─────────────────────────────────────────────────────────────

/**
 * Mapa de títulos das páginas: { id → [título, subtítulo] }
 */
const PAGE_TITLES = {
  dashboard:     ['Dashboard',                    'Visão geral do patrimônio'],
  calculadora:   ['Calculadora',                  'Calcule a depreciação de bens patrimoniais'],
  inventario:    ['Inventário Patrimonial',        'Todos os bens cadastrados'],
  depreciacao:   ['Análise de Depreciação',        'Relatórios, alertas e gráficos comparativos'],
  mensal:        ['Relatório Mensal',              'Bens adquiridos e depreciados mês a mês'],
  historico:     ['Histórico de Atividades',       'Timeline e estatísticas do inventário'],
  monitoramento: ['Monitoramento',                 'Acompanhamento unificado do patrimônio'],
  configuracoes: ['Configurações',                 'Preferências e credenciais do sistema'],
  epi:           ['EPI / Fardamento',              'Controle de EPIs e fardamentos'],
};

/**
 * Navega para uma página do sistema.
 * Oculta todas as outras, ativa o item de menu correspondente
 * e dispara o render da página se necessário.
 *
 * @param {string} id                  - ID da página (sem prefixo "page-")
 * @param {HTMLElement|null} [el=null] - Elemento <li> do menu que foi clicado
 * @param {Object} [renders={}]        - Mapa { id → função } de renders por página
 */
export function goPage(id, el = null, renders = {}) {
  // Desativa todas as páginas e itens do menu
  document.querySelectorAll('.page').forEach((p) => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach((n) => n.classList.remove('active'));

  // Ativa a página e o item do menu selecionados
  document.getElementById('page-' + id)?.classList.add('active');
  if (el) el.classList.add('active');

  // Atualiza título e subtítulo do cabeçalho
  const [titulo, sub] = PAGE_TITLES[id] || [id, ''];
  document.getElementById('page-title').textContent = titulo;
  document.getElementById('page-sub').textContent   = sub;

  // Chama a função de render se existir para esta página
  if (renders[id]) renders[id]();
}

// ─────────────────────────────────────────────────────────────
// BADGES
// ─────────────────────────────────────────────────────────────

/**
 * Atualiza contadores (badges) de inventário e alertas no menu lateral
 * e em outros pontos da interface.
 */
export function updateBadges() {
  const n       = AppState.inv.length;
  const nalerts = getAlerts(AppState.inv).length;

  // Badge do inventário
  document.getElementById('tb-inv').textContent    = n + (n === 1 ? ' item' : ' itens');
  document.getElementById('inv-count').textContent = n + (n === 1 ? ' item' : ' itens');

  // Badge de alertas (depreciação próxima do vencimento)
  const tbAlerts = document.getElementById('tb-alertas');
  const nbAlerta = document.getElementById('nb-alerta');

  if (nalerts > 0) {
    tbAlerts.textContent = nalerts + ' alertas';
    tbAlerts.classList.remove('hidden');
    nbAlerta.textContent = nalerts;
    nbAlerta.classList.add('show');
  } else {
    tbAlerts.classList.add('hidden');
    nbAlerta.classList.remove('show');
  }
}

// ─────────────────────────────────────────────────────────────
// OPÇÕES PADRÃO PARA CHART.JS
// ─────────────────────────────────────────────────────────────

/**
 * Retorna um objeto de opções padrão para gráficos de linha/barra
 * no tema escuro da aplicação.
 *
 * @param {Function} fmtFn - Função de formatação do eixo Y (ex: fmt para moeda)
 * @returns {Object} Objeto de options para Chart.js
 */
export function chartOpts(fmtFn) {
  return {
    responsive:          true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: '#1a1e25',
        borderColor:     'rgba(255,255,255,0.1)',
        borderWidth:     1,
        titleColor:      '#8b9099',
        bodyColor:       '#00d4aa',
        callbacks: {
          label: (c) => ' ' + fmtFn(c.parsed.y),
        },
      },
    },
    scales: {
      y: {
        ticks:  { color: '#555b65', callback: (v) => fmtFn(v), font: { family: 'DM Mono', size: 10 } },
        grid:   { color: 'rgba(255,255,255,0.04)' },
        border: { color: 'transparent' },
      },
      x: {
        ticks:  { color: '#555b65', font: { family: 'DM Mono', size: 10 } },
        grid:   { color: 'rgba(255,255,255,0.04)' },
        border: { color: 'transparent' },
      },
    },
  };
}

// ─────────────────────────────────────────────────────────────
// TOGGLE BLOCO (acordeão genérico)
// ─────────────────────────────────────────────────────────────

/**
 * Alterna visibilidade de um bloco acordeão no relatório mensal.
 *
 * @param {string} id       - ID do elemento .month-body
 * @param {HTMLElement} headerEl - Elemento .month-header que contém o chevron
 */
export function toggleMes(id, headerEl) {
  const body    = document.getElementById(id);
  const chevron = headerEl.querySelector('.month-chevron');
  const isOpen  = body.classList.contains('open');

  body.classList.toggle('open', !isOpen);
  headerEl.classList.toggle('open', !isOpen);
  if (chevron) chevron.classList.toggle('open', !isOpen);
}