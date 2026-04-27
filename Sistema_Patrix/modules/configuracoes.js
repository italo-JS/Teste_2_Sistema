/**
 * ═══════════════════════════════════════════════════════════════
 * modules/configuracoes.js
 * PatrimônioGest v2.4 — Aba: Configurações
 * ───────────────────────────────────────────────────────────────
 * Responsabilidades:
 *   - Carregar e salvar preferências gerais (organização, responsável,
 *     percentual residual padrão, meses de alerta)
 *   - Gerenciar credenciais do Supabase (URL + chave)
 *   - Testar a conexão com o banco sem recarregar a página
 *   - Limpar histórico local e/ou todos os dados do localStorage
 *   - Controlar a exibição do card de credenciais do BD (acordeão)
 * ═══════════════════════════════════════════════════════════════
 */

import { LS_KEYS } from '../core/config.js';
import { showToast } from '../core/ui.js';

// ─── Chave exclusiva para as configurações gerais ────────────────
const CFG_KEY = 'patrimgest_config';

// ────────────────────────────────────────────────────────────────
// carregarConfiguracoes
// Lê o objeto JSON salvo no localStorage e preenche os campos do
// formulário de configurações na tela.
// Chamado ao navegar para a aba Configurações.
// ────────────────────────────────────────────────────────────────
export function carregarConfiguracoes() {
  try {
    const cfg = JSON.parse(localStorage.getItem(CFG_KEY) || '{}');

    // Preferências gerais
    if (cfg.org)                       document.getElementById('cfg-org').value          = cfg.org;
    if (cfg.responsavel)               document.getElementById('cfg-responsavel').value  = cfg.responsavel;
    if (cfg.residualPct !== undefined) document.getElementById('cfg-residual-pct').value = cfg.residualPct;
    if (cfg.alertaMeses !== undefined) document.getElementById('cfg-alerta-meses').value = cfg.alertaMeses;

    // Credenciais Supabase (pré-preenchidas somente se o usuário as salvou antes)
    if (cfg.sbUrl) document.getElementById('cfg-sb-url').value = cfg.sbUrl;
    if (cfg.sbKey) document.getElementById('cfg-sb-key').value = cfg.sbKey;
  } catch (e) {
    console.warn('Erro ao carregar configurações:', e);
  }
}

// ────────────────────────────────────────────────────────────────
// salvarConfiguracoes
// Persiste as preferências gerais (org, responsável, residual%,
// meses de alerta) no localStorage.
// NÃO salva as credenciais do BD — use salvarConfigBD() para isso.
// ────────────────────────────────────────────────────────────────
export function salvarConfiguracoes() {
  try {
    // Carrega o objeto existente para não sobrescrever credenciais do BD
    const cfg = JSON.parse(localStorage.getItem(CFG_KEY) || '{}');

    cfg.org         = document.getElementById('cfg-org').value.trim();
    cfg.responsavel = document.getElementById('cfg-responsavel').value.trim();
    cfg.residualPct = parseFloat(document.getElementById('cfg-residual-pct').value) || 20;
    cfg.alertaMeses = parseInt(document.getElementById('cfg-alerta-meses').value)   || 12;

    localStorage.setItem(CFG_KEY, JSON.stringify(cfg));
    showToast('✅ Configurações salvas!', 'success');
  } catch (e) {
    showToast('❌ Erro ao salvar configurações.', 'error');
  }
}

// ────────────────────────────────────────────────────────────────
// salvarConfigBD
// Salva a URL e a chave anônima do Supabase no localStorage e
// recarrega a página (necessário para reinicializar o cliente JS).
// Valida os campos antes de persistir.
// ────────────────────────────────────────────────────────────────
export function salvarConfigBD() {
  try {
    const cfg    = JSON.parse(localStorage.getItem(CFG_KEY) || '{}');
    const sbUrl  = document.getElementById('cfg-sb-url').value.trim();
    const sbKey  = document.getElementById('cfg-sb-key').value.trim();

    if (!sbUrl || !sbKey) {
      showToast('❌ Preencha a URL e a Chave do Supabase.', 'warning');
      return;
    }

    cfg.sbUrl = sbUrl;
    cfg.sbKey = sbKey;

    // Remove campos de configuração legada (API REST manual)
    delete cfg.monUrl;
    delete cfg.monToken;

    localStorage.setItem(CFG_KEY, JSON.stringify(cfg));
    showToast('✅ Credenciais salvas! Recarregando...', 'success');

    // Recarrega para que o cliente Supabase inicialize com as novas credenciais
    setTimeout(() => location.reload(), 1000);
  } catch (e) {
    console.error(e);
    showToast('❌ Erro ao salvar credenciais.', 'error');
  }
}

// ────────────────────────────────────────────────────────────────
// resetarConfiguracoes
// Restaura os campos de preferências gerais para os valores padrão.
// Não apaga credenciais do BD.
// ────────────────────────────────────────────────────────────────
export function resetarConfiguracoes() {
  if (!confirm('Restaurar configurações para os valores padrão?')) return;

  document.getElementById('cfg-org').value          = '';
  document.getElementById('cfg-responsavel').value   = '';
  document.getElementById('cfg-residual-pct').value  = '20';
  document.getElementById('cfg-alerta-meses').value  = '12';

  showToast('✅ Configurações restauradas.', 'success');
}

// ────────────────────────────────────────────────────────────────
// testarConexao
// Faz uma requisição simples à tabela Inventario_Realizado com as
// credenciais informadas nos campos, sem salvar nem recarregar.
// Exibe o resultado no elemento #cfg-conn-status.
// ────────────────────────────────────────────────────────────────
export async function testarConexao() {
  const url      = document.getElementById('cfg-sb-url').value.trim();
  const key      = document.getElementById('cfg-sb-key').value.trim();
  const statusEl = document.getElementById('cfg-conn-status');

  if (!url || !key) {
    statusEl.textContent = '⚠️ Preencha a URL e a chave.';
    statusEl.style.color = 'var(--amber)';
    return;
  }

  statusEl.textContent = '⏳ Testando conexão...';
  statusEl.style.color = 'var(--text3)';

  try {
    // Busca no máximo 1 registro para verificar se a conexão funciona
    const r = await fetch(`${url}/rest/v1/Inventario_Realizado?limit=1`, {
      headers: {
        'apikey':        key,
        'Authorization': 'Bearer ' + key,
      },
    });

    if (!r.ok) throw new Error('HTTP ' + r.status);

    statusEl.textContent = '✅ Conexão bem-sucedida com o Supabase!';
    statusEl.style.color = 'var(--accent)';
    showToast('✅ Supabase respondeu corretamente!', 'success');

  } catch (e) {
    statusEl.textContent = '❌ Falha: ' + e.message;
    statusEl.style.color = 'var(--red)';
    showToast('❌ Erro ao conectar: ' + e.message, 'error');
  }
}

// ────────────────────────────────────────────────────────────────
// limparHistoricoLocal
// Remove apenas o array de histórico de atividades do localStorage.
// Os dados do inventário no Supabase não são afetados.
// ────────────────────────────────────────────────────────────────
export async function limparHistoricoLocal() {
  if (!confirm('Limpar todo o histórico local de atividades?')) return;

  // Remove do localStorage e zera o array em memória via AppState
  try {
    localStorage.removeItem(LS_KEYS.HIST);
    const { AppState } = await import('../core/config.js');
    AppState.historico = [];
  } catch (e) {}

  showToast('🧹 Histórico local limpo.', 'success');
}

// ────────────────────────────────────────────────────────────────
// limparTudoLocal
// Remove TODOS os dados salvos no localStorage (histórico,
// configurações de monitoramento e configurações gerais).
// Não afeta dados no Supabase.
// ────────────────────────────────────────────────────────────────
export function limparTudoLocal() {
  if (!confirm('Isso vai limpar TODOS os dados locais (histórico, configurações). Continuar?')) return;

  try {
    localStorage.removeItem(LS_KEYS.HIST);
    localStorage.removeItem(LS_KEYS.MON);
    localStorage.removeItem(CFG_KEY);
  } catch (e) {}

  showToast('🧹 Dados locais resetados.', 'success');
}

// ────────────────────────────────────────────────────────────────
// toggleBDCard
// Expande/colapsa o card de credenciais do Supabase na aba
// de configurações (acordeão simples com chevron animado).
// ────────────────────────────────────────────────────────────────
export function toggleBDCard() {
  const body    = document.getElementById('bd-card-body');
  const chevron = document.getElementById('bd-chevron');
  const aberto  = body.style.display === 'block';

  body.style.display       = aberto ? 'none' : 'block';
  chevron.style.transform  = aberto ? '' : 'rotate(180deg)';
}