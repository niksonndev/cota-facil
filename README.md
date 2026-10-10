# Cota Fácil

PWA instalável no Android com a cotação de:

- **Bitcoin**, inteiro (1 BTC) e em Satoshi (1 sat)
- **Dólar americano** (USD)
- **Real brasileiro** (BRL)
- **Guarani paraguaio** (PYG)

Funciona offline: guarda as últimas cotações no aparelho e mostra o horário
em que foram salvas. Fonte dos dados: API pública da Coinbase.

## Por que isso existe

Fiz esta versão para uso pessoal. Com IA, um app desses sai em pouco tempo e
custa quase nada para manter, e mesmo assim ainda tem serviço por aí cobrando
ou enchendo a tela de anúncio para mostrar uma cotação. Isso já deveria ter
caído a zero faz tempo, do mesmo jeito que uma calculadora custa zero reais.
Então aqui está a minha: sem anúncio, sem login, sem cobrança.

## Como funciona

Você digita em qualquer moeda e as outras mudam na hora. O Bitcoin aparece
inteiro (BTC) e em Satoshi (SATS). O teclado numérico fica sempre aberto,
então no celular o teclado do sistema não atrapalha.

## Rodar local

```bash
pnpm install
pnpm dev        # desenvolvimento
pnpm build      # gera o dist/ pronto para publicar
pnpm check-pwa  # valida manifest, ícones e precache do service worker
```

## Deploy

Push na `main` publica no GitHub Pages pelo workflow em
`.github/workflows/ci.yml` (build + validação do PWA + deploy).
