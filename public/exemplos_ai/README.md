# Exemplos para Geração de Casos de Teste com AI

Este diretório contém exemplos de produtos e funcionalidades para testar a geração automática de casos de teste com Inteligência Artificial.

## 📁 Exemplos Disponíveis

### 1. Cadastro de Produtos (`cadastro_de_produtos.txt`)
Sistema administrativo para gerenciar produtos com:
- Cadastro completo de produtos
- Upload de imagens
- Geração automática de SKU
- Edição e exclusão

**Ideal para testar:** Testes funcionais, validação de campos, CRUD e upload de arquivos

### 2. Carrinho de Compras (`carrinho_de_compras.txt`)
Sistema de e-commerce com funcionalidades de:
- Adicionar/remover produtos
- Gerenciar quantidades
- Aplicar cupons de desconto
- Calcular totais e frete

**Ideal para testar:** Testes funcionais, validação de campos, cálculos e regras de negócio

### 3. Sistema de Login (`sistema_de_login.txt`)
Autenticação de usuários com:
- Validação de credenciais
- Recuperação de senha
- Controle de tentativas
- Gerenciamento de sessão

**Ideal para testar:** Testes de segurança, validação de campos, mensagens de erro e fluxos de autenticação

### 4. Busca de Produtos (`busca_de_produtos.txt`)
Sistema de busca e filtros com:
- Autocomplete e sugestões
- Filtros múltiplos
- Ordenação de resultados
- Histórico de buscas

**Ideal para testar:** Testes de busca, filtros, performance e usabilidade

### 5. Notificações Push (`notificacoes_push.txt`)
Sistema de alertas em tempo real com:
- Notificações push
- Gerenciamento de lidas/não lidas
- Preferências de notificação
- Badge de contador

**Ideal para testar:** Testes de integração, tempo real, interface e configurações

## 🚀 Como Usar

### Método 1: Copiar e Colar
1. Abra o arquivo de exemplo desejado
2. Copie todo o conteúdo ou apenas as seções relevantes
3. Cole no campo de entrada do gerador de casos de teste
4. Configure o tipo de teste (funcional, regressão, integração, etc.)
5. Selecione a quantidade de cenários desejada
6. Clique em "Gerar com AI"

### Método 2: Adaptar o Exemplo
1. Leia o exemplo completo
2. Adapte as funcionalidades para seu contexto
3. Mantenha a estrutura:
   - Descrição clara da funcionalidade
   - Lista de funcionalidades principais
   - Regras de negócio
   - Campos/elementos da interface
4. Use o texto adaptado no gerador

## 💡 Dicas para Melhores Resultados

### Estrutura Recomendada
```
## Descrição da Funcionalidade
[Explicação breve do que faz]

## Funcionalidades Principais
- Funcionalidade 1
- Funcionalidade 2
- Funcionalidade 3

## Regras de Negócio
1. Regra importante 1
2. Regra importante 2
3. Regra importante 3

## Campos/Elementos
- Campo 1 (obrigatório/opcional)
- Campo 2 (com validação)
- Botão X
```

### Informações que Melhoram a Geração
- ✅ Regras de negócio específicas e claras
- ✅ Validações de campos (mín/máx, formato, obrigatoriedade)
- ✅ Mensagens de erro esperadas
- ✅ Fluxos alternativos e exceções
- ✅ Comportamentos esperados do sistema
- ❌ Evite descrições muito genéricas
- ❌ Evite informações técnicas excessivas

### Tipos de Teste Disponíveis

1. **Funcional**
   - Verifica se funcionalidades estão de acordo com requisitos
   - Usa: Validações, fluxos principais, campos obrigatórios

2. **Regressão**
   - Garante que alterações não quebraram funcionalidades existentes
   - Usa: Cenários críticos, integrações principais

3. **Integração**
   - Testa comunicação entre módulos/sistemas
   - Usa: APIs, serviços externos, fluxos entre telas

4. **Usabilidade**
   - Avalia experiência do usuário
   - Usa: Interface, mensagens, facilidade de uso

5. **Performance**
   - Mede desempenho e comportamento sob carga
   - Usa: Volume de dados, múltiplos usuários, tempo de resposta

## 📝 Criando Seus Próprios Exemplos

1. Identifique a funcionalidade/produto a ser testado
2. Documente claramente:
   - O que faz
   - Como funciona
   - Quais são as regras
   - Quais são os elementos
3. Salve como arquivo .txt neste diretório
4. Use como referência para geração de casos de teste

## 🎯 Exemplos de Uso por Tipo de Teste

### Para Testes Funcionais
Use exemplos com foco em:
- Validações de campos
- Fluxos completos
- Regras de negócio

### Para Testes de Integração
Use exemplos que mencionam:
- Comunicação entre sistemas
- APIs e serviços
- Fluxos entre módulos

### Para Testes de Usabilidade
Use exemplos que destacam:
- Elementos da interface
- Mensagens ao usuário
- Facilidade de uso

---

**Nota:** Estes exemplos são templates genéricos. Adapte-os conforme a necessidade do seu projeto para obter casos de teste mais precisos e relevantes.

