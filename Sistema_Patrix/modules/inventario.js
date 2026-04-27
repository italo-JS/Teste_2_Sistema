/**
 * ============================================================
 * PatrimônioGest — modules/inventario.js
 * ============================================================
 * Módulo do Inventário Patrimonial.
 *
 * Responsabilidades:
 *  - Renderização da tabela de inventário com filtros
 *  - Adição de novos itens (lê formulário da calculadora)
 *  - Remoção de itens
 *  - Toggle de status (Acompanhamento ↔ Perdido)
 *  - Impressão do relatório de depreciação
 * ============================================================
 */

import { fmt, fmtDate, AppState }    from '../core/config.js';
import { calcDep, getAlerts }         from '../core/depreciacao.js';
import { getTipoColor }               from '../core/config.js';
import {
  salvarItemInventario,
  removerItemInventario,
  atualizarStatusItem,
  carregarInventario,
  saveHistLocal,
}                                     from '../core/database.js';
import { showToast, updateBadges, setSyncStatus } from '../core/ui.js';
import { getResidualValue, limpar }    from './calculadora.js';

// ─────────────────────────────────────────────────────────────
// RENDERIZAÇÃO DA TABELA
// ─────────────────────────────────────────────────────────────

/**
 * Renderiza a tabela do inventário aplicando os filtros ativos.
 * Calcula depreciação de cada item e exibe status visual.
 */
export function renderInvTable() {
  const busca = (document.getElementById('f-busca')?.value || '').toLowerCase();
  const ftipo = document.getElementById('f-tipo')?.value  || '';
  const fprod = document.getElementById('f-prod')?.value  || '';
  const tbody = document.getElementById('inv-tbody');
  if (!tbody) return;

  // Aplica filtros de busca, tipo e produto
  const filtered = AppState.inv.filter((i) =>
    (!busca || i.desc.toLowerCase().includes(busca)) &&
    (!ftipo || i.tipo === ftipo) &&
    (!fprod || i.prod === fprod)
  );

  tbody.innerHTML = '';

  if (!filtered.length) {
    tbody.innerHTML = `<tr><td colspan="10" style="text-align:center;padding:32px;color:var(--text3)">
      Nenhum item encontrado</td></tr>`;
    document.getElementById('inv-total').textContent = 'R$ 0,00';
    return;
  }

  let totalDep = 0;

  filtered.forEach((item) => {
    const { da, vc, restMeses } = calcDep(item);
    totalDep += da;

    const col       = getTipoColor(item.tipo);
    const isAlert   = restMeses <= 12;
    const isVencido = restMeses === 0;
    const isPerdido = item.status === 'perdido';

    // Badge de status na coluna "Status"
    const statusHtml = isPerdido
      ? `<span class="badge" style="font-size:10px;background:var(--red-dim);color:var(--red)">⚠️ Perdido</span>`
      : isVencido
        ? `<span class="badge badge-red"   style="font-size:10px">Vencido</span>`
        : isAlert
          ? `<span class="badge badge-amber" style="font-size:10px">${restMeses}m restantes</span>`
          : `<span class="badge badge-green" style="font-size:10px">Ativo</span>`;

    const r = tbody.insertRow();
    if (isPerdido) r.style.opacity = '0.65';

    r.innerHTML = `
      <td class="td-bold">
        <span class="inv-dot" style="background:${isPerdido ? 'var(--red)' : col}"></span>
        ${item.desc}
        ${item.obs ? `<div style="font-size:10px;color:var(--text3);margin-top:2px">📝 ${item.obs}</div>` : ''}
      </td>
      <td><span class="pill pill-prod" style="font-size:10px">${item.prod || '—'}</span></td>
      <td><span class="pill pill-tipo" style="font-size:10px">${item.tipo || '—'}</span></td>
      <td>${fmtDate(item.dt)}</td>
      <td>${fmt(item.val)}</td>
      <td style="color:var(--blue)">${fmt(da)}</td>
      <td class="val-now-cell"><span class="val-now">${fmt(vc)}</span></td>
      <td style="color:${isAlert && !isPerdido ? 'var(--red)' : 'var(--text2)'}">
        ${isPerdido ? '—' : restMeses + ' meses'}
      </td>
      <td>${statusHtml}</td>
      <td style="white-space:nowrap">
        <button class="btn btn-sm"
          onclick="toggleStatusItem('${item.id}')"
          style="margin-bottom:4px;width:100%;font-size:10px;
            ${isPerdido
              ? 'background:var(--purple-dim);color:var(--purple);border-color:rgba(167,139,250,.3)'
              : 'background:var(--red-dim);color:var(--red);border-color:rgba(255,92,92,.3)'}">
          ${isPerdido ? '📊 Marcar Acomp.' : '⚠️ Marcar Perdido'}
        </button>
        <button class="btn btn-red btn-sm"
          style="width:100%;font-size:10px"
          onclick="remover('${item.id}')">
          Remover
        </button>
      </td>`;
  });

  document.getElementById('inv-total').textContent = fmt(totalDep);
}

// ─────────────────────────────────────────────────────────────
// ADICIONAR ITEM
// ─────────────────────────────────────────────────────────────

/**
 * Lê os campos do formulário da calculadora, valida e salva
 * um novo item no banco de dados.
 *
 * Exposto globalmente para uso nos botões do HTML.
 */
export async function adicionar() {
  // Lê categoria (texto do option selecionado)
  const catEl = document.getElementById('categoria');
  const cat   = catEl.options[catEl.selectedIndex].text;

  const desc   = document.getElementById('descricao').value;
  const prod   = document.getElementById('produto').value;
  const tipo   = document.getElementById('tipo').value;
  const val    = parseFloat(document.getElementById('valor').value);
  const dt     = document.getElementById('data').value;
  const vd     = parseFloat(document.getElementById('vida').value);
  const taxa   = parseFloat(document.getElementById('taxa').value) || 0;
  const res    = getResidualValue();
  const metodo = document.getElementById('metodo').value;

  if (!desc || !val || !dt || !vd) {
    alert('Preencha os campos obrigatórios!');
    return;
  }

  const obs = document.getElementById('status-obs')?.value?.trim() || '';

  const novoItem = {
    cat, desc, prod, tipo, val, dt, vd, taxa, res,
    metodo, status: AppState.itemStatus, obs,
    addedAt: new Date().toISOString(),
  };

  showToast('⏳ Salvando no banco...', 'warning');
  const ok = await salvarItemInventario(novoItem);
  if (!ok) {
    showToast('❌ Erro ao salvar no banco.', 'error');
    return;
  }

  // Recarrega inventário do banco para garantir sincronismo
  await carregarInventario();

  // Registra no histórico local
  AppState.historico.push({
    id:   AppState.inv[0]?.id || Date.now(),
    type: 'add',
    desc, prod, tipo, val, dt,
    ts:   new Date(),
  });
  saveHistLocal();

  updateBadges();
  limpar();
  setSyncStatus('ok', 'Supabase — ' + new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }));
  showToast('✅ Item adicionado ao inventário!', 'success');

  // Renderiza dashboard e inventário se estiverem visíveis
  if (window.renderDashboard) window.renderDashboard();
}

// ─────────────────────────────────────────────────────────────
// REMOVER ITEM
// ─────────────────────────────────────────────────────────────

/**
 * Remove um item do banco e do AppState.
 * Registra a remoção no histórico local.
 *
 * @param {string|number} id - ID do item a remover
 */
export async function remover(id) {
  const item = AppState.inv.find((i) => i.id === id);

  if (item) {
    AppState.historico.push({ id, type: 'remove', desc: item.desc, val: item.val, ts: new Date() });
    saveHistLocal();
  }

  const ok = await removerItemInventario(id);
  if (!ok) { showToast('❌ Erro ao remover item.', 'error'); return; }

  AppState.inv = AppState.inv.filter((i) => i.id !== id);

  updateBadges();
  renderInvTable();
  showToast('🗑️ Item removido!', 'success');

  // Atualiza outras páginas que podem estar visíveis
  if (window.renderDepPage)    window.renderDepPage();
  if (window.renderHistPage)   window.renderHistPage();
  if (window.renderDashboard)  window.renderDashboard();
}

// ─────────────────────────────────────────────────────────────
// TOGGLE STATUS (Acompanhamento ↔ Perdido)
// ─────────────────────────────────────────────────────────────

/**
 * Alterna o status de um item entre 'acompanhamento' e 'perdido'.
 * Se estiver sendo marcado como perdido, solicita observação.
 *
 * @param {string|number} id - ID do item
 */
export async function toggleStatusItem(id) {
  const item = AppState.inv.find((i) => i.id === id);
  if (!item) return;

  let novoStatus, novaObs;

  if (item.status === 'perdido') {
    // Retorna para acompanhamento sem pedir observação
    novoStatus = 'acompanhamento';
    novaObs    = '';
    showToast('📊 Item voltou para Acompanhamento', 'success');
  } else {
    // Confirma e pede observação antes de marcar como perdido
    const obs = prompt('Observação (opcional):');
    if (obs === null) return; // usuário cancelou
    novoStatus = 'perdido';
    novaObs    = obs.trim();
    showToast('⚠️ Item marcado como Perdido / Quebrado', 'warning');
  }

  await atualizarStatusItem(id, novoStatus, novaObs);

  // Atualiza estado local sem precisar recarregar do banco
  item.status = novoStatus;
  item.obs    = novaObs;

  updateBadges();
  renderInvTable();
  if (window.renderDepPage)   window.renderDepPage();
  if (window.renderDashboard) window.renderDashboard();

  // Se o item estava selecionado no painel de acompanhamento, atualiza
  if (AppState.dashSelectedId === id && window._dashAcPick) {
    window._dashAcPick(id);
  }
}

// ─────────────────────────────────────────────────────────────
// RELATÓRIO DE DEPRECIAÇÃO (impressão)
// ─────────────────────────────────────────────────────────────

/**
 * Gera e imprime o relatório completo de depreciação do inventário.
 * Abre uma janela de impressão com layout clean (tema claro).
 */
export function imprimirRelatorio() {
  if (!AppState.inv.length) {
    showToast('Adicione itens ao inventário primeiro.', 'warning');
    return;
  }

  const agora    = new Date().toLocaleString('pt-BR');
  const totalOrig = AppState.inv.reduce((s, i) => s + i.val, 0);
  const totalDep  = AppState.inv.reduce((s, i) => s + calcDep(i).da, 0);
  const totalCont = AppState.inv.reduce((s, i) => s + calcDep(i).vc, 0);
  const totalRes  = AppState.inv.reduce((s, i) => s + (i.res || 0), 0);
  const alerts    = getAlerts(AppState.inv);

  const linhas = AppState.inv.map((item) => {
    const { da, vc, dm, restMeses } = calcDep(item);
    const pct = Math.min(100, (da / item.val) * 100).toFixed(1);

    const statusHtml = restMeses === 0
      ? `<span style="color:#dc2626;font-weight:600">VENCIDO</span>`
      : restMeses <= 12
        ? `<span style="color:#d97706">${restMeses}m</span>`
        : `<span style="color:#16a34a">Ativo</span>`;

    return `<tr>
      <td style="font-weight:500">${item.desc}</td>
      <td>${item.tipo || '—'}</td>
      <td style="text-align:right">R$ ${item.val.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
      <td style="text-align:right;color:#2563eb">R$ ${da.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
      <td style="text-align:right;color:#7c3aed">R$ ${(item.res || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
      <td style="text-align:right;color:#d97706">R$ ${dm.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}/mês</td>
      <td style="text-align:right">${pct}%</td>
      <td style="text-align:right;color:#059669;font-weight:600">R$ ${vc.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
      <td style="text-align:center">${statusHtml}</td>
    </tr>`;
  }).join('');

  const alertasHtml = !alerts.length
    ? '<p style="color:#6b7280;font-size:12px">Nenhum alerta.</p>'
    : alerts.map((item) => {
        const { restMeses } = calcDep(item);
        const isV = restMeses === 0;
        return `<div style="display:flex;justify-content:space-between;padding:7px 12px;margin-bottom:5px;
                  border-radius:6px;background:${isV ? '#fef2f2' : '#fffbeb'};
                  border:1px solid ${isV ? '#fca5a5' : '#fde68a'}">
                  <span style="font-size:12px;font-weight:500">${item.desc}</span>
                  <span style="font-size:12px;font-weight:600;color:${isV ? '#dc2626' : '#d97706'}">
                    ${isV ? 'VENCIDO' : restMeses + ' meses restantes'}
                  </span>
                </div>`;
      }).join('');

  // Injeta HTML na área de impressão e dispara window.print()
  document.getElementById('print-area').innerHTML = `
    <div style="font-family:'DM Sans',Arial,sans-serif;color:#111;max-width:1100px;margin:0 auto">
      <div style="display:flex;justify-content:space-between;margin-bottom:24px;padding-bottom:16px;border-bottom:2px solid #e5e7eb">
        <div>
          <div style="font-size:22px;font-weight:700">PatrimônioGest</div>
          <div style="font-size:13px;color:#6b7280">Relatório de Depreciação</div>
        </div>
        <div style="text-align:right;font-size:11px;color:#9ca3af">
          Gerado em: <strong>${agora}</strong><br>Total: <strong>${AppState.inv.length} bens</strong>
        </div>
      </div>
      <!-- KPIs -->
      <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:24px">
        <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:12px">
          <div style="font-size:10px;color:#6b7280;text-transform:uppercase;margin-bottom:4px">Valor Total Original</div>
          <div style="font-size:18px;font-weight:700;color:#16a34a">R$ ${totalOrig.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</div>
        </div>
        <div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;padding:12px">
          <div style="font-size:10px;color:#6b7280;text-transform:uppercase;margin-bottom:4px">Dep. Acumulada</div>
          <div style="font-size:18px;font-weight:700;color:#2563eb">R$ ${totalDep.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</div>
        </div>
        <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:12px">
          <div style="font-size:10px;color:#6b7280;text-transform:uppercase;margin-bottom:4px">Valor Atual Total</div>
          <div style="font-size:18px;font-weight:700;color:#059669">R$ ${totalCont.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</div>
        </div>
        <div style="background:#faf5ff;border:1px solid #e9d5ff;border-radius:8px;padding:12px">
          <div style="font-size:10px;color:#6b7280;text-transform:uppercase;margin-bottom:4px">Total Residual</div>
          <div style="font-size:18px;font-weight:700;color:#7c3aed">R$ ${totalRes.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</div>
        </div>
      </div>
      <!-- Alertas -->
      <div style="margin-bottom:24px">
        <div style="font-size:13px;font-weight:600;margin-bottom:10px">⚠️ Alertas (${alerts.length})</div>
        ${alertasHtml}
      </div>
      <!-- Tabela -->
      <table style="width:100%;border-collapse:collapse;font-size:11px">
        <thead>
          <tr style="background:#f9fafb">
            <th style="padding:8px;text-align:left;border-bottom:2px solid #e5e7eb">Bem</th>
            <th style="padding:8px;border-bottom:2px solid #e5e7eb">Tipo</th>
            <th style="padding:8px;text-align:right;border-bottom:2px solid #e5e7eb">Valor Original</th>
            <th style="padding:8px;text-align:right;border-bottom:2px solid #e5e7eb">Dep. Acum.</th>
            <th style="padding:8px;text-align:right;border-bottom:2px solid #e5e7eb">Val. Residual</th>
            <th style="padding:8px;text-align:right;border-bottom:2px solid #e5e7eb">Dep. Mensal</th>
            <th style="padding:8px;text-align:right;border-bottom:2px solid #e5e7eb">% Dep.</th>
            <th style="padding:8px;text-align:right;border-bottom:2px solid #e5e7eb;color:#059669">Valor Atual</th>
            <th style="padding:8px;text-align:center;border-bottom:2px solid #e5e7eb">Status</th>
          </tr>
        </thead>
        <tbody>${linhas}</tbody>
        <tfoot>
          <tr style="background:#f9fafb;font-weight:600">
            <td colspan="2" style="padding:8px;border-top:2px solid #e5e7eb">TOTAIS</td>
            <td style="padding:8px;text-align:right;border-top:2px solid #e5e7eb">R$ ${totalOrig.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
            <td style="padding:8px;text-align:right;border-top:2px solid #e5e7eb;color:#2563eb">R$ ${totalDep.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
            <td style="padding:8px;text-align:right;border-top:2px solid #e5e7eb;color:#7c3aed">R$ ${totalRes.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
            <td colspan="2" style="border-top:2px solid #e5e7eb"></td>
            <td style="padding:8px;text-align:right;border-top:2px solid #e5e7eb;color:#059669">R$ ${totalCont.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
            <td style="border-top:2px solid #e5e7eb"></td>
          </tr>
        </tfoot>
      </table>
      <div style="margin-top:24px;padding-top:12px;border-top:1px solid #e5e7eb;font-size:10px;color:#9ca3af;display:flex;justify-content:space-between">
        <span>PatrimônioGest v2.4</span><span>${agora}</span>
      </div>
    </div>`;

  document.getElementById('print-area').style.display = 'block';
  setTimeout(() => {
    window.print();
    setTimeout(() => (document.getElementById('print-area').style.display = 'none'), 500);
  }, 200);
}