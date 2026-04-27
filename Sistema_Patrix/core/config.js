/**
 * ============================================================
 * PatrimônioGest — core/config.js
 * ============================================================
 * Configurações globais do sistema:
 *  - Credenciais do Supabase (URL + chave anônima)
 *  - Constantes visuais (cores por tipo de bem)
 *  - Estado global da aplicação (inventários, histórico, flags)
 *  - Helpers de formatação reutilizados em todos os módulos
 * ============================================================
 */

// ── CONFIGURAÇÕES DE TRANSIÇÃO (POSTGRES / MOCK) ─────────────────
// As credenciais do Supabase foram removidas. 
// O sistema agora utiliza window._sb (definido no index.html) como ponte.
export const supabase = window._sb;
export const API_BASE_URL = 'http://localhost:3000'; // Exemplo para seu futuro backend Node.js

// ── PALETA DE CORES POR TIPO DE BEM ──────────────────────────
// Usado em gráficos, badges e marcadores de lista.
export const TIPO_COLORS = {
  'Telefonia': '#4e9eff',
  'Informática': '#a78bfa',
  'Móveis': '#f5a623',
  'Equipamento': '#00d4aa',
  'Fardamento': '#f472b6',
  'EPI': '#fb923c',
  'Materiais Diversos': '#34d399',
  'BENS DE USO': '#4e9eff',
  'CELULARES': '#a78bfa',
  'EQUIPAMENTOS DE INFORMÁTICA': '#f5a623',
  'EQUIPAMENTOS': '#00d4aa',
  'MÓVEIS PLANEJADOS': '#f472b6',
  'VEÍCULOS': '#fb923c',
  'Outros': '#8b9099',
  '': '#8b9099',
};

/**
 * Retorna a cor associada a um tipo de bem.
 * Se o tipo não estiver no mapa, gera uma cor determinística via hash.
 *
 * @param {string} tipo - Nome do tipo de bem
 * @returns {string} Cor em formato hexadecimal
 */
export function getTipoColor(tipo) {
  if (!tipo) return '#8b9099';
  if (TIPO_COLORS[tipo]) return TIPO_COLORS[tipo];

  // Hash simples para tipos desconhecidos → cor consistente por nome
  let hash = 0;
  for (let i = 0; i < tipo.length; i++) {
    hash = tipo.charCodeAt(i) + ((hash << 5) - hash);
  }
  const palette = [
    '#4e9eff', '#a78bfa', '#f5a623', '#00d4aa',
    '#f472b6', '#fb923c', '#34d399', '#60a5fa',
    '#f87171', '#34d399',
  ];
  return palette[Math.abs(hash) % palette.length];
}

// ── CONSTANTES DE TEMPO ───────────────────────────────────────
export const hoje = new Date();

export const MESES_PT = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];

// ── ESTADO GLOBAL DA APLICAÇÃO ────────────────────────────────
// Centraliza os arrays de dados para que todos os módulos
// apontem para a mesma referência (sem duplicação).
export const AppState = {
  /** Itens do inventário (tabela Inventario_Realizado) */
  inv: [],

  /** Itens do Patrimônio Geral (tabela Patrimonio_Geral) */
  invBD: [],

  /** Itens de EPI/Fardamento (tabela fardamentos_epi) */
  invEPI: [],

  /** Histórico local de adições/remoções (salvo no localStorage) */
  historico: [],

  /** ID do item selecionado no painel de acompanhamento do dashboard */
  dashSelectedId: null,

  /** Define se o valor residual deve ser considerado nos cálculos */
  usarResidual: true,

  /** Status padrão ao adicionar um item ('acompanhamento' | 'perdido') */
  itemStatus: 'acompanhamento',
};

// ── HELPERS DE FORMATAÇÃO ─────────────────────────────────────

/**
 * Formata um número como moeda brasileira (R$).
 * @param {number} v
 * @returns {string}
 */
export const fmt = (v) =>
  isNaN(v) ? 'R$ 0,00' : v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

/**
 * Formata uma string de data ISO (YYYY-MM-DD) para DD/MM/AAAA.
 * @param {string} s - Data no formato YYYY-MM-DD
 * @returns {string}
 */
export const fmtDate = (s) =>
  new Date(s + 'T00:00:00').toLocaleDateString('pt-BR');

// ── CHAVES DO LOCALSTORAGE ────────────────────────────────────
export const LS_KEYS = {
  HIST: 'patrimgest_hist',
  MON: 'patrimgest_mon_config',
  CONFIG: 'patrimgest_config',
};