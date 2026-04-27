/**
 * ============================================================
 * PatrimônioGest — core/depreciacao.js
 * ============================================================
 * Motor de cálculo de depreciação patrimonial.
 *
 * Suporta três métodos:
 *  1. Linear (quotas constantes) — padrão NBR/IFRS
 *  2. Saldo Decrescente          — taxa % sobre saldo remanescente
 *  3. Soma dos Dígitos           — quotas decrescentes proporcionais
 *
 * Todas as funções são puras (sem efeitos colaterais) e podem
 * ser testadas isoladamente.
 * ============================================================
 */

import { hoje } from './config.js';

// ─────────────────────────────────────────────────────────────
// CÁLCULO BASE
// ─────────────────────────────────────────────────────────────

/**
 * Retorna quantos meses se passaram desde a data de aquisição até hoje.
 *
 * @param {string} dtStr - Data no formato YYYY-MM-DD
 * @returns {number} Número de meses (pode ser fracionado)
 */
export function getMeses(dtStr) {
  const diff = hoje - new Date(dtStr + 'T00:00:00');
  return diff <= 0 ? 0 : Math.max(0, diff / (1000 * 60 * 60 * 24) / 30);
}

/**
 * Calcula os valores de depreciação de um item patrimonial
 * usando o método LINEAR (padrão do sistema).
 *
 * Fórmulas:
 *   depreciação mensal  = (valor - residual) / (vida_útil * 12)
 *   depreciação acum.   = min(dep_mensal * meses_uso, valor - residual)
 *   valor contábil      = max(valor - dep_acum, residual)
 *
 * @param {Object} item - Objeto do inventário com { val, res, vd, dt }
 * @returns {{ dm, da, vc, meses, restMeses }}
 *   dm         = depreciação mensal
 *   da         = depreciação acumulada
 *   vc         = valor contábil atual
 *   meses      = meses de uso
 *   restMeses  = meses restantes de vida útil
 */
export function calcDep(item) {
  const meses = getMeses(item.dt);

  // Depreciação mensal linear
  const dm = (item.val - item.res) / (item.vd * 12);

  // Depreciação acumulada não pode ultrapassar (valor - residual)
  const da = Math.min(dm * meses, item.val - item.res);

  // Valor contábil não pode ser menor que o residual
  const vc = Math.max(item.val - da, item.res);

  // Dias restantes de vida útil → converte para meses
  const diasUsados = Math.max(
    0,
    (hoje - new Date(item.dt + 'T00:00:00')) / (1000 * 60 * 60 * 24)
  );
  const diasTotais = item.vd * 12 * 30;
  const restDias   = Math.max(0, diasTotais - diasUsados);
  const restMeses  = Math.max(0, Math.round(restDias / 30));

  return { dm, da, vc, meses, restMeses };
}

// ─────────────────────────────────────────────────────────────
// CÁLCULO COMPLETO (CALCULADORA) — suporta todos os métodos
// ─────────────────────────────────────────────────────────────

/**
 * Calcula depreciação com suporte a múltiplos métodos.
 * Usado exclusivamente pela Calculadora (não pelo inventário).
 *
 * @param {Object} params
 * @param {number} params.val    - Valor de aquisição
 * @param {string} params.dtStr  - Data de aquisição (YYYY-MM-DD)
 * @param {number} params.vd     - Vida útil em anos
 * @param {number} params.res    - Valor residual
 * @param {string} params.metodo - 'linear' | 'decrescente' | 'soma'
 * @param {number} params.taxa   - Taxa anual % (só p/ método decrescente)
 * @returns {{ depMensal, depAnual, depAcum, valCont, meses }}
 */
export function calcDepMetodo({ val, dtStr, vd, res, metodo, taxa }) {
  const dt    = new Date(dtStr + 'T00:00:00');
  const meses = Math.max(0, (hoje.getFullYear() - dt.getFullYear()) * 12 + (hoje.getMonth() - dt.getMonth()));
  const anos  = meses / 12;

  let depAnual, depMensal, depAcum, valCont;

  if (metodo === 'linear') {
    // ── Quotas constantes ────────────────────────────────────
    depAnual  = (val - res) / vd;
    depMensal = depAnual / 12;
    depAcum   = Math.min(depMensal * meses, val - res);
    valCont   = Math.max(val - depAcum, res);

  } else if (metodo === 'decrescente') {
    // ── Saldo decrescente ────────────────────────────────────
    // Aplica taxa % sobre o saldo restante a cada ano
    depAcum = 0;
    let saldo = val;
    for (let i = 0; i < anos && saldo > res; i++) {
      const d = saldo * (taxa / 100);
      depAcum += d;
      saldo   -= d;
    }
    valCont   = Math.max(val - depAcum, res);
    depAnual  = (val - res) / vd;   // referência comparativa
    depMensal = depAnual / 12;

  } else {
    // ── Soma dos dígitos (SDA) ───────────────────────────────
    // Peso do ano i = (vida - i + 1) / soma_dos_dígitos
    const soma = (vd * (vd + 1)) / 2;
    depAcum = 0;
    for (let i = 0; i < Math.floor(anos); i++) {
      depAcum += (val - res) * ((vd - i) / soma);
    }
    valCont   = Math.max(val - depAcum, res);
    depAnual  = (val - res) / vd;
    depMensal = depAnual / 12;
  }

  return { depMensal, depAnual, depAcum, valCont, meses };
}

// ─────────────────────────────────────────────────────────────
// GERAÇÃO DE SÉRIE TEMPORAL (TABELA / GRÁFICO)
// ─────────────────────────────────────────────────────────────

/**
 * Gera a série de valores contábeis período a período.
 * Retorna { labels, data } prontos para Chart.js e <table>.
 *
 * @param {Object} params - Mesmos parâmetros de calcDepMetodo + { val, vd, res, metodo, taxa }
 * @returns {{ labels: string[], data: number[], rows: Array }}
 *   rows = [{ periodo, valorInicial, depPeriodo, depAcum, novoValor }]
 */
export function gerarSerie({ val, vd, res, metodo, taxa }) {
  const labels = ['Aquisição'];
  const data   = [parseFloat(val.toFixed(2))];
  const rows   = [];
  const soma   = metodo === 'soma' ? (vd * (vd + 1)) / 2 : 0;

  if (vd < 1) {
    // ── Vida útil < 1 ano → exibe meses ──────────────────────
    const totalMeses = Math.round(vd * 12);
    const depMes     = (val - res) / totalMeses;
    let saldo = val, depAcum = 0;

    for (let m = 1; m <= totalMeses; m++) {
      depAcum += depMes;
      const novoValor = Math.max(val - depAcum, res);
      labels.push(`Mês ${m}`);
      data.push(parseFloat(novoValor.toFixed(2)));
      rows.push({ periodo: `${m}º mês`, valorInicial: saldo, depPeriodo: depMes, depAcum, novoValor });
      saldo = novoValor;
    }
  } else {
    // ── Vida útil ≥ 1 ano → exibe anos ───────────────────────
    let saldo = val, depAcum = 0;

    for (let a = 1; a <= vd; a++) {
      let dep;
      if (metodo === 'linear') {
        dep = (val - res) / vd;
      } else if (metodo === 'decrescente') {
        dep = Math.max(saldo * (taxa / 100), 0);
      } else {
        dep = (val - res) * ((vd - a + 1) / soma);
      }

      depAcum += dep;
      const novoValor = Math.max(val - depAcum, res);
      labels.push(`Ano ${a}`);
      data.push(parseFloat(novoValor.toFixed(2)));
      rows.push({ periodo: `${a}º ano`, valorInicial: saldo, depPeriodo: dep, depAcum, novoValor });
      saldo = novoValor;
    }
  }

  return { labels, data, rows };
}

// ─────────────────────────────────────────────────────────────
// HELPERS DE ALERTAS
// ─────────────────────────────────────────────────────────────

/**
 * Retorna todos os itens cujo prazo de vida útil vence em ≤ 12 meses.
 * Usa o array global do AppState para não depender de parâmetro.
 *
 * @param {Array} inv - Lista de itens do inventário
 * @returns {Array} Subconjunto filtrado
 */
export function getAlerts(inv) {
  return inv.filter((i) => calcDep(i).restMeses <= 12);
}