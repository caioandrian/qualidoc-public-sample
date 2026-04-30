let cenarios = [];
let cenarioId = 1;
let cenarioAtual = 1;
let cenariosFiltrados = [];
let termoPesquisa = '';
let tipoFiltroSelecionado = ''; // Armazena o tipo de teste selecionado no filtro
let bugs = [];
let bugId = 1;
let itensSelecionadosDelete = new Set(); // Para manter itens selecionados no modal de deletar em massa
let itensSelecionadosDuplicatas = new Set(); // Para manter itens selecionados no modal de duplicatas
let paginaAtualDelete = 0; // Para controlar a paginação do modal de deletar
let statusOriginais = null; // Armazena os status originais antes das alterações
let flagRestaurarStatus = true; // Flag para controlar se deve restaurar status ao fechar modal
let cenariosGeradosIA = []; // Armazena os cenários gerados pela IA
let testTypeGeracaoIA = 'funcional'; // Armazena o tipo de teste usado na última geração
let usandoInformacoesAdicionais = false; // Flag para controlar se estamos gerando com informações adicionais
let textoAdicionalAplicado = ''; // Armazena o texto adicional que será adicionado à descrição
let arquivosParaDeletar = []; // Array para armazenar arquivos que devem ser deletados ao salvar
let arquivosParaUpload = []; // Array para armazenar arquivos pendentes de upload (não enviados ainda)

// ==================== FUNÇÕES DE BACKUP ====================

/**
 * Coleta todos os dados da documentação no mesmo formato usado no template.html
 * @returns {Object} Objeto com todos os dados da documentação
 */
function coletarDadosDocumentacao() {
    const nomeFeature = document.querySelector('.feature-input')?.value || 'Feature_Sem_Nome';
    const featureId = document.getElementById('feature-id')?.value || '';
    const modoRoteiro = document.getElementById('modo-teste')?.value === 'sim';
    const creationDate = document.getElementById('data')?.value || new Date().toISOString().split('T')[0];
    const updateDate = document.getElementById('ultima-atualizacao')?.value || new Date().toISOString().split('T')[0];
    const featureDescription = document.getElementById('feature-text')?.value || '';
    // Recuperar resumo da descrição do produto do localStorage
    const resumoDescricaoProduto = localStorage.getItem('resumoDescricaoProduto') || null;
    
    // Recuperar ct_aplicadosIA do localStorage (por padrão false)
    const ctAplicadosIA = localStorage.getItem('ct_aplicadosIA') === 'true';
    
    // Coletar dados no mesmo formato do template.html
    const dadosBackup = {
        id: featureId, // Hash ID da feature (pode ser temporário se ainda não salvo)
        featureName: nomeFeature,
        jiraLink: document.getElementById('jira-link')?.value || '',
        creationDate: creationDate,
        updateDate: updateDate,
        testRoutine: modoRoteiro,
        environment: document.getElementById('ambiente')?.value || '',
        tester: document.getElementById('testador')?.value || '',
        squad: document.getElementById('squad')?.value || '',
        browser: document.getElementById('navegador')?.value || '',
        device: document.getElementById('dispositivo')?.value || '',
        observacao: document.getElementById('observacao')?.value || '',
        featureDescription: featureDescription,
        resumoDescricaoProduto: resumoDescricaoProduto, // Resumo da descrição do produto gerado pela IA
        ct_aplicadosIA: ctAplicadosIA, // Flag indicando se CTs foram aplicados pela IA
        testType: document.getElementById('ai-test-type')?.value || 'funcional',
        imagens_selecionadas: Array.from(savedImagesSelected || []),
        // Coletar coberturas APENAS se a documentação já existe (tem ID válido)
        // Para novas documentações, não coletar coberturas do localStorage
        coberturas: (featureId && featureId !== '' && featureId !== 'null' && featureId !== null && typeof coletarCoberturasLocalStorage === 'function') 
            ? coletarCoberturasLocalStorage() 
            : {},
        status: 'criado',
        cenarios: cenarios.map(cenario => ({
            id: cenario.id,
            titulo: cenario.titulo || '',
            precondicoes: cenario.precondicoes || '',
            passos: cenario.passos || '',
            resultadoEsperado: cenario.resultadoEsperado || '',
            status: cenario.status || 'na',
            arquivos: cenario.arquivos ? cenario.arquivos.map(arquivo => {
                // Normalizar arquivos para manter apenas informações essenciais
                if (typeof arquivo === 'string') {
                    return arquivo;
                }
                return {
                    nome: arquivo.nome || arquivo,
                    tamanho: arquivo.tamanho || 0,
                    tipo: arquivo.tipo || '',
                    data: arquivo.data || new Date().toISOString()
                };
            }) : [],
            posicao: cenario.posicao || 0,
            fonte: cenario.fonte || 'Usuário',
            tipo: cenario.tipo || 'funcional'
        })),
        bugs: bugs.map(bug => ({
            id: bug.id || '',
            cenarioId: bug.cenarioId || null,
            descricao: bug.descricao || '',
            linkJira: bug.linkJira || '',
            status: bug.status || 'aberto',
            data: bug.data || new Date().toISOString().split('T')[0],
            salvo: bug.salvo || false
        })),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
    };
    
    return dadosBackup;
}

/**
 * Salva backup da documentação no localStorage
 * @param {{ marcarAlteracoes?: boolean }} [opcoes] - Se marcarAlteracoes for false, não define temAlteracoesNaoSalvas (ex.: após carregar documento do servidor em modo edição)
 */
function salvarBackupLocalStorage(opcoes = {}) {
    const marcarAlteracoes = opcoes.marcarAlteracoes !== false;
    try {
        // Sempre salvar backup no localStorage (removida verificação da flag recuperadorDados)
        const dadosBackup = coletarDadosDocumentacao();

        // pendenteRecuperacao: usado na index pelo "Recuperador Dados Não Salvos".
        // true = usuário alterou algo desde o último espelho; false = só espelho pós-servidor/regra sem marcar alteração.
        // Ao regravar com marcarAlteracoes false, preservar true se já existia para o mesmo ID (ex.: setTimeout após load).
        let pendenteRecuperacao;
        if (marcarAlteracoes) {
            pendenteRecuperacao = true;
        } else {
            let preservarPendente = false;
            try {
                const raw = localStorage.getItem('backup');
                if (raw) {
                    const anterior = JSON.parse(raw);
                    if (anterior.pendenteRecuperacao === true && anterior.id === dadosBackup.id) {
                        preservarPendente = true;
                    }
                }
            } catch (e) {
                /* ignore */
            }
            pendenteRecuperacao = preservarPendente;
        }
        dadosBackup.pendenteRecuperacao = pendenteRecuperacao;

        localStorage.setItem('backup', JSON.stringify(dadosBackup));
        console.log('💾 Backup salvo no localStorage:', {
            featureId: dadosBackup.id,
            featureName: dadosBackup.featureName,
            cenarios: dadosBackup.cenarios.length,
            bugs: dadosBackup.bugs.length,
            pendenteRecuperacao: dadosBackup.pendenteRecuperacao
        });
        
        if (marcarAlteracoes) {
            // Marcar alterações não salvas quando o backup reflete edição do usuário
            marcarAlteracoesNaoSalvas();
        }
    } catch (error) {
        console.error('❌ Erro ao salvar backup no localStorage:', error);
    }
}

/**
 * Limpa o backup do localStorage
 */
function limparBackupLocalStorage() {
    try {
        localStorage.removeItem('backup');
        console.log('🗑️ Backup limpo do localStorage');
    } catch (error) {
        console.error('❌ Erro ao limpar backup do localStorage:', error);
    }
}

/**
 * Limpa o localStorage voltando à index: mantém o backup e todas as chaves qualiDoc_ls_v1:* (dados da API client-side).
 * Usado ao voltar para index.html após salvar ou ao carregar a index conforme o fluxo da página.
 */
function limparLocalStorageExcetoBackup() {
    try {
        const backup = localStorage.getItem('backup');
        const lsPrefix = (typeof window !== 'undefined' && window.__QUALIDOC_LS_PREFIX__) || 'qualiDoc_ls_v1:';
        const preserved = {};
        for (let i = 0; i < localStorage.length; i++) {
            const k = localStorage.key(i);
            if (k && k.indexOf(lsPrefix) === 0) {
                preserved[k] = localStorage.getItem(k);
            }
        }

        localStorage.clear();

        Object.keys(preserved).forEach(function (k) {
            localStorage.setItem(k, preserved[k]);
        });

        if (backup) {
            localStorage.setItem('backup', backup);
            console.log('✅ localStorage limpo, mantendo backup e dados qualiDoc_ls_v1');
        } else {
            console.log('✅ localStorage limpo (mantidos dados qualiDoc_ls_v1; sem backup)');
        }
        
        // Garantir que ct_aplicadosIA seja sempre false ao acessar a index
        localStorage.setItem('ct_aplicadosIA', 'false');
        // Resetar descricaoProdutoAtualizada para false ao voltar para index
        localStorage.setItem('descricaoProdutoAtualizada', 'false');
        // Limpar novoResumoDescricaoProduto ao voltar para index
        localStorage.removeItem('novoResumoDescricaoProduto');
        console.log('✅ ct_aplicadosIA definido como false ao acessar index');
        console.log('✅ descricaoProdutoAtualizada resetado para false e novoResumoDescricaoProduto limpo ao voltar para index');
    } catch (error) {
        console.error('❌ Erro ao limpar localStorage:', error);
    }
}

/**
 * Restaura os dados do backup no formulário
 */
function restaurarDadosDoBackup(backupData) {
    try {
        // Restaurar nome da feature
        const featureInput = document.querySelector('.feature-input');
        if (featureInput && backupData.featureName) {
            featureInput.value = backupData.featureName;
        }
        
        // Restaurar feature-id
        const featureIdInput = document.getElementById('feature-id');
        if (featureIdInput && backupData.id) {
            featureIdInput.value = backupData.id;
        }
        
        // Restaurar data de criação
        const dataField = document.getElementById('data');
        if (dataField && backupData.creationDate) {
            dataField.value = backupData.creationDate;
        }
        
        // Restaurar última atualização
        const ultimaAtualizacaoField = document.getElementById('ultima-atualizacao');
        if (ultimaAtualizacaoField && backupData.updateDate) {
            ultimaAtualizacaoField.value = backupData.updateDate;
        }
        
        // Restaurar modo-teste
        const modoTesteField = document.getElementById('modo-teste');
        if (modoTesteField) {
            modoTesteField.value = backupData.testRoutine ? 'sim' : 'nao';
            if (typeof window.toggleGlobalChecklistMode === 'function') {
                window.toggleGlobalChecklistMode();
            }
        }
        
        // Restaurar campos de informação
        if (backupData.environment) {
            const ambienteField = document.getElementById('ambiente');
            if (ambienteField) ambienteField.value = backupData.environment;
        }
        
        if (backupData.tester) {
            const testadorField = document.getElementById('testador');
            if (testadorField) testadorField.value = backupData.tester;
        }
        
        if (backupData.browser) {
            const navegadorField = document.getElementById('navegador');
            if (navegadorField) navegadorField.value = backupData.browser;
        }
        
        if (backupData.device) {
            const dispositivoField = document.getElementById('dispositivo');
            if (dispositivoField) dispositivoField.value = backupData.device;
        }
        
        if (backupData.squad) {
            const squadField = document.getElementById('squad');
            if (squadField) squadField.value = backupData.squad;
        }
        
        if (backupData.jiraLink) {
            const jiraLinkField = document.getElementById('jira-link');
            if (jiraLinkField) jiraLinkField.value = backupData.jiraLink;
        }
        
        if (backupData.observacao !== undefined) {
            const observacaoField = document.getElementById('observacao');
            if (observacaoField) observacaoField.value = backupData.observacao || '';
        }
        
        if (backupData.featureDescription) {
            const featureTextField = document.getElementById('feature-text');
            if (featureTextField) featureTextField.value = backupData.featureDescription;
        }
        
        // Restaurar resumo da descrição do produto no localStorage
        if (backupData.resumoDescricaoProduto) {
            localStorage.setItem('resumoDescricaoProduto', backupData.resumoDescricaoProduto);
            console.log('✅ Resumo da descrição do produto restaurado do backup');
        }
        
        if (backupData.testType) {
            const testTypeField = document.getElementById('ai-test-type');
            if (testTypeField) testTypeField.value = backupData.testType;
        }
        
        // Restaurar cenários
        if (backupData.cenarios && Array.isArray(backupData.cenarios)) {
            cenarios = backupData.cenarios.map(c => ({
                ...c,
                arquivos: c.arquivos || []
            }));
            cenarioId = cenarios.length > 0 ? Math.max(...cenarios.map(c => c.id)) + 1 : 1;
            aplicarFiltros();
            renderizarCenarios();
            atualizarTabs();
            atualizarContadores();
            atualizarBotoesNavegacao();
            atualizarBotaoRemover();
            atualizarSumario();
            atualizarBotaoSalvar();
        }
        
        // Restaurar bugs
        if (backupData.bugs && Array.isArray(backupData.bugs)) {
            bugs = backupData.bugs;
            bugId = bugs.length > 0 ? Math.max(...bugs.map(b => {
                const match = b.id ? b.id.match(/\d+/) : null;
                return match ? parseInt(match[0]) : 0;
            })) + 1 : 1;
            renderizarBugs();
        }
        
        // Restaurar imagens selecionadas
        if (backupData.imagens_selecionadas && Array.isArray(backupData.imagens_selecionadas)) {
            savedImagesSelected = new Set(backupData.imagens_selecionadas);
        }
        
        // Restaurar coberturas APENAS se a documentação já existe (tem ID válido)
        // Não restaurar coberturas para novas documentações
        if (backupData.id && backupData.id !== '' && backupData.id !== 'null' && backupData.id !== null) {
            if (backupData.coberturas && typeof backupData.coberturas === 'object') {
                if (typeof restaurarCoberturasLocalStorage === 'function') {
                    restaurarCoberturasLocalStorage(backupData.coberturas);
                }
            }
        } else {
            console.log('📊 Nova documentação detectada - coberturas não serão restauradas do backup');
        }
        
        // Mostrar seções necessárias
        const infoSection = document.getElementById('info-section');
        if (infoSection && featureInput && featureInput.value) {
            infoSection.classList.remove('hidden-section');
            infoSection.style.display = 'block';
        }
        
        const testCasesSection = document.getElementById('test-cases-section');
        if (testCasesSection) {
            testCasesSection.classList.remove('hidden-section');
            testCasesSection.style.display = 'block';
        }
        
        const observacaoSection = document.getElementById('observacao-section');
        if (observacaoSection) {
            observacaoSection.classList.remove('hidden-section');
            observacaoSection.style.display = 'block';
        }
        
        console.log('✅ Dados do backup restaurados com sucesso');
    } catch (error) {
        console.error('❌ Erro ao restaurar dados do backup:', error);
    }
}

// ==================== FIM DAS FUNÇÕES DE BACKUP ====================

// Inicializar com um cenário padrão
function inicializar() {
    // Não adicionar cenário automaticamente - mostrar mensagem inicial
    renderizarCenarios();
    atualizarTabs();
    atualizarContadores();
    atualizarBotoesNavegacao();
    atualizarBotaoRemover();
    atualizarSumario();
    atualizarBotaoSalvar();
}

function adicionarCenario() {
    const id = cenarioId++;
    const novoCenario = {
        id: id,
        titulo: `CT${String(id).padStart(3, '0')} - Sem Título`,
        precondicoes: '',
        passos: '',
        resultadoEsperado: '',
        status: 'na',
        arquivos: [],
        posicao: cenarios.length + 1,
        fonte: 'Usuário',
        tipo: 'funcional' // Usar 'funcional' como padrão para CTs criados pelo usuário
    };
    
    cenarios.push(novoCenario);
    // Aplicar filtros para atualizar cenariosFiltrados
    aplicarFiltros();
    
    // Se o novo cenário passou pelo filtro, ir para ele, senão ir para o último
    const indexFiltrado = cenariosFiltrados.findIndex(c => c.id === novoCenario.id);
    if (indexFiltrado !== -1) {
        cenarioAtual = indexFiltrado + 1;
    } else {
        cenarioAtual = cenariosFiltrados.length > 0 ? cenariosFiltrados.length : 1;
    }
    
    // Garantir que o cenário atual seja válido
    if (cenarioAtual > cenariosFiltrados.length) {
        cenarioAtual = cenariosFiltrados.length;
    }
    if (cenarioAtual < 1 && cenariosFiltrados.length > 0) {
        cenarioAtual = 1;
    }
    
    renderizarCenarios();
    atualizarTabs();
    atualizarContadores();
    atualizarBotoesNavegacao();
    atualizarBotaoRemover();
    atualizarSumario();
    atualizarBotaoSalvar();
    
    // Atualizar visibilidade do botão de resumo
    if (typeof atualizarVisibilidadeBotaoResumo === 'function') {
        atualizarVisibilidadeBotaoResumo();
    }
    
    // Salvar backup após adicionar cenário
    salvarBackupLocalStorage();
    
    // Atualizar estado do botão de avaliação após adicionar CT
    if (typeof atualizarEstadoGeracaoIA === 'function') {
        atualizarEstadoGeracaoIA();
    }
}

function removerCenarioSelecionado() {
    if (cenariosFiltrados.length === 0 || cenarioAtual < 1) {
        alert('Nenhum cenário selecionado para remover.');
        return;
    }

    const cenarioSelecionado = cenariosFiltrados[cenarioAtual - 1];
    if (!cenarioSelecionado) {
        alert('Cenário não encontrado.');
        return;
    }
    

    // Preparar informações do CT para o modal
    const ctInfo = {
        titulo: cenarioSelecionado.titulo || `CT${String(cenarioSelecionado.id).padStart(3, '0')} - Sem Título`,
        status: cenarioSelecionado.status || 'N/A'
    };

    // Mostrar modal de confirmação
    showDeleteCTModal(async () => {
        // Função que será executada quando o usuário confirmar
        
        // Primeiro, remover arquivos pendentes de upload para este CT (não enviar se o CT foi deletado)
        const arquivosPendentesRemovidos = arquivosParaUpload.filter(a => a.cenarioId === cenarioSelecionado.id);
        if (arquivosPendentesRemovidos.length > 0) {
            console.log(`🗑️ Removendo ${arquivosPendentesRemovidos.length} arquivo(s) pendente(s) do CT ${cenarioSelecionado.id}`);
            arquivosParaUpload = arquivosParaUpload.filter(a => a.cenarioId !== cenarioSelecionado.id);
        }
        
        // Marcar anexos para deleção posterior (não deletar imediatamente)
        if (cenarioSelecionado.arquivos && cenarioSelecionado.arquivos.length > 0) {
            console.log(`📋 Marcando ${cenarioSelecionado.arquivos.length} anexo(s) do cenário ${cenarioSelecionado.id} para deleção`);
            
            let anexosMarcados = 0;
            // Marcar cada arquivo para deleção
            for (const arquivo of cenarioSelecionado.arquivos) {
                // Ignorar arquivos pendentes (já foram removidos do array acima)
                if (arquivo.pendente) {
                    continue;
                }
                
                // Usar arquivo.nome que já vem no formato HASHID_CT001.extensao
                const nomeArquivo = arquivo.nome;
                console.log(`📋 Marcando anexo do CT ${cenarioSelecionado.id} para deleção: ${nomeArquivo}`);
                
                // Adicionar à lista de arquivos para deletar (será deletado quando salvar)
                if (!arquivosParaDeletar.includes(nomeArquivo)) {
                    arquivosParaDeletar.push(nomeArquivo);
                    anexosMarcados++;
                    console.log(`✅ Anexo marcado para deleção: ${nomeArquivo}`);
                }
            }
            
            if (anexosMarcados > 0) {
                console.log(`📋 ${anexosMarcados} anexo(s) marcado(s) para deleção ao salvar do CT ${cenarioSelecionado.id}`);
            }
        }

        // Remover do array original
        const indexOriginal = cenarios.findIndex(c => c.id === cenarioSelecionado.id);
        if (indexOriginal !== -1) {
            cenarios.splice(indexOriginal, 1);
        }

        // Remover do array filtrado baseado no ID, não na posição
        const indexFiltrado = cenariosFiltrados.findIndex(c => c.id === cenarioSelecionado.id);
        if (indexFiltrado !== -1) {
            cenariosFiltrados.splice(indexFiltrado, 1);
        }

        // Ajustar cenário atual após remoção
        if (cenariosFiltrados.length === 0) {
            cenarioAtual = 0;
        } else {
            // O cenário atual foi removido, ajustar para manter a posição relativa
            // Se estávamos na posição 5 e removemos o cenário, ficamos na posição 5
            // mas agora o cenário que estava na posição 6 passou para a posição 5
            if (cenarioAtual > cenariosFiltrados.length) {
                // Se a posição atual é maior que o total, ir para o último
                cenarioAtual = cenariosFiltrados.length;
            }
            // Se cenarioAtual <= cenariosFiltrados.length, manter a posição
            // (o cenário que estava na próxima posição agora ocupa a posição atual)
        }
        

        renderizarCenarios();
        atualizarTabs();
        atualizarContadores();
        atualizarBotoesNavegacao();
        atualizarBotaoRemover();
        atualizarSumario();
        atualizarBotaoSalvar();
        
        // Atualizar visibilidade do botão de resumo
        if (typeof atualizarVisibilidadeBotaoResumo === 'function') {
            atualizarVisibilidadeBotaoResumo();
        }
        
        // Salvar backup após remover cenário
        salvarBackupLocalStorage();
        
        // Atualizar estado do botão e campo de geração IA após deletar caso de teste
        // Isso também atualiza o botão de avaliação
        if (typeof atualizarEstadoGeracaoIA === 'function') {
            atualizarEstadoGeracaoIA();
        }
        
        // Limpar cobertura do tipo específico do CT deletado do localStorage
        const tipoCT = cenarioSelecionado.tipo || 'funcional';
        limparCoberturaTipoLocalStorage(tipoCT);
    }, ctInfo);
}

function renderizarCenarios() {
    console.log('🎨 renderizarCenarios() chamado. Cenários status:', cenarios.map(c => `CT${c.id}:${c.status}`));
    
    // Listar todos os CTs com todas as informações no console
    console.log('📋 Lista completa de todos os CTs:');
    console.table(cenarios.map(c => ({
        id: c.id,
        titulo: c.titulo || 'Sem Título',
        fonte: c.fonte || 'Usuário',
        tipo: c.tipo || 'funcional',
        status: c.status || 'na',
        posicao: c.posicao || 0,
        precondicoes: c.precondicoes ? (c.precondicoes.substring(0, 50) + '...') : '',
        passos: c.passos ? (c.passos.substring(0, 50) + '...') : '',
        resultadoEsperado: c.resultadoEsperado ? (c.resultadoEsperado.substring(0, 50) + '...') : '',
        arquivos: c.arquivos ? c.arquivos.length : 0,
        bugs: c.bugs ? c.bugs.length : 0
    })));
    
    // Log detalhado de cada CT
    console.log('📝 Detalhes completos de cada CT:');
    cenarios.forEach((c, index) => {
        console.log(`\nCT ${index + 1} (ID: ${c.id}):`, {
            titulo: c.titulo,
            fonte: c.fonte || 'Usuário',
            tipo: c.tipo || 'funcional',
            status: c.status || 'na',
            posicao: c.posicao || 0,
            precondicoes: c.precondicoes || '',
            passos: c.passos || '',
            resultadoEsperado: c.resultadoEsperado || '',
            arquivos: c.arquivos || [],
            bugs: c.bugs || [],
            ...c // Incluir todas as outras propriedades
        });
    });
    
    const container = document.getElementById('test-scenarios-container');
    const noCtMessage = document.getElementById('no-ct-message');
    const scenarioTabs = document.getElementById('scenario-tabs');
    const navigationControls = document.querySelector('.navigation-controls');
    
    if (!container) {
        console.error('❌ Container test-scenarios-container não encontrado');
        return;
    }

    // Controlar visibilidade das seções baseado na quantidade de CTs
    if (cenariosFiltrados.length > 0) {
        // Mostrar seções de CT e ocultar mensagem inicial
        if (scenarioTabs) scenarioTabs.classList.add('visible');
        if (container) container.classList.add('visible');
        if (navigationControls) navigationControls.classList.add('visible');
        if (noCtMessage) noCtMessage.style.display = 'none';
        
        // Verificar se já existe um formulário ativo
        let existingForm = container.querySelector('.test-case');
        
        if (cenarioAtual > 0 && cenarioAtual <= cenariosFiltrados.length) {
            const cenario = cenariosFiltrados[cenarioAtual - 1];
            
            if (existingForm) {
                // AJAX-like: Atualizar dados do formulário existente sem recriar
                atualizarFormularioExistente(existingForm, cenario);
            } else {
                // Primeira vez: Criar formulário
                const cenarioHtml = criarCenarioHtml(cenario);
                container.innerHTML = cenarioHtml;
                existingForm = container.querySelector('.test-case');
            }
            
            // Aplicar transições suaves
            setTimeout(() => {
                if (existingForm) {
                    existingForm.classList.add('active');
                }
            }, 50);
            
            // Aplicar modo atual após renderizar
            setTimeout(() => {
                const modoTeste = document.getElementById('modo-teste');
                if (modoTeste && modoTeste.value) {
                    if (typeof window.toggleGlobalChecklistMode === 'function') {
                        window.toggleGlobalChecklistMode();
                    }
                }
                
                // Controlar visibilidade da seção de bugs baseado no modo
                const isNewDocumentation = !window.location.search.includes('edit=');
                const bugsSection = container.querySelector('.bugs-section-ct');
                if (bugsSection) {
                    if (isNewDocumentation) {
                        // Modo criação: ocultar
                        bugsSection.classList.add('hidden-in-creation');
                        bugsSection.classList.remove('visible');
                    } else {
                        // Modo edição: sempre mostrar
                        bugsSection.classList.remove('hidden-in-creation');
                        bugsSection.classList.add('visible');
                    }
                }
            }, 100);
        }
    } else {
        // Ocultar seções de CT mas manter campo de pesquisa visível
        if (scenarioTabs) scenarioTabs.classList.remove('visible');
        if (container) container.classList.remove('visible');
        if (navigationControls) navigationControls.classList.add('visible');
        if (noCtMessage) {
            noCtMessage.style.display = 'block';
            
            // Atualizar mensagem baseado no contexto
            const messageText = document.getElementById('no-ct-message-text');
            if (messageText) {
                const isEditing = window.location.search.includes('edit=');
                const tipoSelecionado = document.getElementById('filter-tipo-teste')?.value || '';
                
                // Se está editando e há filtro de tipo selecionado, mostrar mensagem específica
                if (isEditing && tipoSelecionado) {
                    messageText.textContent = 'Nenhum caso de teste encontrado para esse tipo selecionado. Adicione casos de teste usando os botões acima.';
                } else {
                    // Mensagem padrão
                    messageText.textContent = 'Para começar a documentar sua feature, adicione casos de teste usando os botões acima.';
                }
            }
        }
    }
    
    // Atualizar visibilidade dos botões
    if (typeof atualizarVisibilidadeBotaoAprovarTodos === 'function') {
        atualizarVisibilidadeBotaoAprovarTodos();
    }
    if (typeof atualizarVisibilidadeBotaoResumo === 'function') {
        atualizarVisibilidadeBotaoResumo();
    }
    if (typeof atualizarVisibilidadeBotaoSalvar === 'function') {
        atualizarVisibilidadeBotaoSalvar();
    }
}

function atualizarFormularioExistente(form, cenario) {
    // NÃO atualizar cenarioAtual aqui - ele já está correto
    // cenarioAtual deve ser a posição no array, não o ID do cenário
    
    // Verificar se é uma nova documentação (sem parâmetro ?edit=)
    const isNewDocumentation = !window.location.search.includes('edit=');
    
    // Usar requestAnimationFrame para otimizar performance
    requestAnimationFrame(() => {
        // Atualizar título
        const titleElement = form.querySelector('.test-case-title h4');
        if (titleElement) {
            titleElement.textContent = cenario.titulo || `CT${String(cenario.id).padStart(3, '0')} - Sem Título`;
        }
        
        // Atualizar tags de fonte e tipo
        const titleContainer = form.querySelector('.test-case-title > div[style*="flex: 1"]');
        if (titleContainer) {
            // Procurar o container das tags pela classe
            let tagsContainer = titleContainer.querySelector('.ct-tags-container');
            
            // Se não encontrar, criar o container
            if (!tagsContainer) {
                tagsContainer = document.createElement('div');
                tagsContainer.className = 'ct-tags-container';
                tagsContainer.style.cssText = 'display: flex; gap: 8px; margin-top: 8px;';
                titleContainer.appendChild(tagsContainer);
            }
            
            // Obter fonte e tipo do cenário (com valores padrão)
            const fonte = cenario.fonte || 'Usuário';
            const tipo = cenario.tipo || 'funcional';
            
            // Mapear tipos para nomes exibidos
            const tipoNomes = {
                'funcional': 'Funcional',
                'regressao': 'Regressão',
                'integracao': 'Integração',
                'usabilidade': 'Usabilidade',
                'performance': 'Performance'
            };
            const tipoDisplay = tipoNomes[tipo] || tipo;
            
            tagsContainer.innerHTML = `
                <span class="ct-tag ct-tag-fonte">fonte: ${fonte}</span>
                <span class="ct-tag ct-tag-tipo" onclick="toggleTipoDropdown(${cenario.id}, event)" style="position: relative;">
                    tipo: ${tipoDisplay}
                    <div class="ct-tag-tipo-dropdown" id="tipo-dropdown-${cenario.id}">
                        <div class="ct-tag-tipo-option" onclick="selecionarTipo(${cenario.id}, 'funcional', event)">Funcional</div>
                        <div class="ct-tag-tipo-option" onclick="selecionarTipo(${cenario.id}, 'regressao', event)">Regressão</div>
                        <div class="ct-tag-tipo-option" onclick="selecionarTipo(${cenario.id}, 'integracao', event)">Integração</div>
                        <div class="ct-tag-tipo-option" onclick="selecionarTipo(${cenario.id}, 'usabilidade', event)">Usabilidade</div>
                        <div class="ct-tag-tipo-option" onclick="selecionarTipo(${cenario.id}, 'performance', event)">Performance</div>
                    </div>
                </span>
            `;
        }
        
        // Atualizar botão de editar título
        const editTitleButton = form.querySelector('.edit-title-icon');
        if (editTitleButton) {
            editTitleButton.setAttribute('onclick', `editarTituloCenario(${cenario.id})`);
        }
        
        // Atualizar data-cenario-id
        form.setAttribute('data-cenario-id', cenario.id);
        
        // Atualizar campos de texto de forma otimizada
        const textFields = [
            { selector: '.preconditions textarea', value: cenario.precondicoes || '', onchange: `atualizarPrecondicoes(${cenario.id}, this.value)` },
            { selector: '.steps textarea', value: cenario.passos || '', onchange: `atualizarPassos(${cenario.id}, this.value)` },
            { selector: '.expected-result textarea', value: cenario.resultadoEsperado || '', onchange: `atualizarResultadoEsperado(${cenario.id}, this.value)` }
        ];
        
        textFields.forEach(field => {
            const element = form.querySelector(field.selector);
            if (element) {
                if (element.value !== field.value) {
                    element.value = field.value;
                }
                // Atualizar onchange para o cenário correto
                element.setAttribute('onchange', field.onchange);
            }
        });
        
        // Atualizar status - recriar radio buttons com o name correto
        const statusRadioContainer = form.querySelector('.status-radio');
        if (statusRadioContainer) {
            
            statusRadioContainer.innerHTML = `
                <label>
                    <input type="radio" name="ct${cenario.id}_status" value="aprovado" ${cenario.status === 'aprovado' ? 'checked' : ''} onchange="atualizarStatus(${cenario.id}, 'aprovado')">
                    <span>Aprovado</span>
                </label>
                <label>
                    <input type="radio" name="ct${cenario.id}_status" value="reprovado" ${cenario.status === 'reprovado' ? 'checked' : ''} onchange="atualizarStatus(${cenario.id}, 'reprovado')">
                    <span>Reprovado</span>
                </label>
                <label>
                    <input type="radio" name="ct${cenario.id}_status" value="bloqueado" ${cenario.status === 'bloqueado' ? 'checked' : ''} onchange="atualizarStatus(${cenario.id}, 'bloqueado')">
                    <span>Bloqueado</span>
                </label>
                <label>
                    <input type="radio" name="ct${cenario.id}_status" value="Não executado" ${cenario.status === 'Não executado' ? 'checked' : ''} onchange="atualizarStatus(${cenario.id}, 'Não executado')">
                    <span>Não Executado</span>
                </label>
            `;
        }
        
        // Atualizar anexos sempre (mesmo se a quantidade não mudou, o conteúdo pode ser diferente)
        const attachedFilesDiv = form.querySelector('.attached-files');
        if (attachedFilesDiv) {
            const arquivosHtml = cenario.arquivos && cenario.arquivos.length > 0 
                ? cenario.arquivos.map(arquivo => {
                    // Suportar tanto string quanto objeto
                    const nomeArquivo = typeof arquivo === 'string' ? arquivo : arquivo.nome;
                    return `<span class="attached-file">
                        <a href="${API_BASE_URL}/api/attachments/download/${nomeArquivo}" target="_blank" style="color: inherit; text-decoration: none;">${nomeArquivo}</a> 
                        <span class="remove-file" data-cenario-id="${cenario.id}" data-arquivo-nome="${nomeArquivo.replace(/"/g, '&quot;')}">×</span>
                    </span>`;
                  }).join('')
                : '';
            attachedFilesDiv.innerHTML = arquivosHtml;
        }
        
        // Atualizar bugs do CT apenas se necessário
        const bugsListCT = form.querySelector('.bugs-list-ct');
        if (bugsListCT) {
            // Usar setTimeout para garantir que bugs estejam atualizados
            setTimeout(() => {
                bugsListCT.innerHTML = renderizarBugsCT(cenario.id);
            }, 500); // Aumentar delay para 500ms
        }
        
        // Controlar visibilidade das seções baseado no modo (criação ou edição)
        const bugsSectionCT = form.querySelector('.bugs-section-ct');
        const fileUploadSection = form.querySelector('.file-upload-section');
        const statusSection = form.querySelector('.status-section');
        
        if (isNewDocumentation) {
            // Modo criação: ocultar seções
            if (bugsSectionCT) bugsSectionCT.classList.add('hidden-in-creation');
            if (fileUploadSection) fileUploadSection.classList.add('hidden-in-creation');
            if (statusSection) statusSection.classList.add('hidden-in-creation');
        } else {
            // Modo edição: garantir que seções sejam visíveis
            if (bugsSectionCT) {
                bugsSectionCT.classList.remove('hidden-in-creation');
                bugsSectionCT.classList.add('visible');
            }
            if (fileUploadSection) fileUploadSection.classList.remove('hidden-in-creation');
            if (statusSection) statusSection.classList.remove('hidden-in-creation');
        }
        
        // Atualizar atributos de elementos
        const fileInput = form.querySelector('input[type="file"]');
        if (fileInput) {
            fileInput.id = `file_${cenario.id}`;
            fileInput.setAttribute('onchange', `anexarArquivo(${cenario.id}, this)`);
        }
        
        const bugButton = form.querySelector('.btn-bug-ct');
        if (bugButton) {
            bugButton.setAttribute('onclick', `adicionarBugCT(${cenario.id})`);
        }
        
    });
}

function criarCenarioHtml(cenario) {
    // Verificar se é uma nova documentação (sem parâmetro ?edit=)
    const isNewDocumentation = !window.location.search.includes('edit=');
    const hiddenClass = isNewDocumentation ? 'hidden-in-creation' : '';
    
    // Verificar modo-teste para determinar se deve exibir campos detalhados
    const modoTeste = document.getElementById('modo-teste');
    const isRoteiroMode = modoTeste && modoTeste.value === 'sim';
    const visibleClass = isRoteiroMode ? 'visible' : '';
    
    const arquivosHtml = cenario.arquivos && cenario.arquivos.length > 0 
        ? cenario.arquivos.map(arquivo => {
            // Suportar tanto string quanto objeto
            const nomeArquivo = typeof arquivo === 'string' ? arquivo : arquivo.nome;
            return `<span class="attached-file">
                <a href="${API_BASE_URL}/api/attachments/download/${nomeArquivo}" target="_blank" style="color: inherit; text-decoration: none;">${nomeArquivo}</a> 
                <span class="remove-file" data-cenario-id="${cenario.id}" data-arquivo-nome="${nomeArquivo.replace(/"/g, '&quot;')}">×</span>
            </span>`;
          }).join('')
        : '';

    // Obter fonte e tipo do cenário (com valores padrão)
    const fonte = cenario.fonte || 'Usuário';
    const tipo = cenario.tipo || 'funcional';
    
    // Mapear tipos para nomes exibidos
    const tipoNomes = {
        'funcional': 'Funcional',
        'regressao': 'Regressão',
        'integracao': 'Integração',
        'usabilidade': 'Usabilidade',
        'performance': 'Performance'
    };
    const tipoDisplay = tipoNomes[tipo] || tipo;
    
    return `
        <div class="test-case" data-cenario-id="${cenario.id}">
            <div class="test-case-title">
                <div style="flex: 1;">
                    <h4>${cenario.titulo || `CT${String(cenario.id).padStart(3, '0')} - Sem Título`}</h4>
                    <div class="ct-tags-container" style="display: flex; gap: 8px; margin-top: 8px;">
                        <span class="ct-tag ct-tag-fonte">fonte: ${fonte}</span>
                        <span class="ct-tag ct-tag-tipo" onclick="toggleTipoDropdown(${cenario.id}, event)" style="position: relative;">
                            tipo: ${tipoDisplay}
                            <div class="ct-tag-tipo-dropdown" id="tipo-dropdown-${cenario.id}">
                                <div class="ct-tag-tipo-option" onclick="selecionarTipo(${cenario.id}, 'funcional', event)">Funcional</div>
                                <div class="ct-tag-tipo-option" onclick="selecionarTipo(${cenario.id}, 'regressao', event)">Regressão</div>
                                <div class="ct-tag-tipo-option" onclick="selecionarTipo(${cenario.id}, 'integracao', event)">Integração</div>
                                <div class="ct-tag-tipo-option" onclick="selecionarTipo(${cenario.id}, 'usabilidade', event)">Usabilidade</div>
                                <div class="ct-tag-tipo-option" onclick="selecionarTipo(${cenario.id}, 'performance', event)">Performance</div>
                            </div>
                        </span>
                    </div>
                </div>
                <span class="edit-title-icon" onclick="editarTituloCenario(${cenario.id})" title="Editar título">✏️</span>
            </div>
            
            
            <div class="two-columns ${visibleClass}">
                <div class="preconditions">
                    <h5>Pré-condições:</h5>
                    <textarea placeholder="Digite as pré-condições do teste..." onchange="atualizarPrecondicoes(${cenario.id}, this.value)">${cenario.precondicoes}</textarea>
                </div>

                <div class="steps">
                    <h5>Passos:</h5>
                    <textarea placeholder="Digite os passos do teste..." onchange="atualizarPassos(${cenario.id}, this.value)">${cenario.passos}</textarea>
                </div>
            </div>

            <div class="expected-result ${visibleClass}">
                <h5>Resultado Esperado:</h5>
                <textarea placeholder="Digite o resultado esperado..." onchange="atualizarResultadoEsperado(${cenario.id}, this.value)">${cenario.resultadoEsperado}</textarea>
            </div>

            <div class="file-upload-section ${hiddenClass}">
                <h5>Anexos:</h5>
                <div class="file-input-wrapper">
                    <input type="file" class="file-input" id="file_${cenario.id}" onchange="anexarArquivo(${cenario.id}, this)" multiple>
                    <button class="file-input-button">Selecionar Arquivo</button>
                </div>
                <div class="file-size-info">
                    <small style="color: #999; font-size: 11px;">Limite: 10MB por arquivo, máximo 5 arquivos por CT</small>
                </div>
                <div class="attached-files" id="attached_${cenario.id}">
                    ${arquivosHtml}
                </div>
            </div>

            <div class="bugs-section-ct ${hiddenClass}" data-cy="bugs-section">
                <h5>🐞 Bugs do CT:</h5>
                <div class="bugs-list-ct" id="bugs-list-ct-${cenario.id}">
                    ${renderizarBugsCT(cenario.id)}
                </div>
                <button type="button" class="btn-bug-ct" onclick="adicionarBugCT(${cenario.id})">+ Reportar Bug</button>
            </div>

            <div class="status-section ${hiddenClass}">
                <div class="status-header">
                    <h5>Status do Teste:</h5>
                </div>
                <div class="status-radio">
                    <label>
                        <input type="radio" name="ct${cenario.id}_status" value="aprovado" ${cenario.status === 'aprovado' ? 'checked' : ''} onchange="atualizarStatus(${cenario.id}, 'aprovado')">
                        <span>Aprovado</span>
                    </label>
                    <label>
                        <input type="radio" name="ct${cenario.id}_status" value="reprovado" ${cenario.status === 'reprovado' ? 'checked' : ''} onchange="atualizarStatus(${cenario.id}, 'reprovado')">
                        <span>Reprovado</span>
                    </label>
                    <label>
                        <input type="radio" name="ct${cenario.id}_status" value="bloqueado" ${cenario.status === 'bloqueado' ? 'checked' : ''} onchange="atualizarStatus(${cenario.id}, 'bloqueado')">
                        <span>Bloqueado</span>
                    </label>
                    <label>
                        <input type="radio" name="ct${cenario.id}_status" value="Não executado" ${cenario.status === 'Não executado' ? 'checked' : ''} onchange="atualizarStatus(${cenario.id}, 'Não executado')">
                        <span>Não Executado</span>
                    </label>
                </div>
            </div>
        </div>
    `;
}

function atualizarTabs() {
    
    // Verificar se há paginação ativa
    const paginationControls = document.querySelector('.pagination-controls');
    const isPaginationActive = paginationControls && paginationControls.style.display !== 'none';
    
    if (isPaginationActive && typeof window.renderizarListaCenarios === 'function') {
        window.renderizarListaCenarios();
        return;
    }
    
    const container = document.getElementById('scenario-tabs');
    container.innerHTML = '';

    cenariosFiltrados.forEach((cenario, index) => {
        const tab = document.createElement('div');
        const isActive = index + 1 === cenarioAtual;
        tab.className = `tab ${isActive ? 'active' : ''}`;
        
        const ctId = `${String(cenario.id).padStart(3, '0')} - `;
        
        // Extrair os primeiros 30 caracteres do título do caso de teste
        let tituloTexto = '';
        if (cenario.titulo && cenario.titulo.trim() !== '') {
            // Remover o prefixo CT001 - se existir
            const tituloLimpo = cenario.titulo.replace(/^CT\d+\s*-\s*/, '').trim();
            tituloTexto = tituloLimpo.substring(0, 30);
        } else {
            tituloTexto = 'Sem Título';
        }
        
        const textoCompleto = `${ctId}${tituloTexto}...`;
        
        const tituloSpan = document.createElement('span');
        tituloSpan.textContent = textoCompleto;
        tituloSpan.style.flex = '1';
        
        // Ícones de status removidos - agora disponíveis no modal de resumo
        
        tab.appendChild(tituloSpan);
        tab.onclick = () => {
            trocarCenario(index + 1);
        };
        
        container.appendChild(tab);
    });
}

function trocarCenario(numeroCenario) {
    
    // Aplicar efeito de transição suave
    const currentForm = document.querySelector('.test-case');
    if (currentForm) {
        currentForm.classList.add('switching');
    }
    
    // Atualizar cenario atual
    cenarioAtual = numeroCenario;
    
    // Verificar se há paginação ativa e ajustar página se necessário
    const paginationControls = document.querySelector('.pagination-controls');
    const isPaginationActive = paginationControls && paginationControls.style.display !== 'none';
    
    if (isPaginationActive) {
        // Calcular em qual página está este cenário
        const pageForCenario = Math.ceil(numeroCenario / itemsPerPageCT);
        if (pageForCenario !== currentPageCT) {
            currentPageCT = pageForCenario;
        }
    }
    
    // Usar setTimeout para permitir transição visual
    setTimeout(() => {
        renderizarCenarios();
        atualizarTabs();
        atualizarBotoesNavegacao();
        atualizarBotaoRemover();
        
        // Atualizar paginação se estiver ativa
        if (isPaginationActive && typeof window.mostrarControlesPaginaCT === 'function') {
            window.mostrarControlesPaginaCT();
        }
        
        // Remover classe de transição
        if (currentForm) {
            currentForm.classList.remove('switching');
        }
    }, 100);
}

function cenarioAnterior() {
    if (cenarioAtual > 1) {
        // Aplicar efeito de transição suave
        const currentForm = document.querySelector('.test-case');
        if (currentForm) {
            currentForm.classList.add('switching');
        }
        
        cenarioAtual--;
        
        // Usar setTimeout para permitir transição visual
        setTimeout(() => {
            renderizarCenarios();
            atualizarTabs();
            atualizarBotoesNavegacao();
            atualizarBotaoRemover();
            
            // Remover classe de transição
            if (currentForm) {
                currentForm.classList.remove('switching');
            }
        }, 100);
    }
}

function proximoCenario() {
    if (cenarioAtual < cenariosFiltrados.length) {
        // Aplicar efeito de transição suave
        const currentForm = document.querySelector('.test-case');
        if (currentForm) {
            currentForm.classList.add('switching');
        }
        
        cenarioAtual++;
        
        // Usar setTimeout para permitir transição visual
        setTimeout(() => {
            renderizarCenarios();
            atualizarTabs();
            atualizarBotoesNavegacao();
            atualizarBotaoRemover();
            
            // Remover classe de transição
            if (currentForm) {
                currentForm.classList.remove('switching');
            }
        }, 100);
    }
}

function atualizarBotoesNavegacao() {
    const prevBtn = document.getElementById('prev-btn');
    const nextBtn = document.getElementById('next-btn');
    
    if (prevBtn) {
        prevBtn.disabled = cenarioAtual <= 1;
    }
    if (nextBtn) {
        nextBtn.disabled = cenarioAtual >= cenariosFiltrados.length;
    }
}

function atualizarBotaoRemover() {
    const removeBtn = document.getElementById('remove-btn');
    if (removeBtn) {
        removeBtn.disabled = cenariosFiltrados.length === 0 || cenarioAtual < 1;
    }
}

// Função para atualizar o status de um cenário
function atualizarStatus(cenarioId, novoStatus) {
    // Usar o cenarioId recebido diretamente (vem do onchange do radio button)
    const idParaUsar = cenarioId;
    
    // Encontrar o cenário no array global usando o cenarioId recebido
    const cenario = cenarios.find(c => c.id === idParaUsar);
    if (cenario) {
        cenario.status = novoStatus;
        
        // Atualizar no array filtrado também
        const cenarioFiltrado = cenariosFiltrados.find(c => c.id === idParaUsar);
        if (cenarioFiltrado) {
            cenarioFiltrado.status = novoStatus;
        }
        
        // Atualizar contadores e sumário
        if (typeof atualizarContadores === 'function') {
            atualizarContadores();
        }
        if (typeof atualizarSumario === 'function') {
            atualizarSumario();
        }
        if (typeof atualizarBotaoSalvar === 'function') {
            atualizarBotaoSalvar();
        }
        
        // Atualizar as tabs para mostrar/ocultar o ícone de alerta (sem resetar paginação)
        if (typeof atualizarTabs === 'function') {
            atualizarTabs();
        }
        
        // Manter a paginação atual ao atualizar status
        if (typeof mostrarControlesPaginaCT === 'function') {
            mostrarControlesPaginaCT();
        }
        
        // Salvar backup após atualizar status
        salvarBackupLocalStorage();
    }
}

// Função unificada para aplicar filtros (pesquisa e tipo)
function aplicarFiltros() {
    const termo = document.getElementById('search-input')?.value.toLowerCase().trim() || '';
    const tipoSelecionado = document.getElementById('filter-tipo-teste')?.value || '';
    const clearIcon = document.getElementById('clear-search-cenarios');
    const featureInput = document.querySelector('.feature-input');
    const nomeFeature = featureInput ? featureInput.value.toLowerCase() : '';
    
    termoPesquisa = termo;
    tipoFiltroSelecionado = tipoSelecionado;
    
    // Mostrar/ocultar ícone de limpar pesquisa
    if (clearIcon) {
        clearIcon.style.display = termo !== '' ? 'block' : 'none';
    }
    
    // Aplicar filtros combinados
    cenariosFiltrados = cenarios.filter(cenario => {
        // Filtro por tipo
        if (tipoSelecionado && cenario.tipo !== tipoSelecionado) {
            return false;
        }
        
        // Filtro por termo de pesquisa
        if (termo === '') {
            return true;
        }
        
        // Se o termo de pesquisa está contido no nome da feature, não mostrar nenhum resultado
        if (nomeFeature && nomeFeature.includes(termo)) {
            return false;
        }
        
        // Filtrar por título
        const tituloParaBusca = cenario.titulo || `CT${String(cenario.id).padStart(3, '0')} - Sem Título`;
        return tituloParaBusca.toLowerCase().includes(termo);
    });
    
    // Resetar para primeira página quando aplicar filtros
    cenarioAtual = cenariosFiltrados.length > 0 ? 1 : 0;
    currentPageCT = 1;
    
    renderizarCenarios();
    atualizarTabs();
    atualizarBotoesNavegacao();
    atualizarBotaoRemover();
    
    // Atualizar controles de paginação e abas filtradas
    if (typeof mostrarControlesPaginaCT === 'function') {
        mostrarControlesPaginaCT();
    }
    if (typeof window.renderizarListaCenarios === 'function') {
        window.renderizarListaCenarios();
    }
}

function pesquisarCenarios() {
    aplicarFiltros();
}

function filtrarPorTipo() {
    aplicarFiltros();
}

function limparPesquisaCenarios() {
    document.getElementById('search-input').value = '';
    document.getElementById('clear-search-cenarios').style.display = 'none';
    // Aplicar filtros novamente (mantém o filtro de tipo se houver)
    aplicarFiltros();
}

function handleSearchKeydown(event) {
    // Se o campo já está vazio e pressionou Backspace, não fazer nada
    if (event.key === 'Backspace' && event.target.value.length === 0) {
        event.preventDefault();
        event.stopPropagation();
        return false;
    }
}

function editarTituloCenario(cenarioId) {
    // Usar o cenarioId recebido como parâmetro
    const cenario = cenarios.find(c => c.id === cenarioId);
    if (!cenario) {
        console.error(`❌ Cenário ${cenarioId} não encontrado`);
        return;
    }

    // Extrair apenas a parte editável do título (remover "CT001 - ")
    const tituloEditavel = cenario.titulo.replace(/^CT\d+\s*-\s*/, '');
    
    // Preencher o campo do modal com o título atual (apenas a parte editável)
    const inputTitulo = document.getElementById('novoTituloCT');
    if (inputTitulo) {
        inputTitulo.value = tituloEditavel;
    }
    
    // Armazenar o cenarioId no modal para usar na confirmação
    const modal = document.getElementById('modalEditarTitulo');
    if (modal) {
        modal.dataset.cenarioId = cenarioId;
    }
    
    // Abrir o modal
    abrirModalEditarTitulo();
}

function abrirModalEditarTitulo() {
    const modal = document.getElementById('modalEditarTitulo');
    if (modal) {
        modal.style.display = 'block';
        // Focar no input
        const input = document.getElementById('novoTituloCT');
        if (input) {
            input.focus();
            input.select();
        }
    }
}

function fecharModalEditarTitulo() {
    const modal = document.getElementById('modalEditarTitulo');
    if (modal) {
        modal.style.display = 'none';
        // Limpar o campo
        const input = document.getElementById('novoTituloCT');
        if (input) {
            input.value = '';
        }
        // Limpar o dataset do modal
        delete modal.dataset.cenarioId;
    }
}

function confirmarEdicaoTitulo() {
    const input = document.getElementById('novoTituloCT');
    if (!input) return;
    
    const novoTitulo = input.value.trim();
    if (novoTitulo === '') {
        alert('Por favor, digite um título válido.');
        return;
    }
    
    // Usar cenarioId armazenado no modal
    const modal = document.getElementById('modalEditarTitulo');
    const cenarioId = modal ? parseInt(modal.dataset.cenarioId) : null;
    
    if (!cenarioId) {
        console.error('❌ ID do cenário não encontrado no modal');
        return;
    }
    
    const cenario = cenarios.find(c => c.id === cenarioId);
    if (!cenario) {
        console.error(`❌ Cenário ${cenarioId} não encontrado no array principal`);
        return;
    }
    
    // Manter o prefixo "CT001 - " e adicionar o novo título
    const ctPrefix = `CT${String(cenario.id).padStart(3, '0')} - `;
    const novoTituloCompleto = ctPrefix + novoTitulo;
    
    // Atualizar no array principal
    cenario.titulo = novoTituloCompleto;
    
    // Atualizar no array filtrado também
    const cenarioFiltrado = cenariosFiltrados.find(c => c.id === cenarioId);
    if (cenarioFiltrado) {
        cenarioFiltrado.titulo = novoTituloCompleto;
    }
    
    // Atualizar no array de resumo também
    if (typeof cenariosFiltradosResumo !== 'undefined') {
        const cenarioResumo = cenariosFiltradosResumo.find(c => c.id === cenarioId);
        if (cenarioResumo) {
            cenarioResumo.titulo = novoTituloCompleto;
        }
    }
    
    // Atualizar apenas o título no formulário atual se for o CT sendo editado
    const currentForm = document.querySelector('.test-case');
    if (currentForm) {
        const currentCenarioId = parseInt(currentForm.getAttribute('data-cenario-id'));
        if (currentCenarioId === cenarioId) {
            const titleElement = currentForm.querySelector('.test-case-title h4');
            if (titleElement) {
                titleElement.textContent = novoTituloCompleto;
            }
        }
    }
    
    // Atualizar abas e outras funções
    atualizarTabs();
    atualizarSumario();
    atualizarBotaoSalvar();
    
    // Atualizar botões de navegação
    if (typeof atualizarBotoesNavegacao === 'function') {
        atualizarBotoesNavegacao();
    }
    
    // Salvar backup após editar título
    salvarBackupLocalStorage();
    
    // Fechar o modal
    fecharModalEditarTitulo();
}

function atualizarPrecondicoes(cenarioId, precondicoes) {
    // Usar o cenarioId recebido como parâmetro
    const cenario = cenarios.find(c => c.id === cenarioId);
    if (cenario) {
        cenario.precondicoes = precondicoes;
        
        // Atualizar também no array filtrado
        const cenarioFiltrado = cenariosFiltrados.find(c => c.id === cenarioId);
        if (cenarioFiltrado) {
            cenarioFiltrado.precondicoes = precondicoes;
        }
        
        // Salvar backup após atualizar pré-condições
        salvarBackupLocalStorage();
    }
}

function atualizarPassos(cenarioId, passos) {
    // Usar o cenarioId recebido como parâmetro
    const cenario = cenarios.find(c => c.id === cenarioId);
    if (cenario) {
        cenario.passos = passos;
        
        // Atualizar também no array filtrado
        const cenarioFiltrado = cenariosFiltrados.find(c => c.id === cenarioId);
        if (cenarioFiltrado) {
            cenarioFiltrado.passos = passos;
        }
        
        // Salvar backup após atualizar passos
        salvarBackupLocalStorage();
    }
}

function atualizarResultadoEsperado(cenarioId, resultadoEsperado) {
    // Usar o cenarioId recebido como parâmetro
    const cenario = cenarios.find(c => c.id === cenarioId);
    if (cenario) {
        cenario.resultadoEsperado = resultadoEsperado;
        
        // Atualizar também no array filtrado
        const cenarioFiltrado = cenariosFiltrados.find(c => c.id === cenarioId);
        if (cenarioFiltrado) {
            cenarioFiltrado.resultadoEsperado = resultadoEsperado;
        }
        
        // Salvar backup após atualizar resultado esperado
        salvarBackupLocalStorage();
    }
}

function atualizarTipo(cenarioId, novoTipo) {
    // Usar o cenarioId recebido como parâmetro
    const cenario = cenarios.find(c => c.id === cenarioId);
    if (cenario) {
        cenario.tipo = novoTipo;
        
        // Atualizar também no array filtrado
        const cenarioFiltrado = cenariosFiltrados.find(c => c.id === cenarioId);
        if (cenarioFiltrado) {
            cenarioFiltrado.tipo = novoTipo;
        }
        
        // Atualizar a tag visualmente
        atualizarTagTipo(cenarioId, novoTipo);
        
        // Salvar backup após atualizar tipo
        salvarBackupLocalStorage();
    }
}

function atualizarTagTipo(cenarioId, novoTipo) {
    // Mapear tipos para nomes exibidos
    const tipoNomes = {
        'funcional': 'Funcional',
        'regressao': 'Regressão',
        'integracao': 'Integração',
        'usabilidade': 'Usabilidade',
        'performance': 'Performance'
    };
    const tipoDisplay = tipoNomes[novoTipo] || novoTipo;
    
    // Encontrar a tag de tipo no DOM
    const testCase = document.querySelector(`[data-cenario-id="${cenarioId}"]`);
    if (testCase) {
        const tagTipo = testCase.querySelector('.ct-tag-tipo');
        if (tagTipo) {
            // Encontrar o primeiro nó de texto e atualizá-lo
            let textoAtualizado = false;
            for (let node of tagTipo.childNodes) {
                if (node.nodeType === Node.TEXT_NODE && node.textContent.trim().startsWith('tipo:')) {
                    node.textContent = `tipo: ${tipoDisplay}`;
                    textoAtualizado = true;
                    break;
                }
            }
            // Se não encontrou o texto, atualizar o conteúdo mantendo o dropdown
            if (!textoAtualizado) {
                const dropdown = tagTipo.querySelector('.ct-tag-tipo-dropdown');
                if (dropdown) {
                    tagTipo.innerHTML = `tipo: ${tipoDisplay}${dropdown.outerHTML}`;
                } else {
                    tagTipo.textContent = `tipo: ${tipoDisplay}`;
                }
            }
        }
    }
}

function toggleTipoDropdown(cenarioId, event) {
    // Prevenir propagação do evento
    event.stopPropagation();
    
    // Fechar todos os outros dropdowns
    document.querySelectorAll('.ct-tag-tipo-dropdown').forEach(dropdown => {
        if (dropdown.id !== `tipo-dropdown-${cenarioId}`) {
            dropdown.classList.remove('show');
        }
    });
    
    // Toggle do dropdown atual
    const dropdown = document.getElementById(`tipo-dropdown-${cenarioId}`);
    if (dropdown) {
        dropdown.classList.toggle('show');
    }
}

function selecionarTipo(cenarioId, novoTipo, event) {
    // Prevenir propagação do evento
    event.stopPropagation();
    
    // Atualizar o tipo
    atualizarTipo(cenarioId, novoTipo);
    
    // Fechar o dropdown
    const dropdown = document.getElementById(`tipo-dropdown-${cenarioId}`);
    if (dropdown) {
        dropdown.classList.remove('show');
    }
}


function calcularTaxaAprovacao() {
    
    // Recalcular contadores para garantir dados atualizados
    let aprovados = 0;
    let reprovados = 0;
    let bloqueados = 0;
    
    cenarios.forEach(cenario => {
        switch(cenario.status) {
            case 'aprovado':
                aprovados++;
                break;
            case 'reprovado':
                reprovados++;
                break;
            case 'bloqueado':
                bloqueados++;
                break;
        }
    });
    
    
    // Calcular taxa considerando todos os cenários
    const totalCenarios = cenarios.length;
    const taxa = totalCenarios > 0 ? Math.round((aprovados / totalCenarios) * 100) : 0;
    
    // Verificar se o elemento existe antes de atualizá-lo
    const taxaAprovacaoEl = document.getElementById('taxaAprovacao');
    if (taxaAprovacaoEl) {
        taxaAprovacaoEl.value = taxa + '%';
    }
    
    // Mostrar a seção de resumo apenas se ela existir
    const summarySection = document.getElementById('summary-section');
    if (summarySection) {
        summarySection.classList.add('visible');
    }
}

function imprimir() {
    window.print();
}

// Configurar URL base da API - usa path relativo para funcionar em dev e produção
// Em produção (docs-qa-hub-hmg.edtech.com.br) ou local (localhost:3001), as chamadas vão para a mesma origem
const API_BASE_URL = '';
const AI_API_BASE_URL = ''; // API de IA - mesmo origin (proxy reverso em produção)

// Função para ocultar todas as seções durante o processo de salvamento
function ocultarTodasSecoes() {
    // Bloquear campo nome da feature
    const featureInput = document.querySelector('.feature-input');
    if (featureInput) {
        featureInput.disabled = true;
        featureInput.style.opacity = '0.6';
        featureInput.style.cursor = 'not-allowed';
    }
    
    // Bloquear campo link do Jira
    const jiraInput = document.getElementById('jira-link');
    if (jiraInput) {
        jiraInput.disabled = true;
        jiraInput.style.opacity = '0.6';
        jiraInput.style.cursor = 'not-allowed';
    }
    
    // Ocultar seção de informações do teste
    const infoSection = document.getElementById('info-section');
    if (infoSection) {
        infoSection.classList.add('hidden-section');
        infoSection.style.display = 'none';
    }
    
    // Ocultar seção específica de informações do teste
    const informacoesTesteSection = document.getElementById('informacoes-teste-section');
    if (informacoesTesteSection) {
        informacoesTesteSection.classList.add('hidden-section');
        informacoesTesteSection.style.display = 'none';
    }
    
    // Ocultar seção de bugs
    const bugsSection = document.getElementById('bugs-section');
    if (bugsSection) {
        bugsSection.classList.add('hidden-section');
        bugsSection.style.display = 'none';
    }
    
    // Ocultar seção de casos de teste
    const testCasesSection = document.getElementById('test-cases-section');
    if (testCasesSection) {
        testCasesSection.classList.add('hidden-section');
        testCasesSection.style.display = 'none';
    }
    
    // Ocultar container de cenários
    const scenariosContainer = document.getElementById('test-scenarios-container');
    if (scenariosContainer) {
        scenariosContainer.style.display = 'none';
    }
    
    const scenarioTabs = document.getElementById('scenario-tabs');
    if (scenarioTabs) {
        scenarioTabs.style.display = 'none';
    }
    
    // Ocultar seção de salvamento
    const saveSection = document.getElementById('save-section');
    if (saveSection) {
        saveSection.classList.add('hidden-section');
        saveSection.style.display = 'none';
    }
}

// Função para enviar arquivos pendentes para o servidor
async function enviarArquivosPendentes() {
    if (arquivosParaUpload.length === 0) {
        console.log('📎 Nenhum arquivo pendente para upload');
        return;
    }
    
    console.log(`📎 Enviando ${arquivosParaUpload.length} arquivo(s) pendente(s)...`);
    
    for (const arquivoInfo of arquivosParaUpload) {
        try {
            const formData = new FormData();
            formData.append('file', arquivoInfo.file);
            formData.append('cenarioId', arquivoInfo.cenarioId);
            formData.append('featureName', arquivoInfo.featureName);
            formData.append('featureId', arquivoInfo.featureId);
            
            const response = await fetch(`${API_BASE_URL}/api/attachments/upload`, {
                method: 'POST',
                body: formData
            });
            
            const result = await response.json();
            
            if (result.success) {
                console.log(`✅ Arquivo "${arquivoInfo.file.name}" enviado com sucesso: ${result.file_name}`);
                
                // Atualizar o arquivo no cenário com informações do servidor
                const cenario = cenarios.find(c => c.id === arquivoInfo.cenarioId);
                if (cenario && cenario.arquivos) {
                    const arquivoVisual = cenario.arquivos.find(a => a.nome === arquivoInfo.file.name && a.pendente);
                    if (arquivoVisual) {
                        arquivoVisual.nome = result.file_name;
                        arquivoVisual.tamanho = result.file_size;
                        arquivoVisual.tipo = result.file_type;
                        arquivoVisual.caminho = result.file_path;
                        arquivoVisual.download_url = result.download_url;
                        delete arquivoVisual.pendente; // Remover flag de pendente
                    }
                }
            } else {
                console.error(`❌ Erro ao enviar arquivo "${arquivoInfo.file.name}":`, result.message);
            }
        } catch (error) {
            console.error(`❌ Erro ao enviar arquivo "${arquivoInfo.file.name}":`, error);
        }
    }
    
    // Limpar lista de arquivos pendentes após enviar
    arquivosParaUpload = [];
    console.log('📎 Arquivos pendentes enviados com sucesso!');
}

/**
 * Grava snapshot de histórico de execução no localStorage (modo client-storage) ou no servidor.
 * Índice por HashID: qualiDoc_ls_v1:docHistorico:{HASH}
 */
async function salvarHistoricoExecucao() {
    try {
        const featureName = document.querySelector('.feature-input')?.value || '';
        const featureId = document.getElementById('feature-id')?.value || '';
        const testador = document.getElementById('testador')?.value || '';
        const ambiente = document.getElementById('ambiente')?.value || '';
        const lista = typeof cenarios !== 'undefined' && Array.isArray(cenarios) ? cenarios : [];
        const cenariosComStatus = lista.filter(function (c) {
            return c.status && c.status !== 'na' && c.status !== '';
        });
        if (!cenariosComStatus.length) {
            console.log('ℹ️ Histórico: nenhum CT com status de execução; snapshot não gravado.');
            return;
        }
        if (!featureName || !featureId || !testador || !ambiente) {
            console.warn('⚠️ Histórico: faltam feature, testador ou ambiente para gravar snapshot.');
            return;
        }
        const cenariosAprovados = lista.filter(function (c) {
            return c.status === 'aprovado';
        }).length;
        const taxaAprovacao = lista.length > 0 ? Math.round((cenariosAprovados / lista.length) * 100) : 0;
        const historyData = {
            feature_name: featureName,
            feature_id: featureId,
            testador: testador,
            ambiente: ambiente,
            cenarios: lista.map(function (c) {
                return {
                    id: c.id,
                    status: c.status || 'na',
                    titulo: c.titulo || '',
                    arquivos: c.arquivos || []
                };
            }),
            taxa_aprovacao: taxaAprovacao
        };
        const historyResponse = await fetch(`${API_BASE_URL}/api/test-history/save`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(historyData)
        });
        if (historyResponse.ok) {
            const historyResult = await historyResponse.json();
            if (historyResult.success) {
                console.log('✅ Histórico de execução gravado:', historyResult.file_name || '');
            }
        } else {
            const t = await historyResponse.text().catch(function () {
                return '';
            });
            console.warn('⚠️ Histórico: resposta HTTP', historyResponse.status, t);
        }
    } catch (e) {
        console.warn('⚠️ Histórico de execução:', e);
    }
}

async function salvar() {
    const saveBtn = document.getElementById('save-btn');
    const nomeFeature = document.querySelector('.feature-input').value || 'Feature_Sem_Nome';
    
    // Atualizar campo de última atualização com data atual antes de salvar
    const ultimaAtualizacaoField = document.getElementById('ultima-atualizacao');
    if (ultimaAtualizacaoField) {
        const today = new Date().toISOString().split('T')[0];
        ultimaAtualizacaoField.value = today;
    }
    
    // Aguardar inicialização do ID se não estiver definido
    let featureId = document.getElementById('feature-id').value;
    if (!featureId) {
        // Se não tem ID, aguardar um pouco e tentar novamente
        await new Promise(resolve => setTimeout(resolve, 100));
        featureId = document.getElementById('feature-id').value;
    }
    
    // Se ainda não tem ID, gerar um novo
    if (!featureId) {
        try {
            const response = await fetch(`${API_BASE_URL}/api/features/next-id`);
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const result = await response.json();
            featureId = result.nextId || '1';
            document.getElementById('feature-id').value = featureId;
            console.log(`🔢 ID gerado na função salvar: ${featureId}`);
        } catch (error) {
            console.error('❌ Erro ao gerar ID na função salvar:', error);
            // Tentar gerar hash localmente como fallback
            try {
                const response = await fetch(`${API_BASE_URL}/api/features`);
                if (response.ok) {
                    const result = await response.json();
                    if (result.success && result.features) {
                        // Coletar todas as hashes existentes
                        const existingHashes = new Set();
                        result.features.forEach(f => {
                            // Extrai hash do ID
                            if (f.id) {
                                existingHashes.add(f.id);
                            }
                        });
                        
                        // Gerar hash única
                        const gerarHashAleatoria = () => {
                            const caracteres = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
                            let hash = '';
                            for (let i = 0; i < 6; i++) {
                                hash += caracteres.charAt(Math.floor(Math.random() * caracteres.length));
                            }
                            return hash;
                        };
                        
                        let hash = gerarHashAleatoria();
                        let tentativas = 0;
                        const maxTentativas = 100;
                        
                        while (existingHashes.has(hash) && tentativas < maxTentativas) {
                            hash = gerarHashAleatoria();
                            tentativas++;
                        }
                        
                        featureId = hash;
                        document.getElementById('feature-id').value = featureId;
                        console.log(`🔢 Hash gerada localmente como fallback: ${featureId} (tentativas: ${tentativas + 1})`);
                    } else {
                        throw new Error('Não foi possível obter lista de features');
                    }
                } else {
                    throw new Error('Não foi possível conectar com a API');
                }
            } catch (fallbackError) {
                console.error('❌ Erro no fallback de geração de hash:', fallbackError);
                // Último recurso: gerar hash aleatória
                const gerarHashAleatoria = () => {
                    const caracteres = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
                    let hash = '';
                    for (let i = 0; i < 6; i++) {
                        hash += caracteres.charAt(Math.floor(Math.random() * caracteres.length));
                    }
                    return hash;
                };
                featureId = gerarHashAleatoria();
                document.getElementById('feature-id').value = featureId;
                console.log(`🔢 Hash de emergência gerada: ${featureId}`);
            }
        }
    }
    
    // Verificar se é uma edição
    const urlParams = new URLSearchParams(window.location.search);
    const editFile = urlParams.get('edit');
    const isEdit = !!editFile;
    
    // Ocultar todas as seções durante o processo de salvamento, mantendo apenas o header visível
    ocultarTodasSecoes();
    
    // Garantir que o header fique visível
    const header = document.querySelector('.header');
    if (header) {
        header.style.display = 'block';
    }
    
    // Bloquear botão durante o salvamento
    if (saveBtn) {
        saveBtn.disabled = true;
        saveBtn.textContent = isEdit ? 'Atualizando...' : 'Salvando...';
        saveBtn.style.opacity = '0.6';
        saveBtn.style.cursor = 'not-allowed';
    }
    
    // Marcar todos os bugs como salvos antes de enviar
    bugs.forEach(bug => {
        bug.salvo = true;
    });

    // Preparar dados para envio
    const modoRoteiro = document.getElementById('modo-teste').value === 'sim';
    const creationDate = document.getElementById('data').value || new Date().toISOString().split('T')[0];
    const updateDate = new Date().toISOString().split('T')[0];
    
    const data = {
        // Campos obrigatórios para /api/save-template
        featureName: nomeFeature,
        featureId: featureId,
        creationDate: creationDate,
        updateDate: updateDate,
        testRoutine: modoRoteiro,
        environment: document.getElementById('ambiente').value || '',
        tester: document.getElementById('testador').value || '',
        
        // Campos opcionais
        jiraLink: document.getElementById('jira-link').value || '',
        browser: document.getElementById('navegador').value || '',
        device: document.getElementById('dispositivo').value || '',
        squad: document.getElementById('squad').value || '',
        
        // Dados completos
        cenarios: cenarios,
        bugs: bugs,
        
        // Compatibilidade com versão antiga
        feature_id: featureId,
        data: creationDate,
        ultimaAtualizacao: updateDate,
        testador: document.getElementById('testador').value || '',
        ambiente: document.getElementById('ambiente').value || '',
        navegador: document.getElementById('navegador').value || '',
        dispositivo: document.getElementById('dispositivo').value || '',
        modoRoteiro: modoRoteiro,
        
        // Flag de edição
        isEdit: isEdit,
        originalFileName: editFile
    };
    
    console.log('💾 Salvando documentação...', {
        featureName: data.featureName,
        featureId: data.featureId,
        cenarios: data.cenarios.length,
        bugs: data.bugs.length
    });
    
    // Verificar se há cenários antes de enviar
    if (!cenarios || cenarios.length === 0) {
        alert('❌ Erro: Nenhum caso de teste foi criado. Por favor, crie pelo menos um caso de teste antes de salvar.');
        desbloquearBotaoSalvar();
        return;
    }
    
    // Enviar arquivos pendentes antes de salvar
    await enviarArquivosPendentes();
    
    // Limpar dados para enviar apenas o necessário (remover campos de compatibilidade)
    // Obter descrição da feature do campo feature-text do modal de IA
    const featureDescription = document.getElementById('feature-text')?.value || '';
    
    // Recuperar resumo da descrição do produto do localStorage
    const resumoDescricaoProduto = localStorage.getItem('resumoDescricaoProduto') || null;
    
    // Recuperar ct_aplicadosIA do localStorage (por padrão false)
    const ctAplicadosIA = localStorage.getItem('ct_aplicadosIA') === 'true';
    
    const dataParaEnvio = {
        // Campos essenciais
        featureName: data.featureName,
        featureId: data.featureId,
        creationDate: data.creationDate,
        updateDate: data.updateDate,
        testRoutine: data.testRoutine,
        environment: data.environment,
        tester: data.tester,
        jiraLink: data.jiraLink,
        browser: data.browser,
        device: data.device,
        squad: data.squad,
        observacao: document.getElementById('observacao')?.value || '',
        featureDescription: featureDescription, // Descrição da feature para uso no modal de IA
        resumoDescricaoProduto: resumoDescricaoProduto, // Resumo da descrição do produto gerado pela IA
        ct_aplicadosIA: ctAplicadosIA, // Flag indicando se CTs foram aplicados pela IA
        testType: document.getElementById('ai-test-type')?.value || 'funcional', // Tipo de teste usado pela última vez
        imagens_selecionadas: Array.from(savedImagesSelected), // Imagens selecionadas para envio aos prompts
        // Coletar coberturas APENAS se a documentação já existe (tem ID válido)
        // Para novas documentações, não coletar coberturas do localStorage
        coberturas: (data.featureId && data.featureId !== '' && data.featureId !== 'null' && data.featureId !== null && typeof coletarCoberturasLocalStorage === 'function')
            ? coletarCoberturasLocalStorage()
            : {}, // Coberturas por tipo de teste do localStorage
        
        // Dados principais - normalizar arquivos para envio
        cenarios: data.cenarios.map(cenario => {
            // Se o cenário tem arquivos, normalizar para objetos completos (nome, tamanho, tipo, etc)
            if (cenario.arquivos && Array.isArray(cenario.arquivos)) {
                const arquivosNormalizados = cenario.arquivos.map(arquivo => {
                    if (typeof arquivo === 'string') {
                        // Se é string, converter para objeto
                        return {
                            nome: arquivo,
                            tamanho: 0, // Não temos essa informação para arquivos já salvos
                            tipo: '',
                            data: new Date().toISOString()
                        };
                    }
                    // Se já é objeto, manter
                    return arquivo;
                });
                return { ...cenario, arquivos: arquivosNormalizados };
            }
            return cenario;
        }),
        bugs: data.bugs
    };
    
    console.log('📤 Dados para envio:', {
        featureName: dataParaEnvio.featureName,
        featureId: dataParaEnvio.featureId,
        cenarios: dataParaEnvio.cenarios.length,
        bugs: dataParaEnvio.bugs.length,
        sampleCenario: dataParaEnvio.cenarios[0],
        arquivosDosCenarios: dataParaEnvio.cenarios.map(c => ({
            id: c.id,
            arquivos: c.arquivos
        }))
    });
    
    try {
        // Usar rota correta baseado se é edição ou nova documentação
        let response;
        if (isEdit) {
            // Atualizar documentação existente - enviar apenas dados limpos
            console.log(`🔄 Atualizando feature ${featureId}...`);
            response = await fetch(`${API_BASE_URL}/api/features/${featureId}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                },
                body: JSON.stringify(dataParaEnvio)
            });
        } else {
            // Criar nova documentação - também usar dados limpos
            console.log(`✨ Criando nova documentação...`);
            response = await fetch(`${API_BASE_URL}/api/save-template`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                },
                body: JSON.stringify(dataParaEnvio)
            });
        }
        
        console.log(`📡 Resposta do servidor: ${response.status} ${response.statusText}`);
        const result = await response.json();
        console.log('📦 Resultado:', result);
        
            if (result.success) {
                // Deletar arquivos marcados para deleção
                await deletarArquivosMarcados();
                
                // Deletar imagens marcadas para deletar do S3
                const imagensDeletar = recuperarImagensDeletarLocalStorage();
                if (imagensDeletar.length > 0) {
                    console.log(`🗑️ Removendo ${imagensDeletar.length} imagem(ns) marcada(s) para deletar do S3...`);
                    for (const imageName of imagensDeletar) {
                        try {
                            const response = await fetch(`${API_BASE_URL}/api/features/${featureId}/images/${imageName}`, {
                                method: 'DELETE'
                            });
                            if (response.ok) {
                                console.log(`✅ Imagem removida do S3: ${imageName}`);
                            } else {
                                console.error(`❌ Erro ao remover imagem ${imageName} do S3`);
                            }
                        } catch (error) {
                            console.error(`❌ Erro ao remover imagem ${imageName} do S3:`, error);
                        }
                    }
                    // Limpar o array de imagens a deletar após remover do S3
                    limparImagensDeletarLocalStorage();
                }
                
                // Atualizar localStorage com imagens selecionadas após salvar
                salvarImagensSelecionadasLocalStorage();
                
                // Limpar o ID provisório se a documentação foi salva com sucesso
                // (as imagens agora pertencem à documentação salva, não precisam ser limpas)
                if (provisionalFeatureId && provisionalFeatureId === featureId) {
                    console.log(`✅ Documentação salva com sucesso, mantendo imagens do featureId: ${featureId}`);
                    provisionalFeatureId = null;
                }
                
                // Limpar imagens adicionadas do localStorage (as imagens agora pertencem à documentação salva)
                limparImagensAdicionadasLocalStorage();
                
                // Limpar coberturas anteriores após salvar documentação (já foram salvas no JSON)
                limparTodasCoberturasAnterioresLocalStorage();
                
                // Limpar backup após salvar documentação com sucesso
                limparBackupLocalStorage();
                
                // Limpar resumo da descrição do produto após salvar (já foi salvo no JSON)
                localStorage.removeItem('resumoDescricaoProduto');
                console.log('✅ Resumo da descrição do produto limpo do localStorage após salvar');
                
                let message = isEdit ?
                    `Documentação atualizada com sucesso!\n\nArquivo: ${result.file_path}` :
                    `Evidência salva com sucesso!\n\nArquivo: ${result.file_path}\nDownload: ${result.download_url}`;
                
                // Salvar histórico de execução se for atualização e houver mudanças
                if (isEdit && typeof salvarHistoricoExecucao === 'function') {
                    await salvarHistoricoExecucao();
                }
                
                showSuccessPopup(isEdit ? 'Documentação atualizada com sucesso!\n\nVoltando para a tela inicial.' : 'Documentação salva com sucesso!\n\nVoltando para a tela inicial.');
                
                // Resetar status de edição para false
                if (isEdit && featureId) {
                    try {
                        await fetch(`/api/features/${featureId}/edit-status`, {
                            method: 'PUT',
                            headers: {
                                'Content-Type': 'application/json'
                            },
                            body: JSON.stringify({ inEdit: false })
                        });
                    } catch (error) {
                        console.error('Erro ao resetar status de edição:', error);
                    }
                }
                
                // Limpar flag de alterações não salvas após salvar com sucesso
                limparAlteracoesNaoSalvas();
                
                // Limpar localStorage exceto backup antes de voltar para index.html
                limparLocalStorageExcetoBackup();
                
                // Redirecionar para a página inicial após 3 segundos
                setTimeout(() => {
                    window.location.href = '/html/index.html';
                }, 3000);
            } else {
            if (result.code === 'DUPLICATE_NAME') {
                alert(`❌ ${result.message}\n\nPor favor, altere o nome da feature para um nome único.`);
            } else {
                alert(`Erro ao salvar evidência: ${result.message || 'Erro desconhecido'}`);
            }
            // Desbloquear botão em caso de erro
            desbloquearBotaoSalvar();
        }
    } catch (error) {
        console.error('Erro:', error);
        alert('Erro ao salvar evidência. Verifique se o servidor Node.js está rodando.');
        // Desbloquear botão em caso de erro
        desbloquearBotaoSalvar();
    }
}

function desbloquearBotaoSalvar() {
    const saveBtn = document.getElementById('save-btn');
    if (saveBtn) {
        saveBtn.disabled = false;
        saveBtn.textContent = 'Salvar Documentação';
        saveBtn.style.opacity = '1';
        saveBtn.style.cursor = 'pointer';
        // Remover estilos inline de background para permitir que o CSS :not(:disabled) funcione
        saveBtn.style.backgroundColor = '';
        saveBtn.style.borderColor = '';
    }
}

function salvarAnexos(nomeFeature, featureId) {
    // Simular salvamento de anexos (no navegador não é possível salvar arquivos diretamente)
    let anexosInfo = [];
    
    cenarios.forEach(cenario => {
        if (cenario.arquivos && cenario.arquivos.length > 0) {
            const pastaCT = `${featureId}_CT${String(cenario.id).padStart(3, '0')}`;
            
            cenario.arquivos.forEach(arquivo => {
                anexosInfo.push({
                    pasta: `anexos/${pastaCT}/`,
                    arquivo: arquivo.nome,
                    tamanho: arquivo.tamanho,
                    tipo: arquivo.tipo,
                    data: arquivo.data
                });
            });
        }
    });
    
    if (anexosInfo.length > 0) {
        console.log('Anexos a serem salvos:');
        anexosInfo.forEach(info => {
            console.log(`Pasta: ${info.pasta}`);
            console.log(`Arquivo: ${info.arquivo}`);
            console.log(`Tamanho: ${info.tamanho} bytes`);
            console.log(`Tipo: ${info.tipo}`);
            console.log(`Data: ${info.data}`);
            console.log('---');
        });
    }
}

function gerarHTMLCompleto() {
    const nomeFeature = document.querySelector('.feature-input').value || 'Feature_Sem_Nome';
    const data = document.getElementById('data').value || new Date().toISOString().split('T')[0];
    const testador = document.getElementById('testador').value || '';
    const ambiente = document.getElementById('ambiente').value || '';
    const navegador = document.getElementById('navegador').value || '';
    const dispositivo = document.getElementById('dispositivo').value || '';
    
    // Calcular estatísticas
    let aprovados = 0, reprovados = 0, bloqueados = 0;
    cenarios.forEach(cenario => {
        switch(cenario.status) {
            case 'aprovado': aprovados++; break;
            case 'reprovado': reprovados++; break;
            case 'bloqueado': bloqueados++; break;
        }
    });
    
    const totalCenarios = cenarios.length;
    const taxaAprovacao = totalCenarios > 0 ? Math.round((aprovados / totalCenarios) * 100) : 0;
    
    return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Documentação de Teste - ${nomeFeature}</title>
    <style>
        body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; line-height: 1.6; margin: 0; padding: 20px; background-color: #f5f5f5; }
        .container { max-width: 1200px; margin: 0 auto; background: white; padding: 30px; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
        .header { text-align: center; border-bottom: 3px solid #0066cc; padding-bottom: 20px; margin-bottom: 30px; }
        .header h1 { color: #0066cc; margin: 0; font-size: 28px; }
        .header h2 { color: #333; margin: 10px 0 0 0; font-size: 20px; }
        .section { margin-bottom: 30px; padding: 20px; border: 1px solid #ddd; border-radius: 5px; background-color: #fafafa; }
        .section h3 { color: #0066cc; margin-top: 0; border-bottom: 2px solid #0066cc; padding-bottom: 10px; }
        .info-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 15px; margin-bottom: 20px; }
        .info-item { display: flex; flex-direction: column; }
        .info-item label { font-weight: bold; color: #333; margin-bottom: 5px; }
        .test-case { margin-bottom: 20px; padding: 15px; border: 1px solid #ddd; border-radius: 5px; background: white; }
        .test-case h4 { color: #0066cc; margin-top: 0; }
        .two-columns { display: grid; grid-template-columns: 1fr 1fr; gap: 15px; margin-bottom: 15px; }
        .status-badge { display: inline-block; padding: 4px 8px; border-radius: 4px; font-size: 12px; font-weight: bold; }
        .status-aprovado { background: #d4edda; color: #155724; }
        .status-reprovado { background: #f8d7da; color: #721c24; }
        .status-bloqueado { background: #fff3cd; color: #856404; }
        .bugs-table { width: 100%; border-collapse: collapse; margin-top: 15px; }
        .bugs-table th, .bugs-table td { border: 1px solid #ddd; padding: 10px; text-align: left; }
        .bugs-table th { background-color: #f0f8ff; font-weight: bold; }
        .summary-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 20px; margin: 20px 0; }
        .summary-item { text-align: center; padding: 15px; background-color: #f0f8ff; border-radius: 5px; }
        .summary-item h4 { margin: 0 0 10px 0; color: #0066cc; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>DOCUMENTAÇÃO DE TESTE</h1>
            <h2>Feature: ${nomeFeature}</h2>
        </div>

        <div class="section">
            <h3>INFORMAÇÕES DO TESTE</h3>
            <div class="info-grid">
                <div class="info-item">
                    <label>Data:</label>
                    <span>${data}</span>
                </div>
                <div class="info-item">
                    <label>Testador:</label>
                    <span>${testador}</span>
                </div>
                <div class="info-item">
                    <label>Ambiente:</label>
                    <span>${ambiente}</span>
                </div>
                <div class="info-item">
                    <label>Navegador:</label>
                    <span>${navegador}</span>
                </div>
                <div class="info-item">
                    <label>Dispositivo:</label>
                    <span>${dispositivo}</span>
                </div>
            </div>
        </div>

        <div class="section">
            <h3>CENÁRIOS DE TESTE</h3>
            ${cenarios.map(cenario => {
                return `
                <div class="test-case">
                    <div class="test-case-content">
                        <div class="two-columns">
                            <div>
                                <h5>Pré-condições:</h5>
                                <p>${cenario.precondicoes.replace(/\n/g, '<br>')}</p>
                            </div>
                            <div>
                                <h5>Passos:</h5>
                                <p>${cenario.passos.replace(/\n/g, '<br>')}</p>
                            </div>
                        </div>
                        
                        <div>
                            <h5>Resultado Esperado:</h5>
                            <p>${cenario.resultadoEsperado.replace(/\n/g, '<br>')}</p>
                        </div>
                        
                        <div>
                            <h5>Status:</h5>
                            <span class="status-badge status-${cenario.status || 'sem-status'}">${cenario.status || 'Não executado'}</span>
                        </div>
                        
                        ${cenario.arquivos && cenario.arquivos.length > 0 ? `
                            <div>
                                <h5>Anexos:</h5>
                                <ul>
                                    ${cenario.arquivos.map(arquivo => `<li>${arquivo.nome}</li>`).join('')}
                                </ul>
                            </div>
                        ` : ''}
                    </div>
                </div>
                `;
            }).join('')}
        </div>

        ${bugs.length > 0 ? `
        <div class="section">
            <h3>BUGS ENCONTRADOS</h3>
            <table class="bugs-table">
                <thead>
                    <tr>
                        <th>CT</th>
                        <th>Descrição</th>
                        <th>Link Jira</th>
                        <th>Severidade</th>
                    </tr>
                </thead>
                <tbody>
                    ${bugs.map(bug => `
                        <tr>
                            <td>${bug.ct}</td>
                            <td>${bug.descricao}</td>
                            <td>${bug.linkJira ? `<a href="${bug.linkJira}" target="_blank">${bug.linkJira}</a>` : '-'}</td>
                            <td>${bug.severidade}</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        </div>
        ` : ''}

        <div class="section">
            <h3>RESUMO DOS TESTES</h3>
            <div class="summary-grid">
                <div class="summary-item">
                    <h4>Total de Casos de Teste</h4>
                    <span>${cenarios.length}</span>
                </div>
                <div class="summary-item">
                    <h4>Aprovados</h4>
                    <span>${aprovados}</span>
                </div>
                <div class="summary-item">
                    <h4>Reprovados</h4>
                    <span>${reprovados}</span>
                </div>
                <div class="summary-item">
                    <h4>Bloqueados</h4>
                    <span>${bloqueados}</span>
                </div>
                <div class="summary-item">
                    <h4>Taxa de Aprovação</h4>
                    <span>${taxaAprovacao}%</span>
                </div>
            </div>
        </div>
    </div>
</body>
</html>`;
}

// Atualizar contadores baseado nos status dos cenários
function atualizarContadores() {
    
    // Verificar se estamos na página de edição (template.html)
    // Se não há elementos de sumário, não executar
    const totalTestesEl = document.getElementById('totalTestes');
    if (!totalTestesEl) {
        return;
    }
    
    let aprovados = 0;
    let reprovados = 0;
    let bloqueados = 0;
    
    // Contar baseado nos dados dos cenários, não nos radio buttons visíveis
    cenarios.forEach(cenario => {
        switch(cenario.status) {
            case 'aprovado':
                aprovados++;
                break;
            case 'reprovado':
                reprovados++;
                break;
            case 'bloqueado':
                bloqueados++;
                break;
        }
    });
    
    
    // Verificar se os elementos do sumário existem antes de atualizá-los
    const aprovadosEl = document.getElementById('aprovados');
    const reprovadosEl = document.getElementById('reprovados');
    const bloqueadosEl = document.getElementById('bloqueados');
    
    if (totalTestesEl) totalTestesEl.value = cenarios.length;
    if (aprovadosEl) aprovadosEl.value = aprovados;
    if (reprovadosEl) reprovadosEl.value = reprovados;
    if (bloqueadosEl) bloqueadosEl.value = bloqueados;
    
    // Só calcular taxa se o elemento existir
    const taxaAprovacaoEl = document.getElementById('taxaAprovacao');
    if (taxaAprovacaoEl) {
        calcularTaxaAprovacao();
    }
}

// Adicionar listeners para todos os radio buttons
function adicionarListeners() {
    // Event listener para botões de remover arquivo
    document.addEventListener('click', function(e) {
        if (e.target.classList.contains('remove-file')) {
            const cenarioId = parseInt(e.target.getAttribute('data-cenario-id'));
            const nomeArquivo = e.target.getAttribute('data-arquivo-nome');
            if (cenarioId && nomeArquivo) {
                removerArquivo(cenarioId, nomeArquivo);
            }
        }
    });
}

// Funções para gerenciar arquivos
async function anexarArquivo(cenarioId, input) {
    const cenario = cenarios.find(c => c.id === cenarioId);
    if (!cenario) return;

    const files = Array.from(input.files);
    const featureInput = document.querySelector('.feature-input');
    const featureName = featureInput ? featureInput.value.trim() : 'Feature_Sem_Nome';
    
    // Se o nome ainda for "Exemplo", usar um nome padrão
    const finalFeatureName = featureName === 'Exemplo' ? 'Feature_Sem_Nome' : featureName;
    
    // Verificar limite de arquivos por caso de teste (máximo 5)
    const arquivosExistentes = cenario.arquivos ? cenario.arquivos.length : 0;
    if (arquivosExistentes + files.length > 5) {
        alert(`❌ Limite de arquivos excedido! Máximo 5 arquivos por caso de teste.\nArquivos atuais: ${arquivosExistentes}\nTentando adicionar: ${files.length}`);
        input.value = ''; // Limpar o input
        return;
    }
    
    for (const file of files) {
        // Verificar tamanho do arquivo (máximo 10MB)
        const maxSize = 10 * 1024 * 1024; // 10MB em bytes
        if (file.size > maxSize) {
            alert(`❌ Arquivo muito grande! "${file.name}"\nTamanho: ${(file.size / (1024 * 1024)).toFixed(2)}MB\nLimite: 10MB`);
            input.value = ''; // Limpar o input
            return;
        }
        
        // Armazenar arquivo para upload posterior (não enviar imediatamente)
        const arquivoInfo = {
            file: file,
            cenarioId: cenarioId,
            featureName: finalFeatureName,
            featureId: document.getElementById('feature-id').value || '1',
            id: Date.now() + Math.random() // ID único para o arquivo
        };
        
        // Adicionar aos arquivos pendentes de upload
        arquivosParaUpload.push(arquivoInfo);
        
        // Adicionar visualmente ao cenário (a ser enviado quando salvar)
        const arquivo = {
            nome: file.name,
            tamanho: file.size,
            tipo: file.type,
            data: new Date().toISOString(),
            pendente: true // Marcar como pendente
        };
        
        cenario.arquivos.push(arquivo);
        console.log(`📎 Arquivo "${file.name}" adicionado localmente. Será enviado ao salvar a documentação.`);
    }
    
    renderizarCenarios();
    
    // Salvar backup após anexar arquivo
    salvarBackupLocalStorage();
}

async function removerArquivo(cenarioId, nomeArquivo) {
    const cenario = cenarios.find(c => c.id === cenarioId);
    if (!cenario) {
        console.log(`❌ Cenário ${cenarioId} não encontrado`);
        return;
    }

    console.log(`🗑️ Tentando remover arquivo "${nomeArquivo}" do CT${String(cenarioId).padStart(3, '0')}`);
    console.log(`   Arquivos atuais:`, cenario.arquivos);

    // Normalizar o array de arquivos para suportar strings e objetos
    const arquivosNormalizados = cenario.arquivos.map((a, index) => {
        if (typeof a === 'string') {
            // Se é string (arquivo já salvo), converter para objeto
            return { nome: a, pendente: false, index };
        } else if (typeof a === 'object') {
            // Se é objeto, manter e adicionar índice
            return { ...a, index };
        }
        return null;
    }).filter(a => a !== null);

    // Encontrar o arquivo no array normalizado
    const arquivo = arquivosNormalizados.find(a => a.nome === nomeArquivo);
    if (!arquivo) {
        console.log(`❌ Arquivo "${nomeArquivo}" não encontrado no array`);
        return;
    }

    // Se o arquivo é pendente (não foi enviado ainda), remover da lista de pendentes
    if (arquivo.pendente) {
        arquivosParaUpload = arquivosParaUpload.filter(a => a.cenarioId !== cenarioId || a.file.name !== nomeArquivo);
        console.log(`📎 Arquivo pendente "${nomeArquivo}" removido da lista de upload`);
    } else {
        // Se o arquivo já foi enviado, marcar para deleção
        const featureId = document.getElementById('feature-id').value || '';
        
        // Usar o nome do arquivo diretamente (já inclui o featureId se necessário)
        let nomeFinalArquivo = nomeArquivo;
        
        // Se o arquivo não tem o formato com featureId (ex: DCLYIW_CT001.pdf), usar diretamente
        // Isso funciona porque o servidor já salvou com esse formato
        
        // Adicionar à lista de arquivos para deletar (será deletado quando salvar)
        arquivosParaDeletar.push(nomeFinalArquivo);
        console.log(`📋 Arquivo "${nomeFinalArquivo}" marcado para deleção ao salvar`);
    }

    // Remover do array local (suportar strings e objetos)
    cenario.arquivos = cenario.arquivos.filter(a => {
        const nomeDoArquivo = typeof a === 'string' ? a : a.nome;
        return nomeDoArquivo !== nomeArquivo;
    });
    
    console.log(`✅ Arquivo removido. Arquivos restantes:`, cenario.arquivos);
    renderizarCenarios();
    
    // Salvar backup após remover arquivo
    salvarBackupLocalStorage();
}

// Função para deletar os arquivos marcados para deleção
async function deletarArquivosMarcados() {
    if (arquivosParaDeletar.length === 0) {
        return;
    }
    
    console.log(`🗑️ Deletando ${arquivosParaDeletar.length} arquivo(s) do servidor...`);
    
    for (const nomeArquivo of arquivosParaDeletar) {
        try {
            const response = await fetch(`/api/attachments/${encodeURIComponent(nomeArquivo)}`, {
                method: 'DELETE'
            });
            
            const result = await response.json();
            
            if (result.success) {
                console.log(`✅ Anexo removido do servidor: ${nomeArquivo}`);
            } else {
                console.warn(`⚠️ Aviso ao remover anexo: ${nomeArquivo} - ${result.message}`);
            }
        } catch (error) {
            console.error(`❌ Erro ao remover anexo do servidor: ${nomeArquivo}`, error);
        }
    }
    
    // Limpar lista após deletar
    arquivosParaDeletar = [];
}

// Função para atualizar o sumário dos casos de teste
function atualizarBotaoSalvar() {
    const saveBtn = document.getElementById('save-btn');
    if (!saveBtn) return;
    
    // Verificar se estamos editando (URL contém ?edit=)
    const isEditing = window.location.search.includes('edit=');
    
    // Habilitar botão se houver pelo menos 1 caso de teste
    if (cenarios.length > 0) {
        saveBtn.disabled = false;
    } else {
        // Se estiver editando, manter habilitado mesmo sem CTs
        // Se estiver criando, desabilitar sem CTs
        saveBtn.disabled = !isEditing;
    }
}

function atualizarSumario() {
    const container = document.getElementById('test-summary');
    if (!container) return;

    if (cenarios.length === 0) {
        container.innerHTML = '<p>Nenhum caso de teste cadastrado.</p>';
        return;
    }

    const sumarioHTML = cenarios.map(cenario => {
        const ctId = `CT${String(cenario.id).padStart(3, '0')}`;
        const titulo = cenario.titulo || 'Sem Título';
        const status = cenario.status || 'Não executado';
        
        return `<div class="summary-item">
            <span class="ct-id">${ctId}</span>
            <span class="ct-title">${titulo}</span>
            <span class="ct-status status-${status}">${status}</span>
        </div>`;
    }).join('');

    container.innerHTML = sumarioHTML;
}

// Função para toggle do sumário
function toggleSummary() {
    const summary = document.getElementById('test-summary');
    const button = document.getElementById('collapse-summary');
    
    if (summary.classList.contains('collapsed')) {
        summary.classList.remove('collapsed');
        button.textContent = '▲ Ocultar';
    } else {
        summary.classList.add('collapsed');
        button.textContent = '▼ Expandir';
    }
}

// Função para toggle dos bugs
function toggleBugs() {
    const bugsContainer = document.getElementById('bugs-container');
    const button = document.getElementById('collapse-bugs');
    
    if (bugsContainer.classList.contains('collapsed')) {
        bugsContainer.classList.remove('collapsed');
        button.textContent = '▲ Ocultar';
    } else {
        bugsContainer.classList.add('collapsed');
        button.textContent = '▼ Expandir';
    }
}

// Funções para gerenciar bugs
function adicionarBug(cenarioId) {
    const cenario = cenarios.find(c => c.id === cenarioId);
    if (!cenario) return;

    const modal = document.getElementById('modalAdicionarBug');
    modal.style.display = 'block';
    
    // Limpar campo
    document.getElementById('bug-jira').value = '';
    
    // Armazenar o cenarioId para usar na confirmação
    modal.dataset.cenarioId = cenarioId;
}

// Função para adicionar bug dentro do CT
function adicionarBugCT(cenarioId) {
    const cenario = cenarios.find(c => c.id === cenarioId);
    if (!cenario) return;

    const modal = document.getElementById('modalAdicionarBug');
    modal.style.display = 'block';
    
    // Limpar campo
    document.getElementById('bug-jira').value = '';
    
    // Armazenar o cenarioId para usar na confirmação
    modal.dataset.cenarioId = cenarioId;
    modal.dataset.origem = 'ct'; // Marcar que veio do CT
}

function adicionarBugGeral() {
    const modal = document.getElementById('modalAdicionarBug');
    modal.style.display = 'block';
    
    // Limpar campos
    document.getElementById('bug-descricao').value = '';
    document.getElementById('bug-jira').value = '';
    
    // Atualizar contador de caracteres
    const charCount = document.querySelector('.char-count');
    if (charCount) {
        charCount.textContent = '0/250 caracteres';
        charCount.classList.remove('warning', 'danger');
    }
    
    // Limpar o cenarioId do modal
    delete modal.dataset.cenarioId;
}

function fecharModalAdicionarBug() {
    const modal = document.getElementById('modalAdicionarBug');
    modal.style.display = 'none';
    
    // Limpar o cenarioId e origem do modal
    delete modal.dataset.cenarioId;
    delete modal.dataset.origem;
}

// Função para renderizar bugs dentro do CT
function renderizarBugsCT(cenarioId) {
    // Converter cenarioId para número se necessário
    const cenarioIdNum = parseInt(cenarioId);
    
    const bugsDoCT = bugs.filter(bug => {
        const bugCenarioId = parseInt(bug.cenarioId);
        return bugCenarioId === cenarioIdNum;
    });
    
    if (bugsDoCT.length === 0) {
        return '<div class="no-bugs-ct">Nenhum bug reportado para este CT</div>';
    }
    
    const html = bugsDoCT.map(bug => `
        <div class="bug-item-ct" data-bug-id="${bug.id}">
            <div class="bug-info-ct">
                <span class="bug-jira-ct">${bug.linkJira ? `<a href="${bug.linkJira}" target="_blank">Jira</a>` : '-'}</span>
            </div>
            <button type="button" class="btn-delete-bug-ct" onclick="abrirModalDeletarBug('${bug.id}')" title="Deletar bug">×</button>
        </div>
    `).join('');
    
    return html;
}

// Função para abrir modal de deletar bug
function abrirModalDeletarBug(bugId) {
    const bug = bugs.find(b => b.id === bugId);
    if (!bug) return;
    
    // Preencher informações do bug no modal
    document.getElementById('bug-descricao-info').textContent = bug.descricao || '-';
    document.getElementById('bug-jira-info').textContent = bug.linkJira || '-';
    
    // Armazenar o bugId para usar na confirmação
    const modal = document.getElementById('modalDeletarBug');
    modal.dataset.bugId = bugId;
    modal.style.display = 'block';
}

// Função para fechar modal de deletar bug
function fecharModalDeletarBug() {
    const modal = document.getElementById('modalDeletarBug');
    modal.style.display = 'none';
    delete modal.dataset.bugId;
}

// Função para confirmar deletar bug
function confirmarDeletarBug() {
    const modal = document.getElementById('modalDeletarBug');
    const bugId = modal.dataset.bugId;
    
    if (!bugId) return;
    
    // Encontrar o bug
    const bugIndex = bugs.findIndex(b => b.id === bugId);
    if (bugIndex === -1) return;
    
    const bug = bugs[bugIndex];
    
    // Remover do array
    bugs.splice(bugIndex, 1);
    
    // Atualizar renderização - sempre atualizar ambas as listas
    // Atualizar lista geral de bugs
    if (typeof renderizarBugs === 'function') {
        renderizarBugs();
    }
    
    // Atualizar bugs do CT específico (se existir)
    if (bug.cenarioId) {
        const bugsListCT = document.getElementById(`bugs-list-ct-${bug.cenarioId}`);
        if (bugsListCT && typeof renderizarBugsCT === 'function') {
            bugsListCT.innerHTML = renderizarBugsCT(bug.cenarioId);
        }
    }
    
    // Atualizar todos os CTs para garantir consistência
    if (typeof renderizarBugsCT === 'function') {
        cenarios.forEach(cenario => {
            const bugsListCT = document.getElementById(`bugs-list-ct-${cenario.id}`);
            if (bugsListCT) {
                bugsListCT.innerHTML = renderizarBugsCT(cenario.id);
            }
        });
    }
    
    fecharModalDeletarBug();
    
    // Salvar backup após deletar bug
    salvarBackupLocalStorage();
}

// Função para adicionar listeners de backup nos campos do formulário
function adicionarListenersBackupFormulario() {
    // Lista de campos que devem salvar backup ao serem alterados
    const camposFormulario = [
        '.feature-input',
        '#jira-link',
        '#ambiente',
        '#testador',
        '#navegador',
        '#dispositivo',
        '#squad',
        '#data',
        '#ultima-atualizacao',
        '#modo-teste',
        '#feature-text',
        '#observacao'
    ];
    
    camposFormulario.forEach(seletor => {
        const campo = document.querySelector(seletor);
        if (campo) {
            // Usar 'input' para campos de texto e 'change' para selects
            const evento = campo.tagName === 'SELECT' ? 'change' : 'input';
            campo.addEventListener(evento, () => {
                salvarBackupLocalStorage();
            });
        }
    });
}

function confirmarAdicionarBug() {
    const modal = document.getElementById('modalAdicionarBug');
    const descricao = document.getElementById('bug-descricao').value.trim();
    let linkJira = document.getElementById('bug-jira').value.trim();
    
    // Validar link do Jira se preenchido
    if (linkJira && !linkJira.includes('www') && !linkJira.includes('http')) {
        return;
    }
    
    // Remover localhost do URL se presente
    if (linkJira.includes('localhost:3001/html/')) {
        linkJira = linkJira.replace('http://localhost:3001/html/', '');
        linkJira = linkJira.replace('https://localhost:3001/html/', '');
    }
    
    const cenarioId = modal.dataset.cenarioId || null;
    const origem = modal.dataset.origem || 'geral';

    const novoBug = {
        id: `BUG${String(bugId++).padStart(3, '0')}`,
        cenarioId: cenarioId ? parseInt(cenarioId) : null, // Garantir que seja número ou null
        descricao: descricao,
        linkJira: linkJira,
        status: 'aberto',
        data: new Date().toISOString().split('T')[0],
        salvo: false // Marcar como não salvo
    };

    bugs.push(novoBug);
    
    // Atualizar renderização baseada na origem
    if (origem === 'ct') {
        const bugsListCT = document.getElementById(`bugs-list-ct-${cenarioId}`);
        
        if (bugsListCT) {
            const html = renderizarBugsCT(cenarioId);
            bugsListCT.innerHTML = html;
        }
        
        // Também atualizar o formulário existente para garantir consistência
        const existingForm = document.querySelector('.test-case');
        if (existingForm && typeof atualizarFormularioExistente === 'function') {
            const cenario = cenarios.find(c => c.id === parseInt(cenarioId));
            if (cenario) {
                atualizarFormularioExistente(existingForm, cenario);
            }
        }
        
        // Atualizar lista geral de bugs também
        renderizarBugs();
    } else {
        renderizarBugs();
    }
    
    fecharModalAdicionarBug();
    
    // Limpar o cenarioId e origem do modal
    delete modal.dataset.cenarioId;
    delete modal.dataset.origem;
    
    // Salvar backup após adicionar bug
    salvarBackupLocalStorage();
}

function renderizarBugs() {
    const bugsList = document.getElementById('bugs-list');
    bugsList.innerHTML = '';

    if (bugs.length === 0) {
        bugsList.innerHTML = '<div class="no-bugs">Nenhum bug reportado</div>';
        return;
    }

    bugs.forEach(bug => {
        const bugItem = document.createElement('div');
        bugItem.className = 'bug-item-single';
        bugItem.setAttribute('data-bug-id', bug.id);
        bugItem.innerHTML = `
            <input type="url" class="bug-jira" value="${bug.linkJira || ''}" placeholder="Link do Jira" onchange="atualizarBug('${bug.id}', 'linkJira', this.value)" onblur="validarJiraLink(this)">
            <textarea class="bug-descricao" placeholder="Descrição do bug (máximo 250 caracteres)" maxlength="250" onchange="atualizarBug('${bug.id}', 'descricao', this.value)">${bug.descricao || ''}</textarea>
            <button type="button" class="btn-remove-bug" onclick="removerBug('${bug.id}')" title="Remover bug">×</button>
        `;
        bugsList.appendChild(bugItem);
    });
}

function atualizarBug(bugId, campo, valor) {
    const bug = bugs.find(b => b.id === bugId);
    if (bug) {
        // Remover localhost do URL se presente
        if (campo === 'linkJira') {
            if (valor.includes('localhost:3001/html/')) {
                valor = valor.replace('http://localhost:3001/html/', '');
                valor = valor.replace('https://localhost:3001/html/', '');
                
                // Atualizar o valor do input para refletir a limpeza
                const inputs = document.querySelectorAll('input.bug-jira');
                inputs.forEach(input => {
                    if (input.getAttribute('onchange') && input.getAttribute('onchange').includes(`atualizarBug('${bugId}', 'linkJira'`)) {
                        input.value = valor;
                    }
                });
            }
        }
        
        bug[campo] = valor;
        
        // Atualizar bugs dentro dos CTs se o bug tiver cenarioId
        if (bug.cenarioId) {
            const bugsListCT = document.getElementById(`bugs-list-ct-${bug.cenarioId}`);
            if (bugsListCT && typeof renderizarBugsCT === 'function') {
                bugsListCT.innerHTML = renderizarBugsCT(bug.cenarioId);
            }
        }
        
        // Atualizar todos os CTs para garantir consistência
        if (typeof renderizarBugsCT === 'function') {
            cenarios.forEach(cenario => {
                const bugsListCT = document.getElementById(`bugs-list-ct-${cenario.id}`);
                if (bugsListCT) {
                    bugsListCT.innerHTML = renderizarBugsCT(cenario.id);
                }
            });
        }
    }
}

function removerBug(bugId) {
    // Usar modal de confirmação em vez de confirm()
    if (typeof showDeleteBugModal === 'function') {
        showDeleteBugModal(confirmarRemoverBug, bugId);
    } else {
        // Fallback para confirm() se modal não estiver disponível
        if (confirm('Tem certeza que deseja remover este bug?')) {
            confirmarRemoverBug(bugId);
        }
    }
}

function confirmarRemoverBug(bugId) {
    // Encontrar o bug antes de remover para obter o cenarioId
    const bug = bugs.find(b => b.id === bugId);
    
    // Remover do array
    bugs = bugs.filter(b => b.id !== bugId);
    
    // Atualizar lista geral de bugs
    renderizarBugs();
    
    // Atualizar bugs do CT específico (se existir)
    if (bug && bug.cenarioId) {
        const bugsListCT = document.getElementById(`bugs-list-ct-${bug.cenarioId}`);
        if (bugsListCT && typeof renderizarBugsCT === 'function') {
            bugsListCT.innerHTML = renderizarBugsCT(bug.cenarioId);
        }
    }
    
    // Atualizar todos os CTs para garantir consistência
    if (typeof renderizarBugsCT === 'function') {
        cenarios.forEach(cenario => {
            const bugsListCT = document.getElementById(`bugs-list-ct-${cenario.id}`);
            if (bugsListCT) {
                bugsListCT.innerHTML = renderizarBugsCT(cenario.id);
            }
        });
    }
}


// Funções para criar CT em massa
function abrirModalCriarEmMassa() {
    const modal = document.getElementById('modalCriarEmMassa');
    if (modal) {
        modal.style.display = 'block';
        console.log('✅ Modal aberto');
    }
    // Resetar o campo tipo para o valor padrão
    const tipoCT = document.getElementById('tipoCT');
    if (tipoCT) tipoCT.value = 'indefinido';
    gerarCamposCT(); // Gerar campos iniciais
}

function fecharModalCriarEmMassa() {
    const modal = document.getElementById('modalCriarEmMassa');
    if (modal) {
        modal.style.display = 'none';
        // Garantir que todas as classes de modal sejam removidas
        modal.classList.remove('show', 'active');
    }
    // Limpar campos
    const camposCT = document.getElementById('camposCT');
    const quantidadeCT = document.getElementById('quantidadeCT');
    const tipoCT = document.getElementById('tipoCT');
    if (camposCT) camposCT.innerHTML = '';
    if (quantidadeCT) quantidadeCT.value = 1;
    if (tipoCT) tipoCT.value = 'indefinido';
    
    console.log('✅ Modal fechado');
}

function gerarCamposCT() {
    const quantidade = parseInt(document.getElementById('quantidadeCT').value) || 1;
    const container = document.getElementById('camposCT');
    
    // Salvar valores existentes antes de limpar
    const valoresExistentes = {};
    const inputsExistentes = container.querySelectorAll('input[type="text"]');
    inputsExistentes.forEach(input => {
        valoresExistentes[input.id] = input.value;
    });
    
    container.innerHTML = '';
    
    // Encontrar o próximo ID disponível
    const proximoId = cenarios.length > 0 ? Math.max(...cenarios.map(c => c.id)) + 1 : 1;
    
    for (let i = 0; i < quantidade; i++) {
        const ctId = proximoId + i;
        const campoDiv = document.createElement('div');
        campoDiv.className = 'campo-ct';
        
        // Restaurar valor se existir
        const valorExistente = valoresExistentes[`ct_${ctId}`] || '';
        
        campoDiv.innerHTML = `
            <label>CT${String(ctId).padStart(3, '0')}:</label>
            <input type="text" id="ct_${ctId}" placeholder="Digite o título do caso de teste" value="${valorExistente}">
        `;
        container.appendChild(campoDiv);
    }
}

function adicionarUmCT() {
    const quantidadeInput = document.getElementById('quantidadeCT');
    const quantidadeAtual = parseInt(quantidadeInput.value) || 1;
    
    // Verificar se não excede o limite máximo
    if (quantidadeAtual >= 50) {
        alert('Máximo de 50 casos de teste permitidos.');
        return;
    }
    
    // Incrementar quantidade
    quantidadeInput.value = quantidadeAtual + 1;
    
    // Gerar campos atualizados
    gerarCamposCT();
}

function confirmarCriarEmMassa() {
    const quantidade = parseInt(document.getElementById('quantidadeCT').value) || 1;
    const tipoSelecionado = document.getElementById('tipoCT').value || 'indefinido';
    const proximoId = cenarios.length > 0 ? Math.max(...cenarios.map(c => c.id)) + 1 : 1;
    
    // Coletar títulos dos campos
    const novosCenarios = [];
    for (let i = 0; i < quantidade; i++) {
        const ctId = proximoId + i;
        const input = document.getElementById(`ct_${ctId}`);
        const titulo = input ? input.value.trim() : '';
        
        const novoCenario = {
            id: ctId,
            titulo: titulo ? `CT${String(ctId).padStart(3, '0')} - ${titulo}` : `CT${String(ctId).padStart(3, '0')} - Título a ser inserido`,
            precondicoes: '',
            passos: '',
            resultadoEsperado: '',
            status: 'na',
            arquivos: [],
            posicao: cenarios.length + novosCenarios.length + 1,
            fonte: 'usuário',
            tipo: tipoSelecionado
        };
        
        novosCenarios.push(novoCenario);
    }
    
    // Adicionar cenários ao array
    cenarios.push(...novosCenarios);
    // Aplicar filtros para atualizar cenariosFiltrados
    aplicarFiltros();
    cenarioAtual = cenariosFiltrados.length > 0 ? cenariosFiltrados.length : 1;
    
    // Resetar para primeira página
    currentPageCT = 1;
    
    // Atualizar interface
    renderizarCenarios();
    atualizarTabs();
    atualizarContadores();
    atualizarBotoesNavegacao();
    atualizarBotaoRemover();
    atualizarSumario();
    atualizarBotaoSalvar();
    
    // Fechar modal primeiro
    fecharModalCriarEmMassa();
    
    // Salvar backup após criar cenários em massa
    salvarBackupLocalStorage();
    
    // Atualizar visibilidade do botão de resumo e paginação
    setTimeout(() => {
        if (typeof window.atualizarVisibilidadeBotaoResumo === 'function') {
            window.atualizarVisibilidadeBotaoResumo();
        }
        if (typeof window.mostrarControlesPaginaCT === 'function') {
            window.mostrarControlesPaginaCT();
            // Garantir que as tabs são renderizadas com paginação
            if (typeof window.renderizarListaCenarios === 'function') {
                window.renderizarListaCenarios();
            }
        }
    }, 100);
    
}

// Funções para deletar CT em massa
function abrirModalDeletarEmMassa() {
    const modal = document.getElementById('modalDeletarEmMassa');
    modal.style.display = 'block';
    
    // Resetar seleções, página e filtros
    itensSelecionadosDelete.clear();
    paginaAtualDelete = 0;
    
    // Resetar filtros
    const filtroStatus = document.getElementById('filtro-status-delete');
    const filtroFonte = document.getElementById('filtro-fonte-delete');
    const filtroTipo = document.getElementById('filtro-tipo-delete');
    if (filtroStatus) filtroStatus.value = 'todos';
    if (filtroFonte) filtroFonte.value = 'todos';
    if (filtroTipo) filtroTipo.value = 'todos';
    
    // Controlar visibilidade do botão "Revisar Duplicidade" baseado na flag
    const btnRevisarDuplicidade = document.querySelector('[data-cy="btn-revisar-duplicidade"]');
    if (btnRevisarDuplicidade) {
        if (flagsConfig.revisarCTDuplicados) {
            btnRevisarDuplicidade.style.display = '';
        } else {
            btnRevisarDuplicidade.style.display = 'none';
        }
    }
    
    // Usar paginação se disponível, senão usar função original
    if (typeof mostrarControlesPaginaDelete === 'function') {
        mostrarControlesPaginaDelete();
    } else {
        gerarCheckboxesCT(); // Fallback para função original
    }
    
    // Atualizar contador inicial
    if (typeof atualizarContadorDelete === 'function') {
        atualizarContadorDelete();
    }
}

function fecharModalDeletarEmMassa() {
    const modal = document.getElementById('modalDeletarEmMassa');
    if (modal) {
        modal.style.display = 'none';
    }
    
    // Limpar checkboxes e seleções
    const checkboxesCT = document.getElementById('checkboxesCT');
    if (checkboxesCT) {
        checkboxesCT.innerHTML = '';
    }
    itensSelecionadosDelete.clear();
    paginaAtualDelete = 0;
}

// Função para fechar modal sem limpar seleções (usada antes de deletar)
function fecharModalDeletarEmMassaSemLimpar() {
    const modal = document.getElementById('modalDeletarEmMassa');
    if (modal) {
        modal.style.display = 'none';
    }
}

function aplicarFiltroDelete() {
    // Resetar para primeira página quando aplicar filtros
    paginaAtualDelete = 0;
    
    // Limpar seleções quando filtrar (opcional - pode remover se quiser manter seleções)
    // itensSelecionadosDelete.clear();
    
    // Aplicar filtros e regenerar checkboxes
    if (typeof mostrarControlesPaginaDelete === 'function') {
        mostrarControlesPaginaDelete();
    } else {
        gerarCheckboxesCT();
    }
    
    // Atualizar contador
    if (typeof atualizarContadorDelete === 'function') {
        atualizarContadorDelete();
    }
    
    // Atualizar texto do botão Selecionar Todos
    atualizarTextoBotaoSelecionarTodos();
}

function gerarCheckboxesCT() {
    const container = document.getElementById('checkboxesCT');
    container.innerHTML = '';
    
    if (cenarios.length === 0) {
        container.innerHTML = '<p style="text-align: center; color: #666; padding: 20px;">Nenhum caso de teste encontrado.</p>';
        return;
    }
    
    // Obter valores dos filtros
    const filtroStatus = document.getElementById('filtro-status-delete')?.value || 'todos';
    const filtroFonte = document.getElementById('filtro-fonte-delete')?.value || 'todos';
    const filtroTipo = document.getElementById('filtro-tipo-delete')?.value || 'todos';
    
    // Filtrar cenários
    let cenariosFiltrados = [...cenarios];
    
    // Aplicar filtro de status
    if (filtroStatus !== 'todos') {
        if (filtroStatus === 'na' || filtroStatus === 'nao_executado') {
            // N/A e Não executado são considerados iguais
            cenariosFiltrados = cenariosFiltrados.filter(cenario => {
                const status = cenario.status;
                return status === 'na' || status === '' || status === null || status === undefined ||
                       status === 'Não executado' || status === 'nao_executado';
            });
        } else {
            cenariosFiltrados = cenariosFiltrados.filter(cenario => (cenario.status || 'na') === filtroStatus);
        }
    }
    
    // Aplicar filtro de fonte
    if (filtroFonte !== 'todos') {
        cenariosFiltrados = cenariosFiltrados.filter(cenario => {
            const fonte = cenario.fonte || 'usuário';
            return fonte === filtroFonte;
        });
    }
    
    // Aplicar filtro de tipo
    if (filtroTipo !== 'todos') {
        cenariosFiltrados = cenariosFiltrados.filter(cenario => {
            const tipo = cenario.tipo || 'sem informação';
            return tipo === filtroTipo;
        });
    }
    
    if (cenariosFiltrados.length === 0) {
        container.innerHTML = '<p style="text-align: center; color: #666; padding: 20px;">Nenhum caso de teste encontrado com os filtros selecionados.</p>';
        return;
    }
    
    cenariosFiltrados.forEach(cenario => {
        const checkboxDiv = document.createElement('div');
        checkboxDiv.className = 'checkbox-ct';
        
        const anexosCount = cenario.arquivos ? cenario.arquivos.length : 0;
        const anexosInfo = anexosCount > 0 ? `(${anexosCount} anexo${anexosCount > 1 ? 's' : ''})` : '(sem anexos)';
        
        // Verificar se este item está selecionado
        const isSelected = itensSelecionadosDelete.has(cenario.id);
        if (isSelected) {
            checkboxDiv.classList.add('selected');
        }
        
        // Remover o prefixo "CT" do título, deixando apenas o número formatado
        let tituloTexto = cenario.titulo || `${String(cenario.id).padStart(3, '0')} - Sem Título`;
        tituloTexto = tituloTexto.replace(/^CT\s*/i, '');
        
        checkboxDiv.innerHTML = `
            <input type="checkbox" id="ct_${cenario.id}" value="${cenario.id}" ${isSelected ? 'checked' : ''}>
            <label>${tituloTexto}</label>
            <span class="ct-info">${anexosInfo}</span>
        `;
        
        // Adicionar evento de mudança para manter seleção
        const checkbox = checkboxDiv.querySelector('input[type="checkbox"]');
        
        checkbox.addEventListener('change', function() {
            if (this.checked) {
                itensSelecionadosDelete.add(cenario.id);
                checkboxDiv.classList.add('selected');
            } else {
                itensSelecionadosDelete.delete(cenario.id);
                checkboxDiv.classList.remove('selected');
            }
            console.log('🔍 DEBUG - Itens selecionados:', Array.from(itensSelecionadosDelete));
            // Atualizar texto do botão quando checkbox mudar
            atualizarTextoBotaoSelecionarTodos();
        });
        
        container.appendChild(checkboxDiv);
    });
    
    // Atualizar texto do botão Selecionar Todos
    atualizarTextoBotaoSelecionarTodos();
}

// Função para atualizar o texto do botão Selecionar Todos
function atualizarTextoBotaoSelecionarTodos() {
    const btnSelecionarTodos = document.getElementById('btn-selecionar-todos');
    if (!btnSelecionarTodos) return;
    
    // Obter valores dos filtros
    const filtroStatus = document.getElementById('filtro-status-delete')?.value || 'todos';
    const filtroFonte = document.getElementById('filtro-fonte-delete')?.value || 'todos';
    const filtroTipo = document.getElementById('filtro-tipo-delete')?.value || 'todos';
    
    // Filtrar cenários (mesma lógica)
    let cenariosFiltrados = [...cenarios];
    
    if (filtroStatus !== 'todos') {
        if (filtroStatus === 'na' || filtroStatus === 'nao_executado') {
            // N/A e Não executado são considerados iguais
            cenariosFiltrados = cenariosFiltrados.filter(cenario => {
                const status = cenario.status;
                return status === 'na' || status === '' || status === null || status === undefined ||
                       status === 'Não executado' || status === 'nao_executado';
            });
        } else {
            cenariosFiltrados = cenariosFiltrados.filter(cenario => (cenario.status || 'na') === filtroStatus);
        }
    }
    
    if (filtroFonte !== 'todos') {
        cenariosFiltrados = cenariosFiltrados.filter(cenario => {
            const fonte = cenario.fonte || 'usuário';
            return fonte === filtroFonte;
        });
    }
    
    if (filtroTipo !== 'todos') {
        cenariosFiltrados = cenariosFiltrados.filter(cenario => {
            const tipo = cenario.tipo || 'sem informação';
            return tipo === filtroTipo;
        });
    }
    
    const todosSelecionados = cenariosFiltrados.length > 0 && cenariosFiltrados.every(cenario => itensSelecionadosDelete.has(cenario.id));
    btnSelecionarTodos.textContent = todosSelecionados ? 'Deselecionar Todos' : 'Selecionar Todos';
}

// Função para selecionar/deselecionar todos os CTs (de todas as páginas)
function selecionarTodosCT() {
    // Obter valores dos filtros (mesma lógica de gerarCheckboxesCT)
    const filtroStatus = document.getElementById('filtro-status-delete')?.value || 'todos';
    const filtroFonte = document.getElementById('filtro-fonte-delete')?.value || 'todos';
    const filtroTipo = document.getElementById('filtro-tipo-delete')?.value || 'todos';
    
    // Filtrar cenários (mesma lógica de gerarCheckboxesCT)
    let cenariosFiltrados = [...cenarios];
    
    // Aplicar filtro de status
    if (filtroStatus !== 'todos') {
        if (filtroStatus === 'na' || filtroStatus === 'nao_executado') {
            // N/A e Não executado são considerados iguais
            cenariosFiltrados = cenariosFiltrados.filter(cenario => {
                const status = cenario.status;
                return status === 'na' || status === '' || status === null || status === undefined ||
                       status === 'Não executado' || status === 'nao_executado';
            });
        } else {
            cenariosFiltrados = cenariosFiltrados.filter(cenario => (cenario.status || 'na') === filtroStatus);
        }
    }
    
    // Aplicar filtro de fonte
    if (filtroFonte !== 'todos') {
        cenariosFiltrados = cenariosFiltrados.filter(cenario => {
            const fonte = cenario.fonte || 'usuário';
            return fonte === filtroFonte;
        });
    }
    
    // Aplicar filtro de tipo
    if (filtroTipo !== 'todos') {
        cenariosFiltrados = cenariosFiltrados.filter(cenario => {
            const tipo = cenario.tipo || 'sem informação';
            return tipo === filtroTipo;
        });
    }
    
    if (cenariosFiltrados.length === 0) {
        return;
    }
    
    // Verificar se todos já estão selecionados
    const todosSelecionados = cenariosFiltrados.every(cenario => itensSelecionadosDelete.has(cenario.id));
    
    if (todosSelecionados) {
        // Desmarcar todos
        cenariosFiltrados.forEach(cenario => {
            itensSelecionadosDelete.delete(cenario.id);
        });
    } else {
        // Selecionar todos
        cenariosFiltrados.forEach(cenario => {
            itensSelecionadosDelete.add(cenario.id);
        });
    }
    
    // Atualizar checkboxes visíveis
    if (typeof gerarCheckboxesCT === 'function') {
        gerarCheckboxesCT();
    }
    
    // Atualizar contador
    if (typeof atualizarContadorDelete === 'function') {
        atualizarContadorDelete();
    }
    
    // Atualizar texto do botão
    const btnSelecionarTodos = document.getElementById('btn-selecionar-todos');
    if (btnSelecionarTodos) {
        const todosSelecionadosAgora = cenariosFiltrados.every(cenario => itensSelecionadosDelete.has(cenario.id));
        btnSelecionarTodos.textContent = todosSelecionadosAgora ? 'Deselecionar Todos' : 'Selecionar Todos';
    }
}

function confirmarDeletarEmMassa() {
    // Verificar se há itens selecionados no Set
    if (itensSelecionadosDelete.size === 0) {
        if (typeof showWarningModal === 'function') {
            showWarningModal('Selecione pelo menos um caso de teste para deletar.');
        } else {
            alert('Selecione pelo menos um caso de teste para deletar.');
        }
        return;
    }
    
    // Mostrar modal de confirmação
    showDeleteModal(() => {
        executarDeletarEmMassaFromSet();
    });
}

async function executarDeletarEmMassaFromSet() {
    console.log('🔍 Itens selecionados:', Array.from(itensSelecionadosDelete));
    
    const idsParaDeletar = Array.from(itensSelecionadosDelete).map(id => parseInt(id));
    const cenariosParaDeletar = cenarios.filter(c => idsParaDeletar.includes(c.id));
    
    console.log('🗑️ Cenários para deletar:', cenariosParaDeletar);
    
    // Primeiro, remover arquivos pendentes de upload para estes CTs (não enviar se os CTs foram deletados)
    const arquivosPendentesRemovidos = arquivosParaUpload.filter(a => idsParaDeletar.includes(a.cenarioId));
    if (arquivosPendentesRemovidos.length > 0) {
        console.log(`🗑️ Removendo ${arquivosPendentesRemovidos.length} arquivo(s) pendente(s) dos CTs deletados`);
        arquivosParaUpload = arquivosParaUpload.filter(a => !idsParaDeletar.includes(a.cenarioId));
    }
    
    // Marcar anexos para deleção posterior (não deletar imediatamente)
    let anexosMarcados = 0;
    
    for (const cenario of cenariosParaDeletar) {
        if (cenario.arquivos && cenario.arquivos.length > 0) {
            for (const arquivo of cenario.arquivos) {
                // Ignorar arquivos pendentes (já foram removidos do array acima)
                if (arquivo.pendente) {
                    continue;
                }
                
                // Usar arquivo.nome que já vem no formato HASHID_CT001.extensao
                const nomeArquivo = arquivo.nome;
                console.log(`📋 Marcando anexo do CT ${cenario.id} para deleção: ${nomeArquivo}`);
                
                // Adicionar à lista de arquivos para deletar (será deletado quando salvar)
                if (!arquivosParaDeletar.includes(nomeArquivo)) {
                    arquivosParaDeletar.push(nomeArquivo);
                    anexosMarcados++;
                    console.log(`✅ Anexo marcado para deleção: ${nomeArquivo}`);
                }
            }
        }
    }
    
    if (anexosMarcados > 0) {
        console.log(`📋 ${anexosMarcados} anexo(s) marcado(s) para deleção ao salvar (de ${cenariosParaDeletar.length} CT(s))`);
    }
    
    // Deletar cenários do array principal
    cenarios = cenarios.filter(c => !idsParaDeletar.includes(c.id));
    
    // Atualizar cenariosFiltrados se existir
    if (typeof cenariosFiltrados !== 'undefined') {
        cenariosFiltrados = cenariosFiltrados.filter(c => !idsParaDeletar.includes(c.id));
    }
    
    // Atualizar interface
    renderizarCenarios();
    atualizarTabs();
    atualizarBotoesNavegacao();
    atualizarBotaoRemover();
    atualizarContadores();
    atualizarSumario();
    
    // Atualizar visibilidade do botão de resumo
    if (typeof atualizarVisibilidadeBotaoResumo === 'function') {
        atualizarVisibilidadeBotaoResumo();
    }
    
    // Atualizar estado do botão e campo de geração IA após deletar casos de teste
    if (typeof atualizarEstadoGeracaoIA === 'function') {
        atualizarEstadoGeracaoIA();
    }
    
    // Limpar coberturas dos tipos específicos dos CTs deletados do localStorage
    const tiposDeletados = new Set();
    cenariosParaDeletar.forEach(cenario => {
        const tipoCT = cenario.tipo || 'funcional';
        tiposDeletados.add(tipoCT);
    });
    
    // Limpar cobertura de cada tipo deletado
    tiposDeletados.forEach(tipo => {
        limparCoberturaTipoLocalStorage(tipo);
    });
    
    // Salvar backup no localStorage e marcar alterações não salvas
    salvarBackupLocalStorage();
    
    // Limpar seleções
    itensSelecionadosDelete.clear();
    
    // Atualizar paginação se necessário
    if (typeof window.mostrarControlesPaginaCT === 'function') {
        window.mostrarControlesPaginaCT();
    }
    if (typeof window.renderizarListaCenarios === 'function') {
        window.renderizarListaCenarios();
    }
    
    // Mostrar mensagem de sucesso
    let mensagemSucesso = `✅ ${cenariosParaDeletar.length} caso(s) de teste deletado(s) com sucesso!`;
    if (anexosMarcados > 0) {
        mensagemSucesso += `\n📎 ${anexosMarcados} anexo(s) marcado(s) para deleção ao salvar.`;
    }
    showSuccessPopup(mensagemSucesso);
}

function executarDeletarEmMassa(checkboxes) {
    const idsParaDeletar = Array.from(checkboxes).map(cb => parseInt(cb.value));
    const cenariosParaDeletar = cenarios.filter(c => idsParaDeletar.includes(c.id));
    
    // Primeiro, remover arquivos pendentes de upload para estes CTs (não enviar se os CTs foram deletados)
    const arquivosPendentesRemovidos = arquivosParaUpload.filter(a => idsParaDeletar.includes(a.cenarioId));
    if (arquivosPendentesRemovidos.length > 0) {
        console.log(`🗑️ Removendo ${arquivosPendentesRemovidos.length} arquivo(s) pendente(s) dos CTs deletados`);
        arquivosParaUpload = arquivosParaUpload.filter(a => !idsParaDeletar.includes(a.cenarioId));
    }
    
    // Marcar anexos para deleção posterior (não deletar imediatamente)
    let anexosMarcados = 0;
    
    for (const cenario of cenariosParaDeletar) {
        if (cenario.arquivos && cenario.arquivos.length > 0) {
            for (const arquivo of cenario.arquivos) {
                // Ignorar arquivos pendentes (já foram removidos do array acima)
                if (arquivo.pendente) {
                    continue;
                }
                
                const nomeArquivo = arquivo.filename || arquivo.nome;
                console.log(`📋 Marcando anexo do CT ${cenario.id} para deleção: ${nomeArquivo}`);
                
                // Adicionar à lista de arquivos para deletar (será deletado quando salvar)
                if (!arquivosParaDeletar.includes(nomeArquivo)) {
                    arquivosParaDeletar.push(nomeArquivo);
                    anexosMarcados++;
                    console.log(`✅ Anexo marcado para deleção: ${nomeArquivo}`);
                }
            }
        }
    }
    
    if (anexosMarcados > 0) {
        console.log(`📋 ${anexosMarcados} anexo(s) marcado(s) para deleção ao salvar (de ${cenariosParaDeletar.length} CT(s))`);
    }
    
    // Remover cenários dos arrays
    cenarios = cenarios.filter(c => !idsParaDeletar.includes(c.id));
    cenariosFiltrados = cenariosFiltrados.filter(c => !idsParaDeletar.includes(c.id));
    
    // Ajustar cenário atual
    if (cenariosFiltrados.length === 0) {
        cenarioAtual = 0;
    } else if (cenarioAtual > cenariosFiltrados.length) {
        cenarioAtual = cenariosFiltrados.length;
    } else if (cenarioAtual < 1) {
        cenarioAtual = 1;
    }
    
    // Atualizar interface
    renderizarCenarios();
    atualizarTabs();
    atualizarContadores();
    atualizarBotoesNavegacao();
    atualizarBotaoRemover();
    atualizarSumario();
    atualizarBotaoSalvar();
    
        // Atualizar estado do botão e campo de geração IA após deletar casos de teste
        if (typeof atualizarEstadoGeracaoIA === 'function') {
            atualizarEstadoGeracaoIA();
        }
        
        // Limpar coberturas dos tipos específicos dos CTs deletados do localStorage
        const tiposDeletados = new Set();
        cenariosParaDeletar.forEach(cenario => {
            const tipoCT = cenario.tipo || 'funcional';
            tiposDeletados.add(tipoCT);
        });
        
        // Limpar cobertura de cada tipo deletado
        tiposDeletados.forEach(tipo => {
            limparCoberturaTipoLocalStorage(tipo);
            // Remover flag de CTs adicionados se existir
            const tipoParaCobertura = tipo === 'indefinido' ? 'funcional' : tipo;
            const chaveCtsAdicionados = `cts_adicionados_${tipoParaCobertura.toLowerCase()}`;
            localStorage.removeItem(chaveCtsAdicionados);
            console.log(`🗑️ Flag de CTs adicionados removida para ${tipo}`);
        });
        
        // Salvar backup no localStorage e marcar alterações não salvas
        salvarBackupLocalStorage();
        
        // Fechar modal
        fecharModalDeletarEmMassa();
    
    let mensagem = `${cenariosParaDeletar.length} caso(s) de teste deletado(s) com sucesso!`;
    if (anexosMarcados > 0) {
        mensagem += `\n📎 ${anexosMarcados} anexo(s) marcado(s) para deleção ao salvar.`;
    }
    showSuccessPopup(mensagem);
}

// Funções para modal de resumo
// Variáveis globais para paginação e filtros do modal de resumo
let cenariosFiltradosResumo = [];
function abrirModalResumo() {
    const modal = document.getElementById('modalResumo');
    const filtroStatus = document.getElementById('filtro-status');
    
    // Resetar filtros
    filtroStatus.value = 'todos';
    
    // Aplicar filtro inicial
    aplicarFiltroResumo();
    
    modal.style.display = 'block';
}

function aplicarFiltroResumo() {
    const filtroStatus = document.getElementById('filtro-status')?.value || 'todos';
    const filtroFonte = document.getElementById('filtro-fonte')?.value || 'todos';
    const filtroTipo = document.getElementById('filtro-tipo')?.value || 'todos';
    const lista = document.getElementById('resumo-lista');
    const contador = document.getElementById('resumo-contador');
    
    // Filtrar cenários
    if (typeof cenarios !== 'undefined' && cenarios.length > 0) {
        let filtrados = [...cenarios];
        
        // Aplicar filtro de status
        if (filtroStatus !== 'todos') {
            if (filtroStatus === 'na' || filtroStatus === 'nao_executado') {
                // N/A e Não executado são considerados iguais
                filtrados = filtrados.filter(cenario => {
                    const status = cenario.status;
                    return status === 'na' || status === '' || status === null || status === undefined ||
                           status === 'Não executado' || status === 'nao_executado';
                });
            } else {
                filtrados = filtrados.filter(cenario => (cenario.status || 'na') === filtroStatus);
            }
        }
        
        // Aplicar filtro de fonte
        if (filtroFonte !== 'todos') {
            filtrados = filtrados.filter(cenario => {
                const fonte = cenario.fonte || 'usuário';
                return fonte === filtroFonte;
            });
        }
        
        // Aplicar filtro de tipo
        if (filtroTipo !== 'todos') {
            filtrados = filtrados.filter(cenario => {
                const tipo = cenario.tipo || 'sem informação';
                return tipo === filtroTipo;
            });
        }
        
        cenariosFiltradosResumo = filtrados;
    } else {
        cenariosFiltradosResumo = [];
    }
    
    // Atualizar contador
    contador.textContent = `${cenariosFiltradosResumo.length} CT${cenariosFiltradosResumo.length !== 1 ? 's' : ''} encontrado${cenariosFiltradosResumo.length !== 1 ? 's' : ''}`;
    
    // Renderizar lista
    renderizarListaResumo();
}

function renderizarListaResumo() {
    const lista = document.getElementById('resumo-lista');
    lista.innerHTML = '';
    
    if (cenariosFiltradosResumo.length === 0) {
        lista.innerHTML = '<p style="text-align: center; color: #666; padding: 20px;">Nenhum caso de teste encontrado.</p>';
        return;
    }
    
    // Renderizar todos os casos de teste (sem paginação)
    cenariosFiltradosResumo.forEach(cenario => {
        const item = document.createElement('div');
        item.className = `resumo-item ${cenario.status || 'na'}`;
        
        const titulo = document.createElement('div');
        titulo.className = 'resumo-titulo';
        let tituloTexto = cenario.titulo || `${String(cenario.id).padStart(3, '0')}`;
        // Remover o prefixo "CT" do título, deixando apenas o número formatado
        tituloTexto = tituloTexto.replace(/^CT\s*/i, '');
        titulo.textContent = tituloTexto;
        
        const status = document.createElement('div');
        status.className = `resumo-status ${cenario.status || 'na'}`;
        status.textContent = getStatusText(cenario.status || 'na');
        
        // Criar span para quantidade de anexos (igual ao modal de deletar)
        const anexosCount = cenario.arquivos ? cenario.arquivos.length : 0;
        const anexosInfo = anexosCount > 0 ? `(${anexosCount} anexo${anexosCount > 1 ? 's' : ''})` : '(sem anexos)';
        const ctInfo = document.createElement('span');
        ctInfo.className = 'ct-info';
        ctInfo.textContent = anexosInfo;
        
        item.appendChild(titulo);
        item.appendChild(status);
        item.appendChild(ctInfo);
        lista.appendChild(item);
    });
}


function fecharModalResumo() {
    const modal = document.getElementById('modalResumo');
    modal.style.display = 'none';
}

function getStatusText(status) {
    const statusMap = {
        'aprovado': 'Aprovado',
        'reprovado': 'Reprovado',
        'bloqueado': 'Bloqueado',
        'pendente': 'Pendente',
        'na': 'N/A',
        'Não executado': 'Não executado'
    };
    return statusMap[status] || 'N/A';
}

// Função de debug para verificar o estado dos cenários
function debugCenarios() {
    // Função de debug removida
}

// Função de teste para simular clique em radio button
function testarStatus(cenarioId, status) {
    atualizarStatus(cenarioId, status);
    debugCenarios();
}

// Função para ocultar seções durante criação de nova documentação
function ocultarSecoesNaCriacao() {
    // Verificar se é uma nova documentação (sem parâmetro ?edit=)
    const isNewDocumentation = !window.location.search.includes('edit=');
    
    if (isNewDocumentation) {
        // Ocultar seção geral de bugs
        const bugsSection = document.getElementById('bugs-section');
        if (bugsSection) {
            bugsSection.style.display = 'none';
        }
        
        // Ocultar botão Aprovar Todos
        const btnApproveAll = document.querySelector('[data-cy="btn-approve-all"]');
        if (btnApproveAll) {
            btnApproveAll.style.display = 'none';
        }
    }
    
    // Atualizar visibilidade do botão de resumo (funciona tanto em criação quanto edição)
    if (typeof atualizarVisibilidadeBotaoResumo === 'function') {
        atualizarVisibilidadeBotaoResumo();
    }
}

// Função para mostrar modal de confirmação de deletar CT individual
function showDeleteCTModal(onConfirm, ctInfo) {
    const confirmMessage = `Tem certeza que deseja remover o caso de teste "${ctInfo.titulo}"?`;
    if (confirm(confirmMessage)) {
        onConfirm();
    }
}

// Função para mostrar modal de confirmação de deletar em massa
function showDeleteModal(onConfirm) {
    const count = itensSelecionadosDelete.size;
    if (count === 0) {
        if (typeof showWarningModal === 'function') {
            showWarningModal('Selecione pelo menos um caso de teste para deletar.');
        } else {
            alert('Selecione pelo menos um caso de teste para deletar.');
        }
        return;
    }
    
    // Armazenar a função de callback
    window.pendingDeleteCallback = onConfirm;
    
    const title = 'Confirmar Exclusão de Casos de Teste';
    const casoTexto = count === 1 ? 'caso' : 'casos';
    const message = `Tem certeza que deseja deletar <strong>${count}</strong> ${casoTexto} de teste?`;
    const confirmButtonText = 'Confirmar';
    const warningMessage = '<p><strong>⚠️ Atenção:</strong> Esta ação irá deletar permanentemente os casos de teste selecionados e todos os seus anexos vinculados. Esta ação não pode ser desfeita.</p>';
    
    const onConfirmAction = () => {
        // Salvar callback antes de fechar o modal
        const callbackToExecute = window.pendingDeleteCallback;
        
        // Fechar modal de deletar em massa (sem limpar seleções)
        fecharModalDeletarEmMassaSemLimpar();
        
        console.log('🔍 Itens selecionados antes de deletar:', Array.from(itensSelecionadosDelete));
        
        // Executar callback se existir (com pequeno delay para garantir fechamento dos modais)
        if (typeof callbackToExecute === 'function') {
            setTimeout(() => {
                console.log('✅ Executando callback de deleção');
                callbackToExecute();
            }, 100);
        } else {
            console.error('❌ Callback não encontrado');
        }
        
        // Limpar callback
        delete window.pendingDeleteCallback;
    };
    
    if (typeof showConfirmModal === 'function') {
        showConfirmModal(title, message, confirmButtonText, onConfirmAction, warningMessage);
        console.log('✅ Modal de confirmação aberto');
    } else {
        // Fallback para confirm caso o modal não exista
        if (confirm(`${message}\n\nEsta ação irá deletar permanentemente os casos de teste selecionados e todos os seus anexos vinculados. Esta ação não pode ser desfeita.`)) {
            onConfirmAction();
        }
    }
}

// Função para fechar modal de confirmação de deletar CTs (mantida para compatibilidade)
function closeConfirmDeleteCTModal() {
    // Tentar fechar usando o novo componente primeiro
    if (typeof closeConfirmModal === 'function') {
        closeConfirmModal();
    } else {
        // Fallback para o modal antigo
        const modal = document.getElementById('confirmDeleteCTModal');
        if (modal) {
            modal.style.display = 'none';
        }
    }
    // Limpar callback
    delete window.pendingDeleteCallback;
}

// Função para confirmar e prosseguir com a deleção (mantida para compatibilidade)
function proceedDeleteCTs() {
    console.log('🔍 Callback disponível:', typeof window.pendingDeleteCallback);
    
    // Salvar callback antes de fechar o modal
    const callbackToExecute = window.pendingDeleteCallback;
    
    // Fechar modal de confirmação (agora usa o novo componente)
    if (typeof closeConfirmModal === 'function') {
        closeConfirmModal();
    } else {
        closeConfirmDeleteCTModal();
    }
    
    // Fechar modal de deletar em massa (sem limpar seleções)
    fecharModalDeletarEmMassaSemLimpar();
    
    console.log('🔍 Itens selecionados antes de deletar:', Array.from(itensSelecionadosDelete));
    
    // Executar callback se existir (com pequeno delay para garantir fechamento dos modais)
    if (typeof callbackToExecute === 'function') {
        setTimeout(() => {
            console.log('✅ Executando callback de deleção');
            callbackToExecute();
        }, 100);
    } else {
        console.error('❌ Callback não encontrado');
    }
    
    // Limpar callback
    delete window.pendingDeleteCallback;
}

// Expor funções globalmente
window.closeConfirmDeleteCTModal = closeConfirmDeleteCTModal;
window.proceedDeleteCTs = proceedDeleteCTs;

// Função para revisar duplicidade de casos de teste
async function revisarDuplicidade() {
    // Verificar se há casos de teste
    if (!cenarios || cenarios.length === 0) {
        if (typeof showWarningModal === 'function') {
            showWarningModal('Não há casos de teste para analisar.');
        } else {
            alert('Não há casos de teste para analisar.');
        }
        return;
    }
    
    // Preparar lista de casos de teste para análise
    const casosTeste = cenarios.map(ct => {
        // Extrair código do título se existir
        const codigoMatch = (ct.titulo || '').match(/CT(\d+)/i);
        const codigo = codigoMatch ? codigoMatch[0] : null;
        return {
            codigo: codigo,
            titulo: ct.titulo || 'Sem título'
        };
    });
    
    // Abrir modal e mostrar loading
    const modal = document.getElementById('modalDuplicatas');
    const loadingDiv = document.getElementById('duplicatas-loading');
    const contentDiv = document.getElementById('duplicatas-content');
    const errorDiv = document.getElementById('duplicatas-error');
    
    modal.style.display = 'flex';
    loadingDiv.style.display = 'block';
    contentDiv.style.display = 'none';
    errorDiv.style.display = 'none';
    
    // Mostrar todos os botões ao abrir o modal (podem ter sido ocultados anteriormente)
    const btnSelecionarTodos = document.getElementById('btn-selecionar-todos-duplicatas');
    const btnDeselecionarTodos = document.getElementById('btn-deselecionar-todos-duplicatas');
    const btnExcluir = document.getElementById('btn-excluir-duplicados');
    
    if (btnSelecionarTodos) btnSelecionarTodos.style.display = 'inline-block';
    if (btnDeselecionarTodos) btnDeselecionarTodos.style.display = 'inline-block';
    if (btnExcluir) btnExcluir.style.display = 'inline-block';
    
    // Desabilitar botões enquanto carrega
    atualizarEstadoBotoesDuplicatas();
    
    try {
        // Chamar API de análise de duplicatas
        const response = await fetch(`${AI_API_BASE_URL}/api/analyze-duplicates`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                casosTeste: casosTeste,
                provider: 'openai'
            })
        });
        
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'Erro ao analisar duplicatas');
        }
        
        const data = await response.json();
        
        // Log de tokens usados
        if (data.tokenInfo) {
            console.log(`📊 Tokens usados na análise de duplicatas: ${data.tokenInfo.totalTokens} (Prompt: ${data.tokenInfo.promptTokens}, Completion: ${data.tokenInfo.completionTokens})`);
        }
        
        // Ocultar loading e mostrar conteúdo
        loadingDiv.style.display = 'none';
        contentDiv.style.display = 'block';
        
        // Processar e exibir resultados
        exibirResultadosDuplicatas(data.analise);
        
    } catch (error) {
        console.error('Erro ao analisar duplicatas:', error);
        loadingDiv.style.display = 'none';
        errorDiv.style.display = 'block';
        document.getElementById('duplicatas-error-message').textContent = error.message || 'Erro desconhecido ao analisar duplicatas.';
        
        // Ocultar botões de ação em caso de erro, mostrar apenas Fechar
        const btnSelecionarTodos = document.getElementById('btn-selecionar-todos-duplicatas');
        const btnDeselecionarTodos = document.getElementById('btn-deselecionar-todos-duplicatas');
        const btnExcluir = document.getElementById('btn-excluir-duplicados');
        
        if (btnSelecionarTodos) btnSelecionarTodos.style.display = 'none';
        if (btnDeselecionarTodos) btnDeselecionarTodos.style.display = 'none';
        if (btnExcluir) btnExcluir.style.display = 'none';
    }
}

// Função para atualizar estado dos botões de duplicatas
function atualizarEstadoBotoesDuplicatas() {
    const checkboxes = document.querySelectorAll('#duplicatas-lista input[type="checkbox"]');
    const totalItens = checkboxes.length;
    const itensSelecionados = itensSelecionadosDuplicatas.size;
    
    const btnSelecionarTodos = document.getElementById('btn-selecionar-todos-duplicatas');
    const btnDeselecionarTodos = document.getElementById('btn-deselecionar-todos-duplicatas');
    const btnExcluir = document.getElementById('btn-excluir-duplicados');
    
    // Botões de selecionar/deselecionar todos: habilitados apenas se houver itens na lista
    if (btnSelecionarTodos) {
        if (totalItens > 0) {
            btnSelecionarTodos.disabled = false;
            btnSelecionarTodos.style.opacity = '1';
            btnSelecionarTodos.style.cursor = 'pointer';
        } else {
            btnSelecionarTodos.disabled = true;
            btnSelecionarTodos.style.opacity = '0.5';
            btnSelecionarTodos.style.cursor = 'not-allowed';
        }
    }
    
    if (btnDeselecionarTodos) {
        if (totalItens > 0) {
            btnDeselecionarTodos.disabled = false;
            btnDeselecionarTodos.style.opacity = '1';
            btnDeselecionarTodos.style.cursor = 'pointer';
        } else {
            btnDeselecionarTodos.disabled = true;
            btnDeselecionarTodos.style.opacity = '0.5';
            btnDeselecionarTodos.style.cursor = 'not-allowed';
        }
    }
    
    // Botão excluir: habilitado apenas se houver itens selecionados
    if (btnExcluir) {
        if (itensSelecionados > 0) {
            btnExcluir.disabled = false;
            btnExcluir.style.opacity = '1';
            btnExcluir.style.cursor = 'pointer';
        } else {
            btnExcluir.disabled = true;
            btnExcluir.style.opacity = '0.5';
            btnExcluir.style.cursor = 'not-allowed';
        }
    }
}

// Função para exibir resultados da análise de duplicatas
function exibirResultadosDuplicatas(analise) {
    // Calcular estatísticas
    // A análise retorna TODOS os CTs (únicos e duplicatas)
    const totalCTs = analise.length;
    const duplicatas = analise.filter(item => item.status === 'DUPLICATA').length;
    const unicos = analise.filter(item => item.status === 'ÚNICO').length;
    
    // Limpar seleções anteriores — nenhum CT vem pré-selecionado ao abrir o modal
    itensSelecionadosDuplicatas.clear();
    
    // Atualizar resumo
    document.getElementById('total-cts-analisados').textContent = totalCTs;
    document.getElementById('total-cts-unicos').textContent = unicos;
    document.getElementById('total-cts-duplicatas').textContent = duplicatas;
    
    // Gerar lista de resultados
    const listaDiv = document.getElementById('duplicatas-lista');
    listaDiv.innerHTML = '';
    
    // Se não houver duplicatas
    if (duplicatas === 0) {
        listaDiv.innerHTML = '<p style="text-align: center; color: #28a745; padding: 20px; font-size: 16px;">✅ Nenhuma duplicata encontrada! Todos os casos de teste são únicos.</p>';
        
        // Ocultar botões de ação, mostrar apenas Fechar
        const btnSelecionarTodos = document.getElementById('btn-selecionar-todos-duplicatas');
        const btnDeselecionarTodos = document.getElementById('btn-deselecionar-todos-duplicatas');
        const btnExcluir = document.getElementById('btn-excluir-duplicados');
        
        if (btnSelecionarTodos) btnSelecionarTodos.style.display = 'none';
        if (btnDeselecionarTodos) btnDeselecionarTodos.style.display = 'none';
        if (btnExcluir) btnExcluir.style.display = 'none';
        
        return;
    }
    
    // Se houver duplicatas, mostrar todos os botões
    const btnSelecionarTodos = document.getElementById('btn-selecionar-todos-duplicatas');
    const btnDeselecionarTodos = document.getElementById('btn-deselecionar-todos-duplicatas');
    const btnExcluir = document.getElementById('btn-excluir-duplicados');
    
    if (btnSelecionarTodos) btnSelecionarTodos.style.display = 'inline-block';
    if (btnDeselecionarTodos) btnDeselecionarTodos.style.display = 'inline-block';
    if (btnExcluir) btnExcluir.style.display = 'inline-block';
    
    // Buscar títulos dos CTs para exibição
    // Filtrar apenas duplicatas para exibir
    const duplicatasParaExibir = analise.filter(item => item.status === 'DUPLICATA');
    
    duplicatasParaExibir.forEach((item, index) => {
        // Encontrar o cenário completo correspondente
        const cenario = cenarios.find(c => {
            const numero = c.titulo.match(/CT\d+/i)?.[0];
            return numero === item.ct || numero === item.ct.toUpperCase();
        });
        
        if (!cenario) {
            console.warn(`CT não encontrado: ${item.ct}`);
            return;
        }
        
        const titulo = cenario.titulo;
        const cenarioId = cenario.id;
        
        const itemDiv = document.createElement('div');
        itemDiv.className = 'duplicata-item';
        itemDiv.style.cssText = 'margin-bottom: 15px; padding: 15px; border: 1px solid #dee2e6; border-radius: 5px; background-color: #fff3cd; display: flex; align-items: flex-start;';
        
        const statusBadge = '<span style="background-color: #dc3545; color: white; padding: 3px 8px; border-radius: 3px; font-size: 12px; margin-left: 10px;">DUPLICATA</span>';
        
        // Formatar referências
        let referenciasHTML = '';
        if (item.referencias && item.referencias.length > 0) {
            const referenciasFormatadas = item.referencias.map(ref => {
                // Buscar o título do CT referenciado
                const cenarioRef = cenarios.find(c => {
                    const numero = c.titulo.match(/CT\d+/i)?.[0];
                    return numero === ref || numero === ref.toUpperCase();
                });
                const tituloRef = cenarioRef ? cenarioRef.titulo : ref;
                return `<li><strong>${ref}</strong> - ${tituloRef}</li>`;
            }).join('');
            
            referenciasHTML = `
                <div style="margin-top: 10px; padding-top: 10px; border-top: 1px solid #dee2e6;">
                    <strong>Referências (duplicatas de):</strong>
                    <ul style="margin: 5px 0; padding-left: 20px;">
                        ${referenciasFormatadas}
                    </ul>
                </div>
            `;
        }
        
        itemDiv.innerHTML = `
            <div style="margin-right: 15px; margin-top: 3px;">
                <input type="checkbox" id="dup_${cenarioId}" value="${cenarioId}" 
                       onchange="toggleDuplicataSelecionada(${cenarioId}, this.checked)" 
                       style="width: 18px; height: 18px; cursor: pointer;">
            </div>
            <div style="flex: 1;">
                <div style="display: flex; align-items: center; margin-bottom: 8px;">
                    <strong>${item.ct}</strong>${statusBadge}
                </div>
                <div style="margin-bottom: 8px; color: #495057;">
                    ${titulo}
                </div>
                ${referenciasHTML}
            </div>
        `;
        
        listaDiv.appendChild(itemDiv);
    });
    
    // Atualizar estado dos botões após exibir todos os itens
    atualizarEstadoBotoesDuplicatas();
    
    // Focar na div de lista de duplicatas (scroll automático)
    setTimeout(() => {
        const listaDiv = document.getElementById('duplicatas-lista');
        if (listaDiv) {
            listaDiv.scrollIntoView({ behavior: 'smooth', block: 'start' });
            // Adicionar tabindex temporário para permitir foco
            listaDiv.setAttribute('tabindex', '-1');
            listaDiv.focus();
        }
    }, 100);
}

// Função para fechar modal de duplicatas
function fecharModalDuplicatas() {
    const modal = document.getElementById('modalDuplicatas');
    if (modal) {
        modal.style.display = 'none';
        // Limpar seleções ao fechar
        itensSelecionadosDuplicatas.clear();
    }
}

// Função para toggle de seleção de duplicata
function toggleDuplicataSelecionada(cenarioId, checked) {
    if (checked) {
        itensSelecionadosDuplicatas.add(cenarioId);
    } else {
        itensSelecionadosDuplicatas.delete(cenarioId);
    }
    
    // Atualizar visual do item
    const itemDiv = document.querySelector(`#dup_${cenarioId}`).closest('.duplicata-item');
    if (itemDiv) {
        if (checked) {
            itemDiv.style.borderColor = '#007bff';
            itemDiv.style.borderWidth = '2px';
        } else {
            itemDiv.style.borderColor = '#dee2e6';
            itemDiv.style.borderWidth = '1px';
        }
    }
    
    // Atualizar estado dos botões
    atualizarEstadoBotoesDuplicatas();
}

// Função para selecionar todos os duplicados
function selecionarTodosDuplicatas() {
    const checkboxes = document.querySelectorAll('#duplicatas-lista input[type="checkbox"]');
    checkboxes.forEach(checkbox => {
        const cenarioId = parseInt(checkbox.value);
        checkbox.checked = true;
        itensSelecionadosDuplicatas.add(cenarioId);
        
        // Atualizar visual
        const itemDiv = checkbox.closest('.duplicata-item');
        if (itemDiv) {
            itemDiv.style.borderColor = '#007bff';
            itemDiv.style.borderWidth = '2px';
        }
    });
    
    // Atualizar estado dos botões
    atualizarEstadoBotoesDuplicatas();
}

// Função para deselecionar todos os duplicados
function deselecionarTodosDuplicatas() {
    const checkboxes = document.querySelectorAll('#duplicatas-lista input[type="checkbox"]');
    checkboxes.forEach(checkbox => {
        const cenarioId = parseInt(checkbox.value);
        checkbox.checked = false;
        itensSelecionadosDuplicatas.delete(cenarioId);
        
        // Atualizar visual
        const itemDiv = checkbox.closest('.duplicata-item');
        if (itemDiv) {
            itemDiv.style.borderColor = '#dee2e6';
            itemDiv.style.borderWidth = '1px';
        }
    });
    
    // Atualizar estado dos botões
    atualizarEstadoBotoesDuplicatas();
}

// Função para excluir duplicados selecionados
function excluirDuplicadosSelecionados() {
    if (itensSelecionadosDuplicatas.size === 0) {
        if (typeof showWarningModal === 'function') {
            showWarningModal('Selecione pelo menos um caso de teste duplicado para excluir.');
        } else {
            alert('Selecione pelo menos um caso de teste duplicado para excluir.');
        }
        return;
    }
    
    // Copiar IDs selecionados para o Set de deletar em massa
    itensSelecionadosDelete.clear();
    itensSelecionadosDuplicatas.forEach(id => {
        itensSelecionadosDelete.add(id);
    });
    
    // Fechar modal de duplicatas
    fecharModalDuplicatas();
    
    // Mostrar modal de confirmação e executar deleção
    showDeleteModal(() => {
        executarDeletarEmMassaFromSet();
    });
}

// Expor funções globalmente
window.revisarDuplicidade = revisarDuplicidade;
window.fecharModalDuplicatas = fecharModalDuplicatas;
window.toggleDuplicataSelecionada = toggleDuplicataSelecionada;
window.selecionarTodosDuplicatas = selecionarTodosDuplicatas;
window.deselecionarTodosDuplicatas = deselecionarTodosDuplicatas;
window.excluirDuplicadosSelecionados = excluirDuplicadosSelecionados;

// Variáveis de paginação de CTs
let currentPageCT = 1;
const itemsPerPageCT = 8;

// Função para mostrar controles de paginação dos CTs
function mostrarControlesPaginaCT() {
    const paginationControls = document.querySelector('[data-cy="pagination-controls"]');
    const totalPages = Math.ceil(cenariosFiltrados.length / itemsPerPageCT);
    
    if (paginationControls && cenariosFiltrados.length > itemsPerPageCT) {
        paginationControls.style.display = 'flex';
        atualizarInfoPaginacaoCT();
        atualizarBotoesPaginaCT(totalPages);
        console.log('✅ Controles de paginação exibidos');
    } else if (paginationControls) {
        paginationControls.style.display = 'none';
    }
}

// Função para atualizar informações de paginação
function atualizarInfoPaginacaoCT() {
    const paginationInfo = document.getElementById('pagination-info');
    if (paginationInfo) {
        const start = ((currentPageCT - 1) * itemsPerPageCT) + 1;
        const end = Math.min(currentPageCT * itemsPerPageCT, cenariosFiltrados.length);
        const total = cenariosFiltrados.length;
        
        paginationInfo.textContent = `${String(start).padStart(2, '0')}-${String(end).padStart(2, '0')} de ${String(total).padStart(2, '0')}`;
    }
}

// Função para atualizar botões de paginação
function atualizarBotoesPaginaCT(totalPages) {
    const prevBtn = document.getElementById('pagination-prev-btn');
    const nextBtn = document.getElementById('pagination-next-btn');
    
    if (prevBtn) {
        prevBtn.disabled = currentPageCT <= 1;
    }
    if (nextBtn) {
        nextBtn.disabled = currentPageCT >= totalPages || totalPages === 0;
    }
}

// Função para página anterior dos CTs
function paginaAnteriorCT() {
    if (currentPageCT > 1) {
        currentPageCT--;
        mostrarControlesPaginaCT();
        renderizarCenarios();
        atualizarTabs();
    }
}

// Função para próxima página dos CTs
function proximaPaginaCT() {
    const totalPages = Math.ceil(cenariosFiltrados.length / itemsPerPageCT);
    if (currentPageCT < totalPages) {
        currentPageCT++;
        mostrarControlesPaginaCT();
        renderizarCenarios();
        atualizarTabs();
    }
}

// Função para renderizar lista de cenários com paginação
function renderizarListaCenarios() {
    const container = document.getElementById('scenario-tabs');
    if (!container) return;
    
    container.innerHTML = '';
    
    // Calcular índices da página atual
    const startIndex = (currentPageCT - 1) * itemsPerPageCT;
    const endIndex = Math.min(startIndex + itemsPerPageCT, cenariosFiltrados.length);
    const cenariosDaPagina = cenariosFiltrados.slice(startIndex, endIndex);
    
    // Renderizar apenas os cenários da página atual
    cenariosDaPagina.forEach((cenario, index) => {
        const globalIndex = startIndex + index;
        const isActive = globalIndex + 1 === cenarioAtual;
        
        const tab = document.createElement('div');
        tab.className = `tab ${isActive ? 'active' : ''}`;
        
        const ctId = `${String(cenario.id).padStart(3, '0')} - `;
        
        // Extrair os primeiros 30 caracteres do título do caso de teste
        let tituloTexto = '';
        if (cenario.titulo && cenario.titulo.trim() !== '') {
            const tituloLimpo = cenario.titulo.replace(/^CT\d+\s*-\s*/, '').trim();
            tituloTexto = tituloLimpo.substring(0, 30);
        } else {
            tituloTexto = 'Sem Título';
        }
        
        const textoCompleto = `${ctId}${tituloTexto}...`;
        
        const tituloSpan = document.createElement('span');
        tituloSpan.textContent = textoCompleto;
        tituloSpan.style.flex = '1';
        
        tab.appendChild(tituloSpan);
        tab.onclick = () => {
            trocarCenario(globalIndex + 1);
        };
        
        container.appendChild(tab);
    });
}

// Expor funções globalmente
window.paginaAnteriorCT = paginaAnteriorCT;
window.proximaPaginaCT = proximaPaginaCT;
window.renderizarListaCenarios = renderizarListaCenarios;

// Função para atualizar visibilidade do botão de resumo
function atualizarVisibilidadeBotaoResumo() {
    const btnResumo = document.querySelector('[data-cy="btn-summary"]');
    if (btnResumo && cenarios.length > 0) {
        btnResumo.style.display = 'inline-block';
        console.log('✅ Botão Ver Resumo exibido');
    } else if (btnResumo) {
        btnResumo.style.display = 'none';
    }
}

// Função para atualizar estado do botão salvar
function atualizarVisibilidadeBotaoSalvar() {
    const saveBtn = document.getElementById('save-btn');
    const hasTestCases = cenarios && cenarios.length > 0;
    
    if (saveBtn) {
        saveBtn.disabled = !hasTestCases;
        if (hasTestCases) {
            console.log(`✅ Botão salvar habilitado - ${cenarios.length} CT(s) criado(s)`);
        } else {
            console.log(`⚠️ Botão salvar desabilitado - Nenhum CT criado`);
        }
    }
}

// Expor funções globalmente
window.mostrarControlesPaginaCT = mostrarControlesPaginaCT;
window.atualizarVisibilidadeBotaoResumo = atualizarVisibilidadeBotaoResumo;
window.atualizarVisibilidadeBotaoSalvar = atualizarVisibilidadeBotaoSalvar;

// Função para carregar dados da feature em modo de edição
async function carregarDadosFeature(featureId) {
    try {
        console.log(`📥 Carregando dados da feature: ${featureId}`);
        
        // Limpar localStorage ao acessar edição - limpar antes de carregar dados do arquivo
        localStorage.removeItem('example-selector-ai');
        localStorage.removeItem('feature-text-ai');
        localStorage.removeItem('resumoDescricaoProduto');
        localStorage.removeItem('ct_aplicadosIA');
        // Limpar coberturas ao acessar outra documentação (será restaurado do JSON abaixo)
        limparCoberturasLocalStorage();
        // Inicializar descricaoProdutoAtualizada como false ao acessar documentação
        localStorage.setItem('descricaoProdutoAtualizada', 'false');
        // Limpar novoResumoDescricaoProduto ao acessar documentação
        localStorage.removeItem('novoResumoDescricaoProduto');
        console.log('✅ localStorage limpo (example-selector-ai, feature-text-ai, resumoDescricaoProduto, ct_aplicadosIA e coberturas) ao acessar edição');
        console.log('✅ descricaoProdutoAtualizada inicializado como false e novoResumoDescricaoProduto limpo');
        
        const response = await fetch(`${API_BASE_URL}/api/features/${featureId}`);
        const result = await response.json();
        
        // Extrair dados de result.data (formato retornado pelo servidor)
        const featureData = result.data || result;
        
        if (featureData && featureData.id) {
            console.log('✅ Dados carregados:', featureData);
            
            // Preencher nome da feature
            const featureNameField = document.getElementById('feature-name');
            if (featureNameField) {
                featureNameField.value = featureData.featureName || '';
            }
            
            // Preencher feature-id
            const featureIdField = document.getElementById('feature-id');
            if (featureIdField) {
                featureIdField.value = featureData.id;
            }
            
            // Preencher data de criação
            const dataField = document.getElementById('data');
            if (dataField) {
                dataField.value = featureData.creationDate || '';
            }
            
            // Preencher última atualização
            const ultimaAtualizacaoField = document.getElementById('ultima-atualizacao');
            if (ultimaAtualizacaoField) {
                ultimaAtualizacaoField.value = featureData.updateDate || '';
            }
            
            // Preencher modo-teste
            const modoTesteField = document.getElementById('modo-teste');
            if (modoTesteField) {
                modoTesteField.value = featureData.testRoutine ? 'sim' : 'nao';
                // Chamar toggle para atualizar UI
                if (typeof window.toggleGlobalChecklistMode === 'function') {
                    window.toggleGlobalChecklistMode();
                }
            }
            
            // Preencher ambiente
            const ambienteField = document.getElementById('ambiente');
            if (ambienteField) {
                ambienteField.value = featureData.environment || '';
            }
            
            // Preencher testador
            const testadorField = document.getElementById('testador');
            if (testadorField) {
                testadorField.value = featureData.tester || '';
            }
            
            // Preencher squad
            const squadField = document.getElementById('squad');
            if (squadField) {
                squadField.value = featureData.squad || '';
            }
            
            // Preencher navegador
            const navegadorField = document.getElementById('navegador');
            if (navegadorField) {
                navegadorField.value = featureData.browser || '';
            }
            
            // Preencher dispositivo
            const dispositivoField = document.getElementById('dispositivo');
            if (dispositivoField) {
                dispositivoField.value = featureData.device || '';
            }
            
            // Preencher jira link
            const jiraLinkField = document.getElementById('jira-link');
            if (jiraLinkField) {
                jiraLinkField.value = featureData.jiraLink || '';
            }
            
            // Preencher observação
            const observacaoField = document.getElementById('observacao');
            if (observacaoField) {
                observacaoField.value = featureData.observacao || '';
            }
            
            // Resetar example-selector ao acessar edição (não deve manter seleção anterior)
            const exampleSelector = document.getElementById('example-selector');
            if (exampleSelector) {
                exampleSelector.value = '';
                console.log('✅ Campo example-selector resetado ao acessar edição');
            }
            
            // Preencher descrição da feature no campo feature-text do modal de IA
            const featureTextField = document.getElementById('feature-text');
            if (featureTextField && featureData.featureDescription) {
                featureTextField.value = featureData.featureDescription;
                // Salvar no localStorage também para manter sincronizado
                if (typeof salvarFeatureTextLocalStorage === 'function') {
                    salvarFeatureTextLocalStorage();
                }
                console.log('✅ Descrição da feature carregada no campo feature-text do arquivo JSON');
            }
            
            // Carregar resumo da descrição do produto do JSON e armazenar no localStorage
            if (featureData.resumoDescricaoProduto) {
                localStorage.setItem('resumoDescricaoProduto', featureData.resumoDescricaoProduto);
                console.log('✅ Resumo da descrição do produto carregado do JSON e armazenado no localStorage');
            }
            
            // Carregar ct_aplicadosIA do JSON e armazenar no localStorage (por padrão false)
            const ctAplicadosIA = featureData.ct_aplicadosIA !== undefined ? featureData.ct_aplicadosIA : false;
            localStorage.setItem('ct_aplicadosIA', ctAplicadosIA.toString());
            console.log(`✅ ct_aplicadosIA carregado do JSON e armazenado no localStorage: ${ctAplicadosIA}`);
            
            // Limpar localStorage ao acessar edição (será preenchido quando selecionar imagens)
            limparImagensSelecionadasLocalStorage();
            // Limpar imagens adicionadas do localStorage
            limparImagensAdicionadasLocalStorage();
            // Limpar imagens a deletar do localStorage
            limparImagensDeletarLocalStorage();
            
            // Não carregar imagens selecionadas do metadata - o usuário deve selecionar manualmente
            // O localStorage será preenchido apenas quando o usuário selecionar imagens
            savedImagesSelected = new Set();
            
            // Carregar e exibir imagens salvas (sem seleções pré-definidas)
            await carregarImagensSalvas();
            
            // Preencher tipo de teste usado pela última vez
            // Usar setTimeout para garantir que o elemento esteja disponível no DOM
            setTimeout(() => {
                const testTypeField = document.getElementById('ai-test-type');
                if (testTypeField && featureData.testType) {
                    // Verificar se o valor existe nas opções do select
                    const optionExists = Array.from(testTypeField.options).some(opt => opt.value === featureData.testType);
                    if (optionExists) {
                        testTypeField.value = featureData.testType;
                        // Salvar no localStorage também
                        salvarTestTypeLocalStorage();
                        // Atualizar texto de informação da cobertura
                        atualizarTextoInfoCobertura();
                        console.log(`✅ Tipo de teste carregado: ${featureData.testType}`);
                    } else {
                        console.warn(`⚠️ Tipo de teste "${featureData.testType}" não encontrado nas opções. Usando padrão "funcional".`);
                        testTypeField.value = 'funcional';
                        salvarTestTypeLocalStorage();
                        atualizarTextoInfoCobertura();
                    }
                } else if (testTypeField && !featureData.testType) {
                    // Se não há testType salvo, tentar recuperar do localStorage
                    recuperarTestTypeLocalStorage();
                }
                // Regravar backup com ai-test-type já aplicado (evita divergência na janela de rastreabilidade)
                salvarBackupLocalStorage({ marcarAlteracoes: false });
            }, 100);
            
            // Carregar cenários - verificar ambos testCases (antigo) e cenarios (novo)
            const cenariosParaCarregar = featureData.cenarios || featureData.testCases;
            
            if (cenariosParaCarregar && Array.isArray(cenariosParaCarregar)) {
                // Garantir que todos os cenários tenham posição, fonte e tipo
                cenarios = cenariosParaCarregar.map((cenario, index) => ({
                    ...cenario,
                    posicao: cenario.posicao !== undefined ? cenario.posicao : index + 1,
                    fonte: cenario.fonte || 'Usuário',
                    tipo: cenario.tipo || 'funcional' // Usar 'funcional' como padrão se não houver tipo definido
                }));
                console.log(`✅ ${cenarios.length} cenário(s) carregado(s)`);
                console.log('📋 Cenários (do JSON):', cenariosParaCarregar);
                console.log('📋 Cenários (mapeados):', cenarios.map(c => ({
                    id: c.id,
                    titulo: c.titulo,
                    status: c.status,
                    statusRaw: c.status,
                    hasStatus: 'status' in c
                })));
                
                // Verificar se os status são undefined ou 'na'
                const statusCheck = cenarios.map(c => {
                    console.log(`  CT${c.id}: status="${c.status}", type=${typeof c.status}, has status? ${'status' in c}`);
                    return c;
                });
                
                // Limpar campos de pesquisa e filtro
                termoPesquisa = '';
                tipoFiltroSelecionado = '';
                
                // Limpar campo de pesquisa se existir
                const searchInput = document.getElementById('search-input');
                if (searchInput) {
                    searchInput.value = '';
                }
                
                // Limpar filtro de tipo se existir
                const filterTipo = document.getElementById('filter-tipo-teste');
                if (filterTipo) {
                    filterTipo.value = '';
                }
                
                // Atualizar cenarioId
                if (cenarios.length > 0) {
                    const maxId = Math.max(...cenarios.map(c => c.id));
                    cenarioId = maxId + 1;
                    console.log(`🔢 Próximo ID de cenário será: ${cenarioId}`);
                }
                
                // Aplicar filtros (que agora estão limpos, então mostrará todos)
                aplicarFiltros();
            } else {
                console.warn('⚠️ Nenhum cenário encontrado nos dados');
                cenarios = [];
                cenariosFiltrados = [];
                termoPesquisa = '';
                tipoFiltroSelecionado = '';
            }
            
            console.log(`📊 Cenários filtrados após carregamento: ${cenariosFiltrados.length}`);
            
            // Carregar bugs
            if (featureData.bugs && Array.isArray(featureData.bugs)) {
                bugs = featureData.bugs;
                console.log(`✅ ${bugs.length} bug(s) carregado(s)`);
                
                if (bugs.length > 0) {
                    bugId = Math.max(...bugs.map(b => b.id)) + 1;
                }
            }
            
            // Atualizar UI
            renderizarCenarios();
            renderizarBugs();
            
            // Renderizar lista de cenários nas abas
            if (typeof renderizarListaCenarios === 'function') {
                renderizarListaCenarios();
            }
            
            // Mostrar controles de paginação se necessário
            if (typeof mostrarControlesPaginaCT === 'function') {
                mostrarControlesPaginaCT();
            }
            
            console.log(`✅ Total de cenários a renderizar: ${cenarios.length}`);
            
            // Alterar título para "ATUALIZAÇÃO DE TESTE" em modo de edição
            const pageTitle = document.querySelector('[data-cy="page-title"]');
            if (pageTitle) {
                pageTitle.textContent = 'ATUALIZAÇÃO DE TESTE';
                pageTitle.classList.add('page-title-edit-mode');
                console.log('✅ Título alterado para modo de edição');
            }
            
            // Mostrar botões de execução e aprovar todos em modo de edição
            const btnExecute = document.querySelector('[data-cy="btn-execute"]');
            const btnApproveAll = document.querySelector('[data-cy="btn-approve-all"]');
            
            if (btnExecute) {
                btnExecute.style.display = 'inline-block';
                console.log('✅ Botão Executar Testes exibido');
            }
            
            if (btnApproveAll) {
                btnApproveAll.style.display = 'inline-block';
                console.log('✅ Botão Aprovar Todos exibido');
            }
            
            // Mostrar seções necessárias
            const infoSection = document.getElementById('info-section');
            if (infoSection && featureNameField.value) {
                infoSection.classList.remove('hidden-section');
                infoSection.style.display = 'block';
            }
            
            // Mostrar seção de casos de teste
            const testCasesSection = document.getElementById('test-cases-section');
            if (testCasesSection) {
                testCasesSection.classList.remove('hidden-section');
                testCasesSection.style.display = 'block';
            }
            
            // Mostrar seção de observação
            const observacaoSection = document.getElementById('observacao-section');
            if (observacaoSection) {
                observacaoSection.classList.remove('hidden-section');
                observacaoSection.style.display = 'block';
            }
            
            // Restaurar coberturas do JSON para o localStorage
            if (featureData.coberturas) {
                restaurarCoberturasLocalStorage(featureData.coberturas);
            } else {
                console.log('📊 Nenhuma cobertura encontrada no JSON da documentação');
            }
            
            // Garantir backup no localStorage para análise de cobertura / rastreabilidade (popup compartilha o mesmo storage)
            salvarBackupLocalStorage({ marcarAlteracoes: false });
            console.log('💾 Backup sincronizado após carregar documento para edição');
            
            console.log('✅ Dados da feature carregados com sucesso');
            
        } else {
            console.error('❌ Dados da feature não encontrados ou inválidos');
        }
        
    } catch (error) {
        console.error('❌ Erro ao carregar dados da feature:', error);
    }
}

// Inicializar quando a página carregar
document.addEventListener('DOMContentLoaded', async function() {
    // Carregar flags primeiro
    await carregarFlags();
    
    adicionarListeners();
    
    // Fechar dropdowns de tipo ao clicar fora
    document.addEventListener('click', function(event) {
        if (!event.target.closest('.ct-tag-tipo')) {
            document.querySelectorAll('.ct-tag-tipo-dropdown').forEach(dropdown => {
                dropdown.classList.remove('show');
            });
        }
    });
    
    // Verificar se está em modo de edição
    const urlParams = new URLSearchParams(window.location.search);
    const featureId = urlParams.get('edit');
    const isNewDocumentation = urlParams.get('new') === 'true'; // Verificar se é uma nova documentação (vindo da home)
    const hashFromUrl = urlParams.get('hash'); // Hash do backup (se houver)
    
    // Renderizar bugs (mesmo que vazio)
    renderizarBugs();
    
    // Só ocultar seções de criação se NÃO estiver em modo de edição
    if (!featureId) {
        // Se veio com hash do backup, restaurar dados do backup
        if (hashFromUrl) {
            try {
                const backup = localStorage.getItem('backup');
                if (backup) {
                    const backupData = JSON.parse(backup);
                    if (backupData && backupData.id === hashFromUrl) {
                        console.log('📥 Restaurando dados do backup...');
                        restaurarDadosDoBackup(backupData);
                    }
                }
            } catch (error) {
                console.error('❌ Erro ao restaurar backup:', error);
            }
        } else if (isNewDocumentation) {
            // Se é nova documentação sem hash, verificar se há backup sem ID (id vazio)
            try {
                const backup = localStorage.getItem('backup');
                if (backup) {
                    const backupData = JSON.parse(backup);
                    // Se o backup não tem ID ou tem ID vazio, restaurar os dados
                    if (backupData && (!backupData.id || backupData.id === '' || backupData.id === 'null' || backupData.id === null)) {
                        console.log('📥 Restaurando dados do backup sem HASH ID...');
                        restaurarDadosDoBackup(backupData);
                    }
                }
            } catch (error) {
                console.error('❌ Erro ao restaurar backup:', error);
            }
        }
        
        // Limpar localStorage da descrição da feature, do example-selector, ai-test-type e imagens selecionadas APENAS quando clicar no botão "Nova Documentação" na home (sem hash e sem backup sem ID)
        if (isNewDocumentation && !hashFromUrl) {
            // Verificar se há backup sem ID antes de limpar
            let temBackupSemId = false;
            try {
                const backup = localStorage.getItem('backup');
                if (backup) {
                    const backupData = JSON.parse(backup);
                    if (backupData && (!backupData.id || backupData.id === '' || backupData.id === 'null' || backupData.id === null)) {
                        temBackupSemId = true;
                    }
                }
            } catch (error) {
                // Ignorar erro
            }
            
            // Só limpar se não houver backup sem ID
            if (!temBackupSemId) {
                localStorage.removeItem('feature-text-ai');
                localStorage.removeItem('example-selector-ai');
                localStorage.removeItem('ai-test-type');
                // Limpar resumo da descrição do produto
                localStorage.removeItem('resumoDescricaoProduto');
                // Limpar imagens selecionadas do localStorage
                limparImagensSelecionadasLocalStorage();
                // Limpar imagens adicionadas do localStorage
                limparImagensAdicionadasLocalStorage();
                // Limpar imagens a deletar do localStorage
                limparImagensDeletarLocalStorage();
                // Limpar coberturas do localStorage
                limparCoberturasLocalStorage();
            }
            // Limpar imagens provisórias do S3 se houver
            if (provisionalFeatureId) {
                console.log('🗑️ Limpando imagens provisórias ao criar nova documentação...');
                await limparImagensProvisorias();
            }
            console.log('✅ localStorage da descrição da feature, example-selector, ai-test-type, imagens selecionadas, imagens adicionadas e imagens a deletar limpos para nova documentação (vindo da home)');
        }
        ocultarSecoesNaCriacao();
    }
    
    // Adicionar listener para limpar imagens provisórias e adicionadas ao sair da página sem salvar
    window.addEventListener('beforeunload', async function(event) {
        // Verificar se há imagens provisórias que precisam ser limpas
        const urlParams = new URLSearchParams(window.location.search);
        const isEdit = !!urlParams.get('edit');
        const currentFeatureId = document.getElementById('feature-id')?.value;
        
        // Limpar imagens adicionadas do localStorage se não foi salvo
        const imagensAdicionadas = recuperarImagensAdicionadasLocalStorage();
        if (imagensAdicionadas.length > 0 && currentFeatureId) {
            console.log(`🗑️ Removendo ${imagensAdicionadas.length} imagem(ns) adicionada(s) do S3 ao fechar...`);
            for (const imageName of imagensAdicionadas) {
                try {
                    fetch(`${API_BASE_URL}/api/features/${currentFeatureId}/images/${imageName}`, {
                        method: 'DELETE',
                        keepalive: true
                    }).catch(() => {}); // Ignorar erros ao fechar
                } catch (error) {
                    // Ignorar erros ao fechar
                }
            }
        }
        
        if (!isEdit && provisionalFeatureId) {
            // Verificar se a documentação foi salva
            try {
                const response = await fetch(`${API_BASE_URL}/api/features/${provisionalFeatureId}`, {
                    method: 'GET',
                    // Usar keepalive para garantir que a requisição seja enviada
                    keepalive: true
                });
                const result = await response.json();
                
                // Se não encontrou a feature, significa que não foi salva
                if (!result.success || !result.data) {
                    // Tentar limpar imagens (pode não completar se a página estiver fechando)
                    fetch(`${API_BASE_URL}/api/features/${provisionalFeatureId}/images`, {
                        method: 'GET',
                        keepalive: true
                    }).then(response => response.json()).then(result => {
                        if (result.success && result.images) {
                            // Deletar cada imagem
                            result.images.forEach(image => {
                                fetch(`${API_BASE_URL}/api/features/${provisionalFeatureId}/images/${image.filename}`, {
                                    method: 'DELETE',
                                    keepalive: true
                                }).catch(() => {}); // Ignorar erros ao fechar
                            });
                        }
                    }).catch(() => {}); // Ignorar erros ao fechar
                }
            } catch (error) {
                // Ignorar erros ao fechar a página
            }
        }
    });
    
    // Inicializar descricaoProdutoAtualizada como false ao acessar documentação ou iniciar nova
    localStorage.setItem('descricaoProdutoAtualizada', 'false');
    console.log('✅ descricaoProdutoAtualizada inicializado como false');
    
    if (featureId) {
        // Modo de edição - carregar dados
        console.log(`🔄 Modo de edição detectado para feature: ${featureId}`);
        
        // Atualizar status para em edição (inEdit: true) ao acessar o documento
        try {
            const response = await fetch(`/api/features/${featureId}/edit-status`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ inEdit: true })
            });
            const data = await response.json();
            if (data.success) {
                console.log('✅ Status inEdit atualizado para true ao acessar documento');
            }
        } catch (error) {
            console.error('⚠️ Erro ao atualizar status inEdit:', error);
            // Continuar mesmo se houver erro
        }
        
        await carregarDadosFeature(featureId);
        
        // Adicionar listener para resetar status ao sair da página
        window.addEventListener('beforeunload', async (e) => {
            try {
                // Resetar status de edição ao fechar/voltar
                const response = await fetch(`/api/features/${featureId}/edit-status`, {
                    method: 'PUT',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ inEdit: false }),
                    // Usar sendBeacon para garantir envio mesmo ao fechar
                    keepalive: true
                });
                console.log('✅ Status de edição resetado ao sair da página');
            } catch (error) {
                console.error('Erro ao resetar status de edição:', error);
            }
        });
    }
    
    // Inicializar data atual
    const dataField = document.getElementById('data');
    if (dataField && !dataField.value) {
        const today = new Date().toISOString().split('T')[0];
        dataField.value = today;
    }
    
    // Inicializar campo de última atualização com data atual
    const ultimaAtualizacaoField = document.getElementById('ultima-atualizacao');
    if (ultimaAtualizacaoField) {
        // Verificar se já tem valor (modo edição)
        if (!ultimaAtualizacaoField.value) {
            const today = new Date().toISOString().split('T')[0];
            ultimaAtualizacaoField.value = today;
        }
        // Campo é readonly e sempre preenchido com data atual
    }
    
    // Inicializar modo-teste com valor padrão "nao"
    const modoTesteField = document.getElementById('modo-teste');
    if (modoTesteField && !modoTesteField.value) {
        modoTesteField.value = 'nao';
        // Chamar toggleGlobalChecklistMode para manter consistência
        if (typeof window.toggleGlobalChecklistMode === 'function') {
            window.toggleGlobalChecklistMode();
        }
    }
    
    // Adicionar listeners para salvar backup quando campos do formulário forem alterados
    adicionarListenersBackupFormulario();
    
    // Adicionar listener para mostrar seção de informações quando o nome da feature for preenchido
    const featureInput = document.getElementById('feature-name');
    const infoSection = document.getElementById('info-section');
    
    if (featureInput && infoSection) {
        // Adicionar listener
        featureInput.addEventListener('input', function() {
            if (this.value.trim() !== '') {
                // Remover classe e garantir que está visível
                infoSection.classList.remove('hidden-section');
                infoSection.style.display = 'block';
                console.log('✅ Seção de informações exibida');
            } else {
                infoSection.classList.add('hidden-section');
                infoSection.style.display = 'none';
                console.log('⚠️ Seção de informações ocultada');
            }
        });
        
        // Verificar se já tem conteúdo ao carregar (para modo edição)
        if (featureInput.value.trim() !== '') {
            infoSection.classList.remove('hidden-section');
            infoSection.style.display = 'block';
            console.log('✅ Seção de informações exibida (já tinha conteúdo)');
        }
    }
    
    // Função para verificar se campos obrigatórios estão preenchidos
    function verificarCamposObrigatorios() {
        const modoTeste = document.getElementById('modo-teste');
        const ambiente = document.getElementById('ambiente');
        const testador = document.getElementById('testador');
        const testCasesSection = document.getElementById('test-cases-section');
        
        const todosPreenchidos = modoTeste && modoTeste.value !== '' && 
                                  ambiente && ambiente.value !== '' && 
                                  testador && testador.value.trim() !== '';
        
        const observacaoSection = document.getElementById('observacao-section');
        if (testCasesSection && todosPreenchidos) {
            testCasesSection.classList.remove('hidden-section');
            testCasesSection.style.display = 'block';
            if (observacaoSection) {
                observacaoSection.classList.remove('hidden-section');
                observacaoSection.style.display = 'block';
            }
            console.log('✅ Seção de casos de teste exibida');
        } else if (testCasesSection && !todosPreenchidos) {
            testCasesSection.classList.add('hidden-section');
            testCasesSection.style.display = 'none';
            if (observacaoSection) {
                observacaoSection.classList.add('hidden-section');
                observacaoSection.style.display = 'none';
            }
            console.log('⚠️ Seção de casos de teste ocultada');
        }
    }
    
    // Adicionar listeners para campos obrigatórios
    ['modo-teste', 'ambiente', 'testador'].forEach(fieldId => {
        const field = document.getElementById(fieldId);
        if (field) {
            field.addEventListener('change', verificarCamposObrigatorios);
            field.addEventListener('input', verificarCamposObrigatorios);
        }
    });
    
    // Verificar no carregamento inicial
    verificarCamposObrigatorios();
    
    // Verificar inicialmente
    atualizarVisibilidadeBotaoSalvar();
    
    // Expor funções de debug globalmente
    window.debugCenarios = debugCenarios;
    window.testarStatus = testarStatus;
});

// Função para exibir popup de sucesso
function showSuccessPopup(message) {
    const popup = document.getElementById('successPopup');
    const messageElement = document.getElementById('successMessage');
    
    if (popup && messageElement) {
        // Substituir \n por <br> para exibir quebras de linha
        const messageHtml = message.replace(/\n/g, '<br>');
        messageElement.innerHTML = messageHtml;
        popup.classList.add('show');
        
        // Remover o popup após 3 segundos
        setTimeout(() => {
            popup.classList.remove('show');
        }, 3000);
    } else {
        // Fallback para alert caso o popup não exista
        alert(message);
    }
}

// Funções para modal de aviso
function showWarningModal(message) {
    const modal = document.getElementById('warningModal');
    const messageElement = document.getElementById('warningMessage');
    
    if (modal && messageElement) {
        // Substituir quebras de linha por <br> para exibição correta
        const messageWithBreaks = message.replace(/\n/g, '<br>');
        messageElement.innerHTML = messageWithBreaks;
        modal.style.display = 'flex'; // Modal usa display: flex para centralizar
        // z-index já está definido no CSS como 2000, garantindo que fique acima do modal de gerar IA
    } else {
        // Fallback para alert caso o modal não exista
        alert(message);
    }
}

function closeWarningModal() {
    const modal = document.getElementById('warningModal');
    if (modal) {
        modal.style.display = 'none';
    }
}

// Funções para modal de confirmação genérico
let confirmModalCallback = null;

function showConfirmModal(title, message, confirmButtonText, onConfirm, warningMessage = null) {
    const modal = document.getElementById('confirmModal');
    const titleElement = document.getElementById('confirmModalTitle');
    const messageElement = document.getElementById('confirmModalMessage');
    const confirmButton = document.getElementById('btn-confirm-action');
    const warningElement = document.getElementById('confirmModalWarning');
    
    if (!modal) {
        // Fallback para confirm caso o modal não exista
        // Remover tags HTML para o alert
        const plainMessage = message.replace(/<[^>]*>/g, '');
        if (confirm(plainMessage)) {
            if (onConfirm && typeof onConfirm === 'function') {
                onConfirm();
            }
        }
        return;
    }
    
    // Armazenar callback
    confirmModalCallback = onConfirm;
    
    // Configurar título
    if (titleElement) {
        titleElement.textContent = title || 'Confirmar';
    }
    
    // Configurar mensagem (usar innerHTML para renderizar HTML)
    if (messageElement) {
        messageElement.innerHTML = message || 'Tem certeza que deseja continuar?';
    }
    
    // Configurar texto do botão
    if (confirmButton) {
        confirmButton.textContent = confirmButtonText || 'Confirmar';
    }
    
    // Configurar mensagem de aviso (opcional)
    if (warningElement) {
        if (warningMessage) {
            warningElement.style.display = 'block';
            warningElement.innerHTML = warningMessage;
        } else {
            warningElement.style.display = 'none';
            warningElement.innerHTML = '';
        }
    }
    
    // Mostrar modal
    modal.style.display = 'flex';
}

function closeConfirmModal() {
    const modal = document.getElementById('confirmModal');
    if (modal) {
        modal.style.display = 'none';
        confirmModalCallback = null;
    }
}

function executeConfirmAction() {
    if (confirmModalCallback && typeof confirmModalCallback === 'function') {
        confirmModalCallback();
    }
    closeConfirmModal();
}

// Funções para modal de confirmação de reorganização de CTs
let reorganizeCTCallback = null;

function showReorganizeCTModal(onConfirm, count) {
    reorganizeCTCallback = onConfirm;
    
    const modal = document.getElementById('reorganizeCTModal');
    const messageElement = document.getElementById('reorganizeCTMessage');
    
    if (modal && messageElement) {
        messageElement.innerHTML = `Organizar ${count} caso(s) de teste?<br><br>A IA irá organizar os CTs seguindo a melhor ordem lógica para execução, considerando as ações (cadastrar, editar, visualizar, excluir, etc.) e agrupando por tipo de teste (Funcional, Regressão, Usabilidade, Integração, Performance).`;
        modal.style.display = 'block';
    } else {
        // Fallback para confirm caso o modal não exista
        if (confirm(`🔄 Organizar ${count} caso(s) de teste?\n\nA IA irá organizar os CTs seguindo a melhor ordem lógica para execução, considerando as ações (cadastrar, editar, visualizar, excluir, etc.) e agrupando por tipo de teste (Funcional, Regressão, Usabilidade, Integração, Performance).`)) {
            onConfirm();
        }
    }
}

function closeReorganizeCTModal() {
    const modal = document.getElementById('reorganizeCTModal');
    if (modal) {
        modal.style.display = 'none';
    }
    reorganizeCTCallback = null;
}

function confirmReorganizeCT() {
    if (reorganizeCTCallback) {
        reorganizeCTCallback();
    }
    closeReorganizeCTModal();
}

// Função para cancelar e voltar para index.html
function showCancelModal() {
    const hasUnsavedChanges = cenarios && cenarios.length > 0;
    
    if (hasUnsavedChanges) {
        // Abrir modal de confirmação
        abrirModalConfirmarCancelar();
    } else {
        // Sem alterações, limpar localStorage exceto backup e redirecionar
        limparLocalStorageExcetoBackup();
        window.location.href = '/html/index.html';
    }
}

// Função para abrir modal de confirmação de cancelamento
function abrirModalConfirmarCancelar() {
    const title = 'Confirmar Cancelamento';
    const message = 'Tem certeza que deseja cancelar e voltar para a tela inicial?';
    const confirmButtonText = 'Sim, Cancelar';
    const warningMessage = '<p><strong>⚠️ Atenção:</strong> Esta ação irá descartar todas as alterações.</p>';
    
    const onConfirm = () => {
        confirmarCancelamento();
    };
    
    if (typeof showConfirmModal === 'function') {
        showConfirmModal(title, message, confirmButtonText, onConfirm, warningMessage);
        console.log('✅ Modal de confirmação de cancelamento aberto');
    } else {
        // Fallback
        const modal = document.getElementById('modalConfirmarCancelar');
        if (modal) {
            modal.style.display = 'flex';
            console.log('✅ Modal de confirmação de cancelamento aberto');
        }
    }
}

// Função para fechar modal de confirmação de cancelamento
function fecharModalConfirmarCancelar() {
    if (typeof closeConfirmModal === 'function') {
        closeConfirmModal();
    } else {
        const modal = document.getElementById('modalConfirmarCancelar');
        if (modal) {
            modal.style.display = 'none';
        }
    }
    console.log('✅ Modal de confirmação de cancelamento fechado');
}

// Função para confirmar o cancelamento
async function confirmarCancelamento() {
    console.log('✅ Cancelamento confirmado, redirecionando...');
    
    // Remover imagens adicionadas do S3
    const imagensAdicionadas = recuperarImagensAdicionadasLocalStorage();
    if (imagensAdicionadas.length > 0) {
        const currentFeatureId = document.getElementById('feature-id')?.value;
        if (currentFeatureId) {
            console.log(`🗑️ Removendo ${imagensAdicionadas.length} imagem(ns) adicionada(s) do S3...`);
            for (const imageName of imagensAdicionadas) {
                try {
                    const response = await fetch(`${API_BASE_URL}/api/features/${currentFeatureId}/images/${imageName}`, {
                        method: 'DELETE'
                    });
                    if (response.ok) {
                        console.log(`✅ Imagem adicionada removida do S3: ${imageName}`);
                    } else {
                        console.error(`❌ Erro ao remover imagem ${imageName} do S3`);
                    }
                } catch (error) {
                    console.error(`❌ Erro ao remover imagem ${imageName} do S3:`, error);
                }
            }
        }
        // Limpar o array de imagens adicionadas
        limparImagensAdicionadasLocalStorage();
    }
    
    // Resetar status de edição para false
    const urlParams = new URLSearchParams(window.location.search);
    const featureId = urlParams.get('edit');
    
    if (featureId) {
        try {
            await fetch(`/api/features/${featureId}/edit-status`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ inEdit: false })
            });
            console.log('✅ Status de edição resetado para false');
        } catch (error) {
            console.error('Erro ao resetar status de edição:', error);
        }
    }
    
    // Limpar localStorage exceto backup ao cancelar
    limparLocalStorageExcetoBackup();
    
    window.location.href = '/html/index.html';
}

// Função de compatibilidade para o modal antigo (cancelModal)
function confirmCancel() {
    // Chamar a função principal de cancelamento
    confirmarCancelamento();
}

// Função de compatibilidade para fechar modal antigo
function closeCancelModal() {
    const modal = document.getElementById('cancelModal');
    if (modal) {
        modal.style.display = 'none';
    }
}

// Expor funções
window.abrirModalConfirmarCancelar = abrirModalConfirmarCancelar;
window.fecharModalConfirmarCancelar = fecharModalConfirmarCancelar;
window.confirmarCancelamento = confirmarCancelamento;
window.confirmCancel = confirmCancel;
window.closeCancelModal = closeCancelModal;

// Funções para modal de aprovar todos
function abrirModalAprovarTodos() {
    const title = '✅ Aprovar Todos os Casos de Teste';
    const message = 'Esta operação não pode ser desfeita. Tem certeza que deseja continuar?';
    const confirmButtonText = 'Aprovar Todos';
    const warningMessage = '<p><strong>⚠️ Atenção:</strong> Esta ação irá atualizar o status de TODOS os casos de teste para "Aprovado".</p>';
    
    const onConfirm = () => {
        console.log('✅ Aprovando todos os casos de teste...');
        
        // Atualizar status de todos os cenários para 'aprovado'
        cenarios.forEach(cenario => {
            cenario.status = 'aprovado';
        });
        
        // Atualizar UI
        renderizarCenarios();
        
        // Mostrar mensagem de sucesso
        showSuccessPopup('✅ Todos os casos de teste foram aprovados com sucesso!');
        
        console.log('✅ Todos os CTs aprovados');
    };
    
    if (typeof showConfirmModal === 'function') {
        showConfirmModal(title, message, confirmButtonText, onConfirm, warningMessage);
        console.log('✅ Modal Aprovar Todos aberto');
    } else {
        // Fallback
        const modal = document.getElementById('modalAprovarTodos');
        if (modal) {
            modal.style.display = 'flex';
            console.log('✅ Modal Aprovar Todos aberto');
        }
    }
}

function fecharModalAprovarTodos() {
    if (typeof closeConfirmModal === 'function') {
        closeConfirmModal();
    } else {
        const modal = document.getElementById('modalAprovarTodos');
        if (modal) {
            modal.style.display = 'none';
        }
    }
    console.log('✅ Modal Aprovar Todos fechado');
}

function confirmarAprovarTodos() {
    console.log('✅ Aprovando todos os casos de teste...');
    
    // Atualizar status de todos os cenários para 'aprovado'
    cenarios.forEach(cenario => {
        cenario.status = 'aprovado';
    });
    
    // Atualizar UI
    renderizarCenarios();
    
    // Fechar modal
    fecharModalAprovarTodos();
    
    // Mostrar mensagem de sucesso
    showSuccessPopup('✅ Todos os casos de teste foram aprovados com sucesso!');
    
    console.log('✅ Todos os CTs aprovados');
}

// Funções para modal de executar testes
function abrirModalExecutarTestes() {
    // Primeiro, abrir modal de confirmação
    const modalConfirmar = document.getElementById('modalConfirmarExecucao');
    if (modalConfirmar) {
        modalConfirmar.style.display = 'flex';
        console.log('✅ Modal Confirmação de Execução aberto');
    }
}

// Funções para escolher tipo de execução
function escolherNovaBateria() {
    console.log('🆕 Nova bateria de testes selecionada');
    
    // IMPORTANTE: Salvar os status originais ANTES de zerar
    // Isso garante que ao cancelar, voltamos para os status originais (não os 'na' zerados)
    if (!statusOriginais) {
        statusOriginais = cenarios.map(cenario => ({
            id: cenario.id,
            status: cenario.status || 'na'
        }));
        console.log('📸 Status originais salvos ANTES de zerar:', statusOriginais);
    } else {
        console.log('📸 Status originais já salvos anteriormente:', statusOriginais);
    }
    
    // Fechar modal de confirmação
    fecharModalConfirmarExecucao();
    
    // Agora sim, zerar status de todos os cenários
    cenarios.forEach(cenario => {
        cenario.status = 'na';
    });
    console.log('🔄 Status zerados para "na"');
    
    // Atualizar UI
    renderizarCenarios();
    
    // Abrir modal de execução
    setTimeout(() => {
        abrirModalExecucaoTestes();
    }, 300);
}

function escolherContinuarStatus() {
    console.log('🔄 Continuar com status atuais');
    
    // Fechar modal de confirmação
    fecharModalConfirmarExecucao();
    
    // Abrir modal de execução
    setTimeout(() => {
        abrirModalExecucaoTestes();
    }, 300);
}

function abrirModalExecucaoTestes() {
    const modal = document.getElementById('modalExecutarTestes');
    if (modal) {
        const suffixWrap = document.getElementById('modal-execute-title-suffix');
        const docTitleSpan = document.getElementById('modal-execute-title-document');
        const featureNameInput = document.querySelector('[data-cy="feature-name"]');
        const nomeDoc = (featureNameInput && typeof featureNameInput.value === 'string' ? featureNameInput.value : '').trim();
        if (suffixWrap && docTitleSpan) {
            if (nomeDoc) {
                docTitleSpan.textContent = nomeDoc;
                suffixWrap.style.display = 'inline';
            } else {
                docTitleSpan.textContent = '';
                suffixWrap.style.display = 'none';
            }
        }
        
        // Log dos cenários atuais para debug
        console.log('📊 Cenários atuais antes de salvar status originais:', cenarios.map(c => ({
            id: c.id,
            titulo: c.titulo,
            status: c.status
        })));
        
        // Salvar status originais ANTES de abrir o modal (apenas se ainda não foram salvos)
        // Isso garante que não sobrescrevemos os status originais quando "Nova Bateria de Teste" é clicado
        if (!statusOriginais) {
            statusOriginais = cenarios.map(cenario => ({
                id: cenario.id,
                status: cenario.status || 'na'
            }));
            console.log('📸 Status originais salvos pela primeira vez:', statusOriginais);
        } else {
            console.log('📸 Usando status originais já salvos:', statusOriginais);
        }
        
        // Resetar filtros
        const filtroStatus = document.getElementById('filtro-status-execute');
        const filtroFonte = document.getElementById('filtro-fonte-execute');
        const filtroTipo = document.getElementById('filtro-tipo-execute');
        if (filtroStatus) filtroStatus.value = 'todos';
        if (filtroFonte) filtroFonte.value = 'todos';
        if (filtroTipo) filtroTipo.value = 'todos';
        
        // Resetar modo de exibição para lista (default)
        executeModoExibicao = 'lista';
        executeIndiceAtual = 0;
        const modoSelect = document.getElementById('execute-view-mode');
        if (modoSelect) {
            modoSelect.value = 'lista';
        }
        
        // Configurar controles de navegação
        const navControlsFooter = document.getElementById('execute-navigation-controls-footer');
        const paginacao = document.getElementById('execute-paginacao');
        if (navControlsFooter && paginacao) {
            navControlsFooter.style.display = 'none';
            paginacao.style.display = 'flex';
        }
        
        modal.style.display = 'flex';
        
        // Popular lista de cenários no modal
        popularListaExecucao();
        
        console.log('✅ Modal Executar Testes aberto');
    }
}

function fecharModalConfirmarExecucao() {
    const modal = document.getElementById('modalConfirmarExecucao');
    if (modal) {
        modal.style.display = 'none';
        console.log('✅ Modal Confirmação de Execução fechado');
    }
}

function fecharModalExecutarTestes() {
    const modal = document.getElementById('modalExecutarTestes');
    if (modal) {
        modal.style.display = 'none';
        
        // Resetar status originais quando o modal é fechado definitivamente
        statusOriginais = null;
        flagRestaurarStatus = true;
        
        console.log('✅ Modal Executar Testes fechado');
        console.log('🔄 Status originais resetados');
    }
}

// Função para abrir histórico de testes
function abrirHistoricoTestes() {
    console.log('📊 Abrindo histórico de testes...');
    
    // Obter hash ID da feature atual
    const featureIdField = document.getElementById('feature-id');
    const featureId = featureIdField ? featureIdField.value : null;
    
    if (featureId) {
        // Abrir histórico em nova aba com parâmetro hash
        const url = `/html/historico.html?hash=${encodeURIComponent(featureId)}`;
        window.open(url, '_blank');
        console.log(`✅ Histórico aberto em nova aba para feature: ${featureId}`);
    } else {
        // Se não tem hash, abrir histórico geral
        window.open('/html/historico.html', '_blank');
        console.log('✅ Histórico geral aberto em nova aba');
    }
}

function aplicarFiltroExecute() {
    // Aplicar filtros e regenerar lista
    popularListaExecucao();
}

/**
 * lê testRoutine (boolean) do backup salvo em localStorage (chave "backup")
 */
function getTestRoutineFromLocalStorageBackup() {
    try {
        const raw = localStorage.getItem('backup');
        if (!raw) {
            return undefined;
        }
        const b = JSON.parse(raw);
        if (b == null || typeof b !== 'object') {
            return undefined;
        }
        return b.testRoutine;
    } catch (e) {
        return undefined;
    }
}

/**
 * Roteiro no modal "Executar testes": só com #modo-teste === "sim" ou
 * (fallback) testRoutine === true no backup do localStorage.
 * Com #modo-teste === "nao" nunca exibe, mesmo se o carregamento da API tiver tido roteiro antes.
 */
function isModoRoteiroExecucao() {
    const modo = document.getElementById('modo-teste')?.value;
    if (modo === 'nao') {
        return false;
    }
    if (modo === 'sim') {
        return true;
    }
    return getTestRoutineFromLocalStorageBackup() === true;
}

/**
 * @returns {{ innerHtml: string, exibirRoteiro: boolean }}
 */
function montarHtmlItemExecucao(cenario, index) {
    let tituloTexto = cenario.titulo || `${String(cenario.id).padStart(3, '0')} - Sem Título`;
    tituloTexto = tituloTexto.replace(/^CT\s*/i, '');

    const modoRoteiro = isModoRoteiroExecucao();

    const formatarTexto = (texto) => {
        if (!texto || !texto.trim()) return '';
        return texto
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/\n/g, '<br>');
    };

    let roteiroHtml = '';
    if (modoRoteiro) {
        const precondicoesFormatado = formatarTexto(cenario.precondicoes) || '-';
        const passosFormatado = formatarTexto(cenario.passos) || '-';
        const resultadoFormatado = formatarTexto(cenario.resultadoEsperado) || '-';

        roteiroHtml = `
            <div class="execute-roteiro" data-cy="execute-roteiro-${index}" style="display: flex; width: 100%; margin-top: 10px; padding-top: 10px; border-top: 1px solid #e0e0e0; font-size: 11px; color: #666; line-height: 1.4; gap: 12px;">
                <div style="flex: 1; min-width: 0;">
                    <div style="font-weight: 500; color: #555; margin-bottom: 3px; font-size: 11px;">Pré-condições:</div>
                    <div style="white-space: pre-wrap; word-wrap: break-word; font-size: 11px;">${precondicoesFormatado}</div>
                </div>
                <div style="flex: 1; min-width: 0;">
                    <div style="font-weight: 500; color: #555; margin-bottom: 3px; font-size: 11px;">Passos:</div>
                    <div style="white-space: pre-wrap; word-wrap: break-word; font-size: 11px;">${passosFormatado}</div>
                </div>
                <div style="flex: 1; min-width: 0;">
                    <div style="font-weight: 500; color: #555; margin-bottom: 3px; font-size: 11px;">Resultado Esperado:</div>
                    <div style="white-space: pre-wrap; word-wrap: break-word; font-size: 11px;">${resultadoFormatado}</div>
                </div>
            </div>
        `;
    }

    const innerHtml = `
        <div style="display: flex; align-items: center; justify-content: space-between; width: 100%;">
            <div class="execute-ct-name" data-cy="execute-ct-name-${index}">
                ${tituloTexto}
            </div>
            <div class="execute-status-icons" data-cy="execute-status-icons-${index}">
                <span class="status-icon aprovado" 
                      data-cy="status-icon-aprovado-${index}" 
                      onclick="atualizarStatusExecucao(${cenario.id}, 'aprovado')" 
                      title="Aprovado" 
                      style="opacity: ${cenario.status === 'aprovado' ? '1' : '0.3'}">🟢</span>
                <span class="status-icon reprovado" 
                      data-cy="status-icon-reprovado-${index}" 
                      onclick="atualizarStatusExecucao(${cenario.id}, 'reprovado')" 
                      title="Reprovado" 
                      style="opacity: ${cenario.status === 'reprovado' ? '1' : '0.3'}">🔴</span>
                <span class="status-icon bloqueado" 
                      data-cy="status-icon-bloqueado-${index}" 
                      onclick="atualizarStatusExecucao(${cenario.id}, 'bloqueado')" 
                      title="Bloqueado" 
                      style="opacity: ${cenario.status === 'bloqueado' ? '1' : '0.3'}">🟡</span>
                <span class="status-icon na" 
                      data-cy="status-icon-na-${index}" 
                      onclick="atualizarStatusExecucao(${cenario.id}, 'na')" 
                      title="Não executado" 
                      style="opacity: ${cenario.status === 'na' || !cenario.status ? '1' : '0.3'}">⚪</span>
            </div>
        </div>
        ${roteiroHtml}
    `;

    return { innerHtml, exibirRoteiro: modoRoteiro };
}

// Funções de paginação e execução de testes
// Variáveis globais para controle de exibição
let executeModoExibicao = 'lista'; // 'individual' ou 'lista'
let executeCenariosFiltrados = [];
let executeIndiceAtual = 0;

function popularListaExecucao() {
    const container = document.getElementById('execute-lista');
    if (!container) return;
    
    console.log('📋 popularListaExecucao() - Cenários status:', cenarios.map(c => `CT${c.id}:${c.status}`));
    
    // Obter valores dos filtros
    const filtroStatus = document.getElementById('filtro-status-execute')?.value || 'todos';
    const filtroFonte = document.getElementById('filtro-fonte-execute')?.value || 'todos';
    const filtroTipo = document.getElementById('filtro-tipo-execute')?.value || 'todos';
    
    // Filtrar cenários
    let cenariosFiltrados = [...cenarios];
    
    // Aplicar filtro de status
    if (filtroStatus !== 'todos') {
        if (filtroStatus === 'na' || filtroStatus === 'nao_executado') {
            // N/A e Não executado são considerados iguais
            cenariosFiltrados = cenariosFiltrados.filter(cenario => {
                const status = cenario.status;
                return status === 'na' || status === '' || status === null || status === undefined ||
                       status === 'Não executado' || status === 'nao_executado';
            });
        } else {
            cenariosFiltrados = cenariosFiltrados.filter(cenario => (cenario.status || 'na') === filtroStatus);
        }
    }
    
    // Aplicar filtro de fonte
    if (filtroFonte !== 'todos') {
        cenariosFiltrados = cenariosFiltrados.filter(cenario => {
            const fonte = cenario.fonte || 'usuário';
            return fonte === filtroFonte;
        });
    }
    
    // Aplicar filtro de tipo
    if (filtroTipo !== 'todos') {
        cenariosFiltrados = cenariosFiltrados.filter(cenario => {
            const tipo = cenario.tipo || 'sem informação';
            return tipo === filtroTipo;
        });
    }
    
    // Salvar cenários filtrados globalmente
    executeCenariosFiltrados = cenariosFiltrados;
    
    container.innerHTML = '';
    
    if (cenariosFiltrados.length === 0) {
        container.innerHTML = '<p style="text-align: center; color: #666; padding: 20px;">Nenhum caso de teste encontrado com os filtros selecionados.</p>';
        atualizarControlesNavegacao();
        return;
    }
    
    // Resetar índice se necessário
    if (executeIndiceAtual >= cenariosFiltrados.length) {
        executeIndiceAtual = 0;
    }
    
    // Renderizar baseado no modo
    if (executeModoExibicao === 'individual') {
        renderizarCasoIndividual(cenariosFiltrados[executeIndiceAtual], executeIndiceAtual);
    } else {
        renderizarListaCompleta(cenariosFiltrados);
    }
    
    atualizarControlesNavegacao();
    
    console.log(`✅ Lista de execução populada com ${cenariosFiltrados.length} CT(s) (de ${cenarios.length} total)`);
}

function renderizarCasoIndividual(cenario, index) {
    const container = document.getElementById('execute-lista');
    if (!container) return;
    
    container.className = 'execute-lista modo-individual';
    
    const item = document.createElement('div');
    item.className = `execute-item status-${cenario.status || 'na'}`;
    item.dataset.cenarioId = cenario.id;
    item.dataset.status = cenario.status || 'na';
    item.setAttribute('data-cy', `execute-item-${index}`);
    item.setAttribute('data-ct-id', cenario.id);
    
    const { innerHtml, exibirRoteiro } = montarHtmlItemExecucao(cenario, index);
    if (exibirRoteiro) {
        item.style.flexDirection = 'column';
        item.style.alignItems = 'stretch';
    }
    item.innerHTML = innerHtml;
    
    container.innerHTML = '';
    container.appendChild(item);
}

function renderizarListaCompleta(cenariosFiltrados) {
    const container = document.getElementById('execute-lista');
    if (!container) return;
    
    container.className = 'execute-lista modo-lista';
    
    cenariosFiltrados.forEach((cenario, index) => {
        const item = document.createElement('div');
        item.className = `execute-item status-${cenario.status || 'na'}`;
        item.dataset.cenarioId = cenario.id;
        item.dataset.status = cenario.status || 'na';
        item.setAttribute('data-cy', `execute-item-${index}`);
        item.setAttribute('data-ct-id', cenario.id);
        
        const { innerHtml, exibirRoteiro } = montarHtmlItemExecucao(cenario, index);
        if (exibirRoteiro) {
            item.style.flexDirection = 'column';
            item.style.alignItems = 'stretch';
        }
        item.innerHTML = innerHtml;
        container.appendChild(item);
    });
}

function alterarModoExibicaoExecute() {
    const modoSelect = document.getElementById('execute-view-mode');
    if (!modoSelect) return;
    
    executeModoExibicao = modoSelect.value;
    executeIndiceAtual = 0; // Resetar índice ao mudar modo
    
    // Mostrar/ocultar controles de navegação no footer
    const navControlsFooter = document.getElementById('execute-navigation-controls-footer');
    const paginacao = document.getElementById('execute-paginacao');
    
    if (navControlsFooter && paginacao) {
        if (executeModoExibicao === 'individual') {
            navControlsFooter.style.display = 'flex';
            paginacao.style.display = 'none';
        } else {
            navControlsFooter.style.display = 'none';
            paginacao.style.display = 'flex';
        }
    }
    
    popularListaExecucao();
}

function atualizarControlesNavegacao() {
    const navPrev = document.getElementById('execute-nav-prev-footer');
    const navNext = document.getElementById('execute-nav-next-footer');
    const navInfo = document.getElementById('execute-nav-info-footer');
    
    if (!navPrev || !navNext || !navInfo) return;
    
    const total = executeCenariosFiltrados.length;
    const atual = executeIndiceAtual + 1;
    
    navInfo.textContent = `${atual} de ${total}`;
    navPrev.disabled = executeIndiceAtual === 0 || executeModoExibicao !== 'individual';
    navNext.disabled = executeIndiceAtual >= total - 1 || executeModoExibicao !== 'individual';
}

function casoAnteriorExecute() {
    // Navegar apenas nos casos filtrados
    if (executeIndiceAtual > 0 && executeModoExibicao === 'individual' && executeCenariosFiltrados.length > 0) {
        executeIndiceAtual--;
        popularListaExecucao();
    }
}

function casoProximoExecute() {
    // Navegar apenas nos casos filtrados
    if (executeIndiceAtual < executeCenariosFiltrados.length - 1 && executeModoExibicao === 'individual' && executeCenariosFiltrados.length > 0) {
        executeIndiceAtual++;
        popularListaExecucao();
    }
}

// Função para aplicar estilos de item selecionado
function aplicarEstilosSelecionado() {
    const items = document.querySelectorAll('.execute-item');
    items.forEach(item => {
        const currentStatus = item.dataset.status;
        const buttons = item.querySelectorAll('.status-btn');
        
        // Definir cor de fundo do item baseado no status selecionado
        item.style.backgroundColor = getStatusBackgroundColor(currentStatus);
        item.style.borderLeft = '4px solid ' + getStatusColor(currentStatus);
        
        buttons.forEach(btn => {
            const btnStatus = btn.dataset.status;
            const dot = btn.querySelector('.status-dot');
            
            if (dot) {
                // Aplicar cor da bolinha
                dot.style.backgroundColor = getStatusDotColor(btnStatus);
                
                if (btnStatus === currentStatus) {
                    // Status selecionado - bolinha mais forte e maior
                    dot.style.opacity = '1';
                    dot.style.transform = 'scale(1.8)';
                    dot.style.boxShadow = '0 2px 8px rgba(0,0,0,0.3)';
                    dot.style.borderWidth = '3px';
                    dot.style.borderColor = 'rgba(0,0,0,0.1)';
                } else {
                    // Outras bolinhas - apagadas
                    dot.style.opacity = '0.35';
                    dot.style.transform = 'scale(1)';
                    dot.style.boxShadow = '0 1px 2px rgba(0,0,0,0.1)';
                    dot.style.borderWidth = '1px';
                    dot.style.borderColor = 'rgba(0,0,0,0.1)';
                }
            }
        });
    });
}

// Função para obter cor de fundo do item baseado no status
function getStatusBackgroundColor(status) {
    const colors = {
        'aprovado': '#d4edda',
        'reprovado': '#f8d7da',
        'bloqueado': '#fff3cd',
        'na': '#f8f9fa'
    };
    return colors[status] || '#f8f9fa';
}

// Função para obter cor da bolinha baseado no status
function getStatusDotColor(status) {
    const colors = {
        'aprovado': '#28a745',
        'reprovado': '#dc3545',
        'bloqueado': '#ffc107',
        'na': '#6c757d'
    };
    return colors[status] || '#6c757d';
}

// Função para obter cor do status
function getStatusColor(status) {
    const colors = {
        'aprovado': '#28a745',
        'reprovado': '#dc3545',
        'bloqueado': '#ffc107',
        'na': '#6c757d'
    };
    return colors[status] || '#6c757d';
}

function atualizarStatusExecucao(cenarioId, status) {
    const cenario = cenarios.find(c => c.id === cenarioId);
    if (cenario) {
        cenario.status = status;
        
        // Atualizar também no array de cenários filtrados se existir
        const cenarioFiltrado = executeCenariosFiltrados.find(c => c.id === cenarioId);
        if (cenarioFiltrado) {
            cenarioFiltrado.status = status;
        }
        
        // Recarregar a visualização (modo individual ou lista)
        popularListaExecucao();
        
        // Atualizar UI principal
        renderizarCenarios();
        
        // Salvar backup após atualizar status de execução
        salvarBackupLocalStorage();
        
        console.log(`✅ Status do CT ${cenarioId} atualizado para: ${status}`);
    }
}

function abrirModalConfirmarFecharExecucao() {
    const title = 'Confirmar Cancelamento';
    const message = 'Tem certeza que deseja cancelar a execução?';
    const confirmButtonText = 'Sim, Cancelar';
    const warningMessage = '<p><strong>⚠️ Atenção:</strong> Todas as alterações realizadas serão perdidas!</p>';
    
    const onConfirm = () => {
        confirmarFecharExecucao();
    };
    
    if (typeof showConfirmModal === 'function') {
        showConfirmModal(title, message, confirmButtonText, onConfirm, warningMessage);
        console.log('✅ Modal de confirmação de cancelar execução aberto');
    } else {
        // Fallback
        const modal = document.getElementById('modalConfirmarFecharExecucao');
        if (modal) {
            modal.style.display = 'flex';
            console.log('✅ Modal de confirmação de cancelar execução aberto');
        } else {
            if (confirm('Tem certeza que deseja cancelar? As alterações não serão salvas.')) {
                fecharModalExecutarTestes();
            }
        }
    }
}

function fecharModalConfirmarFecharExecucao() {
    if (typeof closeConfirmModal === 'function') {
        closeConfirmModal();
    } else {
        const modal = document.getElementById('modalConfirmarFecharExecucao');
        if (modal) {
            modal.style.display = 'none';
        }
    }
    console.log('✅ Modal de confirmação de cancelar execução fechado');
}

function fecharModalConfirmarSalvarStatus() {
    const modal = document.getElementById('modalConfirmarSalvarStatus');
    if (modal) {
        modal.style.display = 'none';
        console.log('✅ Modal de confirmação de salvar status fechado');
    }
}

// Expor função
window.fecharModalConfirmarSalvarStatus = fecharModalConfirmarSalvarStatus;

function salvarStatusExecucao() {
    console.log('💾 Abrindo modal de confirmação para salvar status...');
    
    // Resetar flag para permitir restauração se cancelar
    flagRestaurarStatus = true;
    console.log('🔓 Flag resetada para true - permitir restauração se cancelar');
    
    const title = 'Confirmar Salvamento';
    const message = 'Deseja salvar as alterações de status dos casos de teste?';
    const confirmButtonText = 'Sim, Salvar';
    
    const onConfirm = () => {
        confirmarSalvarStatusExecucao();
    };
    
    const onCancel = () => {
        // Quando cancelar, restaurar status originais
        fecharModalConfirmarSalvarStatusExecucao();
    };
    
    if (typeof showConfirmModal === 'function') {
        showConfirmModal(title, message, confirmButtonText, onConfirm);
        console.log('✅ Modal de confirmação de salvar status aberto');
    } else {
        // Fallback
        const modal = document.getElementById('modalConfirmarSalvarStatusExecucao');
        if (modal) {
            modal.style.display = 'flex';
            console.log('✅ Modal de confirmação de salvar status aberto');
        }
    }
}

function fecharModalConfirmarSalvarStatusExecucao() {
    console.log(`🔄 Flag restaurar status: ${flagRestaurarStatus}`);
    
    // Restaurar status originais APENAS se a flag estiver ativa (usuário cancelou, não confirmou)
    if (flagRestaurarStatus && statusOriginais) {
        console.log('❌ Salvamento cancelado, restaurando status originais...');
        statusOriginais.forEach(item => {
            const cenario = cenarios.find(c => c.id === item.id);
            if (cenario) {
                cenario.status = item.status;
            }
        });
        console.log('🔄 Status restaurados para o estado original');
        renderizarCenarios();
    } else {
        console.log('✅ Salvamento confirmado, mantendo novos status');
    }
    
    // Resetar flag para próximo uso
    flagRestaurarStatus = true;
    
    if (typeof closeConfirmModal === 'function') {
        closeConfirmModal();
    } else {
        const modal = document.getElementById('modalConfirmarSalvarStatusExecucao');
        if (modal) {
            modal.style.display = 'none';
        }
    }
    console.log('✅ Modal de confirmação de salvar status fechado');
}

function confirmarSalvarStatusExecucao() {
    console.log('💾 Confirmando salvamento de status...');
    
    // Log dos status atuais antes de salvar
    console.log('📊 Status atuais dos cenários:', cenarios.map(c => ({ id: c.id, titulo: c.titulo, status: c.status })));
    
    // Desativar flag para NÃO restaurar os status originais
    flagRestaurarStatus = false;
    console.log('🔒 Flag desativada - NÃO restaurar status');
    
    // Fechar apenas o modal de confirmação (sem restaurar status)
    if (typeof closeConfirmModal === 'function') {
        closeConfirmModal();
    } else {
        const modalConfirmar = document.getElementById('modalConfirmarSalvarStatusExecucao');
        if (modalConfirmar) {
            modalConfirmar.style.display = 'none';
        }
    }
    console.log('✅ Modal de confirmação fechado');
    
    // Fechar modal de execução
    fecharModalExecutarTestes();
    
    // Re-renderizar cenários para exibir os novos status
    renderizarCenarios();
    
    // Mostrar mensagem informativa (NÃO salvar no servidor ainda)
    showSuccessPopup('✅ Status de execução atualizados! Clique em "Salvar Documentação" para persistir as alterações.');
    
    console.log('✅ Status atualizados localmente. Aguardando salvamento da documentação.');
}

function salvarAlteracoesStatus(featureId) {
    // Implementar salvamento no servidor
    console.log('💾 Salvando alterações de status no servidor...');
    console.log('📊 Cenários que serão salvos:', cenarios.map(c => ({ id: c.id, titulo: c.titulo, status: c.status })));
    
    // Atualizar a documentação completa
    const data = {
        id: featureId,
        featureName: document.getElementById('feature-name')?.value || '',
        creationDate: document.getElementById('data')?.value || '',
        updateDate: new Date().toISOString().split('T')[0],
        testRoutine: document.getElementById('modo-teste')?.value === 'sim',
        environment: document.getElementById('ambiente')?.value || '',
        tester: document.getElementById('testador')?.value || '',
        squad: document.getElementById('squad')?.value || '',
        browser: document.getElementById('navegador')?.value || '',
        device: document.getElementById('dispositivo')?.value || '',
        jiraLink: document.getElementById('jira-link')?.value || '',
        cenarios: cenarios,
        bugs: bugs
    };
    
    fetch(`${API_BASE_URL}/api/features/${featureId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
    })
    .then(response => response.json())
    .then(result => {
        if (result.success || result.data) {
            console.log('✅ Status salvo no servidor com sucesso');
            mostrarMensagemSucesso();
        } else {
            console.error('❌ Erro ao salvar status no servidor:', result.error);
            alert('Erro ao salvar status no servidor');
        }
    })
    .catch(error => {
        console.error('❌ Erro ao salvar status:', error);
        // Ainda assim, mostrar mensagem de sucesso local
        mostrarMensagemSucesso();
    });
}

function mostrarMensagemSucesso() {
    // Log dos status antes de renderizar
    console.log('📊 Status antes de renderizar:', cenarios.map(c => ({ id: c.id, titulo: c.titulo, status: c.status })));
    
    // Mostrar mensagem de sucesso
    showSuccessPopup('✅ Status de execução salvo com sucesso!');
    
    // Re-renderizar cenários
    renderizarCenarios();
    
    console.log('✅ Status de execução salvo');
}

function confirmarFecharExecucao() {
    console.log('✅ Cancelamento de execução confirmado');
    
    // Restaurar status originais
    if (statusOriginais) {
        statusOriginais.forEach(item => {
            const cenario = cenarios.find(c => c.id === item.id);
            if (cenario) {
                cenario.status = item.status;
            }
        });
        console.log('🔄 Status restaurados para o estado original');
        renderizarCenarios();
    }
    
    fecharModalConfirmarFecharExecucao();
    fecharModalExecutarTestes();
}

function paginaAnteriorExecute() {
    console.log('⚠️ Funcionalidade de paginação não implementada ainda');
}

function proximaPaginaExecute() {
    console.log('⚠️ Funcionalidade de paginação não implementada ainda');
}

// Variável para controlar a etapa atual do modal de IA
let etapaAtualModalIA = 1;

// ==================== FUNÇÕES DE INTEGRAÇÃO COM FLAGS ====================

// Variável global para armazenar as flags (valores serão carregados do JSON via API)
let flagsConfig = {
    modalIA: true,
    executarScriptIA: false,
    organizarCT: false,
    revisarCTDuplicados: false,
    iaOpcaoFuncional: true,
    iaOpcaoRegressao: true,
    iaOpcaoIntegracao: true,
    iaOpcaoPerformance: true,
    iaOpcaoUsabilidade: true,
    inserirImagensProduto: false,
    iaCoberturaTeste: true,
    recuperadorDados: null // Será carregado do JSON via API
};

// Função para carregar flags do servidor
async function carregarFlags() {
    if (typeof window.__QUALIDOC_GET_FLAGS__ === 'function') {
        try {
            const lf = window.__QUALIDOC_GET_FLAGS__();
            flagsConfig = {
                modalIA: lf.modalIA ?? true,
                executarScriptIA: lf.executarScriptIA ?? false,
                organizarCT: lf.organizarCT ?? false,
                revisarCTDuplicados: lf.revisarCTDuplicados ?? false,
                iaOpcaoFuncional: lf.iaOpcaoFuncional ?? true,
                iaOpcaoRegressao: lf.iaOpcaoRegressao ?? true,
                iaOpcaoIntegracao: lf.iaOpcaoIntegracao ?? true,
                iaOpcaoPerformance: lf.iaOpcaoPerformance ?? true,
                iaOpcaoUsabilidade: lf.iaOpcaoUsabilidade ?? true,
                inserirImagensProduto: lf.inserirImagensProduto ?? false,
                iaCoberturaTeste: lf.iaCoberturaTeste ?? true,
                recuperadorDados: lf.recuperadorDados ?? false
            };
            aplicarFlags();
        } catch (eLocal) {
            console.warn('⚠️ Leitura de flags no localStorage:', eLocal);
        }
    }
    try {
        const response = await fetch('/api/flags');
        const data = await response.json();
        
        if (data.success && data.flags) {
            flagsConfig = {
                modalIA: data.flags.modalIA ?? true,
                executarScriptIA: data.flags.executarScriptIA ?? false,
                organizarCT: data.flags.organizarCT ?? false,
                revisarCTDuplicados: data.flags.revisarCTDuplicados ?? false,
                iaOpcaoFuncional: data.flags.iaOpcaoFuncional ?? true,
                iaOpcaoRegressao: data.flags.iaOpcaoRegressao ?? true,
                iaOpcaoIntegracao: data.flags.iaOpcaoIntegracao ?? true,
                iaOpcaoPerformance: data.flags.iaOpcaoPerformance ?? true,
                iaOpcaoUsabilidade: data.flags.iaOpcaoUsabilidade ?? true,
                inserirImagensProduto: data.flags.inserirImagensProduto ?? false,
                iaCoberturaTeste: data.flags.iaCoberturaTeste ?? true,
                recuperadorDados: data.flags.recuperadorDados ?? false // Carregado do JSON via API
            };
            console.log('✅ Flags carregadas:', flagsConfig);
            
            // Aplicar as flags
            aplicarFlags();
        } else {
            console.warn('⚠️ Não foi possível carregar flags, usando valores padrão');
        }
    } catch (error) {
        console.error('❌ Erro ao carregar flags:', error);
    }
}

// Função para aplicar as flags na interface
function aplicarFlags() {
    // 1. Controlar visibilidade do botão "Gerar com IA"
    const btnAIGenerate = document.querySelector('[data-cy="btn-ai-generate"]');
    if (btnAIGenerate) {
        if (flagsConfig.modalIA) {
            btnAIGenerate.style.display = '';
        } else {
            btnAIGenerate.style.display = 'none';
        }
    }
    
    // 2. Controlar visibilidade do botão "Organizar"
    const btnReorganize = document.querySelector('[data-cy="btn-reorganize"]');
    if (btnReorganize) {
        if (flagsConfig.organizarCT) {
            btnReorganize.style.display = '';
        } else {
            btnReorganize.style.display = 'none';
        }
    }
    
    // 3. Controlar visibilidade do botão "Revisar Duplicidade"
    const btnRevisarDuplicidade = document.querySelector('[data-cy="btn-revisar-duplicidade"]');
    if (btnRevisarDuplicidade) {
        if (flagsConfig.revisarCTDuplicados) {
            btnRevisarDuplicidade.style.display = '';
        } else {
            btnRevisarDuplicidade.style.display = 'none';
        }
    }
    
    // 4. Atualizar opções do select ai-test-type
    atualizarOpcoesTipoTeste();
    
    // 5. Controlar acesso à etapa 3 (Imagens) do modal IA
    atualizarEstadoEtapa4();
    
    // 6. Controlar visibilidade da seção de cobertura de teste no modal IA
    const coberturaTesteSection = document.getElementById('cobertura-teste-section');
    if (coberturaTesteSection) {
        if (flagsConfig.iaCoberturaTeste) {
            coberturaTesteSection.style.display = '';
        } else {
            coberturaTesteSection.style.display = 'none';
        }
    }
}

// Função para atualizar o estado da etapa 3 (Imagens) baseado na flag
function atualizarEstadoEtapa4() {
    const stepItem3 = document.querySelector('.step-item[data-step="3"]');
    const stepContent3 = document.getElementById('step-3');
    
    if (!stepItem3) return;
    
    if (!flagsConfig.inserirImagensProduto) {
        // Desabilitar etapa 3
        stepItem3.classList.add('disabled');
        stepItem3.style.pointerEvents = 'none';
        stepItem3.style.cursor = 'not-allowed';
        stepItem3.style.opacity = '0.5';
        
        // Atualizar label para mostrar "desabilitado pelo admin"
        const stepLabel = stepItem3.querySelector('.step-label');
        if (stepLabel) {
            stepLabel.textContent = 'Imagens (desabilitado pelo admin)';
        }
        
        // Desabilitar todos os inputs da etapa 3
        if (stepContent3) {
            const inputs = stepContent3.querySelectorAll('input, select, button');
            inputs.forEach(input => {
                input.disabled = true;
                input.style.opacity = '0.5';
                input.style.cursor = 'not-allowed';
            });
            
            // Adicionar mensagem de desabilitado
            let disabledMessage = stepContent3.querySelector('.disabled-message');
            if (!disabledMessage) {
                disabledMessage = document.createElement('div');
                disabledMessage.className = 'disabled-message';
                disabledMessage.style.cssText = 'padding: 20px; text-align: center; color: #dc3545; font-weight: 600; background: #f8d7da; border: 1px solid #f5c6cb; border-radius: 6px; margin: 20px 0;';
                disabledMessage.textContent = '⚠️ Esta funcionalidade foi desabilitada pelo administrador.';
                stepContent3.insertBefore(disabledMessage, stepContent3.firstChild);
            }
        }
    } else {
        // Habilitar etapa 3
        stepItem3.classList.remove('disabled');
        stepItem3.style.pointerEvents = 'auto';
        stepItem3.style.cursor = 'pointer';
        stepItem3.style.opacity = '1';
        
        // Restaurar label original
        const stepLabel = stepItem3.querySelector('.step-label');
        if (stepLabel) {
            stepLabel.textContent = 'Imagens';
        }
        
        // Habilitar todos os inputs da etapa 3
        if (stepContent3) {
            const inputs = stepContent3.querySelectorAll('input, select, button');
            inputs.forEach(input => {
                input.disabled = false;
                input.style.opacity = '1';
                input.style.cursor = '';
            });
            
            // Remover mensagem de desabilitado
            const disabledMessage = stepContent3.querySelector('.disabled-message');
            if (disabledMessage) {
                disabledMessage.remove();
            }
        }
    }
    
    // Atualizar indicadores visuais
    atualizarIndicadoresEtapas();
}

// Função para atualizar as opções do select ai-test-type baseado nas flags
function atualizarOpcoesTipoTeste() {
    const testTypeSelect = document.getElementById('ai-test-type');
    if (!testTypeSelect) return;
    
    // Mapeamento de flags para valores e labels
    const opcoesDisponiveis = [
        { flag: 'iaOpcaoFuncional', value: 'funcional', label: 'Funcional' },
        { flag: 'iaOpcaoRegressao', value: 'regressao', label: 'Regressão' },
        { flag: 'iaOpcaoIntegracao', value: 'integracao', label: 'Integração' },
        { flag: 'iaOpcaoPerformance', value: 'performance', label: 'Performance' },
        { flag: 'iaOpcaoUsabilidade', value: 'usabilidade', label: 'Usabilidade' }
    ];
    
    // Salvar valor atual
    const valorAtual = testTypeSelect.value;
    
    // Limpar opções existentes
    testTypeSelect.innerHTML = '';
    
    // Adicionar opções baseadas nas flags
    let primeiraOpcao = null;
    opcoesDisponiveis.forEach(opcao => {
        if (flagsConfig[opcao.flag]) {
            const option = document.createElement('option');
            option.value = opcao.value;
            option.textContent = opcao.label;
            option.setAttribute('data-cy', `option-ai-type-${opcao.value}`);
            testTypeSelect.appendChild(option);
            
            if (!primeiraOpcao) {
                primeiraOpcao = opcao.value;
            }
        }
    });
    
    // Se não houver opções disponíveis, adicionar "funcional" como padrão
    if (testTypeSelect.options.length === 0) {
        const option = document.createElement('option');
        option.value = 'funcional';
        option.textContent = 'Funcional';
        option.setAttribute('data-cy', 'option-ai-type-funcional');
        testTypeSelect.appendChild(option);
        primeiraOpcao = 'funcional';
    }
    
    // Restaurar valor anterior se ainda estiver disponível, senão usar primeira opção
    const opcaoExiste = Array.from(testTypeSelect.options).some(opt => opt.value === valorAtual);
    if (opcaoExiste) {
        testTypeSelect.value = valorAtual;
    } else {
        testTypeSelect.value = primeiraOpcao;
        // Atualizar localStorage se necessário
        if (typeof salvarTestTypeLocalStorage === 'function') {
            salvarTestTypeLocalStorage();
        }
    }
    
    console.log('✅ Opções de tipo de teste atualizadas baseadas nas flags');
}

// Funções para modal de IA
function abrirModalGerarIA() {
    const modal = document.getElementById('modalGerarIA');
    if (modal) {
        modal.style.display = 'flex';
        
        // Garantir que os indicadores de etapas estejam visíveis
        const stepsIndicator = document.querySelector('.ai-steps-indicator');
        if (stepsIndicator) {
            stepsIndicator.style.display = 'flex';
        }
        
        // Garantir que a seção de input esteja visível
        const inputSection = document.querySelector('.ai-input-section');
        if (inputSection) {
            inputSection.style.display = 'block';
        }
        
        // Atualizar estado do botão adicionar informações
        if (typeof atualizarEstadoBotaoAdicionarInformacoes === 'function') {
            atualizarEstadoBotaoAdicionarInformacoes();
        }
        
        // Ocultar preview se estiver visível
        const previewDiv = document.getElementById('ai-preview');
        if (previewDiv) {
            previewDiv.style.display = 'none';
        }
        
        // Ocultar botão aplicar se estiver visível
        const btnApply = document.getElementById('btn-apply-ai');
        if (btnApply) {
            btnApply.style.display = 'none';
        }
        
        // Controlar visibilidade da seção de cobertura de teste baseado na flag
        const coberturaTesteSection = document.getElementById('cobertura-teste-section');
        if (coberturaTesteSection) {
            if (flagsConfig.iaCoberturaTeste) {
                coberturaTesteSection.style.display = '';
            } else {
                coberturaTesteSection.style.display = 'none';
            }
        }
        
        // Atualizar estado baseado na quantidade de CTs
        atualizarEstadoGeracaoIA();
        
        // Mostrar ícone de cobertura ao abrir o modal (se não estiver em loading/preview)
        const coberturaIconTooltip = document.getElementById('cobertura-icon-tooltip');
        if (coberturaIconTooltip) {
            coberturaIconTooltip.style.display = 'inline-block';
        }
        
        // Mostrar texto de valor de cobertura ao abrir o modal
        const coberturaValueText = document.getElementById('cobertura-value-text');
        if (coberturaValueText) {
            coberturaValueText.style.display = 'inline-block';
        }
        
        // Garantir que o texto de informação de cobertura esteja visível
        const coberturaInfoText = document.getElementById('cobertura-info-text');
        if (coberturaInfoText) {
            coberturaInfoText.style.display = 'block';
        }
        
        // Restaurar alinhamento original do modal-footer (space-between)
        // Isso garante que o botão de cobertura fique à esquerda
        const modalFooter = document.querySelector('#modalGerarIA .modal-footer');
        if (modalFooter) {
            modalFooter.style.justifyContent = 'space-between';
        }
        
        // Garantir que o botão de cancelar esteja visível
        const btnCancelar = document.getElementById('btn-cancelar-ia');
        if (btnCancelar) {
            btnCancelar.style.display = 'inline-block';
        }
        
        // Verificar se há imagens selecionadas e mostrar aviso
        atualizarAvisoImagensSelecionadas();
        
        // Ocultar example-selector e seu label quando ct_aplicadosIA for true
        const ctAplicadosIA = localStorage.getItem('ct_aplicadosIA') === 'true';
        const exampleSelectorLabel = document.querySelector('label[for="example-selector"]');
        const exampleSelector = document.getElementById('example-selector');
        if (ctAplicadosIA) {
            if (exampleSelectorLabel) {
                exampleSelectorLabel.style.display = 'none';
            }
            if (exampleSelector) {
                exampleSelector.style.display = 'none';
            }
        } else {
            if (exampleSelectorLabel) {
                exampleSelectorLabel.style.display = 'block';
            }
            if (exampleSelector) {
                exampleSelector.style.display = 'block';
            }
        }
        
        // Bloquear campo ai-test-type quando ct_aplicadosIA for true
        const testTypeField = document.getElementById('ai-test-type');
        if (testTypeField) {
            testTypeField.disabled = ctAplicadosIA;
        }
        
        // Verificar se é uma nova documentação ou modo de edição
        const urlParams = new URLSearchParams(window.location.search);
        const isNewDoc = urlParams.get('new') === 'true';
        const hasEditId = urlParams.get('edit');
        
        // Recuperar dados do localStorage apenas se não estiver em modo de edição
        // (em modo de edição, o valor já foi carregado do arquivo JSON em carregarDadosFeature)
        if (!hasEditId) {
            recuperarFeatureTextLocalStorage();
        }
        // recuperarTestTypeLocalStorage() será chamado condicionalmente abaixo
        
        if (isNewDoc && !hasEditId) {
            // Resetar example-selector para "Nenhum" em nova documentação
            if (exampleSelector) {
                exampleSelector.value = '';
                console.log('✅ Campo example-selector resetado para "Nenhum" em nova documentação');
            }
            // Não limpar localStorage aqui - isso já foi feito no DOMContentLoaded
        } else if (hasEditId) {
            // Em modo de edição, não recuperar do localStorage (já foi limpo e resetado em carregarDadosFeature)
            if (exampleSelector) {
                exampleSelector.value = '';
                console.log('✅ Campo example-selector mantido vazio em modo de edição');
            }
        } else {
            // Recuperar do localStorage apenas se não for nova documentação nem edição
            recuperarExampleSelectorLocalStorage();
        }
        
        // Atualizar opções do select baseado nas flags antes de processar
        atualizarOpcoesTipoTeste();
        
        // Adicionar event listener no select de tipo de teste para salvar quando mudar
        if (testTypeField) {
            if (isNewDoc && !hasEditId) {
                // Resetar ai-test-type para primeira opção disponível em nova documentação
                if (testTypeField.options.length > 0) {
                    testTypeField.value = testTypeField.options[0].value;
                    console.log(`✅ Campo ai-test-type resetado para "${testTypeField.value}" em nova documentação`);
                }
            } else {
                // Recuperar do localStorage apenas se não for nova documentação
                recuperarTestTypeLocalStorage();
            }
            
            // Remover listener anterior se existir para evitar duplicatas
            testTypeField.removeEventListener('change', salvarTestTypeLocalStorage);
            // Adicionar novo listener
            testTypeField.addEventListener('change', function() {
                salvarTestTypeLocalStorage();
                atualizarTextoInfoCobertura();
                atualizarEstadoGeracaoIA();
            });
            
            // Atualizar texto de informação da cobertura
            atualizarTextoInfoCobertura();
            
            // Atualizar estado do botão e campo ao abrir o modal
            atualizarEstadoGeracaoIA();
        }
        
        // Atualizar estado do botão Gerar ao abrir o modal
        atualizarEstadoBotaoGerar();
        
        // Atualizar estado dos botões Adicionar Informações e Remover/Atualizar Informações
        atualizarEstadoBotaoAdicionarInformacoes();
        
        // Atualizar opções da etapa 4 baseado na seleção da etapa 2
        if (exampleSelector) {
            atualizarOpcoesEtapa3(exampleSelector.value);
        }
        
        // Resetar para etapa 1 ao abrir
        etapaAtualModalIA = 1;
        irParaEtapa(1);
        
        // Carregar imagens salvas se houver featureId
        carregarImagensSalvas();
        
        // Atualizar estado do step-3 ao abrir o modal
        atualizarIndicadoresEtapas();
        
        // Atualizar estado da etapa 3 baseado na flag
        atualizarEstadoEtapa4();
        
        // Atualizar estado do botão Gerar após carregar todos os dados (com pequeno delay para garantir que tudo foi carregado)
        setTimeout(() => {
            atualizarEstadoBotaoGerar();
            // Atualizar estado do botão de mapeamento de cobertura
            if (etapaAtualModalIA === 1) {
                atualizarEstadoGeracaoIA();
            } else {
                atualizarEstadoBotaoMapeamentoCobertura();
            }
            // Atualizar visibilidade da opção "Usar exemplo" na etapa 3
            atualizarVisibilidadeUsarExemploImagens();
        }, 100);
        
        console.log('✅ Modal de Geração com IA aberto');
    } else {
        console.error('❌ Modal de IA não encontrado');
    }
}

// Flag para rastrear se há geração de CTs em andamento
let isGeneratingCTs = false;

// Flag para rastrear se os CTs foram gerados com sucesso (para manter imagens disponíveis)
let ctsGeradosComSucesso = false;

async function fecharModalGerarIA() {
    const modal = document.getElementById('modalGerarIA');
    if (modal) {
        modal.style.display = 'none';
        console.log('✅ Modal de Geração com IA fechado');
    }
    
    // Verificar se há uma flag indicando que a request de cobertura foi concluída
    // Se descricaoProdutoAtualizada é true, significa que pode haver uma request pendente
    // Nesse caso, NÃO limpar as variáveis ainda, pois elas podem estar sendo processadas
    const descricaoProdutoAtualizada = localStorage.getItem('descricaoProdutoAtualizada') === 'true';
    const novoResumoDescricaoProduto = localStorage.getItem('novoResumoDescricaoProduto');
    
    // Se descricaoProdutoAtualizada é true e há novoResumoDescricaoProduto, 
    // significa que a request foi concluída e podemos limpar apenas descricaoProdutoAtualizada
    // mas manter novoResumoDescricaoProduto pois ele foi gerado pela API
    if (descricaoProdutoAtualizada && novoResumoDescricaoProduto) {
        // A request foi concluída, resetar apenas descricaoProdutoAtualizada
        localStorage.setItem('descricaoProdutoAtualizada', 'false');
        console.log('✅ descricaoProdutoAtualizada resetado para false (novoResumoDescricaoProduto mantido pois foi gerado pela API)');
    } else if (descricaoProdutoAtualizada && !novoResumoDescricaoProduto) {
        // Se descricaoProdutoAtualizada é true mas não há novoResumoDescricaoProduto,
        // pode ser que a request ainda esteja pendente, então não limpar ainda
        console.log('⚠️ descricaoProdutoAtualizada é true mas novoResumoDescricaoProduto não existe - mantendo variáveis até request concluir');
    } else {
        // Caso normal: resetar descricaoProdutoAtualizada e limpar novoResumoDescricaoProduto
        localStorage.setItem('descricaoProdutoAtualizada', 'false');
        localStorage.removeItem('novoResumoDescricaoProduto');
        console.log('✅ descricaoProdutoAtualizada resetado para false e novoResumoDescricaoProduto limpo ao fechar modal');
    }
    
    // Atualizar estado do campo feature-text e botões ao fechar modal
    atualizarEstadoBotaoAdicionarInformacoes();
    
    // Log do estado atual para debug
    console.log('🔍 Estado ao fechar modal:');
    console.log(`   - isGeneratingCTs: ${isGeneratingCTs}`);
    console.log(`   - ctsGeradosComSucesso: ${ctsGeradosComSucesso}`);
    console.log(`   - cenariosGeradosIA.length: ${cenariosGeradosIA ? cenariosGeradosIA.length : 0}`);
    
    // NÃO limpar imagens se há geração em andamento
    // As imagens ainda podem ser necessárias para a IA processar
    if (isGeneratingCTs) {
        console.log('⚠️ Geração de CTs em andamento, mantendo imagens provisórias por enquanto...');
        console.log('⚠️ As imagens serão verificadas e limpas automaticamente quando a geração terminar');
        // Limpar cenários gerados pela AI (mas manter imagens)
        cenariosGeradosIA = [];
        // Resetar para etapa 1
        etapaAtualModalIA = 1;
        return;
    }
    
    // NÃO limpar imagens se os CTs foram gerados com sucesso
    // O usuário pode querer aplicar os CTs ou gerar novamente
    // IMPORTANTE: Verificar ANTES de limpar o array cenariosGeradosIA
    const temCTsGerados = ctsGeradosComSucesso || (cenariosGeradosIA && cenariosGeradosIA.length > 0);
    
    if (temCTsGerados) {
        console.log('✅ CTs foram gerados com sucesso, mantendo imagens disponíveis');
        console.log('✅ As imagens permanecerão disponíveis para aplicar os CTs ou gerar novamente');
        console.log('✅ NÃO será chamada a função de limpeza de imagens');
        // Limpar cenários gerados pela AI (mas manter imagens)
        cenariosGeradosIA = [];
        // Resetar flags
        ctsGeradosComSucesso = false;
        // Resetar para etapa 1
        etapaAtualModalIA = 1;
        
        // Ocultar botão aplicar e preview ao fechar modal sem aplicar
        setTimeout(() => {
            const previewDiv = document.getElementById('ai-preview');
            if (previewDiv) {
                previewDiv.style.display = 'none';
            }
            const btnApply = document.getElementById('btn-apply-ai');
            if (btnApply) {
                btnApply.style.display = 'none';
            }
        }, 100);
        
        return; // IMPORTANTE: Retornar aqui para não executar o código abaixo
    }
    
    // NÃO limpar imagens ao fechar o modal
    // As imagens devem ser mantidas mesmo se o usuário fechar o modal sem gerar CTs
    // Elas podem ser usadas posteriormente ou serão limpas apenas quando a documentação for salva/cancelada
    console.log('ℹ️ Modal fechado sem gerar CTs, mantendo imagens disponíveis');
    console.log('ℹ️ As imagens não serão deletadas ao fechar o modal');
    
    // Limpar cenários gerados pela AI
    cenariosGeradosIA = [];
    
    // Resetar flags
    ctsGeradosComSucesso = false;
    
    // Resetar para etapa 1
    etapaAtualModalIA = 1;
    
    // Resetar visual do modal ao fechar
    setTimeout(() => {
        // Mostrar seção de input novamente
        const inputSection = document.querySelector('.ai-input-section');
        if (inputSection) {
            inputSection.style.display = 'block';
        }
        
        // Mostrar indicadores de etapas novamente
        const stepsIndicator = document.querySelector('.ai-steps-indicator');
        if (stepsIndicator) {
            stepsIndicator.style.display = 'flex';
        }
        
        // Ocultar preview
        const previewDiv = document.getElementById('ai-preview');
        if (previewDiv) {
            previewDiv.style.display = 'none';
        }
        
        // Ocultar botão aplicar (garantir que está oculto)
        const btnApply = document.getElementById('btn-apply-ai');
        if (btnApply) {
            btnApply.style.display = 'none';
        }
        
        // Restaurar visibilidade da seção de cobertura de teste quando o preview é ocultado
        const coberturaTesteSection = document.getElementById('cobertura-teste-section');
        if (coberturaTesteSection && flagsConfig.iaCoberturaTeste) {
            coberturaTesteSection.style.display = '';
        }
        
        // Mostrar texto de informação de cobertura novamente
        const coberturaInfoText = document.getElementById('cobertura-info-text');
        if (coberturaInfoText) {
            coberturaInfoText.style.display = 'block';
        }
        
        // Mostrar botão Cancelar novamente
        const btnCancelar = document.getElementById('btn-cancelar-ia');
        if (btnCancelar) {
            btnCancelar.style.display = 'inline-block';
        }
        
        // Resetar etapas
        irParaEtapa(1);
    }, 300);
}

// Função para validar se pode ir para a etapa 3 (precisa ter descrição OU imagens)
function validarParaEtapa4() {
    const inputType = document.querySelector('input[name="input-type"]:checked')?.value;
    if (inputType === 'jira') {
        const jiraUrl = document.getElementById('jira-url')?.value;
        return jiraUrl && jiraUrl.trim() !== '';
    } else {
        const featureText = document.getElementById('feature-text')?.value;
        const imagensAnexadas = typeof aiImagesBase64 !== 'undefined' ? aiImagesBase64 : [];
        
        // Verificar se há imagens selecionadas no localStorage
        const imagensSelecionadas = recuperarImagensSelecionadasLocalStorage();
        const hasSelectedImages = imagensSelecionadas && imagensSelecionadas.length > 0;
        
        // Também verificar imagens novas (ainda não salvas no localStorage)
        const hasNewImages = imagensAnexadas.length > 0;
        
        // Verificar também imagens selecionadas visualmente (com classe 'selected')
        const previewDiv = document.getElementById('ai-images-preview');
        let hasVisualSelectedImages = false;
        if (previewDiv) {
            const selectedItems = previewDiv.querySelectorAll('.ai-image-preview-item.selected, .saved-image-item.selected');
            hasVisualSelectedImages = selectedItems.length > 0;
        }
        
        // Verificar também se há exemplo de imagem selecionado
        const hasExampleImage = window.exemploImagemSelecionado !== null && window.exemploImagemSelecionado !== undefined;
        
        // Precisa ter descrição OU imagens anexadas OU imagens selecionadas no localStorage OU imagens selecionadas visualmente OU exemplo de imagem
        return (featureText && featureText.trim() !== '') || hasNewImages || hasSelectedImages || hasVisualSelectedImages || hasExampleImage;
    }
}

// Função para ir para uma etapa específica
function irParaEtapa(numero) {
    if (numero < 1 || numero > 4) return;
    
    // Bloquear acesso à etapa 3 (Imagens) se a flag estiver desabilitada
    if (numero === 3 && !flagsConfig.inserirImagensProduto) {
        if (typeof showWarningModal === 'function') {
            showWarningModal('❌ A funcionalidade de inserir imagens foi desabilitada pelo administrador.');
        } else {
            alert('❌ A funcionalidade de inserir imagens foi desabilitada pelo administrador.');
        }
        return;
    }
    
    // Permitir voltar para etapas anteriores sempre
    if (numero < etapaAtualModalIA) {
        etapaAtualModalIA = numero;
        // Ocultar todas as etapas
        for (let i = 1; i <= 4; i++) {
            const stepContent = document.getElementById(`step-${i}`);
            if (stepContent) {
                stepContent.style.display = 'none';
            }
        }
        // Mostrar etapa atual
        const stepContent = document.getElementById(`step-${numero}`);
        if (stepContent) {
            stepContent.style.display = 'block';
        }
        
        // Se for etapa 3 (imagens), carregar imagens salvas
        if (numero === 3) {
            carregarImagensSalvas();
        }
        // Mostrar texto de informação de cobertura novamente ao voltar etapas
        const coberturaInfoText = document.getElementById('cobertura-info-text');
        if (coberturaInfoText) {
            coberturaInfoText.style.display = 'block';
        }
        // Atualizar indicadores
        atualizarIndicadoresEtapas();
        // Atualizar botões
        atualizarBotoesEtapas();
        return;
    }
    
    // Se tentar ir para etapa 3, só validar se a flag estiver habilitada
    // Se a flag estiver desabilitada, o bloqueio já foi feito acima
    if (numero === 3 && flagsConfig.inserirImagensProduto) {
        // Quando a flag está habilitada, permitir acesso à etapa 3 sem validação de descrição/imagens
        // A etapa 3 só deve ser bloqueada quando a flag inserirImagensProduto estiver false
    }
    
    // Para outras etapas, validar etapa atual antes de avançar
    if (numero > etapaAtualModalIA && !validarEtapaAtual()) {
        if (typeof showWarningModal === 'function') {
            showWarningModal('❌ Por favor, complete a etapa atual antes de avançar.');
        } else {
            alert('❌ Por favor, complete a etapa atual antes de avançar.');
        }
        return;
    }
    
    etapaAtualModalIA = numero;
    
    // Ocultar todas as etapas
    for (let i = 1; i <= 4; i++) {
        const stepContent = document.getElementById(`step-${i}`);
        if (stepContent) {
            stepContent.style.display = 'none';
        }
    }
    
    // Mostrar etapa atual
    const stepContent = document.getElementById(`step-${numero}`);
    if (stepContent) {
        stepContent.style.display = 'block';
    }
    
    // Se está indo para a etapa 4, atualizar opções baseado na seleção da etapa 2
    if (numero === 4) {
        const exampleSelector = document.getElementById('example-selector');
        if (exampleSelector) {
            atualizarOpcoesEtapa3(exampleSelector.value);
        }
    }
    
    // Atualizar indicadores
    atualizarIndicadoresEtapas();
    
    // Atualizar botões
    atualizarBotoesEtapas();
    
        // Atualizar estado do botão Gerar baseado nos dados (não precisa estar na etapa 3 ou 4)
    atualizarEstadoBotaoGerar();
    
    // Se estiver na etapa 1 (configurações), atualizar estado de geração
    if (etapaAtualModalIA === 1) {
        atualizarEstadoGeracaoIA();
    }
}

// Função para validar etapa atual antes de avançar
function validarEtapaAtual() {
    switch (etapaAtualModalIA) {
        case 1:
            // Etapa 1 sempre válida (configurações)
            return true;
        case 2:
            // Etapa 2 sempre válida (só precisa selecionar tipo)
            return true;
        case 3:
            // Permitir avançar sempre da etapa 3 para a etapa 4 (imagens são opcionais)
            // A validação final (texto OU imagens) será feita antes de gerar
            return true;
        case 4:
            // Validar se há descrição OU imagens antes de gerar (etapa 4 agora é Descrição)
            const inputType = document.querySelector('input[name="input-type"]:checked')?.value;
            if (inputType === 'jira') {
                const jiraUrl = document.getElementById('jira-url')?.value;
                return jiraUrl && jiraUrl.trim() !== '';
            } else {
                const featureText = document.getElementById('feature-text')?.value;
                const imagensAnexadas = typeof aiImagesBase64 !== 'undefined' ? aiImagesBase64 : [];
                
                // Verificar se há imagens selecionadas no localStorage
                const imagensSelecionadas = recuperarImagensSelecionadasLocalStorage();
                const hasSelectedImages = imagensSelecionadas && imagensSelecionadas.length > 0;
                
                // Também verificar imagens novas (ainda não salvas no localStorage)
                const hasNewImages = imagensAnexadas.length > 0;
                
                // Precisa ter descrição OU imagens anexadas OU imagens selecionadas no localStorage
                return (featureText && featureText.trim() !== '') || hasNewImages || hasSelectedImages;
            }
        default:
            return true;
    }
}

// Função para prosseguir para próxima etapa
function prosseguirEtapa() {
    if (!validarEtapaAtual()) {
        let mensagem = '❌ Por favor, preencha os campos obrigatórios antes de prosseguir.';
        
        // Mensagem específica para etapa 4 (Descrição)
        if (etapaAtualModalIA === 4) {
            mensagem = '❌ Por favor, adicione uma descrição da funcionalidade na etapa 4 ou selecione uma ou mais imagens na etapa 3 antes de prosseguir.';
        }
        
        if (typeof showWarningModal === 'function') {
            showWarningModal(mensagem);
        } else {
            alert(mensagem);
        }
        return;
    }
    
    if (etapaAtualModalIA < 4) {
        irParaEtapa(etapaAtualModalIA + 1);
    }
}

// Função para voltar para etapa anterior
function voltarEtapa() {
    if (etapaAtualModalIA > 1) {
        irParaEtapa(etapaAtualModalIA - 1);
    }
}

// Função para atualizar indicadores visuais das etapas
function atualizarIndicadoresEtapas() {
    for (let i = 1; i <= 4; i++) {
        const stepItem = document.querySelector(`.step-item[data-step="${i}"]`);
        const stepNumber = stepItem?.querySelector('.step-number');
        const stepLabel = stepItem?.querySelector('.step-label');
        const prevConnector = stepItem?.previousElementSibling;
        
        if (stepItem && stepNumber) {
            // Remover classes anteriores
            stepNumber.classList.remove('active', 'completed', 'disabled');
            stepItem.classList.remove('active', 'disabled');
            
            // Verificar se a etapa 3 (Imagens) deve ser desabilitada (flag inserirImagensProduto)
            if (i === 3 && !flagsConfig.inserirImagensProduto) {
                stepNumber.classList.add('disabled');
                stepItem.classList.add('disabled');
                stepItem.style.pointerEvents = 'none';
                stepItem.style.cursor = 'not-allowed';
            } else if (i === 3 && flagsConfig.inserirImagensProduto) {
                // Restaurar interação quando a flag estiver habilitada
                stepItem.style.pointerEvents = 'auto';
                stepItem.style.cursor = 'pointer';
            }
            
            if (i < etapaAtualModalIA) {
                // Etapas anteriores: completas
                stepNumber.classList.add('completed');
            } else if (i === etapaAtualModalIA) {
                // Etapa atual: ativa (mas não se estiver desabilitada)
                if (!stepNumber.classList.contains('disabled')) {
                    stepNumber.classList.add('active');
                    stepItem.classList.add('active');
                }
            }
            
            // Atualizar conectores
            if (prevConnector && prevConnector.classList.contains('step-connector')) {
                if (i <= etapaAtualModalIA) {
                    prevConnector.classList.add('completed');
                } else {
                    prevConnector.classList.remove('completed');
                }
            }
        }
    }
}

// Função para atualizar botões de navegação
function atualizarBotoesEtapas() {
    const btnVoltar = document.getElementById('btn-voltar-etapa');
    const btnProsseguir = document.getElementById('btn-prosseguir-etapa');
    const btnGenerate = document.getElementById('btn-generate-ai');
    
    // Botão Voltar: mostrar apenas se não estiver na etapa 1
    if (btnVoltar) {
        btnVoltar.style.display = etapaAtualModalIA > 1 ? 'inline-block' : 'none';
    }
    
    // Botão Prosseguir: mostrar apenas se não estiver na etapa 4 (última etapa)
    if (btnProsseguir) {
        btnProsseguir.style.display = etapaAtualModalIA < 4 ? 'inline-block' : 'none';
    }
    
    // Botão Gerar: mostrar em todas as etapas, estado gerenciado por atualizarEstadoBotaoGerar()
    // O botão pode ser habilitado quando houver dados na etapa 3 (Imagens) ou etapa 4 (Descrição)
    if (btnGenerate) {
        btnGenerate.style.display = 'inline-block';
        // O estado será sempre gerenciado por atualizarEstadoBotaoGerar()
        atualizarEstadoBotaoGerar();
    }
}

function atualizarContadorCaracteres() {
    const textarea = document.getElementById('feature-text');
    const charCount = document.getElementById('char-count');
    if (textarea && charCount) {
        const currentLength = textarea.value.length;
        const maxLength = 8000;
        
        charCount.textContent = `${currentLength}/${maxLength} caracteres`;
        
        // Alterar cor baseada na proximidade do limite
        charCount.classList.remove('warning', 'danger');
        if (currentLength > maxLength * 0.9) {
            charCount.classList.add('danger');
        } else if (currentLength > maxLength * 0.8) {
            charCount.classList.add('warning');
        }
    }
}

function salvarFeatureTextLocalStorage() {
    const textarea = document.getElementById('feature-text');
    if (textarea) {
        localStorage.setItem('feature-text-ai', textarea.value);
        // Atualizar estado do botão Gerar quando texto for alterado
        atualizarIndicadoresEtapas();
    }
    // Atualizar estado do botão Gerar quando o texto muda
    // Se estiver na etapa 4 (Descrição), atualizar através de atualizarEstadoGeracaoIA para considerar quantidade de CTs
    if (etapaAtualModalIA === 4) {
        atualizarEstadoGeracaoIA();
    } else {
        atualizarEstadoBotaoGerar();
        // Atualizar estado do botão de mapeamento de cobertura mesmo quando não estiver na etapa 3 ou 4
        atualizarEstadoBotaoMapeamentoCobertura();
        // Atualizar estado do botão de cobertura mesmo quando não estiver na etapa 4
        atualizarEstadoGeracaoIA();
    }
}

// Funções para o modal de adicionar informações adicionais
function abrirModalAdicionarInformacoes() {
    const modal = document.getElementById('modalAdicionarInformacoes');
    if (modal) {
        modal.style.display = 'block';
        // Limpar campo ao abrir
        const textarea = document.getElementById('texto-adicional');
        if (textarea) {
            textarea.value = '';
            atualizarContadorCaracteresAdicional();
            
            // Garantir que o listener está adicionado quando o modal é aberto
            // Remover listeners anteriores para evitar duplicatas
            const novoHandler = function() {
                atualizarContadorCaracteresAdicional();
                atualizarEstadoBotaoGerarInformacoesAdicionais();
            };
            
            // Remover listener anterior se existir (usando uma referência única)
            if (textarea._handlerAdicional) {
                textarea.removeEventListener('input', textarea._handlerAdicional);
            }
            
            // Adicionar novo listener
            textarea._handlerAdicional = novoHandler;
            textarea.addEventListener('input', novoHandler);
            
            // Também adicionar listener para paste (colar texto)
            const pasteHandler = function() {
                setTimeout(() => {
                    atualizarContadorCaracteresAdicional();
                    atualizarEstadoBotaoGerarInformacoesAdicionais();
                }, 10);
            };
            
            if (textarea._pasteHandlerAdicional) {
                textarea.removeEventListener('paste', textarea._pasteHandlerAdicional);
            }
            
            textarea._pasteHandlerAdicional = pasteHandler;
            textarea.addEventListener('paste', pasteHandler);
        }
        
        // Verificar se há imagens selecionadas e mostrar aviso
        atualizarAvisoImagensSelecionadas();
        
        // Atualizar estado do botão Gerar
        atualizarEstadoBotaoGerarInformacoesAdicionais();
        
        // Focar no textarea
        setTimeout(() => {
            if (textarea) textarea.focus();
        }, 100);
    }
}

function fecharModalAdicionarInformacoes() {
    const modal = document.getElementById('modalAdicionarInformacoes');
    if (modal) {
        modal.style.display = 'none';
    }
}

function atualizarContadorCaracteresAdicional() {
    const textarea = document.getElementById('texto-adicional');
    const charCount = document.getElementById('char-count-adicional');
    
    if (!textarea || !charCount) return;
    
    const currentLength = textarea.value.length;
    const maxLength = parseInt(textarea.getAttribute('maxlength')) || 8000;
    
    charCount.textContent = `${currentLength}/${maxLength} caracteres`;
    
    // Alterar cor baseada na proximidade do limite
    charCount.classList.remove('warning', 'danger');
    if (currentLength > maxLength * 0.9) {
        charCount.classList.add('danger');
    } else if (currentLength > maxLength * 0.8) {
        charCount.classList.add('warning');
    }
}

// Função para atualizar visibilidade do botão e estado do campo feature-text
function atualizarEstadoBotaoAdicionarInformacoes() {
    const ctAplicadosIA = localStorage.getItem('ct_aplicadosIA') === 'true';
    const btnAdicionar = document.getElementById('btn-adicionar-informacoes');
    const btnRemoverAtualizar = document.getElementById('btn-remover-atualizar-informacoes');
    const btnGenerateAI = document.getElementById('btn-generate-ai');
    const featureText = document.getElementById('feature-text');
    const descricaoProdutoAtualizada = localStorage.getItem('descricaoProdutoAtualizada') === 'true';
    
    // Container onde o botão #btn-generate-ai está localizado
    const buttonsContainer = btnGenerateAI ? btnGenerateAI.parentElement : null;
    
    if (btnAdicionar) {
        if (ctAplicadosIA) {
            // Quando ct_aplicadosIA = true, mover o botão para o lugar do #btn-generate-ai
            if (buttonsContainer && btnGenerateAI) {
                // Ocultar o botão #btn-generate-ai
                btnGenerateAI.style.display = 'none';
                
                // Verificar se o botão já está no container correto
                if (btnAdicionar.parentElement !== buttonsContainer) {
                    // Remover o botão da posição atual (etapa 4)
                    btnAdicionar.remove();
                    
                    // Adicionar o botão no lugar do #btn-generate-ai
                    buttonsContainer.insertBefore(btnAdicionar, btnGenerateAI);
                    
                    // Ajustar estilos para ficar igual ao botão Gerar
                    btnAdicionar.style.display = 'block';
                    btnAdicionar.style.width = '100%';
                    btnAdicionar.style.marginTop = '0';
                    // Adicionar classe btn-ai-generate para ter os mesmos estilos
                    if (!btnAdicionar.classList.contains('btn-ai-generate')) {
                        btnAdicionar.classList.add('btn-ai-generate');
                    }
                    // Remover classes que não são necessárias
                    btnAdicionar.classList.remove('btn');
                } else {
                    // Já está no lugar certo, apenas garantir que está visível e com os estilos corretos
                    btnAdicionar.style.display = 'block';
                    btnAdicionar.style.width = '100%';
                    btnAdicionar.style.marginTop = '0';
                    if (!btnAdicionar.classList.contains('btn-ai-generate')) {
                        btnAdicionar.classList.add('btn-ai-generate');
                    }
                }
            } else {
                // Fallback: mostrar na posição original se não encontrar o container
                btnAdicionar.style.display = 'block';
            }
        } else {
            // Quando ct_aplicadosIA = false, voltar o botão para a posição original (etapa 4)
            if (btnAdicionar.parentElement === buttonsContainer) {
                // Encontrar a posição original (ao lado do example-selector)
                const exampleSelector = document.getElementById('example-selector');
                if (exampleSelector && exampleSelector.parentElement) {
                    btnAdicionar.remove();
                    const testTextOption = exampleSelector.parentElement;
                    testTextOption.appendChild(btnAdicionar);
                    
                    // Restaurar estilos originais
                    btnAdicionar.style.width = '200px';
                    btnAdicionar.style.marginTop = '10px';
                    // Remover classe btn-ai-generate e restaurar classe btn
                    btnAdicionar.classList.remove('btn-ai-generate');
                    if (!btnAdicionar.classList.contains('btn')) {
                        btnAdicionar.classList.add('btn');
                    }
                }
            }
            btnAdicionar.style.display = 'none';
            
            // Mostrar o botão #btn-generate-ai novamente
            if (btnGenerateAI) {
                btnGenerateAI.style.display = 'block';
            }
        }
    }
    
    if (btnRemoverAtualizar) {
        if (ctAplicadosIA) {
            btnRemoverAtualizar.style.display = 'block';
        } else {
            btnRemoverAtualizar.style.display = 'none';
        }
    }
    
    if (featureText) {
        // Se descricaoProdutoAtualizada = true, o campo deve estar editável
        if (descricaoProdutoAtualizada) {
            featureText.readOnly = false;
            featureText.style.backgroundColor = '';
            featureText.style.cursor = '';
        } else if (ctAplicadosIA) {
            featureText.readOnly = true;
            featureText.style.backgroundColor = '#f5f5f5';
            featureText.style.cursor = 'not-allowed';
        } else {
            featureText.readOnly = false;
            featureText.style.backgroundColor = '';
            featureText.style.cursor = '';
        }
    }
}

// Função para remover/atualizar informações
function removerAtualizarInformacoes() {
    // Atualizar descricaoProdutoAtualizada para true
    localStorage.setItem('descricaoProdutoAtualizada', 'true');
    console.log('✅ descricaoProdutoAtualizada atualizado para true');
    
    // Tornar o campo feature-text editável
    const featureText = document.getElementById('feature-text');
    if (featureText) {
        featureText.readOnly = false;
        featureText.style.backgroundColor = '';
        featureText.style.cursor = '';
        console.log('✅ Campo feature-text liberado para edição');
    }
    
    // Exibir toast informando que o campo foi desbloqueado
    mostrarToast('Campo descrição desbloqueado', 'success');
}

// Função para exibir toast
function mostrarToast(mensagem, tipo = 'success') {
    // Remover toast existente se houver
    const toastExistente = document.getElementById('toast-geral');
    if (toastExistente) {
        toastExistente.remove();
    }
    
    // Criar novo toast
    const toast = document.createElement('div');
    toast.id = 'toast-geral';
    toast.className = `toast toast-${tipo}`;
    toast.textContent = mensagem;
    
    // Adicionar estilos inline se não existirem no CSS
    toast.style.cssText = `
        position: fixed;
        top: 30px;
        right: 30px;
        bottom: auto;
        padding: 15px 25px;
        border-radius: 8px;
        font-weight: 600;
        font-size: 0.95em;
        box-shadow: 0 4px 12px rgba(0,0,0,0.3);
        z-index: 10000;
        opacity: 0;
        transform: translateY(20px);
        transition: all 0.3s ease;
        max-width: 400px;
    `;
    
    if (tipo === 'success') {
        toast.style.background = 'linear-gradient(135deg, #00cc66 0%, #00aa55 100%)';
        toast.style.color = 'white';
    } else if (tipo === 'error') {
        toast.style.background = 'linear-gradient(135deg, #ff4444 0%, #cc3333 100%)';
        toast.style.color = 'white';
    }
    
    // Adicionar ao body
    document.body.appendChild(toast);
    
    // Mostrar toast
    setTimeout(() => {
        toast.style.opacity = '1';
        toast.style.transform = 'translateY(0)';
    }, 100);
    
    // Remover toast após 3 segundos
    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateY(20px)';
        setTimeout(() => {
            if (toast.parentNode) {
                toast.parentNode.removeChild(toast);
            }
        }, 300);
    }, 3000);
}

// Função para validar e atualizar estado do botão Gerar no modal de informações adicionais
function atualizarEstadoBotaoGerarInformacoesAdicionais() {
    const textoAdicional = document.getElementById('texto-adicional')?.value.trim() || '';
    const imagensSelecionadas = recuperarImagensSelecionadasLocalStorage();
    const temImagensSelecionadas = imagensSelecionadas && imagensSelecionadas.length > 0;
    const btnGerar = document.getElementById('btn-gerar-adicionar-informacoes');
    
    if (btnGerar) {
        // Habilitar se houver texto OU imagens selecionadas
        const podeGerar = textoAdicional.length > 0 || temImagensSelecionadas;
        
        if (podeGerar) {
            btnGerar.disabled = false;
            btnGerar.style.opacity = '1';
            btnGerar.style.cursor = 'pointer';
        } else {
            btnGerar.disabled = true;
            btnGerar.style.opacity = '0.5';
            btnGerar.style.cursor = 'not-allowed';
        }
    }
}

// Função para gerar casos de teste com informações adicionais
async function gerarCenariosComInformacoesAdicionais() {
    const textoAdicional = document.getElementById('texto-adicional')?.value.trim() || '';
    
    // Coletar imagens selecionadas do localStorage
    const imagensSelecionadas = recuperarImagensSelecionadasLocalStorage();
    const temImagensSelecionadas = imagensSelecionadas && imagensSelecionadas.length > 0;
    
    // Validar: deve ter texto adicional OU imagens selecionadas
    if (!textoAdicional && !temImagensSelecionadas) {
        alert('❌ Por favor, adicione o texto adicional ou selecione imagens antes de gerar novos casos de teste.');
        return;
    }
    
    // Fechar modal de informações adicionais
    fecharModalAdicionarInformacoes();
    
    // Marcar que estamos usando informações adicionais
    usandoInformacoesAdicionais = true;
    textoAdicionalAplicado = textoAdicional;
    let imagensParaEnviar = [];
    
    if (imagensSelecionadas && imagensSelecionadas.length > 0) {
        console.log(`📸 Coletando ${imagensSelecionadas.length} imagem(ns) selecionada(s) do localStorage para envio...`);
        
        // Verificar se savedImagesData está disponível
        if (typeof savedImagesData !== 'undefined' && Array.isArray(savedImagesData)) {
            for (const imageName of imagensSelecionadas) {
                const imageData = savedImagesData.find(img => img.filename === imageName);
                if (imageData && imageData.downloadUrl) {
                    try {
                        // Validar URL antes de converter
                        if (!imageData.downloadUrl || !imageData.downloadUrl.startsWith('http')) {
                            console.error(`❌ URL inválida para imagem "${imageName}": ${imageData.downloadUrl}`);
                            continue;
                        }
                        
                        // Converter URL da imagem para base64
                        const base64 = await urlToBase64(imageData.downloadUrl);
                        if (base64) {
                            imagensParaEnviar.push(base64);
                            console.log(`✅ Imagem selecionada "${imageName}" convertida para base64`);
                        } else {
                            console.warn(`⚠️ Falha ao converter imagem "${imageName}" para base64`);
                        }
                    } catch (error) {
                        console.error(`❌ Erro ao converter imagem selecionada "${imageName}":`, error);
                    }
                } else {
                    console.warn(`⚠️ Imagem "${imageName}" não encontrada em savedImagesData ou sem downloadUrl`);
                }
            }
        } else {
            console.warn('⚠️ savedImagesData não está disponível. As imagens selecionadas não serão enviadas.');
        }
    }
    
    // Armazenar imagens para uso na função gerarCenariosIA
    window.imagensAdicionaisParaEnviar = imagensParaEnviar;
    
    // Chamar função de geração normal, mas ela usará o texto adicional e as imagens selecionadas
    await gerarCenariosIA();
}

// Adicionar listener para atualizar contador de caracteres do texto adicional
if (typeof document !== 'undefined') {
    document.addEventListener('DOMContentLoaded', function() {
        // Função para adicionar listeners ao campo texto-adicional
        function adicionarListenersTextoAdicional() {
            const textoAdicional = document.getElementById('texto-adicional');
            if (textoAdicional) {
                // Remover listeners anteriores se existirem
                if (textoAdicional._handlerAdicional) {
                    textoAdicional.removeEventListener('input', textoAdicional._handlerAdicional);
                }
                if (textoAdicional._pasteHandlerAdicional) {
                    textoAdicional.removeEventListener('paste', textoAdicional._pasteHandlerAdicional);
                }
                
                // Adicionar novo listener para input
                const inputHandler = function() {
                    atualizarContadorCaracteresAdicional();
                    atualizarEstadoBotaoGerarInformacoesAdicionais();
                };
                textoAdicional._handlerAdicional = inputHandler;
                textoAdicional.addEventListener('input', inputHandler);
                
                // Adicionar listener para paste
                const pasteHandler = function() {
                    setTimeout(() => {
                        atualizarContadorCaracteresAdicional();
                        atualizarEstadoBotaoGerarInformacoesAdicionais();
                    }, 10);
                };
                textoAdicional._pasteHandlerAdicional = pasteHandler;
                textoAdicional.addEventListener('paste', pasteHandler);
            }
        }
        
        // Tentar adicionar listeners imediatamente
        adicionarListenersTextoAdicional();
        
        // Se o elemento não existir ainda, tentar novamente após um pequeno delay
        setTimeout(adicionarListenersTextoAdicional, 100);
        
        // Atualizar estado do botão e campo ao carregar
        atualizarEstadoBotaoAdicionarInformacoes();
        
        // Atualizar quando o modal IA for aberto
        const modalIA = document.getElementById('modalGerarIA');
        if (modalIA) {
            const observer = new MutationObserver(function(mutations) {
                if (modalIA.style.display === 'block') {
                    atualizarEstadoBotaoAdicionarInformacoes();
                }
            });
            observer.observe(modalIA, { attributes: true, attributeFilter: ['style'] });
        }
        
    });
}

function salvarTestTypeLocalStorage() {
    const testTypeField = document.getElementById('ai-test-type');
    if (testTypeField) {
        localStorage.setItem('ai-test-type', testTypeField.value);
        console.log(`💾 Tipo de teste salvo no localStorage: ${testTypeField.value}`);
    }
}

function salvarExampleSelectorLocalStorage() {
    const exampleSelector = document.getElementById('example-selector');
    if (exampleSelector) {
        localStorage.setItem('example-selector-ai', exampleSelector.value);
    }
}

function recuperarFeatureTextLocalStorage() {
    const textarea = document.getElementById('feature-text');
    if (textarea) {
        const savedText = localStorage.getItem('feature-text-ai');
        if (savedText) {
            textarea.value = savedText;
            atualizarContadorCaracteres();
            // Atualizar estado do botão Gerar após recuperar texto do localStorage
            atualizarEstadoBotaoGerar();
        }
    }
}

function recuperarTestTypeLocalStorage() {
    const testTypeField = document.getElementById('ai-test-type');
    if (testTypeField) {
        const savedTestType = localStorage.getItem('ai-test-type');
        if (savedTestType) {
            // Verificar se o valor existe nas opções do select
            const optionExists = Array.from(testTypeField.options).some(opt => opt.value === savedTestType);
            if (optionExists) {
                testTypeField.value = savedTestType;
                console.log(`📥 Tipo de teste recuperado do localStorage: ${savedTestType}`);
            } else {
                console.warn(`⚠️ Tipo de teste "${savedTestType}" não encontrado nas opções. Usando padrão "funcional".`);
                testTypeField.value = 'funcional';
            }
        }
        // Atualizar texto de informação da cobertura após recuperar
        atualizarTextoInfoCobertura();
    }
}

// Função para contar casos de teste por tipo
function contarCasosTestePorTipo(testType) {
    if (typeof cenarios === 'undefined' || !Array.isArray(cenarios)) {
        return 0;
    }
    
    return cenarios.filter(c => {
        const tipoCT = c.tipo || 'funcional'; // Se não tiver tipo, considerar como funcional
        if (testType === 'funcional') {
            // Para funcional, incluir também CTs com tipo "indefinido" (CTs manuais antigos)
            return tipoCT === 'funcional' || tipoCT === 'indefinido';
        } else {
            // Para outros tipos, filtrar apenas o mesmo tipo
            return tipoCT === testType;
        }
    }).length;
}

// Função para atualizar estado do botão Gerar baseado em dados das etapas 3 ou 4
function atualizarEstadoBotaoGerar() {
    const btnGenerate = document.getElementById('btn-generate-ai');
    if (!btnGenerate) return;
    
    // Verificar se ct_aplicadosIA está true - se sim, desabilitar o botão
    const ctAplicadosIA = localStorage.getItem('ct_aplicadosIA') === 'true';
    if (ctAplicadosIA) {
        btnGenerate.disabled = true;
        btnGenerate.style.opacity = '0.5';
        btnGenerate.style.cursor = 'not-allowed';
        btnGenerate.title = 'Casos de teste já foram aplicados pela IA. Use o botão "Adicionar Informações" para gerar novos casos de teste.';
        return;
    }
    
    // Verificar se há dados na etapa 4 (descrição) - verificar tanto o campo DOM quanto o localStorage
    const featureText = document.getElementById('feature-text')?.value.trim() || '';
    const featureTextLocalStorage = localStorage.getItem('feature-text-ai')?.trim() || '';
    const hasFeatureText = featureText.length > 0 || featureTextLocalStorage.length > 0;
    
    // Verificar se há dados na etapa 3 (imagens)
    const imagensAnexadas = typeof aiImagesBase64 !== 'undefined' ? aiImagesBase64 : [];
    const imagensSelecionadas = recuperarImagensSelecionadasLocalStorage();
    const hasSelectedImages = imagensSelecionadas && imagensSelecionadas.length > 0;
    const hasNewImages = imagensAnexadas.length > 0;
    
    // Verificar também imagens selecionadas visualmente
    const previewDiv = document.getElementById('ai-images-preview');
    let hasVisualSelectedImages = false;
    if (previewDiv) {
        const selectedItems = previewDiv.querySelectorAll('.ai-image-preview-item.selected, .saved-image-item.selected');
        hasVisualSelectedImages = selectedItems.length > 0;
    }
    
    // Verificar se há exemplo de imagem selecionado
    const hasExampleImage = window.exemploImagemSelecionado !== null && window.exemploImagemSelecionado !== undefined;
    
    // Habilitar se houver texto OU imagens (não precisa estar na etapa 4)
    const hasData = hasFeatureText || hasNewImages || hasSelectedImages || hasVisualSelectedImages || hasExampleImage;
    
    if (hasData) {
        btnGenerate.disabled = false;
        btnGenerate.style.opacity = '1';
        btnGenerate.style.cursor = 'pointer';
        btnGenerate.removeAttribute('title');
    } else {
        btnGenerate.disabled = true;
        btnGenerate.style.opacity = '0.5';
        btnGenerate.style.cursor = 'not-allowed';
        btnGenerate.title = 'Adicione uma descrição na etapa 4 ou selecione imagens na etapa 3 para habilitar';
    }
}

// Função para atualizar estado do botão e campo baseado na quantidade de CTs
function atualizarEstadoGeracaoIA() {
    const testTypeField = document.getElementById('ai-test-type');
    const btnGenerate = document.getElementById('btn-generate-ai');
    
    if (!testTypeField || !btnGenerate) {
        return;
    }
    
    const testType = testTypeField.value || 'funcional';
    const quantidadeCTs = contarCasosTestePorTipo(testType);
    
    // Mapear valores para nomes exibidos
    const testTypeNames = {
        'funcional': 'Funcional',
        'regressao': 'Regressão',
        'integracao': 'Integração',
        'usabilidade': 'Usabilidade',
        'performance': 'Performance'
    };
    
    const displayName = testTypeNames[testType] || 'Funcional';
    
    // Verificar cobertura do tipo de teste selecionado
    const cobertura = recuperarCoberturaLocalStorage(testType);
    const coberturaAlta = cobertura !== null && cobertura > 90;
    
    // Atualizar estado do botão de mapeamento (Avaliar)
    const btnMapeamentoCobertura = document.getElementById('btn-mapeamento-cobertura');
    if (btnMapeamentoCobertura) {
        // Verificar se há feature-text preenchido ou no localStorage
        const featureText = document.getElementById('feature-text')?.value.trim() || '';
        const featureTextLocalStorage = localStorage.getItem('feature-text-ai')?.trim() || '';
        const hasFeatureText = featureText.length > 0 || featureTextLocalStorage.length > 0;
        
        // Verificar se há mensagem de alterações não salvas
        const mensagemAlteracoesEl = document.getElementById('mensagem-alteracoes-avaliar');
        
        if (quantidadeCTs >= 1 && hasFeatureText) {
            // Habilitar botão de mapeamento quando houver pelo menos 1 CT E feature-text preenchido
            btnMapeamentoCobertura.disabled = false;
            btnMapeamentoCobertura.style.opacity = '1';
            btnMapeamentoCobertura.style.cursor = 'pointer';
            btnMapeamentoCobertura.style.backgroundColor = '#0066cc';
            btnMapeamentoCobertura.style.color = 'white';
            btnMapeamentoCobertura.removeAttribute('title');
            
            // Ocultar mensagem de alterações
            if (mensagemAlteracoesEl) {
                mensagemAlteracoesEl.style.display = 'none';
            }
        } else {
            // Desabilitar botão de mapeamento
            btnMapeamentoCobertura.disabled = true;
            btnMapeamentoCobertura.style.opacity = '0.5';
            btnMapeamentoCobertura.style.cursor = 'not-allowed';
            btnMapeamentoCobertura.style.backgroundColor = '#d3d3d3';
            btnMapeamentoCobertura.style.color = '#999';
            
            // Ocultar mensagem de alterações
            if (mensagemAlteracoesEl) {
                mensagemAlteracoesEl.style.display = 'none';
            }
            
            // Definir mensagem de tooltip apropriada
            if (!hasFeatureText) {
                btnMapeamentoCobertura.title = 'Para habilitar este botão, é necessário preencher a descrição do produto ou funcionalidade.';
            } else if (quantidadeCTs < 1) {
                btnMapeamentoCobertura.title = `Para habilitar este botão, é necessário ter no mínimo 1 caso de teste criado do tipo "${displayName}".`;
            } else {
                btnMapeamentoCobertura.title = 'Para habilitar este botão, é necessário preencher a descrição do produto ou funcionalidade.';
            }
        }
    }
    
    // Verificar se há dados nas etapas 2 ou 3 antes de habilitar
    atualizarEstadoBotaoGerar();
    
    // Verificar se ct_aplicadosIA está true - se sim, desabilitar o botão (prioridade sobre cobertura)
    const ctAplicadosIA = localStorage.getItem('ct_aplicadosIA') === 'true';
    if (ctAplicadosIA) {
        btnGenerate.disabled = true;
        btnGenerate.style.opacity = '0.5';
        btnGenerate.style.cursor = 'not-allowed';
        btnGenerate.title = 'Casos de teste já foram aplicados pela IA. Use o botão "Adicionar Informações" para gerar novos casos de teste.';
        console.log('🚫 Botão Gerar bloqueado: ct_aplicadosIA = true');
        return;
    }
    
    // Bloquear botão Gerar se a cobertura estiver acima de 90%
    if (coberturaAlta && etapaAtualModalIA === 4) {
        btnGenerate.disabled = true;
        btnGenerate.style.opacity = '0.5';
        btnGenerate.style.cursor = 'not-allowed';
        btnGenerate.title = 'Seu plano de teste já possui uma ótima cobertura de teste. Para evitar casos de teste duplicados o botão foi bloqueado para esse tipo de teste.';
        console.log(`🚫 Botão Gerar bloqueado: cobertura de ${cobertura.toFixed(1)}% para tipo "${displayName}"`);
    } else {
        // Remover tooltip se não estiver bloqueado por cobertura
        if (btnGenerate.title && btnGenerate.title.includes('ótima cobertura')) {
            btnGenerate.removeAttribute('title');
        }
    }
}

// Função para verificar se há alterações não salvas
function verificarAlteracoesNaoSalvas() {
    try {
        // Verificar se há flag de alterações não salvas
        const temAlteracoesFlag = localStorage.getItem('temAlteracoesNaoSalvas');
        const resultado = temAlteracoesFlag === 'true';
        console.log('🔍 Verificando alterações não salvas:', resultado);
        return resultado;
    } catch (error) {
        console.error('Erro ao verificar alterações não salvas:', error);
        return false;
    }
}

// Função para marcar que há alterações não salvas
function marcarAlteracoesNaoSalvas() {
    localStorage.setItem('temAlteracoesNaoSalvas', 'true');
    console.log('🔴 Alterações não salvas marcadas');
    // Atualizar estado do botão de avaliação
    if (typeof atualizarEstadoGeracaoIA === 'function') {
        atualizarEstadoGeracaoIA();
    } else {
        console.warn('⚠️ Função atualizarEstadoGeracaoIA não encontrada');
    }
}

// Função para limpar flag de alterações não salvas (quando salvar)
function limparAlteracoesNaoSalvas() {
    localStorage.removeItem('temAlteracoesNaoSalvas');
    // Atualizar estado do botão de avaliação
    if (typeof atualizarEstadoGeracaoIA === 'function') {
        atualizarEstadoGeracaoIA();
    }
}

function atualizarEstadoBotaoMapeamentoCobertura() {
    const btnMapeamentoCobertura = document.getElementById('btn-mapeamento-cobertura');
    if (!btnMapeamentoCobertura) return;
    
    // Verificar se há feature-text preenchido ou no localStorage
    const featureText = document.getElementById('feature-text')?.value.trim() || '';
    const featureTextLocalStorage = localStorage.getItem('feature-text-ai')?.trim() || '';
    const hasFeatureText = featureText.length > 0 || featureTextLocalStorage.length > 0;
    
    // Verificar quantidade de CTs do tipo selecionado
    const testTypeField = document.getElementById('ai-test-type');
    const testType = testTypeField?.value || 'funcional';
    const quantidadeCTs = contarCasosTestePorTipo(testType);
    
    // Mapear valores para nomes exibidos
    const testTypeNames = {
        'funcional': 'Funcional',
        'regressao': 'Regressão',
        'integracao': 'Integração',
        'usabilidade': 'Usabilidade',
        'performance': 'Performance'
    };
    const displayName = testTypeNames[testType] || 'Funcional';
    
    // Verificar se há mensagem de alterações não salvas
    const mensagemAlteracoesEl = document.getElementById('mensagem-alteracoes-avaliar');
    
    if (quantidadeCTs >= 1 && hasFeatureText) {
        // Habilitar botão de mapeamento quando houver pelo menos 1 CT E feature-text preenchido
        btnMapeamentoCobertura.disabled = false;
        btnMapeamentoCobertura.style.opacity = '1';
        btnMapeamentoCobertura.style.cursor = 'pointer';
        btnMapeamentoCobertura.style.backgroundColor = '#0066cc';
        btnMapeamentoCobertura.style.color = 'white';
        btnMapeamentoCobertura.removeAttribute('title');
        
        // Ocultar mensagem de alterações
        if (mensagemAlteracoesEl) {
            mensagemAlteracoesEl.style.display = 'none';
        }
    } else {
        // Desabilitar botão de mapeamento
        btnMapeamentoCobertura.disabled = true;
        btnMapeamentoCobertura.style.opacity = '0.5';
        btnMapeamentoCobertura.style.cursor = 'not-allowed';
        btnMapeamentoCobertura.style.backgroundColor = '#d3d3d3';
        btnMapeamentoCobertura.style.color = '#999';
        
        // Ocultar mensagem de alterações
        if (mensagemAlteracoesEl) {
            mensagemAlteracoesEl.style.display = 'none';
        }
        
        // Definir mensagem de tooltip apropriada
        if (!hasFeatureText) {
            btnMapeamentoCobertura.title = 'Para habilitar este botão, é necessário preencher a descrição do produto ou funcionalidade.';
        } else if (quantidadeCTs < 1) {
            btnMapeamentoCobertura.title = `Para habilitar este botão, é necessário ter no mínimo 1 caso de teste criado do tipo "${displayName}".`;
        } else {
            btnMapeamentoCobertura.title = 'Para habilitar este botão, é necessário preencher a descrição do produto ou funcionalidade.';
        }
    }
}

function atualizarTextoInfoCobertura() {
    const testTypeField = document.getElementById('ai-test-type');
    const displaySpan = document.getElementById('cobertura-test-type-display');
    const iconTooltip = document.getElementById('cobertura-icon-tooltip');
    const valueText = document.getElementById('cobertura-value-text');
    
    if (testTypeField && displaySpan) {
        const testType = testTypeField.value || 'funcional';
        
        // Mapear valores para nomes exibidos
        const testTypeNames = {
            'funcional': 'Funcional',
            'regressao': 'Regressão',
            'integracao': 'Integração',
            'usabilidade': 'Usabilidade',
            'performance': 'Performance'
        };
        
        const displayName = testTypeNames[testType] || 'Funcional';
        displaySpan.textContent = displayName.toLowerCase();
        
        // Atualizar texto informativo ao lado do ícone com a cobertura do localStorage
        // APENAS se a documentação já existe (tem ID válido)
        if (valueText) {
            // Verificar se é uma nova documentação (sem ID válido)
            const featureId = document.getElementById('feature-id')?.value;
            const isNewDocumentation = !featureId || featureId === '' || featureId === 'null' || featureId === null;
            
            let cobertura = null;
            
            // Só buscar cobertura se NÃO for uma nova documentação
            if (!isNewDocumentation) {
                // Buscar cobertura usando chave genérica
                cobertura = recuperarCoberturaLocalStorage(testType);
                
                // Se ainda não encontrar, tentar buscar da cobertura anterior
                if (cobertura === null) {
                    cobertura = recuperarCoberturaAnteriorLocalStorage(testType);
                }
            }
            
            if (cobertura !== null) {
                const porcentagem = parseFloat(cobertura);
                if (!isNaN(porcentagem)) {
                    valueText.innerHTML = `Cobertura atual: <strong>${porcentagem.toFixed(1)}%</strong>`;
                } else {
                    valueText.textContent = 'Nenhuma cobertura salva para este tipo de teste';
                }
            } else {
                valueText.textContent = 'Nenhuma cobertura salva para este tipo de teste';
            }
        }
        
        // Remover title do ícone (não é mais necessário, o texto está visível ao lado)
        if (iconTooltip) {
            iconTooltip.removeAttribute('title');
        }
    }
    
    // Atualizar estado do botão e campo também
    atualizarEstadoGeracaoIA();
}

function recuperarExampleSelectorLocalStorage() {
    const exampleSelector = document.getElementById('example-selector');
    if (exampleSelector) {
        const savedExample = localStorage.getItem('example-selector-ai');
        if (savedExample !== null) {
            exampleSelector.value = savedExample;
            // Atualizar opções da etapa 4 baseado no exemplo recuperado
            atualizarOpcoesEtapa3(savedExample);
        }
    }
}

async function carregarExemplo() {
    const exampleSelector = document.getElementById('example-selector');
    const textarea = document.getElementById('feature-text');
    
    if (!exampleSelector || !textarea) return;
    
    const selectedValue = exampleSelector.value;
    
    // Salvar a seleção no localStorage
    salvarExampleSelectorLocalStorage();
    
    // Atualizar opções da etapa 3 baseado na seleção da etapa 2
    atualizarOpcoesEtapa3(selectedValue);
    
    // Se selecionou "Nenhum", limpar o campo
    if (!selectedValue) {
        textarea.value = '';
        atualizarContadorCaracteres();
        salvarFeatureTextLocalStorage();
        return;
    }
    
    try {
        // Buscar o conteúdo do arquivo de exemplo
        const response = await fetch(`../exemplos_ai/${selectedValue}.txt`);
        if (response.ok) {
            const conteudo = await response.text();
            
            // Carregar conteúdo completo sem truncamento
            textarea.value = conteudo;
            atualizarContadorCaracteres();
            
            // Salvar no localStorage
            salvarFeatureTextLocalStorage();
        } else {
            console.error('Arquivo de exemplo não encontrado:', selectedValue);
            alert('❌ Erro ao carregar o exemplo. Arquivo não encontrado.');
        }
    } catch (error) {
        console.error('Erro ao carregar arquivo de exemplo:', error);
        alert('❌ Erro ao carregar o exemplo. Verifique a conexão e tente novamente.');
    }
}

// Função para atualizar opções da etapa 4 baseado na seleção da etapa 2
function atualizarOpcoesEtapa3(selectedExample) {
    const exampleImageSelector = document.getElementById('example-image-selector');
    if (!exampleImageSelector) return;
    
    // Limpar seleção atual se não for compatível
    const currentValue = exampleImageSelector.value;
    if (selectedExample && currentValue && currentValue !== selectedExample && currentValue !== '') {
        exampleImageSelector.value = '';
        carregarExemploImagem(); // Limpar preview
    }
    
    // Desabilitar/habilitar opções
    const options = exampleImageSelector.options;
    for (let i = 0; i < options.length; i++) {
        const option = options[i];
        if (option.value === '') {
            // "Nenhum" sempre habilitado
            option.disabled = false;
        } else if (selectedExample) {
            // Se há exemplo selecionado na etapa 2, mostrar apenas "Nenhum" e o exemplo selecionado
            option.disabled = option.value !== selectedExample;
        } else {
            // Se não há exemplo selecionado na etapa 2, todas as opções ficam habilitadas
            option.disabled = false;
        }
    }
}

// Mapeamento de exemplos para imagens
const exemploParaImagem = {
    'cadastro_de_produtos': 'cadastro_produto.png',
    'busca_de_produtos': 'busca.png',
    'carrinho_de_compras': 'carrinho.png',
    'sistema_de_login': 'login.png'
};

// Função para carregar imagem de exemplo
async function carregarExemploImagem() {
    // Verificar flag inserirImagensProduto
    if (!flagsConfig.inserirImagensProduto) {
        if (typeof showWarningModal === 'function') {
            showWarningModal('❌ A funcionalidade de inserir imagens foi desabilitada pelo administrador.');
        } else {
            alert('❌ A funcionalidade de inserir imagens foi desabilitada pelo administrador.');
        }
        const exampleImageSelector = document.getElementById('example-image-selector');
        if (exampleImageSelector) {
            exampleImageSelector.value = '';
        }
        return;
    }
    
    const exampleImageSelector = document.getElementById('example-image-selector');
    const uploadSection = document.querySelector('.ai-image-upload-section');
    const examplePreview = document.getElementById('example-image-preview');
    const input = document.getElementById('ai-images-input');
    
    if (!exampleImageSelector || !uploadSection) return;
    
    const selectedValue = exampleImageSelector.value;
    
    // Se selecionou "Nenhum", mostrar upload section e ocultar preview
    if (!selectedValue) {
        uploadSection.style.display = 'block';
        if (examplePreview) {
            examplePreview.style.display = 'none';
            examplePreview.innerHTML = '';
        }
        // Limpar imagens
        aiImagesBase64 = [];
        // Limpar o Set de desmarcadas já que as imagens foram limpas
        aiImagesDeselected.clear();
        window.exemploImagemSelecionado = null; // Limpar informação do exemplo
        window.temImagemExemploSelecionada = false; // Marcar que não há imagem de exemplo selecionada
        if (input) input.value = '';
        // Atualizar visualização unificada
        exibirTodasImagens();
        // Atualizar estado do botão Gerar quando exemplo de imagem for removido
        atualizarIndicadoresEtapas();
        
        // Atualizar estado do botão Gerar após remover exemplo
        // Se estiver na etapa 4 (Descrição), atualizar através de atualizarEstadoGeracaoIA para considerar quantidade de CTs
        if (etapaAtualModalIA === 4) {
            atualizarEstadoGeracaoIA();
        } else {
            atualizarEstadoBotaoGerar();
        }
        console.log('🔄 Exemplo de imagem removido - upload section habilitado');
        return;
    }
    
    // Ocultar upload section
    uploadSection.style.display = 'none';
    
    // Obter nome do arquivo de imagem
    const imageFileName = exemploParaImagem[selectedValue];
    if (!imageFileName) {
        console.error('Imagem de exemplo não encontrada para:', selectedValue);
        return;
    }
    
    try {
        // Buscar a imagem
        const imagePath = `../exemplos_ai_img/${imageFileName}`;
        const response = await fetch(imagePath);
        
        if (!response.ok) {
            throw new Error('Imagem não encontrada');
        }
        
        // Converter para blob e depois para base64
        const blob = await response.blob();
        const reader = new FileReader();
        
        reader.onloadend = async function() {
            const base64String = reader.result;
            
            // Comprimir a imagem
            const file = new File([blob], imageFileName, { type: blob.type });
            const compressedBase64 = await compressImage(file);
            
            if (compressedBase64) {
                // Armazenar no array de imagens
                aiImagesBase64 = [compressedBase64];
                // Limpar o Set de desmarcadas já que uma nova imagem de exemplo foi carregada
                aiImagesDeselected.clear();
                
                // Armazenar informação sobre qual exemplo foi selecionado (para logs)
                window.exemploImagemSelecionado = {
                    exemplo: selectedValue,
                    imagem: imageFileName,
                    timestamp: new Date().toISOString()
                };
                
                // Marcar que há uma imagem de exemplo selecionada (para controle de envio)
                window.temImagemExemploSelecionada = true;
                
                // Mostrar preview na primeira coluna (example preview)
                if (examplePreview) {
                    examplePreview.innerHTML = `
                        <div class="ai-image-preview-item">
                            <img src="${compressedBase64}" alt="Exemplo ${selectedValue}">
                            <button type="button" class="remove-image-btn" onclick="removerExemploImagem()" title="Remover exemplo">✕</button>
                        </div>
                    `;
                    examplePreview.style.display = 'block';
                }
                
                // Atualizar visualização unificada (inclui exemplo + imagens salvas)
                exibirTodasImagens();
                
                // Atualizar estado do botão Gerar quando exemplo de imagem for selecionado
                atualizarIndicadoresEtapas();
                
                // Simular que a imagem foi selecionada no input
                // Criar um DataTransfer para simular o input de arquivo
                const dataTransfer = new DataTransfer();
                dataTransfer.items.add(file);
                if (input) {
                    input.files = dataTransfer.files;
                }
                
                console.log('✅ Imagem de exemplo carregada:', imageFileName);
                console.log('📋 Exemplo selecionado:', selectedValue);
                console.log('💾 Imagem armazenada no array aiImagesBase64 (1 imagem)');
                
                // Atualizar estado do botão Gerar após carregar exemplo
                // Se estiver na etapa 4 (Descrição), atualizar através de atualizarEstadoGeracaoIA para considerar quantidade de CTs
                if (etapaAtualModalIA === 4) {
                    atualizarEstadoGeracaoIA();
                } else {
                    atualizarEstadoBotaoGerar();
                }
            }
        };
        
        reader.readAsDataURL(blob);
        
    } catch (error) {
        console.error('Erro ao carregar imagem de exemplo:', error);
        alert('❌ Erro ao carregar a imagem de exemplo. Verifique a conexão e tente novamente.');
        // Restaurar upload section em caso de erro
        uploadSection.style.display = 'block';
        if (examplePreview) {
            examplePreview.style.display = 'none';
        }
    }
}

// Função para remover exemplo de imagem
function removerExemploImagem() {
    const exampleImageSelector = document.getElementById('example-image-selector');
    if (exampleImageSelector) {
        exampleImageSelector.value = '';
        carregarExemploImagem();
    }
}

function toggleInputType() {
    const inputType = document.querySelector('input[name="input-type"]:checked');
    if (!inputType) return;
    
    const jiraSection = document.getElementById('jira-input-section');
    const textSection = document.getElementById('text-input-section');
    
    if (inputType.value === 'jira') {
        if (jiraSection) jiraSection.classList.add('active');
        if (textSection) textSection.classList.remove('active');
    } else {
        if (jiraSection) jiraSection.classList.remove('active');
        if (textSection) textSection.classList.add('active');
    }
}

// Array global para armazenar imagens em base64
let aiImagesBase64 = [];

// Função para comprimir imagem OTIMIZADA para detail: "high" da OpenAI
function compressImage(file, maxWidth = 2048, maxHeight = 2048, quality = 0.85) {
    return new Promise((resolve) => {
        const reader = new FileReader();
        
        reader.onload = function(e) {
            const img = new Image();
            
            img.onload = function() {
                const canvas = document.createElement('canvas');
                let width = img.width;
                let height = img.height;
                
                // Calcular novas dimensões mantendo proporção
                if (width > height) {
                    if (width > maxWidth) {
                        height *= maxWidth / width;
                        width = maxWidth;
                    }
                } else {
                    if (height > maxHeight) {
                        width *= maxHeight / height;
                        height = maxHeight;
                    }
                }
                
                canvas.width = width;
                canvas.height = height;
                
                const ctx = canvas.getContext('2d');
                
                // Melhorar qualidade de renderização para preservar detalhes
                ctx.imageSmoothingEnabled = true;
                ctx.imageSmoothingQuality = 'high';
                
                ctx.drawImage(img, 0, 0, width, height);
                
                // Converter para base64 com qualidade otimizada para análise detalhada
                const compressedBase64 = canvas.toDataURL('image/jpeg', quality);
                resolve(compressedBase64);
            };
            
            img.onerror = function() {
                // Se falhar, usar o original
                resolve(e.target.result);
            };
            
            img.src = e.target.result;
        };
        
        reader.onerror = function() {
            // Se falhar no read, retornar null
            resolve(null);
        };
        
        reader.readAsDataURL(file);
    });
}

async function previewIAImages() {
    const input = document.getElementById('ai-images-input');
    const previewDiv = document.getElementById('ai-images-preview');
    const exampleImageSelector = document.getElementById('example-image-selector');
    const examplePreview = document.getElementById('example-image-preview');
    const uploadSection = document.querySelector('.ai-image-upload-section');
    
    if (!input || !previewDiv) return;
    
    // Verificar flag inserirImagensProduto
    if (!flagsConfig.inserirImagensProduto) {
        if (typeof showWarningModal === 'function') {
            showWarningModal('❌ A funcionalidade de inserir imagens foi desabilitada pelo administrador.');
        } else {
            alert('❌ A funcionalidade de inserir imagens foi desabilitada pelo administrador.');
        }
        input.value = ''; // Limpar seleção
        return;
    }
    
    const files = input.files;
    const maxImages = 5;
    
    // Se o usuário selecionou imagens manualmente, desmarcar exemplo e mostrar upload section
    if (files.length > 0) {
        if (exampleImageSelector) {
            exampleImageSelector.value = '';
        }
        if (examplePreview) {
            examplePreview.style.display = 'none';
            examplePreview.innerHTML = '';
        }
        
        // Atualizar visualização unificada
        exibirTodasImagens();
        if (uploadSection) {
            uploadSection.style.display = 'block';
        }
        // Limpar informação do exemplo quando usuário faz upload manual
        window.exemploImagemSelecionado = null;
        window.temImagemExemploSelecionada = false;
        console.log('🔄 Upload manual detectado - exemplo de imagem removido');
    }
    
    if (files.length > maxImages) {
        if (typeof showWarningModal === 'function') {
            showWarningModal(`❌ Máximo de ${maxImages} imagens permitidas. Primeiras ${maxImages} imagens serão usadas.`);
        } else {
            alert(`❌ Máximo de ${maxImages} imagens permitidas. Primeiras ${maxImages} imagens serão usadas.`);
        }
    }
    
    if (files.length === 0) {
        exibirTodasImagens();
        return;
    }
    
    // Processar imagens (até 5)
    const imageFiles = Array.from(files).slice(0, maxImages);
    
    // Salvar o estado atual das imagens antes do upload para identificar as novas
    const imagensAntes = new Set(savedImagesData.map(img => img.filename));
    
    // Fazer upload das imagens e depois recarregar a lista de imagens salvas
    await fazerUploadImagensSelecionadas();
    
    // Limpar array de imagens novas após upload bem-sucedido
    // As imagens agora estão salvas no S3 e serão exibidas como saved-image-item
    aiImagesBase64 = [];
    // Limpar o Set de desmarcadas já que as imagens foram enviadas
    aiImagesDeselected.clear();
    
    // Recarregar imagens salvas para exibir as recém-adicionadas
    await carregarImagensSalvas();
    
    // Identificar imagens recém-adicionadas comparando com o estado anterior
    const imagensNovas = savedImagesData.filter(img => !imagensAntes.has(img.filename));
    
    // Marcar as imagens recém-adicionadas como selecionadas
    imagensNovas.forEach(imagem => {
        if (!savedImagesSelected.has(imagem.filename)) {
            savedImagesSelected.add(imagem.filename);
        }
    });
    
    // Salvar no localStorage
    if (imagensNovas.length > 0) {
        salvarImagensSelecionadasLocalStorage();
        // Atualizar aviso de imagens selecionadas
        atualizarAvisoImagensSelecionadas();
    }
    
    // Exibir todas as imagens (agora todas como saved-image-item, com as novas primeiro)
    exibirTodasImagens();
    
    // Atualizar visibilidade da opção "Usar exemplo" baseado nas imagens enviadas
    atualizarVisibilidadeUsarExemploImagens();
    
    // Atualizar estado do botão Gerar quando imagens forem adicionadas
    atualizarIndicadoresEtapas();
    // Atualizar estado do botão Gerar
    atualizarEstadoBotaoGerar();
}

function removeIAImage(index) {
    aiImagesBase64.splice(index, 1);
    // Limpar o Set de desmarcadas já que os índices mudaram
    aiImagesDeselected.clear();
    const input = document.getElementById('ai-images-input');
    input.value = ''; // Reset input
    
    // Atualizar preview com todas as imagens
    exibirTodasImagens();
    // Atualizar estado do botão Gerar quando imagem for removida
    atualizarIndicadoresEtapas();
    // Atualizar estado do botão Gerar
    atualizarEstadoBotaoGerar();
}

// Variável para armazenar imagens salvas selecionadas
let savedImagesSelected = new Set();
let savedImagesData = [];
// Variável para armazenar índices de imagens novas que foram desmarcadas
let aiImagesDeselected = new Set();
let provisionalFeatureId = null; // Armazenar ID provisório para limpeza se necessário

// Função para garantir que existe um featureId (gerar provisório se necessário)
async function garantirFeatureId() {
    let featureId = document.getElementById('feature-id')?.value;
    
    // Verificar se há hash na URL (vindo do backup)
    const urlParams = new URLSearchParams(window.location.search);
    const hashFromUrl = urlParams.get('hash');
    
    // Se não tem ID mas tem hash na URL, usar o hash
    if (!featureId && hashFromUrl) {
        featureId = hashFromUrl;
        const featureIdInput = document.getElementById('feature-id');
        if (featureIdInput) {
            featureIdInput.value = featureId;
        }
        const isEdit = !!urlParams.get('edit');
        if (!isEdit) {
            provisionalFeatureId = featureId;
        }
        console.log(`🔢 FeatureId do backup usado: ${featureId}`);
        return featureId;
    }
    
    // Se não tem ID, gerar um provisório
    if (!featureId) {
        try {
            const response = await fetch(`${API_BASE_URL}/api/features/next-id`);
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const result = await response.json();
            featureId = result.nextId || '1';
            
            // Verificar se é uma nova documentação (sem parâmetro ?edit=)
            const isEdit = !!urlParams.get('edit');
            
            // Se não for edição, é provisório
            if (!isEdit) {
                provisionalFeatureId = featureId;
                console.log(`🔢 FeatureId provisório gerado: ${featureId}`);
            }
            
            // Atualizar o campo hidden
            const featureIdInput = document.getElementById('feature-id');
            if (featureIdInput) {
                featureIdInput.value = featureId;
            }
            
            return featureId;
        } catch (error) {
            console.error('❌ Erro ao gerar featureId provisório:', error);
            // Fallback: gerar hash localmente
            const caracteres = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
            let hash = '';
            for (let i = 0; i < 6; i++) {
                hash += caracteres.charAt(Math.floor(Math.random() * caracteres.length));
            }
            featureId = hash;
            provisionalFeatureId = featureId;
            
            const featureIdInput = document.getElementById('feature-id');
            if (featureIdInput) {
                featureIdInput.value = featureId;
            }
            
            console.log(`🔢 FeatureId provisório gerado localmente: ${featureId}`);
            return featureId;
        }
    }
    
    return featureId;
}

// Função auxiliar para verificar e limpar imagens provisórias se necessário
async function verificarELimparImagensProvisoriasSeNecessario() {
    // NÃO limpar se há geração em andamento
    if (isGeneratingCTs) {
        console.log('⚠️ Geração ainda em andamento, não limpando imagens');
        return;
    }
    
    // NÃO limpar se os CTs foram gerados com sucesso
    // As imagens devem permanecer disponíveis para aplicar os CTs ou gerar novamente
    if (ctsGeradosComSucesso) {
        console.log('✅ CTs foram gerados com sucesso, NÃO limpando imagens provisórias');
        console.log('✅ As imagens permanecerão disponíveis para aplicar os CTs ou gerar novamente');
        return;
    }
    
    // Aguardar um pouco mais para garantir que a IA terminou completamente
    // (a flag pode ser false mas a IA ainda pode estar processando internamente)
    await new Promise(resolve => setTimeout(resolve, 2000)); // Aguardar 2 segundos
    
    // Verificar novamente se ainda não há geração em andamento ou CTs gerados
    if (isGeneratingCTs) {
        console.log('⚠️ Geração detectada após espera, não limpando imagens');
        return;
    }
    
    if (ctsGeradosComSucesso) {
        console.log('✅ CTs gerados detectados após espera, não limpando imagens');
        return;
    }
    
    const urlParams = new URLSearchParams(window.location.search);
    const isEdit = !!urlParams.get('edit');
    const currentFeatureId = document.getElementById('feature-id')?.value;
    
    // Se não é edição e há um ID provisório que ainda não foi salvo, limpar imagens
    if (!isEdit && provisionalFeatureId && provisionalFeatureId === currentFeatureId) {
        // Verificar se a documentação foi salva
        try {
            const response = await fetch(`${API_BASE_URL}/api/features/${provisionalFeatureId}`);
            const result = await response.json();
            
            // Se não encontrou a feature, significa que não foi salva, então limpar imagens
            if (!result.success || !result.data) {
                console.log('⚠️ Documentação não foi salva e nenhum CT foi gerado, limpando imagens provisórias...');
                await limparImagensProvisorias();
            } else {
                console.log('✅ Documentação foi salva, mantendo imagens');
                provisionalFeatureId = null;
            }
        } catch (error) {
            console.log('⚠️ Erro ao verificar se documentação foi salva, limpando imagens provisórias...');
            await limparImagensProvisorias();
        }
    }
}

// Função para limpar imagens provisórias do S3
async function limparImagensProvisorias() {
    if (!provisionalFeatureId) {
        return;
    }
    
    try {
        console.log(`🗑️ Limpando imagens provisórias do featureId: ${provisionalFeatureId}`);
        
        // Buscar todas as imagens do featureId provisório
        const response = await fetch(`${API_BASE_URL}/api/features/${provisionalFeatureId}/images`);
        if (response.ok) {
            const result = await response.json();
            if (result.success && result.images && result.images.length > 0) {
                // Deletar cada imagem
                for (const image of result.images) {
                    try {
                        const deleteResponse = await fetch(`${API_BASE_URL}/api/features/${provisionalFeatureId}/images/${image.filename}`, {
                            method: 'DELETE'
                        });
                        if (deleteResponse.ok) {
                            console.log(`✅ Imagem provisória deletada: ${image.filename}`);
                        }
                    } catch (error) {
                        console.error(`❌ Erro ao deletar imagem ${image.filename}:`, error);
                    }
                }
            }
        }
        
        // Limpar o ID provisório
        provisionalFeatureId = null;
    } catch (error) {
        console.error('❌ Erro ao limpar imagens provisórias:', error);
    }
}

// Funções para gerenciar imagens selecionadas no localStorage
function salvarImagensSelecionadasLocalStorage() {
    // Remover imagens que estão marcadas para deletar
    const imagensDeletar = recuperarImagensDeletarLocalStorage();
    const imagensSelecionadas = Array.from(savedImagesSelected).filter(img => !imagensDeletar.includes(img));
    localStorage.setItem('imagens_selecionadas', JSON.stringify(imagensSelecionadas));
    console.log(`💾 Imagens selecionadas salvas no localStorage:`, imagensSelecionadas);
}

function recuperarImagensSelecionadasLocalStorage() {
    const stored = localStorage.getItem('imagens_selecionadas');
    if (stored) {
        try {
            const imagens = JSON.parse(stored);
            savedImagesSelected = new Set(imagens);
            console.log(`📂 Imagens selecionadas recuperadas do localStorage:`, imagens);
            return imagens;
        } catch (error) {
            console.error('❌ Erro ao recuperar imagens selecionadas do localStorage:', error);
        }
    }
    return [];
}

// Função auxiliar para atualizar o aviso de imagens selecionadas nos modais
function atualizarAvisoImagensSelecionadas() {
    const imagensSelecionadas = recuperarImagensSelecionadasLocalStorage();
    const mensagem = imagensSelecionadas && imagensSelecionadas.length > 0 
        ? `⚠️ ${imagensSelecionadas.length} imagem(ns) selecionada(s) e será(ão) enviada(s) para a IA.`
        : null;
    
    // Atualizar aviso no modal de gerar IA
    const avisoDivIA = document.getElementById('imagens-selecionadas-aviso-ia');
    if (avisoDivIA) {
        if (mensagem) {
            avisoDivIA.style.display = 'block';
            avisoDivIA.textContent = mensagem;
        } else {
            avisoDivIA.style.display = 'none';
        }
    }
    
    // Atualizar aviso no modal de adicionar informações
    const avisoDivAdicional = document.getElementById('imagens-selecionadas-aviso-adicional');
    if (avisoDivAdicional) {
        if (mensagem) {
            avisoDivAdicional.style.display = 'block';
            avisoDivAdicional.textContent = mensagem;
        } else {
            avisoDivAdicional.style.display = 'none';
        }
    }
    
    // Atualizar estado do botão Gerar no modal de informações adicionais se o modal estiver aberto
    const modalAdicionar = document.getElementById('modalAdicionarInformacoes');
    if (modalAdicionar && modalAdicionar.style.display === 'block') {
        atualizarEstadoBotaoGerarInformacoesAdicionais();
    }
}

function limparImagensSelecionadasLocalStorage() {
    localStorage.removeItem('imagens_selecionadas');
    savedImagesSelected.clear();
    console.log(`🗑️ Imagens selecionadas removidas do localStorage`);
}

// Funções para gerenciar imagens adicionadas no localStorage
function adicionarImagemAdicionada(imageName) {
    const imagensAdicionadas = recuperarImagensAdicionadasLocalStorage();
    if (!imagensAdicionadas.includes(imageName)) {
        imagensAdicionadas.push(imageName);
        localStorage.setItem('imagens_adicionadas', JSON.stringify(imagensAdicionadas));
        console.log(`💾 Imagem adicionada ao localStorage: ${imageName}`);
    }
}

function recuperarImagensAdicionadasLocalStorage() {
    const stored = localStorage.getItem('imagens_adicionadas');
    if (stored) {
        try {
            return JSON.parse(stored);
        } catch (error) {
            console.error('❌ Erro ao recuperar imagens adicionadas do localStorage:', error);
        }
    }
    return [];
}

function removerImagemAdicionada(imageName) {
    const imagensAdicionadas = recuperarImagensAdicionadasLocalStorage();
    const index = imagensAdicionadas.indexOf(imageName);
    if (index > -1) {
        imagensAdicionadas.splice(index, 1);
        localStorage.setItem('imagens_adicionadas', JSON.stringify(imagensAdicionadas));
        console.log(`🗑️ Imagem removida de imagens_adicionadas: ${imageName}`);
    }
}

function limparImagensAdicionadasLocalStorage() {
    localStorage.removeItem('imagens_adicionadas');
    console.log(`🗑️ Imagens adicionadas removidas do localStorage`);
}

// Funções para gerenciar imagens a deletar no localStorage
function adicionarImagemDeletar(imageName) {
    const imagensDeletar = recuperarImagensDeletarLocalStorage();
    if (!imagensDeletar.includes(imageName)) {
        imagensDeletar.push(imageName);
        localStorage.setItem('imagens_deletar', JSON.stringify(imagensDeletar));
        console.log(`💾 Imagem marcada para deletar: ${imageName}`);
    }
}

function recuperarImagensDeletarLocalStorage() {
    const stored = localStorage.getItem('imagens_deletar');
    if (stored) {
        try {
            return JSON.parse(stored);
        } catch (error) {
            console.error('❌ Erro ao recuperar imagens a deletar do localStorage:', error);
        }
    }
    return [];
}

function limparImagensDeletarLocalStorage() {
    localStorage.removeItem('imagens_deletar');
    console.log(`🗑️ Imagens a deletar removidas do localStorage`);
}

// Funções para gerenciar cobertura no localStorage
function salvarCoberturaLocalStorage(tipoTeste, coberturaPercentual) {
    if (coberturaPercentual === undefined || coberturaPercentual === null) {
        console.warn('⚠️ Não foi possível salvar cobertura: coberturaPercentual inválido');
        return;
    }
    
    // Salvar com chave genérica (sem tipo específico)
    localStorage.setItem('cobertura', coberturaPercentual.toString());
    console.log(`💾 Cobertura salva no localStorage: cobertura = ${coberturaPercentual}%`);
}

function recuperarCoberturaLocalStorage(tipoTeste) {
    // Buscar com chave genérica (sem tipo específico)
    const cobertura = localStorage.getItem('cobertura');
    
    if (cobertura === null) {
        console.log('📊 Nenhuma cobertura anterior encontrada');
        return null;
    }
    
    const coberturaNum = parseFloat(cobertura);
    if (isNaN(coberturaNum)) {
        console.warn(`⚠️ Cobertura inválida no localStorage: ${cobertura}`);
        return null;
    }
    
    console.log(`📊 Cobertura anterior recuperada: cobertura = ${coberturaNum}%`);
    return coberturaNum;
}

function limparCoberturasLocalStorage() {
    // Limpar todas as coberturas armazenadas
    const tiposTeste = ['funcional', 'regressao', 'performance', 'integracao', 'usabilidade', 'indefinido'];
    tiposTeste.forEach(tipo => {
        const chave = `cobertura_${tipo}`;
        localStorage.removeItem(chave);
    });
    console.log('🗑️ Todas as coberturas foram removidas do localStorage');
}

// Função para salvar cobertura anterior antes de deletar
function salvarCoberturaAnteriorLocalStorage(tipoTeste) {
    // Recuperar valor atual antes de limpar (usando chave genérica)
    const coberturaAtual = localStorage.getItem('cobertura');
    if (coberturaAtual !== null) {
        const coberturaNum = parseFloat(coberturaAtual);
        if (!isNaN(coberturaNum)) {
            localStorage.setItem('cobertura_anterior', coberturaNum.toString());
            console.log(`💾 Cobertura anterior salva: cobertura_anterior = ${coberturaNum}%`);
        }
    }
}

// Função para limpar cobertura de um tipo específico
function limparCoberturaTipoLocalStorage(tipoTeste) {
    if (!tipoTeste) {
        return;
    }
    
    // Normalizar tipo: se for 'indefinido', tratar como 'funcional' para cobertura
    const tipoParaCobertura = tipoTeste === 'indefinido' ? 'funcional' : tipoTeste;
    const chave = `cobertura_${tipoParaCobertura.toLowerCase()}`;
    
    // Salvar valor anterior antes de limpar
    salvarCoberturaAnteriorLocalStorage(tipoTeste);
    
    localStorage.removeItem(chave);
    console.log(`🗑️ Cobertura removida do localStorage: ${chave}`);
    
    // Atualizar tooltip se o tipo deletado for o mesmo do tipo selecionado no modal
    const testTypeField = document.getElementById('ai-test-type');
    if (testTypeField) {
        const tipoSelecionado = testTypeField.value || 'funcional';
        const tipoSelecionadoNormalizado = tipoSelecionado === 'indefinido' ? 'funcional' : tipoSelecionado;
        if (tipoParaCobertura === tipoSelecionadoNormalizado) {
            atualizarTextoInfoCobertura();
        }
    }
}

// Função para recuperar cobertura anterior (usada quando casos foram deletados)
function recuperarCoberturaAnteriorLocalStorage(tipoTeste) {
    // Buscar cobertura anterior genérica (sem tipo específico)
    const chaveAnterior = 'cobertura_anterior';
    const cobertura = localStorage.getItem(chaveAnterior);
    
    if (cobertura === null) {
        return null;
    }
    
    const coberturaNum = parseFloat(cobertura);
    if (isNaN(coberturaNum)) {
        console.warn(`⚠️ Cobertura anterior inválida no localStorage: ${cobertura}`);
        return null;
    }
    
    console.log(`📊 Cobertura anterior recuperada (após deletar CTs): ${chaveAnterior} = ${coberturaNum}%`);
    return coberturaNum;
}

// Função para limpar cobertura anterior (usada após salvar documentação)
function limparCoberturaAnteriorLocalStorage(tipoTeste) {
    // Limpar cobertura anterior genérica (sem tipo específico)
    const chaveAnterior = 'cobertura_anterior';
    localStorage.removeItem(chaveAnterior);
    console.log(`🗑️ Cobertura anterior removida: ${chaveAnterior}`);
}

// Função para limpar todas as coberturas anteriores
function limparTodasCoberturasAnterioresLocalStorage() {
    // Limpar cobertura anterior genérica (sem tipo específico)
    const chaveAnterior = 'cobertura_anterior';
    localStorage.removeItem(chaveAnterior);
    console.log('🗑️ Cobertura anterior foi removida do localStorage');
}

// Função para coletar todas as coberturas do localStorage
function coletarCoberturasLocalStorage() {
    // Buscar cobertura genérica (sem tipo específico)
    const cobertura = localStorage.getItem('cobertura');
    
    // Retornar objeto simples com apenas cobertura (sem tipos específicos)
    if (cobertura !== null) {
        const coberturaNum = parseFloat(cobertura);
        if (!isNaN(coberturaNum)) {
            return { cobertura: coberturaNum };
        }
    }
    
    return {};
}

// Função para restaurar coberturas no localStorage a partir do JSON
function restaurarCoberturasLocalStorage(coberturas) {
    if (!coberturas || typeof coberturas !== 'object') {
        console.log('📊 Nenhuma cobertura para restaurar');
        return;
    }
    
    // Verificar se há cobertura direta (novo formato)
    if (coberturas.cobertura !== undefined && coberturas.cobertura !== null) {
        const porcentagem = parseFloat(coberturas.cobertura);
        if (!isNaN(porcentagem)) {
            salvarCoberturaLocalStorage(null, porcentagem);
            console.log(`📊 Cobertura restaurada do JSON para o localStorage: ${porcentagem}%`);
            return;
        }
    }
    
    // Compatibilidade: se for formato antigo com tipos, usar o primeiro valor válido
    const valores = Object.values(coberturas).filter(val => val !== null && val !== undefined && !isNaN(parseFloat(val)));
    if (valores.length > 0) {
        const porcentagem = parseFloat(valores[0]);
        salvarCoberturaLocalStorage(null, porcentagem);
        console.log(`📊 Cobertura restaurada do JSON (formato antigo) para o localStorage: ${porcentagem}%`);
    } else {
        console.log('📊 Nenhuma cobertura válida encontrada no JSON');
    }
}

// Função para carregar imagens selecionadas do metadata da feature
async function carregarImagensSelecionadasDoMetadata() {
    const featureId = document.getElementById('feature-id')?.value;
    if (!featureId) return;
    
    try {
        const response = await fetch(`${API_BASE_URL}/api/features/${featureId}`);
        if (response.ok) {
            const result = await response.json();
            if (result.success && result.data && result.data.imagens_selecionadas) {
                savedImagesSelected = new Set(result.data.imagens_selecionadas);
                // Não salvar no localStorage aqui - será preenchido quando usuário selecionar
                console.log(`📂 Imagens selecionadas carregadas do metadata:`, result.data.imagens_selecionadas);
            }
        }
    } catch (error) {
        console.error('❌ Erro ao carregar imagens selecionadas do metadata:', error);
    }
}

// Função para atualizar visibilidade da opção "Usar exemplo" na etapa 3 (Imagens)
// Oculta a opção quando houver pelo menos uma imagem enviada pelo upload
function atualizarVisibilidadeUsarExemploImagens() {
    const usarExemploContainer = document.querySelector('[data-cy="test-text-option-images"]');
    
    if (!usarExemploContainer) return;
    
    // Verificar se há pelo menos uma imagem enviada (em savedImagesData)
    // Considerar também imagens que não foram marcadas para deletar
    const imagensDeletar = recuperarImagensDeletarLocalStorage();
    const imagensSalvasFiltradas = savedImagesData.filter(image => !imagensDeletar.includes(image.filename));
    const temImagensEnviadas = imagensSalvasFiltradas.length > 0;
    
    // Ocultar se houver imagens enviadas, mostrar caso contrário
    if (temImagensEnviadas) {
        usarExemploContainer.style.display = 'none';
    } else {
        usarExemploContainer.style.display = 'block';
    }
}

// Função para carregar imagens salvas da feature
async function carregarImagensSalvas() {
    // Garantir que existe um featureId (gerar provisório se necessário)
    const featureId = await garantirFeatureId();
    if (!featureId) {
        console.log('ℹ️ Nenhum featureId encontrado, não é possível carregar imagens salvas');
        return;
    }

    try {
        const response = await fetch(`${API_BASE_URL}/api/features/${featureId}/images`);
        if (!response.ok) {
            throw new Error('Erro ao carregar imagens');
        }

        const result = await response.json();
        if (result.success && result.images && result.images.length > 0) {
            savedImagesData = result.images;
            
            // Verificar se há imagens selecionadas no localStorage
            const stored = localStorage.getItem('imagens_selecionadas');
            if (stored) {
                // Se houver no localStorage, usar essas (usuário selecionou durante a sessão)
                recuperarImagensSelecionadasLocalStorage();
            }
            // Não carregar do metadata automaticamente - o usuário deve selecionar manualmente
            
            exibirTodasImagens();
        } else {
            savedImagesData = [];
            // Verificar se há imagens selecionadas no localStorage
            const stored = localStorage.getItem('imagens_selecionadas');
            if (stored) {
                recuperarImagensSelecionadasLocalStorage();
            }
            // Não carregar do metadata automaticamente - o usuário deve selecionar manualmente
            exibirTodasImagens();
        }
        
        // Atualizar visibilidade da opção "Usar exemplo" baseado nas imagens enviadas
        atualizarVisibilidadeUsarExemploImagens();
        
        // Atualizar estado do botão Gerar após carregar imagens
        atualizarEstadoBotaoGerar();
    } catch (error) {
        console.error('❌ Erro ao carregar imagens salvas:', error);
        savedImagesData = [];
        exibirTodasImagens();
        
        // Atualizar visibilidade da opção "Usar exemplo" mesmo em caso de erro
        atualizarVisibilidadeUsarExemploImagens();
        
        // Atualizar estado do botão Gerar mesmo em caso de erro
        atualizarEstadoBotaoGerar();
    }
}

// Função para exibir todas as imagens (salvas + novas) na coluna de preview
function exibirTodasImagens() {
    const previewDiv = document.getElementById('ai-images-preview');
    const noImagesMessage = document.getElementById('no-images-message');
    
    if (!previewDiv) return;

    // Limpar preview
    previewDiv.innerHTML = '';
    
    // Obter lista de imagens marcadas para deletar
    const imagensDeletar = recuperarImagensDeletarLocalStorage();
    
    // Filtrar imagens salvas removendo as que estão marcadas para deletar
    const imagensSalvasFiltradas = savedImagesData.filter(image => !imagensDeletar.includes(image.filename));
    
    // Calcular total de imagens considerando apenas as não deletadas
    const totalImages = imagensSalvasFiltradas.length + aiImagesBase64.length;
    
    if (totalImages === 0) {
        previewDiv.style.display = 'none';
        if (noImagesMessage) {
            noImagesMessage.style.display = 'block';
        }
        return;
    }

    previewDiv.style.display = 'grid';
    previewDiv.style.gridTemplateColumns = 'repeat(auto-fill, minmax(100px, 1fr))';
    previewDiv.style.gap = '10px';
    
    if (noImagesMessage) {
        noImagesMessage.style.display = 'none';
    }

    // Exibir imagens novas PRIMEIRO (recém adicionadas pelo input)
    aiImagesBase64.forEach((base64, index) => {
        const imageItem = document.createElement('div');
        imageItem.className = 'ai-image-preview-item';
        imageItem.dataset.isNew = 'true';
        imageItem.dataset.index = index;
        
        // Marcar como selecionada apenas se não estiver no Set de desmarcadas
        if (!aiImagesDeselected.has(index)) {
            imageItem.classList.add('selected');
        }
        
        imageItem.innerHTML = `
            <img src="${base64}" alt="Preview ${index + 1}">
            <div class="check-icon">✓</div>
            <button type="button" class="remove-image-btn" onclick="event.stopPropagation(); removeIAImage(${index})" title="Remover imagem">✕</button>
        `;

        // Adicionar evento de clique para selecionar/deselecionar (apenas se não clicar no botão)
        imageItem.addEventListener('click', (e) => {
            if (e.target.classList.contains('remove-image-btn')) {
                return; // Não fazer nada se clicou no botão de remover
            }
            toggleImagemNova(index, imageItem);
        });

        previewDiv.appendChild(imageItem);
    });

    // Ordenar imagens salvas por número (maior primeiro = mais recentes primeiro)
    const imagensSalvasOrdenadas = [...imagensSalvasFiltradas].sort((a, b) => {
        const numA = parseInt(a.filename.match(/_(\d+)\./)?.[1] || '0');
        const numB = parseInt(b.filename.match(/_(\d+)\./)?.[1] || '0');
        return numB - numA; // Maior número primeiro (mais recente)
    });
    
    // Exibir imagens salvas DEPOIS das novas (ordenadas com mais recentes primeiro)
    imagensSalvasOrdenadas.forEach((image, index) => {
        const imageItem = document.createElement('div');
        imageItem.className = 'saved-image-item';
        imageItem.dataset.imageName = image.filename;
        imageItem.dataset.imageUrl = image.downloadUrl;
        imageItem.dataset.isSaved = 'true';
        
        // Verificar se está selecionada
        if (savedImagesSelected.has(image.filename)) {
            imageItem.classList.add('selected');
        }

        // Escapar o nome da imagem para evitar problemas com aspas
        const escapedImageName = image.filename.replace(/'/g, "\\'").replace(/"/g, '&quot;');
        const escapedImageUrl = image.downloadUrl.replace(/"/g, '&quot;');
        
        imageItem.innerHTML = `
            <img src="${escapedImageUrl}" alt="Imagem salva ${index + 1}" loading="lazy">
            <div class="check-icon">✓</div>
            <button type="button" class="delete-image-btn" onclick="event.stopPropagation(); deletarImagemSalva('${escapedImageName}')" title="Excluir imagem">🗑️</button>
        `;

        // Adicionar evento de clique para selecionar/deselecionar
        imageItem.addEventListener('click', (e) => {
            if (e.target.classList.contains('delete-image-btn')) {
                return; // Não fazer nada se clicou no botão de deletar
            }
            toggleImagemSalva(image.filename, imageItem);
        });

        previewDiv.appendChild(imageItem);
    });
    
    // Atualizar estado do botão Gerar após exibir imagens
    atualizarEstadoBotaoGerar();
}

// Função para exibir imagens salvas (mantida para compatibilidade, mas agora chama exibirTodasImagens)
function exibirImagensSalvas() {
    exibirTodasImagens();
}

// Função para selecionar/deselecionar imagem salva
function toggleImagemSalva(imageName, imageElement) {
    if (savedImagesSelected.has(imageName)) {
        savedImagesSelected.delete(imageName);
        imageElement.classList.remove('selected');
    } else {
        savedImagesSelected.add(imageName);
        imageElement.classList.add('selected');
    }
    // Salvar no localStorage
    salvarImagensSelecionadasLocalStorage();
    // Atualizar aviso de imagens selecionadas
    atualizarAvisoImagensSelecionadas();
    // Atualizar estado do botão Gerar quando imagens forem selecionadas/deselecionadas
    atualizarIndicadoresEtapas();
    // Atualizar estado do botão Gerar
    // Se estiver na etapa 4 (Descrição), atualizar através de atualizarEstadoGeracaoIA para considerar quantidade de CTs
    if (etapaAtualModalIA === 4) {
        atualizarEstadoGeracaoIA();
    } else {
        atualizarEstadoBotaoGerar();
        // Atualizar estado do botão de cobertura mesmo quando não estiver na etapa 4
        atualizarEstadoGeracaoIA();
    }
}

// Função para selecionar/deselecionar imagem nova
function toggleImagemNova(index, imageElement) {
    if (imageElement.classList.contains('selected')) {
        imageElement.classList.remove('selected');
        // Adicionar ao Set de desmarcadas
        aiImagesDeselected.add(index);
    } else {
        imageElement.classList.add('selected');
        // Remover do Set de desmarcadas
        aiImagesDeselected.delete(index);
    }
    // Nota: Imagens novas não são salvas no localStorage pois são temporárias até serem enviadas
    // Elas são automaticamente incluídas no envio se estiverem selecionadas
    // Atualizar estado do botão Gerar quando imagens forem selecionadas/deselecionadas
    atualizarIndicadoresEtapas();
    // Atualizar estado do botão Gerar
    // Se estiver na etapa 4 (Descrição), atualizar através de atualizarEstadoGeracaoIA para considerar quantidade de CTs
    if (etapaAtualModalIA === 4) {
        atualizarEstadoGeracaoIA();
    } else {
        atualizarEstadoBotaoGerar();
        // Atualizar estado do botão de cobertura mesmo quando não estiver na etapa 4
        atualizarEstadoGeracaoIA();
    }
}

// Variável para armazenar o nome da imagem a ser deletada
let imagemParaDeletar = null;

// Função para abrir modal de confirmação de deletar imagem
function abrirModalDeletarImagem(imageName) {
    imagemParaDeletar = imageName;
    
    const title = 'Confirmar Exclusão de Imagem';
    const message = `Tem certeza que deseja excluir a imagem "${imageName}"?`;
    const confirmButtonText = 'Confirmar Exclusão';
    const warningMessage = '<p><strong>⚠️ Atenção:</strong> A imagem será removida permanentemente do S3. Esta ação não pode ser desfeita.</p>';
    
    const onConfirm = () => {
        if (imagemParaDeletar) {
            deletarImagemSalvaConfirmado(imagemParaDeletar);
            imagemParaDeletar = null;
        }
    };
    
    if (typeof showConfirmModal === 'function') {
        showConfirmModal(title, message, confirmButtonText, onConfirm, warningMessage);
    } else {
        // Fallback para confirm caso o modal não exista
        if (confirm(`${message}\n\nA imagem será removida permanentemente do S3.`)) {
            onConfirm();
        }
    }
}

// Função para fechar modal de deletar imagem (mantida para compatibilidade)
function closeDeleteImageModal() {
    if (typeof closeConfirmModal === 'function') {
        closeConfirmModal();
    }
    imagemParaDeletar = null;
}

// Função para confirmar deletar imagem (mantida para compatibilidade, agora usa o novo modal)
function confirmDeleteImage() {
    if (imagemParaDeletar) {
        deletarImagemSalvaConfirmado(imagemParaDeletar);
        closeDeleteImageModal();
    }
}

// Função para deletar imagem salva (após confirmação)
async function deletarImagemSalvaConfirmado(imageName) {
    // Obter featureId atual
    const featureId = await garantirFeatureId();
    if (!featureId) {
        console.error('❌ Não foi possível obter featureId para deletar imagem');
        if (typeof showWarningModal === 'function') {
            showWarningModal('❌ Erro: Não foi possível identificar a documentação');
        } else {
            alert('❌ Erro: Não foi possível identificar a documentação');
        }
        return;
    }
    
    try {
        console.log(`🗑️ Removendo imagem ${imageName} do S3...`);
        
        // Deletar do S3 imediatamente
        const response = await fetch(`${API_BASE_URL}/api/features/${featureId}/images/${imageName}`, {
            method: 'DELETE'
        });
        
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.message || `Erro HTTP ${response.status} ao deletar imagem`);
        }
        
        console.log(`✅ Imagem ${imageName} removida do S3 com sucesso`);
        
        // Remover da lista de selecionadas se estiver
        savedImagesSelected.delete(imageName);
        
        // Remover de imagens_adicionadas se estiver presente
        removerImagemAdicionada(imageName);
        
        // Remover de imagens_deletar se estiver presente (já foi deletada)
        const imagensDeletar = recuperarImagensDeletarLocalStorage();
        const index = imagensDeletar.indexOf(imageName);
        if (index > -1) {
            imagensDeletar.splice(index, 1);
            localStorage.setItem('imagens_deletar', JSON.stringify(imagensDeletar));
        }
        
        // Atualizar localStorage de imagens selecionadas (removendo a imagem deletada)
        salvarImagensSelecionadasLocalStorage();
        
        // Recarregar lista de imagens salvas para atualizar a exibição
        await carregarImagensSalvas();
        exibirTodasImagens();
        
        // Atualizar visibilidade da opção "Usar exemplo" após deletar imagem
        atualizarVisibilidadeUsarExemploImagens();
        
        // Atualizar estado do botão Gerar quando imagem for deletada
        atualizarIndicadoresEtapas();
        
        // Atualizar estado do botão Gerar
        if (etapaAtualModalIA === 4) {
            atualizarEstadoGeracaoIA();
        } else {
            atualizarEstadoBotaoGerar();
        }
        // Atualizar estado do botão Gerar
        atualizarEstadoBotaoGerar();
        
        console.log(`✅ Imagem ${imageName} removida completamente`);
    } catch (error) {
        console.error(`❌ Erro ao deletar imagem ${imageName}:`, error);
        if (typeof showWarningModal === 'function') {
            showWarningModal(`❌ Erro ao deletar imagem: ${error.message}`);
        } else {
            alert(`❌ Erro ao deletar imagem: ${error.message}`);
        }
    }
}

// Função para deletar imagem salva (mantida para compatibilidade, agora chama o modal)
async function deletarImagemSalva(imageName) {
    abrirModalDeletarImagem(imageName);
}

// Função para converter URL de imagem para base64
async function urlToBase64(url) {
    try {
        console.log(`🔄 Convertendo URL para base64: ${url}`);
        const response = await fetch(url);
        
        if (!response.ok) {
            throw new Error(`Erro HTTP ${response.status} ao buscar imagem: ${response.statusText}`);
        }
        
        const blob = await response.blob();
        console.log(`✅ Blob obtido: ${blob.size} bytes, tipo: ${blob.type}`);
        
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => {
                const result = reader.result;
                console.log(`✅ Conversão para base64 concluída: ${result.substring(0, 50)}... (${result.length} caracteres)`);
                resolve(result);
            };
            reader.onerror = (error) => {
                console.error('❌ Erro no FileReader:', error);
                reject(error);
            };
            reader.readAsDataURL(blob);
        });
    } catch (error) {
        console.error(`❌ Erro ao converter URL para base64 (${url}):`, error);
        return null;
    }
}

// Função para fazer upload de imagens quando selecionadas
async function fazerUploadImagensSelecionadas() {
    const input = document.getElementById('ai-images-input');
    if (!input || !input.files || input.files.length === 0) {
        console.log('ℹ️ Nenhuma imagem selecionada para upload');
        return;
    }

    // Garantir que existe um featureId (gerar provisório se necessário)
    const featureId = await garantirFeatureId();
    if (!featureId) {
        console.error('❌ Não foi possível obter featureId para salvar imagens');
        return;
    }

    console.log(`📤 Iniciando upload de imagens para featureId: ${featureId}`);
    const files = Array.from(input.files);
    console.log(`📤 Total de arquivos para upload: ${files.length}`);
    
    for (const file of files) {
        try {
            console.log(`📤 Fazendo upload da imagem: ${file.name} (${(file.size / 1024 / 1024).toFixed(2)} MB)`);
            const formData = new FormData();
            formData.append('image', file);

            const response = await fetch(`${API_BASE_URL}/api/features/${featureId}/images`, {
                method: 'POST',
                body: formData
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.message || `Erro HTTP ${response.status} ao fazer upload da imagem`);
            }

            const result = await response.json();
            console.log(`✅ Imagem ${file.name} salva com sucesso no S3: ${result.image_name}`);
            console.log(`   - Caminho: ${result.image_path}`);
            console.log(`   - URL: ${result.download_url}`);
            
            // Adicionar ao array de imagens adicionadas no localStorage
            if (result.image_name) {
                adicionarImagemAdicionada(result.image_name);
                console.log(`💾 Imagem ${result.image_name} adicionada ao localStorage de imagens_adicionadas`);
            } else {
                console.warn(`⚠️ Resposta do servidor não contém image_name`);
            }
            
        } catch (error) {
            console.error(`❌ Erro ao fazer upload da imagem ${file.name}:`, error);
            alert(`❌ Erro ao fazer upload da imagem ${file.name}: ${error.message}`);
        }
    }
    
    // Recarregar lista de imagens salvas e atualizar visualização após todos os uploads
    console.log('🔄 Recarregando lista de imagens salvas...');
    await carregarImagensSalvas();
    exibirTodasImagens();
    console.log('✅ Upload de imagens concluído');
}

async function gerarCenariosIA() {
    const inputType = document.querySelector('input[name="input-type"]:checked');
    if (!inputType) return;
    
    const inputTypeValue = inputType.value;
    const jiraUrl = document.getElementById('jira-url')?.value.trim() || '';
    // Se estiver usando informações adicionais, usar apenas o texto adicional
    const featureText = usandoInformacoesAdicionais ? textoAdicionalAplicado : (document.getElementById('feature-text')?.value.trim() || '');
    // Sempre usar tipo funcional (outros tipos foram removidos)
    const testType = 'funcional';
    
    
    // Validação de entrada
    if (inputTypeValue === 'jira' && !jiraUrl) {
        alert('❌ Por favor, insira a URL do Jira');
        document.getElementById('jira-url').focus();
        return;
    }
    
    // Verificar se há imagens selecionadas (novas ou salvas)
    const previewDiv = document.getElementById('ai-images-preview');
    let hasSelectedImages = false;
    if (previewDiv) {
        const selectedItems = previewDiv.querySelectorAll('.ai-image-preview-item.selected, .saved-image-item.selected');
        hasSelectedImages = selectedItems.length > 0;
    }
    
    // Verificar se há imagem de exemplo válida
    const hasExampleImage = window.exemploImagemSelecionado !== null && 
                           window.exemploImagemSelecionado !== undefined &&
                           aiImagesBase64.length > 0 &&
                           !aiImagesDeselected.has(0);
    
    if (inputTypeValue === 'text' && !featureText && !hasSelectedImages && !hasExampleImage) {
        if (typeof showWarningModal === 'function') {
            showWarningModal('❌ Por favor, insira a descrição da feature ou adicione/selecione imagens para análise');
        } else {
            alert('❌ Por favor, insira a descrição da feature ou adicione/selecione imagens para análise');
        }
        document.getElementById('feature-text').focus();
        return;
    }
    
    
    
    // Validação de tamanho total das imagens novas selecionadas (aproximado em MB)
    // A validação completa será feita após carregar as imagens salvas selecionadas
    const previewDivForValidation = document.getElementById('ai-images-preview');
    if (previewDivForValidation && aiImagesBase64 && aiImagesBase64.length > 0) {
        const selectedNewImageItems = previewDivForValidation.querySelectorAll('.ai-image-preview-item[data-is-new="true"].selected');
        if (selectedNewImageItems.length > 0) {
            let totalSize = 0;
            selectedNewImageItems.forEach(item => {
                const index = parseInt(item.dataset.index);
                if (aiImagesBase64[index]) {
                    const base64Length = aiImagesBase64[index].length - 23;
                    totalSize += base64Length;
                }
            });
            
            const sizeInMB = (totalSize * 0.75) / 1024 / 1024;
            
            if (sizeInMB > 50) {
                alert(`❌ Imagens muito grandes! Tamanho total: ${sizeInMB.toFixed(2)} MB. Máximo: 50 MB.\n\nDica: Redimensione as imagens antes de enviar ou use menos imagens.`);
                return;
            } else if (sizeInMB > 30) {
                console.warn(`⚠️ Tamanho total das imagens novas selecionadas: ${sizeInMB.toFixed(2)} MB (limite: 50 MB)`);
            }
        }
    }
    
    // Validação de limite total de CTs (máximo 50 por feature)
    // A IA determinará a quantidade apropriada de casos de teste
    if (cenarios.length >= 50) {
        alert(`❌ Limite máximo de 50 CTs por feature atingido!\n\nCTs atuais: ${cenarios.length}\n\nPor favor, remova alguns CTs existentes antes de gerar novos.`);
        return;
    }
    
    // Ocultar texto de informação de cobertura durante a geração
    const coberturaInfoText = document.getElementById('cobertura-info-text');
    if (coberturaInfoText) {
        coberturaInfoText.style.display = 'none';
    }
    
    // Mostrar loading
    mostrarLoadingIA();
    
    // Marcar que a geração está em andamento
    isGeneratingCTs = true;
    console.log('🔄 Iniciando geração de CTs, flag isGeneratingCTs = true');
    
    try {
        const provider = document.getElementById('ai-provider')?.value || 'openai';
        
        let inputData = '';
        
        if (inputTypeValue === 'jira') {
            // Para Jira, vamos simular a extração de dados
            inputData = await extrairDadosJira(jiraUrl);
            
        } else {
            inputData = featureText;
        }
        
        // Coletar imagens selecionadas (novas + salvas)
        // Filtrar apenas imagens novas que estão selecionadas
        const previewDiv = document.getElementById('ai-images-preview');
        const selectedNewImages = [];
        
        // Verificar se há imagem de exemplo selecionada e se ela deve ser enviada
        // A imagem de exemplo só deve ser enviada se:
        // 1. window.exemploImagemSelecionado não for null/undefined
        // 2. aiImagesBase64 tiver pelo menos uma imagem (índice 0)
        // 3. A imagem não estiver desmarcada (não está em aiImagesDeselected)
        const temImagemExemploValida = window.exemploImagemSelecionado !== null && 
                                       window.exemploImagemSelecionado !== undefined &&
                                       aiImagesBase64.length > 0 &&
                                       !aiImagesDeselected.has(0);
        
        if (previewDiv) {
            const newImageItems = previewDiv.querySelectorAll('.ai-image-preview-item[data-is-new="true"]');
            newImageItems.forEach(item => {
                if (item.classList.contains('selected')) {
                    const index = parseInt(item.dataset.index);
                    if (aiImagesBase64[index] !== undefined) {
                        // Se for imagem de exemplo (índice 0), verificar se está realmente selecionada
                        if (index === 0) {
                            // Só adicionar se a imagem de exemplo estiver válida
                            if (temImagemExemploValida) {
                                selectedNewImages.push(aiImagesBase64[index]);
                                console.log('✅ Imagem de exemplo incluída no envio');
                            } else {
                                console.log('⚠️ Imagem de exemplo NÃO incluída - não está selecionada ou foi removida');
                            }
                        } else {
                            // Para outras imagens (não exemplo), adicionar normalmente se selecionada
                            selectedNewImages.push(aiImagesBase64[index]);
                        }
                    }
                }
            });
        } else {
            // Se não há previewDiv, mas há imagem de exemplo válida, incluir diretamente
            if (temImagemExemploValida && aiImagesBase64.length > 0) {
                selectedNewImages.push(aiImagesBase64[0]);
                console.log('✅ Imagem de exemplo incluída no envio (sem previewDiv)');
            }
        }
        
        // Garantir que se não há imagem de exemplo selecionada, não enviamos nenhuma
        if (window.exemploImagemSelecionado === null && aiImagesBase64.length > 0) {
            // Se exemploImagemSelecionado é null, significa que o exemplo foi removido
            // Neste caso, não devemos enviar a primeira imagem se ela for de exemplo
            // Mas isso já está sendo tratado pela lógica acima
            console.log('ℹ️ Nenhuma imagem de exemplo selecionada');
        }
        
        let allImagesBase64 = [...selectedNewImages];
        
        if (savedImagesSelected.size > 0) {
            console.log(`📸 Carregando ${savedImagesSelected.size} imagem(ns) salva(s) selecionada(s)...`);
            
            for (const imageName of savedImagesSelected) {
                const imageData = savedImagesData.find(img => img.filename === imageName);
                if (imageData && imageData.downloadUrl) {
                    try {
                        // Validar URL antes de converter
                        if (!imageData.downloadUrl || !imageData.downloadUrl.startsWith('http')) {
                            console.error(`❌ URL inválida para imagem "${imageName}": ${imageData.downloadUrl}`);
                            continue;
                        }
                        
                        // Converter URL da imagem para base64
                        const base64 = await urlToBase64(imageData.downloadUrl);
                        if (base64) {
                            allImagesBase64.push(base64);
                            console.log(`✅ Imagem salva "${imageName}" convertida para base64`);
                        } else {
                            console.warn(`⚠️ Falha ao converter imagem "${imageName}" para base64`);
                        }
                    } catch (error) {
                        console.error(`❌ Erro ao converter imagem salva "${imageName}":`, error);
                    }
                } else {
                    console.warn(`⚠️ Imagem "${imageName}" não encontrada em savedImagesData ou sem downloadUrl`);
                }
            }
            
            // Validação de tamanho total incluindo imagens salvas
            let totalSize = 0;
            allImagesBase64.forEach(base64 => {
                const base64Length = base64.length - 23; // Remover prefixo
                totalSize += base64Length;
            });
            
            const sizeInMB = (totalSize * 0.75) / 1024 / 1024;
            
            if (sizeInMB > 50) {
                ocultarLoadingIA();
                alert(`❌ Imagens muito grandes! Tamanho total: ${sizeInMB.toFixed(2)} MB. Máximo: 50 MB.\n\nDica: Redimensione as imagens antes de enviar ou use menos imagens.`);
                return;
            } else if (sizeInMB > 30) {
                console.warn(`⚠️ Tamanho total das imagens (novas + salvas): ${sizeInMB.toFixed(2)} MB (limite: 50 MB)`);
            } else {
                console.log(`✅ Tamanho total das imagens (novas + salvas): ${sizeInMB.toFixed(2)} MB`);
            }
        }
        
        // Validação de quantidade máxima de imagens selecionadas (máximo 5)
        const MAX_IMAGENS_SELECIONADAS = 5;
        if (allImagesBase64 && allImagesBase64.length > MAX_IMAGENS_SELECIONADAS) {
            ocultarLoadingIA();
            if (typeof showWarningModal === 'function') {
                showWarningModal(`❌ Máximo de ${MAX_IMAGENS_SELECIONADAS} imagens selecionadas permitidas para envio ao prompt. Você selecionou ${allImagesBase64.length} imagens.<br><br>Por favor, desmarque algumas imagens e tente novamente.`);
            } else {
                alert(`❌ Máximo de ${MAX_IMAGENS_SELECIONADAS} imagens selecionadas permitidas para envio ao prompt. Você selecionou ${allImagesBase64.length} imagens.\n\nPor favor, desmarque algumas imagens e tente novamente.`);
            }
            return;
        }
        
        // Se não há texto E há imagens, passar string vazia explicitamente
        if (!inputData && allImagesBase64 && allImagesBase64.length > 0) {
            inputData = ''; // String vazia para que o backend use o fallback apropriado
        }
        
        // Log detalhado antes de enviar
        if (allImagesBase64 && allImagesBase64.length > 0) {
            console.log('🚀 PREPARANDO PARA ENVIAR IMAGENS:');
            console.log('   - Total de imagens selecionadas:', allImagesBase64.length);
            console.log('   - Imagens novas selecionadas:', selectedNewImages.length);
            console.log('   - Imagens salvas selecionadas:', savedImagesSelected.size);
            if (window.exemploImagemSelecionado) {
                console.log('   - Tipo: IMAGEM DE EXEMPLO');
                console.log('   - Exemplo:', window.exemploImagemSelecionado.exemplo);
                console.log('   - Arquivo:', window.exemploImagemSelecionado.imagem);
            } else {
                console.log('   - Tipo: UPLOAD MANUAL + IMAGENS SALVAS');
            }
        }
        
        // Gerar cenários usando IA (passando imagens se houver)
        // Se estiver usando informações adicionais, usar imagens selecionadas do localStorage se disponíveis
        let imagensParaEnviar = [];
        if (usandoInformacoesAdicionais) {
            // Se há imagens adicionais armazenadas, usar elas
            if (window.imagensAdicionaisParaEnviar && window.imagensAdicionaisParaEnviar.length > 0) {
                imagensParaEnviar = window.imagensAdicionaisParaEnviar;
                console.log(`📸 Enviando ${imagensParaEnviar.length} imagem(ns) selecionada(s) do localStorage junto com o texto adicional`);
            }
        } else {
            imagensParaEnviar = allImagesBase64;
        }
        const resultado = await gerarCenariosComIA(inputData, testType, imagensParaEnviar, usandoInformacoesAdicionais);
        
        // Armazenar cenários gerados e o tipo de teste usado
        cenariosGeradosIA = resultado.cenarios || resultado;
        testTypeGeracaoIA = testType; // Armazenar o tipo de teste usado na geração
        const promptUtilizado = resultado.promptUtilizado || null;
        const tokenInfo = resultado.tokenInfo || null;
        const modelUsado = resultado.modelUsado || null;
        
        // Sempre atualizar resumo da descrição do produto no localStorage quando disponível
        if (resultado.resumoDescricaoProduto) {
            localStorage.setItem('resumoDescricaoProduto', resultado.resumoDescricaoProduto);
            console.log('✅ Resumo da descrição do produto atualizado no localStorage');
        } else {
            console.log('ℹ️ Resumo da descrição do produto não foi gerado nesta execução');
        }
        
        console.log('Cenários armazenados:', cenariosGeradosIA);
        console.log('Prompt utilizado:', promptUtilizado);
        if (tokenInfo) {
            console.log(`📊 Tokens usados: ${tokenInfo.totalTokens} (Prompt: ${tokenInfo.promptTokens}, Completion: ${tokenInfo.completionTokens})`);
        }
        
        // Mostrar preview com prompt
        mostrarPreviewIA(cenariosGeradosIA, promptUtilizado, testType, tokenInfo, modelUsado);
        
        // Marcar que a geração terminou com sucesso
        isGeneratingCTs = false;
        ctsGeradosComSucesso = true; // Marcar que os CTs foram gerados com sucesso
        console.log('✅ Geração de CTs concluída com sucesso, flag isGeneratingCTs = false, ctsGeradosComSucesso = true');
        
        // NÃO limpar imagens imediatamente após a geração
        // As imagens podem ainda ser necessárias se o usuário quiser aplicar os CTs
        // A limpeza será feita apenas quando:
        // 1. O modal for fechado E não houver geração em andamento E não houver CTs gerados
        // 2. A documentação for salva (então as imagens pertencem à documentação)
        // 3. O usuário cancelar explicitamente
        console.log('✅ Geração concluída, mantendo imagens disponíveis para aplicação dos CTs');
        
    } catch (error) {
        console.error('Erro ao gerar cenários:', error);
        
        // Marcar que a geração terminou (com erro)
        isGeneratingCTs = false;
        ctsGeradosComSucesso = false; // Resetar flag em caso de erro
        console.log('❌ Geração de CTs terminou com erro, flag isGeneratingCTs = false, ctsGeradosComSucesso = false');
        
        // Ocultar loading
        ocultarLoadingIA();
        
        // Restaurar visibilidade da seção de input e indicadores de etapas
        const inputSection = document.querySelector('.ai-input-section');
        const stepsIndicator = document.querySelector('.ai-steps-indicator');
        if (inputSection) {
            inputSection.style.display = 'block';
        }
        if (stepsIndicator) {
            stepsIndicator.style.display = 'flex';
        }
        
        // Mostrar botão gerar novamente
        const btnGenerate = document.getElementById('btn-generate-ai');
        if (btnGenerate) {
            btnGenerate.style.display = 'inline-block';
        }
        
        // Mostrar texto de informação de cobertura novamente em caso de erro
        const coberturaInfoText = document.getElementById('cobertura-info-text');
        if (coberturaInfoText) {
            coberturaInfoText.style.display = 'block';
        }
        const btnCancelar = document.getElementById('btn-cancelar-ia');
        if (btnCancelar) {
            btnCancelar.style.display = 'inline-block';
        }
        
        // Restaurar visibilidade dos botões de navegação (voltar, prosseguir, gerar)
        if (typeof atualizarBotoesEtapas === 'function') {
            atualizarBotoesEtapas();
        }
        
        // Construir mensagem de erro detalhada
        let mensagemErro = '❌ Erro ao gerar cenários de teste\n\n';
        
        if (error.message.includes('502') || error.message.includes('Bad Gateway')) {
            mensagemErro += 'O servidor da OpenAI está temporariamente indisponível ou sobrecarregado.\n\n';
            mensagemErro += 'Isso geralmente é um problema temporário. Tente novamente em alguns segundos.';
        } else if (error.message.includes('503') || error.message.includes('Service Unavailable')) {
            mensagemErro += 'O serviço da OpenAI está temporariamente indisponível.\n\n';
            mensagemErro += 'O serviço pode estar em manutenção ou sobrecarregado. Tente novamente em alguns minutos.';
        } else if (error.message.includes('504') || error.message.includes('Gateway Timeout')) {
            mensagemErro += 'A requisição demorou muito para ser processada.\n\n';
            mensagemErro += 'O prompt pode ser muito grande ou o servidor está lento. Tente novamente ou reduza o tamanho do contexto.';
        } else if (error.message.includes('não configurado') || error.message.includes('não habilitado')) {
            mensagemErro += 'Provedor de IA não configurado ou não habilitado.\n';
            mensagemErro += 'Verifique as configurações no servidor.';
        } else if (error.message.includes('401') || error.message.includes('Unauthorized') || error.message.includes('chave')) {
            mensagemErro += 'Chave da API inválida ou expirada.\n';
            mensagemErro += 'Verifique suas credenciais no servidor.';
        } else if (error.message.includes('429') || error.message.includes('Too Many Requests')) {
            mensagemErro += 'Limite de requisições excedido.\n';
            mensagemErro += 'Tente novamente em alguns minutos.';
        } else if (error.message.includes('network') || error.message.includes('fetch') || error.message.includes('Failed to fetch')) {
            mensagemErro += 'Erro de conexão com o servidor de IA.\n';
            mensagemErro += 'Verifique se o servidor está rodando na porta 3002.';
        } else {
            mensagemErro += error.message;
        }
        
        alert(mensagemErro);
    }
}

function aplicarCenariosIA() {
    // Marcar que a geração não está mais em andamento (CTs foram aplicados)
    isGeneratingCTs = false;
    ctsGeradosComSucesso = false; // Resetar flag após aplicar (as imagens agora pertencem aos CTs aplicados)
    console.log('✅ CTs aplicados, flag isGeneratingCTs = false, ctsGeradosComSucesso = false');
    
    // Obter tipo de teste para definir flag de CTs adicionados
    const testTypeField = document.getElementById('ai-test-type');
    const tipoParaUsar = testTypeField ? testTypeField.value : (testTypeGeracaoIA || 'funcional');
    const tipoParaCobertura = tipoParaUsar === 'indefinido' ? 'funcional' : tipoParaUsar;
    const chaveCtsAdicionados = `cts_adicionados_${tipoParaCobertura.toLowerCase()}`;
    
    // Marcar que CTs foram adicionados para próxima análise de cobertura
    localStorage.setItem(chaveCtsAdicionados, 'true');
    
    // Marcar que CTs foram aplicados pela IA
    localStorage.setItem('ct_aplicadosIA', 'true');
    console.log('✅ Flag ct_aplicadosIA definida como true');
    
    // Ocultar example-selector e seu label quando ct_aplicadosIA for true
    const exampleSelectorLabel = document.querySelector('label[for="example-selector"]');
    const exampleSelector = document.getElementById('example-selector');
    if (exampleSelectorLabel) {
        exampleSelectorLabel.style.display = 'none';
    }
    if (exampleSelector) {
        exampleSelector.style.display = 'none';
    }
    
    // Bloquear campo ai-test-type quando ct_aplicadosIA for true
    const testTypeFieldApply = document.getElementById('ai-test-type');
    if (testTypeFieldApply) {
        testTypeFieldApply.disabled = true;
    }
    
    // Limpar cobertura_anterior se existir, pois casos foram ADICIONADOS, não deletados
    const coberturaAnteriorDeletada = recuperarCoberturaAnteriorLocalStorage(tipoParaUsar);
    if (coberturaAnteriorDeletada !== null) {
        console.log(`🧹 Limpando cobertura_anterior (${coberturaAnteriorDeletada}%) pois CTs foram ADICIONADOS via aplicarCenariosIA`);
        limparCoberturaAnteriorLocalStorage(tipoParaUsar);
    }
    
    console.log(`📝 Flag de CTs adicionados definida para ${tipoParaUsar} via aplicarCenariosIA. Próxima análise deve aumentar a cobertura.`);
    console.log(`📝 Valor da flag no localStorage: ${localStorage.getItem(chaveCtsAdicionados)}`);
    
    if (cenariosGeradosIA.length === 0) {
        alert('❌ Nenhum caso de teste para aplicar');
        return;
    }
    
    // Obter cenários selecionados
    const checkboxes = document.querySelectorAll('.ai-scenario-checkbox');
    const cenariosSelecionados = [];
    
    checkboxes.forEach((checkbox, index) => {
        if (checkbox.checked && cenariosGeradosIA[index]) {
            cenariosSelecionados.push(cenariosGeradosIA[index]);
        }
    });
    
    if (cenariosSelecionados.length === 0) {
        alert('❌ Nenhum caso de teste selecionado para aplicar');
        return;
    }
    
    // Validação de limite total de CTs (máximo 50 por feature)
    const totalCenariosAposAplicacao = cenarios.length + cenariosSelecionados.length;
    if (totalCenariosAposAplicacao > 50) {
        alert(`❌ Limite máximo de 50 CTs por feature atingido!\n\nCTs atuais: ${cenarios.length}\nTentando adicionar: ${cenariosSelecionados.length}\nTotal seria: ${totalCenariosAposAplicacao}\n\nPor favor, remova alguns CTs existentes antes de adicionar novos.`);
        return;
    }
    
    // Encontrar próximo ID disponível
    const proximoId = cenarios.length > 0 ? Math.max(...cenarios.map(c => c.id)) + 1 : 1;
    
    // Atualizar testTypeGeracaoIA para manter consistência (tipoParaUsar já foi obtido no início da função)
    testTypeGeracaoIA = tipoParaUsar;
    
    console.log(`🔍 Aplicando cenários - Tipo selecionado: "${tipoParaUsar}"`);
    
    // Adicionar cenários selecionados ao array global
    cenariosSelecionados.forEach((cenario, index) => {
        const novoId = proximoId + index;
        const idFormatado = String(novoId).padStart(3, '0');
        
        let novoTitulo = cenario.titulo;
        if (cenario.titulo && cenario.titulo.includes(' - ')) {
            const tituloSemPrefixo = cenario.titulo.replace(/^CT\d+\s*-\s*/, '');
            novoTitulo = `CT${idFormatado} - ${tituloSemPrefixo}`;
        } else {
            novoTitulo = `CT${idFormatado} - ${cenario.titulo || 'Sem Título'}`;
        }
        
        // Garantir que fonte e tipo estejam corretos
        // Fonte sempre será 'IA' quando vem da geração pela IA
        const fonte = 'IA';
        // Tipo sempre será o tipo selecionado pelo usuário no campo ai-test-type
        const tipo = tipoParaUsar;
        
        console.log(`📝 Aplicando CT ${novoId}: fonte="${fonte}", tipo="${tipo}" (testTypeGeracaoIA="${testTypeGeracaoIA}")`);
        
        const novoCenario = {
            id: novoId,
            titulo: novoTitulo,
            precondicoes: cenario.precondicoes || '',
            passos: cenario.passos || '',
            resultadoEsperado: cenario.resultadoEsperado || '',
            status: 'na',
            arquivos: [],
            posicao: cenarios.length + index + 1,
            fonte: fonte, // Sempre 'IA' para cenários gerados pela IA
            tipo: tipo // Sempre o tipo selecionado pelo usuário na geração
        };
        
        console.log(`✅ CT ${novoId} criado com:`, { fonte: novoCenario.fonte, tipo: novoCenario.tipo });
        
        cenarios.push(novoCenario);
    });
    
    // Salvar backup após aplicar cenários gerados pela IA
    salvarBackupLocalStorage();
    
    // Atualizar estado do botão de avaliação após aplicar cenários
    if (typeof atualizarEstadoGeracaoIA === 'function') {
        atualizarEstadoGeracaoIA();
    }
    
    // Log final para verificar todos os cenários
    console.log('📋 Todos os cenários após aplicar:', cenarios.map(c => ({ id: c.id, titulo: c.titulo, fonte: c.fonte, tipo: c.tipo })));
    
    // Atualizar arrays e interface
    cenarioId = Math.max(...cenarios.map(c => c.id)) + 1;
    
    // Aplicar filtros para atualizar cenariosFiltrados
    aplicarFiltros();
    
    // Atualizar interface
    renderizarCenarios();
    atualizarTabs();
    atualizarContadores();
    atualizarBotoesNavegacao();
    if (typeof mostrarControlesPaginaCT === 'function') {
        mostrarControlesPaginaCT();
    }
    if (typeof renderizarListaCenarios === 'function') {
        renderizarListaCenarios();
    }
    if (typeof atualizarVisibilidadeBotaoResumo === 'function') {
        atualizarVisibilidadeBotaoResumo();
    }
    
    // Salvar backup após aplicar cenários da IA
    salvarBackupLocalStorage();
    
    // Atualizar estado do botão e campo de geração IA após aplicar casos de teste
    if (typeof atualizarEstadoGeracaoIA === 'function') {
        atualizarEstadoGeracaoIA();
    }
    if (typeof atualizarVisibilidadeBotaoSalvar === 'function') {
        atualizarVisibilidadeBotaoSalvar();
    }
    
    // Se estiver usando informações adicionais, adicionar o texto na descrição do produto
    if (usandoInformacoesAdicionais && textoAdicionalAplicado) {
        const featureTextField = document.getElementById('feature-text');
        if (featureTextField) {
            const descricaoAtual = featureTextField.value.trim();
            // Adicionar o texto adicional como um novo parágrafo no final
            const novoParagrafo = `\n\n${textoAdicionalAplicado}`;
            featureTextField.value = descricaoAtual + novoParagrafo;
            // Salvar no localStorage
            if (typeof salvarFeatureTextLocalStorage === 'function') {
                salvarFeatureTextLocalStorage();
            }
            console.log('✅ Texto adicional adicionado à descrição do produto');
        }
        // Resetar flags
        usandoInformacoesAdicionais = false;
        textoAdicionalAplicado = '';
    }
    
    // Fechar modal
    fecharModalGerarIA();
    
    // Mostrar mensagem de sucesso
    if (typeof showSuccessPopup === 'function') {
        showSuccessPopup(`${cenariosSelecionados.length} cenário(s) selecionado(s) e aplicado(s) pela AI com sucesso!`);
    } else {
        alert(`${cenariosSelecionados.length} cenário(s) selecionado(s) e aplicado(s) pela AI com sucesso!`);
    }
}

// Funções auxiliares de IA
function mostrarLoadingIA() {
    const loadingDiv = document.getElementById('ai-loading');
    const previewDiv = document.getElementById('ai-preview');
    const btnGenerate = document.getElementById('btn-generate-ai');
    const btnApply = document.getElementById('btn-apply-ai');
    const btnCancelar = document.getElementById('btn-cancelar-ia');
    const inputSection = document.querySelector('.ai-input-section');
    const stepsIndicator = document.querySelector('.ai-steps-indicator');
    const coberturaIconTooltip = document.getElementById('cobertura-icon-tooltip');
    
    // Ocultar seção de input e indicadores de etapas
    if (inputSection) {
        inputSection.style.display = 'none';
        console.log('✅ Seção de input ocultada');
    }
    if (stepsIndicator) {
        stepsIndicator.style.display = 'none';
    }
    
    // Mostrar loading
    if (loadingDiv) loadingDiv.style.display = 'block';
    if (previewDiv) previewDiv.style.display = 'none';
    if (btnGenerate) btnGenerate.style.display = 'none';
    if (btnApply) btnApply.style.display = 'none';
    
    // Ocultar botão cancelar durante o loading
    if (btnCancelar) btnCancelar.style.display = 'none';
    
    // Ocultar ícone de cobertura e texto de valor durante loading
    if (coberturaIconTooltip) {
        coberturaIconTooltip.style.display = 'none';
    }
    const coberturaValueText = document.getElementById('cobertura-value-text');
    if (coberturaValueText) {
        coberturaValueText.style.display = 'none';
    }
    
    // Ocultar seção de cobertura de teste durante a geração
    const coberturaTesteSection = document.getElementById('cobertura-teste-section');
    if (coberturaTesteSection) {
        coberturaTesteSection.style.display = 'none';
    }
    
    // Ocultar aviso de imagens selecionadas durante a geração
    const avisoImagensIA = document.getElementById('imagens-selecionadas-aviso-ia');
    if (avisoImagensIA) {
        avisoImagensIA.style.display = 'none';
    }
    
    const btnVoltar = document.getElementById('btn-voltar-etapa');
    if (btnVoltar) btnVoltar.style.display = 'none';
}

function ocultarLoadingIA() {
    const loadingDiv = document.getElementById('ai-loading');
    if (loadingDiv) loadingDiv.style.display = 'none';
}

async function gerarCenariosComIA(inputData, testType, images = [], apenasTextoAdicional = false) {
    const provider = document.getElementById('ai-provider')?.value || 'openai';
    
    // Preparar lista de casos de teste existentes no formato esperado pelo backend
    // Filtrar CTs pelo tipo: se funcional, incluir também "indefinido"; outros tipos, apenas o mesmo tipo
    const casosTesteExistentes = cenarios
        .filter(c => {
            const tipoCT = c.tipo || 'funcional'; // Se não tiver tipo, considerar como funcional
            if (testType === 'funcional') {
                // Para funcional, incluir também CTs com tipo "indefinido" (CTs manuais antigos)
                return tipoCT === 'funcional' || tipoCT === 'indefinido';
            } else {
                // Para outros tipos, filtrar apenas o mesmo tipo
                return tipoCT === testType;
            }
        })
        .map(c => {
            // Extrair código do título se existir
            const codigoMatch = (c.titulo || '').match(/CT(\d+)/i);
            const codigo = codigoMatch ? codigoMatch[0] : null;
            return {
                codigo: codigo,
                titulo: c.titulo || ''
            };
        })
        .filter(c => c.titulo); // Filtrar apenas casos com título
    
    console.log('🤖 Gerando cenários com ' + provider + '...');
    if (apenasTextoAdicional) {
        console.log('📝 Modo: Apenas texto adicional - será usado apenas no prompt de resumo');
    }
    if (images && images.length > 0) {
        console.log('📎 Enviando ' + images.length + ' imagem(ns) para análise');
        
        // Verificar se é uma imagem de exemplo
        if (window.exemploImagemSelecionado) {
            console.log('🖼️  IMAGEM DE EXEMPLO DETECTADA:');
            console.log('   - Exemplo:', window.exemploImagemSelecionado.exemplo);
            console.log('   - Arquivo:', window.exemploImagemSelecionado.imagem);
            console.log('   - Selecionado em:', window.exemploImagemSelecionado.timestamp);
        } else {
            console.log('📤 Imagens enviadas via upload manual');
        }
        
        // Mostrar preview das primeiras 50 caracteres do base64 para verificação
        images.forEach((img, index) => {
            const preview = img.substring(0, 50) + '...';
            console.log(`   Imagem ${index + 1}: ${preview} (tamanho: ${img.length} caracteres)`);
        });
    }
    if (casosTesteExistentes.length > 0) {
        console.log('📋 Enviando ' + casosTesteExistentes.length + ' caso(s) de teste existente(s) como referência');
    }
    
    // Chamar o backend com o provedor selecionado e lista de casos existentes
    return await gerarCenariosIA_BACKEND(inputData, testType, provider, images, casosTesteExistentes, apenasTextoAdicional);
}

async function gerarCenariosIA_BACKEND(inputData, testType, provider, images = [], casosTesteExistentes = [], apenasTextoAdicional = false) {
    const response = await fetch(`${AI_API_BASE_URL}/api/generate-scenarios`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            inputData,
            testType,
            provider: provider, // Usar o provedor selecionado pelo usuário
            images: images, // Incluir imagens em base64
            casosTesteExistentes: casosTesteExistentes, // Incluir lista de casos de teste existentes
            apenasTextoAdicional: apenasTextoAdicional // Flag para indicar que é apenas texto adicional
        })
    });
    
    const data = await response.json();
    
    if (!response.ok) {
        throw new Error(data.error || `Erro ao comunicar com o provedor ${provider}`);
    }
    
    return {
        cenarios: data.cenarios,
        promptUtilizado: data.promptUtilizado,
        resumoDescricaoProduto: data.resumoDescricaoProduto || null,
        jsonOriginal: data.jsonOriginal || data
    };
}

async function extrairDadosJira(jiraUrl) {
    // Simular delay de requisição
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Em uma implementação real, você faria uma requisição para a API do Jira
    // Por enquanto, retornamos um exemplo simulado
    return `Exemplo de extração do Jira para URL: ${jiraUrl}`;
}

// Função para abrir mapeamento de cobertura
function abrirMapeamentoCobertura() {
    // Verificar se a flag de cobertura de teste está ativada
    if (!flagsConfig.iaCoberturaTeste) {
        alert('❌ A funcionalidade de Cobertura de Teste está desativada.');
        return;
    }
    
    // Verificar se descricaoProdutoAtualizada está definida como true
    const descricaoProdutoAtualizada = localStorage.getItem('descricaoProdutoAtualizada') === 'true';
    const novoResumoDescricaoProduto = localStorage.getItem('novoResumoDescricaoProduto');
    const resumoDescricaoProduto = localStorage.getItem('resumoDescricaoProduto');
    
    if (descricaoProdutoAtualizada) {
        console.log('🔍 [Avaliar] descricaoProdutoAtualizada é true');
        console.log('🔍 [Avaliar] novoResumoDescricaoProduto existe:', !!novoResumoDescricaoProduto);
        console.log('🔍 [Avaliar] novoResumoDescricaoProduto tamanho:', novoResumoDescricaoProduto ? novoResumoDescricaoProduto.trim().length : 0);
        
        if (!novoResumoDescricaoProduto || novoResumoDescricaoProduto.trim().length === 0) {
            console.log('⚠️ [Avaliar] ATENÇÃO: descricaoProdutoAtualizada é true mas novoResumoDescricaoProduto não existe ou está vazio.');
            console.log('⚠️ [Avaliar] O sistema tentará gerar o resumo durante a análise de cobertura.');
        }
    }
    
    const featureId = document.getElementById('feature-id')?.value;
    let backup = localStorage.getItem('backup');
    // Documento em edição pode não ter backup ainda; persistir estado atual antes da análise (necessário para aplicar sugestões na janela de rastreabilidade)
    if (!backup && featureId) {
        salvarBackupLocalStorage({ marcarAlteracoes: false });
        backup = localStorage.getItem('backup');
    }
    
    // Abrir a nova janela IMEDIATAMENTE (antes da request ser finalizada)
    let novaJanela = null;
    if (backup) {
        novaJanela = window.open('/html/rastreabilidade_cobertura.html', '_blank');
    } else if (featureId) {
        novaJanela = window.open(`/html/rastreabilidade_cobertura.html?id=${featureId}`, '_blank');
    } else {
        alert('❌ Backup não encontrado e ID da documentação não disponível. Por favor, salve a documentação primeiro ou tenha dados no backup.');
        return;
    }
    
    // Se descricaoProdutoAtualizada é true, chamar a API /api/rastreabilidade-cobertura em background
    // O modal será fechado apenas quando a request for finalizada
    if (descricaoProdutoAtualizada) {
        // Executar a chamada da API em background (sem bloquear)
        (async () => {
            try {
                console.log('📤 [Avaliar] Chamando API /api/rastreabilidade-cobertura em background...');
                
                // Obter casos de teste do backup
                let casosTeste = [];
                if (backup) {
                    try {
                        const backupData = JSON.parse(backup);
                        if (backupData.cenarios && Array.isArray(backupData.cenarios)) {
                            casosTeste = backupData.cenarios.map(c => {
                                const codigoMatch = (c.titulo || '').match(/CT(\d+)/i);
                                return {
                                    codigo: codigoMatch ? codigoMatch[0] : null,
                                    titulo: c.titulo || '',
                                    descricao: c.descricao || ''
                                };
                            }).filter(c => c.titulo);
                        }
                    } catch (error) {
                        console.error('❌ Erro ao obter casos de teste do backup:', error);
                    }
                }
                
                // Obter contexto e imagens
                const contexto = document.getElementById('feature-text')?.value || '';
                const imagensAnexadas = typeof aiImagesBase64 !== 'undefined' ? aiImagesBase64 : [];
                
                // Preparar payload
                const resumoFeatureParaUsar = resumoDescricaoProduto || '';
                const payload = {
                    resumoFeature: resumoFeatureParaUsar,
                    casosTeste: casosTeste,
                    provider: 'openai',
                    descricaoProdutoAtualizada: descricaoProdutoAtualizada,
                    contexto: contexto,
                    images: imagensAnexadas,
                    resumoDescricaoProduto: resumoDescricaoProduto,
                    novoResumoDescricaoProduto: novoResumoDescricaoProduto
                };
                
                console.log('📤 [Avaliar] Payload preparado para /api/rastreabilidade-cobertura');
                console.log('📤 [Avaliar] - casosTeste:', casosTeste.length);
                console.log('📤 [Avaliar] - descricaoProdutoAtualizada:', descricaoProdutoAtualizada);
                console.log('📤 [Avaliar] - contexto:', contexto ? `Sim (${contexto.length} caracteres)` : 'Não');
                console.log('📤 [Avaliar] - images:', imagensAnexadas.length);
                
                // Chamar API e aguardar resposta
                const response = await fetch(`${AI_API_BASE_URL}/api/rastreabilidade-cobertura`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(payload)
                });
                
                const data = await response.json();
                
                if (!response.ok) {
                    throw new Error(data.error || 'Erro ao chamar API de rastreabilidade-cobertura');
                }
                
                // Se o backend gerou um novo resumo, salvar no localStorage
                if (data.resumoDescricaoProduto && descricaoProdutoAtualizada) {
                    localStorage.setItem('novoResumoDescricaoProduto', data.resumoDescricaoProduto);
                    console.log('✅ [Avaliar] Novo resumo da descrição do produto salvo em novoResumoDescricaoProduto (localStorage)');
                    console.log('✅ [Avaliar] Tamanho do novo resumo:', data.resumoDescricaoProduto.length, 'caracteres');
                }
                
                console.log('✅ [Avaliar] API /api/rastreabilidade-cobertura concluída com sucesso');
                
                // Fechar o modal apenas quando a request for finalizada
                if (typeof fecharModalGerarIA === 'function') {
                    fecharModalGerarIA();
                }
                
            } catch (error) {
                console.error('❌ [Avaliar] Erro ao chamar API /api/rastreabilidade-cobertura:', error);
                // Fechar o modal mesmo em caso de erro
                if (typeof fecharModalGerarIA === 'function') {
                    fecharModalGerarIA();
                }
                // Avisar o usuário sobre o erro
                alert('⚠️ Aviso: Erro ao processar cobertura. A análise será feita na nova página.');
            }
        })();
    } else {
        // Se não há descricaoProdutoAtualizada, fechar o modal imediatamente
        if (typeof fecharModalGerarIA === 'function') {
            fecharModalGerarIA();
        }
    }
}

// Funções para análise de cobertura
async function analisarCobertura() {
    // Verificar se a flag de cobertura de teste está ativada
    if (!flagsConfig.iaCoberturaTeste) {
        alert('❌ A funcionalidade de Cobertura de Teste está desativada.');
        return;
    }
    
    const modal = document.getElementById('modalCobertura');
    if (!modal) {
        console.error('Modal de cobertura não encontrado');
        return;
    }
    
    // Abrir modal e mostrar loading
    modal.style.display = 'flex';
    const loadingDiv = document.getElementById('cobertura-loading');
    const loadingText = document.getElementById('cobertura-loading-text');
    const closeButtonHeader = modal.querySelector('.close');
    const closeButtonFooter = modal.querySelector('[data-cy="btn-fechar-cobertura"]');
    if (loadingDiv) {
        loadingDiv.style.display = 'block';
    }
    if (loadingText) {
        loadingText.textContent = '🤖 Analisando cobertura de testes...';
    }
    // Esconder botões de fechar enquanto estiver gerando
    if (closeButtonHeader) {
        closeButtonHeader.style.display = 'none';
    }
    if (closeButtonFooter) {
        closeButtonFooter.style.display = 'none';
    }
    document.getElementById('cobertura-content').style.display = 'none';
    
    try {
        // Obter contexto (feature-text + tipo escolhido)
        const featureText = document.getElementById('feature-text')?.value || '';
        const testType = document.getElementById('ai-test-type')?.value || 'funcional';
        const inputType = document.querySelector('input[name="input-type"]:checked')?.value || 'text';
        
        // Obter imagens anexadas (se houver)
        const imagensAnexadas = typeof aiImagesBase64 !== 'undefined' ? aiImagesBase64 : [];
        
        // Verificar se há imagens selecionadas (salvas ou novas)
        const previewDiv = document.getElementById('ai-images-preview');
        let hasSelectedImages = false;
        if (previewDiv) {
            const selectedItems = previewDiv.querySelectorAll('.ai-image-preview-item.selected, .saved-image-item.selected');
            hasSelectedImages = selectedItems.length > 0;
        }
        
        // Verificar também se há imagens salvas selecionadas
        const hasSavedImagesSelected = savedImagesSelected && savedImagesSelected.size > 0;
        
        // Verificar se há imagem de exemplo válida
        const hasExampleImage = window.exemploImagemSelecionado !== null && 
                               window.exemploImagemSelecionado !== undefined &&
                               aiImagesBase64.length > 0 &&
                               !aiImagesDeselected.has(0);
        
        // Validar se há contexto (texto ou imagens anexadas ou imagens selecionadas)
        const hasContext = featureText.trim().length > 0;
        const hasImages = (imagensAnexadas && imagensAnexadas.length > 0) || hasSelectedImages || hasSavedImagesSelected || hasExampleImage;
        
        if (!hasContext && !hasImages) {
            if (typeof showWarningModal === 'function') {
                showWarningModal('❌ Por favor, adicione uma descrição da funcionalidade (<strong>etapa 4</strong>) ou selecione/anexe imagens (<strong>etapa 3</strong>) antes de analisar a cobertura.');
            } else {
                alert('❌ Por favor, adicione uma descrição da funcionalidade (etapa 4) ou selecione/anexe imagens (etapa 3) antes de analisar a cobertura.');
            }
            document.getElementById('cobertura-loading').style.display = 'none';
            modal.style.display = 'none';
            return;
        }
        
        // Obter lista de casos de teste existentes FILTRADOS pelo tipo selecionado
        const casosTesteExistentes = typeof cenarios !== 'undefined' 
            ? cenarios
                // Filtrar CTs pelo tipo: se funcional, incluir também "indefinido"; outros tipos, apenas o mesmo tipo
                .filter(c => {
                    const tipoCT = c.tipo || 'funcional'; // Se não tiver tipo, considerar como funcional
                    if (testType === 'funcional') {
                        // Para funcional, incluir também CTs com tipo "indefinido" (CTs manuais antigos)
                        return tipoCT === 'funcional' || tipoCT === 'indefinido';
                    } else {
                        // Para outros tipos, filtrar apenas o mesmo tipo
                        return tipoCT === testType;
                    }
                })
                // Mapear para o formato esperado
                .map(c => {
                    const codigoMatch = (c.titulo || '').match(/CT(\d+)/i);
                    const codigo = codigoMatch ? codigoMatch[0] : null;
                    return {
                        codigo: codigo,
                        titulo: c.titulo || '',
                        descricao: c.descricao || ''
                    };
                })
                .filter(c => c.titulo) // Filtrar apenas casos com título
                .sort((a, b) => {
                    // Ordenar por código CT para garantir ordem consistente
                    const codigoA = (a.codigo || '').match(/CT(\d+)/i);
                    const codigoB = (b.codigo || '').match(/CT(\d+)/i);
                    if (codigoA && codigoB) {
                        return parseInt(codigoA[1], 10) - parseInt(codigoB[1], 10);
                    }
                    return (a.titulo || '').localeCompare(b.titulo || '');
                })
            : [];
        
        // Log informativo sobre o filtro aplicado
        const totalCTs = typeof cenarios !== 'undefined' ? cenarios.length : 0;
        const ctsFiltrados = casosTesteExistentes.length;
        if (totalCTs > 0) {
            console.log(`🔍 [FRONTEND] Análise de cobertura: Filtrando CTs por tipo "${testType}"`);
            console.log(`🔍 [FRONTEND] Total de CTs: ${totalCTs} | CTs do tipo "${testType}": ${ctsFiltrados}`);
            console.log(`🔍 [FRONTEND] Lista de CTs enviada para análise (${casosTesteExistentes.length}):`, casosTesteExistentes.map(ct => `${ct.codigo || 'SEM_CODIGO'}: ${ct.titulo || 'SEM_TITULO'}`));
            console.log(`🔍 [FRONTEND] IDs dos CTs enviados:`, casosTesteExistentes.map(ct => ct.codigo).filter(c => c));
        }
        
        // Validar se há casos de teste criados do tipo selecionado
        if (!casosTesteExistentes || casosTesteExistentes.length === 0) {
            // Mapear tipo para nome amigável
            const tipoNomes = {
                'funcional': 'Funcional',
                'regressao': 'Regressão',
                'integracao': 'Integração',
                'usabilidade': 'Usabilidade',
                'performance': 'Performance'
            };
            const tipoNomeDisplay = tipoNomes[testType] || testType;
            
            let mensagem;
            if (totalCTs > 0) {
                mensagem = `❌ Ainda não existem casos de teste do tipo "${tipoNomeDisplay}" para análise.\n\nPor favor, crie pelo menos um caso de teste do tipo "${tipoNomeDisplay}" antes de analisar a cobertura.`;
            } else {
                mensagem = '❌ Ainda não existe uma lista de casos de teste para verificação. Por favor, crie pelo menos um caso de teste antes de analisar a cobertura.';
            }
            
            if (typeof showWarningModal === 'function') {
                showWarningModal(mensagem);
            } else {
                alert(mensagem);
            }
            document.getElementById('cobertura-loading').style.display = 'none';
            modal.style.display = 'none';
            return;
        }
        
        // Obter provider
        const provider = document.getElementById('ai-provider')?.value || 'openai';
        
        // Preparar contexto: usar o texto fornecido (pode ser vazio se houver imagens)
        // Garantir que o contexto seja uma string válida (não undefined ou null)
        const contexto = (featureText || '').trim();
        
        // Coletar imagens selecionadas (salvas) e converter para base64
        // Filtrar imagens de exemplo: só incluir se estiverem realmente selecionadas
        let imagensAnexadasFiltradas = [];
        if (imagensAnexadas && imagensAnexadas.length > 0) {
            // Verificar se há imagem de exemplo válida
            const temImagemExemploValida = window.exemploImagemSelecionado !== null && 
                                           window.exemploImagemSelecionado !== undefined &&
                                           aiImagesBase64.length > 0 &&
                                           !aiImagesDeselected.has(0);
            
            imagensAnexadas.forEach((img, index) => {
                // Se for imagem de exemplo (índice 0), só incluir se estiver válida
                if (index === 0 && window.exemploImagemSelecionado) {
                    if (temImagemExemploValida) {
                        imagensAnexadasFiltradas.push(img);
                    }
                } else if (index !== 0) {
                    // Para outras imagens, incluir normalmente
                    imagensAnexadasFiltradas.push(img);
                }
            });
        }
        
        // Inicializar allImages com as imagens filtradas
        let allImages = [...imagensAnexadasFiltradas];
        if (savedImagesSelected.size > 0) {
            console.log(`📸 Carregando ${savedImagesSelected.size} imagem(ns) salva(s) selecionada(s) para análise de cobertura...`);
            
            for (const imageName of savedImagesSelected) {
                const imageData = savedImagesData.find(img => img.filename === imageName);
                if (imageData && imageData.downloadUrl) {
                    try {
                        const base64 = await urlToBase64(imageData.downloadUrl);
                        if (base64) {
                            allImages.push(base64);
                            console.log(`✅ Imagem salva "${imageName}" convertida para base64`);
                        }
                    } catch (error) {
                        console.error(`❌ Erro ao converter imagem salva "${imageName}":`, error);
                    }
                }
            }
        }
        
        // Log para debug (após carregar todas as imagens)
        console.log('🔍 Validação antes de enviar análise de cobertura:');
        console.log('  - Contexto (texto):', contexto.length > 0 ? `Sim (${contexto.length} caracteres)` : 'Não');
        console.log('  - Imagens anexadas filtradas:', imagensAnexadasFiltradas.length);
        console.log('  - Imagens salvas selecionadas:', savedImagesSelected.size);
        console.log('  - Total de imagens a enviar:', allImages.length);
        
        // Validação final antes de enviar: garantir que há contexto OU imagens
        if (!contexto && allImages.length === 0) {
            console.error('❌ Validação falhou: nem contexto nem imagens disponíveis');
            if (typeof showWarningModal === 'function') {
                showWarningModal('❌ Por favor, adicione uma descrição da funcionalidade (<strong>etapa 4</strong>) ou selecione/anexe imagens (<strong>etapa 3</strong>) antes de analisar a cobertura.');
            } else {
                alert('❌ Por favor, adicione uma descrição da funcionalidade (etapa 4) ou selecione/anexe imagens (etapa 3) antes de analisar a cobertura.');
            }
            document.getElementById('cobertura-loading').style.display = 'none';
            modal.style.display = 'none';
            return;
        }
        
        // Validação de quantidade máxima de imagens selecionadas (máximo 5)
        const MAX_IMAGENS_SELECIONADAS = 5;
        if (allImages.length > MAX_IMAGENS_SELECIONADAS) {
            const mensagem = `❌ Máximo de ${MAX_IMAGENS_SELECIONADAS} imagens selecionadas permitidas para envio ao prompt. Você selecionou ${allImages.length} imagens.<br><br>Por favor, desmarque algumas imagens e tente novamente.`;
            if (typeof showWarningModal === 'function') {
                showWarningModal(mensagem);
            } else {
                alert(`❌ Máximo de ${MAX_IMAGENS_SELECIONADAS} imagens selecionadas permitidas para envio ao prompt. Você selecionou ${allImages.length} imagens.\n\nPor favor, desmarque algumas imagens e tente novamente.`);
            }
            document.getElementById('cobertura-loading').style.display = 'none';
            modal.style.display = 'none';
            return;
        }
        
        // Validação de tamanho total (imagens anexadas + imagens salvas convertidas)
        if (allImages.length > 0) {
            let totalSize = 0;
            allImages.forEach(base64 => {
                const base64Length = base64.length - 23; // Remover prefixo "data:image/..."
                totalSize += base64Length;
            });
            
            const sizeInMB = (totalSize * 0.75) / 1024 / 1024; // Base64 é ~33% maior que binário
            
            if (sizeInMB > 80) { // Limite de 80MB para deixar margem de segurança (servidor aceita 100MB)
                const mensagem = `⚠️ O tamanho total das imagens selecionadas (${sizeInMB.toFixed(2)}MB) excede o limite recomendado de 80MB.\n\nPor favor, reduza o número de imagens ou selecione imagens menores para análise de cobertura.`;
                if (typeof showWarningModal === 'function') {
                    showWarningModal(mensagem);
                } else {
                    alert(mensagem);
                }
                document.getElementById('cobertura-loading').style.display = 'none';
                modal.style.display = 'none';
                return;
            }
            
            console.log(`📊 Tamanho total das imagens: ${sizeInMB.toFixed(2)}MB`);
        }
        
        // Calcular último número de CT para numeração das sugestões
        const casosTesteGeral = typeof cenarios !== 'undefined' && Array.isArray(cenarios) 
            ? cenarios.map(c => {
                const codigoMatch = (c.titulo || '').match(/CT(\d+)/i);
                return codigoMatch ? parseInt(codigoMatch[1], 10) : 0;
            }).filter(num => num > 0)
            : [];
        const ultimoNumero = casosTesteGeral.length > 0 ? Math.max(...casosTesteGeral) : 0;
        
        // Recuperar cobertura anterior do localStorage
        // Verificar se há cobertura atual (não deletada) ou apenas anterior (CTs foram deletados)
        const coberturaAtual = recuperarCoberturaLocalStorage(testType);
        const coberturaAnteriorDeletada = recuperarCoberturaAnteriorLocalStorage(testType);
        
        // Verificar se há flag indicando que CTs foram adicionados (PRIORIDADE MÁXIMA)
        const tipoParaCobertura = testType === 'indefinido' ? 'funcional' : testType;
        const chaveCtsAdicionados = `cts_adicionados_${tipoParaCobertura.toLowerCase()}`;
        const ctsForamAdicionados = localStorage.getItem(chaveCtsAdicionados) === 'true';
        
        // Log de debug para entender o estado
        console.log(`🔍 DEBUG - Estado da análise:`);
        console.log(`  - Flag cts_adicionados: ${ctsForamAdicionados}`);
        console.log(`  - Cobertura atual: ${coberturaAtual}`);
        console.log(`  - Cobertura anterior deletada: ${coberturaAnteriorDeletada}`);
        
        // Se há cobertura atual, usar ela (casos foram adicionados ou análise normal)
        // Se só há cobertura_anterior (sem cobertura atual), significa que CTs foram deletados
        // Se não houver nenhuma, inicializar como 0
        let coberturaAnterior = 0; // Inicializar como 0 por padrão
        let ctsForamDeletados = false;
        
        // PRIORIDADE ABSOLUTA: Se a flag de CTs adicionados está definida, NUNCA tratar como deleção
        // Mesmo que haja cobertura_anterior, se a flag está definida, significa que casos foram ADICIONADOS
        if (ctsForamAdicionados) {
            // CTs foram adicionados - usar cobertura atual se existir, senão usar 0
            // IMPORTANTE: Limpar cobertura_anterior para evitar confusão
            if (coberturaAnteriorDeletada !== null) {
                console.log(`🧹 Limpando cobertura_anterior (${coberturaAnteriorDeletada}%) pois CTs foram ADICIONADOS, não deletados`);
                limparCoberturaAnteriorLocalStorage(testType);
            }
            
            if (coberturaAtual !== null) {
                coberturaAnterior = coberturaAtual;
                console.log(`✅ CTs foram ADICIONADOS! Cobertura atual: ${coberturaAtual}% - Nova cobertura DEVE ser MAIOR`);
            } else {
                // Se não há cobertura atual mas CTs foram adicionados, usar 0 como base
                coberturaAnterior = 0;
                console.log(`✅ CTs foram ADICIONADOS! Sem cobertura anterior, usando 0% como base - Nova cobertura DEVE ser MAIOR que 0%`);
            }
            ctsForamDeletados = false;
        } else if (coberturaAtual !== null) {
            // Há cobertura atual - análise normal (sem flag de adição)
            coberturaAnterior = coberturaAtual;
            ctsForamDeletados = false;
            console.log(`📊 Cobertura atual encontrada: ${coberturaAtual}% (análise normal)`);
        } else if (coberturaAnteriorDeletada !== null) {
            // Só há cobertura_anterior E não há flag de adição - CTs foram deletados
            coberturaAnterior = coberturaAnteriorDeletada;
            ctsForamDeletados = true;
            console.log(`🚨 CTs foram deletados! Cobertura anterior: ${coberturaAnteriorDeletada}% - Nova cobertura DEVE ser MENOR ou ZERADA`);
        } else {
            // Não há cobertura anterior - inicializar como 0
            console.log(`📊 Nenhuma cobertura anterior encontrada, usando 0% como padrão`);
        }
        
        // Verificar se deve usar prompt de comparação
        const descricaoProdutoAtualizada = localStorage.getItem('descricaoProdutoAtualizada') === 'true';
        const resumoDescricaoProduto = localStorage.getItem('resumoDescricaoProduto') || null;
        const novoResumoDescricaoProduto = localStorage.getItem('novoResumoDescricaoProduto') || null;
        
        // Log detalhado das condições para prompt de rastreabilidade
        console.log('🔍 Verificando condições para prompt de rastreabilidade:');
        console.log('🔍 descricaoProdutoAtualizada:', descricaoProdutoAtualizada);
        console.log('🔍 resumoDescricaoProduto existe:', !!resumoDescricaoProduto);
        console.log('🔍 resumoDescricaoProduto tamanho:', resumoDescricaoProduto ? resumoDescricaoProduto.trim().length : 0);
        console.log('🔍 novoResumoDescricaoProduto existe:', !!novoResumoDescricaoProduto);
        console.log('🔍 novoResumoDescricaoProduto tamanho:', novoResumoDescricaoProduto ? novoResumoDescricaoProduto.trim().length : 0);
        console.log('🔍 contexto disponível:', contexto ? `Sim (${contexto.length} caracteres)` : 'Não');
        console.log('🔍 contexto primeiros 200 caracteres:', contexto ? contexto.substring(0, 200) + '...' : 'N/A');
        
        const usarPromptComparacao = descricaoProdutoAtualizada && novoResumoDescricaoProduto && novoResumoDescricaoProduto.trim().length > 0;
        console.log('🔍 usarPromptComparacao (Prompt ID 11):', usarPromptComparacao);
        if (usarPromptComparacao) {
            console.log('✅ Usando prompt de rastreabilidade com comparação (ID 11)');
        } else {
            console.log('ℹ️ Usando prompt de rastreabilidade padrão (ID 10)');
            if (descricaoProdutoAtualizada) {
                console.log('⚠️ Motivo: descricaoProdutoAtualizada é true mas:', 
                    !novoResumoDescricaoProduto ? 'novoResumoDescricaoProduto não existe no localStorage' : 
                    'novoResumoDescricaoProduto está vazio');
            }
        }
        
        // Preparar dados para envio
        const dadosEnvio = {
            contexto: contexto,
            tipoTeste: testType,
            casosTesteExistentes: casosTesteExistentes,
            images: allImages, // Incluir imagens (novas + selecionadas)
            provider: provider,
            ultimoNumeroCT: ultimoNumero,
            coberturaAnterior: coberturaAnterior, // Incluir cobertura anterior
            ctsForamDeletados: ctsForamDeletados, // Flag indicando se CTs foram deletados
            ctsForamAdicionados: ctsForamAdicionados, // Flag indicando se CTs foram adicionados
            descricaoProdutoAtualizada: descricaoProdutoAtualizada, // Flag indicando se descrição foi atualizada
            resumoDescricaoProduto: resumoDescricaoProduto, // Resumo antigo do localStorage
            novoResumoDescricaoProduto: novoResumoDescricaoProduto // Novo resumo do localStorage
        };
        
        console.log('📤 Enviando dados para análise de cobertura:');
        console.log('📤 descricaoProdutoAtualizada:', dadosEnvio.descricaoProdutoAtualizada);
        console.log('📤 resumoDescricaoProduto:', dadosEnvio.resumoDescricaoProduto ? `Sim (${dadosEnvio.resumoDescricaoProduto.length} caracteres)` : 'Não');
        console.log('📤 novoResumoDescricaoProduto:', dadosEnvio.novoResumoDescricaoProduto ? `Sim (${dadosEnvio.novoResumoDescricaoProduto.length} caracteres)` : 'Não');
        console.log('📤 contexto:', dadosEnvio.contexto ? `Sim (${dadosEnvio.contexto.length} caracteres)` : 'Não');
        
        // Chamar backend para análise de cobertura (servidor de IA na porta 3002)
        const response = await fetch(`${AI_API_BASE_URL}/api/analisar-cobertura`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(dadosEnvio)
        });
        
        const data = await response.json();
        
        if (!response.ok) {
            throw new Error(data.error || 'Erro ao analisar cobertura');
        }
        
        // Sempre atualizar resumo da descrição do produto no localStorage quando disponível
        if (data.resumoDescricaoProduto) {
            if (descricaoProdutoAtualizada) {
                // IMPORTANTE: Quando descricaoProdutoAtualizada = true, preservar o resumoDescricaoProduto antigo
                // se ele ainda não foi movido para resumoDescricaoProduto (primeira vez que atualiza)
                const resumoAntigo = localStorage.getItem('resumoDescricaoProduto');
                const novoResumoExistente = localStorage.getItem('novoResumoDescricaoProduto');
                
                if (resumoAntigo && !novoResumoExistente) {
                    // Primeira vez atualizando: manter o resumo antigo em resumoDescricaoProduto
                    // e salvar o novo em novoResumoDescricaoProduto
                    console.log('📝 Primeira atualização detectada: preservando resumoDescricaoProduto antigo');
                    console.log('📝 Tamanho do resumo antigo preservado:', resumoAntigo.length, 'caracteres');
                }
                
                // Se descricaoProdutoAtualizada = true, salvar em novoResumoDescricaoProduto
                localStorage.setItem('novoResumoDescricaoProduto', data.resumoDescricaoProduto);
                console.log('✅ Novo resumo da descrição do produto salvo em novoResumoDescricaoProduto (localStorage)');
                console.log('✅ Tamanho do novo resumo:', data.resumoDescricaoProduto.length, 'caracteres');
                console.log('✅ Primeiros 200 caracteres:', data.resumoDescricaoProduto.substring(0, 200) + '...');
                
                // Verificar se ambos os resumos existem agora
                const novoResumo = localStorage.getItem('novoResumoDescricaoProduto');
                const resumoAntigoFinal = localStorage.getItem('resumoDescricaoProduto');
                console.log('🔍 Após salvar - resumoDescricaoProduto existe:', !!resumoAntigoFinal);
                console.log('🔍 Após salvar - resumoDescricaoProduto tamanho:', resumoAntigoFinal ? resumoAntigoFinal.trim().length : 0);
                console.log('🔍 Após salvar - novoResumoDescricaoProduto existe:', !!novoResumo);
                console.log('🔍 Após salvar - novoResumoDescricaoProduto tamanho:', novoResumo ? novoResumo.trim().length : 0);
                if (resumoAntigoFinal && novoResumo) {
                    console.log('✅ Ambos os resumos estão disponíveis. Na próxima execução, o prompt ID 11 será usado.');
                } else {
                    console.log('⚠️ ATENÇÃO: Um dos resumos não está disponível:');
                    console.log('  - resumoDescricaoProduto:', resumoAntigoFinal ? '✅ Existe' : '❌ Não existe');
                    console.log('  - novoResumoDescricaoProduto:', novoResumo ? '✅ Existe' : '❌ Não existe');
                }
            } else {
                // Caso contrário, salvar normalmente em resumoDescricaoProduto
                localStorage.setItem('resumoDescricaoProduto', data.resumoDescricaoProduto);
                console.log('✅ Resumo da descrição do produto atualizado no localStorage (resumoDescricaoProduto)');
            }
        } else {
            console.log('ℹ️ Resumo da descrição do produto não foi gerado nesta execução');
            if (descricaoProdutoAtualizada) {
                console.log('⚠️ ATENÇÃO: descricaoProdutoAtualizada é true mas nenhum resumo foi retornado.');
                console.log('⚠️ Verifique se o resumo foi gerado no backend. O backend deveria gerar o resumo quando descricaoProdutoAtualizada é true e novoResumoDescricaoProduto não existe.');
            }
        }
        
        // Salvar cobertura no localStorage após receber nova análise
        if (data.cobertura && data.cobertura.cobertura_total_percentual !== undefined) {
            const novaCobertura = data.cobertura.cobertura_total_percentual;
            const temSugestoes = data.cobertura.casos_sugeridos && data.cobertura.casos_sugeridos.length > 0;
            const sugestoesFiltradas = data.cobertura.sugestoes_filtradas || false;
            
            // Recuperar cobertura anterior para comparação (já foi declarada antes do fetch)
            const coberturaAnteriorParaComparacao = recuperarCoberturaLocalStorage(testType);
            
            // VALIDAÇÃO: Se CTs foram adicionados, a cobertura DEVE aumentar
            if (ctsForamAdicionados) {
                // Usar cobertura anterior da análise (pode ser 0 se não havia cobertura)
                const coberturaBase = coberturaAnterior || 0;
                
                if (coberturaAnteriorParaComparacao !== null) {
                    // Há cobertura anterior salva - comparar com ela
                    if (novaCobertura <= coberturaAnteriorParaComparacao) {
                        console.warn(`⚠️ ATENÇÃO: CTs foram adicionados mas cobertura não aumentou! Anterior: ${coberturaAnteriorParaComparacao}%, Nova: ${novaCobertura}%`);
                        console.warn(`⚠️ Ajustando cobertura para garantir aumento mínimo de 1%`);
                        // Garantir que a cobertura aumente pelo menos 1% quando CTs são adicionados
                        const coberturaAjustada = Math.min(100, coberturaAnteriorParaComparacao + 1);
                        data.cobertura.cobertura_total_percentual = coberturaAjustada;
                        salvarCoberturaLocalStorage(testType, coberturaAjustada);
                        console.log(`✅ Cobertura ajustada para: ${coberturaAjustada}%`);
                    } else {
                        console.log(`✅ Cobertura aumentou corretamente: ${coberturaAnteriorParaComparacao}% → ${novaCobertura}%`);
                        salvarCoberturaLocalStorage(testType, novaCobertura);
                    }
                } else {
                    // Não há cobertura anterior salva - garantir que seja maior que 0
                    if (novaCobertura <= coberturaBase) {
                        console.warn(`⚠️ ATENÇÃO: CTs foram adicionados mas cobertura não aumentou! Base: ${coberturaBase}%, Nova: ${novaCobertura}%`);
                        console.warn(`⚠️ Ajustando cobertura para garantir valor mínimo de 1%`);
                        const coberturaAjustada = Math.max(1, novaCobertura + 1);
                        data.cobertura.cobertura_total_percentual = coberturaAjustada;
                        salvarCoberturaLocalStorage(testType, coberturaAjustada);
                        console.log(`✅ Cobertura ajustada para: ${coberturaAjustada}%`);
                    } else {
                        console.log(`✅ Cobertura calculada corretamente após adicionar CTs: ${coberturaBase}% → ${novaCobertura}%`);
                        salvarCoberturaLocalStorage(testType, novaCobertura);
                    }
                }
                // Remover flag de CTs adicionados após processar
                localStorage.removeItem(chaveCtsAdicionados);
                console.log(`🗑️ Flag de CTs adicionados removida após processar análise`);
            }
            // VALIDAÇÃO: Se CTs foram deletados, a cobertura DEVE diminuir ou zerar
            else if (ctsForamDeletados && coberturaAnterior !== null) {
                if (novaCobertura >= coberturaAnterior) {
                    console.warn(`⚠️ ATENÇÃO: CTs foram deletados mas cobertura não diminuiu! Anterior: ${coberturaAnterior}%, Nova: ${novaCobertura}%`);
                    console.warn(`⚠️ Zerando cobertura pois CTs foram removidos`);
                    // Zerar cobertura quando CTs são deletados
                    data.cobertura.cobertura_total_percentual = 0;
                    salvarCoberturaLocalStorage(testType, 0);
                    console.log(`✅ Cobertura zerada após deletar CTs`);
                } else {
                    console.log(`✅ Cobertura diminuiu corretamente: ${coberturaAnterior}% → ${novaCobertura}%`);
                    salvarCoberturaLocalStorage(testType, novaCobertura);
                }
                // Limpar cobertura anterior após processar
                limparCoberturaAnteriorLocalStorage(testType);
            }
            // Se não há sugestões E houve sugestões filtradas, manter a cobertura anterior (não atualizar)
            // Isso evita que a cobertura diminua quando todas as sugestões são filtradas
            else if (!temSugestoes && sugestoesFiltradas && coberturaAnteriorParaComparacao !== null) {
                console.log(`📊 Todas as sugestões foram filtradas como duplicadas. Mantendo cobertura anterior: ${coberturaAnteriorParaComparacao}%`);
                // Garantir que a cobertura anterior esteja salva como cobertura atual
                salvarCoberturaLocalStorage(testType, coberturaAnteriorParaComparacao);
                // Atualizar o valor de cobertura para exibição
                data.cobertura.cobertura_total_percentual = coberturaAnteriorParaComparacao;
                // Atualizar o tooltip com a cobertura anterior
                atualizarTextoInfoCobertura();
            } else {
                // Caso normal: salvar a nova cobertura calculada pela IA
                salvarCoberturaLocalStorage(testType, novaCobertura);
                console.log(`📊 Cobertura salva: ${novaCobertura}%`);
            }
            
            // Atualizar cobertura anterior para o mesmo valor do atual (após receber nova análise)
            const coberturaFinal = data.cobertura.cobertura_total_percentual;
            // Garantir que a cobertura atual também esteja salva (não apenas a anterior)
            if (coberturaFinal !== null && coberturaFinal !== undefined && !isNaN(coberturaFinal)) {
                salvarCoberturaLocalStorage(testType, coberturaFinal);
                localStorage.setItem('cobertura_anterior', coberturaFinal.toString());
                console.log(`📊 Cobertura atual e anterior atualizadas: ${coberturaFinal}%`);
            }
            
            // Atualizar tooltip do ícone
            atualizarTextoInfoCobertura();
        }
        
        // Preencher modal com resultado
        preencherCobertura(data.cobertura, testType);
        document.getElementById('cobertura-loading').style.display = 'none';
        document.getElementById('cobertura-content').style.display = 'block';
        // Mostrar botões de fechar novamente após gerar resultado
        const closeButtonHeader = modal.querySelector('.close');
        const closeButtonFooter = modal.querySelector('[data-cy="btn-fechar-cobertura"]');
        if (closeButtonHeader) {
            closeButtonHeader.style.display = 'block';
        }
        if (closeButtonFooter) {
            closeButtonFooter.style.display = 'block';
        }
        
        // Se houver casos sugeridos, processá-los e exibi-los diretamente
        if (data.cobertura.casos_sugeridos && data.cobertura.casos_sugeridos.length > 0) {
            window.cenariosGeradosCobertura = data.cobertura.casos_sugeridos;
            window.coberturaAtual = {
                lacunas: data.cobertura.casos_sugeridos.map(c => c.titulo || c),
                testType: testType
            };
        }
        
    } catch (error) {
        console.error('Erro ao analisar cobertura:', error);
        
        // Construir mensagem de erro detalhada
        let mensagemErro = '❌ Erro ao analisar cobertura\n\n';
        
        if (error.message.includes('502') || error.message.includes('Bad Gateway')) {
            mensagemErro += 'O servidor da OpenAI está temporariamente indisponível ou sobrecarregado.\n\n';
            mensagemErro += 'Isso geralmente é um problema temporário. Tente novamente em alguns segundos.';
        } else if (error.message.includes('503') || error.message.includes('Service Unavailable')) {
            mensagemErro += 'O serviço da OpenAI está temporariamente indisponível.\n\n';
            mensagemErro += 'O serviço pode estar em manutenção ou sobrecarregado. Tente novamente em alguns minutos.';
        } else if (error.message.includes('504') || error.message.includes('Gateway Timeout')) {
            mensagemErro += 'A requisição demorou muito para ser processada.\n\n';
            mensagemErro += 'O prompt pode ser muito grande ou o servidor está lento. Tente novamente ou reduza o tamanho do contexto.';
        } else if (error.message.includes('429') || error.message.includes('Too Many Requests')) {
            mensagemErro += 'Limite de requisições excedido.\n\n';
            mensagemErro += 'Você excedeu o limite de requisições. Aguarde alguns minutos antes de tentar novamente.';
        } else if (error.message.includes('401') || error.message.includes('Unauthorized') || error.message.includes('chave')) {
            mensagemErro += 'Chave da API inválida ou expirada.\n\n';
            mensagemErro += 'Verifique se a chave da API está correta e válida no servidor.';
        } else if (error.message.includes('network') || error.message.includes('fetch') || error.message.includes('Failed to fetch')) {
            mensagemErro += 'Erro de conexão com o servidor de IA.\n\n';
            mensagemErro += 'Verifique se o servidor está rodando na porta 3002.';
        } else {
            mensagemErro += error.message;
        }
        
        // Exibir erro no loading
        const loadingDiv = document.getElementById('cobertura-loading');
        if (loadingDiv) {
            loadingDiv.innerHTML = `<div style="color: red; padding: 20px; text-align: center;">
                <p style="font-weight: bold; margin-bottom: 10px;">${mensagemErro}</p>
            </div>`;
        }
        // Mostrar botões de fechar novamente em caso de erro
        const closeButtonHeader = modal.querySelector('.close');
        const closeButtonFooter = modal.querySelector('[data-cy="btn-fechar-cobertura"]');
        if (closeButtonHeader) {
            closeButtonHeader.style.display = 'block';
        }
        if (closeButtonFooter) {
            closeButtonFooter.style.display = 'block';
        }
    }
}


function fecharModalCobertura() {
    const modal = document.getElementById('modalCobertura');
    if (modal) {
        modal.style.display = 'none';
    }
    
    // Limpar dados da cobertura
    if (window.coberturaAtual) {
        delete window.coberturaAtual;
    }
    if (window.cenariosGeradosCobertura) {
        delete window.cenariosGeradosCobertura;
    }
    
    // Ocultar preview e mostrar conteúdo original
    const previewDiv = document.getElementById('cobertura-preview');
    const contentDiv = document.getElementById('cobertura-content');
    const btnAplicarCT = document.getElementById('btn-aplicar-ct-cobertura');
    const loadingDiv = document.getElementById('cobertura-loading');
    const loadingText = document.getElementById('cobertura-loading-text');
    
    if (previewDiv) previewDiv.style.display = 'none';
    if (contentDiv) contentDiv.style.display = 'block';
    if (btnAplicarCT) btnAplicarCT.style.display = 'none';
    if (loadingDiv) loadingDiv.style.display = 'none';
    if (loadingText) loadingText.textContent = '🤖 Analisando cobertura de testes...';
}

async function gerarCasosTesteCobertura() {
    if (!window.coberturaAtual || !window.coberturaAtual.lacunas || window.coberturaAtual.lacunas.length === 0) {
        alert('❌ Não há sugestões de cobertura para gerar casos de teste.');
        return;
    }
    
    const lacunas = window.coberturaAtual.lacunas;
    const testType = window.coberturaAtual.testType || 'funcional';
    
    // Mostrar loading
    const loadingDiv = document.getElementById('cobertura-loading');
    const loadingText = document.getElementById('cobertura-loading-text');
    const contentDiv = document.getElementById('cobertura-content');
    const previewDiv = document.getElementById('cobertura-preview');
    
    if (loadingDiv) {
        loadingDiv.style.display = 'block';
    }
    if (loadingText) {
        loadingText.textContent = '🤖 Gerando casos de teste sugeridos...';
    }
    if (contentDiv) contentDiv.style.display = 'none';
    if (previewDiv) previewDiv.style.display = 'none';
    
    try {
        // Recuperar lista geral de casos de teste para determinar o último número
        const casosTesteGeral = typeof cenarios !== 'undefined' && Array.isArray(cenarios) 
            ? cenarios.map(c => {
                const codigoMatch = (c.titulo || '').match(/CT(\d+)/i);
                return codigoMatch ? parseInt(codigoMatch[1], 10) : 0;
            }).filter(num => num > 0)
            : [];
        
        const ultimoNumero = casosTesteGeral.length > 0 ? Math.max(...casosTesteGeral) : 0;
        
        // Obter contexto da funcionalidade
        const featureText = document.getElementById('feature-text')?.value || '';
        const imagensAnexadas = typeof aiImagesBase64 !== 'undefined' ? aiImagesBase64 : [];
        const provider = document.getElementById('ai-provider')?.value || 'openai';
        
        // Chamar backend para gerar casos de teste
        const response = await fetch(`${AI_API_BASE_URL}/api/gerar-ct-cobertura`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                lacunas: lacunas,
                contexto: featureText.trim(),
                tipoTeste: testType,
                ultimoNumeroCT: ultimoNumero,
                images: imagensAnexadas,
                provider: provider
            })
        });
        
        const data = await response.json();
        
        if (!response.ok) {
            throw new Error(data.error || 'Erro ao gerar casos de teste');
        }
        
        // Armazenar casos gerados
        window.cenariosGeradosCobertura = data.casosTeste || [];
        
        // Mostrar preview
        mostrarPreviewCobertura(window.cenariosGeradosCobertura, testType);
        
        if (loadingDiv) loadingDiv.style.display = 'none';
        
    } catch (error) {
        console.error('Erro ao gerar casos de teste:', error);
        if (loadingDiv) {
            const loadingText = document.getElementById('cobertura-loading-text');
            if (loadingText) {
                loadingText.innerHTML = '<span style="color: red;">Erro ao gerar casos de teste: ' + error.message + '</span>';
            } else {
                loadingDiv.innerHTML = '<p style="color: red;">Erro ao gerar casos de teste: ' + error.message + '</p>';
            }
        }
    }
}

function mostrarPreviewCobertura(cenarios, testType) {
    const previewDiv = document.getElementById('cobertura-preview');
    const scenariosList = document.getElementById('cobertura-scenarios-list');
    const contentDiv = document.getElementById('cobertura-content');
    const btnGerarCT = document.getElementById('btn-gerar-ct-cobertura');
    
    if (!previewDiv || !scenariosList) {
        console.error('Elementos do preview não encontrados');
        return;
    }
    
    // Função para obter informações do tipo de teste
    const getTestTypeInfo = (testType) => {
        const testTypes = {
            'funcional': { icon: '⚙️', name: 'Funcional', color: '#28a745' },
            'regressao': { icon: '🔄', name: 'Regressão', color: '#17a2b8' },
            'integracao': { icon: '🔗', name: 'Integração', color: '#6c757d' },
            'usabilidade': { icon: '👤', name: 'Usabilidade', color: '#fd7e14' },
            'performance': { icon: '⚡', name: 'Performance', color: '#dc3545' }
        };
        return testTypes[testType] || { icon: '🧪', name: 'Teste', color: '#6c757d' };
    };
    
    const testTypeInfo = getTestTypeInfo(testType);
    
    // Tag do tipo de teste
    const testTypeTag = `<div class="ai-test-type-tag" style="display: inline-block; padding: 4px 12px; border-radius: 4px; background-color: ${testTypeInfo.color}; color: white; font-size: 12px; font-weight: 600; margin-bottom: 15px;">
        ${testTypeInfo.icon} ${testTypeInfo.name}
    </div>`;
    
    const scenariosHtml = cenarios.map((cenario, index) => `
        <div class="ai-scenario-item">
            <input type="checkbox" class="ai-scenario-checkbox" id="cobertura-scenario-${index}" checked>
            <div class="ai-scenario-content">
                <div class="ai-scenario-title">${cenario.titulo || cenario.title || 'Sem título'}</div>
            </div>
        </div>
    `).join('');
    
    scenariosList.innerHTML = testTypeTag + scenariosHtml;
    
    // Ocultar conteúdo original e mostrar preview
    if (contentDiv) contentDiv.style.display = 'none';
    if (previewDiv) previewDiv.style.display = 'block';
    if (btnGerarCT) btnGerarCT.style.display = 'none';
    
    // Mostrar botão de aplicar
    const btnAplicarCT = document.getElementById('btn-aplicar-ct-cobertura');
    if (btnAplicarCT) {
        btnAplicarCT.style.display = 'inline-block';
    }
}

function aplicarCasosTesteCobertura() {
    // Obter casos sugeridos da lista de sugestões ou do window
    let casosSugeridos = window.cenariosGeradosCobertura || [];
    
    // Se não houver no window, tentar obter da lista de sugestões
    if (casosSugeridos.length === 0) {
        const sugestoesList = document.getElementById('cobertura-sugestoes-list');
        if (sugestoesList) {
            const checkboxes = sugestoesList.querySelectorAll('.ai-scenario-checkbox');
            casosSugeridos = Array.from(checkboxes)
                .filter(cb => cb.checked)
                .map((cb) => {
                    const label = cb.nextElementSibling;
                    const titulo = label ? label.textContent.trim() : '';
                    return { titulo: titulo };
                });
        }
    }
    
    if (casosSugeridos.length === 0) {
        alert('❌ Nenhum caso de teste selecionado para aplicar');
        return;
    }
    
    // Obter cenários selecionados
    const checkboxes = document.querySelectorAll('#cobertura-sugestoes-list .ai-scenario-checkbox, #cobertura-scenarios-list .ai-scenario-checkbox');
    const cenariosSelecionados = [];
    
    checkboxes.forEach((checkbox, index) => {
        if (checkbox.checked) {
            // Tentar obter do window primeiro
            if (window.cenariosGeradosCobertura && window.cenariosGeradosCobertura[index]) {
                cenariosSelecionados.push(window.cenariosGeradosCobertura[index]);
            } else {
                // Obter do label
                const label = checkbox.nextElementSibling;
                const titulo = label ? label.textContent.trim() : '';
                if (titulo) {
                    cenariosSelecionados.push({ titulo: titulo });
                }
            }
        }
    });
    
    if (cenariosSelecionados.length === 0) {
        alert('❌ Nenhum caso de teste selecionado para aplicar');
        return;
    }
    
    // Validação de limite total de CTs (máximo 50 por feature)
    const totalCenariosAposAplicacao = cenarios.length + cenariosSelecionados.length;
    if (totalCenariosAposAplicacao > 50) {
        alert(`❌ Limite máximo de 50 CTs por feature atingido!\n\nCTs atuais: ${cenarios.length}\nTentando adicionar: ${cenariosSelecionados.length}\nTotal seria: ${totalCenariosAposAplicacao}\n\nPor favor, remova alguns CTs existentes antes de adicionar novos.`);
        return;
    }
    
    // Encontrar próximo ID disponível
    const proximoId = cenarios.length > 0 ? Math.max(...cenarios.map(c => c.id)) + 1 : 1;
    
    // Obter tipo de teste
    const testType = window.coberturaAtual?.testType || 'funcional';
    
    // Adicionar cenários selecionados ao array global
    cenariosSelecionados.forEach((cenario, index) => {
        const novoId = proximoId + index;
        const idFormatado = String(novoId).padStart(3, '0');
        
        let novoTitulo = cenario.titulo || cenario.title || 'Sem Título';
        if (novoTitulo && novoTitulo.includes(' - ')) {
            const tituloSemPrefixo = novoTitulo.replace(/^CT\d+\s*-\s*/, '');
            novoTitulo = `CT${idFormatado} - ${tituloSemPrefixo}`;
        } else {
            novoTitulo = `CT${idFormatado} - ${novoTitulo}`;
        }
        
        const novoCenario = {
            id: novoId,
            titulo: novoTitulo,
            precondicoes: cenario.precondicoes || '',
            passos: cenario.passos || '',
            resultadoEsperado: cenario.resultadoEsperado || '',
            status: 'na',
            arquivos: [],
            posicao: cenarios.length + index + 1,
            fonte: 'IA',
            tipo: testType
        };
        
        cenarios.push(novoCenario);
    });
    
    // Atualizar arrays e interface
    cenarioId = Math.max(...cenarios.map(c => c.id)) + 1;
    
    // Aplicar filtros para atualizar cenariosFiltrados
    aplicarFiltros();
    
    // Atualizar interface
    renderizarCenarios();
    atualizarTabs();
    atualizarContadores();
    atualizarBotoesNavegacao();
    if (typeof mostrarControlesPaginaCT === 'function') {
        mostrarControlesPaginaCT();
    }
    if (typeof renderizarListaCenarios === 'function') {
        renderizarListaCenarios();
    }
    if (typeof atualizarVisibilidadeBotaoResumo === 'function') {
        atualizarVisibilidadeBotaoResumo();
    }
    if (typeof atualizarVisibilidadeBotaoSalvar === 'function') {
        atualizarVisibilidadeBotaoSalvar();
    }
    
    // Atualizar estado do botão e campo de geração IA após aplicar casos de teste
    if (typeof atualizarEstadoGeracaoIA === 'function') {
        atualizarEstadoGeracaoIA();
    }
    
    // Salvar backup após aplicar casos de teste de cobertura
    salvarBackupLocalStorage();
    
    // Marcar que CTs foram adicionados para próxima análise de cobertura
    const tipoParaCobertura = testType === 'indefinido' ? 'funcional' : testType;
    const chaveCtsAdicionados = `cts_adicionados_${tipoParaCobertura.toLowerCase()}`;
    localStorage.setItem(chaveCtsAdicionados, 'true');
    
    // Limpar cobertura_anterior se existir, pois casos foram ADICIONADOS, não deletados
    const coberturaAnteriorDeletada = recuperarCoberturaAnteriorLocalStorage(testType);
    if (coberturaAnteriorDeletada !== null) {
        console.log(`🧹 Limpando cobertura_anterior (${coberturaAnteriorDeletada}%) pois CTs foram ADICIONADOS`);
        limparCoberturaAnteriorLocalStorage(testType);
    }
    
    console.log(`📝 Flag de CTs adicionados definida para ${testType}. Próxima análise deve aumentar a cobertura.`);
    console.log(`📝 Valor da flag no localStorage: ${localStorage.getItem(chaveCtsAdicionados)}`);
    
    // Fechar modais
    fecharModalCobertura();
    if (typeof fecharModalGerarIA === 'function') {
        fecharModalGerarIA();
    }
    
    // Mostrar toast de sucesso
    if (typeof mostrarToast === 'function') {
        mostrarToast(`${cenariosSelecionados.length} caso(s) de teste aplicado(s) com sucesso!`, 'success');
    } else if (typeof showSuccessPopup === 'function') {
        showSuccessPopup(`${cenariosSelecionados.length} caso(s) de teste selecionado(s) e aplicado(s) com sucesso!`);
    } else {
        alert(`${cenariosSelecionados.length} caso(s) de teste selecionado(s) e aplicado(s) com sucesso!`);
    }
}

function preencherCobertura(cobertura, testType = 'funcional') {
    const contentDiv = document.getElementById('cobertura-content');
    if (!contentDiv) return;
    
    // Verificar se deve mostrar propriedades do prompt ID 11
    const descricaoProdutoAtualizada = localStorage.getItem('descricaoProdutoAtualizada') === 'true';
    const novoResumoDescricaoProduto = localStorage.getItem('novoResumoDescricaoProduto');
    const usarPromptComparacao = descricaoProdutoAtualizada && novoResumoDescricaoProduto;
    
    // Obter informações do tipo de teste para a tag
    const getTestTypeInfo = (testType) => {
        const testTypes = {
            'funcional': { icon: '⚙️', name: 'Funcional', color: '#28a745' },
            'regressao': { icon: '🔄', name: 'Regressão', color: '#17a2b8' },
            'integracao': { icon: '🔗', name: 'Integração', color: '#6c757d' },
            'usabilidade': { icon: '👤', name: 'Usabilidade', color: '#fd7e14' },
            'performance': { icon: '⚡', name: 'Performance', color: '#dc3545' }
        };
        return testTypes[testType] || { icon: '🧪', name: 'Teste', color: '#6c757d' };
    };
    
    const testTypeInfo = getTestTypeInfo(testType);
    
    // Obter configuração de pesos
    const getPesosDescricao = (testType) => {
        const configs = {
            'funcional': 'Objetivos (4), Regras (3), Mensagens (1), Layout (1)',
            'regressao': 'Objetivos (10)',
            'performance': 'Objetivos (10)',
            'integracao': 'Objetivos (6), Regras (4)',
            'usabilidade': 'Objetivos (5), Layout (5)'
        };
        return configs[testType] || configs['funcional'];
    };
    
    let html = '';
    
    // Tag do tipo de teste
    html += `<div style="margin-bottom: 20px;">
        <div class="ai-test-type-tag" style="display: inline-block; padding: 6px 14px; border-radius: 6px; background-color: ${testTypeInfo.color}; color: white; font-size: 13px; font-weight: 600;">
            ${testTypeInfo.icon} ${testTypeInfo.name}
        </div>
    </div>`;
    
    // Cobertura total
    html += `<div style="margin-bottom: 30px;">
        <h4 style="color: #333; margin-bottom: 10px;">Cobertura Total Atual (Média Ponderada)</h4>
        <div style="font-size: 24px; font-weight: bold; color: #0066cc;">
            ${cobertura.cobertura_total_percentual || 0}%
        </div>
        <small style="color: #666; font-size: 12px;">Calculada com base nos pesos: ${getPesosDescricao(testType)}</small>
    </div>`;
    
    // Casos sugeridos (logo após cobertura total)
    if (cobertura.casos_sugeridos && cobertura.casos_sugeridos.length > 0) {
        html += `<div style="margin-bottom: 30px;">
            <h4 style="color: #333; margin-bottom: 15px;">📋 Casos de Teste Sugeridos:</h4>
            <div id="cobertura-sugestoes-list" class="ai-scenarios-list" style="max-height: 300px; overflow-y: auto;">`;
        
        cobertura.casos_sugeridos.forEach((caso, index) => {
            const titulo = caso.titulo || caso || 'Sem título';
            html += `<div class="ai-scenario-item" style="margin-bottom: 10px; padding: 12px; background: #f8f9fa; border-radius: 6px; border-left: 4px solid #28a745;">
                <input type="checkbox" class="ai-scenario-checkbox" id="cobertura-sugestao-${index}" checked style="margin-right: 10px;">
                <label for="cobertura-sugestao-${index}" style="cursor: pointer; flex: 1; color: #333; font-size: 14px;">${titulo}</label>
            </div>`;
        });
        
        html += `</div></div>`;
        
        // Mostrar botão de aplicar casos de teste sugeridos
        const btnAplicarCT = document.getElementById('btn-aplicar-ct-cobertura');
        if (btnAplicarCT) {
            btnAplicarCT.style.display = 'inline-block';
        }
    } else {
        // Verificar se houve sugestões filtradas (duplicadas)
        const sugestoesFiltradas = cobertura.sugestoes_filtradas || false;
        const totalSugestoesAntesFiltro = cobertura.total_sugestoes_antes_filtro || 0;
        
        if (sugestoesFiltradas && totalSugestoesAntesFiltro > 0) {
            // Mensagem quando sugestões foram filtradas como duplicadas
            html += `<div style="margin-bottom: 30px; padding: 20px 5px; background: #fff3cd; border-radius: 8px; border-left: 4px solid #ffc107;">
                <h4 style="color: #856404; margin-bottom: 10px; display: flex; align-items: center; gap: 8px;">
                    <span style="font-size: 24px;">⚠️</span>
                    <span>Sugestões Duplicadas</span>
                </h4>
                <p style="color: #856404; margin: 0; line-height: 1.6; font-size: 14px;">
                    A IA sugeriu ${totalSugestoesAntesFiltro} caso(s) de teste, mas ${totalSugestoesAntesFiltro} deles já estão cobertos pelos casos de teste existentes. Não há novas sugestões para aplicar no momento.
                </p>
            </div>`;
        } else {
            // Mensagem quando não há sugestões (análise completa)
            html += `<div style="margin-bottom: 30px; padding: 20px 5px; background: #e8f5e9; border-radius: 8px; border-left: 4px solid #4caf50;">
                <h4 style="color: #2e7d32; margin-bottom: 10px; display: flex; align-items: center; gap: 8px;">
                    <span style="font-size: 24px;">✅</span>
                    <span>Análise Completa</span>
                </h4>
                <p style="color: #1b5e20; margin: 0; line-height: 1.6; font-size: 14px;">
                    A IA não encontrou pontos importantes que ainda precisam ser validados. Todos os principais aspectos estão sendo cobertos pelos casos de teste existentes.
                </p>
            </div>`;
        }
        
        // Ocultar botão se não houver sugestões
        const btnAplicarCT = document.getElementById('btn-aplicar-ct-cobertura');
        if (btnAplicarCT) {
            btnAplicarCT.style.display = 'none';
        }
    }
    
    // Cobertura por área (em collapse, fechado por default)
    if (cobertura.cobertura_por_area && cobertura.cobertura_por_area.length > 0) {
        const collapseId = 'cobertura-areas-collapse';
        html += `<div style="margin-bottom: 30px;">
            <button type="button" onclick="toggleCoberturaAreas()" style="width: 100%; padding: 12px; background: #f8f9fa; border: 1px solid #ddd; border-radius: 6px; cursor: pointer; text-align: left; font-weight: 600; color: #333; display: flex; justify-content: space-between; align-items: center;">
                <span>Cobertura por Área</span>
                <span id="cobertura-areas-toggle" style="font-size: 18px;">▼</span>
            </button>
            <div id="${collapseId}" style="display: none; margin-top: 15px;">`;
        
        cobertura.cobertura_por_area.forEach(area => {
            const peso = area.peso || 1;
            const pesoLabel = `<span style="background: #0066cc; color: white; padding: 2px 8px; border-radius: 12px; font-size: 11px; font-weight: bold; margin-left: 8px;">Peso: ${peso}</span>`;
            
            html += `<div style="margin-bottom: 20px; padding: 15px; background: #f8f9fa; border-radius: 6px; border-left: 4px solid #0066cc;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                    <div style="display: flex; align-items: center;">
                        <strong style="color: #333;">${area.area || 'Área'}</strong>
                        ${pesoLabel}
                    </div>
                    <span style="font-size: 18px; font-weight: bold; color: #0066cc;">${area.percentual || 0}%</span>
                </div>
                <p style="color: #666; margin: 0; font-size: 14px;">${area.comentario || ''}</p>
            </div>`;
        });
        
        html += `</div></div>`;
    }
    
    // Se usar prompt de comparação, mostrar propriedades adicionais
    if (usarPromptComparacao) {
        // Casos desatualizados
        if (cobertura.casos_desatualizados && cobertura.casos_desatualizados.length > 0) {
            html += `<div style="margin-bottom: 30px;">
                <h4 style="color: #333; margin-bottom: 15px;">⚠️ Casos de Teste Desatualizados:</h4>
                <div style="max-height: 200px; overflow-y: auto; padding: 10px; background: #fff3cd; border-radius: 6px; border-left: 4px solid #ffc107;">`;
            
            cobertura.casos_desatualizados.forEach((ct, index) => {
                html += `<div style="margin-bottom: 8px; padding: 8px; background: white; border-radius: 4px;">
                    <span style="color: #856404; font-size: 14px;">${ct}</span>
                </div>`;
            });
            
            html += `</div>`;
            
            // Sugestões de atualização
            if (cobertura.sugestoes_atualizacao && cobertura.sugestoes_atualizacao.length > 0) {
                html += `<div style="margin-top: 15px;">
                    <h5 style="color: #333; margin-bottom: 10px;">💡 Sugestões de Atualização:</h5>
                    <div style="max-height: 200px; overflow-y: auto;">`;
                
                cobertura.sugestoes_atualizacao.forEach((sugestao, index) => {
                    const titulo = sugestao.titulo || sugestao || 'Sem título';
                    html += `<div style="margin-bottom: 8px; padding: 10px; background: #e3f2fd; border-radius: 4px; border-left: 3px solid #2196f3;">
                        <span style="color: #1976d2; font-size: 14px;">${titulo}</span>
                    </div>`;
                });
                
                html += `</div></div>`;
            }
            
            html += `</div>`;
        }
        
        // Casos irrelevantes (seção separada)
        if (cobertura.casos_irrelevantes && cobertura.casos_irrelevantes.length > 0) {
            html += `<div style="margin-bottom: 30px; padding: 20px; background: #f8d7da; border-radius: 8px; border-left: 4px solid #dc3545;">
                <h4 style="color: #721c24; margin-bottom: 15px;">🗑️ Casos de Teste Irrelevantes:</h4>
                <p style="color: #721c24; margin-bottom: 15px; font-size: 13px;">Estes casos não pertencem a nenhum comportamento da versão nova ou antiga da feature.</p>
                <div id="cobertura-irrelevantes-list" style="max-height: 300px; overflow-y: auto;">`;
            
            cobertura.casos_irrelevantes.forEach((ct, index) => {
                html += `<div class="ai-scenario-item" style="margin-bottom: 10px; padding: 12px; background: white; border-radius: 6px; border-left: 4px solid #dc3545;">
                    <input type="checkbox" class="ai-scenario-checkbox-irrelevante" id="cobertura-irrelevante-${index}" data-ct="${ct}" style="margin-right: 10px;">
                    <label for="cobertura-irrelevante-${index}" style="cursor: pointer; flex: 1; color: #721c24; font-size: 14px;">${ct}</label>
                </div>`;
            });
            
            html += `</div></div>`;
        }
    }
    
    contentDiv.innerHTML = html;
    
    // Mostrar/ocultar botão de remover casos irrelevantes após renderizar
    const btnRemoverIrrelevantes = document.getElementById('btn-remover-irrelevantes-cobertura');
    if (btnRemoverIrrelevantes) {
        if (usarPromptComparacao && cobertura.casos_irrelevantes && cobertura.casos_irrelevantes.length > 0) {
            btnRemoverIrrelevantes.style.display = 'inline-block';
        } else {
            btnRemoverIrrelevantes.style.display = 'none';
        }
    }
}

// Função para remover casos irrelevantes selecionados
function removerCasosIrrelevantesCobertura() {
    const checkboxes = document.querySelectorAll('#cobertura-irrelevantes-list .ai-scenario-checkbox-irrelevante:checked');
    
    if (checkboxes.length === 0) {
        if (typeof showWarningModal === 'function') {
            showWarningModal('Selecione pelo menos um caso de teste irrelevante para remover.');
        } else {
            alert('Selecione pelo menos um caso de teste irrelevante para remover.');
        }
        return;
    }
    
    // Coletar códigos dos CTs selecionados
    const ctsParaRemover = Array.from(checkboxes).map(cb => cb.getAttribute('data-ct'));
    
    // Armazenar os CTs a remover
    window.casosIrrelevantesParaRemover = new Set(ctsParaRemover);
    
    // Mostrar modal de confirmação padrão do sistema
    const count = ctsParaRemover.length;
    const casoTexto = count === 1 ? 'caso' : 'casos';
    const title = 'Confirmar Remoção de Casos de Teste Irrelevantes';
    const message = `Tem certeza que deseja remover <strong>${count}</strong> ${casoTexto} de teste irrelevante(s)?`;
    const confirmButtonText = 'Confirmar';
    const warningMessage = '<p><strong>⚠️ Atenção:</strong> Esta ação irá remover permanentemente os casos de teste selecionados e todos os seus anexos vinculados. Esta ação não pode ser desfeita.</p>';
    
    if (typeof showConfirmModal === 'function') {
        showConfirmModal(title, message, confirmButtonText, () => {
            executarRemocaoCasosIrrelevantes();
        }, warningMessage);
    } else {
        // Fallback para confirm
        const plainMessage = message.replace(/<[^>]*>/g, '');
        if (confirm(`${plainMessage}\n\nEsta ação não pode ser desfeita.`)) {
            executarRemocaoCasosIrrelevantes();
        }
    }
}

// Função para executar a remoção dos casos irrelevantes
function executarRemocaoCasosIrrelevantes() {
    if (!window.casosIrrelevantesParaRemover || window.casosIrrelevantesParaRemover.size === 0) {
        return;
    }
    
    const ctsParaRemover = Array.from(window.casosIrrelevantesParaRemover);
    
    // Remover casos de teste do array cenarios
    let removidos = 0;
    ctsParaRemover.forEach(ctCodigo => {
        // Encontrar o índice do caso de teste pelo código
        const index = cenarios.findIndex(c => {
            const codigoMatch = (c.titulo || '').match(/CT\d+/i);
            const codigo = codigoMatch ? codigoMatch[0] : null;
            return codigo === ctCodigo;
        });
        
        if (index !== -1) {
            cenarios.splice(index, 1);
            removidos++;
        }
    });
    
    // Limpar o Set temporário
    delete window.casosIrrelevantesParaRemover;
    
    if (removidos === 0) {
        if (typeof showWarningModal === 'function') {
            showWarningModal('Nenhum caso de teste foi encontrado para remover.');
        } else {
            alert('Nenhum caso de teste foi encontrado para remover.');
        }
        return;
    }
    
    // Atualizar arrays e interface
    cenarioId = cenarios.length > 0 ? Math.max(...cenarios.map(c => c.id)) + 1 : 1;
    
    // Aplicar filtros para atualizar cenariosFiltrados
    aplicarFiltros();
    
    // Atualizar interface
    renderizarCenarios();
    atualizarTabs();
    atualizarContadores();
    atualizarBotoesNavegacao();
    if (typeof mostrarControlesPaginaCT === 'function') {
        mostrarControlesPaginaCT();
    }
    if (typeof renderizarListaCenarios === 'function') {
        renderizarListaCenarios();
    }
    if (typeof atualizarVisibilidadeBotaoResumo === 'function') {
        atualizarVisibilidadeBotaoResumo();
    }
    if (typeof atualizarVisibilidadeBotaoSalvar === 'function') {
        atualizarVisibilidadeBotaoSalvar();
    }
    
    // Salvar backup após remover casos de teste
    salvarBackupLocalStorage();
    
    // Mostrar toast de sucesso
    if (typeof mostrarToast === 'function') {
        mostrarToast('Casos de testes removidos', 'success');
    } else if (typeof showSuccessPopup === 'function') {
        showSuccessPopup(`✅ ${removidos} caso(s) de teste removido(s) com sucesso!`);
    } else {
        alert(`✅ ${removidos} caso(s) de teste removido(s) com sucesso!`);
    }
    
    // Fechar modal de cobertura
    fecharModalCobertura();
}

// Função para toggle do collapse de cobertura por área
function toggleCoberturaAreas() {
    const collapseDiv = document.getElementById('cobertura-areas-collapse');
    const toggleIcon = document.getElementById('cobertura-areas-toggle');
    if (collapseDiv && toggleIcon) {
        if (collapseDiv.style.display === 'none') {
            collapseDiv.style.display = 'block';
            toggleIcon.textContent = '▲';
        } else {
            collapseDiv.style.display = 'none';
            toggleIcon.textContent = '▼';
        }
    }
}

function mostrarPreviewIA(cenarios, promptUtilizado, testType, tokenInfo, modelUsado) {
    const previewDiv = document.getElementById('ai-preview');
    const scenariosList = document.getElementById('ai-scenarios-list');
    const promptSection = document.getElementById('ai-prompt-section');
    const promptContent = document.getElementById('ai-prompt-content');
    
    // Ocultar texto de informação de cobertura quando o resultado for gerado
    const coberturaInfoText = document.getElementById('cobertura-info-text');
    if (coberturaInfoText) {
        coberturaInfoText.style.display = 'none';
    }
    
    // Ocultar seção de cobertura de teste quando os resultados forem exibidos
    const coberturaTesteSection = document.getElementById('cobertura-teste-section');
    if (coberturaTesteSection) {
        coberturaTesteSection.style.display = 'none';
    }
    
    // Ocultar aviso de imagens selecionadas quando os resultados forem exibidos
    const avisoImagensIA = document.getElementById('imagens-selecionadas-aviso-ia');
    if (avisoImagensIA) {
        avisoImagensIA.style.display = 'none';
    }
    
    if (!previewDiv || !scenariosList) {
        console.error('Elementos do preview não encontrados');
        return;
    }
    
    // Função para obter informações do tipo de teste
    const getTestTypeInfo = (testType) => {
        const testTypes = {
            'funcional': { icon: '⚙️', name: 'Funcional', color: '#28a745' },
            'regressao': { icon: '🔄', name: 'Regressão', color: '#17a2b8' },
            'integracao': { icon: '🔗', name: 'Integração', color: '#6c757d' },
            'usabilidade': { icon: '👤', name: 'Usabilidade', color: '#fd7e14' },
            'performance': { icon: '⚡', name: 'Performance', color: '#dc3545' }
        };
        return testTypes[testType] || { icon: '🧪', name: 'Teste', color: '#6c757d' };
    };
    
    const testTypeInfo = getTestTypeInfo(testType);
    
    // Tag do tipo de teste (roxo para todos os tipos)
    const testTypeTag = `<div class="ai-test-type-tag" style="display: inline-block; padding: 4px 12px; border-radius: 4px; background-color: #7c3aed; color: white; font-size: 12px; font-weight: 600; margin-bottom: 15px;">
        ${testTypeInfo.icon} ${testTypeInfo.name}
    </div>`;
    
    // Informações de tokens e modelo (se disponível)
    let tokenInfoHtml = '';
    if (tokenInfo) {
        // Calcular custo estimado (aproximado)
        let custoEstimado = 0;
        if (modelUsado === 'gpt-4o') {
            // gpt-4o: ~$0.03 por 1K tokens (input), ~$0.12 por 1K tokens (output)
            custoEstimado = (tokenInfo.promptTokens * 0.03 / 1000) + (tokenInfo.completionTokens * 0.12 / 1000);
        } else if (modelUsado === 'gpt-3.5-turbo') {
            // gpt-3.5-turbo: ~$0.0015 por 1K tokens (input), ~$0.002 por 1K tokens (output)
            custoEstimado = (tokenInfo.promptTokens * 0.0015 / 1000) + (tokenInfo.completionTokens * 0.002 / 1000);
        }
        
        tokenInfoHtml = `
            <div style="background: linear-gradient(135deg, #f8f9fa 0%, #e9ecef 100%); border-left: 4px solid #667eea; padding: 15px; margin-bottom: 15px; border-radius: 6px; box-shadow: 0 2px 4px rgba(0,0,0,0.05);">
                <div style="font-size: 14px; color: #495057; margin-bottom: 10px; font-weight: 600;">
                    📊 Estatísticas da Geração
                </div>
                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 15px; font-size: 12px;">
                    <div style="background: white; padding: 10px; border-radius: 4px; border: 1px solid #dee2e6;">
                        <div style="color: #6c757d; margin-bottom: 4px; font-size: 11px;">MODELO UTILIZADO</div>
                        <div style="color: #212529; font-weight: 600;">${modelUsado || 'N/A'}</div>
                    </div>
                    <div style="background: white; padding: 10px; border-radius: 4px; border: 1px solid #dee2e6;">
                        <div style="color: #6c757d; margin-bottom: 4px; font-size: 11px;">TOTAL DE TOKENS</div>
                        <div style="color: #212529; font-weight: 600;">${tokenInfo.totalTokens.toLocaleString('pt-BR')}</div>
                    </div>
                    <div style="background: #e7f3ff; padding: 10px; border-radius: 4px; border: 1px solid #0066cc;">
                        <div style="color: #0066cc; margin-bottom: 4px; font-size: 11px;">📤 PROMPT (INPUT)</div>
                        <div style="color: #0056b3; font-weight: 600;">${tokenInfo.promptTokens.toLocaleString('pt-BR')} tokens</div>
                        <div style="color: #6c757d; font-size: 10px; margin-top: 2px;">Enviado à IA</div>
                    </div>
                    <div style="background: #fff3cd; padding: 10px; border-radius: 4px; border: 1px solid #ffc107;">
                        <div style="color: #856404; margin-bottom: 4px; font-size: 11px;">📥 COMPLETION (OUTPUT)</div>
                        <div style="color: #856404; font-weight: 600;">${tokenInfo.completionTokens.toLocaleString('pt-BR')} tokens</div>
                        <div style="color: #6c757d; font-size: 10px; margin-top: 2px;">Gerado pela IA</div>
                    </div>
                </div>
                ${custoEstimado > 0 ? `
                <div style="margin-top: 12px; padding-top: 12px; border-top: 1px solid #dee2e6; font-size: 11px; color: #28a745;">
                    💰 Custo estimado: $${custoEstimado.toFixed(4)}
                </div>
                ` : ''}
            </div>
        `;
    }
    
    const scenariosHtml = cenarios.map((cenario, index) => `
        <div class="ai-scenario-item">
            <input type="checkbox" class="ai-scenario-checkbox" id="ai-scenario-${index}" checked>
            <div class="ai-scenario-content">
                <div class="ai-scenario-title">${cenario.titulo}</div>
            </div>
        </div>
    `).join('');
    
    // Exibir apenas a tag e a lista de cenários (sem informações de token e sem prompt)
    scenariosList.innerHTML = testTypeTag + scenariosHtml;
    
    // Ocultar seção de prompt
    if (promptSection) {
        promptSection.style.display = 'none';
    }
    
    // Ocultar seção de input e indicadores de etapas
    const inputSection = document.querySelector('.ai-input-section');
    const stepsIndicator = document.querySelector('.ai-steps-indicator');
    if (inputSection) inputSection.style.display = 'none';
    if (stepsIndicator) stepsIndicator.style.display = 'none';
    
    // Ocultar loading
    ocultarLoadingIA();
    
    // Ocultar ícone de cobertura e texto de valor durante preview de resultados
    const coberturaIconTooltip = document.getElementById('cobertura-icon-tooltip');
    if (coberturaIconTooltip) {
        coberturaIconTooltip.style.display = 'none';
    }
    const coberturaValueText = document.getElementById('cobertura-value-text');
    if (coberturaValueText) {
        coberturaValueText.style.display = 'none';
    }
    
    // Mostrar botão Cancelar novamente quando preview for exibido
    const btnCancelar = document.getElementById('btn-cancelar-ia');
    if (btnCancelar) {
        btnCancelar.style.display = 'inline-block';
    }
    
    // Ocultar botão Voltar quando preview for exibido
    const btnVoltar = document.getElementById('btn-voltar-etapa');
    if (btnVoltar) {
        btnVoltar.style.display = 'none';
    }
    
    // Alinhar botões do modal-footer à direita quando preview estiver visível
    const modalFooter = document.querySelector('#modalGerarIA .modal-footer');
    if (modalFooter) {
        modalFooter.style.justifyContent = 'flex-end';
    }
    
    // Armazenar casos de teste gerados no localStorage
    try {
        localStorage.setItem('temp_ct_ia', JSON.stringify(cenarios));
        console.log('✅ Casos de teste armazenados em temp_ct_ia:', cenarios.length, 'casos');
    } catch (error) {
        console.error('❌ Erro ao armazenar casos de teste no localStorage:', error);
    }
    
    // Mostrar preview e botão de aplicar
    previewDiv.style.display = 'block';
    const btnApply = document.getElementById('btn-apply-ai');
    if (btnApply) btnApply.style.display = 'inline-block';
}

// Função para alterar provedor de IA
function alterarProvedorIA() {
    const provider = document.getElementById('ai-provider')?.value;
    if (provider) {
        console.log(`Provedor alterado para: ${provider}`);
    }
}

// Funções para toggle e copiar prompt
function togglePromptFinal() {
    const promptContentContainer = document.getElementById('ai-prompt-content-container');
    const toggleButton = document.getElementById('btn-toggle-prompt');
    const toggleText = toggleButton ? toggleButton.querySelector('.toggle-text') : null;
    
    if (!promptContentContainer || !toggleButton) {
        console.error('Elementos do toggle não encontrados');
        return;
    }
    
    const isExpanded = promptContentContainer.classList.contains('expanded');
    
    if (isExpanded) {
        // Colapsar
        promptContentContainer.classList.remove('expanded');
        promptContentContainer.classList.add('collapsed');
        toggleButton.classList.remove('expanded');
        if (toggleText) toggleText.textContent = 'Mostrar Prompt';
    } else {
        // Expandir
        promptContentContainer.classList.remove('collapsed');
        promptContentContainer.classList.add('expanded');
        toggleButton.classList.add('expanded');
        if (toggleText) toggleText.textContent = 'Ocultar Prompt';
    }
}

function copiarPrompt() {
    const promptContent = document.getElementById('ai-prompt-content');
    if (!promptContent) {
        alert('❌ Prompt não encontrado');
        return;
    }
    
    const promptText = promptContent.textContent;
    
    // Usar a API moderna de clipboard se disponível
    if (navigator.clipboard && window.isSecureContext) {
        navigator.clipboard.writeText(promptText).then(() => {
            if (typeof showSuccessPopup === 'function') {
                showSuccessPopup('📋 Prompt copiado para área de transferência!');
            } else {
                alert('📋 Prompt copiado para área de transferência!');
            }
        }).catch(err => {
            console.error('Erro ao copiar:', err);
            copiarPromptFallback(promptText);
        });
    } else {
        // Fallback para navegadores mais antigos
        copiarPromptFallback(promptText);
    }
}

function copiarPromptFallback(text) {
    const textArea = document.createElement('textarea');
    textArea.value = text;
    textArea.style.position = 'fixed';
    textArea.style.left = '-999999px';
    textArea.style.top = '-999999px';
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    
    try {
        const successful = document.execCommand('copy');
        if (successful) {
            if (typeof showSuccessPopup === 'function') {
                showSuccessPopup('📋 Prompt copiado para área de transferência!');
            } else {
                alert('📋 Prompt copiado para área de transferência!');
            }
        } else {
            alert('❌ Erro ao copiar prompt. Tente selecionar e copiar manualmente.');
        }
    } catch (err) {
        console.error('Erro ao copiar:', err);
        alert('❌ Erro ao copiar prompt. Tente selecionar e copiar manualmente.');
    }
    
    document.body.removeChild(textArea);
}

// Expor funções globalmente
window.abrirModalAprovarTodos = abrirModalAprovarTodos;
window.fecharModalAprovarTodos = fecharModalAprovarTodos;
window.confirmarAprovarTodos = confirmarAprovarTodos;
window.abrirModalExecutarTestes = abrirModalExecutarTestes;
window.fecharModalConfirmarExecucao = fecharModalConfirmarExecucao;
window.fecharModalExecutarTestes = fecharModalExecutarTestes;
window.abrirHistoricoTestes = abrirHistoricoTestes;
window.escolherNovaBateria = escolherNovaBateria;
window.escolherContinuarStatus = escolherContinuarStatus;
window.abrirModalExecucaoTestes = abrirModalExecucaoTestes;
window.aplicarFiltroExecute = aplicarFiltroExecute;
window.popularListaExecucao = popularListaExecucao;
window.atualizarStatusExecucao = atualizarStatusExecucao;
window.abrirModalConfirmarFecharExecucao = abrirModalConfirmarFecharExecucao;
window.fecharModalConfirmarFecharExecucao = fecharModalConfirmarFecharExecucao;
window.confirmarFecharExecucao = confirmarFecharExecucao;
window.salvarStatusExecucao = salvarStatusExecucao;
window.fecharModalConfirmarSalvarStatusExecucao = fecharModalConfirmarSalvarStatusExecucao;
window.confirmarSalvarStatusExecucao = confirmarSalvarStatusExecucao;
window.paginaAnteriorExecute = paginaAnteriorExecute;
window.proximaPaginaExecute = proximaPaginaExecute;
window.alterarModoExibicaoExecute = alterarModoExibicaoExecute;
window.casoAnteriorExecute = casoAnteriorExecute;
window.casoProximoExecute = casoProximoExecute;
// Função para organizar casos de teste usando IA
async function reorganizarCasosTeste() {
    if (!cenarios || cenarios.length === 0) {
        showWarningModal('❌ Nenhum caso de teste para organizar');
        return;
    }
    
    if (cenarios.length < 2) {
        showWarningModal('⚠️ É necessário pelo menos 2 casos de teste para organizar');
        return;
    }
    
    // Mostrar modal de confirmação
    showReorganizeCTModal(async () => {
        try {
            // Mostrar loading
            const loadingMsg = document.createElement('div');
            loadingMsg.id = 'reorganize-loading';
            loadingMsg.style.cssText = 'position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%); background: white; padding: 20px; border-radius: 8px; box-shadow: 0 4px 6px rgba(0,0,0,0.1); z-index: 10000; text-align: center;';
            loadingMsg.innerHTML = '<div class="spinner" style="border: 4px solid #f3f3f3; border-top: 4px solid #17a2b8; border-radius: 50%; width: 40px; height: 40px; animation: spin 1s linear infinite; margin: 0 auto 10px;"></div><p>Organizando casos de teste...</p>';
            document.body.appendChild(loadingMsg);
            
            // Obter nome da feature e featureId
            const featureName = document.getElementById('nome-feature')?.value || '';
            const featureId = document.getElementById('feature-id')?.value || '';
            
            // Chamar API
            const response = await fetch(`${AI_API_BASE_URL}/api/reorganize-test-cases`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    casosTeste: cenarios,
                    featureName: featureName,
                    featureId: featureId,
                    provider: 'openai'
                })
            });
            
            const data = await response.json();
            
            // Remover loading
            if (document.body.contains(loadingMsg)) {
                document.body.removeChild(loadingMsg);
            }
            
            if (!response.ok) {
                throw new Error(data.error || 'Erro ao organizar casos de teste');
            }
            
            if (!data.success || !data.casosReorganizados) {
                throw new Error('Resposta inválida da API');
            }
            
            // Log de tokens usados
            if (data.tokenInfo) {
                console.log(`📊 Tokens usados na organização: ${data.tokenInfo.totalTokens} (Prompt: ${data.tokenInfo.promptTokens}, Completion: ${data.tokenInfo.completionTokens})`);
            }
            
            // Atualizar array de cenários com a nova ordem
            cenarios = data.casosReorganizados;
            
            // Atualizar cenarioId para o próximo ID disponível
            if (cenarios.length > 0) {
                const maxId = Math.max(...cenarios.map(c => c.id));
                cenarioId = maxId + 1;
            }
            
            // Aplicar filtros para atualizar cenariosFiltrados
            aplicarFiltros();
            
            // Atualizar interface
            renderizarCenarios();
            atualizarTabs();
            atualizarContadores();
            atualizarBotoesNavegacao();
            atualizarBotaoRemover();
            
            // Mostrar mensagem de sucesso usando toggle
            showSuccessPopup(`✅ ${cenarios.length} caso(s) de teste organizado(s) com sucesso!\n\nOs números dos CTs e os nomes dos anexos foram atualizados automaticamente.`);
            
        } catch (error) {
            console.error('Erro ao organizar casos de teste:', error);
            showWarningModal(`❌ Erro ao organizar casos de teste:\n${error.message}`);
        }
    }, cenarios.length);
}

window.aplicarEstilosSelecionado = aplicarEstilosSelecionado;
window.getStatusBackgroundColor = getStatusBackgroundColor;
window.getStatusDotColor = getStatusDotColor;
window.reorganizarCasosTeste = reorganizarCasosTeste;
window.abrirModalGerarIA = abrirModalGerarIA;
window.fecharModalGerarIA = fecharModalGerarIA;
window.removerAtualizarInformacoes = removerAtualizarInformacoes;
window.mostrarToast = mostrarToast;
window.removerCasosIrrelevantesCobertura = removerCasosIrrelevantesCobertura;
window.executarRemocaoCasosIrrelevantes = executarRemocaoCasosIrrelevantes;
window.atualizarContadorCaracteres = atualizarContadorCaracteres;
window.salvarFeatureTextLocalStorage = salvarFeatureTextLocalStorage;
window.salvarTestTypeLocalStorage = salvarTestTypeLocalStorage;
window.salvarExampleSelectorLocalStorage = salvarExampleSelectorLocalStorage;
window.recuperarFeatureTextLocalStorage = recuperarFeatureTextLocalStorage;
window.recuperarTestTypeLocalStorage = recuperarTestTypeLocalStorage;
window.atualizarTextoInfoCobertura = atualizarTextoInfoCobertura;

// Listener para receber mensagens da janela de rastreabilidade de cobertura
window.addEventListener('message', function(event) {
    // Verificar se a mensagem é sobre atualização de cobertura
    if (event.data && event.data.type === 'coberturaAtualizada') {
        const porcentagem = event.data.porcentagem;
        const testType = event.data.testType || 'funcional';
        if (porcentagem !== null && porcentagem !== undefined) {
            console.log('📨 Mensagem recebida: cobertura atualizada para', porcentagem + '%', 'tipo:', testType);
            
            // Atualizar o elemento cobertura-value-text
            const coberturaValueText = document.getElementById('cobertura-value-text');
            if (coberturaValueText) {
                coberturaValueText.innerHTML = `Cobertura atual: <strong>${porcentagem.toFixed(1)}%</strong>`;
                console.log('✅ Elemento cobertura-value-text atualizado');
            }
            
            // Chamar função de atualização completa
            if (typeof atualizarTextoInfoCobertura === 'function') {
                atualizarTextoInfoCobertura();
            }
            
            // Atualizar estado do botão Gerar para verificar se deve ser bloqueado
            if (typeof atualizarEstadoGeracaoIA === 'function') {
                atualizarEstadoGeracaoIA();
            }
        }
    }
    
    // Verificar se a mensagem é sobre casos de teste adicionados
    if (event.data && event.data.type === 'casosTesteAdicionados') {
        const quantidade = event.data.quantidade;
        const testType = event.data.testType || 'funcional';
        console.log('📨 Mensagem recebida: casos de teste adicionados', quantidade, 'tipo:', testType);
        
        // Recarregar dados do backup para atualizar a interface
        const backup = localStorage.getItem('backup');
        if (backup) {
            try {
                const backupData = JSON.parse(backup);
                if (backupData.cenarios && Array.isArray(backupData.cenarios)) {
                    // Restaurar cenários do backup
                    cenarios = backupData.cenarios.map(c => ({
                        ...c,
                        arquivos: c.arquivos || []
                    }));
                    cenarioId = cenarios.length > 0 ? Math.max(...cenarios.map(c => c.id)) + 1 : 1;
                    
                    // Atualizar interface
                    aplicarFiltros();
                    renderizarCenarios();
                    atualizarTabs();
                    atualizarContadores();
                    atualizarBotoesNavegacao();
                    atualizarBotaoRemover();
                    atualizarSumario();
                    atualizarBotaoSalvar();
                    
                    // Atualizar visibilidade do botão de resumo
                    if (typeof atualizarVisibilidadeBotaoResumo === 'function') {
                        atualizarVisibilidadeBotaoResumo();
                    }
                    
                    // Atualizar estado do botão de geração IA
                    if (typeof atualizarEstadoGeracaoIA === 'function') {
                        atualizarEstadoGeracaoIA();
                    }
                    
                    console.log('✅ Interface atualizada com novos casos de teste');
                }
            } catch (error) {
                console.error('❌ Erro ao atualizar interface com novos casos de teste:', error);
            }
        }
    }
    
    // Verificar se a mensagem é sobre casos de teste atualizados
    if (event.data && event.data.type === 'casosTesteAtualizados') {
        const quantidade = event.data.quantidade;
        console.log('📨 Mensagem recebida: casos de teste atualizados', quantidade);
        
        // Recarregar dados do backup para atualizar a interface
        const backup = localStorage.getItem('backup');
        if (backup) {
            try {
                const backupData = JSON.parse(backup);
                if (backupData.cenarios && Array.isArray(backupData.cenarios)) {
                    // Restaurar cenários do backup
                    cenarios = backupData.cenarios.map(c => ({
                        ...c,
                        arquivos: c.arquivos || []
                    }));
                    cenarioId = cenarios.length > 0 ? Math.max(...cenarios.map(c => c.id)) + 1 : 1;
                    
                    // Atualizar interface
                    aplicarFiltros();
                    renderizarCenarios();
                    atualizarTabs();
                    atualizarContadores();
                    atualizarBotoesNavegacao();
                    atualizarBotaoRemover();
                    atualizarSumario();
                    atualizarBotaoSalvar();
                    
                    // Atualizar visibilidade do botão de resumo
                    if (typeof atualizarVisibilidadeBotaoResumo === 'function') {
                        atualizarVisibilidadeBotaoResumo();
                    }
                    
                    // Atualizar estado do botão de geração IA
                    if (typeof atualizarEstadoGeracaoIA === 'function') {
                        atualizarEstadoGeracaoIA();
                    }
                    
                    console.log('✅ Interface atualizada com casos de teste atualizados');
                }
            } catch (error) {
                console.error('❌ Erro ao atualizar interface com casos de teste atualizados:', error);
            }
        }
    }
    
    // Verificar se a mensagem é sobre casos de teste deletados
    if (event.data && event.data.type === 'casosTesteDeletados') {
        const quantidade = event.data.quantidade;
        const ids = event.data.ids || [];
        console.log('📨 Mensagem recebida: casos de teste deletados', quantidade, 'IDs:', ids);
        
        // Recarregar dados do backup para atualizar a interface
        const backup = localStorage.getItem('backup');
        if (backup) {
            try {
                const backupData = JSON.parse(backup);
                if (backupData.cenarios && Array.isArray(backupData.cenarios)) {
                    // Restaurar cenários do backup
                    cenarios = backupData.cenarios.map(c => ({
                        ...c,
                        arquivos: c.arquivos || []
                    }));
                    cenarioId = cenarios.length > 0 ? Math.max(...cenarios.map(c => c.id)) + 1 : 1;
                    
                    // Atualizar interface
                    aplicarFiltros();
                    renderizarCenarios();
                    atualizarTabs();
                    atualizarContadores();
                    atualizarBotoesNavegacao();
                    atualizarBotaoRemover();
                    atualizarSumario();
                    atualizarBotaoSalvar();
                    
                    // Atualizar visibilidade do botão de resumo
                    if (typeof atualizarVisibilidadeBotaoResumo === 'function') {
                        atualizarVisibilidadeBotaoResumo();
                    }
                    
                    // Atualizar estado do botão de geração IA
                    if (typeof atualizarEstadoGeracaoIA === 'function') {
                        atualizarEstadoGeracaoIA();
                    }
                    
                    console.log('✅ Interface atualizada após deletar casos de teste');
                }
            } catch (error) {
                console.error('❌ Erro ao atualizar interface após deletar casos de teste:', error);
            }
        }
    }
});
window.recuperarExampleSelectorLocalStorage = recuperarExampleSelectorLocalStorage;
window.carregarExemplo = carregarExemplo;
window.toggleInputType = toggleInputType;
window.gerarCenariosIA = gerarCenariosIA;
window.aplicarCenariosIA = aplicarCenariosIA;
window.mostrarLoadingIA = mostrarLoadingIA;
window.ocultarLoadingIA = ocultarLoadingIA;
window.mostrarPreviewIA = mostrarPreviewIA;
window.togglePromptFinal = togglePromptFinal;
window.copiarPrompt = copiarPrompt;
window.showWarningModal = showWarningModal;
window.closeWarningModal = closeWarningModal;
window.showConfirmModal = showConfirmModal;
window.closeConfirmModal = closeConfirmModal;
window.executeConfirmAction = executeConfirmAction;
window.showReorganizeCTModal = showReorganizeCTModal;
window.closeReorganizeCTModal = closeReorganizeCTModal;
window.confirmReorganizeCT = confirmReorganizeCT;
window.alterarProvedorIA = alterarProvedorIA;
window.previewIAImages = previewIAImages;
window.carregarImagensSalvas = carregarImagensSalvas;
window.deletarImagemSalva = deletarImagemSalva;
window.abrirModalDeletarImagem = abrirModalDeletarImagem;
window.closeDeleteImageModal = closeDeleteImageModal;
window.confirmDeleteImage = confirmDeleteImage;
window.toggleImagemSalva = toggleImagemSalva;
window.removeIAImage = removeIAImage;
window.irParaEtapa = irParaEtapa;
window.prosseguirEtapa = prosseguirEtapa;
window.voltarEtapa = voltarEtapa;
window.selecionarTodosCT = selecionarTodosCT;

// Função para controlar modo checklist global - aplica a TODOS os casos de teste
window.toggleGlobalChecklistMode = function() {
    const select = document.getElementById('modo-teste');
    if (!select) {
        return;
    }
    
    const isRoteiroMode = select.value === 'sim'; // Se "sim" = roteiro (mostrar campos)
    
    // Aplicar modo a TODOS os casos de teste
    const allTestCases = document.querySelectorAll('.test-case');
    
    allTestCases.forEach(testCase => {
        const twoColumns = testCase.querySelector('.two-columns');
        const expectedResult = testCase.querySelector('.expected-result');
        
        if (twoColumns && expectedResult) {
            if (isRoteiroMode) {
                // Modo roteiro - mostrar campos detalhados com transição suave
                twoColumns.classList.add('visible');
                expectedResult.classList.add('visible');
            } else {
                // Modo checklist - ocultar campos detalhados com transição suave
                expectedResult.classList.remove('visible');
                twoColumns.classList.remove('visible');
            }
        }
    });
    
    console.log(`✅ Modo ${isRoteiroMode ? 'roteiro' : 'checklist'} aplicado a todos os casos de teste`);
    
    const executeModal = document.getElementById('modalExecutarTestes');
    if (executeModal && executeModal.style.display === 'flex' && typeof popularListaExecucao === 'function') {
        popularListaExecucao();
    }
};

// Fechar modais ao clicar fora deles
window.addEventListener('click', function(event) {
    const reorganizeCTModal = document.getElementById('reorganizeCTModal');
    const warningModal = document.getElementById('warningModal');
    
    if (event.target === reorganizeCTModal) {
        closeReorganizeCTModal();
    }
    if (event.target === warningModal) {
        closeWarningModal();
    }
});

