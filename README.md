# Cota Fácil

PWA instalável no Android com a cotação de:

- **Bitcoin**, inteiro (1 BTC) e em Satoshi (1 sat)
- **Dólar americano** (USD)
- **Real brasileiro** (BRL)
- **Guarani paraguaio** (PYG)

Funciona offline: guarda as últimas cotações no aparelho e mostra o horário
em que foram salvas. Fonte dos dados: API pública da Coinbase.

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
