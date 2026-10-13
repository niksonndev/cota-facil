/*
 * Aplica o tema salvo ANTES da primeira pintura.
 *
 * Precisa ser um arquivo próprio (não um <script> inline no HTML): a CSP do
 * index.html usa `script-src 'self'`, então script inline é bloqueado pelo
 * navegador e o tema salvo só valeria depois do app carregar, o que faz a tela
 * piscar no tema errado. Este arquivo também entra no precache do service
 * worker, então funciona offline.
 */
try {
  var tema = localStorage.getItem('cotafacil:tema');
  if (tema) document.documentElement.setAttribute('data-tema', tema);
} catch (e) {
  // localStorage indisponível (modo privado): segue com o tema padrão
}
