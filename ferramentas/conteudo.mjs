// Le os arquivos conteudo/diaNN.md e transforma em objetos para o app.
//
// Formato de cada dia:
//   ---
//   dia: 1
//   modulo: 1
//   titulo: ...
//   horas: 3
//   ---
//   # MISSAO                 texto de abertura
//   # PILULA: Titulo         aula curta
//   # EXERCICIO: Titulo      fixacao (com "## DICA" e "## GABARITO" opcionais)
//   # REAL: Titulo           exercicio do dia a dia
//   # DESAFIO: Titulo        desafio final de modulo
//   # QUIZ / # TESTE         "? pergunta", "- errada", "+ certa", "! explicacao"
//   # FLASHCARDS             "Q: ..." / "A: ..."
import fs from 'node:fs';
import path from 'node:path';

const TIPOS = { MISSAO: 'missao', PILULA: 'pilula', EXERCICIO: 'exercicio', REAL: 'real', DESAFIO: 'desafio', QUIZ: 'quiz', TESTE: 'teste', FLASHCARDS: 'flashcards' };

function cortarSecoes(texto, nivel) {
  // Corta por cabecalhos "# " (nivel 1) ou "## " (nivel 2), ignorando blocos de codigo.
  const marca = '#'.repeat(nivel) + ' ';
  const secoes = [];
  let atual = { cabecalho: '', linhas: [] };
  let emCodigo = false;
  for (const linha of texto.split(/\r?\n/)) {
    if (linha.startsWith('```')) emCodigo = !emCodigo;
    if (!emCodigo && linha.startsWith(marca)) {
      secoes.push(atual);
      atual = { cabecalho: linha.slice(marca.length).trim(), linhas: [] };
    } else atual.linhas.push(linha);
  }
  secoes.push(atual);
  return secoes.map((s) => ({ cabecalho: s.cabecalho, corpo: s.linhas.join('\n').trim() }));
}

function lerPerguntas(corpo) {
  const perguntas = [];
  let p = null;
  for (const bruta of corpo.split(/\r?\n/)) {
    const linha = bruta.trim();
    if (linha.startsWith('? ')) { p = { pergunta: linha.slice(2), opcoes: [], certa: -1, explicacao: '' }; perguntas.push(p); }
    else if (p && (linha.startsWith('- ') || linha.startsWith('+ '))) {
      if (linha[0] === '+') p.certa = p.opcoes.length;
      p.opcoes.push(linha.slice(2));
    } else if (p && linha.startsWith('! ')) p.explicacao = linha.slice(2);
  }
  return perguntas;
}

function lerCartoes(corpo) {
  const cartoes = [];
  let c = null;
  for (const bruta of corpo.split(/\r?\n/)) {
    const linha = bruta.trim();
    if (linha.startsWith('Q: ')) { c = { frente: linha.slice(3), verso: '' }; cartoes.push(c); }
    else if (c && linha.startsWith('A: ')) c.verso = linha.slice(3);
  }
  return cartoes;
}

export function lerDia(texto, arquivo = '') {
  const m = texto.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
  if (!m) throw new Error(`${arquivo}: falta o cabecalho ---`);
  const meta = {};
  for (const linha of m[1].split(/\r?\n/)) {
    const i = linha.indexOf(':');
    if (i > 0) meta[linha.slice(0, i).trim()] = linha.slice(i + 1).trim();
  }
  const dia = { dia: Number(meta.dia), modulo: Number(meta.modulo), titulo: meta.titulo || '', horas: meta.horas || '', blocos: [] };
  for (const s of cortarSecoes(m[2], 1)) {
    if (!s.cabecalho) continue;
    const i = s.cabecalho.indexOf(':');
    const chave = (i > 0 ? s.cabecalho.slice(0, i) : s.cabecalho).trim().toUpperCase();
    const titulo = i > 0 ? s.cabecalho.slice(i + 1).trim() : '';
    const tipo = TIPOS[chave];
    if (!tipo) throw new Error(`${arquivo}: secao desconhecida "${s.cabecalho}"`);
    const bloco = { tipo, titulo };
    if (tipo === 'quiz' || tipo === 'teste') bloco.perguntas = lerPerguntas(s.corpo);
    else if (tipo === 'flashcards') bloco.cartoes = lerCartoes(s.corpo);
    else if (tipo === 'exercicio' || tipo === 'real' || tipo === 'desafio') {
      const sub = cortarSecoes(s.corpo, 2);
      bloco.texto = sub[0].corpo;
      for (const x of sub.slice(1)) {
        const nome = x.cabecalho.toUpperCase();
        if (nome.startsWith('DICA')) bloco.dica = x.corpo;
        else if (nome.startsWith('GABARITO')) bloco.gabarito = x.corpo;
        else bloco.texto += `\n\n## ${x.cabecalho}\n${x.corpo}`;
      }
    } else bloco.texto = s.corpo;
    dia.blocos.push(bloco);
  }
  return dia;
}

export function lerConteudo(pasta) {
  const dias = [];
  const erros = [];
  for (const nome of fs.readdirSync(pasta).filter((n) => /^dia\d+\.md$/.test(n)).sort()) {
    try { dias.push(lerDia(fs.readFileSync(path.join(pasta, nome), 'utf8'), nome)); }
    catch (e) { erros.push(String(e.message)); }
  }
  const extra = (n) => (fs.existsSync(path.join(pasta, n)) ? fs.readFileSync(path.join(pasta, n), 'utf8') : '');
  return { dias, erros, ementa: extra('ementa.md'), metodo: extra('metodo.md') };
}

// Devolve todos os blocos de codigo ```ecl de um texto markdown.
export function blocosEcl(md) {
  const blocos = [];
  const re = /```ecl([^\n]*)\n([\s\S]*?)```/g;
  let m;
  while ((m = re.exec(md || ''))) blocos.push({ opcoes: m[1].trim(), codigo: m[2] });
  return blocos;
}
