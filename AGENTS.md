# Cota Fácil — referência do projeto

## Formato numérico

- Regra oficial: **formato brasileiro (pt-BR)**.
- Separador decimal: vírgula. Separador de milhar: ponto. Exemplo: `1.234,56`.
- Não exibir nem interpretar o formato americano (`1,234.56`).
- Um ponto isolado digitado no teclado físico é apenas um atalho de entrada:
  ele é normalizado para vírgula e a saída continua em pt-BR.
- Implementação: `src/formato.js`. Cobertura: `tests/formato.test.js`.
