// Script para rastreabilidade de cobertura
// Carrega dados de uma documentação e gera rastreabilidade de cobertura

// Usa path relativo para funcionar em dev e produção (mesma origem)
const API_BASE_URL = '';
const AI_API_BASE_URL = ''; // Assume que API de IA está no mesmo origin (proxy reverso em produção)

class RastreabilidadeCobertura {
    constructor() {
        this.featureId = null;
        this.dados = null;
        this.casosTeste = [];
        this.resumoFeature = null;
        this.rastreabilidade = null;
        this.porcentagemCobertura = null;
        this.casosIrrelevantes = [];
        this.init();
    }

    async init() {
        try {
            // Obter HASH ID da URL (necessário caso não haja backup)
            const urlParams = new URLSearchParams(window.location.search);
            this.featureId = urlParams.get('id') || urlParams.get('hash') || null;

            // Carregar dados (primeiro tenta backup, depois rota)
            await this.carregarDocumentacao();
            
            // Gerar rastreabilidade
            await this.gerarRastreabilidade();
            
        } catch (error) {
            console.error('Erro ao inicializar rastreabilidade:', error);
            this.mostrarErro('Erro ao carregar rastreabilidade: ' + error.message);
        }
    }

    async carregarDocumentacao() {
        try {
            // Primeiro, tentar carregar do backup do localStorage
            const backup = localStorage.getItem('backup');
            
            if (backup) {
                try {
                    const backupData = JSON.parse(backup);
                    
                    if (backupData && backupData.cenarios && backupData.cenarios.length > 0) {
                        this.dados = backupData;
                        
                        // Atualizar nome da feature
                        const featureNameEl = document.getElementById('feature-name');
                        if (featureNameEl) {
                            featureNameEl.textContent = this.dados.featureName || 'Documentação sem nome';
                        }
                        
                        // Extrair casos de teste
                        this.casosTeste = (this.dados.cenarios || []).map(cenario => {
                            const codigoMatch = (cenario.titulo || '').match(/CT(\d+)/i);
                            const codigo = codigoMatch ? codigoMatch[0] : null;
                            return {
                                codigo: codigo,
                                titulo: cenario.titulo || '',
                                id: cenario.id
                            };
                        }).filter(ct => ct.codigo); // Filtrar apenas CTs com código válido
                        
                        // Obter resumo da feature do backup ou do localStorage
                        this.resumoFeature = this.dados.resumoDescricaoProduto || 
                                             localStorage.getItem('resumoDescricaoProduto') || 
                                             this.dados.featureDescription || '';
                        
                        if (!this.resumoFeature || this.resumoFeature.trim().length === 0) {
                            throw new Error('Resumo da feature não encontrado no backup.');
                        }
                        
                        if (this.casosTeste.length === 0) {
                            throw new Error('Nenhum caso de teste encontrado no backup.');
                        }
                        
                        console.log('✅ Dados carregados do localStorage Backup:', {
                            featureName: this.dados.featureName,
                            cenarios: this.casosTeste.length,
                            temResumo: !!this.resumoFeature
                        });
                        
                        return; // Sucesso ao carregar do backup
                    }
                } catch (backupError) {
                    console.warn('⚠️ Erro ao processar backup, tentando rota:', backupError);
                    // Continuar para tentar a rota
                }
            }
            
            // Se não houver backup ou backup inválido, usar a rota
            if (!this.featureId) {
                throw new Error('Backup não encontrado e HASH ID não especificado na URL. Use ?id=HASH_ID ou tenha dados no backup.');
            }
            
            console.log('📡 Carregando dados da rota (backup não disponível)...');
            
            const response = await fetch(`${API_BASE_URL}/api/features/${this.featureId}`);
            
            if (!response.ok) {
                throw new Error(`Erro HTTP: ${response.status}`);
            }
            
            const data = await response.json();
            
            if (!data.success || !data.data) {
                throw new Error(data.message || 'Erro ao carregar documentação');
            }
            
            this.dados = data.data;
            
            // Atualizar nome da feature
            const featureNameEl = document.getElementById('feature-name');
            if (featureNameEl) {
                featureNameEl.textContent = this.dados.featureName || 'Documentação sem nome';
            }
            
            // Extrair casos de teste
            this.casosTeste = (this.dados.cenarios || []).map(cenario => {
                const codigoMatch = (cenario.titulo || '').match(/CT(\d+)/i);
                const codigo = codigoMatch ? codigoMatch[0] : null;
                return {
                    codigo: codigo,
                    titulo: cenario.titulo || '',
                    id: cenario.id
                };
            }).filter(ct => ct.codigo); // Filtrar apenas CTs com código válido
            
            // Obter resumo da feature
            this.resumoFeature = this.dados.resumoDescricaoProduto || this.dados.featureDescription || '';
            
            if (!this.resumoFeature || this.resumoFeature.trim().length === 0) {
                throw new Error('Resumo da feature não encontrado. É necessário ter um resumo gerado pela IA ou uma descrição da feature.');
            }
            
            if (this.casosTeste.length === 0) {
                throw new Error('Nenhum caso de teste encontrado na documentação.');
            }
            
            console.log('✅ Dados carregados da rota:', {
                featureName: this.dados.featureName,
                cenarios: this.casosTeste.length,
                temResumo: !!this.resumoFeature
            });
            
        } catch (error) {
            console.error('Erro ao carregar documentação:', error);
            throw error;
        }
    }

    async gerarRastreabilidade() {
        try {
            const loadingEl = document.getElementById('loading');
            if (loadingEl) {
                loadingEl.innerHTML = '<p>🤖 Gerando rastreabilidade de cobertura com IA...</p>';
            }
            
            // Tentar buscar casos de teste do backup no localStorage primeiro
            // Se não houver backup, usar dados carregados da API em this.dados.cenarios[]
            let cenariosCompletos = null;
            try {
                const backup = localStorage.getItem('backup');
                if (!backup) {
                    throw new Error('Backup não encontrado no localStorage');
                }
                
                const backupData = JSON.parse(backup);
                if (!backupData || !backupData.cenarios || !Array.isArray(backupData.cenarios) || backupData.cenarios.length === 0) {
                    throw new Error('Backup não contém cenarios válidos');
                }
                
                // Usar os cenarios completos do backup atualizado
                cenariosCompletos = backupData.cenarios;
                
                console.log('✅ Usando cenarios completos do backup atualizado:', cenariosCompletos.length, 'cenarios');
            } catch (backupError) {
                console.warn('⚠️ Backup não disponível, usando dados da API:', backupError);
                
                // Se não houver backup, usar dados carregados da API
                if (this.dados && this.dados.cenarios && Array.isArray(this.dados.cenarios) && this.dados.cenarios.length > 0) {
                    cenariosCompletos = this.dados.cenarios;
                    console.log('✅ Usando cenarios da API (sem backup):', cenariosCompletos.length, 'cenarios');
                } else {
                    console.error('❌ Erro: nem backup nem dados da API disponíveis');
                    this.mostrarErro('Erro ao carregar casos de teste. Por favor, recarregue a página.');
                    return;
                }
            }
            
            // Obter informações do localStorage para verificar se precisa gerar novo resumo
            // SEMPRE usar a versão mais atual do resumoDescricaoProduto
            const descricaoProdutoAtualizada = localStorage.getItem('descricaoProdutoAtualizada') === 'true';
            const resumoDescricaoProduto = localStorage.getItem('resumoDescricaoProduto') || null;
            const novoResumoDescricaoProduto = localStorage.getItem('novoResumoDescricaoProduto') || null;
            
            console.log('🔍 [Rastreabilidade] Usando resumoDescricaoProduto mais atual:', resumoDescricaoProduto ? `Sim (${resumoDescricaoProduto.length} caracteres)` : 'Não');
            
            // Obter contexto do backup ou do localStorage
            let contexto = null;
            if (this.dados) {
                // Tentar obter do backup primeiro
                contexto = this.dados.featureDescription || this.dados.feature_text || null;
            }
            
            // Se não encontrou no backup, tentar do localStorage
            if (!contexto || contexto.trim().length === 0) {
                const featureText = localStorage.getItem('feature-text-ai') || localStorage.getItem('feature-text') || '';
                contexto = featureText.trim().length > 0 ? featureText : null;
            }
            
            console.log('🔍 [Rastreabilidade] Contexto obtido:', contexto ? `Sim (${contexto.length} caracteres)` : 'Não');
            
            // Obter imagens do backup ou do localStorage (se disponível)
            let images = [];
            if (this.dados && this.dados.imagens_selecionadas && Array.isArray(this.dados.imagens_selecionadas)) {
                // Tentar obter imagens do backup (seria necessário converter para base64)
                // Por enquanto, vamos deixar vazio pois imagens do backup precisariam ser convertidas
                images = [];
            }
            
            console.log('🔍 [Rastreabilidade] Verificando condições para geração de resumo:');
            console.log('🔍 [Rastreabilidade] descricaoProdutoAtualizada:', descricaoProdutoAtualizada);
            console.log('🔍 [Rastreabilidade] novoResumoDescricaoProduto existe:', !!novoResumoDescricaoProduto);
            console.log('🔍 [Rastreabilidade] contexto disponível:', contexto ? `Sim (${contexto.length} caracteres)` : 'Não');
            console.log('🔍 [Rastreabilidade] images disponíveis:', images.length);
            
            // Preparar payload - SEMPRE usar cenarios completos do backup atualizado
            // Usar resumoDescricaoProduto mais atual (já atualizado antes de chamar esta função)
            const resumoFeatureParaUsar = resumoDescricaoProduto || this.resumoFeature;
            
            const payload = {
                resumoFeature: resumoFeatureParaUsar,
                casosTeste: cenariosCompletos, // SEMPRE usar cenarios do backup atualizado
                provider: 'openai',
                descricaoProdutoAtualizada: descricaoProdutoAtualizada,
                contexto: contexto,
                images: images,
                resumoDescricaoProduto: resumoDescricaoProduto,
                novoResumoDescricaoProduto: novoResumoDescricaoProduto
            };
            
            console.log('📤 [Rastreabilidade] Payload preparado:');
            console.log('📤 - resumoFeature:', resumoFeatureParaUsar ? `${resumoFeatureParaUsar.length} caracteres` : 'Não disponível');
            console.log('📤 - casosTeste:', cenariosCompletos ? `${cenariosCompletos.length} cenarios do backup` : 'Não disponível');
            console.log('📤 - descricaoProdutoAtualizada:', descricaoProdutoAtualizada);
            
            const response = await fetch(`${AI_API_BASE_URL}/api/rastreabilidade-cobertura`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(payload)
            });
            
            const data = await response.json();
            
            // Se o backend gerou um novo resumo, salvar no localStorage
            if (data.resumoDescricaoProduto && descricaoProdutoAtualizada) {
                localStorage.setItem('novoResumoDescricaoProduto', data.resumoDescricaoProduto);
                console.log('✅ [Rastreabilidade] Novo resumo da descrição do produto salvo em novoResumoDescricaoProduto (localStorage)');
                console.log('✅ [Rastreabilidade] Tamanho do novo resumo:', data.resumoDescricaoProduto.length, 'caracteres');
                console.log('✅ [Rastreabilidade] Primeiros 200 caracteres:', data.resumoDescricaoProduto.substring(0, 200) + '...');
            }
            
            // Log completo da resposta da API
            console.log('📥 Resposta completa da API de rastreabilidade:', JSON.stringify(data, null, 2));
            
            if (!response.ok) {
                throw new Error(data.error || 'Erro ao gerar rastreabilidade');
            }
            
            if (!data.success || !data.rastreabilidade) {
                throw new Error('Resposta inválida da API');
            }
            
            this.rastreabilidade = data.rastreabilidade;
            this.porcentagemCobertura = data.porcentagemCobertura || null;
            this.casosIrrelevantes = data.casosIrrelevantes || [];
            
            // Log detalhado da rastreabilidade recebida
            console.log('📊 Rastreabilidade recebida:', this.rastreabilidade);
            console.log('📊 Porcentagem de cobertura:', this.porcentagemCobertura);
            
            // Verificar sugestões em cada comportamento
            this.rastreabilidade.forEach((item, index) => {
                if (item.comportamentos && Array.isArray(item.comportamentos)) {
                    item.comportamentos.forEach((comportamento, compIndex) => {
                        if (comportamento.sugestoes && Array.isArray(comportamento.sugestoes) && comportamento.sugestoes.length > 0) {
                            console.log(`✅ Sugestões encontradas no tópico ${index}, comportamento ${compIndex}:`, comportamento.sugestoes);
                        } else {
                            console.log(`ℹ️ Sem sugestões no tópico ${index}, comportamento ${compIndex}`);
                        }
                    });
                }
            });
            
            // Atualizar this.casosTeste com a lista atualizada dos cenarios do backup
            this.casosTeste = cenariosCompletos.map(cenario => {
                const codigoMatch = (cenario.titulo || '').match(/CT(\d+)/i);
                const codigo = codigoMatch ? codigoMatch[0] : null;
                return {
                    codigo: codigo,
                    titulo: cenario.titulo || '',
                    id: cenario.id
                };
            }).filter(ct => ct.codigo); // Filtrar apenas CTs com código válido
            
            // Armazenar no localStorage para variáveis de cobertura
            if (this.porcentagemCobertura !== null) {
                const porcentagem = parseFloat(this.porcentagemCobertura);
                if (!isNaN(porcentagem)) {
                    // Salvar com chave genérica (sem tipo específico)
                    localStorage.setItem('cobertura', porcentagem.toString());
                    console.log(`✅ Porcentagem de cobertura armazenada no localStorage: cobertura = ${porcentagem}%`);
                    
                    // Enviar mensagem para a janela pai (se existir) para atualizar o elemento
                    if (typeof window.opener !== 'undefined' && window.opener && !window.opener.closed) {
                        try {
                            window.opener.postMessage({
                                type: 'coberturaAtualizada',
                                porcentagem: porcentagem
                            }, '*');
                            console.log('✅ Mensagem enviada para janela pai para atualizar cobertura');
                        } catch (error) {
                            console.warn('⚠️ Erro ao enviar mensagem para janela pai:', error);
                        }
                    }
                }
            }
            
            // Ocultar loading e exibir resultados
            if (loadingEl) {
                loadingEl.style.display = 'none';
            }
            
            this.exibirRastreabilidade();
            
        } catch (error) {
            console.error('Erro ao gerar rastreabilidade:', error);
            throw error;
        }
    }

    exibirRastreabilidade() {
        const contentEl = document.getElementById('rastreabilidade-content');
        if (!contentEl) return;
        
        if (!this.rastreabilidade || this.rastreabilidade.length === 0) {
            contentEl.innerHTML = '<div class="empty-state" data-cy="empty-state">Nenhuma rastreabilidade encontrada.</div>';
            contentEl.style.display = 'block';
            return;
        }
        
        // Criar mapa de CTs para tooltips
        const ctsMap = {};
        this.casosTeste.forEach(ct => {
            if (ct.codigo) {
                ctsMap[ct.codigo.toUpperCase()] = ct.titulo;
            }
        });
        
        // Calcular estatísticas
        // Contar tópicos principais e comportamentos
        let totalTopicosPrincipais = this.rastreabilidade.length;
        let totalComportamentos = 0;
        this.rastreabilidade.forEach(item => {
            if (item.comportamentos && Array.isArray(item.comportamentos) && item.comportamentos.length > 0) {
                totalComportamentos += item.comportamentos.length;
            } else {
                totalComportamentos += 1;
            }
        });
        
        // Preparar HTML da porcentagem de cobertura
        let coberturaHtml = '';
        if (this.porcentagemCobertura !== null && this.porcentagemCobertura !== undefined) {
            const porcentagem = parseFloat(this.porcentagemCobertura);
            let classeCobertura = 'cobertura-baixa';
            if (porcentagem >= 80) {
                classeCobertura = 'cobertura-alta';
            } else if (porcentagem >= 50) {
                classeCobertura = 'cobertura-media';
            }
            coberturaHtml = ` | <span class="cobertura-badge ${classeCobertura}">🎯 ${porcentagem.toFixed(1)}% de cobertura</span>`;
        }
        
        // Verificar se há sugestões para exibir o botão
        let temSugestoes = false;
        this.rastreabilidade.forEach(item => {
            if (item.comportamentos && Array.isArray(item.comportamentos)) {
                item.comportamentos.forEach(comportamento => {
                    // Verificar sugestões de novos casos
                    if (comportamento.sugestoes && Array.isArray(comportamento.sugestoes) && comportamento.sugestoes.length > 0) {
                        temSugestoes = true;
                    }
                    // Verificar sugestões de atualização
                    if (comportamento.sugestoesAtualizacao && Array.isArray(comportamento.sugestoesAtualizacao) && comportamento.sugestoesAtualizacao.length > 0) {
                        temSugestoes = true;
                    }
                });
            }
        });
        
        const botaoAplicarHtml = temSugestoes ? 
            ` <button id="btn-aplicar-sugeridos" class="btn-aplicar-sugeridos" onclick="rastreabilidadeCobertura.aplicarSugestoes()" data-cy="btn-aplicar-sugeridos">✅ Aplicar sugeridos</button>` : '';
        
        let html = '';
        
        // Adicionar seção de casos irrelevantes no início com collapse (apenas para prompt de comparação)
        if (this.casosIrrelevantes && this.casosIrrelevantes.length > 0) {
            html += `
                <div id="casos-nao-vinculados-section" class="casos-nao-vinculados-container" style="margin-bottom: 20px; padding: 20px; background: #fff3e0; border-left: 4px solid #ff9800; border-radius: 4px;" data-cy="casos-nao-vinculados-section">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px;">
                        <h4 style="color: #e65100; margin: 0; cursor: pointer;" onclick="rastreabilidadeCobertura.toggleCasosNaoVinculados()" data-cy="casos-nao-vinculados-title">
                            ⚠️ Casos de Teste Não Vinculados <span id="casos-nao-vinculados-count" data-cy="casos-nao-vinculados-count">(${this.casosIrrelevantes.length})</span>
                            <span id="casos-nao-vinculados-arrow" style="font-size: 12px;" data-cy="casos-nao-vinculados-arrow">▶</span>
                        </h4>
                        <button id="btn-deletar-nao-vinculados" class="btn-deletar-nao-vinculados" onclick="rastreabilidadeCobertura.deletarCasosNaoVinculados()" style="display: none; background: #dc3545; color: white; border: none; padding: 8px 16px; border-radius: 4px; cursor: pointer; font-size: 12px;" data-cy="btn-deletar-nao-vinculados">
                            🗑️ Deletar Selecionados
                        </button>
                    </div>
                    <div id="casos-nao-vinculados-content" style="display: none;" data-cy="casos-nao-vinculados-content">
                        <p style="color: #e65100; font-size: 14px; margin-bottom: 10px;" data-cy="casos-nao-vinculados-description">Os seguintes casos de teste não possuem vínculo com nenhum tópico ou comportamento do resumo atual:</p>
                        <div style="display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 10px;">
            `;
            
            this.casosIrrelevantes.forEach((casoIrrelevante, index) => {
                // casoIrrelevante já vem no formato "CT090 - Título completo"
                const casoTexto = typeof casoIrrelevante === 'string' ? casoIrrelevante : (casoIrrelevante.codigo || casoIrrelevante);
                
                // Extrair código do CT do formato "CT090 - Título completo"
                const codigoMatch = casoTexto.match(/^(CT\d+)/i);
                const ctCodigo = codigoMatch ? codigoMatch[1] : casoTexto;
                const ctCodigoUpper = ctCodigo.toUpperCase();
                
                // Encontrar o ID do caso de teste no backup
                const casoTeste = this.casosTeste.find(ct => {
                    const codigoMatchCT = (ct.codigo || '').match(/^(CT\d+)/i);
                    return codigoMatchCT && codigoMatchCT[1].toUpperCase() === ctCodigoUpper;
                });
                const casoId = casoTeste ? casoTeste.id : null;
                
                html += `
                    <div class="caso-nao-vinculado-item" style="background: #fff3e0; border-left: 4px solid #ff9800; color: #e65100; padding: 10px; margin-bottom: 8px; border-radius: 4px; display: flex; align-items: center; gap: 8px;" data-cy="caso-nao-vinculado-item">
                        <input type="checkbox" class="checkbox-caso-nao-vinculado" id="checkbox-caso-nao-vinculado-${index}" data-ct-codigo="${ctCodigoUpper}" data-ct-id="${casoId || ''}" onchange="rastreabilidadeCobertura.atualizarBotaoDeletarNaoVinculados()" data-cy="checkbox-caso-nao-vinculado">
                        <span style="font-weight: bold; color: #e65100;">${ctCodigoUpper}</span>
                        <span style="margin-left: 8px; color: #e65100;">${this.escapeHtml(casoTexto.replace(/^CT\d+\s*-\s*/i, '').trim())}</span>
                    </div>
                `;
            });
            
            html += `
                        </div>
                        <div style="margin-top: 10px;">
                            <button onclick="rastreabilidadeCobertura.selecionarTodosCasosNaoVinculados()" style="background: transparent; border: 1px solid #ff9800; color: #e65100; padding: 6px 12px; border-radius: 4px; cursor: pointer; font-size: 12px;" data-cy="btn-selecionar-todos-nao-vinculados">
                                Selecionar Todos
                            </button>
                        </div>
                    </div>
                </div>
            `;
        }
        
        html += `
            <div class="stats-bar" data-cy="stats-bar">
                <strong>📊 Estatísticas:</strong> ${totalTopicosPrincipais} contexto(s) | ${totalComportamentos} tópico(s) | ${this.casosTeste.length} caso(s) de teste${coberturaHtml}${botaoAplicarHtml}
            </div>
            <div class="mindmap-container" data-cy="mindmap-container">
        `;
        
        // Agrupar por contexto (tópico principal)
        this.rastreabilidade.forEach((item, index) => {
            // Tentar obter contexto de diferentes campos possíveis
            let contexto = item.contexto || item.topico || item.tópico || item.topicoPrincipal || null;
            
            // Log para debug
            console.log(`🔍 Item ${index}:`, {
                contexto: item.contexto,
                topico: item.topico,
                tópico: item.tópico,
                topicoPrincipal: item.topicoPrincipal,
                contextoFinal: contexto
            });
            
            // Se não houver contexto, tentar limpar o topico para ver se há algo útil
            if (!contexto) {
                const topicoRaw = item.topico || item.tópico || '';
                contexto = this.limparTopico(topicoRaw);
            } else {
                // Limpar contexto apenas se não for null
                const contextoLimpo = this.limparTopico(contexto);
                // Se limparTopico retornar null mas tínhamos um contexto, usar o original
                contexto = contextoLimpo || contexto;
            }
            
            // Se ainda não houver contexto, usar um padrão baseado no índice
            if (!contexto || contexto.trim() === '') {
                contexto = `Contexto ${index + 1}`;
            }
            
            console.log(`✅ Contexto final para item ${index}:`, contexto);
            
            // Suportar novo formato com comportamentos
            if (item.comportamentos && Array.isArray(item.comportamentos) && item.comportamentos.length > 0) {
                // Novo formato: contexto com tópicos (comportamentos) dentro
                html += `
                    <div class="contexto-container" data-cy="contexto-container">
                `;
                
                // Sempre exibir cabeçalho de contexto
                html += `
                    <div class="contexto-header" data-cy="contexto-header">
                        <h3 class="contexto-titulo" data-cy="contexto-titulo">${this.escapeHtml(contexto)}</h3>
                    </div>
                `;
                
                html += `
                        <div class="topicos-container" data-cy="topicos-container">
                `;
                
                item.comportamentos.forEach((comportamento, compIndex) => {
                    const topicoDescricao = comportamento.descricao || 'Comportamento sem descrição';
                    const casosTeste = comportamento.casosTeste || [];
                    const sugestoes = comportamento.sugestoes || [];
                    const sugestoesAtualizacao = comportamento.sugestoesAtualizacao || [];
                    const naoCoberto = !casosTeste || casosTeste.length === 0;
                    const classeNaoCoberto = naoCoberto ? ' nao-coberto' : '';
                    
                    // Log para debug
                    if (sugestoes.length > 0) {
                        console.log(`🎯 Exibindo ${sugestoes.length} sugestão(ões) para comportamento: ${topicoDescricao}`, sugestoes);
                    }
                    if (sugestoesAtualizacao.length > 0) {
                        console.log(`✅ Exibindo ${sugestoesAtualizacao.length} sugestão(ões) de atualização para comportamento: ${topicoDescricao}`, sugestoesAtualizacao);
                    }
                    
                    html += `
                        <div class="topico-segmento${classeNaoCoberto}" data-cy="topico-segmento">
                            <div class="topico-segmento-header" data-cy="topico-segmento-header">
                                <span class="topico-segmento-titulo" data-cy="topico-segmento-titulo">${this.escapeHtml(topicoDescricao)}</span>
                            </div>
                            <div class="topico-segmento-cts" data-cy="topico-segmento-cts">
                    `;
                    
                    if (casosTeste.length === 0) {
                        html += '<span class="sem-ct" data-cy="sem-ct">Nenhum caso de teste</span>';
                    } else {
                        casosTeste.forEach(ctCodigo => {
                            const ctCodigoUpper = ctCodigo.toUpperCase();
                            const titulo = ctsMap[ctCodigoUpper] || 'Título não encontrado';
                            
                            html += `
                                <div class="ct-badge-small" data-ct="${ctCodigoUpper}" data-cy="ct-badge">
                                    ${ctCodigoUpper}
                                    <div class="tooltip" data-cy="ct-tooltip">${this.escapeHtml(titulo)}</div>
                                </div>
                            `;
                        });
                    }
                    
                    html += `
                            </div>
                    `;
                    
                    // Adicionar sugestões de atualização se houver
                    if (sugestoesAtualizacao.length > 0) {
                        html += `
                            <div class="sugestoes-atualizacao-container" style="margin-top: 10px;" data-cy="sugestoes-atualizacao-container">
                                <strong style="color: #1565c0; font-size: 12px;" data-cy="sugestoes-atualizacao-title">🔄 Sugestões de atualização:</strong>
                        `;
                        
                        sugestoesAtualizacao.forEach((sugestao, sugIndex) => {
                            const sugestaoId = `sugestao-atualizacao-${index}-${compIndex}-${sugIndex}`;
                            const sugestaoTexto = typeof sugestao === 'string' ? sugestao : (sugestao.titulo || sugestao);
                            
                            html += `
                                <div class="sugestao-item" style="background: #e3f2fd; border-left: 4px solid #2196f3; color: #1565c0;" data-cy="sugestao-atualizacao-item">
                                    <input type="checkbox" id="${sugestaoId}" class="sugestao-checkbox" checked data-sugestao="${this.escapeHtml(sugestaoTexto)}" data-cy="checkbox-sugestao-atualizacao">
                                    <label for="${sugestaoId}" class="sugestao-label" style="color: #1565c0;" data-cy="label-sugestao-atualizacao">${this.escapeHtml(sugestaoTexto)}</label>
                                </div>
                            `;
                        });
                        
                        html += `
                            </div>
                        `;
                    }
                    
                    // Adicionar sugestões se houver
                    if (sugestoes.length > 0) {
                        html += `
                            <div class="sugestoes-container" data-cy="sugestoes-container">
                                <strong style="color: #1565c0; font-size: 12px;" data-cy="sugestoes-title">🔄 Sugestões para Adicionar:</strong>
                        `;
                        
                        sugestoes.forEach((sugestao, sugIndex) => {
                            const sugestaoId = `sugestao-${index}-${compIndex}-${sugIndex}`;
                            const sugestaoTexto = typeof sugestao === 'string' ? sugestao : (sugestao.titulo || sugestao);
                            
                            html += `
                                <div class="sugestao-item" style="background: #ffebee; border-left: 4px solid #f44336; color: #c62828;" data-cy="sugestao-item">
                                    <input type="checkbox" id="${sugestaoId}" class="sugestao-checkbox" checked data-sugestao="${this.escapeHtml(sugestaoTexto)}" data-cy="checkbox-sugestao">
                                    <label for="${sugestaoId}" class="sugestao-label" style="color: #c62828;" data-cy="label-sugestao">${this.escapeHtml(sugestaoTexto)}</label>
                                </div>
                            `;
                        });
                        
                        html += `
                            </div>
                        `;
                    }
                    
                    html += `
                        </div>
                    `;
                });
                
                html += `
                        </div>
                    </div>
                `;
            } else {
                // Formato antigo: casosTeste direto no item
                const casosTeste = item.casosTeste || item.casos_teste || [];
                
                html += `
                    <div class="contexto-container" data-cy="contexto-container">
                `;
                
                // Sempre exibir cabeçalho de contexto
                html += `
                    <div class="contexto-header" data-cy="contexto-header">
                        <h3 class="contexto-titulo" data-cy="contexto-titulo">${this.escapeHtml(contexto)}</h3>
                    </div>
                `;
                
                html += `
                        <div class="topicos-container" data-cy="topicos-container">
                            <div class="topico-segmento" data-cy="topico-segmento">
                                <div class="topico-segmento-cts" data-cy="topico-segmento-cts">
                `;
                
                if (casosTeste.length === 0) {
                    html += '<span class="sem-ct" data-cy="sem-ct">Nenhum caso de teste</span>';
                } else {
                    casosTeste.forEach(ctCodigo => {
                        const ctCodigoUpper = ctCodigo.toUpperCase();
                        const titulo = ctsMap[ctCodigoUpper] || 'Título não encontrado';
                        
                        html += `
                            <div class="ct-badge-small" data-ct="${ctCodigoUpper}" data-cy="ct-badge">
                                ${ctCodigoUpper}
                                <div class="tooltip" data-cy="ct-tooltip">${this.escapeHtml(titulo)}</div>
                            </div>
                        `;
                    });
                }
                
                html += `
                                </div>
                            </div>
                        </div>
                    </div>
                `;
            }
        });
        
        html += '</div>';
        
        contentEl.innerHTML = html;
        contentEl.style.display = 'block';
        
        // Inicializar botão de deletar (oculto por padrão)
        this.atualizarBotaoDeletarNaoVinculados();
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    limparTopico(topico) {
        if (!topico) return topico;
        // Remover textos específicos do nome do tópico apenas se houver conteúdo adicional
        let topicoLimpo = topico
            .replace(/^Funcionalidades Principais\s*[-:]\s*/i, '')
            .replace(/^Regras de Negócio Críticas\s*[-:]\s*/i, '')
            .replace(/\s*Funcionalidades Principais\s*/gi, '')
            .replace(/\s*Regras de Negócio Críticas\s*/gi, '')
            .trim();
        // Se ficou vazio após limpeza, retornar o original
        if (!topicoLimpo || topicoLimpo === '') {
            return topico.trim();
        }
        // Se contém apenas esses textos genéricos, manter o texto original
        if (topicoLimpo.toLowerCase() === 'funcionalidades principais' || 
            topicoLimpo.toLowerCase() === 'regras de negócio críticas') {
            return topico.trim();
        }
        return topicoLimpo;
    }

    mostrarErro(mensagem) {
        const loadingEl = document.getElementById('loading');
        const errorEl = document.getElementById('error');
        const contentEl = document.getElementById('rastreabilidade-content');
        
        if (loadingEl) {
            loadingEl.style.display = 'none';
        }
        
        if (errorEl) {
            errorEl.textContent = mensagem;
            errorEl.style.display = 'block';
        }
        
        if (contentEl) {
            contentEl.style.display = 'none';
        }
    }

    async aplicarSugestoes() {
        try {
            // Coletar todas as sugestões selecionadas
            const checkboxes = document.querySelectorAll('.sugestao-checkbox:checked');
            if (checkboxes.length === 0) {
                this.mostrarToast('❌ Nenhuma sugestão selecionada', 'error');
                return;
            }
            
            // Separar sugestões de atualização das sugestões de novos casos
            const sugestoesAtualizacao = [];
            const sugestoesNovos = [];
            
            checkboxes.forEach(cb => {
                const sugestao = cb.getAttribute('data-sugestao');
                const sugestaoId = cb.id;
                
                // Verificar se é uma sugestão de atualização pelo ID do checkbox
                if (sugestaoId.includes('sugestao-atualizacao')) {
                    sugestoesAtualizacao.push(sugestao);
                } else {
                    sugestoesNovos.push(sugestao);
                }
            });
            
            // Carregar backup atual
            const backup = localStorage.getItem('backup');
            if (!backup) {
                this.mostrarToast('❌ Backup não encontrado no localStorage', 'error');
                return;
            }
            
            const backupData = JSON.parse(backup);
            if (!backupData.cenarios) {
                backupData.cenarios = [];
            }
            
            let ctsAtualizados = 0;
            let ctsAdicionados = 0;
            
            // Processar sugestões de atualização primeiro
            sugestoesAtualizacao.forEach(sugestao => {
                // Extrair código do CT do formato "CT002 - Título atualizado"
                const codigoMatch = sugestao.match(/^(CT\d+)/i);
                if (codigoMatch) {
                    const ctCodigo = codigoMatch[1].toUpperCase();
                    // Extrair apenas o número do código (ex: "002" de "CT002")
                    const numeroMatch = ctCodigo.match(/CT(\d+)/i);
                    if (numeroMatch) {
                        const numeroCT = parseInt(numeroMatch[1], 10);
                        
                        // Encontrar o cenário correspondente pelo número do CT no título
                        const cenario = backupData.cenarios.find(c => {
                            const codigoMatchCenario = (c.titulo || '').match(/CT(\d+)/i);
                            return codigoMatchCenario && parseInt(codigoMatchCenario[1], 10) === numeroCT;
                        });
                        
                        if (cenario) {
                            // Atualizar título mantendo o código do CT
                            cenario.titulo = sugestao; // Já vem no formato "CT002 - Título atualizado"
                            ctsAtualizados++;
                            console.log(`✅ Título atualizado para ${ctCodigo}: ${sugestao}`);
                        } else {
                            console.warn(`⚠️ CT ${ctCodigo} não encontrado para atualização`);
                        }
                    }
                }
            });
            
            // Processar sugestões de novos casos de teste
            if (sugestoesNovos.length > 0) {
                // Encontrar próximo ID disponível
                const proximoId = backupData.cenarios.length > 0 
                    ? Math.max(...backupData.cenarios.map(c => c.id || 0)) + 1 
                    : 1;
                
                // Obter tipo de teste atual do localStorage ou usar 'funcional' como padrão
                const testType = localStorage.getItem('ai-test-type') || 'funcional';
                
                sugestoesNovos.forEach((sugestao, index) => {
                    const novoId = proximoId + index;
                    const idFormatado = String(novoId).padStart(3, '0');
                    
                    // Extrair título da sugestão (pode vir como "CT010 - Título" ou apenas "Título")
                    let novoTitulo = sugestao;
                    if (novoTitulo && novoTitulo.includes(' - ')) {
                        const tituloSemPrefixo = novoTitulo.replace(/^CT\d+\s*-\s*/i, '');
                        novoTitulo = `CT${idFormatado} - ${tituloSemPrefixo}`;
                    } else {
                        novoTitulo = `CT${idFormatado} - ${novoTitulo}`;
                    }
                    
                    const novoCenario = {
                        id: novoId,
                        titulo: novoTitulo,
                        precondicoes: '',
                        passos: '',
                        resultadoEsperado: '',
                        status: 'na',
                        arquivos: [],
                        posicao: backupData.cenarios.length + index + 1,
                        fonte: 'IA',
                        tipo: testType
                    };
                    
                    backupData.cenarios.push(novoCenario);
                    ctsAdicionados++;
                });
                
                // Marcar que CTs foram adicionados para próxima análise de cobertura
                const tipoParaCobertura = testType === 'indefinido' ? 'funcional' : testType;
                const chaveCtsAdicionados = `cts_adicionados_${tipoParaCobertura.toLowerCase()}`;
                localStorage.setItem(chaveCtsAdicionados, 'true');
            }
            
            // Salvar backup atualizado PRIMEIRO
            localStorage.setItem('backup', JSON.stringify(backupData));
            
            // Atualizar resumoDescricaoProduto com novoResumoDescricaoProduto antes de fazer a request
            const novoResumoDescricaoProduto = localStorage.getItem('novoResumoDescricaoProduto');
            if (novoResumoDescricaoProduto) {
                localStorage.setItem('resumoDescricaoProduto', novoResumoDescricaoProduto);
                console.log('✅ resumoDescricaoProduto atualizado com novoResumoDescricaoProduto antes de gerar rastreabilidade');
            }
            
            // Ao aplicar sugestões, próxima cobertura será SEM comparação
            localStorage.setItem('descricaoProdutoAtualizada', 'false');
            console.log('✅ descricaoProdutoAtualizada definido como false (próxima cobertura sem comparação)');
            
            // Enviar mensagem para a janela pai (template) para atualizar
            if (typeof window.opener !== 'undefined' && window.opener && !window.opener.closed) {
                try {
                    if (ctsAdicionados > 0) {
                        const testType = localStorage.getItem('ai-test-type') || 'funcional';
                        window.opener.postMessage({
                            type: 'casosTesteAdicionados',
                            quantidade: ctsAdicionados,
                            testType: testType
                        }, '*');
                        console.log('✅ Mensagem enviada para janela pai para atualizar casos de teste adicionados');
                    }
                    
                    if (ctsAtualizados > 0) {
                        window.opener.postMessage({
                            type: 'casosTesteAtualizados',
                            quantidade: ctsAtualizados
                        }, '*');
                        console.log('✅ Mensagem enviada para janela pai para atualizar casos de teste atualizados');
                    }
                } catch (error) {
                    console.warn('⚠️ Erro ao enviar mensagem para janela pai:', error);
                }
            }
            
            // Mostrar mensagem de sucesso
            let mensagemSucesso = '';
            if (ctsAtualizados > 0 && ctsAdicionados > 0) {
                mensagemSucesso = `✅ ${ctsAtualizados} caso(s) de teste atualizado(s) e ${ctsAdicionados} caso(s) de teste adicionado(s) com sucesso!`;
            } else if (ctsAtualizados > 0) {
                mensagemSucesso = `✅ ${ctsAtualizados} caso(s) de teste atualizado(s) com sucesso!`;
            } else if (ctsAdicionados > 0) {
                mensagemSucesso = `✅ ${ctsAdicionados} caso(s) de teste adicionado(s) com sucesso!`;
            } else {
                mensagemSucesso = '✅ Operação concluída!';
            }
            mensagemSucesso += '\nVolte para a tela de edição da documentação.';
            this.mostrarToast(mensagemSucesso, 'success');
            
            // Não recarregar rastreabilidade automaticamente após aplicar sugestões
            
        } catch (error) {
            console.error('Erro ao aplicar sugestões:', error);
            this.mostrarToast('❌ Erro ao aplicar sugestões: ' + error.message, 'error');
        }
    }

    toggleCasosNaoVinculados() {
        const content = document.getElementById('casos-nao-vinculados-content');
        const arrow = document.getElementById('casos-nao-vinculados-arrow');
        if (content && arrow) {
            const isVisible = content.style.display !== 'none';
            content.style.display = isVisible ? 'none' : 'block';
            arrow.textContent = isVisible ? '▶' : '▼';
        }
    }
    
    selecionarTodosCasosNaoVinculados() {
        const checkboxes = document.querySelectorAll('.checkbox-caso-nao-vinculado');
        const todosSelecionados = Array.from(checkboxes).every(cb => cb.checked);
        
        checkboxes.forEach(cb => {
            cb.checked = !todosSelecionados;
        });
        
        this.atualizarBotaoDeletarNaoVinculados();
    }
    
    atualizarBotaoDeletarNaoVinculados() {
        const checkboxes = document.querySelectorAll('.checkbox-caso-nao-vinculado:checked');
        const btnDeletar = document.getElementById('btn-deletar-nao-vinculados');
        
        if (btnDeletar) {
            btnDeletar.style.display = checkboxes.length > 0 ? 'block' : 'none';
        }
    }
    
    async deletarCasosNaoVinculados() {
        try {
            const checkboxes = document.querySelectorAll('.checkbox-caso-nao-vinculado:checked');
            if (checkboxes.length === 0) {
                this.mostrarToast('❌ Nenhum caso de teste selecionado', 'error');
                return;
            }
            
            // Coletar IDs dos casos selecionados
            const idsParaDeletar = Array.from(checkboxes)
                .map(cb => {
                    const ctId = cb.getAttribute('data-ct-id');
                    return ctId ? parseInt(ctId) : null;
                })
                .filter(id => id !== null);
            
            if (idsParaDeletar.length === 0) {
                this.mostrarToast('❌ Não foi possível identificar os IDs dos casos de teste', 'error');
                return;
            }
            
            // Carregar backup atual
            const backup = localStorage.getItem('backup');
            if (!backup) {
                this.mostrarToast('❌ Backup não encontrado no localStorage', 'error');
                return;
            }
            
            const backupData = JSON.parse(backup);
            if (!backupData.cenarios) {
                backupData.cenarios = [];
            }
            
            // Filtrar cenários para remover os selecionados
            const cenariosAntes = backupData.cenarios.length;
            backupData.cenarios = backupData.cenarios.filter(c => !idsParaDeletar.includes(c.id));
            const cenariosDepois = backupData.cenarios.length;
            const quantidadeDeletados = cenariosAntes - cenariosDepois;
            
            if (quantidadeDeletados === 0) {
                this.mostrarToast('❌ Nenhum caso de teste foi deletado. Verifique se os CTs existem.', 'error');
                return;
            }
            
            // Salvar backup atualizado PRIMEIRO
            localStorage.setItem('backup', JSON.stringify(backupData));
            
            // Atualizar resumoDescricaoProduto com novoResumoDescricaoProduto antes de fazer a request
            const novoResumoDescricaoProduto = localStorage.getItem('novoResumoDescricaoProduto');
            if (novoResumoDescricaoProduto) {
                localStorage.setItem('resumoDescricaoProduto', novoResumoDescricaoProduto);
                console.log('✅ resumoDescricaoProduto atualizado com novoResumoDescricaoProduto antes de gerar rastreabilidade');
            }
            
            // Ao deletar casos não vinculados, próxima cobertura será COM comparação
            localStorage.setItem('descricaoProdutoAtualizada', 'true');
            console.log('✅ descricaoProdutoAtualizada mantido como true (próxima cobertura com comparação)');
            
            // Enviar mensagem para a janela pai (template) para atualizar
            if (typeof window.opener !== 'undefined' && window.opener && !window.opener.closed) {
                try {
                    window.opener.postMessage({
                        type: 'casosTesteDeletados',
                        quantidade: quantidadeDeletados,
                        ids: idsParaDeletar
                    }, '*');
                    console.log('✅ Mensagem enviada para janela pai para atualizar casos de teste deletados');
                } catch (error) {
                    console.warn('⚠️ Erro ao enviar mensagem para janela pai:', error);
                }
            }
            
            // Mostrar toast de sucesso no canto superior direito
            this.mostrarToast(`✅ ${quantidadeDeletados} caso(s) de teste deletado(s) com sucesso!`, 'success');
            
            // Ocultar a seção de casos não vinculados
            const section = document.getElementById('casos-nao-vinculados-section');
            if (section) {
                section.style.display = 'none';
            }
            
            // Atualizar lista de casos irrelevantes removendo os deletados
            this.casosIrrelevantes = this.casosIrrelevantes.filter(casoIrrelevante => {
                const casoTexto = typeof casoIrrelevante === 'string' ? casoIrrelevante : (casoIrrelevante.codigo || casoIrrelevante);
                const codigoMatch = casoTexto.match(/^(CT\d+)/i);
                const ctCodigo = codigoMatch ? codigoMatch[1] : casoTexto;
                const ctCodigoUpper = ctCodigo.toUpperCase();
                
                // Verificar se o ID deste caso está na lista de deletados
                const casoTeste = this.casosTeste.find(ct => {
                    const codigoMatchCT = (ct.codigo || '').match(/^(CT\d+)/i);
                    return codigoMatchCT && codigoMatchCT[1].toUpperCase() === ctCodigoUpper;
                });
                
                return !casoTeste || !idsParaDeletar.includes(casoTeste.id);
            });
            
            // Não recarregar rastreabilidade automaticamente após deletar casos não vinculados
            
        } catch (error) {
            console.error('Erro ao deletar casos não vinculados:', error);
            this.mostrarToast('❌ Erro ao deletar casos de teste: ' + error.message, 'error');
        }
    }

    mostrarToast(mensagem, tipo = 'success') {
        // Remover toast existente se houver
        const toastExistente = document.getElementById('toast-rastreabilidade');
        if (toastExistente) {
            toastExistente.remove();
        }
        
        // Criar novo toast
        const toast = document.createElement('div');
        toast.id = 'toast-rastreabilidade';
        toast.className = `toast toast-${tipo}`;
        toast.style.whiteSpace = 'pre-line'; // Permitir quebras de linha
        toast.textContent = mensagem;
        
        // Adicionar ao body
        document.body.appendChild(toast);
        
        // Mostrar toast
        setTimeout(() => {
            toast.classList.add('show');
        }, 100);
        
        // Remover toast após 3 segundos
        setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => {
                if (toast.parentNode) {
                    toast.parentNode.removeChild(toast);
                }
            }, 300);
        }, 3000);
    }

}

// Inicializar quando a página carregar
let rastreabilidadeCobertura;
document.addEventListener('DOMContentLoaded', () => {
    rastreabilidadeCobertura = new RastreabilidadeCobertura();
});

