/**
 * Component Loader
 * Carrega fragmentos HTML em containers. Suporta carregamento lazy (data-load="lazy").
 */
let cachedBasePath = null;

function resolveComponentBasePath() {
    if (cachedBasePath) return cachedBasePath;

    const script = document.currentScript;
    if (script && script.src) {
        const src = script.src;
        if (src.includes('/js/')) {
            cachedBasePath = '/componentes/';
            return cachedBasePath;
        }
        if (src.includes('../js/')) {
            cachedBasePath = '../componentes/';
            return cachedBasePath;
        }
    }

    const scripts = document.getElementsByTagName('script');
    for (let i = scripts.length - 1; i >= 0; i--) {
        const s = scripts[i];
        if (s.src && s.src.includes('components-loader.js')) {
            const src = s.src;
            if (src.includes('/js/')) {
                cachedBasePath = '/componentes/';
                return cachedBasePath;
            }
            if (src.includes('../js/')) {
                cachedBasePath = '../componentes/';
                return cachedBasePath;
            }
            break;
        }
    }

    cachedBasePath = '/componentes/';
    return cachedBasePath;
}

const inflightPromises = new Map();

async function loadComponent(componentName, targetElement) {
    const key = `${componentName}|${targetElement}`;
    if (inflightPromises.has(key)) {
        return inflightPromises.get(key);
    }

    const run = (async () => {
        try {
            const basePath = resolveComponentBasePath();
            const componentPath = `${basePath}${componentName}.html`;

            let response = await fetch(componentPath);
            if (!response.ok) {
                const altPath = basePath === '/componentes/' ? '../componentes/' : '/componentes/';
                response = await fetch(`${altPath}${componentName}.html`);
                if (!response.ok) {
                    throw new Error(`Erro ao carregar componente: ${componentName}`);
                }
            }

            const html = await response.text();
            const target = document.querySelector(targetElement);
            if (target) {
                target.innerHTML = html;
                target.setAttribute('data-component-loaded', '1');
            } else {
                console.error(`Elemento não encontrado: ${targetElement}`);
            }
        } catch (error) {
            console.error(`Erro ao carregar componente ${componentName}:`, error);
        }
    })();

    inflightPromises.set(key, run);
    try {
        await run;
    } finally {
        inflightPromises.delete(key);
    }
}

/**
 * Garante que o fragmento foi injetado (idempotente). Usado em modais com data-load="lazy".
 */
async function ensureComponentLoaded(componentName, targetSelector) {
    const target = document.querySelector(targetSelector);
    if (!target) {
        console.warn('ensureComponentLoaded: elemento não encontrado:', targetSelector);
        return;
    }
    if (target.getAttribute('data-component-loaded') === '1') {
        return;
    }
    await loadComponent(componentName, targetSelector);
}

window.ensureComponentLoaded = ensureComponentLoaded;
window.loadComponent = loadComponent;

function showWarningModal(title, message) {
    const titleElement = document.getElementById('warningModalTitle');
    const messageElement = document.getElementById('warningMessage');
    const modal = document.getElementById('warningModal');

    if (titleElement) titleElement.textContent = title || '⚠️ Aviso';
    if (messageElement) messageElement.textContent = message || 'Mensagem de aviso';
    if (modal) modal.style.display = 'flex';
}

function closeWarningModal() {
    const modal = document.getElementById('warningModal');
    if (modal) modal.style.display = 'none';
}

document.addEventListener('DOMContentLoaded', function () {
    const footerContainer = document.getElementById('footer-container');
    if (footerContainer && footerContainer.getAttribute('data-load') !== 'lazy') {
        loadComponent('footer', '#footer-container');
    }

    const modalsToLoad = [
        { name: 'modal-aviso', container: 'modal-aviso-container' },
        { name: 'modal-confirmacao', container: 'modal-confirmacao-container' },
        { name: 'modal-ia', container: 'modal-ia-container' },
        { name: 'modal-deletar-casos-teste', container: 'modal-deletar-casos-teste-container' },
        { name: 'modal-criar-casos-teste', container: 'modal-criar-casos-teste-container' },
        { name: 'modal-executar-testes', container: 'modal-executar-testes-container' },
        { name: 'modal-resumo', container: 'modal-resumo-container' },
        { name: 'modal-editar-titulo', container: 'modal-editar-titulo-container' },
        { name: 'modal-estatisticas', container: 'modal-estatisticas-container' },
        { name: 'modal-duplicar-documentacao', container: 'modal-duplicar-documentacao-container' },
        { name: 'modal-senha-admin', container: 'modal-senha-admin-container' },
        { name: 'modal-revisao-flags', container: 'modal-revisao-flags-container' },
        { name: 'modal-comparar-historico', container: 'modal-comparar-historico-container' }
    ];

    const eagerTasks = [];

    modalsToLoad.forEach((modal) => {
        const container = document.getElementById(modal.container);
        if (!container) return;
        if (container.getAttribute('data-load') === 'lazy') {
            return;
        }
        eagerTasks.push(loadComponent(modal.name, `#${modal.container}`));
    });

    if (eagerTasks.length > 0) {
        Promise.allSettled(eagerTasks).catch(() => {});
    }
});
