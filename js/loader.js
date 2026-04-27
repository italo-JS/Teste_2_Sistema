/**
 * loader.js — PatriX Component Loader
 *
 * Responsabilidade única: buscar cada fragmento HTML via fetch(),
 * injetá-lo no DOM na posição correta e, após tudo carregado,
 * inicializar o módulo principal (app.js).
 *
 * Ordem de carregamento:
 *   1. Estrutura (sidebar + topbar) — em paralelo
 *   2. Páginas — em paralelo
 *   3. Modais — em paralelo
 *   4. app.js — inserido dinamicamente como <script type="module">
 */

(async function () {

  /* ── Helpers ──────────────────────────────────────────────── */

  async function fetchHTML(url) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Falha ao carregar: ${url} (${res.status})`);
    return res.text();
  }

  /**
   * Substitui o elemento com o id informado pelo HTML buscado.
   * Útil para placeholders como <div id="sidebar-placeholder">.
   */
  async function replaceById(id, url) {
    const el = document.getElementById(id);
    if (!el) { console.warn(`[loader] Elemento #${id} não encontrado`); return; }
    const html = await fetchHTML(url);
    const temp = document.createElement('div');
    temp.innerHTML = html;
    el.replaceWith(...temp.childNodes);
  }

  /**
   * Adiciona o HTML buscado ao final do elemento com o id informado.
   * Útil para o container de páginas (pages-container).
   */
  async function appendToId(id, url) {
    const el = document.getElementById(id);
    if (!el) { console.warn(`[loader] Elemento #${id} não encontrado`); return; }
    const html = await fetchHTML(url);
    el.insertAdjacentHTML('beforeend', html);
  }

  /**
   * Adiciona o HTML buscado ao final do <body>.
   * Útil para modais.
   */
  async function appendToBody(url) {
    const html = await fetchHTML(url);
    document.body.insertAdjacentHTML('beforeend', html);
  }

  /* ── Listas de componentes ────────────────────────────────── */

  const PAGES = [
    './pages/page-dashboard.html',
    './pages/page-calculadora.html',
    './pages/page-inventario.html',
    './pages/page-depreciacao.html',
    './pages/page-mensal.html',
    './pages/page-historico.html',
    './pages/page-monitoramento.html',
    './pages/page-epi.html',
    './pages/page-configuracoes.html',
  ];

  const MODALS = [
    './modals/modal-epi-novo.html',
    './modals/modal-epi-relatorio.html',
    './modals/modal-monitoramento.html',
  ];

  /* ── Pipeline de injeção ──────────────────────────────────── */

  try {
    // 1) Estrutura base (sidebar + topbar) — paralelo
    await Promise.all([
      replaceById('sidebar-placeholder', './components/sidebar.html'),
      replaceById('topbar-placeholder',  './components/topbar.html'),
    ]);

    // 2) Páginas — paralelo
    await Promise.all(PAGES.map(f => appendToId('pages-container', f)));

    // 3) Modais — paralelo
    await Promise.all(MODALS.map(f => appendToBody(f)));

    // 4) Inicializa app.js após todos os componentes estarem no DOM
    const appScript = document.createElement('script');
    appScript.type = 'module';
    appScript.src  = 'Sistema_Patrix/app.js';
    document.body.appendChild(appScript);

  } catch (err) {
    console.error('[loader] Erro:', err);

    // Exibe mensagem de erro no overlay de loading
    const overlay = document.getElementById('loading-overlay');
    if (overlay) {
      overlay.innerHTML = `
        <div style="color:#ff5c5c;text-align:center;padding:24px">
          <div style="font-size:32px;margin-bottom:12px">⚠️</div>
          <div style="font-size:15px;font-weight:600;margin-bottom:6px">Erro ao carregar componentes</div>
          <div style="font-size:12px;opacity:.7">${err.message}</div>
          <div style="font-size:11px;opacity:.5;margin-top:8px">
            Verifique se está usando um servidor local (Live Server / http-server).
          </div>
        </div>`;
    }
  }

})();
