// Script para visualização de documentação de teste
// Carrega dados de uma documentação específica e exibe na página

class DocumentacaoViewer {
    constructor() {
        this.dados = null;
        this.init();
    }

    async init() {
        try {
            // Obter nome do arquivo da URL
            const urlParams = new URLSearchParams(window.location.search);
            const arquivo = urlParams.get('file');
            
            if (!arquivo) {
                this.mostrarErro('Arquivo não especificado na URL');
                return;
            }

            // Carregar dados da documentação
            await this.carregarDocumentacao(arquivo);
            
            // Exibir dados na página
            this.exibirDocumentacao();
            
        } catch (error) {
            console.error('Erro ao inicializar visualizador:', error);
            this.mostrarErro('Erro ao carregar documentação: ' + error.message);
        }
    }

    async carregarDocumentacao(arquivo) {
        try {
            // Extrair ID da feature (remover .html se existir ou usar direto)
            const featureId = arquivo.replace('.html', '').split('/').pop();
            const response = await fetch(`/api/features/${featureId}`);
            
            if (!response.ok) {
                throw new Error(`Erro HTTP: ${response.status}`);
            }
            
            const data = await response.json();
            
            if (!data.success) {
                throw new Error(data.message || 'Erro ao carregar documentação');
            }
            
            this.dados = data.data;
            
        } catch (error) {
            console.error('Erro ao carregar documentação:', error);
            throw error;
        }
    }

    exibirDocumentacao() {
        if (!this.dados) {
            this.mostrarErro('Dados da documentação não disponíveis');
            return;
        }

        // Exibir informações básicas
        this.exibirInformacoesBasicas();
        
        // Exibir cenários de teste
        this.exibirCenarios();
        
        // Exibir bugs se houver
        this.exibirBugs();
        
        // Exibir anexos
        this.exibirAnexos();
        
        // Atualizar resumo
        this.atualizarResumo();
    }

    exibirInformacoesBasicas() {
        // Converter data de criação para formato brasileiro se necessário
        let dataCriacao = this.dados.creationDate || '-';
        if (dataCriacao !== '-' && dataCriacao.includes('-')) {
            // Converter de YYYY-MM-DD para DD/MM/YYYY
            const partes = dataCriacao.split('-');
            dataCriacao = `${partes[2]}/${partes[1]}/${partes[0]}`;
        }
        
        // Converter data de atualização para formato brasileiro se necessário
        let ultimaAtualizacao = this.dados.updateDate || this.dados.creationDate || '-';
        if (ultimaAtualizacao !== '-' && ultimaAtualizacao.includes('-')) {
            // Converter de YYYY-MM-DD para DD/MM/YYYY
            const partes = ultimaAtualizacao.split('-');
            ultimaAtualizacao = `${partes[2]}/${partes[1]}/${partes[0]}`;
        }
        
        const elementos = {
            'feature-name': this.dados.featureName || 'Nome não definido',
            'data-teste': dataCriacao,
            'ultima-atualizacao': ultimaAtualizacao,
            'testador': this.dados.tester || '-',
            'ambiente': this.dados.environment || '-',
            'navegador': this.dados.browser || '-',
            'dispositivo': this.dados.device || '-',
            'observacao': this.dados.observacao || '-'
        };

        Object.entries(elementos).forEach(([id, valor]) => {
            const elemento = document.getElementById(id);
            if (elemento) {
                elemento.textContent = valor;
            }
        });

        // Exibir link do Jira se existir
        const jiraLinkElement = document.getElementById('jira-link');
        if (jiraLinkElement && this.dados.jiraLink) {
            const link = jiraLinkElement.querySelector('a.jira-link');
            if (link) {
                // Adicionar protocolo se não tiver
                const jiraUrl = this.dados.jiraLink.startsWith('http') 
                    ? this.dados.jiraLink 
                    : 'http://' + this.dados.jiraLink;
                link.href = jiraUrl;
                link.textContent = this.dados.jiraLink;
            }
            jiraLinkElement.style.display = 'block';
        } else if (jiraLinkElement) {
            jiraLinkElement.style.display = 'none';
        }
    }

    isModoRoteiro() {
        const tr = this.dados.testRoutine;
        return tr === true || tr === 'roteiro' || tr === 'sim';
    }

    exibirCenarios() {
        const container = document.getElementById('cenarios-container');
        
        if (!this.dados.cenarios || this.dados.cenarios.length === 0) {
            container.innerHTML = '<p style="text-align: center; color: #666; font-style: italic;" data-cy="no-test-cases-message">Nenhum cenário de teste encontrado.</p>';
            return;
        }

        const cenariosHtml = this.dados.cenarios.map((cenario, index) => {
            const isModoRoteiro = this.isModoRoteiro();
            const roteiroDetailsHtml = isModoRoteiro ? `
                <div class="test-case-roteiro-details" data-cy="test-case-roteiro-details-${index}">
                    <div class="test-case-roteiro-col" data-cy="test-case-preconditions-${index}">
                        <div class="test-case-roteiro-label" data-cy="test-case-preconditions-title-${index}">Pré-condições</div>
                        <p class="test-case-roteiro-text" data-cy="test-case-preconditions-content-${index}">${this.formatarTexto(cenario.precondicoes)}</p>
                    </div>
                    <div class="test-case-roteiro-col" data-cy="test-case-steps-${index}">
                        <div class="test-case-roteiro-label" data-cy="test-case-steps-title-${index}">Passos</div>
                        <p class="test-case-roteiro-text" data-cy="test-case-steps-content-${index}">${this.formatarTexto(cenario.passos)}</p>
                    </div>
                    <div class="test-case-roteiro-col" data-cy="test-case-expected-result-${index}">
                        <div class="test-case-roteiro-label" data-cy="test-case-expected-result-title-${index}">Resultado esperado</div>
                        <p class="test-case-roteiro-text" data-cy="test-case-expected-result-content-${index}">${this.formatarTexto(cenario.resultadoEsperado)}</p>
                    </div>
                </div>
            ` : '';

            return `
                <div class="test-case_view" data-cy="test-case-${index}">
                    <div class="test-case_view__top" data-cy="test-case-top-${index}">
                        <div class="test-case-header" data-cy="test-case-header-${index}">
                            <h4 data-cy="test-case-title-${index}">${cenario.titulo || `CT${String(cenario.id).padStart(3, '0')} - Sem Título`}</h4>
                        </div>
                        <div class="test-case-status" data-cy="test-case-status-${index}">
                            <span class="status-badge status-${cenario.status || 'na'}" data-cy="test-case-status-badge-${index}">${cenario.status === 'na' || !cenario.status ? 'N/A' : cenario.status}</span>
                        </div>
                    </div>
                    ${roteiroDetailsHtml}
                </div>
            `;
        }).join('');

        container.innerHTML = cenariosHtml;
    }

    exibirBugs() {
        const bugsSection = document.getElementById('bugs-section');
        const bugsList = document.getElementById('bugs-list');
        
        // Seção de bugs está oculta por padrão
        
        if (!this.dados.bugs || this.dados.bugs.length === 0) {
            bugsList.innerHTML = `
                <div class="no-bugs-simple" data-cy="no-bugs-message">
                    <p data-cy="no-bugs-text">Não foram reportados bugs durante a execução dos testes.</p>
                </div>
            `;
            return;
        }
        
        const bugsHtml = `
            <div class="bugs-summary" data-cy="bugs-summary">
                <p data-cy="bugs-summary-text"><strong data-cy="bugs-summary-label">Total de bugs:</strong> <span data-cy="bugs-total-count">${this.dados.bugs.length}</span></p>
            </div>
            <table class="bugs-table_view" data-cy="bugs-table">
                <thead data-cy="bugs-table-header">
                    <tr data-cy="bugs-table-header-row">
                        <th data-cy="bugs-table-header-jira">Link Jira</th>
                        <th data-cy="bugs-table-header-descricao">Descrição</th>
                    </tr>
                </thead>
                <tbody data-cy="bugs-table-body">
                    ${this.dados.bugs.map((bug, index) => `
                        <tr data-cy="bug-row-${index}">
                            <td class="bug-jira" data-cy="bug-jira-${index}">${bug.linkJira ? `<a href="${bug.linkJira.startsWith('http') ? bug.linkJira : 'http://' + bug.linkJira}" target="_blank" data-cy="bug-jira-link-${index}">${bug.linkJira}</a>` : '<span data-cy="bug-jira-empty-${index}">-</span>'}</td>
                            <td class="bug-descricao" data-cy="bug-descricao-${index}">${bug.descricao || '-'}</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        `;

        bugsList.innerHTML = bugsHtml;
    }

    exibirAnexos() {
        const attachmentsSection = document.getElementById('attachments-section');
        const attachmentsList = document.getElementById('attachments-list');
        const attachmentsControls = document.querySelector('[data-cy="attachments-controls"]');
        
        // Coletar todos os anexos de todos os cenários
        this.todosAnexos = [];
        if (this.dados.cenarios) {
            this.dados.cenarios.forEach(cenario => {
                if (cenario.arquivos && cenario.arquivos.length > 0) {
                    cenario.arquivos.forEach(arquivo => {
                        // Arquivo pode ser string ou objeto
                        let arquivoObj = typeof arquivo === 'string' ? { nome: arquivo } : arquivo;
                        
                        // Extrair nome limpo (sem hash) para exibição
                        let nomeLimpo = arquivoObj.nome;
                        if (arquivoObj.nome && arquivoObj.nome.includes('_CT')) {
                            // Extrair parte após _CT ou nome completo se não tiver hash
                            const parts = arquivoObj.nome.split('_CT');
                            if (parts.length > 1) {
                                nomeLimpo = 'CT' + parts[1];
                            }
                        }
                        
                        // Construir URL do arquivo
                        const nomeCompleto = arquivoObj.nome || arquivo;
                        const fileUrl = typeof arquivoObj === 'object' && arquivoObj.download_url 
                            ? arquivoObj.download_url 
                            : `/api/attachments/download/${nomeCompleto}`;
                        
                        this.todosAnexos.push({
                            ...arquivoObj,
                            nomeCompleto: nomeCompleto, // Nome com hash para busca
                            nomeLimpo: nomeLimpo, // Nome sem hash para exibição
                            url: fileUrl,
                            cenarioId: cenario.id,
                            cenarioTitulo: cenario.titulo,
                            extension: this.getFileExtension(nomeCompleto)
                        });
                    });
                }
            });
        }
        
        // Sempre mostrar a seção de anexos
        attachmentsSection.style.display = 'block';
        
        if (this.todosAnexos.length === 0) {
            // Ocultar controles quando não há anexos
            if (attachmentsControls) {
                attachmentsControls.style.display = 'none';
            }
            
            // Ocultar botão de download ZIP
            const downloadBtn = document.getElementById('download-zip-btn');
            if (downloadBtn) {
                downloadBtn.style.display = 'none';
            }
            
            attachmentsList.innerHTML = `
                <div class="no-attachments-simple" data-cy="no-attachments-message">
                    <p data-cy="no-attachments-message-text">Não foram anexados arquivos durante a execução dos testes.</p>
                </div>
            `;
            return;
        }
        
        // Mostrar controles quando há anexos
        if (attachmentsControls) {
            attachmentsControls.style.display = 'flex';
        }
        
        // Mostrar botão de download ZIP
        const downloadBtn = document.getElementById('download-zip-btn');
        if (downloadBtn) {
            downloadBtn.style.display = 'flex';
        }
        
        // Atualizar total de anexos
        const totalAttachmentsElement = document.querySelector('[data-cy="total-attachments-count"]');
        if (totalAttachmentsElement) {
            totalAttachmentsElement.textContent = this.todosAnexos.length;
        }
        
        // Configurar evento do filtro
        this.configurarFiltroAnexos();
        
        // Exibir todos os anexos inicialmente
        this.filtrarAnexos('all');
    }

    configurarFiltroAnexos() {
        const filterSelect = document.querySelector('[data-cy="attachments-filter-select"]');
        if (filterSelect) {
            filterSelect.addEventListener('change', (e) => {
                this.filtrarAnexos(e.target.value);
            });
        }
    }

    filtrarAnexos(tipoFiltro) {
        const attachmentsList = document.getElementById('attachments-list');
        let anexosFiltrados = this.todosAnexos;

        if (tipoFiltro !== 'all') {
            // Verificar se o filtro contém múltiplas extensões (separadas por vírgula)
            const extensoes = tipoFiltro.split(',');
            anexosFiltrados = this.todosAnexos.filter(anexo => 
                extensoes.includes(anexo.extension)
            );
        }

        if (anexosFiltrados.length === 0) {
            attachmentsList.innerHTML = `
                <div class="no-attachments-simple" data-cy="no-attachments-filtered">
                    <p data-cy="no-attachments-filtered-text">Nenhum anexo encontrado para o tipo selecionado.</p>
                </div>
            `;
            return;
        }

        const attachmentsHtml = `
            <div class="attachments-grid" data-cy="attachments-grid">
                ${anexosFiltrados.map((anexo, index) => `
                    <div class="attachment-item" data-file-type="${this.getFileType(anexo.nomeCompleto || anexo.nome)}" data-cy="attachment-item">
                        <a href="${anexo.url}" target="_blank" class="attachment-file-link" data-cy="attachment-link">
                            <span class="attachment-filename" data-cy="attachment-filename">${anexo.nomeLimpo || anexo.nome}</span>
                        </a>
                    </div>
                `).join('')}
            </div>
        `;

        attachmentsList.innerHTML = attachmentsHtml;
    }

    getFileExtension(filename) {
        return filename.split('.').pop().toLowerCase();
    }

    getFileType(filename) {
        const extension = filename.split('.').pop().toLowerCase();
        const typeMap = {
            'jpg': 'Imagem',
            'jpeg': 'Imagem',
            'png': 'Imagem',
            'gif': 'Vídeo',
            'bmp': 'Imagem',
            'pdf': 'PDF',
            'doc': 'Documento',
            'docx': 'Documento',
            'txt': 'Texto',
            'rtf': 'Texto',
            'xls': 'Planilha',
            'xlsx': 'Planilha',
            'ppt': 'Apresentação',
            'pptx': 'Apresentação',
            'zip': 'Arquivo',
            'rar': 'Arquivo',
            '7z': 'Arquivo',
            'mp4': 'Vídeo',
            'avi': 'Vídeo',
            'mov': 'Vídeo',
            'mp3': 'Áudio',
            'wav': 'Áudio',
            'html': 'Web',
            'css': 'Web',
            'js': 'Web',
            'json': 'Dados',
            'xml': 'Dados'
        };
        return typeMap[extension] || 'Arquivo';
    }

    getFileIcon(filename) {
        const extension = filename.split('.').pop().toLowerCase();
        const iconMap = {
            'pdf': '📄',
            'doc': '📝',
            'docx': '📝',
            'xls': '📊',
            'xlsx': '📊',
            'ppt': '📽️',
            'pptx': '📽️',
            'txt': '📄',
            'jpg': '🖼️',
            'jpeg': '🖼️',
            'png': '🖼️',
            'gif': '🖼️',
            'bmp': '🖼️',
            'mp4': '🎥',
            'avi': '🎥',
            'mov': '🎥',
            'zip': '📦',
            'rar': '📦',
            '7z': '📦'
        };
        return iconMap[extension] || '📄';
    }

    atualizarResumo() {
        if (!this.dados.cenarios) {
            return;
        }

        // Calcular estatísticas
        let aprovados = 0;
        let reprovados = 0;
        let bloqueados = 0;
        let naoExecutados = 0;
        let totalIA = 0;
        
        this.dados.cenarios.forEach(cenario => {
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
                case 'nao_executado':
                case 'Não executado':
                case 'na':
                case '':
                case null:
                case undefined:
                    naoExecutados++;
                    break;
                default:
                    naoExecutados++;
                    break;
            }
            
            // Contar por fonte IA
            if (cenario.fonte === 'IA') {
                totalIA++;
            }
        });
        
        const totalCenarios = this.dados.cenarios.length;
        const taxaAprovacao = totalCenarios > 0 ? Math.round((aprovados / totalCenarios) * 100) : 0;
        const taxaExecucao = totalCenarios > 0 ? Math.round(((aprovados + reprovados) / totalCenarios) * 100) : 0;
        
        // Atualizar elementos do resumo
        const elementos = {
            'total-cenarios': totalCenarios,
            'aprovados': aprovados,
            'reprovados': reprovados,
            'bloqueados': bloqueados,
            'nao-executados': naoExecutados,
            'taxa-aprovacao': taxaAprovacao + '%',
            'taxa-execucao': taxaExecucao + '%',
            'total-ia': totalIA
        };

        Object.entries(elementos).forEach(([id, valor]) => {
            const elemento = document.getElementById(id);
            if (elemento) {
                elemento.textContent = valor;
            }
        });
    }

    formatarTexto(texto) {
        if (!texto) return '-';
        const esc = String(texto)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
        return esc.replace(/\n/g, '<br>');
    }

    mostrarErro(mensagem) {
        const container = document.getElementById('cenarios-container');
        container.innerHTML = `
            <div style="text-align: center; padding: 40px; color: #dc3545;" data-cy="error-container">
                <h3 data-cy="error-title">❌ Erro</h3>
                <p data-cy="error-message">${mensagem}</p>
                <button onclick="window.location.href='/'" style="
                    background: #0066cc;
                    color: white;
                    border: none;
                    padding: 10px 20px;
                    border-radius: 4px;
                    cursor: pointer;
                    margin-top: 15px;
                " data-cy="error-back-button">Voltar ao Início</button>
            </div>
        `;
    }
}

// Inicializar quando a página carregar
document.addEventListener('DOMContentLoaded', function() {
    new DocumentacaoViewer();
});

// Função para impressão
function imprimir() {
    window.print();
}

// Função para baixar anexos em ZIP
async function baixarAnexosZip() {
    try {
        // Obter nome do arquivo da URL
        const urlParams = new URLSearchParams(window.location.search);
        const arquivo = urlParams.get('file');
        
        if (!arquivo) {
            alert('Erro: Arquivo não especificado na URL');
            return;
        }

        // Desabilitar botão durante o download
        const btn = document.getElementById('download-zip-btn');
        const textoOriginal = btn.innerHTML;
        btn.disabled = true;
        btn.innerHTML = '⏳ Baixando ZIP...';

        // Extrair ID da feature do nome do arquivo
        const featureId = arquivo.replace('.html', '').split('/').pop();
        
        // Baixar ZIP diretamente do S3 usando o hash ID
        // O arquivo está salvo como anexos/{HASH_ID}.zip
        const zipFileName = `${featureId}.zip`;
        const response = await fetch(`/api/anexos/${zipFileName}`);
        
        if (!response.ok) {
            // Tentar ler erro como JSON
            try {
                const errorData = await response.json();
                throw new Error(errorData.message || errorData.error || `Erro HTTP: ${response.status}`);
            } catch (e) {
                if (e.message) {
                    throw e;
                }
                throw new Error(`Erro HTTP: ${response.status}`);
            }
        }

        // Verificar se a resposta é um ZIP
        const contentType = response.headers.get('content-type');
        if (contentType && (contentType.includes('application/zip') || contentType.includes('application/octet-stream'))) {
            // Criar blob e fazer download
            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.style.display = 'none';
            a.href = url;
            a.download = zipFileName;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);
            
            console.log(`✅ Download do ZIP ${zipFileName} iniciado`);
        } else {
            // Se não for ZIP, pode ser que o arquivo não existe ou está em formato diferente
            // Tentar ler como JSON para ver a mensagem de erro
            try {
                const errorData = await response.json();
                throw new Error(errorData.message || errorData.error || 'Arquivo ZIP não encontrado');
            } catch (e) {
                throw new Error('Resposta do servidor não é um arquivo ZIP válido');
            }
        }

    } catch (error) {
        console.error('Erro ao baixar ZIP:', error);
        alert('Erro ao baixar anexos: ' + error.message);
    } finally {
        // Reabilitar botão
        const btn = document.getElementById('download-zip-btn');
        btn.disabled = false;
        btn.innerHTML = '📦 Baixar Anexos';
    }
}

// Adicionar botão de impressão se necessário
document.addEventListener('DOMContentLoaded', function() {
    // Adicionar botão de impressão no cabeçalho se não existir
    const header = document.querySelector('.header_view');
    if (header && !document.getElementById('print-btn')) {
        const printBtn = document.createElement('button');
        printBtn.id = 'print-btn';
        printBtn.setAttribute('data-cy', 'print-btn');
        printBtn.innerHTML = '🖨️ Imprimir';
        printBtn.style.cssText = `
            position: absolute;
            top: 20px;
            right: 20px;
            background: #0066cc;
            color: white;
            border: none;
            padding: 8px 16px;
            border-radius: 4px;
            cursor: pointer;
            font-size: 14px;
        `;
        printBtn.onclick = imprimir;
        header.style.position = 'relative';
        header.appendChild(printBtn);
    }
});
