/**
 * Camada client-side: intercepta chamadas à API principal e persiste dados no localStorage.
 * Rotas de IA continuam indo ao servidor (proxy) ou ao server-ai conforme a URL.
 * Defina window.__DOCUMENTACAO_ADMIN_SENHA__ para alterar a senha de admin (padrão: "admin").
 * Senha e chave OpenAI também podem ficar em localStorage: qualiDoc_ls_v1:env:PASSWORD_ADMIN e qualiDoc_ls_v1:env:OPENAI_API_KEY (inicializados ao carregar esta camada).
 */
(function () {
  'use strict';

  var P = 'qualiDoc_ls_v1:';
  window.__QUALIDOC_LS_PREFIX__ = P;
  var nativeFetch = window.fetch.bind(window);

  /** Base para arquivos estáticos (/json/…). Em GitHub Pages (projeto) o site fica em /nome-do-repo/. */
  function staticAssetBasePath() {
    if (typeof window.__QUALIDOC_STATIC_BASE__ === 'string' && window.__QUALIDOC_STATIC_BASE__.length) {
      var b = String(window.__QUALIDOC_STATIC_BASE__).replace(/\/?$/, '/');
      return b.charAt(0) === '/' ? b : '/' + b;
    }
    var h = (window.location.hostname || '').toLowerCase();
    if (h.slice(-10) === 'github.io') {
      var segs = window.location.pathname.split('/').filter(Boolean);
      if (segs.length >= 1) {
        return '/' + segs[0] + '/';
      }
    }
    return '/';
  }

  var AI_PROXY_PATHS = [
    '/api/generate-scenarios',
    '/api/reorganize-test-cases',
    '/api/analyze-duplicates',
    '/api/rastreabilidade-cobertura',
    '/api/status',
    '/api/analisar-cobertura',
    '/api/gerar-ct-cobertura'
  ];

  function isAiProxyPath(pathname) {
    var i;
    for (i = 0; i < AI_PROXY_PATHS.length; i++) {
      if (pathname === AI_PROXY_PATHS[i] || pathname.indexOf(AI_PROXY_PATHS[i] + '/') === 0) {
        return true;
      }
    }
    return false;
  }

  function fetchWithOpenAIKeyHeader(input, init) {
    var key = (localStorage.getItem(envVar('OPENAI_API_KEY')) || '').trim();
    if (!key) {
      return null;
    }
    if (typeof input === 'string') {
      var h = new Headers((init && init.headers) || undefined);
      if (!h.has('x-openai-api-key')) {
        h.set('X-OpenAI-API-Key', key);
      }
      return nativeFetch(input, Object.assign({}, init || {}, { headers: h }));
    }
    if (typeof Request !== 'undefined' && input instanceof Request) {
      var h2 = new Headers(input.headers);
      if (!h2.has('x-openai-api-key')) {
        h2.set('X-OpenAI-API-Key', key);
      }
      var merged = Object.assign({}, init || {}, { headers: h2 });
      return nativeFetch(new Request(input, merged));
    }
    return null;
  }

  function envVar(name) {
    return P + 'env:' + name;
  }

  function adminPassword() {
    if (typeof window.__DOCUMENTACAO_ADMIN_SENHA__ === 'string' && window.__DOCUMENTACAO_ADMIN_SENHA__.length) {
      return window.__DOCUMENTACAO_ADMIN_SENHA__;
    }
    var fromEnv = localStorage.getItem(envVar('PASSWORD_ADMIN'));
    if (fromEnv && String(fromEnv).length) {
      return String(fromEnv);
    }
    var legacy = localStorage.getItem(P + 'cfg:admin_secret');
    if (legacy && String(legacy).length) {
      return String(legacy);
    }
    return 'admin';
  }

  function j(res, status) {
    status = status || 200;
    return new Response(JSON.stringify(res), {
      status: status,
      headers: { 'Content-Type': 'application/json; charset=utf-8' }
    });
  }

  function getJson(key, fallback) {
    try {
      var raw = localStorage.getItem(key);
      if (!raw) return fallback;
      return JSON.parse(raw);
    } catch (e) {
      return fallback;
    }
  }

  function setJson(key, val) {
    try {
      localStorage.setItem(key, JSON.stringify(val));
    } catch (e) {
      console.error('[client-storage-api] Erro ao gravar localStorage (' + key + '):', e);
      throw e;
    }
  }

  function dataMainKey() {
    return P + 'features:data-main';
  }

  function featureKey(id) {
    return P + 'feature:' + id;
  }

  function binAnexoKey(name) {
    return P + 'anexo:' + name;
  }

  function binImageKey(fid, name) {
    return P + 'img:' + fid + ':' + name;
  }

  function histKey(fname) {
    return P + 'historico:' + fname;
  }

  function docHistoricoIndexKey(featureId) {
    return P + 'docHistorico:' + String(featureId || '').toUpperCase();
  }

  function appendDocHistoricoEntry(featureId, entry) {
    var fid = String(featureId || '').toUpperCase();
    if (!fid) return;
    var arr = getJson(docHistoricoIndexKey(fid), []);
    if (!Array.isArray(arr)) arr = [];
    arr.push(entry);
    setJson(docHistoricoIndexKey(fid), arr);
  }

  function removeAccentsStr(str) {
    return String(str).normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  }

  function buildTestHistoryCsvFromBody(body) {
    var feature_name = body.feature_name;
    var feature_id = body.feature_id;
    var testador = body.testador;
    var ambiente = body.ambiente;
    var cenarios = body.cenarios || [];
    var taxa_aprovacao = body.taxa_aprovacao != null ? body.taxa_aprovacao : 0;
    if (!feature_name || !feature_id || !testador || !ambiente) {
      return { error: 'feature_name, feature_id, testador e ambiente são obrigatórios' };
    }
    var featureSlug = removeAccentsStr(String(feature_name).toLowerCase())
      .replace(/[^a-z0-9]/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_|_$/g, '');
    var timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    var fileName = String(feature_id).toUpperCase() + '_' + featureSlug + '_' + timestamp + '.csv';
    var dataAtual = new Date();
    var dataFormatada = dataAtual.toLocaleDateString('pt-BR');
    var horaFormatada = dataAtual.toLocaleTimeString('pt-BR');
    var csvContent = 'Data da Execução,' + dataFormatada + '\n';
    csvContent += 'Hora da Execução,' + horaFormatada + '\n';
    csvContent += 'Testador,' + testador + '\n';
    csvContent += 'Ambiente,' + ambiente + '\n';
    csvContent += 'Taxa de Aprovação,' + taxa_aprovacao + '%\n';
    csvContent += '\n';
    csvContent += 'Caso de Teste,Status\n';
    var statusMap = {
      aprovado: 'Aprovado',
      reprovado: 'Reprovado',
      bloqueado: 'Bloqueado',
      nao_executado: 'Não Executado',
      na: 'Não Executado'
    };
    var i;
    for (i = 0; i < cenarios.length; i++) {
      var cenario = cenarios[i];
      var st = cenario.status || 'na';
      var statusTexto = statusMap[st] || 'Não Executado';
      var tituloCompleto = cenario.titulo || 'CT' + String(cenario.id).padStart(3, '0');
      csvContent += '"' + tituloCompleto + '",' + statusTexto + '\n';
    }
    csvContent += '\n';
    csvContent += 'Anexos\n';
    csvContent += 'Caso de Teste,Quantidade,Arquivos\n';
    for (i = 0; i < cenarios.length; i++) {
      var cen = cenarios[i];
      var anexos = cen.arquivos || [];
      var anexosNormalizados = anexos.map(function (anexo) {
        if (typeof anexo === 'object' && anexo !== null) {
          return anexo.nome || anexo.filename || '';
        }
        if (typeof anexo === 'string') return anexo;
        return '';
      });
      var arquivosFiltrados = anexosNormalizados.filter(function (a) {
        return a && String(a).trim() !== '';
      });
      var titCen = cen.titulo || 'CT' + String(cen.id).padStart(3, '0');
      if (arquivosFiltrados.length > 0) {
        var arquivos = arquivosFiltrados
          .map(function (anexo) {
            var s = String(anexo);
            return s.indexOf('/') !== -1 ? s.split('/').pop() : s;
          })
          .join('; ');
        csvContent += '"' + titCen + '",' + arquivosFiltrados.length + ',"' + arquivos + '"\n';
      } else {
        csvContent += '"' + titCen + '",0,Nenhum anexo\n';
      }
    }
    return { fileName: fileName, csvContent: csvContent };
  }

  function ensureDataMain() {
    var d = getJson(dataMainKey(), null);
    if (!d || typeof d !== 'object') {
      d = { features: [], totalFeatures: 0, ultimaAtualizacao: new Date().toISOString() };
      setJson(dataMainKey(), d);
      return d;
    }
    if (!Array.isArray(d.features)) {
      d.features = [];
    }
    if (typeof d.totalFeatures !== 'number') {
      d.totalFeatures = d.features.length;
    }
    return d;
  }

  function defaultFlags() {
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

  function ensureFlagsStorageInitialized() {
    var raw = localStorage.getItem(P + 'json:flags');
    if (!raw || raw.trim() === '' || raw.trim() === '{}') {
      setJson(P + 'json:flags', defaultFlags());
      return;
    }
    var parsed = getJson(P + 'json:flags', null);
    if (!parsed || typeof parsed !== 'object') {
      setJson(P + 'json:flags', defaultFlags());
      return;
    }
    var defs = defaultFlags();
    var k;
    var changed = false;
    for (k in defs) {
      if (Object.prototype.hasOwnProperty.call(defs, k) && !Object.prototype.hasOwnProperty.call(parsed, k)) {
        parsed[k] = defs[k];
        changed = true;
      }
    }
    if (changed) {
      setJson(P + 'json:flags', parsed);
    }
  }

  function ensureEnvInLocalStorage() {
    if (localStorage.getItem(envVar('PASSWORD_ADMIN')) == null) {
      var leg = localStorage.getItem(P + 'cfg:admin_secret');
      if (leg != null && String(leg).length) {
        localStorage.setItem(envVar('PASSWORD_ADMIN'), String(leg));
      } else {
        localStorage.setItem(envVar('PASSWORD_ADMIN'), 'admin');
      }
    }
    if (localStorage.getItem(envVar('OPENAI_API_KEY')) == null) {
      localStorage.setItem(envVar('OPENAI_API_KEY'), '');
    }
  }

  function bootstrapQualiDocStorage() {
    ensureEnvInLocalStorage();
    ensureFlagsStorageInitialized();
  }

  function getFlagsMerged() {
    ensureFlagsStorageInitialized();
    var f = getJson(P + 'json:flags', {});
    var d = defaultFlags();
    var k;
    for (k in f) {
      if (Object.prototype.hasOwnProperty.call(f, k)) d[k] = f[k];
    }
    return d;
  }

  function validateFlagsPayload(flagsData) {
    var camposBooleanos = [
      'manutencao',
      'excluirDocumentacao',
      'modalIA',
      'executarScriptIA',
      'organizarCT',
      'revisarCTDuplicados',
      'iaOpcaoFuncional',
      'iaOpcaoRegressao',
      'iaOpcaoIntegracao',
      'iaOpcaoPerformance',
      'iaOpcaoUsabilidade',
      'inserirImagensProduto',
      'iaCoberturaTeste',
      'editarPrompts',
      'forcarEdicaoDocumentacao',
      'senhaEditarPrompts',
      'senhaExcluirDocumentacao',
      'senhaManutencao',
      'senhaDownloadZip',
      'senhaEdicaoMassa',
      'recuperadorDados'
    ];
    var i;
    for (i = 0; i < camposBooleanos.length; i++) {
      var campo = camposBooleanos[i];
      if (flagsData[campo] !== undefined && typeof flagsData[campo] !== 'boolean') {
        return 'Campo ' + campo + ' deve ser um booleano';
      }
    }
    return null;
  }

  function calcularTaxaAprovacao(cenarios) {
    if (!cenarios || !cenarios.length) return 0;
    var a = cenarios.filter(function (c) {
      return c.status === 'aprovado';
    }).length;
    return Math.round((a / cenarios.length) * 100);
  }

  function calcularTaxaExecucao(cenarios) {
    if (!cenarios || !cenarios.length) return 0;
    var ap = cenarios.filter(function (c) {
      return c.status === 'aprovado';
    }).length;
    var rep = cenarios.filter(function (c) {
      return c.status === 'reprovado';
    }).length;
    return Math.round(((ap + rep) / cenarios.length) * 100);
  }

  function contarCasosPorFonte(cenarios) {
    if (!cenarios || !cenarios.length) return { totalIA: 0, totalManual: 0 };
    var totalIA = cenarios.filter(function (c) {
      return c.fonte === 'IA';
    }).length;
    var totalManual = cenarios.filter(function (c) {
      return c.fonte === 'usuário' || c.fonte === 'Usuário' || !c.fonte;
    }).length;
    return { totalIA: totalIA, totalManual: totalManual };
  }

  function generateHashId() {
    var chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    var r = '';
    for (var i = 0; i < 6; i++) {
      r += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return r;
  }

  function baseUrlFromLocation() {
    return window.location.origin;
  }

  function b64ToUint8(b64) {
    var bin = atob(b64);
    var len = bin.length;
    var arr = new Uint8Array(len);
    for (var i = 0; i < len; i++) {
      arr[i] = bin.charCodeAt(i);
    }
    return arr;
  }

  function uint8ToB64(u8) {
    var s = '';
    var i;
    for (i = 0; i < u8.length; i++) {
      s += String.fromCharCode(u8[i]);
    }
    return btoa(s);
  }

  function mimeFromExt(filename) {
    var ext = (filename.split('.').pop() || '').toLowerCase();
    var map = {
      pdf: 'application/pdf',
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      png: 'image/png',
      gif: 'image/gif',
      txt: 'text/plain',
      csv: 'text/csv'
    };
    return map[ext] || 'application/octet-stream';
  }

  function listHistoricoFiles() {
    var out = [];
    var i;
    var k;
    var prefix = P + 'historico:';
    for (i = 0; i < localStorage.length; i++) {
      k = localStorage.key(i);
      if (k && k.indexOf(prefix) === 0) {
        out.push(k.slice(prefix.length));
      }
    }
    return out.sort();
  }

  function listAnexoNamesForFeature(featureId) {
    var names = [];
    var prefix = P + 'anexo:';
    var i;
    var k;
    for (i = 0; i < localStorage.length; i++) {
      k = localStorage.key(i);
      if (k && k.indexOf(prefix) === 0) {
        var name = k.slice(prefix.length);
        if (name.indexOf(featureId + '_CT') === 0 && name.indexOf('.zip') === -1) {
          names.push(name);
        }
      }
    }
    return names;
  }

  function anexoExists(name) {
    return localStorage.getItem(binAnexoKey(name)) !== null;
  }

  function deleteAnexo(name) {
    localStorage.removeItem(binAnexoKey(name));
  }

  async function seedPromptsFromStatic() {
    try {
      var r = await nativeFetch(staticAssetBasePath() + 'json/prompts.json', { cache: 'no-store' });
      if (!r.ok) return [];
      var arr = await r.json();
      if (Array.isArray(arr) && arr.length) {
        setJson(P + 'json:prompts', arr);
      }
      return arr || [];
    } catch (e) {
      return [];
    }
  }

  async function getPromptsArray() {
    var arr = getJson(P + 'json:prompts', null);
    if (!arr || !arr.length) {
      arr = await seedPromptsFromStatic();
    }
    return arr || [];
  }

  function summaryFromFull(templateDocumentFull) {
    var c = templateDocumentFull.cenarios || [];
    var cf = contarCasosPorFonte(c);
    return {
      id: templateDocumentFull.id,
      featureName: templateDocumentFull.featureName,
      jiraLink: templateDocumentFull.jiraLink || '',
      creationDate: templateDocumentFull.creationDate,
      updateDate: templateDocumentFull.updateDate,
      testRoutine: templateDocumentFull.testRoutine,
      environment: templateDocumentFull.environment,
      tester: templateDocumentFull.tester,
      squad: templateDocumentFull.squad || '',
      browser: templateDocumentFull.browser || '',
      device: templateDocumentFull.device || '',
      status: templateDocumentFull.status || 'criado',
      totalCenarios: c.length,
      totalBugs: templateDocumentFull.bugs ? templateDocumentFull.bugs.length : 0,
      taxaAprovacao: calcularTaxaAprovacao(c),
      taxaExecucao: calcularTaxaExecucao(c),
      totalCenariosIA: cf.totalIA,
      totalCenariosManual: cf.totalManual,
      inEdit: false,
      createdAt: templateDocumentFull.createdAt,
      updatedAt: templateDocumentFull.updatedAt
    };
  }

  function updateScenarioAttachmentNames(featureId, cenarioId, newFileName) {
    var data = getJson(featureKey(featureId), null);
    if (!data || !data.cenarios) return;
    var scenario = data.cenarios.find(function (c) {
      return String(c.id) === String(cenarioId);
    });
    if (!scenario) return;
    if (!scenario.arquivos) scenario.arquivos = [];
    var fileNameOnly = newFileName.replace(featureId + '_CT' + String(cenarioId).padStart(3, '0'), 'CT' + String(cenarioId).padStart(3, '0'));
    scenario.arquivos.push(fileNameOnly);
    setJson(featureKey(featureId), data);
  }

  async function handleApiRequest(method, pathname, search, rawBody, request) {
    var u = pathname;
    var parts;
    var id;

    if (method === 'GET' && u === '/api/flags') {
      var flags = getFlagsMerged();
      return j({ success: true, flags: flags });
    }

    if (method === 'POST' && u === '/api/flags') {
      var fo = JSON.parse(rawBody || '{}');
      if (!fo.password || fo.password !== adminPassword()) {
        return j({ success: false, error: 'Senha incorreta' }, 401);
      }
      if (!fo.flags || typeof fo.flags !== 'object') {
        return j({ success: false, error: 'Dados de flags inválidos' }, 400);
      }
      var verr = validateFlagsPayload(fo.flags);
      if (verr) {
        return j({ success: false, error: verr }, 400);
      }
      var mergedSave = defaultFlags();
      var kf;
      for (kf in fo.flags) {
        if (Object.prototype.hasOwnProperty.call(fo.flags, kf)) {
          mergedSave[kf] = fo.flags[kf];
        }
      }
      setJson(P + 'json:flags', mergedSave);
      return j({ success: true, message: 'Flags salvas com sucesso', flags: getFlagsMerged() });
    }

    if (method === 'POST' && u === '/api/verify-password') {
      var v = JSON.parse(rawBody || '{}');
      if (!v.password) {
        return j({ success: false, error: 'Senha não fornecida' }, 400);
      }
      if (v.password === adminPassword()) {
        return j({ success: true, message: 'Senha correta' });
      }
      return j({ success: false, error: 'Senha incorreta' }, 401);
    }

    if (method === 'GET' && u.indexOf('/api/prompts/list') === 0) {
      var plist = await getPromptsArray();
      var prompts = plist.map(function (p) {
        return { id: p.id, name: p.nome, tipo: p.tipo, data_atualizacao: p.data_atualizacao || '' };
      });
      prompts.sort(function (a, b) {
        return a.id - b.id;
      });
      return j({ success: true, prompts: prompts });
    }

    var mPrompts = u.match(/^\/api\/prompts\/(\d+)$/);
    if (mPrompts && method === 'GET') {
      var pid = parseInt(mPrompts[1], 10);
      var parr = await getPromptsArray();
      var pr = parr.find(function (x) {
        return x.id === pid;
      });
      if (!pr) return j({ success: false, error: 'Prompt não encontrado' }, 404);
      return j({
        success: true,
        id: pr.id,
        nome: pr.nome,
        tipo: pr.tipo,
        content: pr.base,
        keywords: pr.keywords || [],
        data_atualizacao: pr.data_atualizacao || ''
      });
    }

    if (mPrompts && method === 'PUT') {
      var putP = JSON.parse(rawBody || '{}');
      var flagsP = getFlagsMerged();
      if (flagsP.editarPrompts === false) {
        return j({ success: false, error: 'Edição de prompts está bloqueada pela flag editarPrompts' }, 403);
      }
      if (flagsP.senhaEditarPrompts === true) {
        if (!putP.password || putP.password !== adminPassword()) {
          return j({ success: false, error: 'Senha incorreta' }, 401);
        }
      }
      if (!putP.content || typeof putP.content !== 'string') {
        return j({ success: false, error: 'Conteúdo é obrigatório e deve ser uma string' }, 400);
      }
      var pid2 = parseInt(mPrompts[1], 10);
      var arr2 = await getPromptsArray();
      var idx = arr2.findIndex(function (x) {
        return x.id === pid2;
      });
      if (idx === -1) return j({ success: false, error: 'Prompt não encontrado' }, 404);
      arr2[idx].base = putP.content;
      arr2[idx].data_atualizacao = new Date().toISOString();
      setJson(P + 'json:prompts', arr2);
      return j({ success: true, message: 'Prompt salvo com sucesso', id: pid2, nome: arr2[idx].nome });
    }

    if (method === 'GET' && u === '/api/avaliar-ia') {
      var av = getJson(P + 'json:avaliate-ia', null);
      if (!av || !av.avaliacoes) {
        av = { avaliacoes: [], nota_avg: 0, quantidade: 0, ultima_atualizacao: '' };
      }
      return j({ success: true, avaliacoes: av });
    }

    if (method === 'POST' && u === '/api/avaliar-ia') {
      var avb = JSON.parse(rawBody || '{}');
      if (!avb.nota || avb.nota < 1 || avb.nota > 5) {
        return j({ success: false, error: 'Nota inválida. Deve ser entre 1 e 5.' }, 400);
      }
      if (!avb.hash_id) {
        return j({ success: false, error: 'hash_id é obrigatório.' }, 400);
      }
      var avd = getJson(P + 'json:avaliate-ia', {
        avaliacoes: [],
        nota_avg: 0,
        quantidade: 0,
        ultima_atualizacao: ''
      });
      avd.avaliacoes.push({
        nota: avb.nota,
        resumo_produto: avb.resumo_produto,
        ct_gerados: avb.ct_gerados,
        data_hora: avb.data_hora,
        hash_id: avb.hash_id,
        ct_aplicadosIA: avb.ct_aplicadosIA,
        comentario: avb.comentario
      });
      avd.quantidade = avd.avaliacoes.length;
      var sum = avd.avaliacoes.reduce(function (a, x) {
        return a + (x.nota || 0);
      }, 0);
      avd.nota_avg = sum / avd.avaliacoes.length;
      avd.ultima_atualizacao = new Date().toISOString();
      setJson(P + 'json:avaliate-ia', avd);
      return j({ success: true, message: 'Avaliação registrada' });
    }

    if (method === 'GET' && u.indexOf('/api/features') === 0 && u === '/api/features/next-id') {
      var nid = generateHashId();
      return j({ success: true, nextId: nid, id: nid });
    }

    if (method === 'GET' && u === '/api/features') {
      var q = new URLSearchParams(search);
      var page = parseInt(q.get('page') || '1', 10);
      var limit = parseInt(q.get('limit') || '10', 10);
      var searchTerm = (q.get('search') || '').toLowerCase().trim();
      var ambienteFilter = (q.get('ambiente') || '').toLowerCase();
      var taxaAprovacaoFilter = q.get('taxaAprovacao') || '';

      var dm = ensureDataMain();
      var filtered = (dm.features || []).slice();

      var removerAcentuacao = function (texto) {
        return texto.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      };

      if (searchTerm) {
        var st = removerAcentuacao(searchTerm);
        filtered = filtered.filter(function (feature) {
          var nf = removerAcentuacao((feature.featureName || '').toLowerCase());
          var nt = removerAcentuacao((feature.tester || '').toLowerCase());
          return nf.indexOf(st) !== -1 || nt.indexOf(st) !== -1;
        });
      }
      if (ambienteFilter && ambienteFilter !== 'todos') {
        filtered = filtered.filter(function (feature) {
          return (feature.environment || '').toLowerCase() === ambienteFilter;
        });
      }
      if (taxaAprovacaoFilter) {
        filtered = filtered.filter(function (feature) {
          var taxa = feature.taxaAprovacao || 0;
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

      var totalFiltered = filtered.length;
      var totalPages = Math.ceil(totalFiltered / limit) || 1;
      filtered.sort(function (a, b) {
        var da = new Date(a.updatedAt || a.createdAt || 0);
        var db = new Date(b.updatedAt || b.createdAt || 0);
        return db - da;
      });
      var start = (page - 1) * limit;
      var paginated = filtered.slice(start, start + limit);

      return j({
        success: true,
        features: paginated,
        pagination: {
          total: totalFiltered,
          page: page,
          limit: limit,
          totalPages: totalPages,
          hasNextPage: page < totalPages,
          hasPrevPage: page > 1
        },
        filters: { search: searchTerm, ambiente: ambienteFilter, taxaAprovacao: taxaAprovacaoFilter }
      });
    }

    if (method === 'POST' && u === '/api/save-template') {
      var templateData = JSON.parse(rawBody || '{}');
      if (
        !templateData.featureName ||
        !templateData.creationDate ||
        templateData.testRoutine === undefined ||
        !templateData.environment ||
        !templateData.tester
      ) {
        return j({ error: 'Campos obrigatórios não preenchidos' }, 400);
      }
      var hashId = templateData.featureId || templateData.id || generateHashId();
      var cenarios = templateData.cenarios || templateData.testCases || [];
      var templateDocumentFull = {
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
        featureDescription: templateData.featureDescription || '',
        resumoDescricaoProduto: templateData.resumoDescricaoProduto || null,
        ct_aplicadosIA: templateData.ct_aplicadosIA !== undefined ? templateData.ct_aplicadosIA : false,
        testType: templateData.testType || 'funcional',
        imagens_selecionadas: templateData.imagens_selecionadas || [],
        coberturas: templateData.coberturas || {},
        status: 'criado',
        cenarios: cenarios,
        bugs: templateData.bugs || [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      var templateDocument = summaryFromFull(templateDocumentFull);
      var data = ensureDataMain();
      data.features.push(templateDocument);
      data.totalFeatures = data.features.length;
      data.ultimaAtualizacao = new Date().toISOString();
      setJson(dataMainKey(), data);
      setJson(featureKey(hashId), templateDocumentFull);
      return j({
        success: true,
        message: 'Documentação salva com sucesso',
        id: hashId,
        data: templateDocument,
        totalCenarios: templateDocument.totalCenarios,
        totalBugs: templateDocument.totalBugs
      });
    }

    var dupMatch = u.match(/^\/api\/features\/([^/]+)$/);
    if (dupMatch && method === 'GET') {
      id = dupMatch[1];
      var fd = getJson(featureKey(id), null);
      if (!fd) return j({ error: 'Feature não encontrada' }, 404);
      return j({ success: true, data: fd });
    }

    if (dupMatch && method === 'PUT') {
      id = dupMatch[1];
      var updateData = JSON.parse(rawBody || '{}');
      var existingData = getJson(featureKey(id), null);
      if (!existingData) return j({ error: 'Feature não encontrada' }, 404);
      var updatedData = {
        id: id,
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
        observacao: updateData.observacao !== undefined ? updateData.observacao : existingData.observacao || '',
        featureDescription: updateData.featureDescription || '',
        resumoDescricaoProduto:
          updateData.resumoDescricaoProduto !== undefined
            ? updateData.resumoDescricaoProduto
            : existingData.resumoDescricaoProduto || null,
        ct_aplicadosIA:
          updateData.ct_aplicadosIA !== undefined ? updateData.ct_aplicadosIA : existingData.ct_aplicadosIA || false,
        testType: updateData.testType || existingData.testType || 'funcional',
        imagens_selecionadas: updateData.imagens_selecionadas || existingData.imagens_selecionadas || [],
        coberturas: updateData.coberturas || existingData.coberturas || {},
        status: 'criado',
        cenarios: updateData.cenarios || [],
        bugs: updateData.bugs || [],
        createdAt: existingData.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      updatedData.cenarios = (updatedData.cenarios || []).map(function (cenario) {
        if (!cenario.arquivos || !Array.isArray(cenario.arquivos)) return cenario;
        var arquivosNormalizados = cenario.arquivos
          .map(function (anexo) {
            if (typeof anexo === 'object' && anexo !== null) {
              return anexo.nome || anexo.filename || '';
            }
            return anexo;
          })
          .filter(function (a) {
          return a && String(a).trim() !== '';
        });
        return Object.assign({}, cenario, { arquivos: arquivosNormalizados });
      });
      setJson(featureKey(id), updatedData);
      var mainData = ensureDataMain();
      var fi = mainData.features.findIndex(function (f) {
        return f.id === id;
      });
      if (fi !== -1) {
        var cc = updatedData.cenarios || [];
        var cdf = contarCasosPorFonte(cc);
        mainData.features[fi] = {
          id: id,
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
          totalCenarios: cc.length,
          totalBugs: updatedData.bugs ? updatedData.bugs.length : 0,
          taxaAprovacao: calcularTaxaAprovacao(cc),
          taxaExecucao: calcularTaxaExecucao(cc),
          totalCenariosIA: cdf.totalIA,
          totalCenariosManual: cdf.totalManual,
          inEdit: false,
          createdAt: updatedData.createdAt,
          updatedAt: updatedData.updatedAt
        };
        mainData.ultimaAtualizacao = new Date().toISOString();
        setJson(dataMainKey(), mainData);
      }
      return j({ success: true, message: 'Documentação atualizada com sucesso', data: updatedData });
    }

    var editSt = u.match(/^\/api\/features\/([^/]+)\/edit-status$/);
    if (editSt && method === 'GET') {
      id = editSt[1];
      var md = ensureDataMain();
      var ft = (md.features || []).find(function (f) {
        return f.id === id;
      });
      if (!ft) return j({ success: false, error: 'Feature não encontrada' }, 404);
      return j({ success: true, inEdit: !!ft.inEdit });
    }

    if (editSt && method === 'PUT') {
      id = editSt[1];
      var bodyEs = JSON.parse(rawBody || '{}');
      var md2 = ensureDataMain();
      var ft2 = (md2.features || []).find(function (f) {
        return f.id === id;
      });
      if (!ft2) return j({ success: false, error: 'Feature não encontrada' }, 404);
      ft2.inEdit = !!bodyEs.inEdit;
      ft2.inEditTimestamp = bodyEs.inEdit ? new Date().toISOString() : null;
      md2.ultimaAtualizacao = new Date().toISOString();
      setJson(dataMainKey(), md2);
      return j({ success: true, message: 'Status atualizado' });
    }

    if (method === 'DELETE' && /^\/api\/features\/[^/]+$/.test(u) && u.indexOf('/images') === -1 && u.indexOf('/edit-status') === -1) {
      id = u.replace('/api/features/', '');
      var md3 = ensureDataMain();
      md3.features = (md3.features || []).filter(function (f) {
        return f.id !== id;
      });
      md3.totalFeatures = md3.features.length;
      md3.ultimaAtualizacao = new Date().toISOString();
      setJson(dataMainKey(), md3);
      localStorage.removeItem(featureKey(id));
      listAnexoNamesForFeature(id).forEach(deleteAnexo);
      var iprefix = P + 'img:' + id + ':';
      var ki;
      var keysToRemove = [];
      for (ki = 0; ki < localStorage.length; ki++) {
        var kk = localStorage.key(ki);
        if (kk && kk.indexOf(iprefix) === 0) keysToRemove.push(kk);
      }
      keysToRemove.forEach(function (k) {
        localStorage.removeItem(k);
      });
      localStorage.removeItem(docHistoricoIndexKey(id));
      return j({ success: true, message: 'Removido' });
    }

    if (method === 'POST' && u === '/api/features/duplicate') {
      var dup = JSON.parse(rawBody || '{}');
      if (!dup.arquivo || !dup.novoAmbiente || !dup.novoTestador) {
        return j({ success: false, message: 'Dados obrigatórios não fornecidos' }, 400);
      }
      var orig = getJson(featureKey(dup.arquivo), null);
      if (!orig) {
        return j({ success: false, message: 'Documentação original não encontrada' }, 404);
      }
      var base;
      try {
        base = JSON.parse(JSON.stringify(orig));
      } catch (eCl) {
        base = orig;
      }
      var novaHash = generateHashId();
      var novosCenarios = [];
      if (dup.reaproveitarCTs && orig.cenarios && orig.cenarios.length) {
        novosCenarios = orig.cenarios.map(function (cenario) {
          return {
            id: cenario.id,
            titulo: cenario.titulo || cenario.nomeCaso || '',
            precondicoes: cenario.precondicoes || '',
            passos: cenario.passos || '',
            resultadoEsperado: cenario.resultadoEsperado || '',
            status: 'nao_executado',
            arquivos: [],
            fonte: cenario.fonte
          };
        });
      }
      var hoje = new Date().toISOString().split('T')[0];
      var nowIso = new Date().toISOString();
      base.id = novaHash;
      base.creationDate = hoje;
      base.updateDate = hoje;
      base.environment = dup.novoAmbiente;
      base.tester = dup.novoTestador;
      base.status = 'criado';
      base.cenarios = novosCenarios;
      base.bugs = [];
      base.createdAt = nowIso;
      base.updatedAt = nowIso;
      var novoDoc = base;
      var td = summaryFromFull(novoDoc);
      var dmx = ensureDataMain();
      dmx.features.push(td);
      dmx.totalFeatures = dmx.features.length;
      dmx.ultimaAtualizacao = new Date().toISOString();
      setJson(dataMainKey(), dmx);
      setJson(featureKey(novaHash), novoDoc);
      return j({
        success: true,
        message: 'Documentação duplicada com sucesso',
        novoArquivo: novaHash,
        novoId: novaHash,
        data: novoDoc
      });
    }

    if (method === 'GET' && u === '/api/statistics') {
      var mainData = ensureDataMain();
      if (!mainData.features || !mainData.features.length) {
        return j({
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
      var totalCasosTeste = 0;
      var totalCasosIA = 0;
      var totalCasosManual = 0;
      var porAmbiente = {};
      var taxaAcima70 = 0;
      var taxaAbaixo70 = 0;
      mainData.features.forEach(function (feature) {
        totalCasosTeste += feature.totalCenarios || 0;
        totalCasosIA += feature.totalCenariosIA || 0;
        totalCasosManual += feature.totalCenariosManual || 0;
        var amb = (feature.environment || 'sem ambiente').toLowerCase();
        var ambN = amb;
        if (amb.indexOf('produção') !== -1 || amb.indexOf('producao') !== -1) ambN = 'producao';
        else if (amb.indexOf('homologação') !== -1 || amb.indexOf('homologacao') !== -1) ambN = 'homologacao';
        else if (amb.indexOf('desenvolvimento') !== -1) ambN = 'desenvolvimento';
        porAmbiente[ambN] = (porAmbiente[ambN] || 0) + 1;
        var taxa = feature.taxaAprovacao || 0;
        if (taxa >= 70) taxaAcima70++;
        else taxaAbaixo70++;
      });
      var aprovados = 0;
      var reprovados = 0;
      var bloqueados = 0;
      var naoExecutados = 0;
      var semInfo = 0;
      mainData.features.forEach(function (feature) {
        var featureData = getJson(featureKey(feature.id), null);
        if (featureData && featureData.cenarios) {
          featureData.cenarios.forEach(function (cenario) {
            var status = cenario.status || 'na';
            switch (status) {
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
      });
      return j({
        success: true,
        stats: {
          totalCasosTeste: totalCasosTeste,
          totalCasosIA: totalCasosIA,
          totalCasosManual: totalCasosManual,
          aprovados: aprovados,
          reprovados: reprovados,
          bloqueados: bloqueados,
          naoExecutados: naoExecutados,
          semInfo: semInfo,
          porAmbiente: porAmbiente,
          taxaAcima70: taxaAcima70,
          taxaAbaixo70: taxaAbaixo70
        }
      });
    }

    var thList = u === '/api/test-history/list';
    if (method === 'GET' && thList) {
      var qHist = new URLSearchParams(search);
      var searchTerm = (qHist.get('search') || '').toLowerCase().trim();
      var featureIdFilter = (qHist.get('featureId') || '').toUpperCase().trim();
      var ambienteFilter = (qHist.get('ambiente') || '').toLowerCase().trim();
      var fnames = listHistoricoFiles();
      var dmH = ensureDataMain();
      var historico = fnames.map(function (file) {
        var mh = file.match(/^([A-Z0-9]{6})_/);
        var fidH = mh ? mh[1] : '';
        var featureName = '';
        var ambiente = '';
        if (dmH && dmH.features) {
          var featH = dmH.features.find(function (f) {
            return f.id === fidH;
          });
          if (featH) {
            featureName = featH.featureName || '';
            ambiente = (featH.environment || '').toLowerCase();
          }
        }
        var rawCsv = localStorage.getItem(histKey(file)) || '';
        return {
          file_name: file,
          feature_id: fidH,
          feature_name: featureName,
          ambiente: ambiente,
          data_criacao: new Date().toISOString(),
          data_modificacao: new Date().toISOString(),
          tamanho: rawCsv.length
        };
      });
      if (searchTerm) {
        var stNorm = searchTerm.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        historico = historico.filter(function (item) {
          var fnNorm = (item.feature_name || '')
            .toLowerCase()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '');
          return fnNorm.indexOf(stNorm) !== -1;
        });
      }
      if (featureIdFilter) {
        historico = historico.filter(function (item) {
          return item.feature_id === featureIdFilter;
        });
      }
      if (ambienteFilter && ambienteFilter !== 'todos') {
        historico = historico.filter(function (item) {
          return item.ambiente === ambienteFilter;
        });
      }
      historico.sort(function (a, b) {
        return String(b.file_name).localeCompare(String(a.file_name));
      });
      return j({ success: true, historico: historico });
    }

    var thFile = u.match(/^\/api\/test-history\/(.+)$/);
    if (thFile && method === 'GET' && thFile[1] !== 'list') {
      var enc = thFile[1];
      var dec = decodeURIComponent(enc);
      if (dec === 'list') {
        return j({ success: false, message: 'Não encontrado' }, 404);
      }
      var csv = localStorage.getItem(histKey(dec));
      if (!csv) return j({ success: false, message: 'Arquivo de histórico não encontrado' }, 404);
      return j({
        success: true,
        content: csv,
        file_name: dec,
        data_modificacao: new Date().toISOString(),
        tamanho: csv.length
      });
    }

    if (method === 'POST' && u === '/api/test-history/save') {
      var th = JSON.parse(rawBody || '{}');
      if (th.fileName && th.content) {
        localStorage.setItem(histKey(th.fileName), th.content);
        var mhLegacy = String(th.fileName).match(/^([A-Z0-9]{6})_/);
        var fidLegacy = th.feature_id ? String(th.feature_id).toUpperCase() : mhLegacy ? mhLegacy[1] : '';
        if (fidLegacy) {
          appendDocHistoricoEntry(fidLegacy, {
            file_name: th.fileName,
            feature_id: fidLegacy,
            savedAt: new Date().toISOString(),
            legacyRaw: true
          });
        }
        return j({
          success: true,
          message: 'Histórico salvo com sucesso!',
          file_name: th.fileName,
          file_path: 'historico/' + th.fileName
        });
      }
      var built = buildTestHistoryCsvFromBody(th);
      if (built.error) {
        return j({ success: false, message: built.error }, 400);
      }
      localStorage.setItem(histKey(built.fileName), built.csvContent);
      appendDocHistoricoEntry(th.feature_id, {
        file_name: built.fileName,
        feature_id: String(th.feature_id).toUpperCase(),
        feature_name: th.feature_name,
        ambiente: th.ambiente,
        savedAt: new Date().toISOString(),
        taxa_aprovacao: th.taxa_aprovacao
      });
      return j({
        success: true,
        message: 'Histórico salvo com sucesso!',
        file_path: 'historico/' + built.fileName,
        file_name: built.fileName
      });
    }

    var attFid = u.match(/^\/api\/attachments\/([^/]+)$/);
    if (method === 'GET' && attFid && attFid[1] !== 'upload' && attFid[1].indexOf('download') !== 0) {
      var featureId = attFid[1];
      var names = listAnexoNamesForFeature(featureId);
      var base = baseUrlFromLocation();
      var attachments = names
        .map(function (file) {
          var match = file.match(/^([A-Z0-9]{6})_CT(\d+)(?:_(\d+))?\.(.+)$/);
          if (!match) return null;
          var fileFeatureId = match[1];
          var cenarioId = parseInt(match[2], 10);
          var counter = match[3];
          var extension = match[4];
          var originalName =
            'CT' + String(cenarioId).padStart(3, '0') + (counter ? '_' + counter : '') + '.' + extension;
          var raw = localStorage.getItem(binAnexoKey(file));
          var size = 0;
          if (raw) {
            try {
              var o = JSON.parse(raw);
              size = o.b64 ? atob(o.b64).length : 0;
            } catch (e) {}
          }
          return {
            filename: file,
            originalName: originalName,
            cenarioId: cenarioId,
            featureId: fileFeatureId,
            size: size,
            downloadUrl: base + '/api/attachments/download/' + encodeURIComponent(file),
            createdAt: new Date().toISOString()
          };
        })
        .filter(Boolean)
        .sort(function (a, b) {
          return a.cenarioId - b.cenarioId;
        });
      return j({ success: true, attachments: attachments });
    }

    var attDl = u.match(/^\/api\/attachments\/download\/(.+)$/);
    if (method === 'GET' && attDl) {
      var fn = decodeURIComponent(attDl[1]);
      var raw2 = localStorage.getItem(binAnexoKey(fn));
      if (!raw2) return j({ success: false, message: 'Arquivo não encontrado' }, 404);
      var o2 = JSON.parse(raw2);
      var u8 = b64ToUint8(o2.b64);
      return new Response(u8, {
        status: 200,
        headers: {
          'Content-Type': o2.mime || mimeFromExt(fn),
          'Content-Disposition': 'attachment; filename="' + fn + '"'
        }
      });
    }

    var anexoS = u.match(/^\/api\/anexos\/(.+)$/);
    if (method === 'GET' && anexoS) {
      var fn2 = decodeURIComponent(anexoS[1]);
      var raw3 = localStorage.getItem(binAnexoKey(fn2));
      if (!raw3) return j({ success: false, message: 'Arquivo não encontrado' }, 404);
      var o3 = JSON.parse(raw3);
      var u82 = b64ToUint8(o3.b64);
      return new Response(u82, {
        status: 200,
        headers: { 'Content-Type': o3.mime || mimeFromExt(fn2) }
      });
    }

    if (method === 'DELETE' && /^\/api\/attachments\//.test(u)) {
      var delN = u.replace('/api/attachments/', '');
      if (delN.indexOf('download/') === 0) return null;
      deleteAnexo(decodeURIComponent(delN));
      return j({ success: true });
    }

    if (method === 'POST' && u === '/api/attachments/upload') {
      if (!request || !request.formData) {
        return j({ success: false, message: 'FormData não suportado' }, 400);
      }
      var fd = await request.formData();
      var file = fd.get('file');
      var cenarioId = fd.get('cenarioId');
      var featureIdU = fd.get('featureId');
      if (!file || !cenarioId || !featureIdU) {
        return j({ success: false, message: 'Dados inválidos' }, 400);
      }
      var buf = await file.arrayBuffer();
      var u8f = new Uint8Array(buf);
      var cenarioIdFormatted = String(cenarioId).padStart(3, '0');
      var originalName = file.name;
      var extension = '.' + (originalName.split('.').pop() || 'bin');
      var baseFileName = featureIdU + '_CT' + cenarioIdFormatted;
      var newFileName = baseFileName + extension;
      var c = 0;
      while (anexoExists(newFileName)) {
        c++;
        newFileName = baseFileName + '_' + c + extension;
      }
      var mime = file.type || mimeFromExt(newFileName);
      setJson(binAnexoKey(newFileName), { mime: mime, b64: uint8ToB64(u8f) });
      updateScenarioAttachmentNames(featureIdU, cenarioId, newFileName);
      var bu = baseUrlFromLocation();
      return j({
        success: true,
        message: 'Anexo salvo com sucesso!',
        file_path: 'anexos/' + newFileName,
        file_name: newFileName,
        original_name: originalName,
        file_size: u8f.length,
        file_type: mime,
        download_url: bu + '/api/attachments/download/' + encodeURIComponent(newFileName)
      });
    }

    var imgPost = u.match(/^\/api\/features\/([^/]+)\/images$/);
    if (method === 'POST' && imgPost) {
      var fidI = imgPost[1];
      if (!request || !request.formData) return j({ success: false, message: 'FormData' }, 400);
      var fdi = await request.formData();
      var img = fdi.get('image');
      if (!img) return j({ success: false, message: 'Sem imagem' }, 400);
      var ab = await img.arrayBuffer();
      var fname = img.name || 'upload.png';
      var mimeI = img.type || 'image/png';
      setJson(binImageKey(fidI, fname), { mime: mimeI, b64: uint8ToB64(new Uint8Array(ab)) });
      return j({
        success: true,
        message: 'Upload OK',
        filename: fname,
        download_url: baseUrlFromLocation() + '/api/features/' + fidI + '/images/' + encodeURIComponent(fname)
      });
    }

    var imgList = u.match(/^\/api\/features\/([^/]+)\/images$/);
    if (method === 'GET' && imgList) {
      var fidL = imgList[1];
      var prefixL = P + 'img:' + fidL + ':';
      var imgs = [];
      var ij;
      for (ij = 0; ij < localStorage.length; ij++) {
        var kj = localStorage.key(ij);
        if (kj && kj.indexOf(prefixL) === 0) {
          imgs.push({ filename: kj.slice(prefixL.length), url: '/api/features/' + fidL + '/images/' + encodeURIComponent(kj.slice(prefixL.length)) });
        }
      }
      return j({ success: true, images: imgs });
    }

    var imgOne = u.match(/^\/api\/features\/([^/]+)\/images\/(.+)$/);
    if (imgOne && method === 'GET') {
      var fidG = imgOne[1];
      var iname = decodeURIComponent(imgOne[2] || '');
      var iraw = localStorage.getItem(binImageKey(fidG, iname));
      if (!iraw) return j({ success: false, message: 'Não encontrado' }, 404);
      var io = JSON.parse(iraw);
      return new Response(b64ToUint8(io.b64), { status: 200, headers: { 'Content-Type': io.mime || 'image/png' } });
    }

    if (imgOne && method === 'DELETE') {
      var fidD = imgOne[1];
      var inameD = decodeURIComponent(imgOne[2]);
      localStorage.removeItem(binImageKey(fidD, inameD));
      return j({ success: true });
    }

    if (u.indexOf('/api/maintenance/') === 0) {
      if (method === 'GET' && /^\/api\/maintenance\/edit\/(data-main|flags|prompts)$/.test(u)) {
        var type = u.split('/').pop();
        if (type === 'data-main') return j({ success: true, data: ensureDataMain() });
        if (type === 'flags') return j({ success: true, data: getFlagsMerged() });
        return j({ success: true, data: await getPromptsArray() });
      }
      if (method === 'GET' && /^\/api\/maintenance\/edit\/feature\//.test(u)) {
        var fidM = u.replace('/api/maintenance/edit/feature/', '');
        var dd = getJson(featureKey(fidM), null);
        if (!dd) return j({ success: false, error: 'Não encontrado' }, 404);
        return j({ success: true, data: dd });
      }
      if (method === 'GET' && u === '/api/maintenance/search-features') {
        var qs = new URLSearchParams(search);
        var qterm = (qs.get('q') || '').trim().toLowerCase();
        if (!qterm) return j({ success: true, results: [] });
        var dmS = ensureDataMain();
        var ra = (dmS.features || []).filter(function (feature) {
          var tid = (feature.id || '').toLowerCase();
          var nome = (feature.featureName || '').toLowerCase();
          return tid.indexOf(qterm) !== -1 || nome.indexOf(qterm) !== -1;
        }).slice(0, 20);
        return j({
          success: true,
          results: ra.map(function (f) {
            return { id: f.id, featureName: f.featureName || 'Sem nome' };
          })
        });
      }
      if (method === 'GET' && u === '/api/maintenance/download-data-main') {
        var dmDown = ensureDataMain();
        return new Response(JSON.stringify(dmDown, null, 2), {
          status: 200,
          headers: {
            'Content-Type': 'application/json; charset=utf-8',
            'Content-Disposition': 'attachment; filename="data-main.json"'
          }
        });
      }
      var mSaveFeature = u.match(/^\/api\/maintenance\/save\/feature\/(.+)$/);
      if (method === 'PUT' && mSaveFeature) {
        var bodyF = JSON.parse(rawBody || '{}');
        var flagsX = getFlagsMerged();
        if (flagsX.senhaManutencao === true) {
          if (!bodyF.password || bodyF.password !== adminPassword()) {
            return j({ success: false, error: 'Senha incorreta' }, 401);
          }
        }
        if (!bodyF.data) return j({ success: false, error: 'Dados são obrigatórios' }, 400);
        var fidX = mSaveFeature[1];
        var ex = getJson(featureKey(fidX), null);
        if (!ex) return j({ success: false, error: 'Feature não encontrada' }, 404);
        var dsave = bodyF.data;
        dsave.updatedAt = new Date().toISOString();
        if (!dsave.createdAt) dsave.createdAt = ex.createdAt || new Date().toISOString();
        setJson(featureKey(fidX), dsave);
        var mdx = ensureDataMain();
        var fix = mdx.features.findIndex(function (f) {
          return f.id === fidX;
        });
        if (fix !== -1) {
          var ccx = dsave.cenarios || [];
          mdx.features[fix] = {
            id: dsave.id,
            featureName: dsave.featureName,
            jiraLink: dsave.jiraLink || '',
            creationDate: dsave.creationDate,
            updateDate: dsave.updateDate || new Date().toISOString().split('T')[0],
            testRoutine: dsave.testRoutine,
            environment: dsave.environment,
            tester: dsave.tester,
            squad: dsave.squad || '',
            browser: dsave.browser || '',
            device: dsave.device || '',
            status: dsave.status || 'criado',
            totalCenarios: ccx.length,
            totalBugs: dsave.bugs ? dsave.bugs.length : 0,
            taxaAprovacao: calcularTaxaAprovacao(ccx),
            taxaExecucao: calcularTaxaExecucao(ccx),
            inEdit: false,
            createdAt: dsave.createdAt,
            updatedAt: dsave.updatedAt
          };
          mdx.ultimaAtualizacao = new Date().toISOString();
          setJson(dataMainKey(), mdx);
        }
        return j({ success: true, message: 'Feature salva com sucesso' });
      }

      var mSaveType = u.match(/^\/api\/maintenance\/save\/(data-main|flags|prompts)$/);
      if (method === 'PUT' && mSaveType) {
        var bodyT = JSON.parse(rawBody || '{}');
        var flagsT = getFlagsMerged();
        if (flagsT.senhaManutencao === true) {
          if (!bodyT.password || bodyT.password !== adminPassword()) {
            return j({ success: false, error: 'Senha incorreta' }, 401);
          }
        }
        if (!bodyT.data) return j({ success: false, error: 'Dados são obrigatórios' }, 400);
        var typ = mSaveType[1];
        if (typ === 'data-main') {
          setJson(dataMainKey(), bodyT.data);
        } else if (typ === 'flags') {
          setJson(P + 'json:flags', bodyT.data);
        } else {
          setJson(P + 'json:prompts', bodyT.data);
        }
        return j({ success: true, message: 'Arquivo salvo com sucesso' });
      }

      if (method === 'PUT' && /^\/api\/maintenance\/save\/historico\//.test(u)) {
        return j({ success: false, message: 'Edição de histórico em ZIP não suportada no modo localStorage' }, 501);
      }
      return j({ success: false, message: 'Função de manutenção não implementada no armazenamento local' }, 501);
    }

    return null;
  }

  function defaultPortForProtocol(protocol) {
    return protocol === 'https:' ? '443' : '80';
  }

  function hostPortFingerprint(loc) {
    var h = (loc.hostname || '').toLowerCase();
    if (h === 'localhost' || h === '::1' || h === '[::1]') {
      h = '127.0.0.1';
    }
    var p = loc.port || defaultPortForProtocol(loc.protocol || 'http:');
    return h + ':' + p;
  }

  function sameAppOrigin(u) {
    try {
      if (u.origin === window.location.origin) {
        return true;
      }
      return hostPortFingerprint(u) === hostPortFingerprint(window.location);
    } catch (e) {
      return false;
    }
  }

  function shouldIntercept(urlString) {
    var u;
    try {
      u = new URL(urlString, window.location.href);
    } catch (e) {
      return false;
    }
    if (u.pathname.indexOf('/api/') !== 0) {
      return false;
    }
    if (!sameAppOrigin(u)) {
      return false;
    }
    for (var i = 0; i < AI_PROXY_PATHS.length; i++) {
      if (u.pathname === AI_PROXY_PATHS[i] || u.pathname.indexOf(AI_PROXY_PATHS[i] + '/') === 0) {
        return false;
      }
    }
    return true;
  }

  async function parseBody(request, method) {
    if (method === 'GET' || method === 'HEAD') return '';
    try {
      return await request.text();
    } catch (e) {
      return '';
    }
  }

  window.fetch = async function (input, init) {
    var url =
      typeof input === 'string'
        ? input
        : input && input.url
        ? input.url
        : '';
    var method = (init && init.method) || (typeof input !== 'string' && input && input.method) || 'GET';
    method = method.toUpperCase();

    if (!shouldIntercept(url)) {
      try {
        var urlForAi =
          typeof input === 'string'
            ? input
            : input && input.url
            ? input.url
            : url || '/';
        var uAi = new URL(urlForAi, window.location.href);
        if (sameAppOrigin(uAi) && isAiProxyPath(uAi.pathname)) {
          var forwarded = fetchWithOpenAIKeyHeader(input, init);
          if (forwarded) {
            return forwarded;
          }
        }
      } catch (eAi) {
        /* fetch direto */
      }
      return nativeFetch(input, init);
    }

    var reqForForm = typeof input !== 'string' ? input : new Request(input, init);
    var uObj = new URL(url || '/', window.location.href);
    var raw = '';
    var isMultipartApi =
      uObj.pathname === '/api/attachments/upload' ||
      (method === 'POST' && /^\/api\/features\/[^/]+\/images$/.test(uObj.pathname));
    if (method !== 'GET' && method !== 'HEAD' && !isMultipartApi) {
      raw = await parseBody(reqForForm, method);
    }

    var handled;
    try {
      handled = await handleApiRequest(method, uObj.pathname, uObj.search, raw, reqForForm);
    } catch (e) {
      console.error('[client-storage-api]', e);
      handled = j({ success: false, message: e.message || String(e) }, 500);
    }

    if (handled !== null) {
      return handled;
    }

    return nativeFetch(input, init);
  };

  bootstrapQualiDocStorage();

  window.__QUALIDOC_GET_FLAGS__ = function () {
    return getFlagsMerged();
  };
  window.__QUALIDOC_ENV_KEYS__ = {
    PASSWORD_ADMIN: envVar('PASSWORD_ADMIN'),
    OPENAI_API_KEY: envVar('OPENAI_API_KEY')
  };
  window.__QUALIDOC_DOC_HISTORICO_LS_KEY__ = function (featureId) {
    return P + 'docHistorico:' + String(featureId || '').toUpperCase();
  };

  console.log(
    '📦 API local: dados em localStorage (' +
      P +
      '). Flags: ' +
      P +
      'json:flags. Env: ' +
      envVar('PASSWORD_ADMIN') +
      ', ' +
      envVar('OPENAI_API_KEY') +
      '. Senha admin padrão: admin'
  );
})();
