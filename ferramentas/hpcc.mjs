// Conversa com o cluster HPCC pela API do ECL Watch (ESP). Sem dependencias.
import fs from 'node:fs';
import path from 'node:path';

export const ESP = process.env.ECL30_ESP || 'http://127.0.0.1:8010';
const ALVOS = { hthor: 'hthor', thor: 'thor', roxie: 'roxie-workunit' };

async function esp(rota, campos, timeoutMs = 60000) {
  const r = await fetch(`${ESP}/${rota}.json`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(campos),
    signal: AbortSignal.timeout(timeoutMs),
  });
  const texto = await r.text();
  try { return JSON.parse(texto); } catch { throw new Error(`ESP ${rota}: resposta inesperada (${r.status}) ${texto.slice(0, 200)}`); }
}

const xml = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// Empacota a consulta + todos os modulos da pasta ecl/ num "archive", o mesmo formato
// que o ECL IDE e a linha de comando enviam. Assim "IMPORT Treino;" funciona.
export function montarArchive(codigo, pastaEcl) {
  const modulos = [];
  const andar = (dir, nome) => {
    const attrs = [];
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (e.name.startsWith('.')) continue;
      const cheio = path.join(dir, e.name);
      if (e.isDirectory()) andar(cheio, nome ? `${nome}.${e.name}` : e.name);
      else if (nome && e.name.toLowerCase().endsWith('.ecl')) {
        const a = e.name.slice(0, -4);
        attrs.push(`<Attribute key="${a.toLowerCase()}" name="${a}" sourcePath="${nome.replaceAll('.', '/')}/${e.name}">${xml(fs.readFileSync(cheio, 'utf8'))}</Attribute>`);
      }
    }
    if (nome) modulos.push(`<Module key="${nome.toLowerCase()}" name="${nome}">${attrs.join('')}</Module>`);
  };
  if (pastaEcl && fs.existsSync(pastaEcl)) andar(pastaEcl, '');
  return `<Archive><Query originalFilename="seu_codigo.ecl">${xml(codigo)}</Query>${modulos.join('')}</Archive>`;
}

function lerExcecoes(info) {
  const lista = info?.WUInfoResponse?.Workunit?.Exceptions?.ECLException || [];
  return lista.map((e) => ({
    tipo: /error/i.test(e.Severity) ? 'erro' : /warn/i.test(e.Severity) ? 'aviso' : 'info',
    msg: e.Message, linha: e.LineNo || 0, coluna: e.Column || 0, arquivo: e.FileName || '',
  }));
}

// Fila: no maximo 2 jobs ao mesmo tempo. Cada job sobe pods de compilacao e execucao no
// Kubernetes; muitos em paralelo esgotam a memoria da VM do Docker e travam tudo.
const MAX_SIMULTANEOS = 2;
let emAndamento = 0;
const esperando = [];
// peso 1 = job comum; peso 2 = job de Roxie (compilacao mais pesada: roda sozinho)
async function naFila(fn, peso = 1) {
  while (emAndamento + peso > MAX_SIMULTANEOS) await new Promise((ok) => esperando.push(ok));
  emAndamento += peso;
  try { return await fn(); }
  finally { emAndamento -= peso; esperando.splice(0).forEach((ok) => ok()); }
}

export function rodarEcl(codigo, alvo, pastaEcl, nomeJob = 'ecl30') {
  return naFila(() => rodarEclAgora(codigo, alvo, pastaEcl, nomeJob), alvo === 'roxie' ? 2 : 1);
}

async function rodarEclAgora(codigo, alvo, pastaEcl, nomeJob) {
  const inicio = Date.now();
  const cluster = ALVOS[alvo] || 'hthor';
  const criado = await esp('WsWorkunits/WUCreateAndUpdate', { QueryText: montarArchive(codigo, pastaEcl), Jobname: nomeJob });
  const wuid = criado?.WUUpdateResponse?.Workunit?.Wuid;
  if (!wuid) throw new Error('O cluster nao aceitou o workunit: ' + JSON.stringify(criado).slice(0, 300));
  await esp('WsWorkunits/WUSubmit', { Wuid: wuid, Cluster: cluster });
  const espera = await esp('WsWorkunits/WUWaitComplete', { Wuid: wuid, Wait: 240000 }, 260000);
  const estado = espera?.WUWaitResponse?.StateID; // 3 = completou, 4 = falhou
  const info = await esp('WsWorkunits/WUInfo', { Wuid: wuid, IncludeExceptions: 1, IncludeResults: 0, IncludeGraphs: 0, IncludeSourceFiles: 0, IncludeVariables: 0, IncludeTimers: 0, IncludeDebugValues: 0, IncludeApplicationValues: 0, IncludeWorkflows: 0 });
  const excecoes = lerExcecoes(info).filter((e) => e.tipo !== 'info');
  let resultados = [];
  if (estado === 3) {
    const r = await esp('WsWorkunits/WUFullResult', { Wuid: wuid, NoRootTag: 1 });
    const res = r?.WUFullResultResponse?.Results || {};
    resultados = Object.entries(res).map(([nome, v]) => ({ nome, linhas: v?.Row || [] }));
  }
  let aviso = '';
  if (estado !== 3 && estado !== 4) aviso = `O workunit ainda nao terminou (estado ${estado}). Acompanhe no ECL Watch.`;
  return { ok: estado === 3 && !excecoes.some((e) => e.tipo === 'erro'), wuid, estado, excecoes, resultados, aviso, ms: Date.now() - inicio };
}

// So checa a sintaxe (nao executa). Usado pelo validador das aulas.
export async function checarSintaxe(codigo, pastaEcl) {
  const r = await esp('WsWorkunits/WUSyntaxCheckECL', { ECL: montarArchive(codigo, pastaEcl), Cluster: 'hthor', TimeToWait: 60000 }, 90000);
  const lista = r?.WUSyntaxCheckResponse?.Errors?.ECLException || [];
  return lista.filter((e) => /error/i.test(e.Severity) && !/could not be opened/.test(e.Message)).map((e) => `linha ${e.LineNo}, col ${e.Column}: ${e.Message}`);
}

export async function clusterVivo() {
  try { return (await fetch(`${ESP}/WsSMC/Activity.json`, { signal: AbortSignal.timeout(4000) })).ok; } catch { return false; }
}

// Compara resultados ignorando nomes de resultado e de coluna: so os valores, na ordem.
export function essencia(resultados) {
  const valores = (v) => (v && typeof v === 'object' ? Object.values(v).map(valores) : String(v).trim());
  return JSON.stringify(resultados.map((r) => r.linhas.map(valores)));
}

export const WSECL = process.env.ECL30_WSECL || 'http://127.0.0.1:8002';

// Compila para o Roxie (sem executar) e publica com o nome dado.
export function publicarRoxie(codigo, nome, pastaEcl) {
  return naFila(() => publicarRoxieAgora(codigo, nome, pastaEcl), 2);
}

async function publicarRoxieAgora(codigo, nome, pastaEcl) {
  const inicio = Date.now();
  if (!/^[A-Za-z][A-Za-z0-9_]{2,40}$/.test(nome)) throw new Error('Nome de consulta invalido: use letras, numeros e _ (3 a 40 caracteres, comecando por letra).');
  const criado = await esp('WsWorkunits/WUCreateAndUpdate', { QueryText: montarArchive(codigo, pastaEcl), Jobname: nome });
  const wuid = criado?.WUUpdateResponse?.Workunit?.Wuid;
  if (!wuid) throw new Error('O cluster nao aceitou o workunit.');
  await esp('WsWorkunits/WUUpdate', { Wuid: wuid, Action: 1 });           // 1 = so compilar
  await esp('WsWorkunits/WUSubmit', { Wuid: wuid, Cluster: 'roxie' });
  let estado = '', info = null;
  for (let i = 0; i < 120; i++) {
    info = await esp('WsWorkunits/WUInfo', { Wuid: wuid, IncludeExceptions: 1, IncludeResults: 0, IncludeGraphs: 0, IncludeSourceFiles: 0, IncludeVariables: 0, IncludeTimers: 0 });
    estado = info?.WUInfoResponse?.Workunit?.State || '';
    if (/compiled|failed|completed|aborted/.test(estado)) break;
    await new Promise((r) => setTimeout(r, 1500));
  }
  const excecoes = lerExcecoes(info).filter((e) => e.tipo !== 'info');
  if (estado !== 'compiled') return { ok: false, wuid, excecoes: excecoes.length ? excecoes : [{ tipo: 'erro', msg: 'Compilacao nao terminou (estado: ' + estado + ')', linha: 0, coluna: 0 }], resultados: [], ms: Date.now() - inicio };
  const pub = await esp('WsWorkunits/WUPublishWorkunit', { Wuid: wuid, Cluster: 'roxie', JobName: nome, Activate: 1, Wait: 60000 });
  const erro = pub?.Exceptions?.Exception?.[0]?.Message || pub?.WUPublishWorkunitResponse?.ErrorMessage;
  if (erro) return { ok: false, wuid, excecoes: [{ tipo: 'erro', msg: erro, linha: 0, coluna: 0 }], resultados: [], ms: Date.now() - inicio };
  return { ok: true, wuid, excecoes, resultados: [], publicada: nome, ms: Date.now() - inicio };
}

// Chama uma consulta publicada no Roxie, como um sistema cliente faria (HTTP GET, resposta JSON).
export async function chamarConsulta(nome, parametros) {
  const url = WSECL + '/WsEcl/submit/query/roxie/' + encodeURIComponent(nome) + '/json?' + new URLSearchParams(parametros);
  // Ate 4 tentativas de 6s: se uma replica do Roxie nao responder, a proxima tentativa cai em outra.
  let r = null, ms = 0, tentativas = 0, ultimoErro = null;
  while (!r && tentativas < 4) {
    tentativas++;
    const inicio = Date.now();
    try { r = await fetch(url, { signal: AbortSignal.timeout(6000) }); ms = Date.now() - inicio; }
    catch (e) { ultimoErro = e; }
  }
  if (!r) throw new Error('o Roxie nao respondeu em 4 tentativas (' + (ultimoErro?.message || '') + ')');
  const corpo = await r.json();
  const resp = Object.values(corpo)[0] || {};
  const res = resp.Results || {};
  const excecoes = (res.Exception || []).map((e) => ({ tipo: 'erro', msg: e.Message, linha: 0, coluna: 0 }));
  const resultados = Object.entries(res).filter(([k]) => k !== 'Exception').map(([n, v]) => ({ nome: n, linhas: v?.Row || [] }));
  return { ok: !excecoes.length, excecoes, resultados, ms, tentativas, url: url.replace('127.0.0.1', 'localhost') };
}
