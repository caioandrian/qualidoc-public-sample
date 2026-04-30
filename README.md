# QualiDoc — documentação de testes (QA)

## Demonstração no GitHub Pages

- **Site publicado (app):** [https://caioandrian.github.io/qualidoc-public-sample/](https://caioandrian.github.io/qualidoc-public-sample/) — abre a interface do QualiDoc (com redirecionamento para `html/index.html`). O texto “QualiDoc” e “Sistema de Documentação de Teste” na página inicial vêm do **HTML da aplicação**, não do `README.md`.

Sistema de documentação de casos de testes voltado a QA. **A proposta atual é executar a aplicação com persistência somente no lado do cliente**, usando **`localStorage` do navegador** como armazenamento principal — sem depender de bucket S3, banco ou APIs de arquivo no servidor para os dados da documentação.

## Arquitetura (client-side)

1. **Interface**: páginas estáticas em `public/html/` (CSS em `public/css/`, lógica em `public/js/`).
2. **Camada de persistência**: o script `public/js/client-storage-api.js` é carregado **no início** de cada página e **intercepta chamadas `fetch`** destinadas à API “clássica” do sistema. Em vez de ir ao servidor, leituras e gravações de documentação, metadados, anexos e histórico são **simuladas no browser** e materializadas em chaves no `localStorage`.
3. **Prefixo das chaves**: por padrão, os dados usam o prefixo `qualiDoc_ls_v1:` (também exposto em `window.__QUALIDOC_LS_PREFIX__`), o que isola este app de outras entradas no mesmo armazenamento.

Com isso, **cada usuário (e cada perfil de navegador) tem seu próprio conjunto de dados**. Não há sincronização automática entre máquinas. Limpar dados do site ou o próprio `localStorage` remove a documentação armazenada aí.

## Backend opcional (apenas para IA)

Rotas de **inteligência artificial** (geração de cenários, reorganização, análises, etc.) continuam previstas para conversar com um **servidor** que faz proxy para a API OpenAI — por exemplo `js/server-ai.js` (porta **3002** por padrão). O próprio `client-storage-api.js` encaminha essas rotas ao servidor quando ele está disponível e pode enviar a chave OpenAI no cabeçalho `X-OpenAI-API-Key` se ela estiver configurada no cliente.

**Resumo**: documentação e arquivos de trabalho **no `localStorage`**; **IA** continua **opcional** e tipicamente exige o serviço Node de IA (ou equivalente) em execução.

### Configuração no navegador (sem `.env`)

Sem variáveis de ambiente no servidor, você pode definir no próprio cliente (conforme implementado em `client-storage-api.js`):

- **Senha de administrador**: chave `qualiDoc_ls_v1:env:PASSWORD_ADMIN` no `localStorage`, ou a variável global `window.__DOCUMENTACAO_ADMIN_SENHA__` (senão, o padrão de desenvolvimento é `admin`).
- **Chave OpenAI** (para chamadas de IA via proxy): chave `qualiDoc_ls_v1:env:OPENAI_API_KEY` no `localStorage`.

Trate esses valores como secretos no contexto do usuário: qualquer pessoa com acesso ao mesmo perfil do navegador pode lê-los.

## Como executar localmente

### Só interface + dados em `localStorage` (mínimo)

É necessário servir os arquivos por **HTTP** (não basta abrir `file://`), para que scripts e caminhos absolutos (`/js/...`, `/css/...`) funcionem. Exemplo com Node:

```bash
npx --yes serve public -p 8080
```

Abra no navegador a home do app, por exemplo:

`http://localhost:8080/html/index.html`

### Instalação e servidor Node do repositório

Útil se você quiser o mesmo ambiente que o código Express espera (incluindo proxy de IA, se configurado):

```bash
npm install
npm start
```

O servidor principal (`js/server.js`) usa por padrão a porta **3001** (variável `PORT` no `.env` opcional). Consulte o código e o `Dockerfile` para detalhes de execução em container. Documentação auxiliar de Docker: `scripts/README-DOCKER-RUN.md`.

## Variáveis de ambiente (modo servidor / Docker)

Quando você **faz rodar** os servidores Node ou imagens Docker, ainda é comum definir no `.env` (há um modelo em `.env.example`):

- `OPENAI_API_KEY` — usada pelo serviço de IA no servidor, quando não se envia só pelo cliente.
- `PASSWORD_ADMIN` — senha administrativa no servidor legado; no fluxo **client-first**, a senha efetiva pode ser a do `localStorage` conforme acima.
- `PORT` / `AI_PORT` — portas dos serviços principal e de IA, quando aplicável.

O arquivo `.env` não deve ser versionado (mantenha segredos fora do Git).

## Estrutura relevante do repositório

| Caminho | Função |
|--------|--------|
| `public/html/` | Páginas da aplicação |
| `public/js/client-storage-api.js` | Interceptação de API + persistência em `localStorage` |
| `public/js/script.js`, `view-script.js`, ... | Comportamento da UI |
| `js/server.js` | Servidor Express (estático + rotas; uso opcional conforme deploy) |
| `js/server-ai.js` | Proxy/serviço de rotas de IA (opcional) |

## Licença

Veja o arquivo `LICENSE` no repositório.
