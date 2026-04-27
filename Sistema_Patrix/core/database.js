/**
 * ============================================================
 * PatrimônioGest — core/database.js
 * ============================================================
 * Camada de acesso a dados (DAL — Data Access Layer).
 *
 * Responsabilidades:
 *  - Toda comunicação com o Supabase (leitura, escrita, exclusão)
 *  - Mapeamento entre schema do banco → objetos internos da app
 *  - Realtime subscription (mudanças automáticas ao vivo)
 *  - Cache local (localStorage) para histórico de atividades
 *
 * NENHUM módulo deve importar o cliente Supabase diretamente.
 * Toda operação de banco passa por este arquivo.
 * ============================================================
 */

import { supabase, AppState, LS_KEYS } from './config.js';

// ─────────────────────────────────────────────────────────────
// MAPEAMENTO: banco → objeto interno
// ─────────────────────────────────────────────────────────────

/**
 * Transforma uma linha da tabela `Inventario_Realizado` no formato
 * que a aplicação usa internamente.
 *
 * @param {Object} row - Linha bruta do Supabase
 * @returns {Object} Item normalizado
 */
function mapInventarioRow(row) {
  return {
    id:      row.id,
    cat:     row.item_bem        || '',
    desc:    row.descricao       || '',
    prod:    row.produto         || '',
    tipo:    row.tipo            || '',
    val:     parseFloat(row.valor_aquisicao) || 0,
    dt:      row.data_aquisicao  || new Date().toISOString().slice(0, 10),
    vd:      parseFloat(row.vida_util)       || 1,
    taxa:    parseFloat(row.taxa_ano)        || 0,
    res:     parseFloat(row.valor_residual)  || 0,
    metodo:  row.metodo          || 'linear',
    status:  row.status          || 'acompanhamento',
    obs:     row.obs             || '',
    addedAt: row.created_at      || new Date().toISOString(),
  };
}

/**
 * Transforma uma linha da tabela `Patrimonio_Geral` no formato interno.
 *
 * @param {Object} row - Linha bruta
 * @param {number} idx - Índice (usado como fallback de ID)
 * @returns {Object} Item normalizado
 */
function mapPatrimonioGeralRow(row, idx) {
  const val = parseFloat(row.valor_item || row.val || row.value || 0);
  const vd  = parseFloat(row.vida_util_anos || row.vd || row.vida_util || 1);
  const dt  = (row.data_aquisicao || row.dt || row.created_at || new Date().toISOString())
    .toString().slice(0, 10);

  return {
    id:          row.id || row.n_patrimonio || (Date.now() + idx),
    desc:        row.descricao_item || row.desc || row.nome || `Item ${idx + 1}`,
    tipo:        row.conta || row.tipo || row.categoria || 'Outros',
    prod:        row.marca_item || row.prod || row.produto || '',
    modelo:      row.modelo_item        || '',
    filial:      row.filial_local       || '',
    centro_custo: row.centro_custo      || '',
    n_patrimonio: row.n_patrimonio      || '',
    nota_fiscal:  row.nota_fiscal       || '',
    estado:      row.estado_conservacao || '',
    obs:         row.observacao || row.obs || '',
    val, vd,
    res:   val * 0.20,
    taxa:  parseFloat(row.taxa || 0),
    dt,
    status:  (row.status || 'acompanhamento').toString().trim(),
    addedAt: row.created_at || row.addedAt || new Date().toISOString(),
  };
}

// ─────────────────────────────────────────────────────────────
// INVENTÁRIO REALIZADO (CRUD)
// ─────────────────────────────────────────────────────────────

/**
 * Carrega todos os itens do Inventário Realizado do banco
 * e atualiza o AppState.inv.
 *
 * @returns {Promise<boolean>} true se bem-sucedido
 */
export async function carregarInventario() {
  try {
    const { data, error } = await supabase
      .from('Inventario_Realizado')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;

    AppState.inv = (data || []).map(mapInventarioRow);
    return true;
  } catch (e) {
    console.warn('Erro ao carregar inventário:', e.message);
    return false;
  }
}

/**
 * Insere um novo item no banco e retorna true se bem-sucedido.
 *
 * @param {Object} item - Item normalizado (formato interno)
 * @returns {Promise<boolean>}
 */
export async function salvarItemInventario(item) {
  try {
    const { error } = await supabase.from('Inventario_Realizado').insert([{
      item_bem:        item.cat,
      descricao:       item.desc,
      produto:         item.prod,
      tipo:            item.tipo,
      valor_aquisicao: parseFloat(item.val),
      data_aquisicao:  item.dt,
      vida_util:       parseFloat(item.vd),
      taxa_ano:        parseFloat(item.taxa),
      metodo:          item.metodo || 'linear',
      valor_residual:  parseFloat(item.res),
      status:          item.status || 'acompanhamento',
      obs:             item.obs || '',
    }]);

    if (error) throw error;
    return true;
  } catch (e) {
    console.warn('Erro ao salvar item:', e.message);
    return false;
  }
}

/**
 * Remove um item pelo ID.
 *
 * @param {string|number} id
 * @returns {Promise<boolean>}
 */
export async function removerItemInventario(id) {
  try {
    const { error } = await supabase
      .from('Inventario_Realizado')
      .delete()
      .eq('id', id);

    if (error) throw error;
    return true;
  } catch (e) {
    console.warn('Erro ao remover item:', e.message);
    return false;
  }
}

/**
 * Atualiza status e observação de um item.
 *
 * @param {string|number} id
 * @param {string} status   - 'acompanhamento' | 'perdido'
 * @param {string} obs      - Observação livre
 * @returns {Promise<boolean>}
 */
export async function atualizarStatusItem(id, status, obs) {
  try {
    const { error } = await supabase
      .from('Inventario_Realizado')
      .update({ status, obs })
      .eq('id', id);

    if (error) throw error;
    return true;
  } catch (e) {
    console.warn('Erro ao atualizar status:', e.message);
    return false;
  }
}

// ─────────────────────────────────────────────────────────────
// PATRIMÔNIO GERAL (somente leitura — tabela externa)
// ─────────────────────────────────────────────────────────────

/**
 * Carrega todos os registros de `Patrimonio_Geral` com paginação
 * automática (lotes de 1000) e atualiza AppState.invBD.
 *
 * @param {Function} [onProgress] - Callback(qtdCarregada) para barra de progresso
 * @returns {Promise<boolean>}
 */
export async function carregarPatrimonioGeral(onProgress) {
  try {
    let allData = [], from = 0;
    const limit = 1000;

    while (true) {
      const { data: page, error } = await supabase
        .from('Patrimonio_Geral')
        .select('*')
        .range(from, from + limit - 1);

      if (error) throw error;
      if (!page || page.length === 0) break;

      allData = allData.concat(page);
      if (onProgress) onProgress(allData.length);
      if (page.length < limit) break;

      from += limit;
    }

    AppState.invBD = allData.map(mapPatrimonioGeralRow);
    return true;
  } catch (e) {
    console.warn('Erro ao carregar Patrimônio Geral:', e.message);
    return false;
  }
}

// ─────────────────────────────────────────────────────────────
// EPI / FARDAMENTO
// ─────────────────────────────────────────────────────────────

/**
 * Carrega itens da tabela `fardamentos_epi` e atualiza AppState.invEPI.
 *
 * @returns {Promise<boolean>}
 */
export async function carregarEPI() {
  try {
    const { data, error } = await supabase
      .from('fardamentos_epi')
      .select('*')
      .range(0, 15000)
      .order('data_criacao', { ascending: false });

    if (error) throw error;

    AppState.invEPI = (data || []).map((item) => ({
      id:                  item.id,
      data_criacao:        item.data_criacao        || '',
      num_nota:            item.num_nota            || '',
      local:               item.local               || '',
      operacao_financeira: item.operacao_financeira || '',
      produto:             item.produto             || '',
      nome_colaborador:    item.nome_colaborador    || '',
      data_cadastro:       item.data_cadastro       || '',
      tempo_colaborador:   item.tempo_colaborador   || '',
      tipo_frete:          item.tipo_frete          || '',
      perfil:              item.perfil              || '',
      equipe:              item.equipe              || '',
      data_emissao:        item.data_emissao        || '',
      tempo_cliente:       item.tempo_cliente       || '',
      serie_tipo:          item.serie_tipo          || '',
      descricao:           item.descricao           || '',
      observacao:          item.observacao          || '',
      tec_equip:           item.tec_equip           || '',
      grupo_produto:       item.grupo_produto       || '',
      split_part:          item.split_part          || '',
      dias:                parseInt(item.dias)              || 0,
      total_nota:          parseFloat(item.total_nota)      || 0,
      total_cad:           parseFloat(item.total_cad)       || 0,
      quantidade:          parseInt(item.quantidade)        || 0,
      class_colab:         item.class_colab         || '',
      v_residual:          parseFloat(item.v_residual)      || 0,
      depreciacao:         parseFloat(item.depreciacao)     || 0,
      data_troca:          item.data_troca          || '',
      dias_restantes:      parseInt(item.dias_restantes)    || 0,
      situacao:            item.situacao            || '',
    }));

    return true;
  } catch (e) {
    console.warn('Erro ao carregar EPI:', e.message);
    return false;
  }
}

/**
 * Insere um novo item de EPI/Fardamento no banco.
 *
 * @param {Object} item
 * @returns {Promise<boolean>}
 */
export async function salvarItemEPI(item) {
  try {
    const { error } = await supabase.from('fardamentos_epi').insert([{
      descricao:        item.nome,
      grupo_produto:    item.tipo,
      nome_colaborador: item.colab,
      equipe:           item.setor,
      data_criacao:     item.dtEntrega || new Date().toISOString().slice(0, 10),
      data_troca:       item.dtVenc    || null,
      total_nota:       item.valor,
      split_part:       item.codigo,
      situacao:         item.status,
      observacao:       item.obs,
    }]);

    if (error) throw error;
    return true;
  } catch (e) {
    console.warn('Erro ao salvar EPI:', e.message);
    return false;
  }
}

// ─────────────────────────────────────────────────────────────
// REALTIME
// ─────────────────────────────────────────────────────────────

/**
 * Inicia a escuta em tempo real de mudanças na tabela Inventario_Realizado.
 * Chama onMudanca(payload) sempre que um INSERT / UPDATE / DELETE ocorrer.
 *
 * @param {Function} onMudanca - Callback assíncrono chamado em cada evento
 */
export function iniciarRealtimeSync(onMudanca) {
  supabase
    .channel('inventario-sync')
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'Inventario_Realizado' },
      async (payload) => {
        console.log('🔄 Realtime — evento:', payload.eventType);
        await onMudanca(payload);
      }
    )
    .subscribe();
}

// ─────────────────────────────────────────────────────────────
// HISTÓRICO LOCAL (localStorage)
// ─────────────────────────────────────────────────────────────

/**
 * Persiste o histórico de atividades no localStorage.
 */
export function saveHistLocal() {
  try {
    localStorage.setItem(LS_KEYS.HIST, JSON.stringify(AppState.historico));
  } catch (e) {
    console.warn('Erro ao salvar histórico local:', e);
  }
}

/**
 * Carrega o histórico salvo no localStorage para AppState.historico.
 */
export function loadHistLocal() {
  try {
    const raw = localStorage.getItem(LS_KEYS.HIST);
    if (raw) {
      AppState.historico = JSON.parse(raw).map((i) => ({
        ...i,
        ts: new Date(i.ts),
      }));
    }
  } catch (e) {
    console.warn('Erro ao carregar histórico local:', e);
  }
}	