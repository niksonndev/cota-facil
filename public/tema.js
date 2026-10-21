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

  var cor = tema === 'claro' ? '#f5f7fb' : '#0f1115';
  var meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', cor);
} catch (e) {
  // localStorage indisponível (modo privado): segue com o tema padrão
}
