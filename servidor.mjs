// Servidor da plataforma ECL 30 Dias. Sem dependencias: so Node.
// - serve o app (pasta app/)
// - le as aulas (pasta conteudo/*.md) e entrega em JSON
// - envia codigo ECL para o cluster HPCC local (API do ECL Watch) e devolve o resultado
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { lerConteudo } from './ferramentas/conteudo.mjs';
import { rodarEcl, clusterVivo, essencia, publicarRoxie, chamarConsulta, ESP, WSECL } from './ferramentas/hpcc.mjs';

const RAIZ = path.dirname(fileURLToPath(import.meta.url));
const PORTA = Number(process.env.PORTA || 3030);
const PASTA_ECL = path.join(RAIZ, 'ecl');
const ARQ_PROGRESSO = path.join(RAIZ, 'progresso.json');
const TIPOS = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.json': 'application/json' };

const cacheGabarito = new Map();

async function rodarSeguro(codigo, alvo) {
  try { return await rodarEcl(String(codigo || ''), alvo, PASTA_ECL); }
  catch (e) {
    const fora = /fetch failed|ECONNREFUSED|timeout/i.test(String(e.message || e));
    return { ok: false, excecoes: [{ tipo: 'erro', msg: fora ? 'Nao consegui falar com o cluster HPCC. Ele esta ligado? Rode o iniciar.bat de novo.' : String(e.message || e), linha: 0, coluna: 0 }], resultados: [], ms: 0 };
  }
}

function lerCorpo(req) {
  return new Promise((resolve, reject) => {
    let dados = '';
    req.on('data', (c) => { dados += c; if (dados.length > 2e6) reject(new Error('grande demais')); });
    req.on('end', () => { try { resolve(dados ? JSON.parse(dados) : {}); } catch (e) { reject(e); } });
  });
}

function json(res, obj, status = 200) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  res.end(JSON.stringify(obj));
}

const servidor = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  try {
    if (url.pathname === '/api/conteudo') return json(res, { ...lerConteudo(path.join(RAIZ, 'conteudo')), esp: ESP.replace('127.0.0.1', 'localhost'), wsecl: WSECL.replace('127.0.0.1', 'localhost') });
    if (url.pathname === '/api/status') return json(res, { cluster: await clusterVivo() });
    if (url.pathname === '/api/progresso' && req.method === 'GET') {
      return json(res, fs.existsSync(ARQ_PROGRESSO) ? JSON.parse(fs.readFileSync(ARQ_PROGRESSO, 'utf8')) : {});
    }
    if (url.pathname === '/api/progresso' && req.method === 'POST') {
      fs.writeFileSync(ARQ_PROGRESSO, JSON.stringify(await lerCorpo(req), null, 1));
      return json(res, { ok: true });
    }
    if (url.pathname === '/api/rodar' && req.method === 'POST') {
      const { codigo, alvo } = await lerCorpo(req);
      return json(res, await rodarSeguro(codigo, alvo));
    }
    if (url.pathname === '/api/publicar' && req.method === 'POST') {
      const { codigo, nome } = await lerCorpo(req);
      try { return json(res, await publicarRoxie(String(codigo || ''), String(nome || ''), PASTA_ECL)); }
      catch (e) { return json(res, { ok: false, excecoes: [{ tipo: 'erro', msg: String(e.message || e), linha: 0, coluna: 0 }], resultados: [], ms: 0 }); }
    }
    if (url.pathname === '/api/consulta' && req.method === 'POST') {
      const { nome, parametros } = await lerCorpo(req);
      try { return json(res, await chamarConsulta(String(nome || ''), parametros || {})); }
      catch (e) { return json(res, { ok: false, excecoes: [{ tipo: 'erro', msg: 'Nao consegui chamar a consulta: ' + String(e.message || e), linha: 0, coluna: 0 }], resultados: [], ms: 0 }); }
    }
    if (url.pathname === '/api/conferir' && req.method === 'POST') {
      const { codigo, gabarito, alvo } = await lerCorpo(req);
      const chave = crypto.createHash('sha1').update(alvo + gabarito).digest('hex');
      // Um de cada vez: os dois podem gravar o mesmo arquivo logico.
      const meu = await rodarSeguro(codigo, alvo);
      const certo = cacheGabarito.has(chave) ? cacheGabarito.get(chave) : await rodarSeguro(gabarito, alvo);
      if (certo.ok) cacheGabarito.set(chave, certo);
      return json(res, { ...meu, bateu: meu.ok && certo.ok && essencia(meu.resultados) === essencia(certo.resultados), esperado: certo.resultados });
    }
    // arquivos do app
    const rel = url.pathname === '/' ? 'index.html' : decodeURIComponent(url.pathname.slice(1));
    const arq = path.join(RAIZ, 'app', rel);
    if (!arq.startsWith(path.join(RAIZ, 'app')) || !fs.existsSync(arq) || fs.statSync(arq).isDirectory()) {
      res.writeHead(404); return res.end('nao encontrado');
    }
    res.writeHead(200, { 'content-type': TIPOS[path.extname(arq)] || 'application/octet-stream', 'cache-control': 'no-store' });
    fs.createReadStream(arq).pipe(res);
  } catch (e) {
    json(res, { erro: String(e.message || e) }, 500);
  }
});

servidor.listen(PORTA, '127.0.0.1', () => {
  console.log(`\n  ECL 30 DIAS no ar: http://localhost:${PORTA}\n  Cluster HPCC: ${ESP}\n  (deixe esta janela aberta enquanto estuda; Ctrl+C encerra)\n`);
});
