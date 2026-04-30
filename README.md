# qa-sistema-documentacao-testes
Sistema de documentação de testes criado por QA

## 🚀 Execução Local com LocalStack e S3

Este projeto utiliza LocalStack para simular serviços AWS (S3) localmente durante o desenvolvimento.

### ⚡ Início Rápido (5 minutos)

#### 1️⃣ Instalar Docker Desktop

Se ainda não tem o Docker instalado:
- **Windows**: [Docker Desktop for Windows](https://www.docker.com/products/docker-desktop/)

#### 2️⃣ Iniciar LocalStack

```bash
# Iniciar o container do LocalStack
npm run localstack:start

# Aguarde alguns segundos para o serviço iniciar
```

#### 3️⃣ Testar Configuração

```bash
# Executar script de teste
npm run s3:setup
```

Você verá algo como:
```
🚀 Configurando LocalStack...
✅ Bucket S3 "test-evidence-bucket" criado com sucesso
✅ Upload bem-sucedido
✅ Download bem-sucedido
✅ LocalStack configurado e testado com sucesso!
```

#### 4️⃣ Pronto! ✅

Agora você pode usar o S3 Service na sua aplicação!

### 📦 Scripts Disponíveis

#### LocalStack (Docker)

```bash
# Iniciar LocalStack
npm run localstack:start

# Parar LocalStack
npm run localstack:stop

# Ver logs
npm run localstack:logs

# Reiniciar
npm run localstack:restart

# Limpar dados (cuidado!)
npm run localstack:clean
```

#### S3 Service

```bash
# Configurar e testar S3
npm run s3:setup

# Migrar arquivos locais para S3
npm run s3:migrate
```

### 💡 Como Usar no Código

#### Exemplo Básico

```javascript
const s3Service = require('./services/s3.service');

// Upload de arquivo
async function uploadExample() {
  const result = await s3Service.uploadFile(
    Buffer.from('Olá, S3!'),
    'test/hello.txt',
    'text/plain'
  );
  console.log('Upload:', result);
}

// Download de arquivo
async function downloadExample() {
  const buffer = await s3Service.downloadFile('test/hello.txt');
  console.log('Conteúdo:', buffer.toString());
}

// Listar arquivos
async function listExample() {
  const files = await s3Service.listFiles('test/');
  console.log('Arquivos:', files);
}

// Deletar arquivo
async function deleteExample() {
  await s3Service.deleteFile('test/hello.txt');
  console.log('Arquivo deletado!');
}
```

### 🔄 Migração de Arquivos

Para migrar seus arquivos locais existentes para o S3:

```bash
npm run s3:migrate
```

Este comando irá:
- ✅ Migrar `public/anexos/` → `s3://bucket/anexos/`
- ✅ Migrar `public/features/` → `s3://bucket/features/`
- ✅ Migrar `public/historico/` → `s3://bucket/historico/`

### 🐛 Troubleshooting

#### LocalStack não inicia

```bash
# Verificar se Docker está rodando
docker ps

# Ver logs de erro
npm run localstack:logs

# Tentar reiniciar
npm run localstack:restart
```

#### Erro "Cannot connect to LocalStack"

```bash
# Verificar se a porta 4566 está livre
netstat -an | findstr 4566

# Parar e iniciar novamente
npm run localstack:stop
npm run localstack:start
```

#### Arquivo .env não encontrado

```bash
# Copiar arquivo de exemplo
copy .env.example .env
```

### 📊 Estrutura de Arquivos S3

#### Desenvolvimento (LocalStack)

```
s3://test-evidence-bucket/
├── anexos/
│   ├── ABCDEF_CT001.pdf
│   ├── ABCDEF_CT002.jpg
│   └── ...
├── features/
│   ├── ABCDEF.json
│   ├── GHIJKL.json
│   └── ...
└── historico/
    ├── ABCDEF_feature_name_2025-11-03.csv
    └── ...
```

### 📚 Documentação Completa

Para mais detalhes sobre S3 e LocalStack, veja:
- [QUICKSTART-S3.md](./QUICKSTART-S3.md) - Guia rápido completo
- [INTEGRACAO-S3-COMPLETA.md](./INTEGRACAO-S3-COMPLETA.md) - Documentação de integração
- [AWS S3 Docs](https://docs.aws.amazon.com/s3/)
- [LocalStack Docs](https://docs.localstack.cloud/)

---

## Configuração de Variáveis de Ambiente

Este projeto requer duas variáveis de ambiente principais: `OPENAI_API_KEY` e `PASSWORD_ADMIN`.

### Variável OPENAI_API_KEY

Este projeto utiliza a API da OpenAI para funcionalidades de IA. É necessário configurar a variável de ambiente `OPENAI_API_KEY` com sua chave da API OpenAI.

#### Configuração Local

1. Copie o arquivo `.env.example` para `.env`:
   ```bash
   cp .env.example .env
   ```
   Ou no Windows PowerShell:
   ```powershell
   Copy-Item .env.example .env
   ```

2. Edite o arquivo `.env` e preencha com seus valores reais:
   ```
   OPENAI_API_KEY=sua_chave_aqui
   PASSWORD_ADMIN=sua_senha_admin_aqui
   ```

3. Obtenha sua chave da OpenAI em: https://platform.openai.com/api-keys

**Nota:** O arquivo `.env` não deve ser commitado no repositório (já está no `.gitignore`). Use `.env.example` como template.

#### Configuração no GitHub Actions

Para usar o projeto no GitHub Actions, você precisa configurar a variável como um secret do repositório:

1. Acesse: **Settings** → **Secrets and variables** → **Actions**
2. Clique em **New repository secret**
3. Nome: `OPENAI_API_KEY`
4. Valor: Cole sua chave da API OpenAI
5. Clique em **Add secret**

O workflow do GitHub Actions (`docker-build.yml`) está configurado para usar automaticamente este secret durante o build e testes dos containers Docker.

**⚠️ Importante para Produção**: As secrets do GitHub Actions são usadas apenas para CI/CD e testes. Em produção, você deve passar as variáveis de ambiente em runtime (não no build). Veja [DEPLOY-PRODUCAO.md](./DEPLOY-PRODUCAO.md) para detalhes.

#### Configuração no Docker

Ao executar o container Docker, passe a variável de ambiente:

```bash
docker run -e OPENAI_API_KEY=sua_chave_aqui -p 3001:3001 -p 3002:3002 sua-imagem
```

Ou use um arquivo `.env`:

```bash
docker run --env-file .env -p 3001:3001 -p 3002:3002 sua-imagem
```

### Variável PASSWORD_ADMIN

Esta variável define a senha de administrador necessária para operações protegidas no sistema, como:
- Exclusão de documentação
- Edição de prompts
- Operações de manutenção
- Download de arquivos ZIP
- Edição em massa

#### Configuração Local

1. Se ainda não tiver um arquivo `.env`, copie o template:
   ```bash
   cp .env.example .env
   ```

2. Adicione ou edite no arquivo `.env`:
   ```
   PASSWORD_ADMIN=sua_senha_admin_aqui
   ```
3. Use uma senha forte e segura

#### Configuração no GitHub Actions

Para usar o projeto no GitHub Actions, você precisa configurar a variável como um secret do repositório:

1. Acesse: **Settings** → **Secrets and variables** → **Actions**
2. Clique em **New repository secret**
3. Nome: `PASSWORD_ADMIN`
4. Valor: Cole sua senha de administrador
5. Clique em **Add secret**

O workflow do GitHub Actions (`docker-build.yml`) está configurado para usar automaticamente este secret durante o build e testes dos containers Docker.

**⚠️ Importante para Produção**: As secrets do GitHub Actions são usadas apenas para CI/CD e testes. Em produção, você deve passar as variáveis de ambiente em runtime (não no build). Veja [DEPLOY-PRODUCAO.md](./DEPLOY-PRODUCAO.md) para detalhes.

#### Configuração no Docker

Ao executar o container Docker, passe a variável de ambiente:

```bash
docker run -e PASSWORD_ADMIN=sua_senha_aqui -e OPENAI_API_KEY=sua_chave_aqui -p 3001:3001 -p 3002:3002 sua-imagem
```

Ou use um arquivo `.env`:

```bash
docker run --env-file .env -p 3001:3001 -p 3002:3002 sua-imagem
```
