// Carregar variáveis de ambiente do arquivo .env
// override: false garante que variáveis já definidas no ambiente não sejam sobrescritas
require('dotenv').config({ override: false });
const express = require('express');
const multer = require('multer');
const cors = require('cors');
const path = require('path');
const fs = require('fs-extra');
const archiver = require('archiver');
const yauzl = require('yauzl');

const app = express();
const PORT = process.env.PORT || 3001;

const USE_S3 = false;

console.log('🔍 Servidor principal: persistência apenas em arquivos locais (S3 desativado).');
console.log(`   NODE_ENV: ${process.env.NODE_ENV || 'não definido'}`);
console.log('');

// Trust proxy para obter protocolo/host corretos em produção (por trás de nginx, load balancer, etc)
app.set('trust proxy', 1);

// Middleware
app.use(cors());
app.use(express.json({ limit: '100mb' })); // Aumentar limite para suportar múltiplas imagens em base64
app.use(express.urlencoded({ extended: true, limit: '100mb' })); // Aumentar limite para urlencoded também

// Middleware para desabilitar cache em desenvolvimento
app.use((req, res, next) => {
  // Para arquivos HTML, CSS, JS - desabilitar cache completamente
  if (req.url.match(/\.(html|css|js)$/)) {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.setHeader('Surrogate-Control', 'no-store');
  }
  next();
});

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadPath = 'public/anexos';
    fs.ensureDirSync(uploadPath);
    cb(null, uploadPath);
  },
  filename: (req, file, cb) => {
    const timestamp = Date.now();
    const originalName = file.originalname;
    const extension = path.extname(originalName);
    const baseName = path.basename(originalName, extension);
    const fileName = `temp_${timestamp}_${baseName}${extension}`;
    cb(null, fileName);
  }
});

const upload = multer({ 
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB
  }
});

const ensureDirectories = () => {
  fs.ensureDirSync('public/features');
  fs.ensureDirSync('public/features/metadata');
  fs.ensureDirSync('public/features/metadata/json');
  fs.ensureDirSync('public/features/images');
  fs.ensureDirSync('public/anexos');
  fs.ensureDirSync('public/historico');
};

ensureDirectories();

// Helper para obter URL base da requisição (funciona com proxy reverso em produção)
function getBaseUrl(req) {
  const protocol = req.get('x-forwarded-proto') || req.protocol || 'http';
  const host = req.get('x-forwarded-host') || req.get('Host') || `localhost:${PORT}`;
  return `${protocol}://${host}`;
}

// Garantir arquivos JSON iniciais no disco (sem S3)
async function initializeLocalJsonFiles() {
  try {
    const dm = path.join(__dirname, '..', 'public', 'features', 'data-main.json');
    if (!(await fs.pathExists(dm))) {
      await fs.ensureDir(path.dirname(dm));
      await fs.writeJson(dm, {
        features: [],
        totalFeatures: 0,
        ultimaAtualizacao: new Date().toISOString()
      }, { spaces: 2 });
      console.log('📝 data-main.json criado em disco');
    }
    const flagsPath = path.join(__dirname, '..', 'public', 'json', 'flags.json');
    if (!(await fs.pathExists(flagsPath))) {
      await fs.ensureDir(path.dirname(flagsPath));
      await fs.writeJson(flagsPath, {
        manutencao: false,
        excluirDocumentacao: true,
        modalIA: true,
        executarScriptIA: false,
        revisarCTDuplicados: false,
        iaOpcaoFuncional: true,
        iaOpcaoRegressao: false,
        iaOpcaoIntegracao: false,
        iaOpcaoPerformance: false,
        iaOpcaoUsabilidade: false,
        inserirImagensProduto: false,
        organizarCT: false,
        iaCoberturaTeste: true,
        editarPrompts: true,
        forcarEdicaoDocumentacao: true,
        senhaEditarPrompts: true,
        senhaExcluirDocumentacao: true,
        senhaManutencao: true,
        senhaDownloadZip: true,
        senhaEdicaoMassa: true,
        recuperadorDados: true
      }, { spaces: 2 });
      console.log('📝 flags.json criado em disco');
    }
    const avPath = path.join(__dirname, '..', 'public', 'json', 'avaliate-ia.json');
    if (!(await fs.pathExists(avPath))) {
      await fs.ensureDir(path.dirname(avPath));
      await fs.writeJson(avPath, {
        avaliacoes: [],
        nota_avg: 0,
        quantidade: 0,
        ultima_atualizacao: ''
      }, { spaces: 2 });
      console.log('📝 avaliate-ia.json criado em disco');
    }
  } catch (e) {
    console.error('⚠️ Erro ao inicializar JSON locais:', e.message);
  }
}

initializeLocalJsonFiles();

// Função para gerar hash ID único de 6 caracteres
function generateHashId() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';
  for (let i = 0; i < 6; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

// Função para calcular taxa de aprovação baseada nos cenários
function calcularTaxaAprovacao(cenarios) {
  if (!cenarios || cenarios.length === 0) {
    return 0;
  }
  
  // Contar aprovados em relação ao TOTAL de cenários
  const totalCenarios = cenarios.length;
  const aprovados = cenarios.filter(c => c.status === 'aprovado').length;
  const taxa = Math.round((aprovados / totalCenarios) * 100);
  
  return taxa;
}

// Função para calcular taxa de execução: (aprovados + reprovados) / total × 100
function calcularTaxaExecucao(cenarios) {
  if (!cenarios || cenarios.length === 0) {
    return 0;
  }
  
  const totalCenarios = cenarios.length;
  const aprovados = cenarios.filter(c => c.status === 'aprovado').length;
  const reprovados = cenarios.filter(c => c.status === 'reprovado').length;
  const executados = aprovados + reprovados;
  const taxa = Math.round((executados / totalCenarios) * 100);
  
  return taxa;
}

function contarCasosPorFonte(cenarios) {
  if (!cenarios || cenarios.length === 0) {
    return { totalIA: 0, totalManual: 0 };
  }
  
  const totalIA = cenarios.filter(c => c.fonte === 'IA').length;
  const totalManual = cenarios.filter(c => c.fonte === 'usuário' || c.fonte === 'Usuário' || !c.fonte).length;
  
  return { totalIA, totalManual };
}

// ==================== FUNÇÕES AUXILIARES PARA S3/FILESYSTEM ====================

/**
 * Lê um arquivo JSON do S3 ou filesystem
 */
async function readJsonFile(relativePath) {
  if (USE_S3) {
    try {
      const buffer = await s3Service.downloadFile(relativePath);
      return JSON.parse(buffer.toString('utf-8'));
    } catch (error) {
      if (error.name === 'NoSuchKey' || error.$metadata?.httpStatusCode === 404) {
        return null; // Arquivo não existe
      }
      throw error;
    }
  } else {
    const fullPath = path.join(__dirname, '..', 'public', relativePath);
    if (await fs.pathExists(fullPath)) {
      return await fs.readJson(fullPath);
    }
    return null;
  }
}

/**
 * Escreve um arquivo JSON no S3 ou filesystem
 */
async function writeJsonFile(relativePath, data) {
  if (USE_S3) {
    const content = JSON.stringify(data, null, 2);
    await s3Service.uploadFile(Buffer.from(content, 'utf-8'), relativePath, 'application/json');
  } else {
    const fullPath = path.join(__dirname, '..', 'public', relativePath);
    await fs.ensureDir(path.dirname(fullPath));
    await fs.writeJson(fullPath, data, { spaces: 2 });
  }
}

/**
 * Verifica se um arquivo existe no S3 ou filesystem
 */
async function fileExists(relativePath) {
  if (USE_S3) {
    try {
      await s3Service.downloadFile(relativePath);
      return true;
    } catch (error) {
      return false;
    }
  } else {
    const fullPath = path.join(__dirname, '..', 'public', relativePath);
    return await fs.pathExists(fullPath);
  }
}

/**
 * Deleta um arquivo do S3 ou filesystem
 */
async function deleteFile(relativePath) {
  if (USE_S3) {
    await s3Service.deleteFile(relativePath);
  } else {
    const fullPath = path.join(__dirname, '..', 'public', relativePath);
    await fs.remove(fullPath);
  }
}

/**
 * Renomeia um arquivo no S3 ou filesystem
 */
async function renameFile(oldPath, newPath) {
  if (USE_S3) {
    // No S3, precisamos copiar e depois deletar
    const fileBuffer = await s3Service.downloadFile(oldPath);
    // Obter content type do arquivo usando o método do s3Service
    const contentType = s3Service.getContentType(oldPath) || 'application/octet-stream';
    await uploadBuffer(fileBuffer, newPath, contentType);
    await s3Service.deleteFile(oldPath);
  } else {
    const oldFullPath = path.join(__dirname, '..', 'public', oldPath);
    const newFullPath = path.join(__dirname, '..', 'public', newPath);
    await fs.move(oldFullPath, newFullPath);
  }
}

/**
 * Escreve um arquivo de texto/CSV no S3 ou filesystem
 */
async function writeTextFile(relativePath, content, contentType = 'text/plain') {
  if (USE_S3) {
    await s3Service.uploadFile(Buffer.from(content, 'utf-8'), relativePath, contentType);
  } else {
    const fullPath = path.join(__dirname, '..', 'public', relativePath);
    await fs.ensureDir(path.dirname(fullPath));
    await fs.writeFile(fullPath, content, 'utf-8');
  }
}

/**
 * Faz upload de um buffer para S3 ou filesystem
 */
async function uploadBuffer(buffer, relativePath, contentType = 'application/octet-stream') {
  if (USE_S3) {
    await s3Service.uploadFile(buffer, relativePath, contentType);
  } else {
    const fullPath = path.join(__dirname, '..', 'public', relativePath);
    await fs.ensureDir(path.dirname(fullPath));
    await fs.writeFile(fullPath, buffer);
  }
}

/**
 * Verifica se o sistema está em manutenção
 */
async function verificarManutencao() {
  try {
    const flags = await readJsonFile('json/flags.json');
    return flags && flags.manutencao === true;
  } catch (error) {
    // Se não conseguir ler, assumir que não está em manutenção
    console.warn('⚠️ Erro ao verificar flag de manutenção:', error.message);
    return false;
  }
}

/**
 * Middleware para verificar manutenção antes de processar requests
 */
async function verificarManutencaoMiddleware(req, res, next) {
  const emManutencao = await verificarManutencao();
  if (emManutencao) {
    return res.status(503).json({
      success: false,
      error: 'Sistema em manutenção',
      message: 'O sistema está temporariamente indisponível para criação e edição de documentos. Por favor, tente novamente mais tarde.'
    });
  }
  next();
}

// ==================== FUNÇÕES PARA GERENCIAR ZIP DE ANEXOS ====================

/**
 * Cria um ZIP com todos os anexos de uma feature e salva no S3 como HASH_ID.zip
 * @param {string} featureId - ID da feature (hash)
 * @returns {Promise<void>}
 */
async function criarZipAnexos(featureId) {
  try {
    console.log(`📦 Criando ZIP de anexos para feature ${featureId}...`);
    
    // Primeiro, verificar se já existe um ZIP e extrair os arquivos dele
    const zipKey = `anexos/${featureId}.zip`;
    const zipExists = await fileExists(zipKey);
    let arquivosDoZip = [];
    
    if (zipExists) {
      console.log(`📂 ZIP existente encontrado, extraindo lista de arquivos...`);
      try {
        // Extrair arquivos do ZIP existente para incluí-los no novo ZIP
        let zipBuffer;
        if (USE_S3) {
          zipBuffer = await s3Service.downloadFile(zipKey);
        } else {
          const fullPath = path.join(__dirname, '..', 'public', zipKey);
          zipBuffer = await fs.readFile(fullPath);
        }
        
        // Extrair nomes dos arquivos do ZIP sem baixar o conteúdo completo
        await new Promise((resolve, reject) => {
          yauzl.fromBuffer(zipBuffer, { lazyEntries: true }, (err, zipfile) => {
            if (err) {
              reject(err);
              return;
            }
            
            zipfile.readEntry();
            
            zipfile.on('entry', (entry) => {
              // Ignorar diretórios
              if (!/\/$/.test(entry.fileName)) {
                arquivosDoZip.push({
                  name: entry.fileName,
                  fromZip: true
                });
                console.log(`  📋 Arquivo encontrado no ZIP existente: ${entry.fileName}`);
              }
              zipfile.readEntry();
            });
            
            zipfile.on('end', () => {
              console.log(`  ✅ Total de arquivos encontrados no ZIP existente: ${arquivosDoZip.length}`);
              resolve();
            });
            
            zipfile.on('error', (err) => {
              reject(err);
            });
          });
        });
      } catch (zipError) {
        console.error(`⚠️  Erro ao ler ZIP existente:`, zipError);
        // Continuar mesmo se não conseguir ler o ZIP
      }
    }
    
    // Buscar todos os anexos da feature (arquivos individuais que ainda não foram incluídos no ZIP)
    // Não buscar mais arquivos individuais - apenas trabalhar com o ZIP
    // Os arquivos individuais não devem mais existir, apenas o ZIP
    let anexosIndividuais = [];
    
    // Verificar se há arquivos individuais legados (para migração)
    if (USE_S3) {
      const s3Files = await s3Service.listFiles('anexos/');
      console.log(`🔍 Total de arquivos em anexos/ no S3: ${s3Files.length}`);
      
      // Filtrar apenas arquivos individuais legados (não ZIPs)
      anexosIndividuais = s3Files
        .filter(file => {
          const fileName = path.basename(file.key);
          // Incluir apenas arquivos individuais legados (formato: HASH_CT001.ext) e excluir ZIPs
          const isArquivoIndividual = fileName.startsWith(`${featureId}_CT`) && !fileName.endsWith('.zip');
          if (isArquivoIndividual) {
            console.log(`  📄 Arquivo individual legado encontrado (será migrado para ZIP): ${fileName}`);
          }
          return isArquivoIndividual;
        })
        .map(file => ({
          key: file.key,
          name: path.basename(file.key),
          fromZip: false
        }));
      
      if (anexosIndividuais.length > 0) {
        console.log(`⚠️  Encontrados ${anexosIndividuais.length} arquivos individuais legados que serão migrados para ZIP`);
      }
    } else {
      // Listar arquivos do filesystem local (apenas legados)
      const anexosDir = path.join(__dirname, '..', 'public', 'anexos');
      if (await fs.pathExists(anexosDir)) {
        const files = await fs.readdir(anexosDir);
        anexosIndividuais = files
          .filter(file => file.startsWith(`${featureId}_CT`) && !file.endsWith('.zip'))
          .map(file => ({
            key: `anexos/${file}`,
            name: file,
            fromZip: false
          }));
        
        if (anexosIndividuais.length > 0) {
          console.log(`⚠️  Encontrados ${anexosIndividuais.length} arquivos individuais legados que serão migrados para ZIP`);
        }
      }
    }
    
    // Verificar o JSON da feature para garantir que todos os arquivos listados estejam incluídos
    const arquivosDoJson = [];
    try {
      const featureData = await readJsonFile(`features/metadata/json/${featureId}.json`);
      if (featureData && featureData.cenarios) {
        console.log(`📋 Verificando arquivos listados no JSON da feature...`);
        
        featureData.cenarios.forEach(cenario => {
          if (cenario.arquivos && Array.isArray(cenario.arquivos)) {
            cenario.arquivos.forEach(arquivo => {
              // Arquivo pode ser string ou objeto
              let nomeArquivo = typeof arquivo === 'string' ? arquivo : (arquivo.nome || arquivo.filename || '');
              
              // Se o nome não começa com o featureId, construir o nome completo
              if (nomeArquivo && !nomeArquivo.startsWith(featureId)) {
                const cenarioIdFormatted = String(cenario.id).padStart(3, '0');
                // Verificar se já tem o formato CT001.ext ou se precisa adicionar
                if (nomeArquivo.startsWith('CT')) {
                  nomeArquivo = `${featureId}_${nomeArquivo}`;
                } else {
                  // Tentar extrair extensão do nome original
                  const ext = path.extname(nomeArquivo) || path.extname(arquivo.originalName || '') || '.jpg';
                  nomeArquivo = `${featureId}_CT${cenarioIdFormatted}${ext}`;
                }
              }
              
              if (nomeArquivo && !arquivosDoJson.includes(nomeArquivo)) {
                arquivosDoJson.push(nomeArquivo);
                console.log(`  📄 Arquivo listado no JSON: ${nomeArquivo}`);
              }
            });
          }
        });
      }
    } catch (jsonError) {
      console.error(`⚠️  Erro ao verificar JSON da feature:`, jsonError);
      // Continuar mesmo se não conseguir ler o JSON
    }
    
    // Adicionar arquivos do JSON que não estão no ZIP nem como arquivos individuais
    for (const arquivoJson of arquivosDoJson) {
      const jaNoZip = arquivosDoZip.some(a => a.name === arquivoJson);
      const jaIndividual = anexosIndividuais.some(a => a.name === arquivoJson);
      
      if (!jaNoZip && !jaIndividual) {
        console.log(`  ⚠️  Arquivo listado no JSON mas não encontrado fisicamente: ${arquivoJson}`);
        // Tentar verificar se existe como arquivo individual (pode ter sido extraído do ZIP anteriormente)
        const existeComoIndividual = await fileExists(`anexos/${arquivoJson}`);
        if (existeComoIndividual) {
          console.log(`  ✅ Arquivo encontrado como individual, adicionando: ${arquivoJson}`);
          anexosIndividuais.push({
            key: `anexos/${arquivoJson}`,
            name: arquivoJson,
            fromZip: false
          });
        } else {
          console.log(`  ❌ Arquivo ${arquivoJson} listado no JSON mas não existe fisicamente - será ignorado`);
        }
      }
    }
    
    // Combinar arquivos do ZIP e arquivos individuais, mas usar o JSON como fonte de verdade
    // Apenas incluir arquivos que estão listados no JSON (para evitar incluir arquivos removidos)
    const todosAnexos = [];
    const nomesIncluidos = new Set();
    
    // Se temos arquivos no JSON, usar apenas esses (fonte de verdade)
    // Caso contrário, usar todos os arquivos encontrados
    const arquivosPermitidos = arquivosDoJson.length > 0 ? new Set(arquivosDoJson) : null;
    
    // Primeiro adicionar arquivos do ZIP existente (apenas se estiverem no JSON ou se não houver JSON)
    for (const arquivo of arquivosDoZip) {
      if (arquivosPermitidos === null || arquivosPermitidos.has(arquivo.name)) {
        if (!nomesIncluidos.has(arquivo.name)) {
          todosAnexos.push(arquivo);
          nomesIncluidos.add(arquivo.name);
          console.log(`  ✅ Arquivo do ZIP incluído: ${arquivo.name}`);
        }
      } else {
        console.log(`  🚫 Arquivo do ZIP excluído (não está no JSON): ${arquivo.name}`);
      }
    }
    
    // Depois adicionar arquivos individuais (que podem ser novos ou atualizados)
    // Apenas se estiverem no JSON ou se não houver JSON
    for (const arquivo of anexosIndividuais) {
      if (arquivosPermitidos === null || arquivosPermitidos.has(arquivo.name)) {
        if (!nomesIncluidos.has(arquivo.name)) {
          todosAnexos.push(arquivo);
          nomesIncluidos.add(arquivo.name);
          console.log(`  ✅ Arquivo individual incluído: ${arquivo.name}`);
        } else {
          // Se já existe, substituir pelo arquivo individual (mais recente)
          const index = todosAnexos.findIndex(a => a.name === arquivo.name);
          if (index !== -1) {
            todosAnexos[index] = arquivo;
            console.log(`  🔄 Arquivo substituído pelo individual (mais recente): ${arquivo.name}`);
          }
        }
      } else {
        console.log(`  🚫 Arquivo individual excluído (não está no JSON): ${arquivo.name}`);
      }
    }
    
    // Verificar se todos os arquivos do JSON estão incluídos
    const arquivosFaltando = arquivosDoJson.filter(arquivoJson => !nomesIncluidos.has(arquivoJson));
    if (arquivosFaltando.length > 0) {
      console.warn(`⚠️  ATENÇÃO: ${arquivosFaltando.length} arquivo(s) listado(s) no JSON mas não encontrado(s) fisicamente:`, arquivosFaltando);
    }
    
    if (todosAnexos.length === 0) {
      console.log(`⚠️  Nenhum anexo encontrado para feature ${featureId}`);
      
      // Se não há arquivos, remover ZIP se existir
      const zipKey = `anexos/${featureId}.zip`;
      const zipExists = await fileExists(zipKey);
      if (zipExists) {
        await deleteFile(zipKey);
        console.log(`  🗑️  ZIP removido (nenhum anexo): ${zipKey}`);
      }
      
      return;
    }
    
    console.log(`📋 Resumo de arquivos a incluir no ZIP:`);
    console.log(`   - Do ZIP existente: ${arquivosDoZip.length}`);
    console.log(`   - Arquivos individuais: ${anexosIndividuais.length}`);
    console.log(`   - Total único: ${todosAnexos.length}`);
    console.log(`   - Arquivos: ${todosAnexos.map(a => a.name).join(', ')}`);
    
    // Criar ZIP em memória usando archiver (já existente no projeto)
    const zipBuffer = await new Promise((resolve, reject) => {
      const archive = archiver('zip', {
        zlib: { level: 9 } // Máxima compressão
      });
      
      const chunks = [];
      
      archive.on('data', (chunk) => {
        chunks.push(chunk);
      });
      
      archive.on('end', () => {
        resolve(Buffer.concat(chunks));
      });
      
      archive.on('error', (err) => {
        reject(err);
      });
      
      // Adicionar cada arquivo ao ZIP
      (async () => {
        let arquivosAdicionados = 0;
        let arquivosComErro = 0;
        
        for (const anexo of todosAnexos) {
          try {
            let buffer;
            
            if (anexo.fromZip) {
              // Arquivo vem do ZIP existente, precisamos extrair do ZIP
              try {
                let zipBuffer;
                if (USE_S3) {
                  zipBuffer = await s3Service.downloadFile(zipKey);
                } else {
                  const fullPath = path.join(__dirname, '..', 'public', zipKey);
                  zipBuffer = await fs.readFile(fullPath);
                }
                
                // Extrair arquivo específico do ZIP
                await new Promise((resolve, rejectZip) => {
                  yauzl.fromBuffer(zipBuffer, { lazyEntries: true }, (err, zipfile) => {
                    if (err) {
                      rejectZip(err);
                      return;
                    }
                    
                    zipfile.readEntry();
                    
                    zipfile.on('entry', (entry) => {
                      if (entry.fileName === anexo.name && !/\/$/.test(entry.fileName)) {
                        zipfile.openReadStream(entry, (err, readStream) => {
                          if (err) {
                            rejectZip(err);
                            return;
                          }
                          
                          const chunks = [];
                          readStream.on('data', (chunk) => chunks.push(chunk));
                          readStream.on('end', () => {
                            buffer = Buffer.concat(chunks);
                            archive.append(buffer, { name: anexo.name });
                            console.log(`  ✅ Adicionado ao ZIP (do ZIP existente): ${anexo.name}`);
                            arquivosAdicionados++;
                            resolve();
                          });
                          readStream.on('error', rejectZip);
                        });
                      } else {
                        zipfile.readEntry();
                      }
                    });
                    
                    zipfile.on('end', () => {
                      // Se chegou aqui sem encontrar o arquivo, rejeitar
                      rejectZip(new Error(`Arquivo ${anexo.name} não encontrado no ZIP`));
                    });
                    
                    zipfile.on('error', rejectZip);
                  });
                });
              } catch (extractError) {
                console.error(`  ⚠️  Erro ao extrair ${anexo.name} do ZIP existente:`, extractError);
                arquivosComErro++;
                // Continuar com próximo arquivo
                continue;
              }
            } else {
              // Arquivo individual, baixar normalmente
              console.log(`  📥 Baixando arquivo individual: ${anexo.key}`);
              
              if (USE_S3) {
                buffer = await s3Service.downloadFile(anexo.key);
              } else {
                const fullPath = path.join(__dirname, '..', 'public', anexo.key);
                buffer = await fs.readFile(fullPath);
              }
              
              // Adicionar ao ZIP mantendo o nome original do arquivo
              archive.append(buffer, { name: anexo.name });
              console.log(`  ✅ Adicionado ao ZIP (individual): ${anexo.name} (${buffer.length} bytes)`);
              arquivosAdicionados++;
            }
          } catch (fileError) {
            console.error(`  ❌ Erro ao processar arquivo ${anexo.name}:`, fileError);
            arquivosComErro++;
            // Continuar com próximo arquivo mesmo se houver erro
            continue;
          }
        }
        
        console.log(`📊 Resumo da criação do ZIP: ${arquivosAdicionados} arquivo(s) adicionado(s), ${arquivosComErro} erro(s)`);
        
        // Finalizar o arquivo
        archive.finalize();
      })().catch(reject);
    });
    
    // Salvar ZIP no S3 como HASH_ID.zip (zipKey já foi declarado no início da função)
    await uploadBuffer(zipBuffer, zipKey, 'application/zip');
    
    console.log(`✅ ZIP criado e salvo: ${zipKey} (${todosAnexos.length} arquivo(s))`);
    
    // Remover arquivos individuais do S3/filesystem após criar o ZIP com sucesso
    // Isso mantém apenas o ZIP no S3, economizando espaço
    for (const anexo of todosAnexos) {
      // Só remover arquivos individuais, não os que vieram do ZIP
      if (!anexo.fromZip && anexo.key) {
        try {
          await deleteFile(anexo.key);
          console.log(`  🗑️  Removido arquivo individual: ${anexo.key}`);
        } catch (error) {
          console.error(`  ⚠️  Erro ao remover arquivo individual ${anexo.key}:`, error.message);
          // Não falha se não conseguir remover, apenas loga o erro
        }
      }
    }
    
  } catch (error) {
    console.error(`❌ Erro ao criar ZIP de anexos para feature ${featureId}:`, error);
    throw error;
  }
}

/**
 * Extrai arquivos do ZIP de uma feature e os disponibiliza temporariamente
 * @param {string} featureId - ID da feature (hash)
 * @returns {Promise<Array>} Array com informações dos arquivos extraídos
 */
async function extrairZipAnexos(featureId) {
  try {
    const zipKey = `anexos/${featureId}.zip`;
    
    // Verificar se o ZIP existe
    const zipExists = await fileExists(zipKey);
    if (!zipExists) {
      console.log(`⚠️  ZIP não encontrado para feature ${featureId}: ${zipKey}`);
      return [];
    }
    
    // Baixar ZIP
    let zipBuffer;
    if (USE_S3) {
      zipBuffer = await s3Service.downloadFile(zipKey);
    } else {
      const fullPath = path.join(__dirname, '..', 'public', zipKey);
      zipBuffer = await fs.readFile(fullPath);
    }
    
    // Extrair ZIP usando yauzl
    const arquivosExtraidos = [];
    
    await new Promise((resolve, reject) => {
      yauzl.fromBuffer(zipBuffer, { lazyEntries: true }, (err, zipfile) => {
        if (err) {
          reject(err);
          return;
        }
        
        zipfile.readEntry();
        
        zipfile.on('entry', async (entry) => {
          // Ignorar diretórios
          if (/\/$/.test(entry.fileName)) {
            zipfile.readEntry();
            return;
          }
          
          // Ler conteúdo do arquivo
          zipfile.openReadStream(entry, async (err, readStream) => {
            if (err) {
              console.error(`  ⚠️  Erro ao ler entrada ${entry.fileName}:`, err);
              zipfile.readEntry();
              return;
            }
            
            // Coletar chunks do stream
            const chunks = [];
            readStream.on('data', (chunk) => {
              chunks.push(chunk);
            });
            
            readStream.on('end', async () => {
              try {
                const fileBuffer = Buffer.concat(chunks);
                const fileName = entry.fileName;
                
                console.log(`  📦 Processando arquivo do ZIP: ${fileName} (${fileBuffer.length} bytes)`);
                
                // Salvar arquivo temporariamente (para acesso rápido)
                const tempKey = `anexos/${fileName}`;
                
                // Determinar content type baseado na extensão
                const ext = path.extname(fileName).toLowerCase();
                const contentTypes = {
                  '.pdf': 'application/pdf',
                  '.jpg': 'image/jpeg',
                  '.jpeg': 'image/jpeg',
                  '.png': 'image/png',
                  '.gif': 'image/gif',
                  '.txt': 'text/plain',
                  '.doc': 'application/msword',
                  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                  '.xls': 'application/vnd.ms-excel',
                  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                };
                const contentType = contentTypes[ext] || 'application/octet-stream';
                
                // Salvar arquivo extraído
                console.log(`  💾 Salvando arquivo extraído: ${tempKey}`);
                await uploadBuffer(fileBuffer, tempKey, contentType);
                
                // Verificar se o arquivo foi salvo corretamente
                const arquivoSalvo = await fileExists(tempKey);
                if (arquivoSalvo) {
                  console.log(`  ✅ Arquivo salvo e verificado: ${tempKey}`);
                } else {
                  console.error(`  ❌ Arquivo não foi salvo corretamente: ${tempKey}`);
                }
                
                arquivosExtraidos.push({
                  filename: fileName,
                  size: fileBuffer.length,
                  contentType: contentType
                });
                
                console.log(`  ✅ Extraído: ${fileName}`);
                
                // Ler próxima entrada
                zipfile.readEntry();
              } catch (saveError) {
                console.error(`  ❌ Erro ao salvar arquivo extraído:`, saveError);
                zipfile.readEntry();
              }
            });
            
            readStream.on('error', (err) => {
              console.error(`  ⚠️  Erro no stream de ${entry.fileName}:`, err);
              zipfile.readEntry();
            });
          });
        });
        
        zipfile.on('end', () => {
          resolve();
        });
        
        zipfile.on('error', (err) => {
          reject(err);
        });
      });
    });
    
    console.log(`✅ ZIP extraído: ${zipKey} (${arquivosExtraidos.length} arquivo(s))`);
    return arquivosExtraidos;
    
  } catch (error) {
    console.error(`❌ Erro ao extrair ZIP de anexos para feature ${featureId}:`, error);
    throw error;
  }
}

/**
 * Cria ou atualiza o ZIP de histórico para uma feature
 * Adiciona o novo CSV ao ZIP existente ou cria um novo ZIP
 * @param {string} featureId - ID da feature (hash)
 * @param {string} csvFileName - Nome do arquivo CSV a ser adicionado
 * @param {Buffer} csvContent - Conteúdo do arquivo CSV
 * @returns {Promise<void>}
 */
async function criarZipHistorico(featureId, csvFileName, csvContent) {
  try {
    console.log(`📦 Criando/atualizando ZIP de histórico para feature ${featureId}...`);
    
    const zipKey = `historico/${featureId}.zip`;
    const zipExists = await fileExists(zipKey);
    let arquivosDoZip = [];
    
    // Se o ZIP existe, extrair lista de arquivos existentes
    if (zipExists) {
      console.log(`📂 ZIP existente encontrado, extraindo lista de arquivos...`);
      try {
        let zipBuffer;
        if (USE_S3) {
          zipBuffer = await s3Service.downloadFile(zipKey);
        } else {
          const fullPath = path.join(__dirname, '..', 'public', zipKey);
          zipBuffer = await fs.readFile(fullPath);
        }
        
        await new Promise((resolve, reject) => {
          yauzl.fromBuffer(zipBuffer, { lazyEntries: true }, (err, zipfile) => {
            if (err) {
              reject(err);
              return;
            }
            
            zipfile.readEntry();
            
            zipfile.on('entry', (entry) => {
              if (!/\/$/.test(entry.fileName)) {
                arquivosDoZip.push({
                  name: entry.fileName,
                  fromZip: true
                });
                console.log(`  📋 Arquivo encontrado no ZIP existente: ${entry.fileName}`);
              }
              zipfile.readEntry();
            });
            
            zipfile.on('end', () => {
              console.log(`  ✅ Total de arquivos encontrados no ZIP existente: ${arquivosDoZip.length}`);
              resolve();
            });
            
            zipfile.on('error', (err) => {
              reject(err);
            });
          });
        });
      } catch (zipError) {
        console.error(`⚠️  Erro ao ler ZIP existente:`, zipError);
      }
    }
    
    // Buscar arquivos CSV individuais legados (para migração)
    let csvsIndividuais = [];
    
    if (USE_S3) {
      const s3Files = await s3Service.listFiles('historico/');
      csvsIndividuais = s3Files
        .filter(file => {
          const fileName = path.basename(file.key);
          return fileName.startsWith(`${featureId}_`) && fileName.endsWith('.csv') && !fileName.endsWith('.zip');
        })
        .map(file => ({
          key: file.key,
          name: path.basename(file.key),
          fromZip: false
        }));
    } else {
      const historicoDir = path.join(__dirname, '..', 'public', 'historico');
      if (await fs.pathExists(historicoDir)) {
        const files = await fs.readdir(historicoDir);
        csvsIndividuais = files
          .filter(file => file.startsWith(`${featureId}_`) && file.endsWith('.csv'))
          .map(file => ({
            key: `historico/${file}`,
            name: file,
            fromZip: false
          }));
      }
    }
    
    // Combinar arquivos do ZIP e arquivos individuais
    const todosCsvs = [];
    const nomesIncluidos = new Set();
    
    // Adicionar arquivos do ZIP existente
    for (const arquivo of arquivosDoZip) {
      if (!nomesIncluidos.has(arquivo.name)) {
        todosCsvs.push(arquivo);
        nomesIncluidos.add(arquivo.name);
      }
    }
    
    // Adicionar arquivos individuais (substituindo se já existir no ZIP)
    for (const arquivo of csvsIndividuais) {
      if (!nomesIncluidos.has(arquivo.name)) {
        todosCsvs.push(arquivo);
        nomesIncluidos.add(arquivo.name);
      } else {
        // Substituir pelo arquivo individual (mais recente)
        const index = todosCsvs.findIndex(a => a.name === arquivo.name);
        if (index !== -1) {
          todosCsvs[index] = arquivo;
        }
      }
    }
    
    // Adicionar o novo arquivo CSV (ou substituir se já existir)
    const indexNovo = todosCsvs.findIndex(a => a.name === csvFileName);
    if (indexNovo !== -1) {
      todosCsvs[indexNovo] = {
        name: csvFileName,
        content: csvContent,
        fromZip: false,
        isNew: true
      };
    } else {
      todosCsvs.push({
        name: csvFileName,
        content: csvContent,
        fromZip: false,
        isNew: true
      });
    }
    
    if (todosCsvs.length === 0) {
      console.log(`⚠️  Nenhum CSV encontrado para feature ${featureId}, não será criado ZIP`);
      return;
    }
    
    console.log(`📋 Resumo de arquivos a incluir no ZIP:`);
    console.log(`   - Do ZIP existente: ${arquivosDoZip.length}`);
    console.log(`   - Arquivos individuais: ${csvsIndividuais.length}`);
    console.log(`   - Novo arquivo: ${csvFileName}`);
    console.log(`   - Total único: ${todosCsvs.length}`);
    
    // Criar novo ZIP
    const zipBuffer = await new Promise((resolve, reject) => {
      const archive = archiver('zip', { zlib: { level: 9 } });
      const chunks = [];
      
      archive.on('data', (chunk) => {
        chunks.push(chunk);
      });
      
      archive.on('end', () => {
        resolve(Buffer.concat(chunks));
      });
      
      archive.on('error', (err) => {
        reject(err);
      });
      
      (async () => {
        for (const csv of todosCsvs) {
          let buffer;
          
          if (csv.isNew) {
            // Usar o conteúdo fornecido
            buffer = csv.content;
            archive.append(buffer, { name: csv.name });
            console.log(`  ✅ Adicionado ao ZIP (novo): ${csv.name}`);
          } else if (csv.fromZip) {
            // Extrair do ZIP existente
            try {
              let zipBuffer;
              if (USE_S3) {
                zipBuffer = await s3Service.downloadFile(zipKey);
              } else {
                const fullPath = path.join(__dirname, '..', 'public', zipKey);
                zipBuffer = await fs.readFile(fullPath);
              }
              
              await new Promise((resolveZip, rejectZip) => {
                yauzl.fromBuffer(zipBuffer, { lazyEntries: true }, (err, zipfile) => {
                  if (err) {
                    rejectZip(err);
                    return;
                  }
                  
                  zipfile.readEntry();
                  
                  zipfile.on('entry', (entry) => {
                    if (entry.fileName === csv.name && !/\/$/.test(entry.fileName)) {
                      zipfile.openReadStream(entry, (err, readStream) => {
                        if (err) {
                          rejectZip(err);
                          return;
                        }
                        
                        const chunks = [];
                        readStream.on('data', (chunk) => chunks.push(chunk));
                        readStream.on('end', () => {
                          buffer = Buffer.concat(chunks);
                          archive.append(buffer, { name: csv.name });
                          console.log(`  ✅ Adicionado ao ZIP (do ZIP existente): ${csv.name}`);
                          resolveZip();
                        });
                        readStream.on('error', rejectZip);
                      });
                    } else {
                      zipfile.readEntry();
                    }
                  });
                  
                  zipfile.on('end', () => {
                    rejectZip(new Error(`Arquivo ${csv.name} não encontrado no ZIP`));
                  });
                  
                  zipfile.on('error', rejectZip);
                });
              });
            } catch (extractError) {
              console.error(`  ⚠️  Erro ao extrair ${csv.name} do ZIP existente:`, extractError);
              continue;
            }
          } else {
            // Baixar arquivo individual
            if (USE_S3) {
              buffer = await s3Service.downloadFile(csv.key);
            } else {
              const fullPath = path.join(__dirname, '..', 'public', csv.key);
              buffer = await fs.readFile(fullPath);
            }
            archive.append(buffer, { name: csv.name });
            console.log(`  ✅ Adicionado ao ZIP (individual): ${csv.name}`);
          }
        }
        
        archive.finalize();
      })().catch(reject);
    });
    
    // Salvar novo ZIP
    await uploadBuffer(zipBuffer, zipKey, 'application/zip');
    console.log(`✅ ZIP criado/atualizado e salvo: ${zipKey} (${todosCsvs.length} arquivo(s))`);
    
    // Remover arquivos individuais após criar ZIP (exceto o que acabamos de salvar)
    for (const csv of csvsIndividuais) {
      if (csv.name !== csvFileName) {
        try {
          await deleteFile(csv.key);
          console.log(`  🗑️  Removido arquivo individual: ${csv.key}`);
        } catch (error) {
          console.error(`  ⚠️  Erro ao remover arquivo individual ${csv.key}:`, error.message);
        }
      }
    }
    
  } catch (error) {
    console.error(`❌ Erro ao criar/atualizar ZIP de histórico para feature ${featureId}:`, error);
    throw error;
  }
}

/**
 * Extrai arquivos CSV do ZIP de histórico para uso temporário
 * @param {string} featureId - ID da feature (hash)
 * @returns {Promise<Array>} Lista de arquivos extraídos
 */
async function extrairZipHistorico(featureId) {
  try {
    const zipKey = `historico/${featureId}.zip`;
    const zipExists = await fileExists(zipKey);
    
    if (!zipExists) {
      console.log(`⚠️  ZIP não encontrado para feature ${featureId}: ${zipKey}`);
      return [];
    }
    
    let zipBuffer;
    if (USE_S3) {
      zipBuffer = await s3Service.downloadFile(zipKey);
    } else {
      const fullPath = path.join(__dirname, '..', 'public', zipKey);
      zipBuffer = await fs.readFile(fullPath);
    }
    
    const arquivosExtraidos = [];
    
    await new Promise((resolve, reject) => {
      yauzl.fromBuffer(zipBuffer, { lazyEntries: true }, (err, zipfile) => {
        if (err) {
          reject(err);
          return;
        }
        
        zipfile.readEntry();
        
        zipfile.on('entry', async (entry) => {
          if (/\/$/.test(entry.fileName)) {
            zipfile.readEntry();
            return;
          }
          
          zipfile.openReadStream(entry, async (err, readStream) => {
            if (err) {
              console.error(`  ⚠️  Erro ao ler entrada ${entry.fileName}:`, err);
              zipfile.readEntry();
              return;
            }
            
            const chunks = [];
            readStream.on('data', (chunk) => {
              chunks.push(chunk);
            });
            
            readStream.on('end', async () => {
              try {
                const fileBuffer = Buffer.concat(chunks);
                const fileName = entry.fileName;
                console.log(`  📦 Processando arquivo do ZIP: ${fileName} (${fileBuffer.length} bytes)`);
                
                const tempKey = `historico/${fileName}`;
                console.log(`  💾 Salvando arquivo extraído: ${tempKey}`);
                await uploadBuffer(fileBuffer, tempKey, 'text/csv');
                
                const arquivoSalvo = await fileExists(tempKey);
                if (arquivoSalvo) {
                  console.log(`  ✅ Arquivo salvo e verificado: ${tempKey}`);
                } else {
                  console.error(`  ❌ Arquivo não foi salvo corretamente: ${tempKey}`);
                }
                
                arquivosExtraidos.push({
                  filename: fileName,
                  size: fileBuffer.length
                });
                console.log(`  ✅ Extraído: ${fileName}`);
                
                zipfile.readEntry();
              } catch (saveError) {
                console.error(`  ❌ Erro ao salvar arquivo extraído ${entry.fileName}:`, saveError);
                zipfile.readEntry();
              }
            });
            
            readStream.on('error', (err) => {
              console.error(`  ⚠️  Erro no stream de ${entry.fileName}:`, err);
              zipfile.readEntry();
            });
          });
        });
        
        zipfile.on('end', () => {
          resolve();
        });
        
        zipfile.on('error', (err) => {
          reject(err);
        });
      });
    });
    
    console.log(`✅ ZIP extraído: ${zipKey} (${arquivosExtraidos.length} arquivo(s))`);
    return arquivosExtraidos;
    
  } catch (error) {
    console.error(`❌ Erro ao extrair ZIP de histórico para feature ${featureId}:`, error);
    throw error;
  }
}

/**
 * Atualiza o ZIP de anexos após inserção ou exclusão de arquivos
 * @param {string} featureId - ID da feature (hash)
 * @returns {Promise<void>}
 */
async function atualizarZipAnexos(featureId) {
  try {
    console.log(`🔄 Atualizando ZIP de anexos para feature ${featureId}...`);
    
    // Primeiro, extrair arquivos do ZIP existente (se houver) para não perdê-los
    const zipKey = `anexos/${featureId}.zip`;
    const zipExists = await fileExists(zipKey);
    
    if (zipExists) {
      console.log(`  📦 ZIP existente encontrado, extraindo arquivos antes de atualizar...`);
      try {
        await extrairZipAnexos(featureId);
        console.log(`  ✅ Arquivos do ZIP extraídos temporariamente`);
      } catch (extractError) {
        console.error(`  ⚠️  Erro ao extrair ZIP antes de atualizar:`, extractError);
        // Continuar mesmo se não conseguir extrair
      }
    }
    
    // Remover ZIP antigo se existir
    if (zipExists) {
      await deleteFile(zipKey);
      console.log(`  🗑️  ZIP antigo removido: ${zipKey}`);
    }
    
    // Criar novo ZIP com todos os arquivos atuais (incluindo os que foram extraídos)
    await criarZipAnexos(featureId);
    
    console.log(`✅ ZIP atualizado com sucesso para feature ${featureId}`);
    
  } catch (error) {
    console.error(`❌ Erro ao atualizar ZIP de anexos para feature ${featureId}:`, error);
    throw error;
  }
}

// ==================== FIM DAS FUNÇÕES PARA GERENCIAR ZIP DE ANEXOS ====================

// ==================== FIM DAS FUNÇÕES AUXILIARES ====================

// ==================== PROXY PARA API DE IA (porta 3002) ====================
// Em produção, o proxy reverso encaminha tudo para a porta 3001. As rotas de IA
// ficam no servidor-ai.js (porta 3002). Este proxy encaminha as requisições para o servidor AI.
const AI_PORT = process.env.AI_PORT || 3002;
const AI_BASE_URL = `http://127.0.0.1:${AI_PORT}`;

async function proxyToAI(req, res) {
  try {
    const targetPath = req.originalUrl || req.url || req.path;
    const url = `${AI_BASE_URL}${targetPath}`;
    const options = {
      method: req.method,
      headers: {
        'Content-Type': req.get('Content-Type') || 'application/json'
      }
    };
    const openaiHdr = req.get('x-openai-api-key');
    if (openaiHdr) {
      options.headers['X-OpenAI-API-Key'] = openaiHdr;
    }
    if (req.method !== 'GET' && req.body && Object.keys(req.body).length > 0) {
      options.body = JSON.stringify(req.body);
    }
    const response = await fetch(url, options);
    const contentType = response.headers.get('Content-Type') || 'application/json';
    res.set('Content-Type', contentType);
    res.status(response.status);
    const text = await response.text();
    if (contentType.includes('application/json')) {
      res.send(text || '{}');
    } else {
      res.send(text);
    }
  } catch (err) {
    console.error('❌ Erro ao encaminhar requisição para servidor AI:', err.message);
    res.status(502).json({
      success: false,
      error: 'Servidor de IA indisponível',
      message: err.message
    });
  }
}

// Rotas proxy para API de IA
app.post('/api/generate-scenarios', proxyToAI);
app.post('/api/reorganize-test-cases', proxyToAI);
app.post('/api/analyze-duplicates', proxyToAI);
app.post('/api/rastreabilidade-cobertura', proxyToAI);
app.get('/api/status', proxyToAI);

// Rotas que o frontend chama mas podem não existir no server-ai - proxy para evitar 404
app.post('/api/analisar-cobertura', proxyToAI);
app.post('/api/gerar-ct-cobertura', proxyToAI);

// ==================== FIM PROXY API IA ====================

// Rota para salvar template/documentação
app.post('/api/save-template', verificarManutencaoMiddleware, async (req, res) => {
  try {
    const templateData = req.body;
    
    // Validar dados obrigatórios
    if (!templateData.featureName || !templateData.creationDate || templateData.testRoutine === undefined || !templateData.environment || !templateData.tester) {
      return res.status(400).json({ error: 'Campos obrigatórios não preenchidos' });
    }
    
    // Usar hash ID fornecido pelo frontend ou gerar novo
    const hashId = templateData.featureId || generateHashId();
    
    // Calcular taxa de aprovação e taxa de execução
    const cenarios = templateData.cenarios || templateData.testCases || [];
    const taxAprovacao = calcularTaxaAprovacao(cenarios);
    const taxExecucao = calcularTaxaExecucao(cenarios);
    
    // Contar casos por fonte
    const contagemFonte = contarCasosPorFonte(cenarios);
    
    // Criar estrutura de dados do template para data-main.json (apenas metadados)
    const templateDocument = {
      id: hashId,
      featureName: templateData.featureName,
      jiraLink: templateData.jiraLink || '',
      creationDate: templateData.creationDate,
      updateDate: templateData.updateDate || new Date().toISOString().split('T')[0],
      testRoutine: templateData.testRoutine,
      environment: templateData.environment,
      tester: templateData.tester,
      squad: templateData.squad || '',
      browser: templateData.browser || '',
      device: templateData.device || '',
      status: 'criado',
      totalCenarios: cenarios.length,
      totalBugs: 0,
      taxaAprovacao: taxAprovacao,
      taxaExecucao: taxExecucao,
      totalCenariosIA: contagemFonte.totalIA,
      totalCenariosManual: contagemFonte.totalManual,
      inEdit: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    // Criar estrutura completa para arquivo individual (com cenários)
    const templateDocumentFull = {
      id: hashId,
      featureName: templateData.featureName,
      jiraLink: templateData.jiraLink || '',
      creationDate: templateData.creationDate,
      updateDate: templateData.updateDate || new Date().toISOString().split('T')[0],
      testRoutine: templateData.testRoutine,
      environment: templateData.environment,
      tester: templateData.tester,
      squad: templateData.squad || '',
      browser: templateData.browser || '',
      device: templateData.device || '',
      observacao: templateData.observacao || '',
      featureDescription: templateData.featureDescription || '', // Descrição da feature para uso no modal de IA
      resumoDescricaoProduto: templateData.resumoDescricaoProduto || null, // Resumo da descrição do produto gerado pela IA
      ct_aplicadosIA: templateData.ct_aplicadosIA !== undefined ? templateData.ct_aplicadosIA : false, // Flag indicando se CTs foram aplicados pela IA
      testType: templateData.testType || 'funcional', // Tipo de teste usado pela última vez
      imagens_selecionadas: templateData.imagens_selecionadas || [], // Imagens selecionadas para envio aos prompts
      coberturas: templateData.coberturas || {}, // Coberturas por tipo de teste do localStorage
      status: 'criado',
      cenarios: templateData.cenarios || templateData.testCases || [],
      bugs: templateData.bugs || [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    
    // Ler dados existentes do data-main.json
    let data = await readJsonFile('features/data-main.json');
    if (!data) {
      data = { features: [], totalFeatures: 0, ultimaAtualizacao: new Date().toISOString() };
    }
    
    // Adicionar nova documentação
    data.features.push(templateDocument);
    data.totalFeatures = data.features.length;
    data.ultimaAtualizacao = new Date().toISOString();
    
    // Salvar no arquivo JSON principal (apenas metadados)
    await writeJsonFile('features/data-main.json', data);
    
    // Salvar arquivo JSON individual com cenários completos
    await writeJsonFile(`features/metadata/json/${hashId}.json`, templateDocumentFull);
    
    console.log(`✅ Template salvo com sucesso: ID ${hashId}`);
    console.log(`📁 Arquivo individual criado: features/metadata/json/${hashId}.json`);
    
    // Criar ZIP com todos os anexos da feature
    try {
      await criarZipAnexos(hashId);
    } catch (zipError) {
      console.error('⚠️  Erro ao criar ZIP de anexos (não bloqueando salvamento):', zipError);
      // Não bloqueia o salvamento, apenas loga o erro
    }
    
    res.json({ 
      success: true, 
      message: 'Documentação salva com sucesso',
      id: hashId,
      data: templateDocument,
      totalCenarios: templateDocument.totalCenarios,
      totalBugs: templateDocument.totalBugs
    });
    
  } catch (error) {
    console.error('❌ Erro ao salvar template:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// Rota para atualizar documentação existente
app.put('/api/features/:id', verificarManutencaoMiddleware, async (req, res) => {
  try {
    const featureId = req.params.id;
    const updateData = req.body;
    
    console.log(`📝 PUT /api/features/${featureId} - Dados recebidos do frontend:`);
    console.log(`   Total de cenários: ${updateData.cenarios?.length || 0}`);
    if (updateData.cenarios && updateData.cenarios.length > 0) {
      updateData.cenarios.forEach((c, idx) => {
        const arquivos = c.arquivos || [];
        if (arquivos.length > 0) {
          console.log(`   CT${String(c.id).padStart(3, '0')}: ${arquivos.length} arquivo(s) -`, arquivos);
        }
      });
    }
    
    // Ler dados existentes
    const existingData = await readJsonFile(`features/metadata/json/${featureId}.json`);
    
    if (!existingData) {
      return res.status(404).json({ error: 'Feature não encontrada' });
    }
    
    // Verificar se houve mudança nos cenários, status ou anexos para gerar histórico
    const cenariosExist = existingData.cenarios || [];
    const cenariosNovos = updateData.cenarios || [];
    const qtdCenariosAntes = cenariosExist.length;
    const qtdCenariosDepois = cenariosNovos.length;
    
    console.log(`📊 Verificando mudanças para gerar histórico:`);
    console.log(`   Cenários antes: ${qtdCenariosAntes}`);
    console.log(`   Cenários depois: ${qtdCenariosDepois}`);
    
    // Verificar mudança na quantidade ou status dos cenários
    let gerarHistorico = qtdCenariosAntes !== qtdCenariosDepois;
    if (gerarHistorico) {
      console.log(`✅ Mudança detectada na quantidade de cenários: ${qtdCenariosAntes} → ${qtdCenariosDepois}`);
    }
    if (!gerarHistorico) {
      // Verificar se algum status mudou
      for (let i = 0; i < Math.min(qtdCenariosAntes, qtdCenariosDepois); i++) {
        const statusAntigo = cenariosExist[i]?.status;
        const statusNovo = cenariosNovos[i]?.status;
        if (statusAntigo !== statusNovo) {
          gerarHistorico = true;
          break;
        }
      }
    }
    
    // Verificar se houve mudança nos nomes (títulos) dos casos de teste
    if (!gerarHistorico) {
      // Criar mapas para facilitar comparação por ID
      const cenariosAntigosPorId = {};
      const cenariosNovosPorId = {};
      
      cenariosExist.forEach(c => {
        if (c.id) cenariosAntigosPorId[c.id] = c;
      });
      
      cenariosNovos.forEach(c => {
        if (c.id) cenariosNovosPorId[c.id] = c;
      });
      
      // Comparar títulos por ID primeiro
      for (const id in cenariosNovosPorId) {
        const cenarioNovo = cenariosNovosPorId[id];
        const cenarioAntigo = cenariosAntigosPorId[id];
        
        if (cenarioAntigo) {
          const tituloAntigo = (cenarioAntigo.titulo || '').trim();
          const tituloNovo = (cenarioNovo.titulo || '').trim();
          
          if (tituloAntigo !== tituloNovo) {
            console.log(`📝 Mudança detectada no nome do CT${id}: "${tituloAntigo}" → "${tituloNovo}"`);
            gerarHistorico = true;
            break;
          }
        }
      }
      
      // Se não encontrou por ID, comparar por posição (para casos sem ID ou IDs diferentes)
      if (!gerarHistorico) {
        for (let i = 0; i < Math.min(qtdCenariosAntes, qtdCenariosDepois); i++) {
          const tituloAntigo = (cenariosExist[i]?.titulo || '').trim();
          const tituloNovo = (cenariosNovos[i]?.titulo || '').trim();
          
          if (tituloAntigo !== tituloNovo) {
            console.log(`📝 Mudança detectada no nome do CT na posição ${i}: "${tituloAntigo}" → "${tituloNovo}"`);
            gerarHistorico = true;
            break;
          }
        }
      }
    }
    
    // Verificar se houve mudança nos anexos
    if (!gerarHistorico) {
      for (let i = 0; i < Math.min(qtdCenariosAntes, qtdCenariosDepois); i++) {
        const anexosAntigos = cenariosExist[i]?.arquivos || [];
        const anexosNovos = cenariosNovos[i]?.arquivos || [];
        
        // Normalizar anexos antigos (já devem ser strings no JSON salvo)
        const anexosAntigosNormalizados = anexosAntigos.map(a => {
          if (typeof a === 'object' && a !== null) {
            return a.nome || a.filename || '';
          }
          return typeof a === 'string' ? a : '';
        });
        
        // Normalizar anexos novos (podem ser objetos vindos do frontend)
        const anexosNovosNormalizados = anexosNovos.map(a => {
          if (typeof a === 'object' && a !== null) {
            return a.nome || a.filename || '';
          }
          return typeof a === 'string' ? a : '';
        });
        
        // Filtrar arquivos válidos
        const anexosAntigosValidos = anexosAntigosNormalizados.filter(a => a && a.trim() !== '');
        const anexosNovosValidos = anexosNovosNormalizados.filter(a => a && a.trim() !== '');
        
        // Verificar se a quantidade mudou
        if (anexosAntigosValidos.length !== anexosNovosValidos.length) {
          console.log(`📎 Mudança detectada em anexos de CT${cenariosExist[i]?.id}: ${anexosAntigosValidos.length} → ${anexosNovosValidos.length}`);
          gerarHistorico = true;
          break;
        }
        
        // Verificar se os arquivos mudaram (ordenar para comparar)
        const antigosOrdenados = [...anexosAntigosValidos].sort().join(',');
        const novosOrdenados = [...anexosNovosValidos].sort().join(',');
        if (antigosOrdenados !== novosOrdenados) {
          console.log(`📎 Mudança detectada nos arquivos de CT${cenariosExist[i]?.id}`);
          gerarHistorico = true;
          break;
        }
      }
    }
    
    // Atualizar dados - criar objeto limpo com apenas os campos necessários
    const updatedData = {
      id: featureId, // Manter ID original
      featureName: updateData.featureName,
      jiraLink: updateData.jiraLink || '',
      creationDate: updateData.creationDate,
      updateDate: updateData.updateDate,
      testRoutine: updateData.testRoutine,
      environment: updateData.environment,
      tester: updateData.tester,
      squad: updateData.squad || '',
      browser: updateData.browser || '',
      device: updateData.device || '',
      observacao: updateData.observacao !== undefined ? updateData.observacao : (existingData.observacao || ''),
      featureDescription: updateData.featureDescription || '', // Descrição da feature para uso no modal de IA
      resumoDescricaoProduto: updateData.resumoDescricaoProduto !== undefined ? updateData.resumoDescricaoProduto : (existingData.resumoDescricaoProduto || null), // Resumo da descrição do produto gerado pela IA
      ct_aplicadosIA: updateData.ct_aplicadosIA !== undefined ? updateData.ct_aplicadosIA : (existingData.ct_aplicadosIA !== undefined ? existingData.ct_aplicadosIA : false), // Flag indicando se CTs foram aplicados pela IA
      testType: updateData.testType || existingData.testType || 'funcional', // Tipo de teste usado pela última vez
      imagens_selecionadas: updateData.imagens_selecionadas || existingData.imagens_selecionadas || [], // Imagens selecionadas para envio aos prompts
      coberturas: updateData.coberturas || existingData.coberturas || {}, // Coberturas por tipo de teste do localStorage
      status: 'criado',
      cenarios: updateData.cenarios || [],
      bugs: updateData.bugs || [],
      createdAt: existingData.createdAt || new Date().toISOString(), // Manter data de criação original
      updatedAt: new Date().toISOString()
    };
    
    // Normalizar arquivos nos cenários: converter objetos para strings antes de salvar
    console.log(`🔧 Normalizando anexos nos cenários antes de salvar...`);
    updatedData.cenarios = updatedData.cenarios.map(cenario => {
      if (cenario.arquivos && Array.isArray(cenario.arquivos)) {
        const arquivosNormalizados = cenario.arquivos.map(anexo => {
          if (typeof anexo === 'object' && anexo !== null) {
            // Se é objeto, extrair apenas o nome
            const nome = anexo.nome || anexo.filename || '';
            console.log(`  📎 Convertendo objeto para string: ${nome}`);
            return nome;
          }
          // Se já é string, manter
          return anexo;
        }).filter(a => a && a.trim() !== ''); // Remover strings vazias
        
        return { ...cenario, arquivos: arquivosNormalizados };
      }
      return cenario;
    });
    
    // Salvar arquivo individual atualizado
    await writeJsonFile(`features/metadata/json/${featureId}.json`, updatedData);
    
    // Gerar histórico se houver mudança
    // Nota: Gerar histórico mesmo se não houver cenários (para registrar exclusão completa)
    if (gerarHistorico) {
      if (!updatedData.cenarios || updatedData.cenarios.length === 0) {
        console.log(`⚠️  Nenhum cenário restante após mudança - histórico será gerado apenas com cabeçalho`);
      }
      try {
        console.log(`📊 Iniciando geração de histórico para feature ${featureId}...`);
        
        // DEBUG: Mostrar cenários completos
        console.log(`🔍 DEBUG - Cenários que serão salvos no histórico:`);
        updatedData.cenarios.forEach((c, idx) => {
          console.log(`  ${idx + 1}. CT${String(c.id).padStart(3, '0')}`);
          console.log(`     - Status: ${c.status}`);
          console.log(`     - Tem campo 'arquivos': ${c.hasOwnProperty('arquivos')}`);
          console.log(`     - Arquivos:`, c.arquivos);
        });
        
        const removeAccents = (str) => str.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        const featureSlug = removeAccents((updatedData.featureName || '').toLowerCase()).replace(/[^a-z0-9]/g, '_');
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const fileName = `${featureId}_${featureSlug}_${timestamp}.csv`;
        
        const dataAtual = new Date();
        const dataFormatada = dataAtual.toLocaleDateString('pt-BR');
        const horaFormatada = dataAtual.toLocaleTimeString('pt-BR');
        
        let csvContent = `Data da Execução,${dataFormatada}\n`;
        csvContent += `Hora da Execução,${horaFormatada}\n`;
        csvContent += `Testador,${updatedData.tester || 'N/A'}\n`;
        csvContent += `Ambiente,${updatedData.environment || 'N/A'}\n`;
        
        const taxaAprovacao = updatedData.cenarios && updatedData.cenarios.length > 0 
          ? calcularTaxaAprovacao(updatedData.cenarios) 
          : 0;
        csvContent += `Taxa de Aprovação,${taxaAprovacao}%\n`;
        csvContent += `\n`;
        csvContent += `Caso de Teste,Status\n`;
      
      // Processar cenários se houver
      if (updatedData.cenarios && updatedData.cenarios.length > 0) {
        updatedData.cenarios.forEach((cenario, index) => {
        const statusMap = {
          'aprovado': 'Aprovado',
          'reprovado': 'Reprovado',
          'bloqueado': 'Bloqueado',
          'nao_executado': 'Não Executado',
          'na': 'Não Executado'
        };
        const statusTexto = statusMap[cenario.status] || 'Não Executado';
        // Usar título completo do caso de teste (ex: "CT001 - Login com credenciais válidas")
        // Se não tiver título, usar ID como fallback
        const tituloCompleto = cenario.titulo || `CT${String(cenario.id || (index + 1)).padStart(3, '0')}`;
        csvContent += `"${tituloCompleto}",${statusTexto}\n`;
        });
      } else {
        // Se não houver cenários, adicionar linha indicando que todos foram excluídos
        csvContent += `"Nenhum caso de teste",N/A\n`;
      }
      
        // Adicionar seção de anexos
        csvContent += `\n`;
        csvContent += `Anexos\n`;
        csvContent += `Caso de Teste,Quantidade,Arquivos\n`;
        
        console.log(`📎 Processando anexos para ${updatedData.cenarios ? updatedData.cenarios.length : 0} cenários...`);
        
        // Processar anexos se houver cenários
        if (updatedData.cenarios && updatedData.cenarios.length > 0) {
          updatedData.cenarios.forEach((cenario, index) => {
          const cenarioId = cenario.id || (index + 1);
          const anexos = cenario.arquivos || [];
          const quantidadeOriginal = anexos.length;
          
          if (quantidadeOriginal > 0) {
            console.log(`  📁 CT${String(cenarioId).padStart(3, '0')}: ${quantidadeOriginal} anexo(s) no array`);
            console.log(`     Array original:`, anexos);
            console.log(`     Tipos:`, anexos.map(a => typeof a));
          }
        
          // Normalizar anexos: converter objetos para strings
          const anexosNormalizados = anexos.map(anexo => {
            if (typeof anexo === 'object' && anexo !== null) {
              // Se é objeto, extrair o campo 'nome'
              return anexo.nome || anexo.filename || '';
            } else if (typeof anexo === 'string') {
              // Se já é string, manter
              return anexo;
            }
            return '';
          });
          
          // Filtrar arquivos válidos
          const arquivosFiltrados = anexosNormalizados.filter(anexo => anexo && anexo.trim() !== '');
          const quantidade = arquivosFiltrados.length; // Usar quantidade APÓS filtro
          
          if (quantidadeOriginal > 0) {
            console.log(`     Após normalização: ${arquivosFiltrados.length} arquivo(s) válido(s)`, arquivosFiltrados);
          }
          
          if (quantidade > 0) {
            const arquivos = arquivosFiltrados
              .map(anexo => {
                // Extrair nome do arquivo do path completo
                const nomeArquivo = anexo.includes('/') ? anexo.split('/').pop() : anexo;
                return nomeArquivo;
              })
              .join('; ');
            
            console.log(`     String final: "${arquivos}"`);
            // Usar título completo do caso de teste
            const tituloCompleto = cenario.titulo || `CT${String(cenarioId).padStart(3, '0')}`;
            csvContent += `"${tituloCompleto}",${quantidade},"${arquivos}"\n`;
          } else {
            // Usar título completo do caso de teste
            const tituloCompleto = cenario.titulo || `CT${String(cenarioId).padStart(3, '0')}`;
            csvContent += `"${tituloCompleto}",0,Nenhum anexo\n`;
          }
          });
        } else {
          // Se não houver cenários, adicionar linha indicando que não há anexos
          csvContent += `"Nenhum caso de teste",0,Nenhum anexo\n`;
        }
      
        // Salvar histórico
        console.log(`💾 Salvando arquivo de histórico: ${fileName}`);
        
        // Converter CSV content para Buffer
        const csvBuffer = Buffer.from(csvContent, 'utf-8');
        
        // Adicionar ao ZIP de histórico
        try {
          await criarZipHistorico(featureId, fileName, csvBuffer);
          console.log(`✅ Histórico adicionado ao ZIP: ${fileName}`);
        } catch (zipError) {
          console.error('⚠️  Erro ao adicionar histórico ao ZIP (salvando como arquivo individual):', zipError);
          // Fallback: salvar como arquivo individual se falhar
          await writeTextFile(`historico/${fileName}`, csvContent, 'text/csv');
        }
        
        console.log(`✅ Histórico gerado automaticamente: ${fileName}`);
      } catch (historyError) {
        console.error('❌ Erro ao gerar histórico (não bloqueando salvamento):', historyError);
        // Não bloqueia o salvamento da feature, apenas loga o erro
      }
    }
    
    // Atualizar data-main.json
    const mainData = await readJsonFile('features/data-main.json');
    
    if (mainData) {
      // Calcular nova taxa de aprovação e taxa de execução
      const cenarios = updatedData.cenarios || [];
      const taxAprovacao = calcularTaxaAprovacao(cenarios);
      const taxExecucao = calcularTaxaExecucao(cenarios);
      
      // Contar casos por fonte
      const contagemFonte = contarCasosPorFonte(cenarios);
      
      const featureIndex = mainData.features.findIndex(f => f.id === featureId);
      if (featureIndex !== -1) {
        mainData.features[featureIndex] = {
          id: featureId,
          featureName: updatedData.featureName,
          jiraLink: updatedData.jiraLink,
          creationDate: updatedData.creationDate,
          updateDate: updatedData.updateDate,
          testRoutine: updatedData.testRoutine,
          environment: updatedData.environment,
          tester: updatedData.tester,
          squad: updatedData.squad,
          browser: updatedData.browser,
          device: updatedData.device,
          status: updatedData.status,
          totalCenarios: cenarios.length,
          totalBugs: updatedData.bugs ? updatedData.bugs.length : 0,
          taxaAprovacao: taxAprovacao,
          taxaExecucao: taxExecucao,
          totalCenariosIA: contagemFonte.totalIA,
          totalCenariosManual: contagemFonte.totalManual,
          inEdit: false, // Ao salvar, marcar como não em edição
          createdAt: updatedData.createdAt,
          updatedAt: updatedData.updatedAt
        };
        
        mainData.ultimaAtualizacao = new Date().toISOString();
        await writeJsonFile('features/data-main.json', mainData);
      }
    }
    
    // Criar/atualizar ZIP com todos os anexos da feature
    try {
      await criarZipAnexos(featureId);
    } catch (zipError) {
      console.error('⚠️  Erro ao criar ZIP de anexos (não bloqueando atualização):', zipError);
      // Não bloqueia a atualização, apenas loga o erro
    }
    
    res.json({ 
      success: true, 
      message: 'Documentação atualizada com sucesso',
      data: updatedData
    });
    
  } catch (error) {
    console.error('❌ Erro ao atualizar feature:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// Rota para obter dados de uma feature específica
app.get('/api/features/:id', async (req, res) => {
  try {
    const featureId = req.params.id;
    
    const data = await readJsonFile(`features/metadata/json/${featureId}.json`);
    
    if (!data) {
      return res.status(404).json({ error: 'Feature não encontrada' });
    }
    
    // Extrair ZIP de anexos se existir
    try {
      await extrairZipAnexos(featureId);
    } catch (zipError) {
      console.error('⚠️  Erro ao extrair ZIP de anexos (não bloqueando acesso):', zipError);
      // Não bloqueia o acesso, apenas loga o erro
    }
    
    res.json({ success: true, data });
    
  } catch (error) {
    console.error('❌ Erro ao obter feature:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// Rota para listar features com paginação, busca e filtros
app.get('/api/features', async (req, res) => {
  try {
    const data = await readJsonFile('features/data-main.json');
    
    if (!data) {
      return res.json({ 
        success: true, 
        features: [], 
        pagination: {
          total: 0, 
          page: 1, 
          limit: 10, 
          totalPages: 0,
          hasNextPage: false,
          hasPrevPage: false
        }
      });
    }
    
    // Pegar parâmetros de paginação
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    
    // Pegar parâmetros de busca e filtros
    const searchTerm = (req.query.search || '').toLowerCase().trim();
    const ambienteFilter = (req.query.ambiente || '').toLowerCase();
    const taxaAprovacaoFilter = req.query.taxaAprovacao || '';
    
    // Função auxiliar para remover acentuação
    const removerAcentuacao = (texto) => {
      return texto.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    };
    
    // Filtrar features
    let filteredFeatures = [...data.features];
    
    // Filtro de busca (por nome da feature ou nome do testador)
    if (searchTerm) {
      const searchTermSemAcento = removerAcentuacao(searchTerm);
      filteredFeatures = filteredFeatures.filter(feature => {
        const nomeFeatureSemAcento = removerAcentuacao((feature.featureName || '').toLowerCase());
        const nomeTestadorSemAcento = removerAcentuacao((feature.tester || '').toLowerCase());
        return nomeFeatureSemAcento.includes(searchTermSemAcento) || 
               nomeTestadorSemAcento.includes(searchTermSemAcento);
      });
    }
    
    // Filtro de ambiente
    if (ambienteFilter && ambienteFilter !== 'todos') {
      filteredFeatures = filteredFeatures.filter(feature => {
        const ambiente = (feature.environment || '').toLowerCase();
        return ambiente === ambienteFilter;
      });
    }
    
    // Filtro de taxa de aprovação
    if (taxaAprovacaoFilter) {
      filteredFeatures = filteredFeatures.filter(feature => {
        const taxa = feature.taxaAprovacao || 0;
        switch (taxaAprovacaoFilter) {
          case 'alta':
            return taxa >= 70;
          case 'baixa':
            return taxa < 70;
          case 'reprovados':
            return taxa < 100 && feature.totalCenarios > 0;
          case 'todos_aprovados':
            return taxa === 100 && feature.totalCenarios > 0;
          case 'nao_testados':
            return feature.totalCenarios === 0;
          default:
            return true;
        }
      });
    }
    
    const totalFilteredFeatures = filteredFeatures.length;
    const totalPages = Math.ceil(totalFilteredFeatures / limit);
    
    // Ordenar por data de atualização (mais recente primeiro)
    const sortedFeatures = filteredFeatures.sort((a, b) => {
      const dateA = new Date(a.updatedAt || a.createdAt || 0);
      const dateB = new Date(b.updatedAt || b.createdAt || 0);
      return dateB - dateA;
    });
    
    // Calcular índices para paginação
    const startIndex = (page - 1) * limit;
    const endIndex = startIndex + limit;
    const paginatedFeatures = sortedFeatures.slice(startIndex, endIndex);
    
    res.json({ 
      success: true, 
      features: paginatedFeatures,
      pagination: {
        total: totalFilteredFeatures,
        page: page,
        limit: limit,
        totalPages: totalPages,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1
      },
      filters: {
        search: searchTerm,
        ambiente: ambienteFilter,
        taxaAprovacao: taxaAprovacaoFilter
      }
    });
    
  } catch (error) {
    console.error('❌ Erro ao listar features:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// Rota para duplicar uma feature
app.post('/api/features/duplicate', verificarManutencaoMiddleware, async (req, res) => {
  try {
    const { arquivo, novoAmbiente, novoTestador, reaproveitarCTs } = req.body;
    
    if (!arquivo || !novoAmbiente || !novoTestador) {
      return res.status(400).json({ 
        success: false,
        message: 'Dados obrigatórios não fornecidos' 
      });
    }
    
    // Ler arquivo JSON original
    const originalData = await readJsonFile(`features/metadata/json/${arquivo}.json`);
    
    if (!originalData) {
      return res.status(404).json({ 
        success: false,
        message: 'Documentação original não encontrada' 
      });
    }
    
    // Gerar nova hash
    const novaHash = generateHashId();
    
    // Preparar casos de teste
    let novosCenarios = [];
    if (reaproveitarCTs && originalData.cenarios && originalData.cenarios.length > 0) {
      // Copiar casos de teste com status "não executado"
      novosCenarios = originalData.cenarios.map(cenario => ({
        id: cenario.id,
        titulo: cenario.titulo || cenario.nomeCaso || '',
        precondicoes: cenario.precondicoes || '',
        passos: cenario.passos || '',
        resultadoEsperado: cenario.resultadoEsperado || '',
        status: 'nao_executado',
        arquivos: []
      }));
    }
    
    // Calcular taxa de aprovação e taxa de execução (serão 0 para novos casos não executados)
    const taxAprovacao = 0;
    const taxExecucao = 0;
    const contagemFonte = contarCasosPorFonte(novosCenarios);
    
    // Criar nova data para a documentação
    const dataAtual = new Date();
    const dataFormatada = dataAtual.toISOString().split('T')[0];
    
    // Criar documento completo para o arquivo individual
    const novoDocumento = {
      id: novaHash,
      featureName: originalData.featureName,
      jiraLink: originalData.jiraLink || '',
      creationDate: dataFormatada,
      updateDate: dataFormatada,
      testRoutine: originalData.testRoutine,
      environment: novoAmbiente,
      tester: novoTestador,
      squad: originalData.squad || '',
      browser: originalData.browser || '',
      device: originalData.device || '',
      featureDescription: originalData.featureDescription || '', // Descrição da feature para uso no modal de IA
      testType: originalData.testType || 'funcional', // Tipo de teste usado pela última vez
      coberturas: originalData.coberturas || {}, // Coberturas por tipo de teste do localStorage
      status: 'criado',
      cenarios: novosCenarios,
      bugs: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    
    // Criar documento resumido para data-main.json
    const templateDocument = {
      id: novaHash,
      featureName: originalData.featureName,
      jiraLink: originalData.jiraLink || '',
      creationDate: dataFormatada,
      updateDate: dataFormatada,
      testRoutine: originalData.testRoutine,
      environment: novoAmbiente,
      tester: novoTestador,
      squad: originalData.squad || '',
      browser: originalData.browser || '',
      device: originalData.device || '',
      status: 'criado',
      totalCenarios: novosCenarios.length,
      totalBugs: 0,
      taxaAprovacao: taxAprovacao,
      taxaExecucao: taxExecucao,
      totalCenariosIA: contagemFonte.totalIA,
      totalCenariosManual: contagemFonte.totalManual,
      inEdit: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    
    // Salvar arquivo individual
    await writeJsonFile(`features/metadata/json/${novaHash}.json`, novoDocumento);
    
    // Atualizar data-main.json
    let mainData = await readJsonFile('features/data-main.json');
    if (!mainData) {
      mainData = { features: [], totalFeatures: 0, ultimaAtualizacao: new Date().toISOString() };
    }
    
    mainData.features.push(templateDocument);
    mainData.totalFeatures = mainData.features.length;
    mainData.ultimaAtualizacao = new Date().toISOString();
    
    await writeJsonFile('features/data-main.json', mainData);
    
    console.log(`✅ Documentação duplicada: ${arquivo} -> ${novaHash}`);
    
    res.json({ 
      success: true, 
      message: 'Documentação duplicada com sucesso',
      novoArquivo: novaHash,
      data: templateDocument
    });
    
  } catch (error) {
    console.error('❌ Erro ao duplicar feature:', error);
    res.status(500).json({ 
      success: false,
      message: 'Erro interno do servidor',
      error: error.message
    });
  }
});

// Rota para remover uma feature
app.delete('/api/features/:id', verificarManutencaoMiddleware, async (req, res) => {
  try {
    const featureId = req.params.id;
    const { password } = req.body;
    
    // Verificar se senha é necessária (apenas se flag for explicitamente true E requisição vier do frontend)
    const flags = await lerFlags();
    if (flags.senhaExcluirDocumentacao === true) {
      // Verificar se a requisição vem do frontend (através do header Referer)
      // Se não houver Referer, é uma chamada direta à API e não exige senha
      const referer = req.get('Referer') || req.get('Referrer');
      const host = req.get('Host') || '';
      
      // Considera como frontend se houver Referer e ele apontar para o mesmo servidor
      const isFromFrontend = referer && (
        referer.includes(host) || 
        referer.includes('localhost') || 
        referer.includes('127.0.0.1') ||
        (host && referer.includes(host.split(':')[0])) // Remove porta se houver
      );
      
      // Só exigir senha se a requisição vier do frontend
      if (isFromFrontend) {
        const adminPassword = process.env.PASSWORD_ADMIN;
        
        if (!password || password !== adminPassword) {
          return res.status(401).json({
            success: false,
            error: 'Senha incorreta'
          });
        }
      }
      // Se não vier do frontend (chamada direta à API sem Referer), não exige senha
    }
    
    console.log(`🗑️ Iniciando remoção da feature ${featureId}...`);
    
    // 1. Remover arquivo JSON individual da feature
    console.log(`📄 Removendo arquivo JSON: features/metadata/json/${featureId}.json`);
    await deleteFile(`features/metadata/json/${featureId}.json`);
    
    // 2. Remover anexos relacionados
    console.log(`📎 Removendo anexos da feature ${featureId}...`);
    if (USE_S3) {
      // Listar e remover anexos do S3
      try {
        const anexos = await s3Service.listFiles(`anexos/`);
        const anexosFeature = anexos.filter(anexo => anexo.key.startsWith(`anexos/${featureId}_`));
        for (const anexo of anexosFeature) {
          console.log(`  - Removendo anexo: ${anexo.key}`);
          await s3Service.deleteFile(anexo.key);
        }
        console.log(`✅ ${anexosFeature.length} anexo(s) removido(s)`);
      } catch (anexosError) {
        console.error('⚠️ Erro ao remover anexos do S3:', anexosError);
      }
    } else {
      // Remover anexos do filesystem local
      const anexosDir = path.join(__dirname, '..', 'public', 'anexos');
      if (await fs.pathExists(anexosDir)) {
        const files = await fs.readdir(anexosDir);
        const anexosFeature = files.filter(file => file.startsWith(`${featureId}_`));
        for (const file of anexosFeature) {
          console.log(`  - Removendo anexo: ${file}`);
          await fs.remove(path.join(anexosDir, file));
        }
        console.log(`✅ ${anexosFeature.length} anexo(s) removido(s)`);
      }
    }
    
    // 3. Remover arquivos de histórico relacionados
    console.log(`📊 Removendo histórico da feature ${featureId}...`);
    if (USE_S3) {
      // Listar e remover histórico do S3
      try {
        const historicoFiles = await s3Service.listFiles(`historico/`);
        const historicoFeature = historicoFiles.filter(file => {
          const fileName = path.basename(file.key);
          return fileName.startsWith(`${featureId}_`);
        });
        for (const historico of historicoFeature) {
          console.log(`  - Removendo histórico: ${historico.key}`);
          await s3Service.deleteFile(historico.key);
        }
        console.log(`✅ ${historicoFeature.length} arquivo(s) de histórico removido(s)`);
      } catch (historicoError) {
        console.error('⚠️ Erro ao remover histórico do S3:', historicoError);
      }
    } else {
      // Remover histórico do filesystem local
      const historicoDir = path.join(__dirname, '..', 'public', 'historico');
      if (await fs.pathExists(historicoDir)) {
        const files = await fs.readdir(historicoDir);
        const historicoFeature = files.filter(file => file.startsWith(`${featureId}_`));
        for (const file of historicoFeature) {
          console.log(`  - Removendo histórico: ${file}`);
          await fs.remove(path.join(historicoDir, file));
        }
        console.log(`✅ ${historicoFeature.length} arquivo(s) de histórico removido(s)`);
      }
    }
    
    // 4. Atualizar data-main.json - remover objeto e atualizar contagem
    console.log(`📝 Atualizando data-main.json...`);
    const mainData = await readJsonFile('features/data-main.json');
    
    if (mainData) {
      const totalAntes = mainData.features ? mainData.features.length : 0;
      
      // Filtrar e remover a feature
      if (mainData.features && Array.isArray(mainData.features)) {
        mainData.features = mainData.features.filter(f => f.id !== featureId);
      }
      
      // Atualizar contagem e data
      mainData.totalFeatures = mainData.features ? mainData.features.length : 0;
      mainData.ultimaAtualizacao = new Date().toISOString();
      
      await writeJsonFile('features/data-main.json', mainData);
      
      const totalDepois = mainData.totalFeatures;
      console.log(`✅ data-main.json atualizado: ${totalAntes} → ${totalDepois} features`);
    } else {
      console.warn('⚠️ data-main.json não encontrado ou inválido');
    }
    
    console.log(`✅ Feature ${featureId} removida com sucesso!`);
    res.json({ success: true, message: 'Feature removida com sucesso' });
    
  } catch (error) {
    console.error('❌ Erro ao remover feature:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// Rota para obter próximo ID disponível
app.get('/api/features/next-id', async (req, res) => {
  try {
    // Coletar todas as hashes existentes do arquivo principal
    const existingHashes = new Set();
    const mainData = await readJsonFile('features/data-main.json');
    if (mainData) {
      mainData.features.forEach(feature => {
        existingHashes.add(feature.id);
      });
    }
    
    // Gerar hash única (verificar se não existe)
    let hash = generateHashId();
    let tentativas = 0;
    const maxTentativas = 100;
    
    while (existingHashes.has(hash) && tentativas < maxTentativas) {
      hash = generateHashId();
      tentativas++;
    }
    
    if (tentativas >= maxTentativas) {
      console.error('❌ Não foi possível gerar hash única após', maxTentativas, 'tentativas');
      return res.status(500).json({
        success: false,
        message: 'Erro ao gerar ID único'
      });
    }
    
    console.log(`🔢 Hash gerada: ${hash} (tentativas: ${tentativas + 1})`);
    res.json({ nextId: hash });
  } catch (error) {
    console.error('❌ Erro ao obter próximo ID:', error.message);
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor'
    });
  }
});

// Rota para atualizar status inEdit de uma feature
app.put('/api/features/:id/edit-status', async (req, res) => {
  try {
    const featureId = req.params.id;
    const { inEdit } = req.body;
    
    if (inEdit === undefined || typeof inEdit !== 'boolean') {
      return res.status(400).json({ 
        success: false,
        error: 'Campo inEdit é obrigatório e deve ser booleano' 
      });
    }
    
    // Atualizar data-main.json
    const mainData = await readJsonFile('features/data-main.json');
    
    if (!mainData) {
      return res.status(404).json({ 
        success: false,
        error: 'Arquivo de features não encontrado' 
      });
    }
    
    const featureIndex = mainData.features.findIndex(f => f.id === featureId);
    if (featureIndex === -1) {
      return res.status(404).json({ 
        success: false,
        error: 'Feature não encontrada' 
      });
    }
    
    // Atualizar status inEdit com timestamp para timeout automático
    mainData.features[featureIndex].inEdit = inEdit;
    mainData.features[featureIndex].inEditTimestamp = inEdit ? new Date().toISOString() : null;
    mainData.ultimaAtualizacao = new Date().toISOString();
    await writeJsonFile('features/data-main.json', mainData);
    
    console.log(`✅ Status inEdit atualizado para feature ${featureId}: ${inEdit}`);
    
    res.json({ 
      success: true, 
      message: 'Status de edição atualizado com sucesso',
      inEdit: inEdit
    });
    
  } catch (error) {
    console.error('❌ Erro ao atualizar status inEdit:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// Rota para verificar status inEdit de uma feature
app.get('/api/features/:id/edit-status', async (req, res) => {
  try {
    const featureId = req.params.id;
    const mainData = await readJsonFile('features/data-main.json');
    
    if (!mainData) {
      return res.status(404).json({ 
        success: false,
        error: 'Arquivo de features não encontrado' 
      });
    }
    
    const feature = mainData.features.find(f => f.id === featureId);
    
    if (!feature) {
      return res.status(404).json({ 
        success: false,
        error: 'Feature não encontrada' 
      });
    }
    
    let inEdit = feature.inEdit || false;
    
    // Verificar timeout automático (30 minutos)
    if (inEdit && feature.inEditTimestamp) {
      const timestamp = new Date(feature.inEditTimestamp);
      const now = new Date();
      const diffMinutes = (now - timestamp) / (1000 * 60);
      
      if (diffMinutes > 30) {
        // Timeout excedido, liberar automaticamente
        console.log(`⏰ Timeout de edição excedido para feature ${featureId} (${diffMinutes.toFixed(1)} minutos)`);
        inEdit = false;
        
        // Atualizar no arquivo
        feature.inEdit = false;
        feature.inEditTimestamp = null;
        mainData.ultimaAtualizacao = new Date().toISOString();
        await writeJsonFile('features/data-main.json', mainData);
      }
    }
    
    res.json({ 
      success: true,
      inEdit: inEdit
    });
    
  } catch (error) {
    console.error('❌ Erro ao verificar status inEdit:', error);
    res.status(500).json({ 
      success: false,
      error: 'Erro interno do servidor' 
    });
  }
});

// Middleware para tratar erros do Multer
const handleMulterError = (err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({
        success: false,
        message: 'Arquivo muito grande. Tamanho máximo permitido: 10MB'
      });
    }
    return res.status(400).json({
      success: false,
      message: `Erro no upload: ${err.message}`
    });
  }
  next(err);
};

// Rota para upload de anexos
app.post('/api/attachments/upload', verificarManutencaoMiddleware, upload.single('file'), handleMulterError, async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'Nenhum arquivo enviado'
      });
    }

    const { cenarioId, featureId } = req.body;
    
    if (!cenarioId || !featureId) {
      return res.status(400).json({
        success: false,
        message: 'cenarioId e featureId são obrigatórios'
      });
    }

    // Renomear arquivo com formato hash_CT001.extensao
    const cenarioIdFormatted = String(cenarioId).padStart(3, '0');
    const originalName = req.file.originalname;
    const extension = path.extname(originalName);
    
    const baseFileName = `${featureId}_CT${cenarioIdFormatted}`;
    let newFileName = `${baseFileName}${extension}`;
    
    // Verificar se já existe arquivo para este CT e adicionar número sequencial
    if (USE_S3) {
      // Verificar no S3
      let counter = 0;
      let exists = await fileExists(`anexos/${newFileName}`);
      while (exists) {
        counter++;
        newFileName = `${baseFileName}_${counter}${extension}`;
        exists = await fileExists(`anexos/${newFileName}`);
      }
      
      // Fazer upload para S3
      const contentType = req.file.mimetype;
      const fileBuffer = req.file.buffer;
      await uploadBuffer(fileBuffer, `anexos/${newFileName}`, contentType);
    } else {
      // Verificar no filesystem local
      if (fs.existsSync(path.join(__dirname, '..', 'public', 'anexos', newFileName))) {
        let counter = 1;
        do {
          newFileName = `${baseFileName}_${counter}${extension}`;
          counter++;
        } while (fs.existsSync(path.join(__dirname, '..', 'public', 'anexos', newFileName)));
      }
      
      const oldPath = path.join(__dirname, '..', 'public', 'anexos', req.file.filename);
      const newPath = path.join(__dirname, '..', 'public', 'anexos', newFileName);
      fs.renameSync(oldPath, newPath);
    }

    // Atualizar JSON da feature com o nome do arquivo
    await updateFeatureWithAttachment(featureId, cenarioId, newFileName);

    // NÃO atualizar ZIP aqui - será atualizado quando o documento for salvo/atualizado
    // Isso evita remover arquivos individuais antes de todos serem enviados

    res.json({
      success: true,
      message: 'Anexo salvo com sucesso!',
      file_path: `anexos/${newFileName}`,
      file_name: newFileName,
      original_name: originalName,
      file_size: req.file.size,
      file_type: req.file.mimetype,
      download_url: USE_S3 ? `${getBaseUrl(req)}/api/anexos/${newFileName}` : `${getBaseUrl(req)}/anexos/${newFileName}`
    });

  } catch (error) {
    console.error('❌ Erro ao salvar anexo:', error.message);
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor'
    });
  }
});

// Função para atualizar feature com anexo
async function updateFeatureWithAttachment(featureId, cenarioId, fileName) {
  try {
    const featureData = await readJsonFile(`features/metadata/json/${featureId}.json`);
    
    if (featureData) {
      // Encontrar o cenário e adicionar o arquivo
      const cenario = featureData.cenarios.find(c => c.id === parseInt(cenarioId));
      if (cenario) {
        if (!cenario.arquivos) {
          cenario.arquivos = [];
        }
        
        // Adicionar apenas o nome do arquivo (sem o hash)
        const fileNameOnly = fileName.replace(`${featureId}_CT${String(cenarioId).padStart(3, '0')}`, 'CT' + String(cenarioId).padStart(3, '0'));
        cenario.arquivos.push(fileNameOnly);
        
        // Salvar arquivo atualizado
        await writeJsonFile(`features/metadata/json/${featureId}.json`, featureData);
        
        console.log(`✅ Anexo ${fileNameOnly} adicionado ao cenário ${cenarioId} da feature ${featureId}`);
      }
    }
  } catch (error) {
    console.error('❌ Erro ao atualizar feature com anexo:', error);
  }
}

// Rota para listar anexos de uma feature
app.get('/api/attachments/:featureId', async (req, res) => {
  try {
    const featureId = req.params.featureId;
    let attachments = [];

    if (USE_S3) {
      // Listar do S3 - buscar todos os arquivos em anexos/ que começam com o featureId
      // Primeiro, tentar extrair o ZIP se existir (para garantir que os arquivos estejam disponíveis)
      try {
        await extrairZipAnexos(featureId);
      } catch (zipError) {
        console.error('⚠️  Erro ao extrair ZIP (não bloqueando listagem):', zipError);
        // Não bloqueia a listagem, apenas loga o erro
      }
      
      // Listar todos os arquivos em anexos/ que começam com o featureId
      const s3Files = await s3Service.listFiles('anexos/');
      attachments = s3Files
        .filter(file => {
          const fileName = path.basename(file.key);
          // Filtrar apenas arquivos que começam com o featureId e não são ZIPs
          return fileName.startsWith(`${featureId}_CT`) && !fileName.endsWith('.zip');
        })
        .map(file => {
          const fileName = path.basename(file.key);
          
          // Extrair informações do nome do arquivo (formato: hash_CT001.extensao)
          const match = fileName.match(/^([A-Z0-9]{6})_CT(\d+)(?:_(\d+))?\.(.+)$/);
          if (match) {
            const [, fileFeatureId, cenarioId, counter, extension] = match;
            const originalName = `CT${cenarioId.padStart(3, '0')}${counter ? `_${counter}` : ''}.${extension}`;
            
            return {
              filename: fileName, // Nome completo com hash
              originalName: originalName, // Nome sem hash para exibição
              cenarioId: parseInt(cenarioId),
              featureId: fileFeatureId,
              size: file.size,
              downloadUrl: `${getBaseUrl(req)}/api/anexos/${fileName}`,
              createdAt: file.lastModified
            };
          }
          return null;
        })
        .filter(attachment => attachment !== null)
        .sort((a, b) => a.cenarioId - b.cenarioId);
    } else {
      // Listar do filesystem local
      const anexosDir = 'public/anexos';
      
      if (!fs.existsSync(anexosDir)) {
        return res.json({
          success: true,
          attachments: []
        });
      }

      const files = fs.readdirSync(anexosDir);
      attachments = files
        .filter(file => file.startsWith(`${featureId}_CT`))
        .map(file => {
          const filePath = path.join(anexosDir, file);
          const stats = fs.statSync(filePath);
          
          // Extrair informações do nome do arquivo (formato: hash_CT001.extensao)
          const match = file.match(/^([A-Z0-9]{6})_CT(\d+)(?:_(\d+))?\.(.+)$/);
          if (match) {
            const [, fileFeatureId, cenarioId, counter, extension] = match;
            const originalName = `CT${cenarioId.padStart(3, '0')}${counter ? `_${counter}` : ''}.${extension}`;
            
            return {
              filename: file, // Nome completo com hash
              originalName: originalName, // Nome sem hash para exibição
              cenarioId: parseInt(cenarioId),
              featureId: fileFeatureId,
              size: stats.size,
              downloadUrl: `${getBaseUrl(req)}/anexos/${file}`,
              createdAt: stats.birthtime
            };
          }
          return null;
        })
        .filter(attachment => attachment !== null)
        .sort((a, b) => a.cenarioId - b.cenarioId);
    }

    res.json({
      success: true,
      attachments: attachments
    });

  } catch (error) {
    console.error('❌ Erro ao listar anexos:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor'
    });
  }
});

// Rota para download de arquivos
app.get('/api/attachments/download/:filename', async (req, res) => {
  try {
    const filename = req.params.filename;
    console.log(`📥 Tentando fazer download de: ${filename}`);
    
    // Extrair featureId do nome do arquivo para garantir que o ZIP seja extraído
    const match = filename.match(/^([A-Z0-9]{6})_CT/);
    if (match) {
      const featureId = match[1];
      console.log(`🔍 FeatureId extraído: ${featureId}`);
      
      // Tentar extrair o ZIP se existir (para garantir que os arquivos estejam disponíveis)
      try {
        console.log(`📦 Tentando extrair ZIP para feature ${featureId}...`);
        await extrairZipAnexos(featureId);
        console.log(`✅ ZIP extraído com sucesso para feature ${featureId}`);
      } catch (zipError) {
        console.error('⚠️  Erro ao extrair ZIP (não bloqueando download):', zipError);
        // Não bloqueia o download, apenas loga o erro
      }
    }
    
    const fileKey = `anexos/${filename}`;
    console.log(`🔍 Verificando se arquivo existe: ${fileKey}`);
    
    // Verificar se o arquivo existe antes de tentar baixar
    const arquivoExiste = await fileExists(fileKey);
    if (!arquivoExiste) {
      console.error(`❌ Arquivo não encontrado: ${fileKey}`);
      
      // Tentar listar todos os arquivos em anexos/ para debug
      if (USE_S3) {
        try {
          const todosArquivos = await s3Service.listFiles('anexos/');
          console.log(`📋 Arquivos disponíveis em anexos/:`, todosArquivos.map(f => f.key));
        } catch (listError) {
          console.error('⚠️  Erro ao listar arquivos:', listError);
        }
      }
      
      return res.status(404).json({
        success: false,
        message: 'Arquivo não encontrado'
      });
    }
    
    if (USE_S3) {
      // Download do S3
      try {
        console.log(`⬇️  Baixando arquivo do S3: ${fileKey}`);
        const buffer = await s3Service.downloadFile(fileKey);
        
        // Determinar content-type baseado na extensão
        const ext = path.extname(filename).toLowerCase();
        const contentTypes = {
          '.pdf': 'application/pdf',
          '.jpg': 'image/jpeg',
          '.jpeg': 'image/jpeg',
          '.png': 'image/png',
          '.gif': 'image/gif',
          '.txt': 'text/plain',
          '.doc': 'application/msword',
          '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          '.xls': 'application/vnd.ms-excel',
          '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        };
        
        // Definir headers para download
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.setHeader('Content-Type', contentTypes[ext] || 'application/octet-stream');
        res.send(buffer);
        console.log(`✅ Arquivo enviado com sucesso: ${filename}`);
      } catch (error) {
        console.error(`❌ Erro ao baixar arquivo do S3:`, error);
        return res.status(404).json({
          success: false,
          message: 'Arquivo não encontrado'
        });
      }
    } else {
      // Download do filesystem local
      const filePath = path.join(__dirname, '..', 'public', 'anexos', filename);
      
      if (!fs.existsSync(filePath)) {
        return res.status(404).json({
          success: false,
          message: 'Arquivo não encontrado'
        });
      }

      res.download(filePath);
    }
  } catch (error) {
    console.error('❌ Erro ao fazer download:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor'
    });
  }
});

// Rota para servir anexos do S3 (similar a /anexos/:filename para filesystem)
app.get('/api/anexos/:filename', async (req, res) => {
  try {
    const filename = req.params.filename;
    console.log(`🌐 Tentando servir anexo: ${filename}`);
    
    const fileKey = `anexos/${filename}`;
    const ext = path.extname(filename).toLowerCase();
    const isZipFile = ext === '.zip';
    
    // Se for um arquivo ZIP (formato: HASH_ID.zip), servir diretamente
    if (isZipFile) {
      const featureId = filename.replace('.zip', '');
      console.log(`📦 Servindo arquivo ZIP: ${fileKey} (featureId: ${featureId})`);
      
      // Verificar se o arquivo existe
      const arquivoExiste = await fileExists(fileKey);
      if (!arquivoExiste) {
        console.error(`❌ ZIP não encontrado: ${fileKey}`);
        return res.status(404).json({ error: 'Arquivo ZIP não encontrado' });
      }
      
      if (USE_S3) {
        try {
          const buffer = await s3Service.downloadFile(fileKey);
          res.setHeader('Content-Type', 'application/zip');
          res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
          res.send(buffer);
          console.log(`✅ ZIP servido com sucesso: ${filename}`);
          return;
        } catch (error) {
          console.error('❌ Erro ao servir ZIP:', error);
          return res.status(404).json({ error: 'Arquivo ZIP não encontrado' });
        }
      } else {
        const fullPath = path.join(__dirname, '..', 'public', fileKey);
        if (await fs.pathExists(fullPath)) {
          res.setHeader('Content-Type', 'application/zip');
          res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
          return res.sendFile(path.resolve(fullPath));
        } else {
          return res.status(404).json({ error: 'Arquivo ZIP não encontrado' });
        }
      }
    }
    
    // Para arquivos individuais (não ZIP), extrair do ZIP se necessário
    const match = filename.match(/^([A-Z0-9]{6})_CT/);
    if (match) {
      const featureId = match[1];
      console.log(`🔍 FeatureId extraído: ${featureId}`);
      
      // Tentar extrair o ZIP se existir (para garantir que os arquivos estejam disponíveis)
      try {
        console.log(`📦 Tentando extrair ZIP para feature ${featureId}...`);
        await extrairZipAnexos(featureId);
        console.log(`✅ ZIP extraído com sucesso para feature ${featureId}`);
      } catch (zipError) {
        console.error('⚠️  Erro ao extrair ZIP (não bloqueando acesso):', zipError);
        // Não bloqueia o acesso, apenas loga o erro
      }
    }
    
    console.log(`🔍 Verificando se arquivo existe: ${fileKey}`);
    
    // Verificar se o arquivo existe antes de tentar baixar
    const arquivoExiste = await fileExists(fileKey);
    if (!arquivoExiste) {
      console.error(`❌ Arquivo não encontrado: ${fileKey}`);
      
      // Tentar listar todos os arquivos em anexos/ para debug
      if (USE_S3) {
        try {
          const todosArquivos = await s3Service.listFiles('anexos/');
          console.log(`📋 Arquivos disponíveis em anexos/:`, todosArquivos.map(f => f.key));
        } catch (listError) {
          console.error('⚠️  Erro ao listar arquivos:', listError);
        }
      }
      
      return res.status(404).json({ error: 'Arquivo não encontrado' });
    }
    
    if (USE_S3) {
      try {
        console.log(`⬇️  Baixando arquivo do S3: ${fileKey}`);
        const buffer = await s3Service.downloadFile(fileKey);
        
        // Determinar content-type baseado na extensão
        const contentTypes = {
          '.pdf': 'application/pdf',
          '.jpg': 'image/jpeg',
          '.jpeg': 'image/jpeg',
          '.png': 'image/png',
          '.gif': 'image/gif',
          '.txt': 'text/plain',
          '.doc': 'application/msword',
          '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          '.xls': 'application/vnd.ms-excel',
          '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        };
        
        res.setHeader('Content-Type', contentTypes[ext] || 'application/octet-stream');
        res.send(buffer);
        console.log(`✅ Arquivo servido com sucesso: ${filename}`);
      } catch (error) {
        console.error('❌ Erro ao servir anexo:', error);
        res.status(404).json({ error: 'Arquivo não encontrado' });
      }
    } else {
      return res.status(404).json({ error: 'Rota disponível apenas com S3' });
    }
  } catch (error) {
    console.error('❌ Erro ao servir anexo:', error);
    res.status(404).json({ error: 'Arquivo não encontrado' });
  }
});

// ==================== ROTAS PARA IMAGENS DE FEATURES ====================

// Rota para upload de imagens de features (para uso no modal de IA)
app.post('/api/features/:featureId/images', verificarManutencaoMiddleware, upload.single('image'), handleMulterError, async (req, res) => {
  try {
    // Verificar flag inserirImagensProduto
    const flags = await lerFlags();
    if (!flags.inserirImagensProduto) {
      return res.status(403).json({
        success: false,
        message: 'A funcionalidade de inserir imagens foi desabilitada pelo administrador.'
      });
    }
    
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'Nenhuma imagem enviada'
      });
    }

    const { featureId } = req.params;
    
    if (!featureId) {
      return res.status(400).json({
        success: false,
        message: 'featureId é obrigatório'
      });
    }

    // Validar se é uma imagem
    if (!req.file.mimetype.startsWith('image/')) {
      return res.status(400).json({
        success: false,
        message: 'Arquivo deve ser uma imagem'
      });
    }

    // Gerar nome do arquivo: {featureId}_{numero}.{ext}
    // Buscar imagens existentes para determinar o próximo número
    let nextNumber = 1;
    if (USE_S3) {
      const existingFiles = await s3Service.listFiles(`features/images/${featureId}_`);
      if (existingFiles.length > 0) {
        // Extrair números das imagens existentes e encontrar o próximo
        const numbers = existingFiles
          .map(file => {
            const fileName = path.basename(file.key);
            const match = fileName.match(/^[A-Z0-9]{6}_(\d+)\./);
            return match ? parseInt(match[1]) : 0;
          })
          .filter(num => num > 0);
        if (numbers.length > 0) {
          nextNumber = Math.max(...numbers) + 1;
        }
      }
    } else {
      const imagesDir = path.join(__dirname, '..', 'public', 'features', 'images');
      if (await fs.pathExists(imagesDir)) {
        const files = await fs.readdir(imagesDir);
        const featureImages = files.filter(file => file.startsWith(`${featureId}_`));
        if (featureImages.length > 0) {
          const numbers = featureImages
            .map(file => {
              const match = file.match(/^[A-Z0-9]{6}_(\d+)\./);
              return match ? parseInt(match[1]) : 0;
            })
            .filter(num => num > 0);
          if (numbers.length > 0) {
            nextNumber = Math.max(...numbers) + 1;
          }
        }
      }
    }
    
    const extension = path.extname(req.file.originalname);
    const imageFileName = `${featureId}_${nextNumber}${extension}`;
    const imagePath = `features/images/${imageFileName}`;

    // Fazer upload para S3 ou filesystem
    if (USE_S3) {
      const contentType = req.file.mimetype;
      const fileBuffer = req.file.buffer;
      await uploadBuffer(fileBuffer, imagePath, contentType);
    } else {
      const fullPath = path.join(__dirname, '..', 'public', imagePath);
      await fs.ensureDir(path.dirname(fullPath));
      await fs.writeFile(fullPath, req.file.buffer);
    }

    // Atualizar JSON da feature com referência à imagem
    await updateFeatureWithImage(featureId, imageFileName);

    res.json({
      success: true,
      message: 'Imagem salva com sucesso!',
      image_path: imagePath,
      image_name: imageFileName,
      download_url: USE_S3 
        ? `${getBaseUrl(req)}/api/features/${featureId}/images/${imageFileName}` 
        : `${getBaseUrl(req)}/${imagePath}`
    });

  } catch (error) {
    console.error('❌ Erro ao salvar imagem:', error.message);
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor'
    });
  }
});

// Rota para listar imagens de uma feature
app.get('/api/features/:featureId/images', async (req, res) => {
  try {
    const { featureId } = req.params;
    let images = [];

    if (USE_S3) {
      // Listar do S3
      const s3Files = await s3Service.listFiles(`features/images/${featureId}_`);
      images = s3Files
        .map(file => {
          const fileName = path.basename(file.key);
          
          // Verificar se o arquivo pertence à feature
          if (fileName.startsWith(`${featureId}_`)) {
            // Extrair número do nome do arquivo para ordenação
            const match = fileName.match(/^[A-Z0-9]{6}_(\d+)\./);
            const number = match ? parseInt(match[1]) : 0;
            
            return {
              filename: fileName,
              size: file.size,
              downloadUrl: `${getBaseUrl(req)}/api/features/${featureId}/images/${fileName}`,
              createdAt: file.lastModified,
              number: number
            };
          }
          return null;
        })
        .filter(image => image !== null)
        .sort((a, b) => (a.number || 0) - (b.number || 0));
    } else {
      // Listar do filesystem local
      const imagesDir = path.join(__dirname, '..', 'public', 'features', 'images');
      
      if (await fs.pathExists(imagesDir)) {
        const files = await fs.readdir(imagesDir);
        images = files
          .filter(file => file.startsWith(`${featureId}_`))
          .map(file => {
            const filePath = path.join(imagesDir, file);
            const stats = fs.statSync(filePath);
            
            // Extrair número do nome do arquivo para ordenação
            const match = file.match(/^[A-Z0-9]{6}_(\d+)\./);
            const number = match ? parseInt(match[1]) : 0;
            
            return {
              filename: file,
              size: stats.size,
              downloadUrl: `${getBaseUrl(req)}/features/images/${file}`,
              createdAt: stats.birthtime,
              number: number
            };
          })
          .sort((a, b) => (a.number || 0) - (b.number || 0));
      }
    }

    res.json({
      success: true,
      images: images
    });

  } catch (error) {
    console.error('❌ Erro ao listar imagens:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor'
    });
  }
});

// Rota para servir/download de imagens
app.get('/api/features/:featureId/images/:imageName', async (req, res) => {
  try {
    const { featureId, imageName } = req.params;
    
    // Validar que a imagem pertence à feature
    if (!imageName.startsWith(`${featureId}_`)) {
      return res.status(403).json({ error: 'Acesso negado' });
    }

    const imagePath = `features/images/${imageName}`;

    if (USE_S3) {
      try {
        const buffer = await s3Service.downloadFile(imagePath);
        
        // Determinar content-type baseado na extensão
        const ext = path.extname(imageName).toLowerCase();
        const contentTypes = {
          '.jpg': 'image/jpeg',
          '.jpeg': 'image/jpeg',
          '.png': 'image/png',
          '.gif': 'image/gif',
          '.webp': 'image/webp',
        };
        
        res.setHeader('Content-Type', contentTypes[ext] || 'image/jpeg');
        res.send(buffer);
      } catch (error) {
        if (error.name === 'NoSuchKey' || error.$metadata?.httpStatusCode === 404) {
          return res.status(404).json({ error: 'Imagem não encontrada' });
        }
        throw error;
      }
    } else {
      const fullPath = path.join(__dirname, '..', 'public', imagePath);
      
      if (!fs.existsSync(fullPath)) {
        return res.status(404).json({ error: 'Imagem não encontrada' });
      }

      // Determinar content-type baseado na extensão
      const ext = path.extname(imageName).toLowerCase();
      const contentTypes = {
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.png': 'image/png',
        '.gif': 'image/gif',
        '.webp': 'image/webp',
      };
      
      res.setHeader('Content-Type', contentTypes[ext] || 'image/jpeg');
      res.sendFile(path.resolve(fullPath));
    }
  } catch (error) {
    console.error('❌ Erro ao servir imagem:', error);
    res.status(404).json({ error: 'Imagem não encontrada' });
  }
});

// Rota para deletar imagem de uma feature
app.delete('/api/features/:featureId/images/:imageName', verificarManutencaoMiddleware, async (req, res) => {
  try {
    const { featureId, imageName } = req.params;
    
    // Validar que a imagem pertence à feature
    if (!imageName.startsWith(`${featureId}_`)) {
      return res.status(403).json({ 
        success: false,
        message: 'Acesso negado' 
      });
    }

    const imagePath = `features/images/${imageName}`;

    // Verificar se arquivo existe
    const exists = await fileExists(imagePath);
    
    if (!exists && !USE_S3) {
      return res.status(404).json({
        success: false,
        message: 'Imagem não encontrada'
      });
    }

    // Remover arquivo
    await deleteFile(imagePath);

    // Atualizar JSON da feature removendo a referência à imagem
    await removeImageFromFeature(featureId, imageName);

    res.json({
      success: true,
      message: 'Imagem removida com sucesso'
    });

  } catch (error) {
    console.error('❌ Erro ao remover imagem:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor'
    });
  }
});

// Função para atualizar feature com referência à imagem
async function updateFeatureWithImage(featureId, imageFileName) {
  try {
    const featureData = await readJsonFile(`features/metadata/json/${featureId}.json`);
    
    if (featureData) {
      if (!featureData.images) {
        featureData.images = [];
      }
      
      // Adicionar apenas se não existir
      if (!featureData.images.includes(imageFileName)) {
        featureData.images.push(imageFileName);
        await writeJsonFile(`features/metadata/json/${featureId}.json`, featureData);
        console.log(`✅ Imagem ${imageFileName} adicionada à feature ${featureId}`);
      }
    }
  } catch (error) {
    console.error('❌ Erro ao atualizar feature com imagem:', error);
  }
}

// Função para remover referência de imagem da feature
async function removeImageFromFeature(featureId, imageFileName) {
  try {
    const featureData = await readJsonFile(`features/metadata/json/${featureId}.json`);
    
    if (featureData) {
      // Remover da lista de imagens
      if (featureData.images) {
        featureData.images = featureData.images.filter(img => img !== imageFileName);
      }
      
      // Remover da lista de imagens selecionadas
      if (featureData.imagens_selecionadas) {
        featureData.imagens_selecionadas = featureData.imagens_selecionadas.filter(img => img !== imageFileName);
      }
      
      await writeJsonFile(`features/metadata/json/${featureId}.json`, featureData);
      console.log(`✅ Imagem ${imageFileName} removida da feature ${featureId}`);
    }
  } catch (error) {
    console.error('❌ Erro ao remover imagem da feature:', error);
  }
}

// ==================== FIM DAS ROTAS DE IMAGENS ====================

// Rota para remover anexo individual
app.delete('/api/attachments/:filename', verificarManutencaoMiddleware, async (req, res) => {
  const filename = req.params.filename;
  
  try {
    // Verificar se arquivo existe
    const exists = await fileExists(`anexos/${filename}`);
    
    if (exists || USE_S3) {
      // Extrair informações do arquivo para atualizar o JSON
      const match = filename.match(/^([A-Z0-9]{6})_CT(\d+)(?:_(\d+))?\.(.+)$/);
      let featureId = null;
      
      if (match) {
        const [, fileFeatureId, cenarioId, counter, extension] = match;
        featureId = fileFeatureId;
        const fileNameOnly = `CT${cenarioId.padStart(3, '0')}${counter ? `_${counter}` : ''}.${extension}`;
        
        // Primeiro, atualizar JSON da feature removendo o arquivo
        // Isso garante que o arquivo não será incluído no novo ZIP
        await removeAttachmentFromFeature(featureId, parseInt(cenarioId), fileNameOnly);
        
        // Remover arquivo individual (se existir)
        await deleteFile(`anexos/${filename}`);
        console.log(`🗑️  Arquivo removido: anexos/${filename}`);
        
        // Atualizar ZIP de anexos após exclusão
        // A função criarZipAnexos vai usar o JSON atualizado (sem o arquivo removido)
        // e não vai incluir o arquivo removido no novo ZIP
        if (featureId) {
          try {
            await atualizarZipAnexos(featureId);
          } catch (zipError) {
            console.error('⚠️  Erro ao atualizar ZIP de anexos (não bloqueando exclusão):', zipError);
            // Não bloqueia a exclusão, apenas loga o erro
          }
        }
        
        res.json({
          success: true,
          message: 'Anexo removido com sucesso'
        });
      } else {
        // Se não conseguir extrair informações, apenas remover o arquivo
        await deleteFile(`anexos/${filename}`);
        res.json({
          success: true,
          message: 'Anexo removido com sucesso'
        });
      }
    } else {
      res.status(404).json({
        success: false,
        message: 'Anexo não encontrado'
      });
    }
  } catch (error) {
    console.error('❌ Erro ao remover anexo:', error);
    res.status(500).json({
      success: false,
      message: 'Erro ao remover anexo'
    });
  }
});

// Rota para baixar todos os anexos de uma feature em ZIP
app.get('/api/features/zip/:featureId', async (req, res) => {
  try {
    const featureId = req.params.featureId;
    const zipKey = `anexos/${featureId}.zip`;
    let featureName = featureId; // Fallback para o ID

    // Buscar nome da feature
    try {
      const mainData = await readJsonFile('features/data-main.json');
      if (mainData) {
        const feature = mainData.features.find(f => f.id === featureId);
        if (feature && feature.featureName) {
          featureName = feature.featureName;
        }
      }
    } catch (error) {
      console.warn('⚠️  Não foi possível buscar nome da feature, usando ID');
    }

    // Verificar se o ZIP existe
    const zipExists = await fileExists(zipKey);
    if (!zipExists) {
      console.log(`⚠️  ZIP não encontrado para feature ${featureId}: ${zipKey}`);
      return res.status(404).json({
        success: false,
        message: 'Arquivo ZIP não encontrado para esta feature'
      });
    }

    // Baixar ZIP diretamente
    let zipBuffer;
    if (USE_S3) {
      try {
        zipBuffer = await s3Service.downloadFile(zipKey);
        console.log(`✅ ZIP baixado do S3: ${zipKey} (${zipBuffer.length} bytes)`);
      } catch (error) {
        console.error('❌ Erro ao baixar ZIP do S3:', error);
        return res.status(404).json({
          success: false,
          message: 'Erro ao baixar arquivo ZIP'
        });
      }
    } else {
      const fullPath = path.join(__dirname, '..', 'public', zipKey);
      if (!await fs.pathExists(fullPath)) {
        return res.status(404).json({
          success: false,
          message: 'Arquivo ZIP não encontrado'
        });
      }
      zipBuffer = await fs.readFile(fullPath);
      console.log(`✅ ZIP baixado do filesystem: ${zipKey} (${zipBuffer.length} bytes)`);
    }

    // Sanitizar nome da feature para uso em nome de arquivo
    const removeAccents = (str) => str.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const sanitizedFeatureName = removeAccents(featureName)
      .replace(/[^a-zA-Z0-9\s-]/g, '') // Remove caracteres especiais
      .replace(/\s+/g, '_') // Substitui espaços por underscore
      .substring(0, 50); // Limita tamanho

    // Definir headers para download
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${sanitizedFeatureName}_anexos.zip"`);
    
    // Enviar ZIP diretamente
    res.send(zipBuffer);

    console.log(`✅ ZIP servido: ${sanitizedFeatureName}_anexos.zip (${zipBuffer.length} bytes)`);

  } catch (error) {
    console.error('❌ Erro ao servir ZIP:', error);
    
    // Verificar se a resposta já foi enviada
    if (!res.headersSent) {
      res.status(500).json({
        success: false,
        message: 'Erro ao servir ZIP'
      });
    }
  }
});

// Função para remover anexo do JSON da feature
async function removeAttachmentFromFeature(featureId, cenarioId, fileName) {
  try {
    const featureData = await readJsonFile(`features/metadata/json/${featureId}.json`);
    
    if (featureData) {
      // Encontrar o cenário e remover o arquivo
      const cenario = featureData.cenarios.find(c => c.id === cenarioId);
      if (cenario && cenario.arquivos) {
        cenario.arquivos = cenario.arquivos.filter(arquivo => arquivo !== fileName);
        
        // Salvar arquivo atualizado
        await writeJsonFile(`features/metadata/json/${featureId}.json`, featureData);
        
        console.log(`✅ Anexo ${fileName} removido do cenário ${cenarioId} da feature ${featureId}`);
      }
    }
  } catch (error) {
    console.error('❌ Erro ao remover anexo do JSON da feature:', error);
  }
}

// Rota para salvar histórico de execução de testes
app.post('/api/test-history/save', verificarManutencaoMiddleware, async (req, res) => {
  try {
    const {
      feature_name,
      feature_id,
      testador,
      ambiente,
      cenarios = [],
      taxa_aprovacao = 0
    } = req.body;

    if (!feature_name || !feature_id || !testador || !ambiente) {
      return res.status(400).json({
        success: false,
        message: 'feature_name, feature_id, testador e ambiente são obrigatórios'
      });
    }

    // Gerar nome do arquivo de histórico
    const removeAccents = (str) => str.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const featureSlug = removeAccents(feature_name.toLowerCase())
      .replace(/[^a-z0-9]/g, '_')  // Substituir caracteres especiais por _
      .replace(/_+/g, '_')          // Substituir múltiplos _ por um único
      .replace(/^_|_$/g, '');       // Remover _ do início e fim
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const fileName = `${feature_id}_${featureSlug}_${timestamp}.csv`;
    
    console.log(`💾 Salvando histórico: ${fileName}`);

    // Preparar dados do CSV
    const dataAtual = new Date();
    const dataFormatada = dataAtual.toLocaleDateString('pt-BR');
    const horaFormatada = dataAtual.toLocaleTimeString('pt-BR');

    let csvContent = `Data da Execução,${dataFormatada}\n`;
    csvContent += `Hora da Execução,${horaFormatada}\n`;
    csvContent += `Testador,${testador}\n`;
    csvContent += `Ambiente,${ambiente}\n`;
    csvContent += `Taxa de Aprovação,${taxa_aprovacao}%\n`;
    csvContent += `\n`;
    csvContent += `Caso de Teste,Status\n`;

    // Adicionar cada cenário
    cenarios.forEach(cenario => {
      const statusMap = {
        'aprovado': 'Aprovado',
        'reprovado': 'Reprovado',
        'bloqueado': 'Bloqueado',
        'na': 'Não Executado'
      };
      const statusTexto = statusMap[cenario.status] || 'Não Executado';
      // Usar título completo do caso de teste (ex: "CT001 - Login com credenciais válidas")
      // Se não tiver título, usar ID como fallback
      const tituloCompleto = cenario.titulo || `CT${String(cenario.id).padStart(3, '0')}`;
      csvContent += `"${tituloCompleto}",${statusTexto}\n`;
    });

    // Adicionar seção de anexos
    csvContent += `\n`;
    csvContent += `Anexos\n`;
    csvContent += `Caso de Teste,Quantidade,Arquivos\n`;
    
    cenarios.forEach(cenario => {
      const anexos = cenario.arquivos || [];
      const quantidadeOriginal = anexos.length;
      
      if (quantidadeOriginal > 0) {
        console.log(`  📁 CT${String(cenario.id).padStart(3, '0')}: ${quantidadeOriginal} anexo(s) no array`);
        console.log(`     Array original:`, anexos);
        console.log(`     Tipos:`, anexos.map(a => typeof a));
      }
      
      // Normalizar anexos: converter objetos para strings
      const anexosNormalizados = anexos.map(anexo => {
        if (typeof anexo === 'object' && anexo !== null) {
          // Se é objeto, extrair o campo 'nome'
          return anexo.nome || anexo.filename || '';
        } else if (typeof anexo === 'string') {
          // Se já é string, manter
          return anexo;
        }
        return '';
      });
      
      // Filtrar arquivos válidos
      const arquivosFiltrados = anexosNormalizados.filter(anexo => anexo && anexo.trim() !== '');
      const quantidade = arquivosFiltrados.length; // Usar quantidade APÓS filtro
      
      if (quantidadeOriginal > 0) {
        console.log(`     Após normalização: ${arquivosFiltrados.length} arquivo(s) válido(s)`, arquivosFiltrados);
      }
      
      if (quantidade > 0) {
        const arquivos = arquivosFiltrados
          .map(anexo => {
            // Extrair nome do arquivo do path completo
            const nomeArquivo = anexo.includes('/') ? anexo.split('/').pop() : anexo;
            return nomeArquivo;
          })
          .join('; ');
        
        console.log(`     String final: "${arquivos}"`);
        // Usar título completo do caso de teste
        const tituloCompleto = cenario.titulo || `CT${String(cenario.id).padStart(3, '0')}`;
        csvContent += `"${tituloCompleto}",${quantidade},"${arquivos}"\n`;
      } else {
        // Usar título completo do caso de teste
        const tituloCompleto = cenario.titulo || `CT${String(cenario.id).padStart(3, '0')}`;
        csvContent += `"${tituloCompleto}",0,Nenhum anexo\n`;
      }
    });

    // Converter CSV content para Buffer
    const csvBuffer = Buffer.from(csvContent, 'utf-8');
    
    // Adicionar ao ZIP de histórico
    try {
      await criarZipHistorico(feature_id, fileName, csvBuffer);
      console.log(`✅ Histórico adicionado ao ZIP: ${fileName}`);
    } catch (zipError) {
      console.error('⚠️  Erro ao adicionar histórico ao ZIP (salvando como arquivo individual):', zipError);
      // Fallback: salvar como arquivo individual se falhar
      await writeTextFile(`historico/${fileName}`, csvContent, 'text/csv');
    }

    res.json({
      success: true,
      message: 'Histórico salvo com sucesso!',
      file_path: `historico/${fileName}`,
      file_name: fileName
    });

  } catch (error) {
    console.error('❌ Erro ao salvar histórico:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor'
    });
  }
});

// Rota para listar histórico de testes com filtros
app.get('/api/test-history/list', async (req, res) => {
  try {
    // Pegar parâmetros de filtro
    const searchTerm = (req.query.search || '').toLowerCase().trim();
    const featureIdFilter = (req.query.featureId || '').toUpperCase().trim();
    const ambienteFilter = (req.query.ambiente || '').toLowerCase().trim();
    
    console.log(`🔍 Filtros de histórico: search="${searchTerm}", featureId="${featureIdFilter}", ambiente="${ambienteFilter}"`);
    
    // Extrair ZIPs de histórico para todas as features (se houver featureIdFilter, apenas essa)
    if (USE_S3) {
      const s3Files = await s3Service.listFiles('historico/');
      const zipFiles = s3Files.filter(file => file.key.endsWith('.zip'));
      
      // Extrair featureIds dos ZIPs
      const featureIds = new Set();
      zipFiles.forEach(file => {
        const fileName = path.basename(file.key);
        const featureId = fileName.replace('.zip', '');
        if (featureIdFilter && featureId === featureIdFilter) {
          featureIds.add(featureId);
        } else if (!featureIdFilter) {
          featureIds.add(featureId);
        }
      });
      
      // Extrair ZIPs para garantir que os CSVs estejam disponíveis
      for (const featureId of featureIds) {
        try {
          await extrairZipHistorico(featureId);
        } catch (zipError) {
          console.error(`⚠️  Erro ao extrair ZIP de histórico para feature ${featureId} (não bloqueando listagem):`, zipError);
        }
      }
    } else {
      const historicoDir = path.join(__dirname, '..', 'public', 'historico');
      if (await fs.pathExists(historicoDir)) {
        const allFiles = await fs.readdir(historicoDir);
        const zipFiles = allFiles.filter(file => file.endsWith('.zip'));
        
        const featureIds = new Set();
        zipFiles.forEach(file => {
          const featureId = file.replace('.zip', '');
          if (featureIdFilter && featureId === featureIdFilter) {
            featureIds.add(featureId);
          } else if (!featureIdFilter) {
            featureIds.add(featureId);
          }
        });
        
        // Extrair ZIPs para garantir que os CSVs estejam disponíveis
        for (const featureId of featureIds) {
          try {
            await extrairZipHistorico(featureId);
          } catch (zipError) {
            console.error(`⚠️  Erro ao extrair ZIP de histórico para feature ${featureId} (não bloqueando listagem):`, zipError);
          }
        }
      }
    }
    
    let files = [];

    if (USE_S3) {
      // Listar do S3 (agora incluindo CSVs extraídos do ZIP)
      const s3Files = await s3Service.listFiles('historico/');
      
      // Buscar features para nome completo
      const mainData = await readJsonFile('features/data-main.json');
      
      files = s3Files
        .filter(file => file.key.endsWith('.csv'))
        .map(file => {
          const fileName = path.basename(file.key);
          
          // Extrair informações do nome do arquivo
          const fileNameWithoutExt = fileName.replace('.csv', '');
          const parts = fileNameWithoutExt.split('_');
          const featureId = parts[0];
          
          // O timestamp é sempre a última parte
          const timestamp = parts[parts.length - 1];
          // O nome da feature está entre a segunda e penúltima parte
          const featureNameParts = parts.slice(1, -1);
          
          // Tentar buscar o nome correto da feature
          let featureName = featureNameParts.join('_').replace(/_/g, ' ');
          let ambiente = '';
          
          if (mainData) {
            const feature = mainData.features.find(f => f.id === featureId);
            if (feature) {
              if (feature.featureName) {
                featureName = feature.featureName;
              }
              if (feature.environment) {
                ambiente = feature.environment.toLowerCase();
              }
            }
          }
          
          return {
            file_name: fileName,
            feature_id: featureId,
            feature_name: featureName,
            ambiente: ambiente,
            data_criacao: file.lastModified,
            data_modificacao: file.lastModified,
            tamanho: file.size
          };
        })
        .sort((a, b) => new Date(b.data_modificacao) - new Date(a.data_modificacao));
      
      // Aplicar filtros
      if (searchTerm) {
        const searchTermNormalized = searchTerm.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        files = files.filter(file => {
          const featureNameNormalized = file.feature_name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
          return featureNameNormalized.includes(searchTermNormalized);
        });
      }
      
      if (featureIdFilter) {
        files = files.filter(file => file.feature_id === featureIdFilter);
      }
      
      if (ambienteFilter && ambienteFilter !== 'todos') {
        files = files.filter(file => file.ambiente === ambienteFilter);
      }
      
    } else {
      // Listar do filesystem local
      const historicoDir = path.join(__dirname, '..', 'public', 'historico');
      
      if (!fs.existsSync(historicoDir)) {
        return res.json({
          success: true,
          historico: []
        });
      }

      files = fs.readdirSync(historicoDir)
        .filter(file => {
          // Filtrar apenas arquivos CSV (não ZIPs)
          return file.endsWith('.csv') && !file.endsWith('.zip');
        })
        .map(file => {
          const filePath = path.join(historicoDir, file);
          const stats = fs.statSync(filePath);
          
          // Extrair informações do nome do arquivo
          const fileName = file.replace('.csv', '');
          const parts = fileName.split('_');
          const featureId = parts[0];
          
          // O timestamp é sempre a última parte
          const timestamp = parts[parts.length - 1];
          // O nome da feature está entre a segunda e penúltima parte
          const featureNameParts = parts.slice(1, -1);
          
          // Tentar buscar o nome correto da feature
          let featureName = featureNameParts.join('_').replace(/_/g, ' ');
          let ambiente = '';
          
          try {
            const mainFilePath = path.join(__dirname, '..', 'public', 'features', 'data-main.json');
            if (fs.existsSync(mainFilePath)) {
              const mainData = fs.readJsonSync(mainFilePath);
              const feature = mainData.features.find(f => f.id === featureId);
              if (feature) {
                if (feature.featureName) {
                  featureName = feature.featureName;
                }
                if (feature.environment) {
                  ambiente = feature.environment.toLowerCase();
                }
              }
            }
          } catch (error) {
            console.warn('Erro ao buscar nome da feature:', error);
          }
          
          return {
            file_name: file,
            feature_id: featureId,
            feature_name: featureName,
            ambiente: ambiente,
            data_criacao: stats.birthtime,
            data_modificacao: stats.mtime,
            tamanho: stats.size
          };
        })
        .sort((a, b) => new Date(b.data_modificacao) - new Date(a.data_modificacao));
      
      // Aplicar filtros
      if (searchTerm) {
        const searchTermNormalized = searchTerm.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        files = files.filter(file => {
          const featureNameNormalized = file.feature_name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
          return featureNameNormalized.includes(searchTermNormalized);
        });
      }
      
      if (featureIdFilter) {
        files = files.filter(file => file.feature_id === featureIdFilter);
      }
      
      if (ambienteFilter && ambienteFilter !== 'todos') {
        files = files.filter(file => file.ambiente === ambienteFilter);
      }
    }

    console.log(`📊 Listando histórico: ${files.length} arquivo(s) encontrado(s) ${searchTerm || featureIdFilter || ambienteFilter ? '(filtrados)' : ''}`);
    
    res.json({
      success: true,
      historico: files
    });

  } catch (error) {
    console.error('❌ Erro ao listar histórico:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor'
    });
  }
});

// Rota para obter conteúdo de um arquivo de histórico
app.get('/api/test-history/:filename', async (req, res) => {
  try {
    // Decodificar o nome do arquivo (caso venha com caracteres especiais codificados)
    let filename = decodeURIComponent(req.params.filename);
    
    console.log(`📂 Buscando histórico: ${filename}`);
    
    // Extrair featureId do nome do arquivo (formato: HASH_ID_nome_timestamp.csv)
    const match = filename.match(/^([A-Z0-9]{6})_/);
    if (match) {
      const featureId = match[1];
      console.log(`🔍 FeatureId extraído: ${featureId}`);
      try {
        console.log(`📦 Tentando extrair ZIP de histórico para feature ${featureId}...`);
        await extrairZipHistorico(featureId);
        console.log(`✅ ZIP de histórico extraído com sucesso para feature ${featureId}`);
      } catch (zipError) {
        console.error('⚠️  Erro ao extrair ZIP de histórico (não bloqueando leitura):', zipError);
      }
    }
    
    if (USE_S3) {
      // Ler do S3
      try {
        const buffer = await s3Service.downloadFile(`historico/${filename}`);
        const content = buffer.toString('utf-8');
        
        // Buscar metadados do arquivo
        const files = await s3Service.listFiles(`historico/${filename}`);
        const fileInfo = files[0];
        
        console.log(`✅ Histórico encontrado: ${filename}`);
        
        res.json({
          success: true,
          content: content,
          file_name: filename,
          data_modificacao: fileInfo ? fileInfo.lastModified : new Date(),
          tamanho: fileInfo ? fileInfo.size : buffer.length
        });
      } catch (error) {
        console.error(`❌ Histórico não encontrado: ${filename}`, error.message);
        console.log(`   URL original recebida: ${req.params.filename}`);
        console.log(`   Comprimento do nome: ${filename.length} caracteres`);
        
        // Listar arquivos disponíveis para debug
        const allFiles = await s3Service.listFiles('historico/');
        console.log('📋 Arquivos disponíveis no S3:');
        allFiles.forEach(f => {
          const baseName = path.basename(f.key);
          console.log(`   - ${baseName} (${baseName.length} caracteres)`);
        });
        
        // Tentar encontrar arquivo similar (para debug)
        const similarFiles = allFiles
          .map(f => path.basename(f.key))
          .filter(name => name.startsWith(filename.substring(0, 10)));
        
        if (similarFiles.length > 0) {
          console.log(`💡 Arquivos similares encontrados:`, similarFiles);
        }
        
        return res.status(404).json({
          success: false,
          message: 'Arquivo de histórico não encontrado',
          filename_buscado: filename,
          filename_original: req.params.filename,
          arquivos_disponiveis: allFiles.map(f => path.basename(f.key)),
          arquivos_similares: similarFiles
        });
      }
    } else {
      // Ler do filesystem local
      const filePath = path.join(__dirname, '..', 'public', 'historico', filename);
      
      if (!fs.existsSync(filePath)) {
        return res.status(404).json({
          success: false,
          message: 'Arquivo de histórico não encontrado'
        });
      }

      const content = fs.readFileSync(filePath, 'utf8');
      const stats = fs.statSync(filePath);

      res.json({
        success: true,
        content: content,
        file_name: filename,
        data_modificacao: stats.mtime,
        tamanho: stats.size
      });
    }

  } catch (error) {
    console.error('❌ Erro ao obter histórico:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor'
    });
  }
});

// Rota para renomear arquivos de anexos ao reorganizar CTs
app.post('/api/attachments/rename', verificarManutencaoMiddleware, async (req, res) => {
  try {
    const { featureId, oldCenarioId, newCenarioId } = req.body;
    
    if (!featureId || !oldCenarioId || !newCenarioId) {
      return res.status(400).json({
        success: false,
        message: 'featureId, oldCenarioId e newCenarioId são obrigatórios'
      });
    }
    
    const oldCenarioIdFormatted = String(oldCenarioId).padStart(3, '0');
    const newCenarioIdFormatted = String(newCenarioId).padStart(3, '0');
    
    // Listar todos os arquivos do CT antigo
    let filesToRename = [];
    
    if (USE_S3) {
      const allFiles = await s3Service.listFiles('anexos/');
      filesToRename = allFiles
        .filter(file => {
          const fileName = path.basename(file.key);
          const match = fileName.match(/^([A-Z0-9]{6})_CT(\d+)(?:_(\d+))?\.(.+)$/);
          if (match) {
            const [, fileFeatureId, cenarioId] = match;
            return fileFeatureId === featureId && cenarioId === oldCenarioIdFormatted;
          }
          return false;
        })
        .map(file => path.basename(file.key));
    } else {
      const anexosDir = path.join(__dirname, '..', 'public', 'anexos');
      if (fs.existsSync(anexosDir)) {
        filesToRename = fs.readdirSync(anexosDir)
          .filter(file => {
            const match = file.match(/^([A-Z0-9]{6})_CT(\d+)(?:_(\d+))?\.(.+)$/);
            if (match) {
              const [, fileFeatureId, cenarioId] = match;
              return fileFeatureId === featureId && cenarioId === oldCenarioIdFormatted;
            }
            return false;
          });
      }
    }
    
    // Renomear cada arquivo
    const renamedFiles = [];
    for (const oldFileName of filesToRename) {
      const match = oldFileName.match(/^([A-Z0-9]{6})_CT(\d+)(?:_(\d+))?\.(.+)$/);
      if (match) {
        const [, , , counter, extension] = match;
        const newFileName = `${featureId}_CT${newCenarioIdFormatted}${counter ? `_${counter}` : ''}.${extension}`;
        
        const oldPath = `anexos/${oldFileName}`;
        const newPath = `anexos/${newFileName}`;
        
        // Verificar se o novo nome já existe (pode acontecer em reorganizações)
        if (await fileExists(newPath)) {
          // Se já existe, adicionar um contador
          let counterNew = 1;
          let finalNewPath = newPath;
          const baseName = `${featureId}_CT${newCenarioIdFormatted}`;
          const ext = path.extname(newFileName);
          
          while (await fileExists(finalNewPath)) {
            finalNewPath = `anexos/${baseName}_${counterNew}${ext}`;
            counterNew++;
          }
          
          await renameFile(oldPath, finalNewPath);
          renamedFiles.push({
            oldName: oldFileName,
            newName: path.basename(finalNewPath)
          });
        } else {
          await renameFile(oldPath, newPath);
          renamedFiles.push({
            oldName: oldFileName,
            newName: newFileName
          });
        }
      }
    }
    
    res.json({
      success: true,
      message: `${renamedFiles.length} arquivo(s) renomeado(s) com sucesso`,
      renamedFiles: renamedFiles
    });
    
  } catch (error) {
    console.error('❌ Erro ao renomear arquivos:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor'
    });
  }
});

// Rota para remover arquivo de histórico
app.delete('/api/test-history/:filename', verificarManutencaoMiddleware, (req, res) => {
  const { filename } = req.params;
  
  if (!filename) {
    return res.status(400).json({ 
      success: false, 
      message: 'Nome do arquivo não fornecido' 
    });
  }
  
  try {
    const historicoDir = path.join(__dirname, '..', 'public', 'historico');
    const filePath = path.join(historicoDir, filename);
    
    // Verificar se o arquivo existe
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ 
        success: false, 
        message: 'Arquivo não encontrado' 
      });
    }
    
    // Deletar o arquivo
    fs.unlinkSync(filePath);
    
    console.log(`Arquivo de histórico deletado: ${filename}`);
    
    res.json({ 
      success: true, 
      message: 'Arquivo de histórico deletado com sucesso' 
    });
    
  } catch (error) {
    console.error('❌ Erro ao deletar arquivo de histórico:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Erro interno do servidor' 
    });
  }
});

// IMPORTANTE: Configurar arquivos estáticos ANTES das rotas de HTML
// Isso garante que CSS, JS, imagens sejam servidos corretamente
app.use(express.static('public', {
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.css')) {
      res.setHeader('Content-Type', 'text/css');
    }
    if (filePath.endsWith('.js')) {
      res.setHeader('Content-Type', 'application/javascript');
    }
    // Headers para prevenir cache
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
  }
}));

// Rota para a página inicial - redirecionar para index.html
app.get('/', (req, res) => {
  res.redirect(302, '/html/index.html');
});

// Rota para a página de histórico
app.get('/html/historico.html', (req, res) => {
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  
  res.sendFile(path.join(__dirname, '..', 'public', 'html', 'historico.html'));
});

// Rota para o template HTML
app.get('/template', (req, res) => {
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  
  res.sendFile(path.join(__dirname, '..', 'public', 'html', 'template.html'));
});

// Rota alternativa para o template HTML
app.get('/template.html', (req, res) => {
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  
  res.sendFile(path.join(__dirname, '..', 'public', 'html', 'template.html'));
});

// Rota para obter estatísticas gerais
app.get('/api/statistics', async (req, res) => {
  try {
    // Ler data-main.json
    const mainData = await readJsonFile('features/data-main.json');
    
    if (!mainData || !mainData.features || mainData.features.length === 0) {
      return res.json({
        success: true,
        stats: {
          totalCasosTeste: 0,
          totalCasosIA: 0,
          totalCasosManual: 0,
          aprovados: 0,
          reprovados: 0,
          bloqueados: 0,
          naoExecutados: 0,
          semInfo: 0,
          porAmbiente: {},
          taxaAcima70: 0,
          taxaAbaixo70: 0
        }
      });
    }
    
    // Contar estatísticas do data-main.json
    let totalCasosTeste = 0;
    let totalCasosIA = 0;
    let totalCasosManual = 0;
    const porAmbiente = {};
    let taxaAcima70 = 0;
    let taxaAbaixo70 = 0;
    
    mainData.features.forEach(feature => {
      // Total de casos de teste
      totalCasosTeste += feature.totalCenarios || 0;
      
      // Casos por fonte
      totalCasosIA += feature.totalCenariosIA || 0;
      totalCasosManual += feature.totalCenariosManual || 0;
      
      // Por ambiente
      const ambiente = (feature.environment || 'sem ambiente').toLowerCase();
      // Normalizar nomes de ambiente
      let ambienteNormalizado = ambiente;
      if (ambiente.includes('produção') || ambiente.includes('producao')) {
        ambienteNormalizado = 'producao';
      } else if (ambiente.includes('homologação') || ambiente.includes('homologacao')) {
        ambienteNormalizado = 'homologacao';
      } else if (ambiente.includes('desenvolvimento')) {
        ambienteNormalizado = 'desenvolvimento';
      }
      porAmbiente[ambienteNormalizado] = (porAmbiente[ambienteNormalizado] || 0) + 1;
      
      // Taxa de aprovação
      const taxa = feature.taxaAprovacao || 0;
      if (taxa >= 70) {
        taxaAcima70++;
      } else {
        taxaAbaixo70++;
      }
    });
    
    // Para contar status dos casos de teste, precisamos ler os arquivos individuais
    let aprovados = 0;
    let reprovados = 0;
    let bloqueados = 0;
    let naoExecutados = 0;
    let semInfo = 0;
    
    // Ler todos os arquivos para contar status (sem paginação)
    for (const feature of mainData.features) {
      try {
        const featureData = await readJsonFile(`features/metadata/json/${feature.id}.json`);
        if (featureData && featureData.cenarios) {
          featureData.cenarios.forEach(cenario => {
            const status = cenario.status || 'na';
            switch(status) {
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
                naoExecutados++;
                break;
              case 'na':
              case '':
              case null:
              case undefined:
                semInfo++;
                break;
            }
          });
        }
      } catch (error) {
        // Ignorar erros ao ler arquivos individuais
        console.log(`⚠️ Erro ao ler feature ${feature.id}:`, error.message);
      }
    }
    
    res.json({
      success: true,
      stats: {
        totalCasosTeste,
        totalCasosIA,
        totalCasosManual,
        aprovados,
        reprovados,
        bloqueados,
        naoExecutados,
        semInfo,
        porAmbiente,
        taxaAcima70,
        taxaAbaixo70
      }
    });
    
  } catch (error) {
    console.error('❌ Erro ao calcular estatísticas:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Erro ao calcular estatísticas',
      error: error.message 
    });
  }
});

// ==================== ROTAS PARA PROMPTS ====================

// Rota para listar todos os prompts do prompts.json
app.get('/api/prompts/list', async (req, res) => {
  try {
    const promptsJsonPath = 'json/prompts.json';
    const localPath = path.join(__dirname, '..', 'public', promptsJsonPath);
    
    let promptsData = [];
    
    if (USE_S3) {
      // Tentar ler do S3 primeiro
      try {
        const buffer = await s3Service.downloadFile(promptsJsonPath);
        promptsData = JSON.parse(buffer.toString('utf-8'));
      } catch (s3Error) {
        // Se não encontrou no S3, tentar ler do filesystem local
        if (s3Error.name === 'NoSuchKey' || s3Error.$metadata?.httpStatusCode === 404) {
          if (await fs.pathExists(localPath)) {
            console.log('📦 prompts.json não encontrado no S3, lendo do filesystem local...');
            promptsData = await fs.readJson(localPath);
            
            // Tentar fazer upload para o S3 em background
            try {
              const content = await fs.readFile(localPath, 'utf-8');
              await s3Service.uploadFile(Buffer.from(content, 'utf-8'), promptsJsonPath, 'application/json');
              console.log('✅ prompts.json migrado para S3');
            } catch (uploadError) {
              console.log('⚠️ Não foi possível migrar prompts.json para S3:', uploadError.message);
            }
          } else {
            return res.json({
              success: true,
              prompts: []
            });
          }
        } else {
          throw s3Error;
        }
      }
    } else {
      // Ler do filesystem
      if (!await fs.pathExists(localPath)) {
        return res.json({
          success: true,
          prompts: []
        });
      }
      
      promptsData = await fs.readJson(localPath);
    }
    
    // Mapear para o formato esperado pela página
    const prompts = promptsData.map(prompt => ({
      id: prompt.id,
      name: prompt.nome,
      tipo: prompt.tipo,
      data_atualizacao: prompt.data_atualizacao || ''
    }));
    
    // Ordenar por ID
    prompts.sort((a, b) => a.id - b.id);
    
    res.json({
      success: true,
      prompts: prompts
    });
  } catch (error) {
    console.error('❌ Erro ao listar prompts:', error);
    res.status(500).json({
      success: false,
      error: 'Erro ao listar prompts',
      message: error.message
    });
  }
});

// Rota para ler um prompt específico por ID
app.get('/api/prompts/:id', async (req, res) => {
  try {
    const promptId = parseInt(req.params.id);
    const promptsJsonPath = 'json/prompts.json';
    const localPath = path.join(__dirname, '..', 'public', promptsJsonPath);
    
    let promptsData = [];
    
    if (USE_S3) {
      // Tentar ler do S3 primeiro
      try {
        const buffer = await s3Service.downloadFile(promptsJsonPath);
        promptsData = JSON.parse(buffer.toString('utf-8'));
      } catch (s3Error) {
        // Se não encontrou no S3, tentar ler do filesystem local
        if (s3Error.name === 'NoSuchKey' || s3Error.$metadata?.httpStatusCode === 404) {
          if (await fs.pathExists(localPath)) {
            promptsData = await fs.readJson(localPath);
          } else {
            return res.status(404).json({
              success: false,
              error: 'Arquivo prompts.json não encontrado'
            });
          }
        } else {
          throw s3Error;
        }
      }
    } else {
      // Ler do filesystem
      if (!await fs.pathExists(localPath)) {
        return res.status(404).json({
          success: false,
          error: 'Arquivo prompts.json não encontrado'
        });
      }
      
      promptsData = await fs.readJson(localPath);
    }
    
    // Buscar prompt pelo ID
    const prompt = promptsData.find(p => p.id === promptId);
    
    if (!prompt) {
      return res.status(404).json({
        success: false,
        error: 'Prompt não encontrado'
      });
    }
    
    res.json({
      success: true,
      id: prompt.id,
      nome: prompt.nome,
      tipo: prompt.tipo,
      content: prompt.base,
      keywords: prompt.keywords || [],
      data_atualizacao: prompt.data_atualizacao || ''
    });
  } catch (error) {
    console.error('❌ Erro ao ler prompt:', error);
    res.status(500).json({
      success: false,
      error: 'Erro ao ler prompt',
      message: error.message
    });
  }
});

// Rota para salvar um prompt específico por ID
app.put('/api/prompts/:id', async (req, res) => {
  try {
    const promptId = parseInt(req.params.id);
    const { content, password } = req.body;
    const adminPassword = process.env.PASSWORD_ADMIN;
    const promptsJsonPath = 'json/prompts.json';
    const localPath = path.join(__dirname, '..', 'public', promptsJsonPath);
    
    // Verificar flag editarPrompts - se desativada, bloquear completamente
    const flags = await lerFlags();
    if (flags.editarPrompts === false) {
      return res.status(403).json({
        success: false,
        error: 'Edição de prompts está bloqueada pela flag editarPrompts'
      });
    }
    
    // Verificar se senha é necessária (apenas se flag for explicitamente true)
    if (flags.senhaEditarPrompts === true) {
      // Validar senha
      const adminPassword = process.env.PASSWORD_ADMIN;
      if (!password || password !== adminPassword) {
        return res.status(401).json({
          success: false,
          error: 'Senha incorreta'
        });
      }
    }
    
    if (!content || typeof content !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'Conteúdo é obrigatório e deve ser uma string'
      });
    }
    
    let promptsData = [];
    
    // Ler prompts.json atual
    if (USE_S3) {
      try {
        const buffer = await s3Service.downloadFile(promptsJsonPath);
        promptsData = JSON.parse(buffer.toString('utf-8'));
      } catch (s3Error) {
        if (s3Error.name === 'NoSuchKey' || s3Error.$metadata?.httpStatusCode === 404) {
          if (await fs.pathExists(localPath)) {
            promptsData = await fs.readJson(localPath);
          } else {
            return res.status(404).json({
              success: false,
              error: 'Arquivo prompts.json não encontrado'
            });
          }
        } else {
          throw s3Error;
        }
      }
    } else {
      if (!await fs.pathExists(localPath)) {
        return res.status(404).json({
          success: false,
          error: 'Arquivo prompts.json não encontrado'
        });
      }
      
      promptsData = await fs.readJson(localPath);
    }
    
    // Buscar e atualizar o prompt
    const promptIndex = promptsData.findIndex(p => p.id === promptId);
    
    if (promptIndex === -1) {
      return res.status(404).json({
        success: false,
        error: 'Prompt não encontrado'
      });
    }
    
    const originalPrompt = promptsData[promptIndex];
    let keywords = originalPrompt.keywords || [];
    
    // Para o prompt "gerar ct funcional", só validar {contexto}
    if (originalPrompt.nome && originalPrompt.nome.toLowerCase() === 'gerar ct funcional') {
      console.log('📝 Prompt "gerar ct funcional" detectado - validando apenas {contexto}');
      keywords = keywords.filter(k => k === '{contexto}');
      if (keywords.length === 0) {
        // Se {contexto} não estiver na lista, adicionar para validação
        keywords = ['{contexto}'];
      }
    }
    
    // Validar que todas as palavras-chave estão presentes no novo conteúdo
    if (keywords.length > 0) {
      const missingKeywords = [];
      const modifiedKeywords = [];
      
      // Função auxiliar para contar ocorrências
      const contarOcorrencias = (texto, palavra) => {
        let count = 0;
        let index = texto.indexOf(palavra);
        while (index !== -1) {
          count++;
          index = texto.indexOf(palavra, index + 1);
        }
        return count;
      };

      // Obter conteúdo original do prompt para comparar ocorrências
      const conteudoOriginal = originalPrompt.base || '';

      const partialEdits = []; // Palavras-chave com edição parcial (algumas ocorrências permanecem)

      for (const keyword of keywords) {
        // Contar quantas vezes a palavra-chave aparece no conteúdo original
        const ocorrenciasOriginais = contarOcorrencias(conteudoOriginal, keyword);
        
        // Contar quantas vezes a palavra-chave EXATA aparece no novo conteúdo
        const ocorrenciasNovas = contarOcorrencias(content, keyword);
        
        // Se não encontrou a palavra-chave exata
        if (ocorrenciasNovas === 0) {
          // Palavra-chave não encontrada exatamente - verificar se foi modificada
          const keywordName = keyword.replace(/[{}]/g, '');
          
          // Procurar por qualquer padrão entre chaves no conteúdo
          const allKeywordsPattern = /\{[^}]+\}/g;
          const allKeywordsInContent = content.match(allKeywordsPattern) || [];
          
          // Verificar se existe alguma palavra-chave que seja similar (para mostrar no erro)
          // IMPORTANTE: Se a palavra-chave exata não foi encontrada, qualquer palavra-chave
          // que contenha parte do nome original deve ser considerada como modificação
          const similarKeyword = allKeywordsInContent.find(k => {
            if (k === keyword) return false; // Já sabemos que não é exatamente igual
            
            const kName = k.replace(/[{}]/g, '');
            const originalName = keywordName;
            
            // Se os nomes são idênticos (ignorando case), é uma modificação
            if (kName.toLowerCase() === originalName.toLowerCase()) {
              return true;
            }
            
            // Verificar se os nomes são similares (para identificar a modificação)
            const lengthDiff = Math.abs(kName.length - originalName.length);
            const maxLength = Math.max(kName.length, originalName.length);
            const minLength = Math.min(kName.length, originalName.length);
            
            // Se a diferença de comprimento for pequena (até 4 caracteres) e o comprimento mínimo for significativo
            if (lengthDiff <= 4 && minLength >= 3) {
              // Contar caracteres em comum
              let commonChars = 0;
              const originalCharCount = {};
              const foundCharCount = {};
              
              originalName.toLowerCase().split('').forEach(char => {
                originalCharCount[char] = (originalCharCount[char] || 0) + 1;
              });
              
              kName.toLowerCase().split('').forEach(char => {
                foundCharCount[char] = (foundCharCount[char] || 0) + 1;
              });
              
              Object.keys(originalCharCount).forEach(char => {
                commonChars += Math.min(originalCharCount[char] || 0, foundCharCount[char] || 0);
              });
              
              // Calcular similaridade baseada no comprimento mínimo (mais rigoroso)
              const similarity = commonChars / minLength;
              
              // Se a similaridade for alta (>= 0.6), considera como modificação
              // Reduzido para 0.6 para detectar mais variações
              if (similarity >= 0.6) {
                return true;
              }
            }
            
            // Verificar se um contém o outro (pelo menos 70% do nome menor está no maior)
            const shorter = kName.length < originalName.length ? kName : originalName;
            const longer = kName.length >= originalName.length ? kName : originalName;
            if (longer.toLowerCase().includes(shorter.toLowerCase()) && shorter.length >= 3) {
              const containmentRatio = shorter.length / longer.length;
              if (containmentRatio >= 0.7) {
                return true;
              }
            }
            
            return false;
          });
          
          if (similarKeyword) {
            // Encontrou uma variação modificada - BLOQUEAR (modificação total)
            modifiedKeywords.push({
              original: keyword,
              found: similarKeyword,
              ocorrenciasOriginais: ocorrenciasOriginais
            });
          } else {
            // Não encontrou nem a palavra-chave exata nem variações similares - BLOQUEAR (remoção total)
            missingKeywords.push({
              keyword: keyword,
              ocorrenciasOriginais: ocorrenciasOriginais
            });
          }
        } else if (ocorrenciasNovas < ocorrenciasOriginais) {
          // Encontrou menos ocorrências do que o original - PERMITIR (edição parcial)
          // Pelo menos uma ocorrência permanece, então é permitido
          partialEdits.push({
            keyword: keyword,
            ocorrenciasOriginais: ocorrenciasOriginais,
            ocorrenciasNovas: ocorrenciasNovas
          });
          // Não adicionar a missingKeywords - é uma edição parcial permitida
        }
        // Se ocorrenciasNovas >= ocorrenciasOriginais, está tudo OK
      }
      
      // Se houver remoção total ou modificação total, bloquear completamente
      if (missingKeywords.length > 0 || modifiedKeywords.length > 0) {
        let errorMessage = 'Não é permitido remover ou editar palavras-chave. ';
        
        if (missingKeywords.length > 0) {
          const missingList = missingKeywords.map(m => 
            typeof m === 'string' ? m : `${m.keyword} (${m.ocorrenciasOriginais} ocorrência(s) removida(s))`
          ).join(', ');
          errorMessage += `Palavras-chave totalmente removidas: ${missingList}. `;
        }
        
        if (modifiedKeywords.length > 0) {
          const modifiedList = modifiedKeywords.map(m => `${m.original} -> ${m.found}`).join(', ');
          errorMessage += `Palavras-chave modificadas: ${modifiedList}.`;
        }
        
        return res.status(400).json({
          success: false,
          error: errorMessage,
          missingKeywords: missingKeywords,
          modifiedKeywords: modifiedKeywords,
          partialEdits: []
        });
      }
      
      // Se houver apenas edição parcial, permitir (pelo menos uma ocorrência de cada palavra-chave permanece)
      // Não precisa fazer nada, apenas continuar com o salvamento
    }
    
    // Atualizar o prompt
    promptsData[promptIndex].base = content;
    promptsData[promptIndex].data_atualizacao = new Date().toISOString();
    
    // Salvar no S3 ou filesystem
    const jsonContent = JSON.stringify(promptsData, null, 2);
    await writeJsonFile(promptsJsonPath, promptsData);
    
    console.log(`✅ Prompt ${promptId} salvo`);
    
    res.json({
      success: true,
      message: 'Prompt salvo com sucesso',
      id: promptId,
      nome: promptsData[promptIndex].nome
    });
  } catch (error) {
    console.error('❌ Erro ao salvar prompt:', error);
    res.status(500).json({
      success: false,
      error: 'Erro ao salvar prompt',
      message: error.message
    });
  }
});

// ==================== FIM DAS ROTAS PARA PROMPTS ====================

// ==================== ROTAS PARA FLAGS ====================

// Função auxiliar para ler flags
async function lerFlags() {
  try {
    const flagsJsonPath = 'json/flags.json';
    const localPath = path.join(__dirname, '..', 'public', flagsJsonPath);
    
    let flagsData = {};
    
    // Ler flags do arquivo (S3 ou filesystem)
    if (USE_S3) {
      try {
        const buffer = await s3Service.downloadFile(flagsJsonPath);
        flagsData = JSON.parse(buffer.toString('utf-8'));
      } catch (s3Error) {
        if (s3Error.name === 'NoSuchKey' || s3Error.$metadata?.httpStatusCode === 404) {
          if (await fs.pathExists(localPath)) {
            flagsData = await fs.readJson(localPath);
          }
        } else {
          throw s3Error;
        }
      }
    } else {
      if (await fs.pathExists(localPath)) {
        flagsData = await fs.readJson(localPath);
      }
    }
    
    // Valores padrão apenas para flags que não existem no arquivo
    // Os valores do arquivo têm prioridade sobre os padrões
    const defaultFlags = {
      manutencao: false,
      excluirDocumentacao: true,
      modalIA: true,
      executarScriptIA: false,
      revisarCTDuplicados: false,
      iaOpcaoFuncional: true,
      iaOpcaoRegressao: false,
      iaOpcaoIntegracao: false,
      iaOpcaoPerformance: false,
      iaOpcaoUsabilidade: false,
      inserirImagensProduto: false,
      organizarCT: false,
      iaCoberturaTeste: true,
      editarPrompts: true,
      forcarEdicaoDocumentacao: true,
      senhaEditarPrompts: true,
      senhaExcluirDocumentacao: true,
      senhaManutencao: true,
      senhaDownloadZip: true,
      senhaEdicaoMassa: true,
      recuperadorDados: true
    };
    
    // Mesclar: valores do arquivo têm prioridade, valores padrão preenchem o que falta
    return { ...defaultFlags, ...flagsData };
  } catch (error) {
    console.error('❌ Erro ao ler flags:', error);
    // Retornar flags padrão em caso de erro
    return {
      manutencao: false,
      excluirDocumentacao: true,
      modalIA: true,
      executarScriptIA: false,
      revisarCTDuplicados: false,
      iaOpcaoFuncional: true,
      iaOpcaoRegressao: false,
      iaOpcaoIntegracao: false,
      iaOpcaoPerformance: false,
      iaOpcaoUsabilidade: false,
      inserirImagensProduto: false,
      organizarCT: false,
      iaCoberturaTeste: true,
      editarPrompts: true,
      forcarEdicaoDocumentacao: true,
      senhaEditarPrompts: true,
      senhaExcluirDocumentacao: true,
      senhaManutencao: true,
      senhaDownloadZip: true,
      senhaEdicaoMassa: true,
      recuperadorDados: true
    };
  }
}

// Rota para obter flags
app.get('/api/flags', async (req, res) => {
  try {
    const flagsJsonPath = 'json/flags.json';
    const localPath = path.join(__dirname, '..', 'public', flagsJsonPath);
    
    let flagsData = {
      manutencao: false,
      excluirDocumentacao: true,
      modalIA: true,
      executarScriptIA: false,
      revisarCTDuplicados: false,
      iaOpcaoFuncional: true,
      iaOpcaoRegressao: false,
      iaOpcaoIntegracao: false,
      iaOpcaoPerformance: false,
      iaOpcaoUsabilidade: false,
      inserirImagensProduto: false,
      organizarCT: false,
      iaCoberturaTeste: true,
      editarPrompts: true,
      forcarEdicaoDocumentacao: true
    };
    
    if (USE_S3) {
      // Tentar ler do S3 primeiro
      try {
        const buffer = await s3Service.downloadFile(flagsJsonPath);
        flagsData = JSON.parse(buffer.toString('utf-8'));
      } catch (s3Error) {
        // Se não encontrou no S3, tentar ler do filesystem local
        if (s3Error.name === 'NoSuchKey' || s3Error.$metadata?.httpStatusCode === 404) {
          if (await fs.pathExists(localPath)) {
            console.log('📦 flags.json não encontrado no S3, lendo do filesystem local...');
            flagsData = await fs.readJson(localPath);
            
            // Tentar fazer upload para o S3 em background
            try {
              const content = await fs.readFile(localPath, 'utf-8');
              await s3Service.uploadFile(Buffer.from(content, 'utf-8'), flagsJsonPath, 'application/json');
              console.log('✅ flags.json migrado para S3');
            } catch (uploadError) {
              console.log('⚠️ Não foi possível migrar flags.json para S3:', uploadError.message);
            }
          } else {
            // Criar arquivo padrão se não existir
            flagsData = {
              manutencao: false,
              excluirDocumentacao: true,
              modalIA: true,
              executarScriptIA: false,
              revisarCTDuplicados: false,
              iaOpcaoFuncional: true,
              iaOpcaoRegressao: false,
              iaOpcaoIntegracao: false,
              iaOpcaoPerformance: false,
              iaOpcaoUsabilidade: false,
              inserirImagensProduto: false,
              organizarCT: false,
              iaCoberturaTeste: true,
              editarPrompts: true,
              forcarEdicaoDocumentacao: true,
              senhaEditarPrompts: true,
              senhaExcluirDocumentacao: true,
              senhaManutencao: true,
              senhaDownloadZip: true,
              senhaEdicaoMassa: true,
              recuperadorDados: true
            };
            await writeJsonFile(flagsJsonPath, flagsData);
          }
        } else {
          throw s3Error;
        }
      }
    } else {
      // Ler do filesystem
      if (await fs.pathExists(localPath)) {
        flagsData = await fs.readJson(localPath);
      } else {
        // Criar arquivo padrão se não existir
        flagsData = {
          manutencao: false,
          excluirDocumentacao: true,
          modalIA: true,
          executarScriptIA: false,
          revisarCTDuplicados: false,
          iaOpcaoFuncional: true,
          iaOpcaoRegressao: false,
          iaOpcaoIntegracao: false,
          iaOpcaoPerformance: false,
          iaOpcaoUsabilidade: false,
          inserirImagensProduto: false,
          organizarCT: false,
          iaCoberturaTeste: true,
          editarPrompts: true,
          forcarEdicaoDocumentacao: true,
          senhaEditarPrompts: true,
          senhaExcluirDocumentacao: true,
          senhaManutencao: true,
          senhaDownloadZip: true,
          senhaEdicaoMassa: true,
          recuperadorDados: true
        };
        await writeJsonFile(flagsJsonPath, flagsData);
      }
    }
    
    res.json({
      success: true,
      flags: flagsData
    });
  } catch (error) {
    console.error('❌ Erro ao ler flags:', error);
    res.status(500).json({
      success: false,
      error: 'Erro ao ler flags',
      message: error.message
    });
  }
});

// Rota para salvar flags
app.post('/api/flags', async (req, res) => {
  try {
    const flagsJsonPath = 'json/flags.json';
    const { flags: flagsData, password } = req.body;
    const adminPassword = process.env.PASSWORD_ADMIN;
    
    // Validar senha
    if (!password || password !== adminPassword) {
      return res.status(401).json({
        success: false,
        error: 'Senha incorreta'
      });
    }
    
    // Validar dados
    if (!flagsData || typeof flagsData !== 'object') {
      return res.status(400).json({
        success: false,
        error: 'Dados de flags inválidos'
      });
    }
    
    // Validar campos booleanos
    const camposBooleanos = [
      'manutencao',
      'excluirDocumentacao',
      'modalIA',
      'executarScriptIA',
      'iaOpcaoFuncional',
      'iaOpcaoRegressao',
      'iaOpcaoIntegracao',
      'iaOpcaoPerformance',
      'iaOpcaoUsabilidade',
      'organizarCT',
      'revisarCTDuplicados',
      'iaCoberturaTeste',
      'editarPrompts',
      'forcarEdicaoDocumentacao',
      'senhaEditarPrompts',
      'senhaExcluirDocumentacao',
      'senhaManutencao',
      'senhaDownloadZip',
      'senhaEdicaoMassa'
    ];
    
    for (const campo of camposBooleanos) {
      if (flagsData[campo] !== undefined && typeof flagsData[campo] !== 'boolean') {
        return res.status(400).json({
          success: false,
          error: `Campo ${campo} deve ser um booleano`
        });
      }
    }
    
    // Salvar flags
    await writeJsonFile(flagsJsonPath, flagsData);
    
    console.log('✅ Flags salvas com sucesso:', flagsData);
    
    res.json({
      success: true,
      message: 'Flags salvas com sucesso',
      flags: flagsData
    });
  } catch (error) {
    console.error('❌ Erro ao salvar flags:', error);
    res.status(500).json({
      success: false,
      error: 'Erro ao salvar flags',
      message: error.message
    });
  }
});

// ==================== FIM DAS ROTAS PARA FLAGS ====================

// Rota para verificar senha
app.post('/api/verify-password', async (req, res) => {
  try {
    const { password } = req.body;
    const adminPassword = process.env.PASSWORD_ADMIN;
    
    if (!password) {
      return res.status(400).json({
        success: false,
        error: 'Senha não fornecida'
      });
    }
    
    if (password === adminPassword) {
      res.json({
        success: true,
        message: 'Senha correta'
      });
    } else {
      res.status(401).json({
        success: false,
        error: 'Senha incorreta'
      });
    }
  } catch (error) {
    console.error('❌ Erro ao verificar senha:', error);
    res.status(500).json({
      success: false,
      error: 'Erro ao verificar senha',
      message: error.message
    });
  }
});

// ==================== ROTAS DE MANUTENÇÃO ====================

// Rota para carregar arquivo para edição
app.get('/api/maintenance/edit/:type', async (req, res) => {
  try {
    const { type } = req.params;
    let filePath = '';
    let data = null;

    if (type === 'data-main') {
      filePath = 'features/data-main.json';
    } else if (type === 'flags') {
      filePath = 'json/flags.json';
    } else if (type === 'prompts') {
      filePath = 'json/prompts.json';
    } else {
      return res.status(400).json({
        success: false,
        error: 'Tipo de arquivo inválido'
      });
    }

    data = await readJsonFile(filePath);
    
    if (!data) {
      return res.status(404).json({
        success: false,
        error: 'Arquivo não encontrado'
      });
    }

    res.json({
      success: true,
      data: data
    });
  } catch (error) {
    console.error('❌ Erro ao carregar arquivo:', error);
    res.status(500).json({
      success: false,
      error: 'Erro ao carregar arquivo',
      message: error.message
    });
  }
});

// Rota para carregar feature específica para edição
app.get('/api/maintenance/edit/feature/:id', async (req, res) => {
  try {
    const featureId = req.params.id;
    const data = await readJsonFile(`features/metadata/json/${featureId}.json`);
    
    if (!data) {
      return res.status(404).json({
        success: false,
        error: 'Feature não encontrada'
      });
    }
    
    res.json({
      success: true,
      data: data
    });
  } catch (error) {
    console.error('❌ Erro ao carregar feature:', error);
    res.status(500).json({
      success: false,
      error: 'Erro ao carregar feature',
      message: error.message
    });
  }
});

// Rota para buscar features por nome ou ID
app.get('/api/maintenance/search-features', async (req, res) => {
  try {
    const searchTerm = (req.query.q || '').trim().toLowerCase();
    
    if (!searchTerm) {
      return res.json({
        success: true,
        results: []
      });
    }

    const mainData = await readJsonFile('features/data-main.json');
    
    if (!mainData || !mainData.features) {
      return res.json({
        success: true,
        results: []
      });
    }

    // Função auxiliar para remover acentuação
    const removerAcentuacao = (texto) => {
      return texto.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    };

    const searchTermSemAcento = removerAcentuacao(searchTerm);
    
    // Buscar por ID exato ou nome (com ou sem acento)
    const results = mainData.features.filter(feature => {
      const id = (feature.id || '').toLowerCase();
      const nome = removerAcentuacao((feature.featureName || '').toLowerCase());
      
      return id.includes(searchTerm) || 
             id === searchTerm ||
             nome.includes(searchTermSemAcento);
    }).slice(0, 20); // Limitar a 20 resultados

    res.json({
      success: true,
      results: results.map(f => ({
        id: f.id,
        featureName: f.featureName || 'Sem nome'
      }))
    });
  } catch (error) {
    console.error('❌ Erro ao buscar features:', error);
    res.status(500).json({
      success: false,
      error: 'Erro ao buscar features',
      message: error.message
    });
  }
});

// Rota para obter dados de avaliação da IA
app.get('/api/avaliar-ia', async (req, res) => {
  try {
    // Ler arquivo de avaliações existente
    const avaliacoesPath = 'json/avaliate-ia.json';
    const localPath = path.join(__dirname, '..', 'public', avaliacoesPath);
    
    let avaliacoesData = null;
    
    if (USE_S3) {
      // Tentar ler do S3 primeiro
      try {
        const buffer = await s3Service.downloadFile(avaliacoesPath);
        avaliacoesData = JSON.parse(buffer.toString('utf-8'));
      } catch (s3Error) {
        // Se não encontrou no S3, tentar ler do filesystem local
        if (s3Error.name === 'NoSuchKey' || s3Error.$metadata?.httpStatusCode === 404) {
          if (await fs.pathExists(localPath)) {
            console.log('📦 avaliate-ia.json não encontrado no S3, lendo do filesystem local...');
            avaliacoesData = await fs.readJson(localPath);
            
            // Tentar fazer upload para o S3 em background
            try {
              const content = await fs.readFile(localPath, 'utf-8');
              await s3Service.uploadFile(Buffer.from(content, 'utf-8'), avaliacoesPath, 'application/json');
              console.log('✅ avaliate-ia.json migrado para S3');
            } catch (uploadError) {
              console.log('⚠️ Não foi possível migrar avaliate-ia.json para S3:', uploadError.message);
            }
          }
        } else {
          throw s3Error;
        }
      }
    } else {
      // Ler do filesystem
      if (await fs.pathExists(localPath)) {
        avaliacoesData = await fs.readJson(localPath);
      }
    }
    
    // Se não existir, retornar estrutura vazia
    if (!avaliacoesData || !avaliacoesData.avaliacoes || !Array.isArray(avaliacoesData.avaliacoes)) {
      avaliacoesData = {
        avaliacoes: [],
        nota_avg: 0,
        quantidade: 0,
        ultima_atualizacao: ''
      };
    }
    
    res.json({
      success: true,
      avaliacoes: avaliacoesData
    });
  } catch (error) {
    console.error('❌ Erro ao obter dados de avaliação:', error);
    res.status(500).json({
      success: false,
      error: 'Erro ao obter dados de avaliação',
      message: error.message
    });
  }
});

// Rota para salvar avaliação da IA
app.post('/api/avaliar-ia', async (req, res) => {
  try {
    const { nota, resumo_produto, ct_gerados, data_hora, hash_id, ct_aplicadosIA, comentario } = req.body;
    
    // Validar dados obrigatórios
    if (!nota || nota < 1 || nota > 5) {
      return res.status(400).json({
        success: false,
        error: 'Nota inválida. Deve ser entre 1 e 5.'
      });
    }
    
    if (!hash_id) {
      return res.status(400).json({
        success: false,
        error: 'hash_id é obrigatório.'
      });
    }
    
    // Ler arquivo de avaliações existente
    const avaliacoesPath = 'json/avaliate-ia.json';
    const localPath = path.join(__dirname, '..', 'public', avaliacoesPath);
    
    let avaliacoesData = null;
    
    if (USE_S3) {
      // Tentar ler do S3 primeiro
      try {
        const buffer = await s3Service.downloadFile(avaliacoesPath);
        avaliacoesData = JSON.parse(buffer.toString('utf-8'));
      } catch (s3Error) {
        // Se não encontrou no S3, tentar ler do filesystem local
        if (s3Error.name === 'NoSuchKey' || s3Error.$metadata?.httpStatusCode === 404) {
          if (await fs.pathExists(localPath)) {
            console.log('📦 avaliate-ia.json não encontrado no S3, lendo do filesystem local...');
            avaliacoesData = await fs.readJson(localPath);
            
            // Tentar fazer upload para o S3 em background
            try {
              const content = await fs.readFile(localPath, 'utf-8');
              await s3Service.uploadFile(Buffer.from(content, 'utf-8'), avaliacoesPath, 'application/json');
              console.log('✅ avaliate-ia.json migrado para S3');
            } catch (uploadError) {
              console.log('⚠️ Não foi possível migrar avaliate-ia.json para S3:', uploadError.message);
            }
          }
        } else {
          throw s3Error;
        }
      }
    } else {
      // Ler do filesystem
      if (await fs.pathExists(localPath)) {
        avaliacoesData = await fs.readJson(localPath);
      }
    }
    
    // Se não existir ou estiver vazio, criar estrutura inicial
    if (!avaliacoesData || !avaliacoesData.avaliacoes || !Array.isArray(avaliacoesData.avaliacoes)) {
      avaliacoesData = {
        avaliacoes: [],
        nota_avg: 0,
        quantidade: 0,
        ultima_atualizacao: ''
      };
    }
    
    // Garantir que os novos campos existam (migração de estrutura antiga)
    if (typeof avaliacoesData.quantidade === 'undefined') {
      avaliacoesData.quantidade = avaliacoesData.avaliacoes ? avaliacoesData.avaliacoes.length : 0;
    }
    if (typeof avaliacoesData.ultima_atualizacao === 'undefined') {
      avaliacoesData.ultima_atualizacao = '';
    }
    
    // Criar objeto de avaliação
    const novaAvaliacao = {
      nota: nota,
      resumo_produto: resumo_produto || '',
      ct_gerados: ct_gerados || [],
      data_hora: data_hora || new Date().toISOString(),
      hash_id: hash_id
    };
    
    // Adicionar comentário apenas se fornecido
    if (comentario && comentario.trim()) {
      novaAvaliacao.comentario = comentario.trim();
    }
    
    // Adicionar avaliação ao array
    avaliacoesData.avaliacoes.push(novaAvaliacao);
    
    // Atualizar quantidade
    avaliacoesData.quantidade = avaliacoesData.avaliacoes.length;
    
    // Calcular média das notas
    if (avaliacoesData.avaliacoes.length > 0) {
      const somaNotas = avaliacoesData.avaliacoes.reduce((acc, av) => acc + av.nota, 0);
      avaliacoesData.nota_avg = somaNotas / avaliacoesData.avaliacoes.length;
    } else {
      avaliacoesData.nota_avg = 0;
    }
    
    // Atualizar última atualização
    avaliacoesData.ultima_atualizacao = new Date().toISOString();
    
    // Salvar arquivo atualizado
    await writeJsonFile(avaliacoesPath, avaliacoesData);
    
    console.log(`✅ Avaliação salva: Nota ${nota}, Média atual: ${avaliacoesData.nota_avg.toFixed(2)}, Quantidade: ${avaliacoesData.quantidade}`);
    
    res.json({
      success: true,
      message: 'Avaliação salva com sucesso',
      nota_avg: avaliacoesData.nota_avg,
      quantidade: avaliacoesData.quantidade,
      ultima_atualizacao: avaliacoesData.ultima_atualizacao
    });
  } catch (error) {
    console.error('❌ Erro ao salvar avaliação:', error);
    res.status(500).json({
      success: false,
      error: 'Erro ao salvar avaliação',
      message: error.message
    });
  }
});

// Rota para salvar arquivo editado
app.put('/api/maintenance/save/:type', async (req, res) => {
  try {
    const { type } = req.params;
    const { data, password } = req.body;
    
    // Verificar se senha é necessária (apenas se flag for explicitamente true)
    const flags = await lerFlags();
    if (flags.senhaManutencao === true) {
      const adminPassword = process.env.PASSWORD_ADMIN;
      
      // Validar senha
      if (!password || password !== adminPassword) {
        return res.status(401).json({
          success: false,
          error: 'Senha incorreta'
        });
      }
    }

    if (!data) {
      return res.status(400).json({
        success: false,
        error: 'Dados são obrigatórios'
      });
    }

    let filePath = '';
    
    if (type === 'data-main') {
      filePath = 'features/data-main.json';
    } else if (type === 'flags') {
      filePath = 'json/flags.json';
    } else if (type === 'prompts') {
      filePath = 'json/prompts.json';
    } else {
      return res.status(400).json({
        success: false,
        error: 'Tipo de arquivo inválido'
      });
    }

    await writeJsonFile(filePath, data);
    
    console.log(`✅ Arquivo ${type} salvo com sucesso`);
    
    res.json({
      success: true,
      message: 'Arquivo salvo com sucesso'
    });
  } catch (error) {
    console.error('❌ Erro ao salvar arquivo:', error);
    res.status(500).json({
      success: false,
      error: 'Erro ao salvar arquivo',
      message: error.message
    });
  }
});

// Rota para salvar feature editada
app.put('/api/maintenance/save/feature/:id', async (req, res) => {
  try {
    const featureId = req.params.id;
    const { data, password } = req.body;
    
    // Verificar se senha é necessária (apenas se flag for explicitamente true)
    const flags = await lerFlags();
    if (flags.senhaManutencao === true) {
      const adminPassword = process.env.PASSWORD_ADMIN;
      
      // Validar senha
      if (!password || password !== adminPassword) {
        return res.status(401).json({
          success: false,
          error: 'Senha incorreta'
        });
      }
    }

    if (!data) {
      return res.status(400).json({
        success: false,
        error: 'Dados são obrigatórios'
      });
    }

    // Verificar se a feature existe
    const existingData = await readJsonFile(`features/metadata/json/${featureId}.json`);
    if (!existingData) {
      return res.status(404).json({
        success: false,
        error: 'Feature não encontrada'
      });
    }

    // Atualizar data de modificação
    data.updatedAt = new Date().toISOString();
    if (!data.createdAt) {
      data.createdAt = existingData.createdAt || new Date().toISOString();
    }

    // Salvar feature
    await writeJsonFile(`features/metadata/json/${featureId}.json`, data);
    
    // Atualizar data-main.json com os metadados atualizados
    const mainData = await readJsonFile('features/data-main.json');
    if (mainData && mainData.features) {
      const featureIndex = mainData.features.findIndex(f => f.id === featureId);
      if (featureIndex !== -1) {
        // Atualizar metadados no data-main.json
        mainData.features[featureIndex] = {
          id: data.id,
          featureName: data.featureName,
          jiraLink: data.jiraLink || '',
          creationDate: data.creationDate,
          updateDate: data.updateDate || new Date().toISOString().split('T')[0],
          testRoutine: data.testRoutine,
          environment: data.environment,
          tester: data.tester,
          squad: data.squad || '',
          browser: data.browser || '',
          device: data.device || '',
          status: data.status || 'criado',
          totalCenarios: data.cenarios ? data.cenarios.length : 0,
          totalBugs: data.bugs ? data.bugs.length : 0,
          taxaAprovacao: calcularTaxaAprovacao(data.cenarios || []),
          taxaExecucao: calcularTaxaExecucao(data.cenarios || []),
          inEdit: false,
          createdAt: data.createdAt,
          updatedAt: data.updatedAt
        };
        mainData.ultimaAtualizacao = new Date().toISOString();
        await writeJsonFile('features/data-main.json', mainData);
      }
    }
    
    console.log(`✅ Feature ${featureId} salva com sucesso`);
    
    res.json({
      success: true,
      message: 'Feature salva com sucesso'
    });
  } catch (error) {
    console.error('❌ Erro ao salvar feature:', error);
    res.status(500).json({
      success: false,
      error: 'Erro ao salvar feature',
      message: error.message
    });
  }
});

// Rota para baixar data-main.json
app.get('/api/maintenance/download-data-main', async (req, res) => {
  try {
    const data = await readJsonFile('features/data-main.json');
    
    if (!data) {
      return res.status(404).json({
        success: false,
        message: 'Arquivo data-main.json não encontrado'
      });
    }

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', 'attachment; filename="data-main.json"');
    res.json(data);
  } catch (error) {
    console.error('❌ Erro ao baixar data-main.json:', error);
    res.status(500).json({
      success: false,
      message: 'Erro ao baixar arquivo'
    });
  }
});

// Rota para baixar todos os arquivos features/json em ZIP
app.post('/api/maintenance/download-features-zip', async (req, res) => {
  try {
    const { password } = req.body;
    
    // Verificar se senha é necessária (apenas se flag for explicitamente true)
    const flags = await lerFlags();
    if (flags.senhaDownloadZip === true) {
      const adminPassword = process.env.PASSWORD_ADMIN;
      
      // Validar senha
      if (!password || password !== adminPassword) {
        return res.status(401).json({
          success: false,
          error: 'Senha incorreta'
        });
      }
    }

    let files = [];
    let fileContents = [];

    if (USE_S3) {
      // Buscar arquivos do S3
      const s3Files = await s3Service.listFiles('features/metadata/json/');
      console.log(`📦 Total de arquivos JSON em features/metadata/json/: ${s3Files.length}`);
      
      // Filtrar apenas arquivos .json
      const jsonFiles = s3Files.filter(file => 
        file.key.endsWith('.json') && 
        file.key.includes('metadata/json/')
      );
      
      // Baixar conteúdo de cada arquivo do S3
      for (const file of jsonFiles) {
        const fileName = path.basename(file.key);
        const buffer = await s3Service.downloadFile(file.key);
        fileContents.push({
          name: fileName,
          buffer: buffer
        });
      }
    } else {
      // Buscar arquivos do filesystem local
      const featuresDir = path.join(__dirname, '..', 'public', 'features', 'metadata', 'json');
      
      if (!await fs.pathExists(featuresDir)) {
        return res.status(404).json({
          success: false,
          message: 'Pasta de features não encontrada'
        });
      }

      files = fs.readdirSync(featuresDir)
        .filter(file => file.endsWith('.json'));

      if (files.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'Nenhum arquivo JSON encontrado'
        });
      }

      // Ler conteúdo dos arquivos locais
      for (const file of files) {
        const filePath = path.join(featuresDir, file);
        const buffer = fs.readFileSync(filePath);
        fileContents.push({
          name: file,
          buffer: buffer
        });
      }
    }

    if (fileContents.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Nenhum arquivo JSON encontrado'
      });
    }

    // Criar arquivo ZIP
    const archive = archiver('zip', {
      zlib: { level: 9 } // Máxima compressão
    });

    // Definir headers para download
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', 'attachment; filename="features_json.zip"');
    
    // Pipe archive data to response
    archive.pipe(res);

    // Adicionar cada arquivo ao ZIP
    fileContents.forEach(file => {
      archive.append(file.buffer, { name: file.name });
    });

    // Finalizar o arquivo
    await archive.finalize();

    console.log(`✅ ZIP gerado: features_json.zip (${fileContents.length} arquivo(s))`);

  } catch (error) {
    console.error('❌ Erro ao gerar ZIP de features:', error);
    
    // Verificar se a resposta já foi enviada
    if (!res.headersSent) {
      res.status(500).json({
        success: false,
        message: 'Erro ao gerar ZIP'
      });
    }
  }
});

// Rota para baixar todos os arquivos de histórico em ZIP
app.post('/api/maintenance/download-historico-zip', async (req, res) => {
  try {
    const { password } = req.body;
    
    // Verificar se senha é necessária (apenas se flag for explicitamente true)
    const flags = await lerFlags();
    if (flags.senhaDownloadZip === true) {
      const adminPassword = process.env.PASSWORD_ADMIN;
      
      // Validar senha
      if (!password || password !== adminPassword) {
        return res.status(401).json({
          success: false,
          error: 'Senha incorreta'
        });
      }
    }

    let files = [];
    let fileContents = [];

    if (USE_S3) {
      // Buscar apenas arquivos ZIP do S3
      const s3Files = await s3Service.listFiles('historico/');
      console.log(`📦 Total de arquivos em historico/: ${s3Files.length}`);
      
      // Filtrar apenas arquivos ZIP
      const zipFiles = s3Files.filter(file => {
        const fileName = path.basename(file.key);
        return fileName.endsWith('.zip');
      });
      
      console.log(`📦 Total de arquivos ZIP encontrados: ${zipFiles.length}`);
      
      // Baixar conteúdo de cada arquivo ZIP do S3
      for (const file of zipFiles) {
        const fileName = path.basename(file.key);
        const buffer = await s3Service.downloadFile(file.key);
        fileContents.push({
          name: fileName,
          buffer: buffer
        });
        console.log(`✅ Arquivo ZIP baixado do S3: ${fileName}`);
      }
    } else {
      // Buscar arquivos do filesystem local
      const historicoDir = path.join(__dirname, '..', 'public', 'historico');
      
      if (!await fs.pathExists(historicoDir)) {
        return res.status(404).json({
          success: false,
          message: 'Pasta de histórico não encontrada'
        });
      }

      files = fs.readdirSync(historicoDir)
        .filter(file => file.endsWith('.zip')); // Filtrar apenas ZIPs

      if (files.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'Nenhum arquivo ZIP de histórico encontrado'
        });
      }

      console.log(`📦 Total de arquivos ZIP encontrados: ${files.length}`);

      // Ler conteúdo dos arquivos ZIP locais
      for (const file of files) {
        const filePath = path.join(historicoDir, file);
        const stats = fs.statSync(filePath);
        
        // Ignorar diretórios
        if (stats.isDirectory()) {
          continue;
        }
        
        const buffer = fs.readFileSync(filePath);
        fileContents.push({
          name: file,
          buffer: buffer
        });
        console.log(`✅ Arquivo ZIP baixado do filesystem: ${file}`);
      }
    }

    if (fileContents.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Nenhum arquivo ZIP de histórico encontrado'
      });
    }

    // Criar arquivo ZIP contendo todos os ZIPs de histórico
    const archive = archiver('zip', {
      zlib: { level: 9 } // Máxima compressão
    });

    // Definir headers para download
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', 'attachment; filename="historico.zip"');
    
    // Pipe archive data to response
    archive.pipe(res);

    // Adicionar cada arquivo ZIP ao ZIP final
    fileContents.forEach(file => {
      archive.append(file.buffer, { name: file.name });
    });

    // Finalizar o arquivo
    await archive.finalize();

    console.log(`✅ ZIP gerado: historico.zip (${fileContents.length} arquivo(s) ZIP)`);

  } catch (error) {
    console.error('❌ Erro ao gerar ZIP de histórico:', error);
    
    // Verificar se a resposta já foi enviada
    if (!res.headersSent) {
      res.status(500).json({
        success: false,
        message: 'Erro ao gerar ZIP'
      });
    }
  }
});

// Rota para buscar histórico por hash ou nome
app.get('/api/maintenance/search-historico', async (req, res) => {
  try {
    const searchTerm = (req.query.q || '').trim().toLowerCase();
    
    if (!searchTerm) {
      return res.json({
        success: true,
        results: []
      });
    }

    let files = [];

    if (USE_S3) {
      const s3Files = await s3Service.listFiles('historico/');
      files = s3Files
        .filter(file => file.key.endsWith('.csv'))
        .map(file => {
          const fileName = path.basename(file.key);
          return {
            key: file.key,
            file_name: fileName
          };
        });
    } else {
      const historicoDir = path.join(__dirname, '..', 'public', 'historico');
      
      if (await fs.pathExists(historicoDir)) {
        files = fs.readdirSync(historicoDir)
          .filter(file => file.endsWith('.csv'))
          .map(file => ({
            key: `historico/${file}`,
            file_name: file
          }));
      }
    }

    // Função auxiliar para remover acentuação
    const removerAcentuacao = (texto) => {
      return texto.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    };

    const searchTermSemAcento = removerAcentuacao(searchTerm);
    
    // Buscar por nome do arquivo, hash ID ou nome da feature
    const results = [];
    const mainData = await readJsonFile('features/data-main.json').catch(() => null);
    
    for (const file of files) {
      const fileName = file.file_name.replace('.csv', '');
      const parts = fileName.split('_');
      const featureId = parts[0];
      
      // Buscar nome da feature no data-main.json
      let featureName = '';
      if (mainData && mainData.features) {
        const feature = mainData.features.find(f => f.id === featureId);
        if (feature) {
          featureName = feature.featureName || '';
        }
      }
      
      const fileNameLower = fileName.toLowerCase();
      const featureIdLower = featureId.toLowerCase();
      const featureNameLower = removerAcentuacao(featureName.toLowerCase());
      
      if (fileNameLower.includes(searchTerm) ||
          featureIdLower.includes(searchTerm) ||
          featureIdLower === searchTerm ||
          featureNameLower.includes(searchTermSemAcento)) {
        results.push({
          file_name: file.file_name,
          feature_id: featureId,
          feature_name: featureName || 'Sem nome'
        });
      }
    }

    res.json({
      success: true,
      results: results.slice(0, 20) // Limitar a 20 resultados
    });
  } catch (error) {
    console.error('❌ Erro ao buscar histórico:', error);
    res.status(500).json({
      success: false,
      error: 'Erro ao buscar histórico',
      message: error.message
    });
  }
});

// Rota para carregar histórico específico para edição
app.get('/api/maintenance/edit/historico/:filename', async (req, res) => {
  try {
    const filename = decodeURIComponent(req.params.filename);
    const filePath = `historico/${filename}`;
    
    let content = '';
    
    if (USE_S3) {
      const buffer = await s3Service.downloadFile(filePath);
      content = buffer.toString('utf-8');
    } else {
      const fullPath = path.join(__dirname, '..', 'public', filePath);
      if (!await fs.pathExists(fullPath)) {
        return res.status(404).json({
          success: false,
          error: 'Arquivo de histórico não encontrado'
        });
      }
      content = await fs.readFile(fullPath, 'utf-8');
    }
    
    res.json({
      success: true,
      content: content,
      filename: filename
    });
  } catch (error) {
    console.error('❌ Erro ao carregar histórico:', error);
    res.status(500).json({
      success: false,
      error: 'Erro ao carregar histórico',
      message: error.message
    });
  }
});

// Rota para salvar histórico editado
app.put('/api/maintenance/save/historico/:filename', async (req, res) => {
  try {
    const filename = decodeURIComponent(req.params.filename);
    const { content, password } = req.body;
    
    // Verificar se senha é necessária (apenas se flag for explicitamente true)
    const flags = await lerFlags();
    if (flags.senhaManutencao === true) {
      const adminPassword = process.env.PASSWORD_ADMIN;
      
      // Validar senha
      if (!password || password !== adminPassword) {
        return res.status(401).json({
          success: false,
          error: 'Senha incorreta'
        });
      }
    }

    if (!content) {
      return res.status(400).json({
        success: false,
        error: 'Conteúdo é obrigatório'
      });
    }

    const filePath = `historico/${filename}`;
    await writeTextFile(filePath, content, 'text/csv');
    
    console.log(`✅ Histórico ${filename} salvo com sucesso`);
    
    res.json({
      success: true,
      message: 'Histórico salvo com sucesso'
    });
  } catch (error) {
    console.error('❌ Erro ao salvar histórico:', error);
    res.status(500).json({
      success: false,
      error: 'Erro ao salvar histórico',
      message: error.message
    });
  }
});

// Rota para baixar todos os arquivos de anexos em ZIP
app.post('/api/maintenance/download-anexos-zip', async (req, res) => {
  try {
    const { password } = req.body;
    
    // Verificar se senha é necessária (apenas se flag for explicitamente true)
    const flags = await lerFlags();
    if (flags.senhaDownloadZip === true) {
      const adminPassword = process.env.PASSWORD_ADMIN;
      
      // Validar senha
      if (!password || password !== adminPassword) {
        return res.status(401).json({
          success: false,
          error: 'Senha incorreta'
        });
      }
    }

    let files = [];
    let fileContents = [];

    if (USE_S3) {
      // Buscar apenas arquivos ZIP do S3
      const s3Files = await s3Service.listFiles('anexos/');
      console.log(`📦 Total de arquivos em anexos/: ${s3Files.length}`);
      
      // Filtrar apenas arquivos ZIP
      const zipFiles = s3Files.filter(file => {
        const fileName = path.basename(file.key);
        return fileName.endsWith('.zip');
      });
      
      console.log(`📦 Total de arquivos ZIP encontrados: ${zipFiles.length}`);
      
      // Baixar conteúdo de cada arquivo ZIP do S3
      for (const file of zipFiles) {
        const fileName = path.basename(file.key);
        const buffer = await s3Service.downloadFile(file.key);
        fileContents.push({
          name: fileName,
          buffer: buffer
        });
        console.log(`✅ Arquivo ZIP baixado do S3: ${fileName}`);
      }
    } else {
      // Buscar apenas arquivos ZIP do filesystem local
      const anexosDir = path.join(__dirname, '..', 'public', 'anexos');
      
      if (!await fs.pathExists(anexosDir)) {
        return res.status(404).json({
          success: false,
          message: 'Pasta de anexos não encontrada'
        });
      }

      files = fs.readdirSync(anexosDir)
        .filter(file => file.endsWith('.zip')); // Filtrar apenas ZIPs

      if (files.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'Nenhum arquivo ZIP encontrado'
        });
      }

      console.log(`📦 Total de arquivos ZIP encontrados: ${files.length}`);

      // Ler conteúdo dos arquivos ZIP locais
      for (const file of files) {
        const filePath = path.join(anexosDir, file);
        const stats = fs.statSync(filePath);
        
        // Ignorar diretórios
        if (stats.isDirectory()) {
          continue;
        }
        
        const buffer = fs.readFileSync(filePath);
        fileContents.push({
          name: file,
          buffer: buffer
        });
        console.log(`✅ Arquivo ZIP baixado do filesystem: ${file}`);
      }
    }

    if (fileContents.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Nenhum arquivo ZIP encontrado'
      });
    }

    // Criar arquivo ZIP contendo todos os ZIPs de anexos
    const archive = archiver('zip', {
      zlib: { level: 9 } // Máxima compressão
    });

    // Definir headers para download
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', 'attachment; filename="anexos.zip"');
    
    // Pipe archive data to response
    archive.pipe(res);

    // Adicionar cada arquivo ZIP ao ZIP final
    fileContents.forEach(file => {
      archive.append(file.buffer, { name: file.name });
    });

    // Finalizar o arquivo
    await archive.finalize();

    console.log(`✅ ZIP gerado: anexos.zip (${fileContents.length} arquivo(s) ZIP)`);

  } catch (error) {
    console.error('❌ Erro ao gerar ZIP de anexos:', error);
    
    // Verificar se a resposta já foi enviada
    if (!res.headersSent) {
      res.status(500).json({
        success: false,
        message: 'Erro ao gerar ZIP'
      });
    }
  }
});

// Rota para baixar todas as imagens de produto em ZIP
app.post('/api/maintenance/download-imagens-zip', async (req, res) => {
  try {
    const { password } = req.body;
    
    // Verificar se senha é necessária (apenas se flag for explicitamente true)
    const flags = await lerFlags();
    if (flags.senhaDownloadZip === true) {
      const adminPassword = process.env.PASSWORD_ADMIN;
      
      // Validar senha
      if (!password || password !== adminPassword) {
        return res.status(401).json({
          success: false,
          error: 'Senha incorreta'
        });
      }
    }

    let files = [];
    let fileContents = [];

    if (USE_S3) {
      // Buscar arquivos do S3
      const s3Files = await s3Service.listFiles('features/images/');
      console.log(`📦 Total de arquivos em features/images/: ${s3Files.length}`);
      
      // Baixar conteúdo de cada arquivo do S3
      for (const file of s3Files) {
        const fileName = path.basename(file.key);
        const buffer = await s3Service.downloadFile(file.key);
        fileContents.push({
          name: fileName,
          buffer: buffer
        });
      }
    } else {
      // Buscar arquivos do filesystem local
      const imagesDir = path.join(__dirname, '..', 'public', 'features', 'images');
      
      if (!await fs.pathExists(imagesDir)) {
        return res.status(404).json({
          success: false,
          message: 'Pasta de imagens não encontrada'
        });
      }

      files = fs.readdirSync(imagesDir);

      if (files.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'Nenhuma imagem encontrada'
        });
      }

      // Ler conteúdo dos arquivos locais
      for (const file of files) {
        const filePath = path.join(imagesDir, file);
        const stats = fs.statSync(filePath);
        
        // Ignorar diretórios
        if (stats.isDirectory()) {
          continue;
        }
        
        const buffer = fs.readFileSync(filePath);
        fileContents.push({
          name: file,
          buffer: buffer
        });
      }
    }

    if (fileContents.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Nenhuma imagem encontrada'
      });
    }

    // Criar arquivo ZIP
    const archive = archiver('zip', {
      zlib: { level: 9 } // Máxima compressão
    });

    // Definir headers para download
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', 'attachment; filename="imagens_produto.zip"');
    
    // Pipe archive data to response
    archive.pipe(res);

    // Adicionar cada arquivo ao ZIP
    fileContents.forEach(file => {
      archive.append(file.buffer, { name: file.name });
    });

    // Finalizar o arquivo
    await archive.finalize();

    console.log(`✅ ZIP gerado: imagens_produto.zip (${fileContents.length} arquivo(s))`);

  } catch (error) {
    console.error('❌ Erro ao gerar ZIP de imagens:', error);
    
    // Verificar se a resposta já foi enviada
    if (!res.headersSent) {
      res.status(500).json({
        success: false,
        message: 'Erro ao gerar ZIP'
      });
    }
  }
});

// Rota para baixar todos os dados do sistema em um único ZIP
app.post('/api/maintenance/download-todos-dados-zip', async (req, res) => {
  try {
    const { password } = req.body;
    
    // Verificar se senha é necessária (apenas se flag for explicitamente true)
    const flags = await lerFlags();
    if (flags.senhaDownloadZip === true) {
      const adminPassword = process.env.PASSWORD_ADMIN;
      
      // Validar senha
      if (!password || password !== adminPassword) {
        return res.status(401).json({
          success: false,
          error: 'Senha incorreta'
        });
      }
    }

    // Criar arquivo ZIP principal
    const archive = archiver('zip', {
      zlib: { level: 9 } // Máxima compressão
    });

    // Definir headers para download
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', 'attachment; filename="todos_dados_sistema.zip"');
    
    // Pipe archive data to response
    archive.pipe(res);

    let totalFiles = 0;

    // 1. Adicionar arquivos JSON da pasta json (data-main.json, flags.json, prompts.json, avaliate-ia.json)
    console.log('📦 Coletando arquivos JSON da pasta json...');
    const jsonFiles = [
      { source: 'features/data-main.json', target: 'json/data-main.json' },
      { source: 'json/flags.json', target: 'json/flags.json' },
      { source: 'json/prompts.json', target: 'json/prompts.json' },
      { source: 'json/avaliate-ia.json', target: 'json/avaliate-ia.json' }
    ];
    
    for (const jsonFile of jsonFiles) {
      try {
        let buffer;
        if (USE_S3) {
          buffer = await s3Service.downloadFile(jsonFile.source);
        } else {
          const localPath = path.join(__dirname, '..', 'public', jsonFile.source);
          if (await fs.pathExists(localPath)) {
            buffer = fs.readFileSync(localPath);
          } else {
            continue;
          }
        }
        archive.append(buffer, { name: jsonFile.target });
        totalFiles++;
        console.log(`  ✅ Adicionado: ${jsonFile.target}`);
      } catch (error) {
        console.warn(`  ⚠️ Arquivo não encontrado: ${jsonFile.source}`);
      }
    }

    // 2. Adicionar todos os arquivos JSON das features
    console.log('📦 Coletando arquivos JSON das features...');
    let featuresCount = 0;
    
    if (USE_S3) {
      const s3Files = await s3Service.listFiles('features/metadata/json/');
      const jsonFiles = s3Files.filter(file => 
        file.key.endsWith('.json') && 
        file.key.includes('metadata/json/')
      );
      
      for (const file of jsonFiles) {
        const fileName = path.basename(file.key);
        const buffer = await s3Service.downloadFile(file.key);
        archive.append(buffer, { name: `features/${fileName}` });
        featuresCount++;
      }
    } else {
      const featuresDir = path.join(__dirname, '..', 'public', 'features', 'metadata', 'json');
      if (await fs.pathExists(featuresDir)) {
        const files = fs.readdirSync(featuresDir)
          .filter(file => file.endsWith('.json'));
        
        for (const file of files) {
          const filePath = path.join(featuresDir, file);
          const buffer = fs.readFileSync(filePath);
          archive.append(buffer, { name: `features/${file}` });
          featuresCount++;
        }
      }
    }
    totalFiles += featuresCount;
    console.log(`  ✅ Adicionados ${featuresCount} arquivos JSON das features`);

    // 3. Adicionar todos os arquivos ZIP do histórico
    console.log('📦 Coletando arquivos ZIP do histórico...');
    let historicoCount = 0;
    
    if (USE_S3) {
      const s3Files = await s3Service.listFiles('historico/');
      const zipFiles = s3Files.filter(file => file.key.endsWith('.zip'));
      
      for (const file of zipFiles) {
        const fileName = path.basename(file.key);
        const buffer = await s3Service.downloadFile(file.key);
        archive.append(buffer, { name: `historico/${fileName}` });
        historicoCount++;
      }
    } else {
      const historicoDir = path.join(__dirname, '..', 'public', 'historico');
      if (await fs.pathExists(historicoDir)) {
        const files = fs.readdirSync(historicoDir)
          .filter(file => file.endsWith('.zip'));
        
        for (const file of files) {
          const filePath = path.join(historicoDir, file);
          const stats = fs.statSync(filePath);
          
          // Ignorar diretórios
          if (stats.isDirectory()) {
            continue;
          }
          
          const buffer = fs.readFileSync(filePath);
          archive.append(buffer, { name: `historico/${file}` });
          historicoCount++;
        }
      }
    }
    totalFiles += historicoCount;
    console.log(`  ✅ Adicionados ${historicoCount} arquivos ZIP do histórico`);

    // 4. Adicionar todos os arquivos ZIP de anexos
    console.log('📦 Coletando arquivos ZIP de anexos...');
    let anexosCount = 0;
    
    if (USE_S3) {
      const s3Files = await s3Service.listFiles('anexos/');
      const zipFiles = s3Files.filter(file => file.key.endsWith('.zip'));
      
      for (const file of zipFiles) {
        const fileName = path.basename(file.key);
        const buffer = await s3Service.downloadFile(file.key);
        archive.append(buffer, { name: `anexos/${fileName}` });
        anexosCount++;
      }
    } else {
      const anexosDir = path.join(__dirname, '..', 'public', 'anexos');
      if (await fs.pathExists(anexosDir)) {
        const files = fs.readdirSync(anexosDir)
          .filter(file => file.endsWith('.zip'));
        
        for (const file of files) {
          const filePath = path.join(anexosDir, file);
          const stats = fs.statSync(filePath);
          
          // Ignorar diretórios
          if (stats.isDirectory()) {
            continue;
          }
          
          const buffer = fs.readFileSync(filePath);
          archive.append(buffer, { name: `anexos/${file}` });
          anexosCount++;
        }
      }
    }
    totalFiles += anexosCount;
    console.log(`  ✅ Adicionados ${anexosCount} arquivos ZIP de anexos`);

    // 5. Adicionar todas as imagens
    console.log('📦 Coletando imagens...');
    let imagensCount = 0;
    
    if (USE_S3) {
      const s3Files = await s3Service.listFiles('features/images/');
      
      for (const file of s3Files) {
        const fileName = path.basename(file.key);
        const buffer = await s3Service.downloadFile(file.key);
        archive.append(buffer, { name: `imagens/${fileName}` });
        imagensCount++;
      }
    } else {
      const imagesDir = path.join(__dirname, '..', 'public', 'features', 'images');
      if (await fs.pathExists(imagesDir)) {
        const files = fs.readdirSync(imagesDir);
        
        for (const file of files) {
          const filePath = path.join(imagesDir, file);
          const stats = fs.statSync(filePath);
          
          // Ignorar diretórios
          if (stats.isDirectory()) {
            continue;
          }
          
          const buffer = fs.readFileSync(filePath);
          archive.append(buffer, { name: `imagens/${file}` });
          imagensCount++;
        }
      }
    }
    totalFiles += imagensCount;
    console.log(`  ✅ Adicionadas ${imagensCount} imagens`);

    // Finalizar o arquivo
    await archive.finalize();

    console.log(`✅ ZIP completo gerado: todos_dados_sistema.zip (${totalFiles} arquivo(s) no total)`);

  } catch (error) {
    console.error('❌ Erro ao gerar ZIP completo:', error);
    
    // Verificar se a resposta já foi enviada
    if (!res.headersSent) {
      res.status(500).json({
        success: false,
        message: 'Erro ao gerar ZIP completo'
      });
    }
  }
});

// Função auxiliar para verificar se um arquivo deve ser processado baseado nas datas
function deveProcessarPorData(arquivoData, filterCreatedAt) {
  // Se não há filtros, processar todos
  if (!filterCreatedAt) {
    return true;
  }

  // Extrair apenas a data (sem horário) das propriedades do arquivo
  const arquivoCreatedAt = arquivoData.createdAt ? arquivoData.createdAt.split('T')[0] : null;

  // Verificar filtro de criação (menor ou igual)
  if (filterCreatedAt) {
    if (!arquivoCreatedAt || arquivoCreatedAt > filterCreatedAt) {
      return false;
    }
  }

  return true;
}

// Função auxiliar para converter data brasileira (DD/MM/YYYY) para formato ISO (YYYY-MM-DD)
function converterDataBrasileiraParaISO(dataBrasileira) {
  if (!dataBrasileira) return null;
  const partes = dataBrasileira.split('/');
  if (partes.length !== 3) return null;
  return `${partes[2]}-${partes[1]}-${partes[0]}`;
}

// Função auxiliar para verificar se um arquivo CSV de histórico deve ser processado
function deveProcessarHistoricoPorData(content, filterData) {
  if (!filterData) {
    return true;
  }

  // Procurar pela linha "Data da Execução" no CSV
  const lines = content.split('\n');
  for (const line of lines) {
    if (line.startsWith('Data da Execução,')) {
      const partes = line.split(',');
      if (partes.length >= 2) {
        const dataExecucaoBrasileira = partes[1].trim();
        const dataExecucaoISO = converterDataBrasileiraParaISO(dataExecucaoBrasileira);
        
        if (dataExecucaoISO && dataExecucaoISO <= filterData) {
          return true;
        } else {
          return false;
        }
      }
    }
  }

  // Se não encontrou a linha, processar (não filtrar)
  return true;
}

// Rota para edição em massa
app.post('/api/maintenance/batch-edit', async (req, res) => {
  try {
    const { fileType, operation, path: propertyPath, value, password, filterCreatedAt, filterHistorico, updateKey } = req.body;
    
    // Verificar se senha é necessária (apenas se flag for explicitamente true)
    const flags = await lerFlags();
    if (flags.senhaEdicaoMassa === true) {
      const adminPassword = process.env.PASSWORD_ADMIN;
      
      // Validar senha
      if (!password || password !== adminPassword) {
        return res.status(401).json({
          success: false,
          error: 'Senha incorreta'
        });
      }
    }

    // Validar parâmetros
    // Para histórico, propertyPath não é necessário (usa texto/valor)
    if (!fileType || !operation) {
      return res.status(400).json({
        success: false,
        error: 'Parâmetros obrigatórios: fileType, operation'
      });
    }
    
    // Para tipos que não são histórico, propertyPath é obrigatório
    if (fileType !== 'historico' && !propertyPath) {
      return res.status(400).json({
        success: false,
        error: 'Parâmetro obrigatório: path'
      });
    }

    // Para operações add e update, value pode ser null (quando campo está vazio)
    // Não validar se value é undefined, pois null é um valor válido

    let processed = 0;
    let errors = [];

    if (fileType === 'features') {
      // Processar todas as features
      let files = [];

      if (USE_S3) {
        const s3Files = await s3Service.listFiles('features/metadata/json/');
        files = s3Files
          .filter(file => file.key.endsWith('.json'))
          .map(file => path.basename(file.key));
      } else {
        const featuresDir = path.join(__dirname, '..', 'public', 'features', 'metadata', 'json');
        if (await fs.pathExists(featuresDir)) {
          files = fs.readdirSync(featuresDir)
            .filter(file => file.endsWith('.json'));
        }
      }

      for (const fileName of files) {
        try {
          const featureId = fileName.replace('.json', '');
          const filePath = `features/metadata/json/${fileName}`;
          const featureData = await readJsonFile(filePath);

          if (!featureData) continue;

          // Aplicar filtro de data se especificado
          if (!deveProcessarPorData(featureData, filterCreatedAt)) {
            continue;
          }

          // Aplicar operação
          try {
            aplicarOperacao(featureData, propertyPath, operation, value, updateKey);
          } catch (opError) {
            // Se for erro de propriedade não encontrada e a operação for remove, apenas avisar
            if (operation === 'remove' && opError.message.includes('Propriedade não encontrada')) {
              console.warn(`⚠️  Propriedade ${propertyPath} não encontrada em ${fileName} (já removida ou não existia)`);
              // Continuar processamento mesmo se a propriedade não existir
            } else {
              // Para outras operações ou outros erros, propagar
              throw opError;
            }
          }

          // Salvar arquivo atualizado
          await writeJsonFile(filePath, featureData);
          processed++;

          // Atualizar data-main.json para todas as operações (add, update, remove)
          const mainData = await readJsonFile('features/data-main.json');
          if (mainData && mainData.features) {
            const featureIndex = mainData.features.findIndex(f => f.id === featureId);
            if (featureIndex !== -1) {
              try {
                aplicarOperacao(mainData.features[featureIndex], propertyPath, operation, value, updateKey);
                await writeJsonFile('features/data-main.json', mainData);
                console.log(`✅ data-main.json atualizado para feature ${featureId} (operação: ${operation})`);
              } catch (opError) {
                // Para operação remove, se a propriedade não existir no data-main, apenas avisar mas não bloquear
                if (operation === 'remove' && opError.message.includes('Propriedade não encontrada')) {
                  console.warn(`⚠️  Propriedade não encontrada em data-main para ${featureId} (já removida ou não existia): ${opError.message}`);
                } else {
                  // Para outras operações ou outros erros, logar o erro
                  console.warn(`⚠️  Erro ao atualizar data-main para ${featureId}: ${opError.message}`);
                }
              }
            }
          }
        } catch (error) {
          errors.push({ file: fileName, error: error.message });
          console.error(`❌ Erro ao processar ${fileName}:`, error);
        }
      }
      
      // Se houver erros e todos forem de propriedade não encontrada, retornar erro específico
      if (errors.length > 0 && errors.length === files.length) {
        const allPropertyErrors = errors.every(e => e.error.includes('Propriedade não encontrada'));
        if (allPropertyErrors) {
          return res.status(400).json({
            success: false,
            error: `Propriedade não encontrada: ${propertyPath}. Nenhum arquivo foi modificado.`,
            processed: 0,
            errors: errors
          });
        }
      }
    } else if (fileType === 'data-main') {
      // Processar data-main.json: aplicar operação em todos os objetos do array features
      const mainData = await readJsonFile('features/data-main.json');
      
      if (!mainData) {
        return res.status(404).json({
          success: false,
          error: 'Arquivo data-main.json não encontrado'
        });
      }

      if (!mainData.features || !Array.isArray(mainData.features)) {
        return res.status(400).json({
          success: false,
          error: 'Array features não encontrado ou inválido no data-main.json'
        });
      }

      try {
        // Aplicar operação em cada objeto do array features
        const pathToApply = propertyPath.startsWith('features.')
          ? propertyPath.replace('features.', '')
          : propertyPath;

        for (const feature of mainData.features) {
          try {
            // Aplicar filtro de data se especificado
            if (!deveProcessarPorData(feature, filterCreatedAt)) {
              continue;
            }
            aplicarOperacao(feature, pathToApply, operation, value, updateKey);
            processed++;
          } catch (opError) {
            if (operation === 'remove' && opError.message.includes('Propriedade não encontrada')) {
              console.warn(`⚠️  Propriedade ${pathToApply} não encontrada em feature ${feature.id || '?'} (já removida ou não existia)`);
            } else {
              errors.push({ file: `features[${feature.id || '?'}]`, error: opError.message });
            }
          }
        }

        if (processed > 0) {
          await writeJsonFile('features/data-main.json', mainData);
        }
      } catch (error) {
        if (error.message.includes('Propriedade não encontrada')) {
          return res.status(400).json({
            success: false,
            error: error.message,
            processed: 0
          });
        }
        throw error;
      }
    } else if (fileType === 'historico') {
      // Processar arquivos CSV de histórico
      const { texto, valor } = req.body;
      
      if (!texto || !valor) {
        return res.status(400).json({
          success: false,
          error: 'Texto e valor são obrigatórios para edição de histórico'
        });
      }

      let files = [];

      if (USE_S3) {
        const s3Files = await s3Service.listFiles('historico/');
        files = s3Files
          .filter(file => file.key.endsWith('.csv'))
          .map(file => path.basename(file.key));
      } else {
        const historicoDir = path.join(__dirname, '..', 'public', 'historico');
        if (await fs.pathExists(historicoDir)) {
          files = fs.readdirSync(historicoDir)
            .filter(file => file.endsWith('.csv'));
        }
      }

      for (const fileName of files) {
        try {
          const filePath = `historico/${fileName}`;
          let content = '';
          
          // Ler conteúdo do arquivo
          if (USE_S3) {
            const buffer = await s3Service.downloadFile(filePath);
            content = buffer.toString('utf-8');
          } else {
            const fullPath = path.join(__dirname, '..', 'public', filePath);
            content = await fs.readFile(fullPath, 'utf-8');
          }

          // Aplicar filtro de data se especificado
          if (!deveProcessarHistoricoPorData(content, filterHistorico)) {
            continue;
          }

          // Processar linhas CSV
          // Função para parsear CSV corretamente (considerando aspas e vírgulas dentro de valores)
          const parseCSVLine = (line) => {
            const result = [];
            let current = '';
            let inQuotes = false;
            
            for (let i = 0; i < line.length; i++) {
              const char = line[i];
              
              if (char === '"') {
                if (inQuotes && line[i + 1] === '"') {
                  // Aspas duplas escapadas
                  current += '"';
                  i++; // Pular próxima aspa
                } else {
                  // Toggle quotes
                  inQuotes = !inQuotes;
                }
              } else if (char === ',' && !inQuotes) {
                // Vírgula fora de aspas = separador
                result.push(current.trim());
                current = '';
              } else {
                current += char;
              }
            }
            // Adicionar última coluna
            result.push(current.trim());
            return result;
          };

          const lines = content.split('\n');
          let modified = false;
          const newLines = lines.map(line => {
            const trimmedLine = line.trim();
            if (!trimmedLine) return line; // Linha vazia
            
            // Parsear linha CSV corretamente
            const columns = parseCSVLine(trimmedLine);
            
            if (columns.length >= 2) {
              // Remover aspas da primeira coluna se houver
              let firstColumn = columns[0];
              if (firstColumn.startsWith('"') && firstColumn.endsWith('"')) {
                firstColumn = firstColumn.slice(1, -1);
              }
              
              // Verificar se a primeira coluna corresponde ao texto buscado
              if (firstColumn === texto) {
                // Atualizar segunda coluna com o novo valor
                columns[1] = valor;
                modified = true;
                // Reconstruir linha CSV (adicionar aspas se necessário)
                return columns.map((col, idx) => {
                  // Primeira coluna mantém aspas se tinha antes
                  if (idx === 0 && line.includes('"')) {
                    return `"${col}"`;
                  }
                  return col;
                }).join(',');
              }
            }
            return line;
          });

          if (modified) {
            // Salvar arquivo atualizado
            const newContent = newLines.join('\n');
            await writeTextFile(filePath, newContent, 'text/csv');
            processed++;
          }
        } catch (error) {
          errors.push({ file: fileName, error: error.message });
          console.error(`❌ Erro ao processar ${fileName}:`, error);
        }
      }
    }

    console.log(`✅ Edição em massa concluída: ${processed} arquivo(s) processado(s)`);

    res.json({
      success: true,
      processed: processed,
      errors: errors.length > 0 ? errors : undefined,
      message: `Edição em massa concluída. ${processed} arquivo(s) processado(s).`
    });
  } catch (error) {
    console.error('❌ Erro ao processar edição em massa:', error);
    res.status(500).json({
      success: false,
      error: 'Erro ao processar edição em massa',
      message: error.message
    });
  }
});

// Função auxiliar para aplicar operação em um objeto
function aplicarOperacao(obj, propertyPath, operation, value, updateKey = false) {
  const parts = propertyPath.split('.');
  let current = obj;

  // Navegar até o penúltimo nível
  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i];
    if (current[part] === undefined || current[part] === null) {
      if (operation === 'add') {
        current[part] = {};
      } else if (operation === 'remove') {
        // Para remove, se o caminho não existir, a propriedade já não existe
        // Retornar sem erro (objetivo já alcançado)
        return;
      } else {
        // Para update, verificar se a propriedade existe
        throw new Error(`Propriedade não encontrada: ${parts.slice(0, i + 1).join('.')}`);
      }
    }
    current = current[part];
  }

  const lastPart = parts[parts.length - 1];

  // Verificar se a propriedade existe para operações update e remove
  if (operation === 'update' && !(lastPart in current)) {
    throw new Error(`Propriedade não encontrada: ${propertyPath}`);
  }

  // Para remove, se a propriedade não existir, apenas retornar (já está removida)
  if (operation === 'remove' && !(lastPart in current)) {
    // Propriedade já não existe, objetivo alcançado
    return;
  }

  if (operation === 'add' || operation === 'update') {
    // Se updateKey estiver marcado e a operação for update, renomear a chave
    if (operation === 'update' && updateKey && value !== null && value !== undefined) {
      // Obter o valor atual da propriedade
      const currentValue = current[lastPart];
      
      // Validar que o novo nome da chave (value) é uma string válida
      if (typeof value !== 'string' || value.trim() === '') {
        throw new Error('Para renomear a chave, o valor deve ser uma string não vazia');
      }
      
      const newKey = value.trim();
      
      // Verificar se a nova chave já existe
      if (newKey in current && newKey !== lastPart) {
        throw new Error(`A chave "${newKey}" já existe. Não é possível renomear para uma chave existente.`);
      }
      
      // Deletar a propriedade antiga
      delete current[lastPart];
      
      // Criar a nova propriedade com o novo nome e o valor antigo
      current[newKey] = currentValue;
    } else {
      // Comportamento normal: atualizar o valor da propriedade
      current[lastPart] = value;
    }
  } else if (operation === 'remove') {
    delete current[lastPart];
  }
}

// Rota para a API info
app.get('/api', (req, res) => {
  res.json({
    message: 'API de Documentação de Teste - Versão JSON',
    version: '2.0.0',
    endpoints: {
      'POST /api/save-template': 'Salvar nova documentação',
      'POST /api/features/duplicate': 'Duplicar documentação',
      'PUT /api/features/:id': 'Atualizar documentação existente',
      'GET /api/features/:id': 'Obter dados de uma feature',
      'GET /api/features': 'Listar todas as features',
      'DELETE /api/features/:id': 'Remover uma feature',
      'GET /api/features/next-id': 'Obter próximo ID disponível',
      'GET /api/features/zip/:featureId': 'Baixar todos os anexos de uma feature em ZIP',
      'POST /api/attachments/upload': 'Upload de anexos',
      'GET /api/attachments/:featureId': 'Listar anexos de uma feature',
      'GET /api/attachments/download/:filename': 'Download de arquivos',
      'DELETE /api/attachments/:filename': 'Remover anexo',
      'POST /api/test-history/save': 'Salvar histórico de execução',
      'GET /api/test-history/list': 'Listar histórico de testes',
      'GET /api/test-history/:filename': 'Obter conteúdo do histórico',
      'DELETE /api/test-history/:filename': 'Remover arquivo de histórico'
    }
  });
});

// Iniciar servidor
app.listen(PORT, () => {
  console.log(`🚀 Servidor iniciado na porta ${PORT}`);
  console.log(`📱 Acesse: http://localhost:${PORT}`);
  console.log(`📋 API JSON: http://localhost:${PORT}/api`);
});

module.exports = app;