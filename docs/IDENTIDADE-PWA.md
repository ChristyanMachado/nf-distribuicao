# Identidade visual e instalação móvel

## Fonte da marca

A marca Graalyst usa o símbolo de guindaste e caixa. A versão de aplicação é
uma releitura limpa do arquivo visual original: fundo transparente, uma única
cor azul-acinzentada e sem sombra, vinheta ou moldura. Ela é adequada para
superfícies claras da interface e para tamanhos pequenos.

Os ativos publicados estão em `web/public/brand/`:

- `graalyst-mark-v1.png`: marca base transparente usada na navegação e login;
- `graalyst-favicon-v1.png`: favicon PNG de 64 px;
- `graalyst-icon-192-v1.png`: ícone Android/PWA;
- `graalyst-icon-512-v1.png`: ícone de instalação em alta resolução;
- `graalyst-apple-icon-v1.png`: ícone Apple de 180 px.

`web/src/app/favicon.ico` contém as representações 16, 32 e 48 px da mesma
marca, para navegadores que ainda preferem o formato ICO.

## Manifest e cache

`web/src/app/manifest.ts` define o aplicativo instalável (`standalone`),
nome, cores e ícones. O `layout.tsx` aponta para o manifest com uma versão de
URL e para os arquivos de marca com nomes versionados. Isso evita que o Chrome
reaproveite o JPG/favicons antigos depois do deploy.

Não há service worker, Workbox ou registro de cache próprio neste projeto.
Logo, não existe cache de aplicação a limpar; a atualização depende apenas do
novo deploy e do cache normal do navegador.

## Validação após publicar

1. Abrir o domínio em uma nova aba e confirmar que a aba mostra a marca
   Graalyst, não o ícone da Vercel.
2. Em um celular, remover o atalho/instalação antiga, abrir o site novamente e
   instalar pelo menu do Chrome.
3. Confirmar que o ícone instalado é a marca limpa e que abre em modo de
   aplicativo.

Se o navegador mantiver um ícone antigo, fechar todas as abas do domínio e
limpar somente os dados do site no Chrome antes de instalar novamente.
