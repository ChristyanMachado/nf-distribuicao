# Graphify — uso seguro no NF Distribuição

## Objetivo

O Graphify é um índice local auxiliar para localizar símbolos e relações entre
Web, migrações e Worker sem reler o repositório inteiro. Ele não substitui
`AI-CONTEXT.md`, `ARCHITECTURE.md`, `HANDOFF.md`, o código real, o diff ou os
testes.

Estado validado em 02/09/2026:

- pacote oficial `graphifyy` 0.9.50, instalado isoladamente em `.tools/graphify`;
- complemento `sql` ativo para incluir as migrações;
- extração exclusivamente local com `--code-only`;
- 140 fontes de código, 1.296 nós, 2.993 relações e 96 comunidades após a
  correção da ação de download na linha da consulta;
- estimativa interna da ferramenta: cerca de 5,7 vezes menos tokens por consulta;
- `.env`, artefatos do Worker e caminhos pessoais não apareceram na auditoria
  inicial do grafo;
- `.tools/` e `graphify-out/` são locais e ignorados pelo Git.

A estimativa de tokens pertence ao benchmark do próprio Graphify e não é uma
garantia de economia em toda tarefa. O ganho tende a ser maior em perguntas
amplas; numa edição pequena, abrir diretamente o arquivo continua mais eficiente.

### Critério de uso eficiente

Use o Graphify quando pelo menos uma condição for verdadeira:

- a mudança atravessa Web, Worker, banco, contrato ou vários módulos;
- a tarefa é de arquitetura, segurança, impacto ou investigação;
- o módulo ainda é desconhecido para quem está trabalhando;
- não está claro quais consumidores ou dependências serão afetados.

Dispense a consulta quando a alteração for pequena, localizada e os arquivos,
testes e relações relevantes já estiverem identificados. Nesse caso, `rg`, o
diff e a leitura direta custam menos. Atualize o mapa após mudanças estruturais
ou de relações; não por edição somente documental ou cosmética.

## Regras de segurança

1. Usar apenas `--code-only`. Não configurar chaves ou backends semânticos.
2. Não executar com `--no-gitignore`.
3. Não criar `.graphifyignore` sem repetir e auditar todas as exclusões de
   segurança do `.gitignore`.
4. Não versionar nem enviar `graphify-out/` inteiro. Ele é derivado, pode ficar
   obsoleto e pode carregar fragmentos do código.
5. Para handoff manual, enviar apenas a saída de uma consulta focada e os
   arquivos reais correspondentes. Nunca enviar `.env`, dados fiscais ou
   artefatos baixados.
6. Não instalar modo estrito, watch, servidor MCP ou hooks de Git nesta fase.
7. Antes de modificar código, abrir os arquivos apontados pelo grafo e validar
   linhas, tipos, contrato e testes atuais.

## Comandos nesta máquina

No PowerShell, a partir da raiz do projeto:

```powershell
# Atualização incremental local do mapa
.\.tools\graphify\Scripts\graphify.exe extract . --code-only --max-workers 4
.\.tools\graphify\Scripts\graphify.exe cluster-only . --no-label

# Consultas com orçamento pequeno de contexto
.\.tools\graphify\Scripts\graphify.exe query "como a tarefa vai do banco ao Worker" --budget 1200
.\.tools\graphify\Scripts\graphify.exe explain "FontePostgresTarefas"
.\.tools\graphify\Scripts\graphify.exe path "FontePostgresTarefas" "executar_emissao_homologacao()" --undirected
```

Reconstrução completa só é necessária após mudança de parser ou suspeita de
índice inconsistente:

```powershell
.\.tools\graphify\Scripts\graphify.exe extract . --code-only --force --max-workers 4
.\.tools\graphify\Scripts\graphify.exe cluster-only . --no-label
```

## Instalação em outra máquina

Preferir um ambiente isolado e manter a versão validada:

```powershell
python -m venv .tools\graphify
.\.tools\graphify\Scripts\python.exe -m pip install "graphifyy[sql]==0.9.50"
```

Depois, gerar o mapa com os comandos da seção anterior. A ferramenta oficial é
`graphifyy` com dois `y`; o comando instalado se chama `graphify`.

## Fluxo recomendado para Codex e Claude

1. Ler os quatro documentos obrigatórios do projeto.
2. Aplicar o critério acima. Quando houver benefício, consultar o grafo com uma
   busca focada e orçamento entre 800 e 2.000 tokens.
3. Abrir somente os arquivos e testes apontados pela consulta.
4. Conferir `git status` e `git diff` antes de editar.
5. Implementar, testar e atualizar o `HANDOFF.md`.
6. Atualizar o mapa apenas depois de uma alteração coerente estar validada.

Para uma revisão manual pelo Claude sem acesso ao repositório, enviar:

- hash/branch atual;
- documentos obrigatórios;
- saída curta da consulta Graphify relevante;
- arquivos reais que serão revisados;
- diff e resultados dos testes.

O `GRAPH_REPORT.md` pode ajudar numa primeira visão arquitetural, mas uma consulta
focada costuma economizar mais tokens e reduz a chance de contexto irrelevante.
