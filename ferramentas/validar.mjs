// Confere TODOS os blocos ```ecl das aulas no cluster.
// Uso:  node ferramentas/validar.mjs            (sintaxe, todos os dias)
//       node ferramentas/validar.mjs 7 8        (so os dias 7 e 8)
//       node ferramentas/validar.mjs --rodar 7  (executa de verdade todos os blocos do dia 7)
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { lerConteudo, blocosEcl } from './conteudo.mjs';
import { checarSintaxe, rodarEcl } from './hpcc.mjs';

const RAIZ = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const PASTA_ECL = path.join(RAIZ, 'ecl');
const args = process.argv.slice(2);
const rodar = args.includes('--rodar');
const filtro = args.filter((a) => /^\d+$/.test(a)).map(Number);

const { dias, erros } = lerConteudo(path.join(RAIZ, 'conteudo'));
if (erros.length) console.log('ERROS DE FORMATO:', erros);

const itens = [];
for (const d of dias) {
  if (filtro.length && !filtro.includes(d.dia)) continue;
  d.blocos.forEach((b) => {
    const ehPratica = ['exercicio', 'real', 'desafio'].includes(b.tipo);
    for (const [onde, md] of [['texto', b.texto], ['dica', b.dica], ['gabarito', b.gabarito]]) {
      if (ehPratica && onde !== 'gabarito' && !args.includes('--tudo')) continue; // enunciado traz codigo incompleto de proposito
      blocosEcl(md).forEach((bl, k) => {
        if (bl.opcoes.includes('nao-rodar') || bl.opcoes.includes('sem-validar')) return;
        // blocos de Roxie sao validados no hthor: mesmo codigo, sem a carga de compilar para o Roxie
        const alvo = bl.opcoes.includes('thor') && !bl.opcoes.includes('hthor') ? 'thor' : 'hthor';
        itens.push({ dia: d.dia, titulo: `${b.titulo || b.tipo} (${onde} ${k + 1})`, codigo: bl.codigo, alvo, espera_erro: bl.opcoes.includes('erro') });
      });
    }
  });
  if (!d.blocos.some((b) => b.tipo === 'quiz' || b.tipo === 'teste')) console.log(`AVISO: dia ${d.dia} sem quiz`);
  for (const b of d.blocos) if (b.perguntas) for (const p of b.perguntas) if (p.certa < 0 || p.opcoes.length < 2) console.log(`AVISO: dia ${d.dia} pergunta sem resposta certa: ${p.pergunta}`);
}

let falhas = 0;
async function checar(it) {
  let problemas;
  try {
    if (rodar) {
      const r = await rodarEcl(it.codigo, it.alvo, PASTA_ECL, 'ecl30_validar');
      problemas = r.ok ? [] : r.excecoes.filter((e) => e.tipo === 'erro').map((e) => `linha ${e.linha}, col ${e.coluna}: ${e.msg}`);
      if (!r.ok && !problemas.length) problemas = [r.aviso || `estado ${r.estado}`];
    } else problemas = await checarSintaxe(it.codigo, PASTA_ECL);
  } catch (e) { problemas = [String(e.message || e)]; }
  if (it.espera_erro) problemas = problemas.length ? [] : ['deveria dar erro (bloco marcado "erro") e nao deu'];
  if (problemas.length) { falhas++; console.log(`\n✘ dia ${it.dia} · ${it.titulo}\n   ${problemas.join('\n   ')}`); }
}

// roda em paralelo, 4 por vez
const fila = [...itens];
await Promise.all(Array.from({ length: 2 }, async () => { while (fila.length) await checar(fila.shift()); }));
console.log(`\n${rodar ? 'Execucao' : 'Sintaxe'}: ${itens.length - falhas}/${itens.length} blocos OK`);
process.exit(falhas ? 1 : 0);
