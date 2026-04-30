// Carregar variáveis de ambiente do arquivo .env
// override: false garante que variáveis já definidas no ambiente não sejam sobrescritas
require('dotenv').config({ override: false });
const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');
const https = require('https');
const fs = require('fs-extra');
const path = require('path');
const { AsyncLocalStorage } = require('async_hooks');

const app = express();
const PORT = 3002;

// Cache para prompts carregados
let promptsCache = null;

// Middleware
app.use(cors());
app.use(express.json({ limit: '100mb' })); // Aumentar limite para suportar múltiplas imagens em base64
app.use(express.urlencoded({ extended: true, limit: '100mb' })); // Aumentar limite para urlencoded também

// Chave OpenAI: variável de ambiente tem prioridade; se vazia, aceita cabeçalho X-OpenAI-API-Key (ex.: modo local com chave no localStorage do browser).
app.use((req, res, next) => {
    const envKey = (process.env.OPENAI_API_KEY || '').trim();
    const headerKey = String(req.headers['x-openai-api-key'] || '').trim();
    const key = envKey || headerKey;
    openaiKeyALS.run(key, next);
});

// Configuração das APIs de IA
const AI_CONFIG = {
    openai: {
        enabled: true
    }
};

const openaiKeyALS = new AsyncLocalStorage();

function currentOpenAIKey() {
    const fromStore = openaiKeyALS.getStore();
    if (fromStore && String(fromStore).trim()) {
        return String(fromStore).trim();
    }
    return (process.env.OPENAI_API_KEY || '').trim();
}

// Configuração do agente HTTPS para resolver problemas de certificado SSL
// Permite desabilitar verificação via variável de ambiente (útil em ambientes corporativos com proxies)
// AVISO: Desabilitar a verificação SSL reduz a segurança. Use apenas se necessário.
// 
// Para desabilitar a verificação SSL, defina uma das seguintes variáveis de ambiente:
// - NODE_TLS_REJECT_UNAUTHORIZED=0 (desabilita para todo o Node.js)
// - OPENAI_DISABLE_SSL_VERIFY=true (desabilita apenas para requisições OpenAI)
const shouldRejectUnauthorized = process.env.NODE_TLS_REJECT_UNAUTHORIZED !== '0' && 
                                  process.env.OPENAI_DISABLE_SSL_VERIFY !== 'true';

if (!shouldRejectUnauthorized) {
    console.warn('[AI] ⚠️ AVISO: Verificação de certificado SSL desabilitada. Isso reduz a segurança da comunicação.');
    console.warn('[AI] ⚠️ Para habilitar novamente, remova a variável NODE_TLS_REJECT_UNAUTHORIZED=0 ou OPENAI_DISABLE_SSL_VERIFY=true');
} else {
    console.log('[AI] ✓ Verificação de certificado SSL habilitada');
}

const httpsAgent = new https.Agent({
    rejectUnauthorized: shouldRejectUnauthorized,
    // Adicionar opções adicionais para melhor compatibilidade
    keepAlive: true,
    keepAliveMsecs: 1000
});

/**
 * Retorna opções de fetch configuradas com agente HTTPS
 * @param {Object} options - Opções adicionais para o fetch
 * @returns {Object} Opções de fetch com agente HTTPS configurado
 */
function getFetchOptions(options = {}) {
    return {
        ...options,
        agent: httpsAgent
    };
}

/**
 * Detecta e trata erros de certificado SSL, fornecendo instruções ao usuário
 * @param {Error} error - Erro capturado
 */
function handleSSLError(error) {
    if (error.code === 'UNABLE_TO_GET_ISSUER_CERT_LOCALLY' || 
        error.message?.includes('unable to get local issuer certificate') ||
        error.errno === 'UNABLE_TO_GET_ISSUER_CERT_LOCALLY') {
        console.error('[AI] ❌ Erro de certificado SSL detectado!');
        console.error('[AI] 📝 Para resolver, adicione ao arquivo .env na raiz do projeto:');
        console.error('[AI]    OPENAI_DISABLE_SSL_VERIFY=true');
        console.error('[AI] ⚠️  Ou defina a variável de ambiente antes de executar:');
        console.error('[AI]    $env:NODE_TLS_REJECT_UNAUTHORIZED="0"  (PowerShell)');
        console.error('[AI]    export NODE_TLS_REJECT_UNAUTHORIZED=0   (Linux/Mac)');
        console.error('[AI] ⚠️  AVISO: Isso desabilita a verificação SSL e reduz a segurança.');
        console.error('[AI] 💡 Recomendado apenas para ambientes corporativos com proxy/firewall.');
        return true;
    }
    return false;
}

/**
 * Carrega as flags do sistema
 * Suporta tanto filesystem local quanto S3
 */
async function carregarFlags() {
    try {
        const flagsPath = path.join(__dirname, '../public/json/flags.json');
        if (await fs.pathExists(flagsPath)) {
            return await fs.readJson(flagsPath);
        }
        return {};
    } catch (error) {
        console.warn('[AI] ⚠️ Erro ao carregar flags:', error.message);
        return {};
    }
}

/**
 * Verifica se o sistema está em manutenção
 * Suporta tanto filesystem local quanto S3
 */
async function verificarManutencao() {
    try {
        const flags = await carregarFlags();
        return flags && flags.manutencao === true;
    } catch (error) {
        // Se não conseguir ler, assumir que não está em manutenção
        console.warn('[AI] ⚠️ Erro ao verificar flag de manutenção:', error.message);
        return false;
    }
}

/**
 * Verifica se a execução de scripts de IA está habilitada
 * Suporta tanto filesystem local quanto S3
 */
async function verificarExecutarScriptIA() {
    try {
        const flags = await carregarFlags();
        // Se a flag não existir, assumir que está habilitada (comportamento padrão)
        return flags.executarScriptIA !== false;
    } catch (error) {
        // Se não conseguir ler, assumir que está habilitada
        console.warn('[AI] ⚠️ Erro ao verificar flag executarScriptIA:', error.message);
        return true;
    }
}

/**
 * Middleware para verificar manutenção antes de processar requests de IA
 */
async function verificarManutencaoMiddleware(req, res, next) {
    const emManutencao = await verificarManutencao();
    if (emManutencao) {
        return res.status(503).json({
            success: false,
            error: 'Sistema em manutenção',
            message: 'O sistema está temporariamente indisponível para uso de IA. Por favor, tente novamente mais tarde.'
        });
    }
    next();
}

/**
 * Middleware para verificar se a execução de scripts de IA está habilitada
 */
async function verificarExecutarScriptIAMiddleware(req, res, next) {
    const executarScriptIA = await verificarExecutarScriptIA();
    if (!executarScriptIA) {
        return res.status(403).json({
            success: false,
            error: 'Execução de IA bloqueada',
            message: 'A execução de scripts de IA está desabilitada. Por favor, ative a flag "Executar Script IA" nas configurações.'
        });
    }
    next();
}

// Função para carregar prompts do JSON
async function loadPrompts() {
    if (promptsCache) {
        return promptsCache;
    }
    
    try {
        const promptsPath = path.join(__dirname, '../public/json/prompts.json');
        promptsCache = await fs.readJson(promptsPath);
        return promptsCache;
    } catch (error) {
        console.error('Erro ao carregar prompts.json:', error);
        throw new Error('Não foi possível carregar o arquivo de prompts');
    }
}

// Função genérica para obter prompt por ID
async function getPromptById(id) {
    try {
        const prompts = await loadPrompts();
        const prompt = prompts.find(p => p.id === id);
        
        if (!prompt) {
            throw new Error(`Prompt com ID ${id} não encontrado`);
        }
        
        return prompt.base || '';
    } catch (error) {
        console.error(`Erro ao obter prompt ID ${id}:`, error);
        throw error;
    }
}

// Função para ler o prompt de resumo funcional (ID: 1)
async function getPromptResumoFuncional() {
    return await getPromptById(1);
}

// Função para resumir contexto usando IA
async function resumirContextoFuncional(contexto, images = []) {
    const basePrompt = await getPromptResumoFuncional();
    
    // Montar prompt completo
    let prompt = basePrompt.replace(/\{contexto\}/g, contexto || 'Nenhum contexto fornecido.');
    
    // Preparar mensagens para a API
    const messages = [
        {
            role: 'system',
            content: 'Você é um especialista em análise de funcionalidades. Retorne APENAS o resumo funcional em texto puro, sem formatação JSON, sem explicações adicionais.'
        },
        {
            role: 'user',
            content: prompt
        }
    ];
    
    // Adicionar imagens se houver
    if (images && images.length > 0) {
        const imageMessages = images.map(image => ({
            type: 'image_url',
            image_url: {
                url: image.startsWith('data:') ? image : `data:image/png;base64,${image}`
            }
        }));
        
        messages[1].content = [
            { type: 'text', text: prompt },
            ...imageMessages
        ];
    }
    
    try {
        const requestBody = {
            model: 'gpt-4o',
            messages: messages,
            temperature: 0
        };
        
        console.log('[AI] Resumindo contexto funcional...');

    const response = await fetch('https://api.openai.com/v1/chat/completions', getFetchOptions({
        method: 'POST',
        headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${currentOpenAIKey()}`
            },
            body: JSON.stringify(requestBody)
        }));
    
    if (!response.ok) {
            let errorMessage = `Erro na API OpenAI: ${response.statusText}`;
            try {
                const errorData = await response.json();
                errorMessage = `Erro na API OpenAI: ${errorData.error?.message || errorData.error || response.statusText}`;
            } catch (jsonError) {
                errorMessage = `Erro na API OpenAI (${response.status}): ${response.statusText}`;
            }
            throw new Error(errorMessage);
        }
        
        const data = await response.json();
        
        if (!data.choices || !Array.isArray(data.choices) || data.choices.length === 0) {
            throw new Error('Resposta da API OpenAI inválida: nenhuma escolha retornada');
        }
        
        if (!data.choices[0] || !data.choices[0].message) {
            throw new Error('Resposta da API OpenAI inválida: estrutura de mensagem inesperada');
        }
        
        const resumo = data.choices[0].message.content;
        
        // Log de tokens usados
        if (data.usage) {
            console.log('[AI] 📊 Tokens usados no resumo funcional:');
            console.log(`   - Prompt tokens: ${data.usage.prompt_tokens}`);
            console.log(`   - Completion tokens: ${data.usage.completion_tokens}`);
            console.log(`   - Total tokens: ${data.usage.total_tokens}`);
            if (data.usage.prompt_tokens_details) {
                console.log(`   - Cached tokens: ${data.usage.prompt_tokens_details.cached_tokens || 0}`);
            }
        }
        
        if (!resumo || typeof resumo !== 'string' || resumo.trim().length === 0) {
            // Se não conseguir resumir, retornar o contexto original
            console.warn('[AI] Resumo vazio, usando contexto original');
            return contexto;
        }
        
        console.log('[AI] Contexto resumido com sucesso');
        return resumo.trim();
        
    } catch (error) {
        console.error('[AI] Erro ao resumir contexto:', error);
        handleSSLError(error);
        // Em caso de erro, retornar o contexto original
        console.warn('[AI] Usando contexto original devido ao erro');
        return contexto;
    }
}

// Função para ler o prompt de geração de casos de teste funcionais (ID: 2)
async function getPromptGeracaoFuncional() {
    return await getPromptById(2);
}

// Função para ler o prompt de análise de cobertura (ID: 7) - REMOVIDO
// async function getPromptAnaliseCobertura() {
//     return await getPromptById(7);
// }

// Função para ler o prompt de reorganização de casos de teste (ID: 9)
async function getPromptReorganizacao() {
    return await getPromptById(9);
}

// Função para ler o prompt de análise de duplicatas (ID: 8)
async function getPromptAnaliseDuplicatas() {
    return await getPromptById(8);
}

// Função para ler o prompt de rastreabilidade de cobertura (ID: 10)
async function getPromptRastreabilidadeCobertura() {
    return await getPromptById(10);
}

// Função para ler o prompt de rastreabilidade de cobertura com comparação (ID: 11)
async function getPromptRastreabilidadeCoberturaComComparacao() {
    return await getPromptById(11);
}

// Função para converter array de casos de teste para formato de cobertura
function converterArrayCasosTeste(casosTeste, ultimoNumeroCT = 0) {
    // Se recebeu um array de casos de teste, converter para formato de cobertura
    const casosSugeridos = casosTeste.map((caso, index) => {
        let id = caso.id || caso.ID;
        let titulo = caso.titulo || caso.Titulo || caso.Descricao || caso.descricao || '';
        
        // Se não tem ID formatado, gerar um
        if (!id || !id.match(/^CT\d+/i)) {
            id = `CT${String(ultimoNumeroCT + index + 1).padStart(3, '0')}`;
        }
        
        // Se o título não inclui o ID, adicionar
        if (titulo && !titulo.match(/^CT\d+/i)) {
            titulo = `${id} - ${titulo}`;
        } else if (!titulo) {
            titulo = id;
        }
        
        return { titulo: titulo };
    });
    
    // Retornar formato de cobertura com casos sugeridos
    // Como não temos análise de cobertura, retornar estrutura básica
    return {
        cobertura_total_percentual: 0, // Será calculado pelo frontend se necessário
        cobertura_por_area: [],
        casos_sugeridos: casosSugeridos
    };
}

// Função para converter o novo formato de cobertura para o formato esperado pelo frontend
function converterFormatoCobertura(cobertura, ultimoNumeroCT = 0) {
    // Verificar se é formato de rastreabilidade com comparação (prompt ID 11)
    if (cobertura.rastreabilidade && Array.isArray(cobertura.rastreabilidade)) {
        // Processar formato do prompt ID 11
        const todasSugestoes = [];
        const todosCasosDesatualizados = [];
        const todosCasosIrrelevantes = [];
        const todasSugestoesAtualizacao = [];
        
        cobertura.rastreabilidade.forEach(topico => {
            if (topico.comportamentos && Array.isArray(topico.comportamentos)) {
                topico.comportamentos.forEach(comportamento => {
                    // Coletar sugestões
                    if (comportamento.sugestoes && Array.isArray(comportamento.sugestoes)) {
                        comportamento.sugestoes.forEach(sugestao => {
                            if (typeof sugestao === 'string') {
                                todasSugestoes.push({ titulo: sugestao });
                            }
                        });
                    }
                    
                    // Coletar casos desatualizados
                    if (comportamento.casosDesatualizados && Array.isArray(comportamento.casosDesatualizados)) {
                        comportamento.casosDesatualizados.forEach(ct => {
                            if (!todosCasosDesatualizados.includes(ct)) {
                                todosCasosDesatualizados.push(ct);
                            }
                        });
                    }
                    
                    // Coletar casos irrelevantes
                    if (comportamento.casosIrrelevantes && Array.isArray(comportamento.casosIrrelevantes)) {
                        comportamento.casosIrrelevantes.forEach(ct => {
                            if (!todosCasosIrrelevantes.includes(ct)) {
                                todosCasosIrrelevantes.push(ct);
                            }
                        });
                    }
                    
                    // Coletar sugestões de atualização
                    if (comportamento.sugestoesAtualizacao && Array.isArray(comportamento.sugestoesAtualizacao)) {
                        comportamento.sugestoesAtualizacao.forEach(sugestao => {
                            if (typeof sugestao === 'string') {
                                todasSugestoesAtualizacao.push({ titulo: sugestao });
                            }
                        });
                    }
                });
            }
        });
        
        // Converter porcentagemCobertura para cobertura_total_percentual
        const coberturaTotal = cobertura.porcentagemCobertura !== undefined 
            ? cobertura.porcentagemCobertura 
            : 0;
        
        return {
            cobertura_total_percentual: coberturaTotal,
            casos_sugeridos: todasSugestoes,
            casos_desatualizados: todosCasosDesatualizados,
            casos_irrelevantes: todosCasosIrrelevantes,
            sugestoes_atualizacao: todasSugestoesAtualizacao,
            rastreabilidade: cobertura.rastreabilidade, // Manter estrutura completa para uso no frontend
            cobertura_por_area: [] // Formato de rastreabilidade não tem áreas separadas
        };
    }
    
    // Verificar se já está no formato antigo
    if (cobertura.cobertura_total_percentual !== undefined) {
        return cobertura;
    }
    
    // Novo formato: Array de casos de teste sugeridos
    if (Array.isArray(cobertura)) {
        return converterArrayCasosTeste(cobertura, ultimoNumeroCT);
    }
    
    // Formato: CoberturaFuncional.Objetivos, CoberturaFuncional.RegrasDeNegocio, etc.
    const coberturaFuncional = cobertura.CoberturaFuncional || {};
    
    // Mapeamento de áreas
    const areas = {
        'Objetivos': { nome: 'Objetivos', peso: 4 },
        'RegrasDeNegocio': { nome: 'Regras de negócio', peso: 3 },
        'MensagensDoSistema': { nome: 'Mensagens do sistema', peso: 1 },
        'LayoutInterface': { nome: 'Layout/Interface', peso: 1 }
    };
    
    const coberturaPorArea = [];
    let totalPonderado = 0;
    let somaPesos = 0;
    const todasSugestoes = [];
    let proximoNumeroCT = ultimoNumeroCT + 1;
    
    // Processar cada área dentro de CoberturaFuncional
    for (const [chave, areaInfo] of Object.entries(areas)) {
        const area = coberturaFuncional[chave];
        
        if (!area || typeof area !== 'object') {
            // Área não encontrada, criar com valores padrão
            coberturaPorArea.push({
                area: areaInfo.nome,
                percentual: 0,
                peso: areaInfo.peso,
                comentario: 'Nenhum caso funcional aplicável encontrado'
            });
            somaPesos += areaInfo.peso;
            continue;
        }
        
        // Extrair percentual (pode estar em "Cobertura (%)" ou "Cobertura")
        let percentual = 0;
        const coberturaValue = area['Cobertura (%)'] !== undefined ? area['Cobertura (%)'] : area.Cobertura;
        
        if (typeof coberturaValue === 'number') {
            percentual = coberturaValue;
        } else if (typeof coberturaValue === 'string') {
            // Tentar extrair número da string (ex: "75%" -> 75, "75.5%" -> 75.5)
            const match = coberturaValue.match(/(\d+(?:\.\d+)?)/);
            if (match) {
                percentual = parseFloat(match[1]);
            }
        }
        
        // Garantir que percentual está entre 0 e 100
        percentual = Math.max(0, Math.min(100, percentual));
        
        // Observações
        const observacoes = area.Observacoes || area.Resumo || 'Sem informações disponíveis';
        
        // Processar sugestões dos CasosDeTeste com Status "Sugestão"
        let sugestoes = [];
        if (Array.isArray(area.CasosDeTeste)) {
            sugestoes = area.CasosDeTeste
                .filter(caso => caso.Status === 'Sugestão' || caso.Status === 'Sugestao')
                .map(caso => {
                    // Se já tem ID formatado, usar como está
                    if (caso.ID && caso.ID.match(/^CT\d+/i)) {
                        return { titulo: caso.ID + (caso.Descricao ? ` - ${caso.Descricao}` : '') };
                    }
                    // Caso contrário, formatar como CTXXX - descrição
                    const codigo = caso.ID || `CT${String(proximoNumeroCT).padStart(3, '0')}`;
                    proximoNumeroCT++;
                    const descricao = caso.Descricao || '';
                    return { titulo: `${codigo}${descricao ? ' - ' + descricao : ''}` };
                });
        }
        
        // Também processar Sugestoes se existir (formato antigo)
        if (Array.isArray(area.Sugestoes)) {
            area.Sugestoes.forEach(sugestao => {
                if (typeof sugestao === 'string' && sugestao.match(/^CT\d+/i)) {
                    sugestoes.push({ titulo: sugestao });
                } else {
                    const codigo = `CT${String(proximoNumeroCT).padStart(3, '0')}`;
                    proximoNumeroCT++;
                    const tituloFormatado = typeof sugestao === 'string' 
                        ? `${codigo} - ${sugestao}` 
                        : `${codigo} - ${sugestao.titulo || sugestao.Descricao || sugestao}`;
                    sugestoes.push({ titulo: tituloFormatado });
                }
            });
        }
        
        todasSugestoes.push(...sugestoes);
        
        const peso = area.Peso || areaInfo.peso;
        
        coberturaPorArea.push({
            area: areaInfo.nome,
            percentual: percentual,
            peso: peso,
            comentario: observacoes
        });
        totalPonderado += percentual * peso;
        somaPesos += peso;
    }
    
    // Processar SugestoesGerais se existir
    if (Array.isArray(cobertura.SugestoesGerais)) {
        cobertura.SugestoesGerais.forEach(sugestao => {
            if (typeof sugestao === 'object' && sugestao.ID) {
                // Se já tem ID formatado, usar como está
                if (sugestao.ID.match(/^CT\d+/i)) {
                    todasSugestoes.push({ 
                        titulo: sugestao.ID + (sugestao.Descricao ? ` - ${sugestao.Descricao}` : '') 
                    });
                } else {
                    const codigo = `CT${String(proximoNumeroCT).padStart(3, '0')}`;
                    proximoNumeroCT++;
                    todasSugestoes.push({ 
                        titulo: `${codigo} - ${sugestao.Descricao || sugestao.ID}` 
                    });
                }
            } else if (typeof sugestao === 'string') {
                if (sugestao.match(/^CT\d+/i)) {
                    todasSugestoes.push({ titulo: sugestao });
                } else {
                    const codigo = `CT${String(proximoNumeroCT).padStart(3, '0')}`;
                    proximoNumeroCT++;
                    todasSugestoes.push({ titulo: `${codigo} - ${sugestao}` });
                }
            }
        });
    }
    
    // Calcular cobertura total ponderada
    const coberturaTotal = somaPesos > 0 ? totalPonderado / somaPesos : 0;
    
    // Retornar no formato esperado pelo frontend
                                return {
        cobertura_total_percentual: Math.round(coberturaTotal * 10) / 10, // Arredondar para 1 casa decimal
        cobertura_por_area: coberturaPorArea,
        casos_sugeridos: todasSugestoes
    };
}

// Função removida: analisarCoberturaOpenAI - não está sendo usada
// A funcionalidade de análise de cobertura agora usa apenas rastreabilidadeCoberturaOpenAI

// Função para obter prompt de geração baseado no tipo de teste
async function getPromptGeracaoPorTipo(tipoTeste = 'funcional') {
    const tipoMap = {
        'funcional': 2,
        'integracao': 3,
        'performance': 4,
        'regressao': 5,
        'usabilidade': 6
    };
    
    const id = tipoMap[tipoTeste.toLowerCase()] || 2; // Default para funcional
    return await getPromptById(id);
}

// Função para gerar casos de teste funcionais usando OpenAI
async function gerarCenariosFuncionalOpenAI(contexto, casosTesteExistentes = [], ultimoNumeroCT = 0, images = [], tipoTeste = 'funcional', apenasTextoAdicional = false) {
    // Sempre gerar resumo do contexto para atualizar o localStorage
    let contextoResumido = contexto;
    let resumoGerado = null;
    if (contexto && contexto.trim().length > 0) {
        // Sempre resumir o contexto para gerar o resumo da descrição do produto
        // Se for apenas texto adicional, usar apenas esse texto no resumo (sem imagens)
        const imagensParaResumo = apenasTextoAdicional ? [] : images;
        console.log('[AI] Gerando resumo do contexto...');
        if (apenasTextoAdicional) {
            console.log('[AI] Modo: Apenas texto adicional - usando apenas o texto no resumo');
        }
        contextoResumido = await resumirContextoFuncional(contexto, imagensParaResumo);
        resumoGerado = contextoResumido; // Armazenar o resumo gerado para atualizar localStorage
    }
    
    const basePrompt = await getPromptGeracaoPorTipo(tipoTeste);
    
    // Formatar lista de CTs existentes
    let listaCTs = '';
    if (casosTesteExistentes && casosTesteExistentes.length > 0) {
        const casosOrdenados = [...casosTesteExistentes].sort((a, b) => {
            const numA = parseInt((a.codigo || a.titulo || '').match(/\d+/)?.[0] || '0');
            const numB = parseInt((b.codigo || b.titulo || '').match(/\d+/)?.[0] || '0');
            return numA - numB;
        });
        
        listaCTs = casosOrdenados.map((ct, index) => {
            const codigo = ct.codigo || (ct.titulo || '').match(/CT\d+/i)?.[0] || `CT${String(index + 1).padStart(3, '0')}`;
            const titulo = (ct.titulo || '').replace(/^CT\d+\s*-\s*/i, '').trim();
            return `- ${codigo}: ${titulo}`;
        }).join('\n');
            } else {
        listaCTs = '- Nenhum caso de teste criado ainda.';
    }
    
    // Montar prompt completo com substituições
    let prompt = basePrompt;
    prompt = prompt.replace(/\{contexto\}/g, contextoResumido || 'Nenhum contexto fornecido.');
    prompt = prompt.replace(/\{listaCasosExistentes\}/g, listaCTs ? `\nCASOS DE TESTE EXISTENTES:\n${listaCTs}\n` : '\nCASOS DE TESTE EXISTENTES:\n- Nenhum caso de teste criado ainda.\n');
    prompt = prompt.replace(/\{ultimoNumeroCT\}/g, ultimoNumeroCT.toString());
    prompt = prompt.replace(/\{proximoCT\}/g, `CT${String(ultimoNumeroCT + 1).padStart(3, '0')}`);
    
    // Preparar mensagens para a API
    const messages = [
        {
            role: 'system',
            content: 'Você é um especialista em testes de software. Retorne APENAS um ARRAY JSON válido, sem explicações ou texto adicional. O formato deve ser: [{"titulo": "CTXXX - ..."}, ...]'
        },
        {
            role: 'user',
            content: prompt
        }
    ];
    
    // Adicionar imagens se houver
    if (images && images.length > 0) {
        const imageMessages = images.map(image => ({
            type: 'image_url',
                image_url: {
                url: image.startsWith('data:') ? image : `data:image/png;base64,${image}`
            }
        }));
        
        messages[1].content = [
            { type: 'text', text: prompt },
            ...imageMessages
        ];
    }
    
    try {
        const requestBody = {
            model: 'gpt-4o',
            messages: messages,
            temperature: 0.2
        };
        
        console.log('[AI] Enviando requisição para gerar casos de teste funcionais...');
        console.log('[AI] Model:', requestBody.model);

    const response = await fetch('https://api.openai.com/v1/chat/completions', getFetchOptions({
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${currentOpenAIKey()}`
        },
            body: JSON.stringify(requestBody)
        }));
        
        console.log('[AI] Status da resposta:', response.status, response.statusText);
    
    if (!response.ok) {
            let errorMessage = `Erro na API OpenAI: ${response.statusText}`;
            try {
                const errorData = await response.json();
                errorMessage = `Erro na API OpenAI: ${errorData.error?.message || errorData.error || response.statusText}`;
            } catch (jsonError) {
                errorMessage = `Erro na API OpenAI (${response.status}): ${response.statusText}`;
            }
            throw new Error(errorMessage);
        }
        
        const data = await response.json();
        
        // Validar resposta da API
        if (!data.choices || !Array.isArray(data.choices) || data.choices.length === 0) {
            throw new Error('Resposta da API OpenAI inválida: nenhuma escolha retornada');
        }
        
        if (!data.choices[0] || !data.choices[0].message) {
            console.error('[AI] Estrutura de resposta inválida - choices[0]:', data.choices[0]);
            throw new Error('Resposta da API OpenAI inválida: estrutura de mensagem inesperada');
        }
        
        // Verificar se há recusa (refusal)
        if (data.choices[0].message.refusal) {
            console.error('[AI] A API recusou processar o prompt. Motivo:', data.choices[0].message.refusal);
            throw new Error(`A API da OpenAI recusou processar o prompt: ${data.choices[0].message.refusal}`);
        }
        
        // Verificar finish_reason
        if (data.choices[0].finish_reason) {
            if (data.choices[0].finish_reason === 'length') {
                console.warn('[AI] A resposta foi truncada devido ao limite de tokens');
            } else if (data.choices[0].finish_reason === 'content_filter') {
                throw new Error('Resposta bloqueada pelo filtro de conteúdo da OpenAI');
            } else if (data.choices[0].finish_reason === 'stop') {
                console.log('[AI] Resposta completada normalmente');
            }
        }
        
        const respostaIA = data.choices[0].message.content;
        
        // Validar se há conteúdo na resposta
        if (!respostaIA || typeof respostaIA !== 'string' || respostaIA.trim().length === 0) {
            console.error('[AI] Resposta vazia ou inválida. Estrutura completa:', JSON.stringify(data.choices[0], null, 2));
            throw new Error('Resposta da IA está vazia ou inválida');
        }
        
        // Limpar resposta removendo marcadores de código markdown
        let respostaLimpa = respostaIA.trim();
        
        // Remover blocos de código markdown (```json ... ``` ou ``` ... ```)
        // Remover no início - pode ter ```json ou ```, com ou sem quebra de linha
        if (respostaLimpa.startsWith('```')) {
            // Encontrar onde termina o marcador inicial
            const inicioMatch = respostaLimpa.match(/^```(?:json)?\s*\n?/i);
            if (inicioMatch) {
                respostaLimpa = respostaLimpa.substring(inicioMatch[0].length);
            }
        }
        
        // Remover no final - pode ter ```, com ou sem quebra de linha
        if (respostaLimpa.endsWith('```')) {
            // Encontrar onde começa o marcador final
            const fimMatch = respostaLimpa.match(/\n?\s*```$/);
            if (fimMatch) {
                respostaLimpa = respostaLimpa.substring(0, respostaLimpa.length - fimMatch[0].length);
            }
        }
        
        respostaLimpa = respostaLimpa.trim();
        
        // Parsear JSON da resposta
        let casosTeste = null;
        try {
            const parsed = JSON.parse(respostaLimpa);
            // Se for um objeto com array dentro, extrair o array
            if (Array.isArray(parsed)) {
                casosTeste = parsed;
            } else if (parsed.cenarios || parsed.casos || parsed.casosTeste) {
                casosTeste = parsed.cenarios || parsed.casos || parsed.casosTeste;
        } else {
                // Tentar encontrar array no objeto
                const keys = Object.keys(parsed);
                const arrayKey = keys.find(key => Array.isArray(parsed[key]));
                casosTeste = arrayKey ? parsed[arrayKey] : [];
            }
        } catch (parseError) {
            console.error('[AI] Erro ao fazer parse do JSON:', parseError);
            console.error('[AI] Resposta recebida (primeiros 500 chars):', respostaIA.substring(0, 500));
            console.error('[AI] Resposta limpa (primeiros 500 chars):', respostaLimpa.substring(0, 500));
            
            // Tentar extrair JSON se houver texto adicional
            // Primeiro tentar encontrar array JSON
            let jsonMatch = respostaLimpa.match(/\[[\s\S]*\]/);
            if (!jsonMatch) {
                // Se não encontrou array, tentar na resposta original
                jsonMatch = respostaIA.match(/\[[\s\S]*\]/);
            }
            
            if (jsonMatch) {
                try {
                    casosTeste = JSON.parse(jsonMatch[0]);
                } catch (secondParseError) {
                    console.error('[AI] Erro ao fazer parse do JSON extraído:', secondParseError);
                    throw new Error(`Resposta da IA não contém JSON válido: ${parseError.message}`);
                }
            } else {
                throw new Error(`Resposta da IA não contém JSON válido: ${parseError.message}`);
            }
        }
        
        // Validar se é um array
        if (!Array.isArray(casosTeste)) {
            throw new Error('Resposta da IA não retornou um array de casos de teste');
        }
        
        // Processar casos de teste
        const casosProcessados = casosTeste.map((caso, index) => {
            let titulo = caso.titulo || caso.Titulo || '';
            let id = caso.id || caso.ID;
            
            // Se não tem ID, gerar baseado no último número
            if (!id || !id.match(/^CT\d+/i)) {
                id = `CT${String(ultimoNumeroCT + index + 1).padStart(3, '0')}`;
            }
            
            // Se o título não inclui o ID, adicionar
            if (titulo && !titulo.match(/^CT\d+/i)) {
                titulo = `${id} - ${titulo}`;
            } else if (!titulo) {
                titulo = id;
            }
            
            return { titulo: titulo };
        });
        
        // Log de tokens usados
        if (data.usage) {
            console.log('[AI] 📊 Tokens usados na geração de casos de teste funcionais:');
            console.log(`   - Prompt tokens: ${data.usage.prompt_tokens}`);
            console.log(`   - Completion tokens: ${data.usage.completion_tokens}`);
            console.log(`   - Total tokens: ${data.usage.total_tokens}`);
            if (data.usage.prompt_tokens_details) {
                console.log(`   - Cached tokens: ${data.usage.prompt_tokens_details.cached_tokens || 0}`);
            }
        }
        
        return {
            cenarios: casosProcessados,
            promptUtilizado: prompt,
            resumoDescricaoProduto: resumoGerado, // Incluir resumo quando gerado
            tokenInfo: data.usage ? {
                promptTokens: data.usage.prompt_tokens,
                completionTokens: data.usage.completion_tokens,
                totalTokens: data.usage.total_tokens
            } : null,
            modelUsado: data.model
        };
        
    } catch (error) {
        console.error('[AI] Erro ao gerar casos de teste:', error);
        handleSSLError(error);
        throw error;
    }
}

// Rota para gerar casos de teste funcionais
app.post('/api/generate-scenarios', verificarManutencaoMiddleware, verificarExecutarScriptIAMiddleware, async (req, res) => {
    try {
        const { inputData, testType, provider = 'openai', images, casosTesteExistentes, apenasTextoAdicional } = req.body;
        
        // Verificar flag inserirImagensProduto se houver imagens
        if (images && images.length > 0) {
            const flags = await carregarFlags();
            if (!flags.inserirImagensProduto) {
                return res.status(403).json({ 
                    error: 'A funcionalidade de inserir imagens foi desabilitada pelo administrador.' 
                });
            }
        }
        
        // Validações
        if (!inputData && (!images || images.length === 0)) {
            return res.status(400).json({ error: 'Contexto ou imagens devem ser fornecidos.' });
        }
        
        if (!AI_CONFIG[provider] || !AI_CONFIG[provider].enabled) {
            return res.status(400).json({ error: `Provedor ${provider} não está habilitado` });
        }
        
        // Calcular último número de CT
        let ultimoNumeroCT = 0;
        if (casosTesteExistentes && casosTesteExistentes.length > 0) {
            const numeros = casosTesteExistentes.map(ct => {
                const match = (ct.codigo || ct.titulo || '').match(/CT(\d+)/i);
                return match ? parseInt(match[1], 10) : 0;
            }).filter(n => n > 0);
            ultimoNumeroCT = numeros.length > 0 ? Math.max(...numeros) : 0;
        }
        
        let resultado;
        if (provider === 'openai') {
            resultado = await gerarCenariosFuncionalOpenAI(
                inputData || '',
                casosTesteExistentes || [],
                ultimoNumeroCT,
                images || [],
                testType || 'funcional',
                apenasTextoAdicional || false
            );
        } else {
            return res.status(400).json({ error: 'Provedor não suportado. Apenas OpenAI é suportado.' });
        }
        
        res.json({
            success: true,
            cenarios: resultado.cenarios,
            promptUtilizado: resultado.promptUtilizado,
            resumoDescricaoProduto: resultado.resumoDescricaoProduto || null,
            tokenInfo: resultado.tokenInfo,
            modelUsado: resultado.modelUsado
        });
        
    } catch (error) {
        console.error('[AI] Erro ao gerar cenários:', error);
        console.error('[AI] Stack trace:', error.stack);
        handleSSLError(error);
        res.status(500).json({ 
            error: error.message || 'Erro desconhecido ao gerar cenários',
            details: process.env.NODE_ENV === 'development' ? error.stack : undefined
        });
    }
});

// Rota removida: /api/analisar-cobertura - não está sendo usada
// A funcionalidade de análise de cobertura agora usa apenas /api/rastreabilidade-cobertura

// Função para reorganizar casos de teste usando OpenAI
async function reorganizarCasosTesteOpenAI(casosTeste, featureName = '') {
    const basePrompt = await getPromptReorganizacao();
    
    // Formatar lista de CTs com posições
    const totalCTs = casosTeste.length;
    let listaCTs = casosTeste.map((ct, index) => {
        const posicao = index + 1;
        const codigo = ct.codigo || (ct.titulo || '').match(/CT\d+/i)?.[0] || `CT${String(posicao).padStart(3, '0')}`;
        const titulo = (ct.titulo || '').replace(/^CT\d+\s*-\s*/i, '').trim() || 'Sem título';
        return `POSIÇÃO ${posicao} (CT: ${codigo}): ${codigo} - ${titulo}`;
    }).join('\n');
    
    // Montar prompt completo com substituições
    let prompt = basePrompt;
    prompt = prompt.replace(/\{featureName\}/g, featureName || 'Funcionalidade');
    prompt = prompt.replace(/\{totalCTs\}/g, totalCTs.toString());
    prompt = prompt.replace(/\{listaCTs\}/g, listaCTs);
    
    // Preparar mensagens para a API
    const messages = [
        {
            role: 'system',
            content: 'Você é um especialista em QA e organização de testes. Retorne APENAS um array JSON com os números de POSIÇÃO na nova ordem, sem explicações adicionais.'
        },
        {
            role: 'user',
            content: prompt
        }
    ];
    
    try {
        const requestBody = {
            model: 'gpt-4o',
            messages: messages,
            response_format: { type: 'json_object' },
            temperature: 0.3
        };
        
        console.log('[AI] Enviando requisição para reorganizar casos de teste...');
        console.log('[AI] Model:', requestBody.model);
        console.log('[AI] Total de CTs:', totalCTs);
        
        const response = await fetch('https://api.openai.com/v1/chat/completions', getFetchOptions({
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${currentOpenAIKey()}`
            },
            body: JSON.stringify(requestBody)
        }));
        
        console.log('[AI] Status da resposta:', response.status, response.statusText);
        
        if (!response.ok) {
            let errorMessage = `Erro na API OpenAI: ${response.statusText}`;
            let errorDetails = '';
            
            // Tratamento específico para diferentes códigos de erro HTTP
            if (response.status === 502) {
                errorMessage = 'Erro 502: Bad Gateway - O servidor da OpenAI está temporariamente indisponível ou sobrecarregado.';
                errorDetails = 'Isso geralmente é um problema temporário. Tente novamente em alguns segundos.';
            } else if (response.status === 503) {
                errorMessage = 'Erro 503: Service Unavailable - O serviço da OpenAI está temporariamente indisponível.';
                errorDetails = 'O serviço pode estar em manutenção ou sobrecarregado. Tente novamente em alguns minutos.';
            } else if (response.status === 504) {
                errorMessage = 'Erro 504: Gateway Timeout - A requisição demorou muito para ser processada.';
                errorDetails = 'O prompt pode ser muito grande ou o servidor está lento. Tente novamente ou reduza o tamanho do contexto.';
            } else if (response.status === 429) {
                errorMessage = 'Erro 429: Too Many Requests - Limite de requisições excedido.';
                errorDetails = 'Você excedeu o limite de requisições. Aguarde alguns minutos antes de tentar novamente.';
            } else if (response.status === 401) {
                errorMessage = 'Erro 401: Unauthorized - Chave da API inválida ou expirada.';
                errorDetails = 'Verifique se a chave da API está correta e válida no arquivo de configuração.';
            }
            
            try {
                const errorData = await response.json();
                const apiErrorMessage = errorData.error?.message || errorData.error || response.statusText;
                if (apiErrorMessage) {
                    errorMessage += `\nDetalhes: ${apiErrorMessage}`;
                }
            } catch (jsonError) {
                if (!errorDetails) {
                    errorMessage = `Erro na API OpenAI (${response.status}): ${response.statusText}`;
                }
            }
            
            if (errorDetails) {
                errorMessage += `\n\n${errorDetails}`;
            }
            
            throw new Error(errorMessage);
        }
        
        const data = await response.json();
        
        // Log de tokens usados
        if (data.usage) {
            console.log('[AI] 📊 Tokens usados na reorganização:');
            console.log(`   - Prompt tokens: ${data.usage.prompt_tokens}`);
            console.log(`   - Completion tokens: ${data.usage.completion_tokens}`);
            console.log(`   - Total tokens: ${data.usage.total_tokens}`);
            if (data.usage.prompt_tokens_details) {
                console.log(`   - Cached tokens: ${data.usage.prompt_tokens_details.cached_tokens || 0}`);
            }
        }
        
        // Validar resposta da API
        if (!data.choices || !Array.isArray(data.choices) || data.choices.length === 0) {
            throw new Error('Resposta da API OpenAI inválida: nenhuma escolha retornada');
        }
        
        if (!data.choices[0] || !data.choices[0].message) {
            throw new Error('Resposta da API OpenAI inválida: estrutura de mensagem inesperada');
        }
        
        // Verificar se há recusa (refusal)
        if (data.choices[0].message.refusal) {
            console.error('[AI] A API recusou processar o prompt. Motivo:', data.choices[0].message.refusal);
            throw new Error(`A API da OpenAI recusou processar o prompt: ${data.choices[0].message.refusal}`);
        }
        
        const respostaIA = data.choices[0].message.content;
        
        // Validar se há conteúdo na resposta
        if (!respostaIA || typeof respostaIA !== 'string' || respostaIA.trim().length === 0) {
            throw new Error('Resposta da IA está vazia ou inválida');
        }
        
        // Parsear JSON da resposta
        let resultado = null;
        try {
            resultado = JSON.parse(respostaIA);
        } catch (parseError) {
            console.error('[AI] Erro ao fazer parse do JSON:', parseError);
            console.error('[AI] Resposta recebida:', respostaIA.substring(0, 500));
            
            // Tentar extrair array JSON se houver texto adicional
            const arrayMatch = respostaIA.match(/\[[\s\S]*\]/);
            if (arrayMatch) {
                try {
                    resultado = JSON.parse(arrayMatch[0]);
                } catch (secondParseError) {
                    throw new Error(`Resposta da IA não contém JSON válido: ${parseError.message}`);
                }
            } else {
                throw new Error(`Resposta da IA não contém JSON válido: ${parseError.message}`);
            }
        }
        
        // Extrair array de posições
        let novaOrdem = null;
        
        // Se o resultado é um objeto, procurar por um array
        if (typeof resultado === 'object' && !Array.isArray(resultado)) {
            // Procurar por propriedades comuns que podem conter o array
            novaOrdem = resultado.ordem || resultado.order || resultado.posicoes || resultado.positions || resultado.array || resultado.resultado;
        } else if (Array.isArray(resultado)) {
            novaOrdem = resultado;
        }
        
        if (!novaOrdem || !Array.isArray(novaOrdem)) {
            throw new Error('Resposta da IA não contém um array de posições válido');
        }
        
        // Validar que o array tem o tamanho correto
        if (novaOrdem.length !== totalCTs) {
            throw new Error(`Array de posições tem tamanho incorreto. Esperado: ${totalCTs}, Recebido: ${novaOrdem.length}`);
        }
        
        // Validar que todos os números estão no range correto
        const numerosValidos = novaOrdem.every((num, index) => {
            const numInt = parseInt(num);
            return !isNaN(numInt) && numInt >= 1 && numInt <= totalCTs;
        });
        
        if (!numerosValidos) {
            throw new Error('Array de posições contém números inválidos. Todos devem estar entre 1 e ' + totalCTs);
        }
        
        // Validar que não há duplicatas
        const numerosUnicos = new Set(novaOrdem.map(n => parseInt(n)));
        if (numerosUnicos.size !== totalCTs) {
            throw new Error('Array de posições contém números duplicados');
        }
        
        // Reorganizar casos de teste conforme a nova ordem
        const casosReorganizados = novaOrdem.map((posicao, index) => {
            const posicaoOriginal = parseInt(posicao) - 1; // Converter para índice (0-based)
            const casoOriginal = casosTeste[posicaoOriginal];
            
            if (!casoOriginal) {
                throw new Error(`Posição ${posicao} não encontrada na lista original`);
            }
            
            // Criar novo caso com a nova posição
                return {
                ...casoOriginal,
                posicao: index + 1 // Nova posição na lista reorganizada
                };
            });
        
        return {
            casosReorganizados: casosReorganizados,
            promptUtilizado: prompt,
            tokenInfo: data.usage ? {
                promptTokens: data.usage.prompt_tokens,
                completionTokens: data.usage.completion_tokens,
                totalTokens: data.usage.total_tokens
            } : null,
            modelUsado: data.model
        };
        
    } catch (error) {
        console.error('[AI] Erro ao reorganizar casos de teste:', error);
        handleSSLError(error);
        throw error;
    }
}

// Rota para reorganizar casos de teste
app.post('/api/reorganize-test-cases', verificarManutencaoMiddleware, verificarExecutarScriptIAMiddleware, async (req, res) => {
    try {
        const { casosTeste, featureName, featureId, provider = 'openai' } = req.body;
        
        // Validações
        if (!casosTeste || !Array.isArray(casosTeste) || casosTeste.length === 0) {
            return res.status(400).json({ error: 'Lista de casos de teste não fornecida ou vazia.' });
        }
        
        if (casosTeste.length < 2) {
            return res.status(400).json({ error: 'É necessário pelo menos 2 casos de teste para reorganizar.' });
        }
        
        if (!AI_CONFIG[provider] || !AI_CONFIG[provider].enabled) {
            return res.status(400).json({ error: `Provedor ${provider} não está habilitado` });
        }
        
        let resultado;
        if (provider === 'openai') {
            resultado = await reorganizarCasosTesteOpenAI(
                casosTeste,
                featureName || ''
            );
        } else {
            return res.status(400).json({ error: 'Provedor não suportado. Apenas OpenAI é suportado.' });
        }
        
        res.json({
            success: true,
            casosReorganizados: resultado.casosReorganizados,
            promptUtilizado: resultado.promptUtilizado,
            tokenInfo: resultado.tokenInfo,
            modelUsado: resultado.modelUsado
        });
        
    } catch (error) {
        console.error('[AI] Erro ao reorganizar casos de teste:', error);
        handleSSLError(error);
        res.status(500).json({ error: error.message });
    }
});

// Função para analisar duplicatas usando OpenAI
async function analisarDuplicatasOpenAI(casosTeste) {
    const basePrompt = await getPromptAnaliseDuplicatas();
    
    // Formatar lista de CTs
    const totalCTs = casosTeste.length;
    let listaCTs = casosTeste.map((ct, index) => {
        // Extrair código do título se não foi fornecido separadamente
        let codigo = ct.codigo;
        if (!codigo && ct.titulo) {
            const codigoMatch = ct.titulo.match(/CT\d+/i);
            codigo = codigoMatch ? codigoMatch[0] : null;
        }
        // Se ainda não tiver código, gerar um baseado no índice
        if (!codigo) {
            codigo = `CT${String(index + 1).padStart(3, '0')}`;
        }
        // Extrair título sem o código (se estiver presente)
        let titulo = ct.titulo || 'Sem título';
        // Remover código CT do início do título se existir
        titulo = titulo.replace(/^CT\d+\s*-\s*/i, '').trim() || 'Sem título';
        // Remover códigos numéricos duplicados no início (ex: "001 - ")
        titulo = titulo.replace(/^\d+\s*-\s*/i, '').trim() || 'Sem título';
        // Remover informações sobre anexos (ex: "(sem anexos)", "(X anexos)", "(sem arquivos)")
        titulo = titulo.replace(/\s*\(sem\s+anexos?\)/gi, '').trim();
        titulo = titulo.replace(/\s*\(\d+\s+anexos?\)/gi, '').trim();
        titulo = titulo.replace(/\s*\(sem\s+arquivos?\)/gi, '').trim();
        titulo = titulo || 'Sem título';
        return `${codigo} - ${titulo}`;
    }).join('\n');
    
    // Log para debug
    console.log('[AI] Lista de CTs formatada para análise de duplicatas:');
    console.log(listaCTs);
    
    // Montar prompt completo com substituições
    let prompt = basePrompt;
    prompt = prompt.replace(/\{totalCTs\}/g, totalCTs.toString());
    prompt = prompt.replace(/\{listaCTs\}/g, listaCTs);
    
    // Preparar mensagens para a API
    const messages = [
        {
            role: 'system',
            content: 'Você é um especialista em QA e IA. Retorne APENAS um objeto JSON válido com a propriedade "analise" contendo um array de objetos, sem explicações adicionais.'
        },
        {
            role: 'user',
            content: prompt
        }
    ];
    
    try {
        const requestBody = {
            model: 'gpt-4o',
            messages: messages,
            response_format: { type: 'json_object' },
            temperature: 0.3
        };
        
        console.log('[AI] Enviando requisição para analisar duplicatas...');
        console.log('[AI] Model:', requestBody.model);
        console.log('[AI] Total de CTs:', totalCTs);
        
        const response = await fetch('https://api.openai.com/v1/chat/completions', getFetchOptions({
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${currentOpenAIKey()}`
            },
            body: JSON.stringify(requestBody)
        }));
        
        console.log('[AI] Status da resposta:', response.status, response.statusText);
        
        if (!response.ok) {
            let errorMessage = `Erro na API OpenAI: ${response.statusText}`;
            let errorDetails = '';
            
            // Tratamento específico para diferentes códigos de erro HTTP
            if (response.status === 502) {
                errorMessage = 'Erro 502: Bad Gateway - O servidor da OpenAI está temporariamente indisponível ou sobrecarregado.';
                errorDetails = 'Isso geralmente é um problema temporário. Tente novamente em alguns segundos.';
            } else if (response.status === 503) {
                errorMessage = 'Erro 503: Service Unavailable - O serviço da OpenAI está temporariamente indisponível.';
                errorDetails = 'O serviço pode estar em manutenção ou sobrecarregado. Tente novamente em alguns minutos.';
            } else if (response.status === 504) {
                errorMessage = 'Erro 504: Gateway Timeout - A requisição demorou muito para ser processada.';
                errorDetails = 'O prompt pode ser muito grande ou o servidor está lento. Tente novamente ou reduza o tamanho do contexto.';
            } else if (response.status === 429) {
                errorMessage = 'Erro 429: Too Many Requests - Limite de requisições excedido.';
                errorDetails = 'Você excedeu o limite de requisições. Aguarde alguns minutos antes de tentar novamente.';
            } else if (response.status === 401) {
                errorMessage = 'Erro 401: Unauthorized - Chave da API inválida ou expirada.';
                errorDetails = 'Verifique se a chave da API está correta e válida no arquivo de configuração.';
            }
            
            try {
                const errorData = await response.json();
                const apiErrorMessage = errorData.error?.message || errorData.error || response.statusText;
                if (apiErrorMessage) {
                    errorMessage += `\nDetalhes: ${apiErrorMessage}`;
                }
            } catch (jsonError) {
                if (!errorDetails) {
                    errorMessage = `Erro na API OpenAI (${response.status}): ${response.statusText}`;
                }
            }
            
            if (errorDetails) {
                errorMessage += `\n\n${errorDetails}`;
            }
            
            throw new Error(errorMessage);
        }
        
        const data = await response.json();
        
        // Log de tokens usados
        if (data.usage) {
            console.log('[AI] 📊 Tokens usados na análise de duplicatas:');
            console.log(`   - Prompt tokens: ${data.usage.prompt_tokens}`);
            console.log(`   - Completion tokens: ${data.usage.completion_tokens}`);
            console.log(`   - Total tokens: ${data.usage.total_tokens}`);
            if (data.usage.prompt_tokens_details) {
                console.log(`   - Cached tokens: ${data.usage.prompt_tokens_details.cached_tokens || 0}`);
            }
        }
        
        // Validar resposta da API
        if (!data.choices || !Array.isArray(data.choices) || data.choices.length === 0) {
            throw new Error('Resposta da API OpenAI inválida: nenhuma escolha retornada');
        }
        
        if (!data.choices[0] || !data.choices[0].message) {
            throw new Error('Resposta da API OpenAI inválida: estrutura de mensagem inesperada');
        }
        
        // Verificar se há recusa (refusal)
        if (data.choices[0].message.refusal) {
            console.error('[AI] A API recusou processar o prompt. Motivo:', data.choices[0].message.refusal);
            throw new Error(`A API da OpenAI recusou processar o prompt: ${data.choices[0].message.refusal}`);
        }
        
        const respostaIA = data.choices[0].message.content;
        
        // Validar se há conteúdo na resposta
        if (!respostaIA || typeof respostaIA !== 'string' || respostaIA.trim().length === 0) {
            throw new Error('Resposta da IA está vazia ou inválida');
        }
        
        // Parsear JSON da resposta
        let resultado = null;
        try {
            resultado = JSON.parse(respostaIA);
        } catch (parseError) {
            console.error('[AI] Erro ao fazer parse do JSON:', parseError);
            console.error('[AI] Resposta recebida:', respostaIA.substring(0, 500));
            
            // Tentar extrair JSON se houver texto adicional
            const jsonMatch = respostaIA.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                try {
                    resultado = JSON.parse(jsonMatch[0]);
                } catch (secondParseError) {
                    throw new Error(`Resposta da IA não contém JSON válido: ${parseError.message}`);
                }
            } else {
                throw new Error(`Resposta da IA não contém JSON válido: ${parseError.message}`);
            }
        }
        
        // Extrair array de análise
        let analise = null;
        
        if (resultado.analise && Array.isArray(resultado.analise)) {
            analise = resultado.analise;
        } else if (Array.isArray(resultado)) {
            // Se a resposta for diretamente um array
            analise = resultado;
        } else {
            throw new Error('Resposta da IA não contém um array de análise válido');
        }
        
        // Validar que o array tem o tamanho correto
        if (analise.length !== totalCTs) {
            throw new Error(`Array de análise tem tamanho incorreto. Esperado: ${totalCTs}, Recebido: ${analise.length}`);
        }
        
        // Validar estrutura de cada item
        for (let i = 0; i < analise.length; i++) {
            const item = analise[i];
            if (!item.ct || typeof item.ct !== 'string') {
                throw new Error(`Item ${i} da análise não contém campo "ct" válido`);
            }
            if (!item.status || (item.status !== 'ÚNICO' && item.status !== 'DUPLICATA')) {
                throw new Error(`Item ${i} da análise não contém campo "status" válido (deve ser "ÚNICO" ou "DUPLICATA")`);
            }
            if (!Array.isArray(item.referencias)) {
                throw new Error(`Item ${i} da análise não contém campo "referencias" válido (deve ser um array)`);
            }
        }
        
        return {
            analise: analise,
            promptUtilizado: prompt,
            tokenInfo: data.usage ? {
                promptTokens: data.usage.prompt_tokens,
                completionTokens: data.usage.completion_tokens,
                totalTokens: data.usage.total_tokens
            } : null,
            modelUsado: data.model
        };
        
    } catch (error) {
        console.error('[AI] Erro ao analisar duplicatas:', error);
        handleSSLError(error);
        throw error;
    }
}

// Rota para analisar duplicatas
app.post('/api/analyze-duplicates', verificarManutencaoMiddleware, verificarExecutarScriptIAMiddleware, async (req, res) => {
    try {
        const { casosTeste, provider = 'openai' } = req.body;
        
        // Validações
        if (!casosTeste || !Array.isArray(casosTeste) || casosTeste.length === 0) {
            return res.status(400).json({ error: 'Lista de casos de teste não fornecida ou vazia.' });
        }
        
        if (casosTeste.length < 2) {
            return res.status(400).json({ error: 'É necessário pelo menos 2 casos de teste para analisar duplicatas.' });
        }
        
        if (!AI_CONFIG[provider] || !AI_CONFIG[provider].enabled) {
            return res.status(400).json({ error: `Provedor ${provider} não está habilitado` });
        }
        
        let resultado;
        if (provider === 'openai') {
            resultado = await analisarDuplicatasOpenAI(casosTeste);
        } else {
            return res.status(400).json({ error: 'Provedor não suportado. Apenas OpenAI é suportado.' });
        }
        
        res.json({
            success: true,
            analise: resultado.analise,
            promptUtilizado: resultado.promptUtilizado,
            tokenInfo: resultado.tokenInfo,
            modelUsado: resultado.modelUsado
        });
        
    } catch (error) {
        console.error('[AI] Erro ao analisar duplicatas:', error);
        handleSSLError(error);
        res.status(500).json({ error: error.message });
    }
});

// Função para rastreabilidade de cobertura usando OpenAI
async function rastreabilidadeCoberturaOpenAI(resumoFeature, casosTeste, provider = 'openai', descricaoProdutoAtualizada = false, resumoDescricaoProduto = null, novoResumoDescricaoProduto = null) {
    // Verificar se deve usar prompt de comparação
    const usarPromptComparacao = descricaoProdutoAtualizada === true && 
                                  novoResumoDescricaoProduto && 
                                  novoResumoDescricaoProduto.trim().length > 0 &&
                                  resumoDescricaoProduto && 
                                  resumoDescricaoProduto.trim().length > 0;
    
    console.log('[AI] 🔍 [Rastreabilidade] Verificando condições para prompt de comparação:');
    console.log('[AI] 🔍 [Rastreabilidade] descricaoProdutoAtualizada:', descricaoProdutoAtualizada);
    console.log('[AI] 🔍 [Rastreabilidade] novoResumoDescricaoProduto existe:', !!novoResumoDescricaoProduto);
    console.log('[AI] 🔍 [Rastreabilidade] novoResumoDescricaoProduto tamanho:', novoResumoDescricaoProduto ? novoResumoDescricaoProduto.trim().length : 0);
    console.log('[AI] 🔍 [Rastreabilidade] resumoDescricaoProduto existe:', !!resumoDescricaoProduto);
    console.log('[AI] 🔍 [Rastreabilidade] resumoDescricaoProduto tamanho:', resumoDescricaoProduto ? resumoDescricaoProduto.trim().length : 0);
    console.log('[AI] 🔍 [Rastreabilidade] usarPromptComparacao (Prompt ID 11):', usarPromptComparacao);
    
    // Escolher o prompt baseado na condição
    let basePrompt;
    let promptId;
    if (usarPromptComparacao) {
        basePrompt = await getPromptRastreabilidadeCoberturaComComparacao();
        promptId = 11;
        console.log('[AI] ✅ [Rastreabilidade] Usando prompt de rastreabilidade com comparação (ID 11)');
        console.log('[AI] ✅ [Rastreabilidade] Resumo antigo (resumoDescricaoProduto):', resumoDescricaoProduto ? `${resumoDescricaoProduto.substring(0, 100)}...` : 'Nenhum');
        console.log('[AI] ✅ [Rastreabilidade] Resumo novo (novoResumoDescricaoProduto):', novoResumoDescricaoProduto ? `${novoResumoDescricaoProduto.substring(0, 100)}...` : 'Nenhum');
    } else {
        basePrompt = await getPromptRastreabilidadeCobertura();
        promptId = 10;
        console.log('[AI] ℹ️ [Rastreabilidade] Usando prompt de rastreabilidade padrão (ID 10)');
        if (descricaoProdutoAtualizada) {
            console.log('[AI] ⚠️ [Rastreabilidade] Motivo: descricaoProdutoAtualizada é true mas:', 
                !novoResumoDescricaoProduto ? 'novoResumoDescricaoProduto não existe' : 
                !resumoDescricaoProduto ? 'resumoDescricaoProduto não existe' : 
                'alguma condição não foi atendida');
        }
    }
    
    // Formatar lista de CTs
    let listaCTs = '';
    if (casosTeste && casosTeste.length > 0) {
        listaCTs = casosTeste.map(ct => {
            const codigo = ct.codigo || (ct.titulo || '').match(/CT\d+/i)?.[0] || '';
            let titulo = (ct.titulo || '').replace(/^CT\d+\s*-\s*/i, '').trim();
            // Remover códigos numéricos duplicados no início (ex: "001 - ")
            titulo = titulo.replace(/^\d+\s*-\s*/i, '').trim();
            // Remover informações sobre anexos (ex: "(sem anexos)", "(X anexos)", "(sem arquivos)")
            titulo = titulo.replace(/\s*\(sem\s+anexos?\)/gi, '').trim();
            titulo = titulo.replace(/\s*\(\d+\s+anexos?\)/gi, '').trim();
            titulo = titulo.replace(/\s*\(sem\s+arquivos?\)/gi, '').trim();
            titulo = titulo || 'Sem título';
            return `${codigo} - ${titulo}`;
        }).join('\n');
    } else {
        listaCTs = 'Nenhum caso de teste encontrado.';
    }
    
    // Montar prompt completo
    let prompt = basePrompt;
    if (usarPromptComparacao) {
        // Substituir placeholders específicos do prompt de comparação
        prompt = prompt.replace(/\{resumoFeatureAntiga\}/g, resumoDescricaoProduto || 'Nenhum resumo antigo fornecido.');
        prompt = prompt.replace(/\{resumoFeatureNova\}/g, novoResumoDescricaoProduto || 'Nenhum resumo novo fornecido.');
        console.log('[AI] 📝 [Rastreabilidade] Prompt de comparação: usando resumo antigo e novo resumo');
    } else {
        // Substituir placeholders do prompt padrão
        prompt = prompt.replace(/\{resumoFeature\}/g, resumoFeature || 'Nenhum resumo fornecido.');
    }
    prompt = prompt.replace(/\{listaCTs\}/g, listaCTs);
    
    // Preparar mensagens para a API
    const messages = [
        {
            role: 'system',
            content: 'Você é um especialista em rastreabilidade de testes. Retorne APENAS JSON válido, sem explicações adicionais.'
        },
        {
            role: 'user',
            content: prompt
        }
    ];
    
    try {
        const requestBody = {
            model: 'gpt-4o',
            messages: messages,
            response_format: { type: 'json_object' },
            temperature: 0 // Temperature zero para consistência
        };
        
        // Log completo do prompt usado
        console.log('[AI] ========================================');
        console.log('[AI] 📋 PROMPT DE RASTREABILIDADE USADO');
        console.log('[AI] ========================================');
        console.log(`[AI] 📋 Prompt ID: ${promptId}`);
        console.log(`[AI] 📋 Tipo: ${usarPromptComparacao ? 'Rastreabilidade com comparação (ID 11)' : 'Rastreabilidade padrão (ID 10)'}`);
        console.log('[AI] 📋 Prompt completo:');
        console.log(prompt);
        console.log('[AI] ========================================');
        console.log('[AI] Enviando requisição para rastreabilidade de cobertura...');
        console.log('[AI] 📝 Tamanho total do prompt:', prompt.length, 'caracteres');
        if (usarPromptComparacao) {
            console.log('[AI] 📝 Resumo antigo (primeiros 500 caracteres):', resumoDescricaoProduto ? resumoDescricaoProduto.substring(0, 500) : 'Nenhum resumo antigo');
            console.log('[AI] 📝 Resumo novo (primeiros 500 caracteres):', novoResumoDescricaoProduto ? novoResumoDescricaoProduto.substring(0, 500) : 'Nenhum resumo novo');
        } else {
            console.log('[AI] 📝 Resumo da feature (primeiros 500 caracteres):', resumoFeature ? resumoFeature.substring(0, 500) : 'Nenhum resumo');
        }
        console.log('[AI] 📝 Número de casos de teste:', casosTeste ? casosTeste.length : 0);
        
        const response = await fetch('https://api.openai.com/v1/chat/completions', getFetchOptions({
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${currentOpenAIKey()}`
            },
            body: JSON.stringify(requestBody)
        }));
        
        if (!response.ok) {
            let errorMessage = `Erro na API OpenAI: ${response.statusText}`;
            try {
                const errorData = await response.json();
                errorMessage = `Erro na API OpenAI: ${errorData.error?.message || errorData.error || response.statusText}`;
            } catch (jsonError) {
                errorMessage = `Erro na API OpenAI (${response.status}): ${response.statusText}`;
            }
            throw new Error(errorMessage);
        }
        
        const data = await response.json();
        
        if (!data.choices || !Array.isArray(data.choices) || data.choices.length === 0) {
            throw new Error('Resposta da API OpenAI inválida: nenhuma escolha retornada');
        }
        
        if (!data.choices[0] || !data.choices[0].message) {
            throw new Error('Resposta da API OpenAI inválida: estrutura de mensagem inesperada');
        }
        
        const respostaIA = data.choices[0].message.content;
        
        console.log('[AI] 📥 Resposta completa da IA recebida:');
        console.log('[AI] 📥 Tamanho da resposta:', respostaIA ? respostaIA.length : 0, 'caracteres');
        console.log('[AI] 📥 Resposta completa (primeiros 2000 caracteres):', respostaIA ? respostaIA.substring(0, 2000) : 'Resposta vazia');
        
        if (!respostaIA || typeof respostaIA !== 'string' || respostaIA.trim().length === 0) {
            throw new Error('Resposta da IA está vazia ou inválida');
        }
        
        // Parsear JSON da resposta
        let rastreabilidade = null;
        try {
            rastreabilidade = JSON.parse(respostaIA);
            console.log('[AI] ✅ JSON parseado com sucesso');
            console.log('[AI] 📊 Estrutura completa da rastreabilidade:', JSON.stringify(rastreabilidade, null, 2));
        } catch (parseError) {
            console.error('[AI] ❌ Erro ao fazer parse do JSON:', parseError);
            console.error('[AI] ❌ Resposta recebida (primeiros 1000 caracteres):', respostaIA.substring(0, 1000));
            throw new Error(`Resposta da IA não contém JSON válido: ${parseError.message}`);
        }
        
        // Validar estrutura
        if (!rastreabilidade.rastreabilidade || !Array.isArray(rastreabilidade.rastreabilidade)) {
            throw new Error('Resposta da IA não contém estrutura de rastreabilidade válida');
        }
        
        // Validar estrutura de comportamentos (novo formato)
        let totalSugestoes = 0;
        let totalSugestoesAtualizacao = 0;
        
        for (const topico of rastreabilidade.rastreabilidade) {
            if (!topico.comportamentos || !Array.isArray(topico.comportamentos)) {
                throw new Error('Resposta da IA não contém estrutura de comportamentos válida');
            }
            for (const comportamento of topico.comportamentos) {
                if (!comportamento.descricao) {
                    throw new Error('Resposta da IA não contém estrutura de comportamento válida: descrição ausente');
                }
                // Validar que casosTeste é um array (pode estar vazio para comportamentos não cobertos)
                if (!Array.isArray(comportamento.casosTeste)) {
                    // Se não for array, tentar converter ou inicializar como array vazio
                    if (comportamento.casosTeste === undefined || comportamento.casosTeste === null) {
                        comportamento.casosTeste = [];
                    } else {
                        throw new Error('Resposta da IA não contém estrutura de comportamento válida: casosTeste deve ser um array');
                    }
                }
                
                // Validar sugestoesAtualizacao (apenas para prompt de comparação - ID 11)
                if (usarPromptComparacao) {
                    // Remover casosDesatualizados se existir (não é mais necessário, pois temos sugestoesAtualizacao)
                    if (comportamento.casosDesatualizados !== undefined) {
                        delete comportamento.casosDesatualizados;
                    }
                    
                    // Validar sugestoesAtualizacao
                    if (comportamento.sugestoesAtualizacao !== undefined && comportamento.sugestoesAtualizacao !== null) {
                        if (!Array.isArray(comportamento.sugestoesAtualizacao)) {
                            throw new Error('Resposta da IA não contém estrutura de comportamento válida: sugestoesAtualizacao deve ser um array');
                        }
                        totalSugestoesAtualizacao += comportamento.sugestoesAtualizacao.length;
                        if (comportamento.sugestoesAtualizacao.length > 0) {
                            console.log(`[AI] ✅ Sugestões de atualização encontradas no tópico "${topico.topico}", comportamento "${comportamento.descricao}":`, comportamento.sugestoesAtualizacao);
                            // Validar formato das sugestões de atualização (devem incluir código do CT)
                            for (const sugestao of comportamento.sugestoesAtualizacao) {
                                if (typeof sugestao !== 'string' || !sugestao.match(/^CT\d+\s*-\s*.+$/)) {
                                    console.warn(`[AI] ⚠️ Formato inválido de sugestão de atualização: "${sugestao}". Deve estar no formato "CTXXX - Título atualizado"`);
                                }
                            }
                        }
                    } else {
                        comportamento.sugestoesAtualizacao = [];
                    }
                }
                
                // Validar que sugestoes é um array (opcional, apenas para comportamentos sem CTs)
                if (comportamento.sugestoes !== undefined && comportamento.sugestoes !== null) {
                    if (!Array.isArray(comportamento.sugestoes)) {
                        throw new Error('Resposta da IA não contém estrutura de comportamento válida: sugestoes deve ser um array');
                    }
                    
                    // Remover duplicatas: se o mesmo ID de CT aparecer em sugestoes e sugestoesAtualizacao,
                    // remover de sugestoes e manter apenas em sugestoesAtualizacao
                    if (comportamento.sugestoes.length > 0 && comportamento.sugestoesAtualizacao && comportamento.sugestoesAtualizacao.length > 0) {
                        // Função auxiliar para extrair ID do CT de uma sugestão
                        const extrairIdCT = (sugestao) => {
                            if (typeof sugestao !== 'string') return null;
                            const match = sugestao.match(/^(CT\d+)/i);
                            return match ? match[1].toUpperCase() : null;
                        };
                        
                        // Coletar IDs das sugestões de atualização
                        const idsSugestoesAtualizacao = new Set();
                        comportamento.sugestoesAtualizacao.forEach(sugestao => {
                            const id = extrairIdCT(sugestao);
                            if (id) {
                                idsSugestoesAtualizacao.add(id);
                            }
                        });
                        
                        // Filtrar sugestões removendo aquelas com IDs que aparecem em sugestoesAtualizacao
                        const sugestoesAntes = comportamento.sugestoes.length;
                        comportamento.sugestoes = comportamento.sugestoes.filter(sugestao => {
                            const id = extrairIdCT(sugestao);
                            if (id && idsSugestoesAtualizacao.has(id)) {
                                console.log(`[AI] 🔄 Removendo sugestão duplicada "${sugestao}" de sugestoes (já presente em sugestoesAtualizacao)`);
                                return false;
                            }
                            return true;
                        });
                        
                        if (sugestoesAntes > comportamento.sugestoes.length) {
                            console.log(`[AI] ✅ Removidas ${sugestoesAntes - comportamento.sugestoes.length} sugestão(ões) duplicada(s) do comportamento "${comportamento.descricao}"`);
                        }
                    }
                    
                    if (comportamento.sugestoes.length > 0) {
                        totalSugestoes += comportamento.sugestoes.length;
                        console.log(`[AI] ✅ Sugestões encontradas no tópico "${topico.topico}", comportamento "${comportamento.descricao}":`, comportamento.sugestoes);
                    }
                } else {
                    comportamento.sugestoes = [];
                    // Se não tem sugestões mas não tem CTs, logar para debug
                    if (comportamento.casosTeste.length === 0) {
                        console.log(`[AI] ⚠️ Comportamento sem CTs e sem sugestões: "${comportamento.descricao}"`);
                    }
                }
            }
        }
        
        // Validar casosIrrelevantes (apenas para prompt de comparação - ID 11)
        let casosIrrelevantes = [];
        if (usarPromptComparacao) {
            if (rastreabilidade.casosIrrelevantes !== undefined && rastreabilidade.casosIrrelevantes !== null) {
                if (!Array.isArray(rastreabilidade.casosIrrelevantes)) {
                    throw new Error('Resposta da IA não contém estrutura válida: casosIrrelevantes deve ser um array');
                }
                casosIrrelevantes = rastreabilidade.casosIrrelevantes;
                if (casosIrrelevantes.length > 0) {
                    console.log(`[AI] ⚠️ Casos irrelevantes encontrados (${casosIrrelevantes.length}):`, casosIrrelevantes);
                    // Validar formato dos casos irrelevantes (devem incluir código + título)
                    for (const caso of casosIrrelevantes) {
                        if (typeof caso !== 'string' || !caso.match(/^CT\d+\s*-\s*.+$/)) {
                            console.warn(`[AI] ⚠️ Formato inválido de caso irrelevante: "${caso}". Deve estar no formato "CTXXX - Título completo"`);
                        }
                    }
                }
            } else {
                casosIrrelevantes = [];
            }
        }
        
        console.log(`[AI] 📊 Total de sugestões encontradas: ${totalSugestoes}`);
        if (usarPromptComparacao) {
            console.log(`[AI] 📊 Total de sugestões de atualização encontradas: ${totalSugestoesAtualizacao}`);
            console.log(`[AI] 📊 Total de casos irrelevantes encontrados: ${casosIrrelevantes.length}`);
        }
        
        // Validar porcentagem de cobertura
        if (rastreabilidade.porcentagemCobertura === undefined || rastreabilidade.porcentagemCobertura === null) {
            throw new Error('Resposta da IA não contém porcentagem de cobertura');
        }
        
        // Log de tokens usados
        if (data.usage) {
            console.log('[AI] 📊 Tokens usados na rastreabilidade de cobertura:');
            console.log(`   - Prompt tokens: ${data.usage.prompt_tokens}`);
            console.log(`   - Completion tokens: ${data.usage.completion_tokens}`);
            console.log(`   - Total tokens: ${data.usage.total_tokens}`);
        }
        
        return {
            rastreabilidade: rastreabilidade.rastreabilidade,
            porcentagemCobertura: rastreabilidade.porcentagemCobertura,
            casosIrrelevantes: usarPromptComparacao ? casosIrrelevantes : [],
            promptUtilizado: prompt,
            promptId: promptId,
            usarPromptComparacao: usarPromptComparacao,
            tokenInfo: data.usage ? {
                promptTokens: data.usage.prompt_tokens,
                completionTokens: data.usage.completion_tokens,
                totalTokens: data.usage.total_tokens
            } : null,
            modelUsado: data.model
        };
        
    } catch (error) {
        console.error('[AI] Erro ao gerar rastreabilidade de cobertura:', error);
        handleSSLError(error);
        throw error;
    }
}

// Rota para rastreabilidade de cobertura
app.post('/api/rastreabilidade-cobertura', verificarManutencaoMiddleware, verificarExecutarScriptIAMiddleware, async (req, res) => {
    try {
        const { resumoFeature, casosTeste, provider = 'openai', descricaoProdutoAtualizada, contexto, images, resumoDescricaoProduto, novoResumoDescricaoProduto } = req.body;
        
        console.log('[AI] 🔍 [Rastreabilidade] Verificando condições para geração de resumo:');
        console.log('[AI] 🔍 [Rastreabilidade] descricaoProdutoAtualizada:', descricaoProdutoAtualizada);
        console.log('[AI] 🔍 [Rastreabilidade] novoResumoDescricaoProduto existe:', !!novoResumoDescricaoProduto);
        console.log('[AI] 🔍 [Rastreabilidade] contexto disponível:', contexto ? `Sim (${contexto.length} caracteres)` : 'Não');
        console.log('[AI] 🔍 [Rastreabilidade] images disponíveis:', images ? images.length : 0);
        
        let resumoFeatureParaUsar = resumoFeature;
        let novoResumoGerado = null;
        
        // Se descricaoProdutoAtualizada é true mas não há novoResumoDescricaoProduto, gerar um novo resumo PRIMEIRO
        if (descricaoProdutoAtualizada && (!novoResumoDescricaoProduto || novoResumoDescricaoProduto.trim().length === 0)) {
            console.log('[AI] 📝 [Rastreabilidade] descricaoProdutoAtualizada é true mas novoResumoDescricaoProduto não existe. Gerando novo resumo...');
            
            // Verificar se há contexto OU imagens para gerar o resumo
            const temContexto = contexto && contexto.trim().length > 0;
            const temImagens = images && images.length > 0;
            
            if (temContexto || temImagens) {
                console.log('[AI] 📝 [Rastreabilidade] Chamando resumirContextoFuncional para gerar novo resumo...');
                // Usar contexto mesmo que vazio se houver imagens, ou usar contexto se disponível
                const contextoParaResumo = contexto && contexto.trim().length > 0 ? contexto : (temImagens ? 'Analise as imagens fornecidas para gerar um resumo da funcionalidade.' : '');
                novoResumoGerado = await resumirContextoFuncional(contextoParaResumo, images || []);
                if (novoResumoGerado && novoResumoGerado.trim().length > 0) {
                    resumoFeatureParaUsar = novoResumoGerado;
                    console.log('[AI] ✅ [Rastreabilidade] Novo resumo gerado para novoResumoDescricaoProduto');
                    console.log('[AI] ✅ [Rastreabilidade] Tamanho do novo resumo gerado:', novoResumoGerado.length, 'caracteres');
                    console.log('[AI] ✅ [Rastreabilidade] Primeiros 200 caracteres do novo resumo:', novoResumoGerado.substring(0, 200) + '...');
                } else {
                    console.warn('[AI] ⚠️ [Rastreabilidade] Resumo gerado está vazio ou inválido');
                }
            } else {
                console.warn('[AI] ⚠️ [Rastreabilidade] Contexto e imagens estão vazios. Não é possível gerar novo resumo.');
                console.warn('[AI] ⚠️ [Rastreabilidade] Usando resumoFeature fornecido.');
            }
        } else if (descricaoProdutoAtualizada && novoResumoDescricaoProduto && novoResumoDescricaoProduto.trim().length > 0) {
            // Se já existe novoResumoDescricaoProduto, usar ele
            resumoFeatureParaUsar = novoResumoDescricaoProduto;
            console.log('[AI] ✅ [Rastreabilidade] Usando novoResumoDescricaoProduto existente do localStorage');
        }
        
        // Validações
        if (!resumoFeatureParaUsar || resumoFeatureParaUsar.trim().length === 0) {
            return res.status(400).json({ error: 'Resumo da feature não fornecido.' });
        }
        
        if (!casosTeste || !Array.isArray(casosTeste) || casosTeste.length === 0) {
            return res.status(400).json({ error: 'Lista de casos de teste não fornecida ou vazia.' });
        }
        
        if (!AI_CONFIG[provider] || !AI_CONFIG[provider].enabled) {
            return res.status(400).json({ error: `Provedor ${provider} não está habilitado` });
        }
        
        let resultado;
        if (provider === 'openai') {
            resultado = await rastreabilidadeCoberturaOpenAI(
                resumoFeatureParaUsar,
                casosTeste,
                provider,
                descricaoProdutoAtualizada || false,
                resumoDescricaoProduto || null,
                novoResumoDescricaoProduto || novoResumoGerado || null
            );
        } else {
            return res.status(400).json({ error: 'Provedor não suportado. Apenas OpenAI é suportado.' });
        }
        
        res.json({
            success: true,
            rastreabilidade: resultado.rastreabilidade,
            porcentagemCobertura: resultado.porcentagemCobertura,
            casosIrrelevantes: resultado.casosIrrelevantes || [],
            promptUtilizado: resultado.promptUtilizado,
            tokenInfo: resultado.tokenInfo,
            modelUsado: resultado.modelUsado,
            resumoDescricaoProduto: novoResumoGerado || null // Retornar o resumo gerado para salvar no localStorage
        });
        
    } catch (error) {
        console.error('[AI] Erro ao gerar rastreabilidade de cobertura:', error);
        handleSSLError(error);
        res.status(500).json({ error: error.message });
    }
});

// Rota de status
app.get('/api/status', (req, res) => {
    const k = currentOpenAIKey();
    res.json({
        status: 'OK',
        providers: {
            openai: AI_CONFIG.openai.enabled && !!k && !k.includes('sua-chave')
        }
    });
});

app.listen(PORT, () => {
    console.log(`🚀 Servidor IA rodando na porta ${PORT}`);
    console.log(`📊 Status: http://localhost:${PORT}/api/status`);
});
