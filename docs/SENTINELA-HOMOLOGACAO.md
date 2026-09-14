# Sentinela fiscal de homologação

## O que ela prova

A sentinela executa uma única tarefa de arquivo no ambiente **NFP-e TESTES**,
confirma a autorização pelo XML e verifica que foram baixados exatamente um XML
autorizado e um DANFE PDF novo. Cada execução usa uma pasta vazia e produz um
relatório JSON sanitizado em `worker/logs`.

Ela cobre hoje:

```text
credenciais fiscais → login → NFP-e TESTES → preenchimento → emissão de teste
                    → autorização → XML + DANFE → validação dos documentos
```

Ela ainda não certifica Web, fila PostgreSQL nem Supabase Storage. Essas camadas
dependem de concluir o ambiente isolado descrito em `HOMOLOGACAO.md`; não se deve
usar o banco de produção para simular esse ensaio.

## Proteções

- só executa com a confirmação literal `--confirmar-emissao-de-teste`;
- força `AMBIENTE_EMISSAO=teste` e desliga produção fiscal;
- ignora flags de produção herdadas do terminal;
- desliga fila de banco, Storage, recuperação, cancelamento e impressão;
- limita a uma tarefa, um cliente e concorrência 1;
- não agenda nem mantém o Worker em execução;
- não inclui chave, protocolo, credenciais ou conteúdo fiscal no relatório;
- não aceita documentos de uma execução anterior como sucesso.

## Preparação única

Na pasta `worker`, crie a `.venv` e instale as dependências caso ainda não
existam:

```powershell
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
.\.venv\Scripts\python.exe -m playwright install chromium
```

O arquivo `.env` local deve conter somente as credenciais/configuração do
cliente usado na tarefa, seguindo `.env.example`. Ele não pode ser versionado.
Copie `tarefa_real.json.template` para `tarefa_real.json`, confira os dados
fiscais fictícios de homologação e mantenha **exatamente um destino**.

## Executar conscientemente

Feche qualquer outro Worker e, na pasta `worker`, rode:

```powershell
.\.venv\Scripts\python.exe -m scripts.executar_sentinela_homologacao `
  --tarefa tarefa_real.json `
  --env-file .env `
  --confirmar-emissao-de-teste
```

O Chromium aparece para permitir acompanhamento visual, mas não exige Inspector
nem Enter. O resultado confiável é um destes marcadores:

- `SENTINELA_HOMOLOGACAO_OK`: processo, XML autorizado e PDF passaram;
- `SENTINELA_HOMOLOGACAO_FALHOU`: o Worker terminou ou os documentos falharam;
- `SENTINELA_HOMOLOGACAO_BLOQUEADA`: preparação insegura ou incompleta.

O caminho do relatório aparece na mesma linha. Não interpretar apenas a abertura
do navegador ou o clique em Emitir como sucesso.

## Próximo estágio

Completar o Supabase de QA, com papel, fila e bucket exclusivos, e então criar
um segundo ensaio que prove Web → banco QA → Worker → Receita homologação →
Storage QA. Esse estágio não deve compartilhar credenciais, tarefas ou arquivos
com produção e não deve ser agendado antes de uma execução manual saudável.
