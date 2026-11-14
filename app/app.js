/* ECL 30 Dias — logica do app */
const $ = (s, el = document) => el.querySelector(s);
const el = (tag, attrs = {}, html = '') => { const e = document.createElement(tag); Object.assign(e, attrs); if (html) e.innerHTML = html; return e; };
const HOJE = () => new Date().toISOString().slice(0, 10);
const NOMES_MODULO = { 1: 'Fundamentos', 2: 'Dados de verdade no Thor', 3: 'Transformações avançadas', 4: 'Índices e Roxie', 5: 'ECL avançado', 6: 'Produção e casos reais' };
const INTERVALOS = [0, 1, 3, 7, 15, 30]; // dias ate a proxima revisao, por caixa (Leitner)
const NOTA_MINIMA = 0.8;

let C = null; // conteudo
let P = { feito: {}, quiz: {}, cartoes: {}, diario: {}, dias: {}, livre: false, inicio: null };

/* ---------- progresso ---------- */
let salvando = null;
function salvar() {
  localStorage.setItem('ecl30', JSON.stringify(P));
  clearTimeout(salvando);
  salvando = setTimeout(() => fetch('/api/progresso', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(P) }).catch(() => {}), 400);
}
const diaDe = (n) => C.dias.find((d) => d.dia === n);
function tarefasDoDia(d) {
  return d.blocos.map((b, i) => ({ b, i })).filter(({ b }) => ['pilula', 'exercicio', 'real', 'desafio'].includes(b.tipo));
}
function diaCompleto(d) {
  const tarefas = tarefasDoDia(d).every(({ i }) => P.feito[`${d.dia}:${i}`]);
  const provas = d.blocos.map((b, i) => ({ b, i })).filter(({ b }) => b.tipo === 'quiz' || b.tipo === 'teste')
    .every(({ i }) => (P.quiz[`${d.dia}:${i}`] ?? 0) >= NOTA_MINIMA);
  return tarefas && provas;
}
const liberado = (n) => P.livre || n === 1 || !diaDe(n - 1) || diaCompleto(diaDe(n - 1));
function proximoDia() { return (C.dias.find((d) => !diaCompleto(d)) || C.dias[C.dias.length - 1] || {}).dia; }
function sequencia() {
  let n = 0; const dt = new Date();
  if (!P.dias[HOJE()]) dt.setDate(dt.getDate() - 1);
  while (P.dias[dt.toISOString().slice(0, 10)]) { n++; dt.setDate(dt.getDate() - 1); }
  return n;
}
function cartoesDevidos() {
  const hoje = HOJE(); const lista = [];
  for (const d of C.dias) d.blocos.forEach((b) => {
    if (b.tipo !== 'flashcards') return;
    b.cartoes.forEach((c, k) => {
      const id = `${d.dia}:${k}`; const st = P.cartoes[id];
      if (st && st.proxima <= hoje) lista.push({ id, dia: d.dia, ...c });
    });
  });
  return lista;
}
function ativarCartoes(d) {
  d.blocos.forEach((b) => b.tipo === 'flashcards' && b.cartoes.forEach((_, k) => {
    const id = `${d.dia}:${k}`;
    if (!P.cartoes[id]) { const dt = new Date(); dt.setDate(dt.getDate() + 1); P.cartoes[id] = { caixa: 1, proxima: dt.toISOString().slice(0, 10) }; }
  }));
}

/* ---------- rodar ECL ---------- */
function tabelaDeResultados(resultados) {
  const valor = (v) => {
    if (v === null || v === undefined) return '';
    if (typeof v !== 'object') return MD.esc(String(v));
    if (Array.isArray(v.Row)) return tabela(v.Row);
    if (Array.isArray(v.Item)) return '[' + v.Item.map((x) => MD.esc(String(x))).join(', ') + ']';
    return tabela([v]);
  };
  const tabela = (linhas) => {
    if (!linhas.length) return '<i>(vazio)</i>';
    const cols = [...new Set(linhas.flatMap((r) => Object.keys(r)))];
    let t = '<table><tr>' + cols.map((c) => `<th>${MD.esc(c)}</th>`).join('') + '</tr>';
    for (const r of linhas.slice(0, 200)) t += '<tr>' + cols.map((c) => `<td>${valor(r[c])}</td>`).join('') + '</tr>';
    return t + '</table>' + (linhas.length > 200 ? `<div class="nome">mostrando 200 de ${linhas.length} linhas</div>` : '');
  };
  let html = '';
  for (const r of resultados || []) {
    html += `<div class="nome">${MD.esc(r.nome)} — ${r.linhas.length} linha(s)</div>`;
    const l0 = r.linhas[0];
    const escalar = r.linhas.length === 1 && Object.keys(l0).length === 1 && /^Result_\d+$/.test(Object.keys(l0)[0]) && typeof Object.values(l0)[0] !== 'object';
    html += escalar ? `<div class="escalar">${MD.esc(String(Object.values(l0)[0]))}</div>` : tabela(r.linhas);
  }
  return html;
}

function montarEditor(marcador, chave, gabarito) {
  const codigoInicial = marcador.querySelector('script').textContent.replace(/\n$/, '');
  const salvo = localStorage.getItem('cod:' + chave);
  const caixa = el('div', { className: 'editor' });
  const ta = el('textarea', { spellcheck: false, value: salvo ?? codigoInicial });
  const ajustar = () => { ta.style.height = 'auto'; ta.style.height = Math.min(ta.scrollHeight + 4, 520) + 'px'; };
  ta.addEventListener('input', () => { localStorage.setItem('cod:' + chave, ta.value); ajustar(); });
  ta.addEventListener('keydown', (e) => {
    if (e.key === 'Tab') { e.preventDefault(); ta.setRangeText('  ', ta.selectionStart, ta.selectionEnd, 'end'); }
    if (e.key === 'Enter' && e.ctrlKey) { e.preventDefault(); btnRodar.click(); }
  });
  const barra = el('div', { className: 'barra' });
  const btnRodar = el('button', { className: 'forte', textContent: '▶ Rodar', title: 'Ctrl+Enter' });
  const sel = el('select', { title: 'Onde rodar' }, ['hthor', 'thor', 'roxie'].map((a) => `<option ${a === marcador.dataset.alvo ? 'selected' : ''}>${a}</option>`).join(''));
  const btnReset = el('button', { textContent: 'Restaurar', title: 'Volta ao código original' });
  const tempo = el('span', { className: 'tempo' });
  const saida = el('div', { className: 'saida' });
  barra.append(btnRodar, sel);
  let btnConferir = null;
  if (gabarito) { btnConferir = el('button', { className: 'ok', textContent: '✔ Conferir com o gabarito' }); barra.append(btnConferir); }
  const btnPub = el('button', { textContent: '⇪ Publicar no Roxie', title: 'Compila e publica este código como consulta no Roxie' });
  barra.append(btnReset, btnPub, tempo);
  caixa.append(ta, barra, saida);
  marcador.replaceWith(caixa);
  setTimeout(ajustar);

  async function executar(rota, extra) {
    btnRodar.disabled = true; if (btnConferir) btnConferir.disabled = true;
    tempo.textContent = 'compilando e rodando…'; saida.innerHTML = '';
    try {
      const r = await (await fetch(rota, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ codigo: ta.value, alvo: sel.value, ...extra }) })).json();
      tempo.innerHTML = `${(r.ms / 1000).toFixed(1)}s · ${sel.value}${r.wuid ? ` · <a href="${C.esp}/esp/files/index.html#/workunits/${r.wuid}" target="_blank" rel="noopener">${r.wuid} ↗</a>` : ''}`;
      let html = '';
      if (rota.endsWith('conferir')) {
        html += r.bateu ? '<div class="veredito sim">✔ BATEU COM O GABARITO. Próximo.</div>'
          : '<div class="veredito nao">✘ Ainda não bateu. Compare seu resultado com o esperado, ajuste e tente de novo. (Se a diferença for só a ordem das linhas, confira se o enunciado pede ordenação.)</div>';
      }
      for (const e of r.excecoes || []) html += `<div class="falha">${e.tipo === 'aviso' ? 'Aviso' : 'Erro'}${e.linha ? ` (linha ${e.linha}, coluna ${e.coluna})` : ''}: ${MD.esc(e.msg)}</div>`;
      if (r.aviso) html += `<div class="falha">${MD.esc(r.aviso)}</div>`;
      html += tabelaDeResultados(r.resultados);
      if (r.ok && !(r.resultados || []).length) html += '<i>Rodou sem erro, mas não devolveu nenhum resultado. Faltou um OUTPUT?</i>';
      if (rota.endsWith('conferir') && !r.bateu && r.esperado?.length) html += `<details><summary>Ver resultado esperado</summary>${tabelaDeResultados(r.esperado)}</details>`;
      saida.innerHTML = html;
      return r;
    } catch (e) {
      saida.innerHTML = `<div class="falha">Não consegui falar com o servidor da plataforma. Ele está aberto?</div>`;
    } finally { btnRodar.disabled = false; if (btnConferir) btnConferir.disabled = false; }
  }
  btnRodar.onclick = () => executar('/api/rodar');
  if (btnConferir) btnConferir.onclick = () => executar('/api/conferir', { gabarito });
  btnPub.onclick = async () => {
    const sugestao = (/\/\/\s*consulta:\s*(\w+)/i.exec(ta.value) || [])[1] || localStorage.getItem('pub:' + chave) || '';
    const nome = prompt('Nome da consulta no Roxie (letras, números e _):', sugestao);
    if (!nome) return;
    localStorage.setItem('pub:' + chave, nome);
    btnPub.disabled = true; tempo.textContent = 'compilando e publicando…'; saida.innerHTML = '';
    try {
      const r = await (await fetch('/api/publicar', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ codigo: ta.value, nome }) })).json();
      tempo.textContent = `${(r.ms / 1000).toFixed(1)}s`;
      let html = '';
      for (const e of r.excecoes || []) html += `<div class="falha">${e.tipo === 'aviso' ? 'Aviso' : 'Erro'}${e.linha ? ` (linha ${e.linha}, coluna ${e.coluna})` : ''}: ${MD.esc(e.msg)}</div>`;
      if (r.ok) html += `<div class="veredito sim">✔ Consulta <code>${MD.esc(nome)}</code> publicada no Roxie.</div><p><a href="${C.wsecl}/WsEcl/forms/ecl/query/roxie/${nome}" target="_blank" rel="noopener">Abrir o formulário oficial (WsECL) ↗</a></p>`;
      saida.innerHTML = html;
      if (r.ok) saida.append(testadorDeConsulta(nome, ta.value));
    } catch { saida.innerHTML = '<div class="falha">Não consegui falar com o servidor da plataforma.</div>'; }
    btnPub.disabled = false;
  };
  btnReset.onclick = () => { ta.value = codigoInicial; localStorage.removeItem('cod:' + chave); ajustar(); };
}

// Formulário para chamar uma consulta publicada: um campo para cada STORED('...') do código.
function testadorDeConsulta(nome, codigo) {
  const campos = [...new Set([...(codigo || '').matchAll(/STORED\(\s*'([^']+)'/gi)].map((m) => m[1]))];
  const caixa = el('div', { className: 'testador' }, `<div class="nome">Testar a consulta <b>${MD.esc(nome)}</b> (é isso que um sistema cliente faria por HTTP)</div>`);
  const form = el('div', { className: 'barra' });
  const entradas = campos.map((c) => { const i = el('input', { placeholder: c, title: c }); form.append(i); return [c, i]; });
  const btn = el('button', { className: 'forte', textContent: 'Chamar' });
  const info = el('span', { className: 'tempo' });
  const out = el('div');
  form.append(btn, info); caixa.append(form, out);
  btn.onclick = async () => {
    btn.disabled = true; info.textContent = 'chamando…';
    const parametros = Object.fromEntries(entradas.filter(([, i]) => i.value !== '').map(([c, i]) => [c, i.value]));
    try {
      const r = await (await fetch('/api/consulta', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ nome, parametros }) })).json();
      info.textContent = `respondeu em ${r.ms} ms${r.tentativas > 1 ? ` (na ${r.tentativas}ª tentativa)` : ''}`;
      let html = r.url ? `<div class="nome">${MD.esc(r.url)}</div>` : '';
      for (const e of r.excecoes || []) html += `<div class="falha">Erro: ${MD.esc(e.msg)}</div>`;
      out.innerHTML = html + tabelaDeResultados(r.resultados);
    } catch { out.innerHTML = '<div class="falha">Falha ao chamar.</div>'; }
    btn.disabled = false;
  };
  entradas.forEach(([, i]) => i.addEventListener('keydown', (e) => { if (e.key === 'Enter') btn.click(); }));
  return caixa;
}

function primeiroEcl(md) {
  // primeiro bloco executavel do gabarito (ignora os marcados como nao-rodar)
  for (const m of (md || '').matchAll(/```ecl([^\n]*)\n([\s\S]*?)```/g)) if (!m[1].includes('nao-rodar')) return m[2];
  return '';
}
function ativarEditores(raiz, prefixo, gabarito) {
  raiz.querySelectorAll('[data-ecl]').forEach((m, k) => montarEditor(m, `${prefixo}:${k}`, k === 0 ? gabarito : ''));
}

/* ---------- telas ---------- */
function lateral(atual) {
  const lat = $('#lateral'); lat.innerHTML = '';
  let mod = 0;
  for (const d of C.dias) {
    if (d.modulo !== mod) { mod = d.modulo; lat.append(el('h4', {}, `Módulo ${mod} · ${NOMES_MODULO[mod] || ''}`)); }
    const a = el('a', { href: `#/dia/${d.dia}` }, `<span class="n">${diaCompleto(d) ? '✔' : String(d.dia).padStart(2, '0')}</span><span>${MD.esc(d.titulo)}</span>`);
    if (d.dia === atual) a.classList.add('atual');
    if (diaCompleto(d)) a.classList.add('feito'); else if (!liberado(d.dia)) a.classList.add('trancado');
    lat.append(a);
  }
  const n = cartoesDevidos().length; $('#devidos').textContent = n ? n : '';
}

function telaPainel() {
  const m = $('#principal'); const feitos = C.dias.filter(diaCompleto).length; const prox = proximoDia();
  const frases = ['Ninguém vem te salvar. Abre o editor.', 'Você está a 40% do que pode. O resto está depois do desconforto.', 'Motivação é lixo. Disciplina fica.', 'O exercício que você quer pular é o que você mais precisa.', 'Quem você vai ser quando ninguém estiver olhando seu workunit?'];
  m.innerHTML = `<h1>Painel de guerra</h1><p class="sub">${frases[new Date().getDate() % frases.length]}</p>
    <div class="grade">
      <div class="cartao-num"><b>${feitos}/${C.dias.length}</b><span>dias vencidos</span></div>
      <div class="cartao-num"><b>${sequencia()}</b><span>dias seguidos</span></div>
      <div class="cartao-num"><b>${cartoesDevidos().length}</b><span>cartões para revisar hoje</span></div>
      <div class="cartao-num"><b>${Object.keys(P.feito).length}</b><span>tarefas concluídas (pote de biscoitos)</span></div>
    </div>
    <p><a class="btn" href="#/dia/${prox}"><button class="forte">Ir para o dia ${prox} →</button></a>
       ${cartoesDevidos().length ? '<a href="#/revisao"><button>Revisar cartões primeiro</button></a>' : ''}</p>
    <h2>Trilha dos 30 dias</h2><div class="trilha"></div>
    <h2>Regras da casa</h2>
    <ul>
      <li><b>Digite, não copie.</b> Todo código da aula é editável e roda de verdade no seu cluster. Mexa, quebre, conserte.</li>
      <li><b>Tente antes de olhar o gabarito.</b> Errar tentando ensina mais do que ler a resposta certa.</li>
      <li><b>${NOTA_MINIMA * 100}% no quiz libera o dia seguinte.</b> Não passou? Releia a pílula e refaça. Sem atalho.</li>
      <li><b>Revisão diária.</b> Comece o dia zerando os cartões devidos. Leva 5 minutos e é o que faz o conteúdo ficar.</li>
    </ul>
    <p><label><input type="checkbox" id="livre" ${P.livre ? 'checked' : ''}> Modo livre (destrava todos os dias — use só para consulta)</label></p>
    ${C.erros.length ? `<div class="falha">Erros no conteúdo: ${MD.esc(C.erros.join('; '))}</div>` : ''}`;
  const t = $('.trilha', m);
  for (const d of C.dias) { const a = el('a', { href: `#/dia/${d.dia}`, textContent: d.dia, title: d.titulo }); if (diaCompleto(d)) a.classList.add('feito'); else if (d.dia === prox) a.classList.add('hoje'); t.append(a); }
  $('#livre').onchange = (e) => { P.livre = e.target.checked; salvar(); lateral(); };
  lateral();
}

function telaTexto(titulo, md) {
  $('#principal').innerHTML = `<h1>${titulo}</h1><div class="md">${MD.render(md)}</div>`;
  ativarEditores($('#principal'), 'txt:' + titulo);
  lateral();
}

function blocoProva(d, i, b) {
  const caixa = el('div', { className: 'bloco ' + b.tipo });
  const ehTeste = b.tipo === 'teste';
  caixa.innerHTML = `<span class="rotulo">${ehTeste ? 'Teste de conceitos do módulo' : 'Quiz do dia'}</span>
    <h2>${ehTeste ? 'Prova: sem consulta' : 'Puxe da memória, sem olhar para cima'}</h2>
    <p class="sub">Mínimo de ${NOTA_MINIMA * 100}% para liberar o próximo dia. Melhor nota até agora: <b>${Math.round((P.quiz[`${d.dia}:${i}`] ?? 0) * 100)}%</b></p>`;
  b.perguntas.forEach((p, k) => {
    const q = el('div', { className: 'pergunta' }, `<div class="enun">${k + 1}. ${MD.render(p.pergunta).replace(/^<p>|<\/p>$/g, '')}</div>`);
    p.opcoes.forEach((o, j) => q.append(el('label', {}, `<input type="radio" name="q${i}_${k}" value="${j}"> ${MD.render(o).replace(/^<p>|<\/p>$/g, '')}`)));
    q.append(el('div', { className: 'expl' }));
    caixa.append(q);
  });
  const rod = el('div', { className: 'rodape-bloco' });
  const btn = el('button', { className: 'forte', textContent: 'Corrigir' });
  const nota = el('span', { className: 'nota' });
  btn.onclick = () => {
    let certas = 0;
    caixa.querySelectorAll('.pergunta').forEach((q, k) => {
      const p = b.perguntas[k]; const marcado = q.querySelector('input:checked');
      q.querySelectorAll('label').forEach((l, j) => { l.className = j === p.certa ? 'certa' : (marcado && +marcado.value === j ? 'errada' : ''); });
      if (marcado && +marcado.value === p.certa) certas++;
      q.querySelector('.expl').innerHTML = MD.render(p.explicacao);
    });
    const r = certas / b.perguntas.length; const id = `${d.dia}:${i}`;
    P.quiz[id] = Math.max(P.quiz[id] ?? 0, r); P.dias[HOJE()] = true;
    nota.textContent = `${certas}/${b.perguntas.length} — ${r >= NOTA_MINIMA ? 'PASSOU. Fica duro.' : 'Não passou. Volta, relê, refaz.'}`;
    nota.style.color = r >= NOTA_MINIMA ? 'var(--ok)' : 'var(--erro)';
    if (diaCompleto(d)) ativarCartoes(d);
    salvar(); lateral(d.dia);
  };
  rod.append(btn, nota); caixa.append(rod);
  return caixa;
}

function telaDia(n) {
  const d = diaDe(n); const m = $('#principal');
  if (!d) { m.innerHTML = '<h1>Dia não encontrado</h1>'; return; }
  if (!liberado(n)) {
    m.innerHTML = `<h1>Dia ${n} trancado</h1><p>Você ainda não terminou o dia ${n - 1}. Aqui não se pula etapa: cada dia usa o que o anterior ensinou.</p><p><a href="#/dia/${n - 1}"><button class="forte">Voltar para o dia ${n - 1}</button></a></p>`;
    lateral(n); return;
  }
  m.innerHTML = `<p class="sub">Módulo ${d.modulo} · ${NOMES_MODULO[d.modulo] || ''} · ${d.horas ? d.horas + 'h de foco' : ''}</p><h1>Dia ${d.dia}: ${MD.esc(d.titulo)}</h1>`;
  const ROT = { missao: 'Missão do dia', pilula: 'Pílula', exercicio: 'Exercício de fixação', real: 'Dia a dia · caso real', desafio: 'Desafio final do módulo' };
  d.blocos.forEach((b, i) => {
    const id = `${d.dia}:${i}`;
    if (b.tipo === 'quiz' || b.tipo === 'teste') { m.append(blocoProva(d, i, b)); return; }
    if (b.tipo === 'flashcards') {
      m.append(el('div', { className: 'bloco' }, `<span class="rotulo">Cartões de revisão</span><p>${b.cartoes.length} cartões deste dia entram na sua fila de <a href="#/revisao">revisão espaçada</a> quando você concluir o dia. Eles voltam em 1, 3, 7, 15 e 30 dias.</p>`));
      return;
    }
    const caixa = el('div', { className: `bloco ${b.tipo}${P.feito[id] ? ' feito' : ''}` });
    caixa.innerHTML = `<span class="rotulo">${ROT[b.tipo]}</span>${b.titulo ? `<h2>${MD.esc(b.titulo)}</h2>` : ''}<div class="md">${MD.render(b.texto)}</div>`;
    const ehPratica = ['exercicio', 'real', 'desafio'].includes(b.tipo);
    const gab = ehPratica ? primeiroEcl(b.gabarito) : '';
    if (ehPratica && !caixa.querySelector('[data-ecl]')) {
      caixa.querySelector('.md').insertAdjacentHTML('beforeend', `<div data-ecl data-alvo="hthor"><script type="text/plain">// Escreva sua solução aqui\n<\/script></div>`);
    }
    ativarEditores(caixa, id, gab);
    if (b.dica) caixa.append(el('details', {}, `<summary>Dica (só se travou por mais de 10 minutos)</summary><div class="md">${MD.render(b.dica)}</div>`));
    if (b.gabarito) {
      const det = el('details', {}, `<summary>Gabarito comentado (tente de verdade antes)</summary><div class="md"></div>`);
      det.addEventListener('toggle', () => { const alvo = det.querySelector('.md'); if (det.open && !alvo.innerHTML) { alvo.innerHTML = MD.render(b.gabarito); ativarEditores(alvo, id + ':gab'); } });
      caixa.append(det);
    }
    if (b.tipo !== 'missao') {
      const rod = el('div', { className: 'rodape-bloco' });
      const btn = el('button', { className: P.feito[id] ? 'ok' : '', textContent: P.feito[id] ? '✔ Concluído' : (b.tipo === 'pilula' ? 'Entendi, sei explicar' : 'Fiz sozinho e funcionou') });
      btn.onclick = () => {
        if (P.feito[id]) delete P.feito[id]; else { P.feito[id] = HOJE(); P.dias[HOJE()] = true; if (!P.inicio) P.inicio = HOJE(); }
        btn.className = P.feito[id] ? 'ok' : ''; btn.textContent = P.feito[id] ? '✔ Concluído' : 'Marcar como concluído';
        caixa.classList.toggle('feito', !!P.feito[id]);
        if (diaCompleto(d)) ativarCartoes(d);
        salvar(); lateral(d.dia);
      };
      rod.append(btn); caixa.append(rod);
    }
    m.append(caixa);
  });
  const diario = el('div', { className: 'bloco' }, `<span class="rotulo">Relatório pós-ação</span><h2>Explique o dia de hoje para uma criança</h2>
    <p class="sub">Técnica Feynman: escreva com suas palavras o que aprendeu, o que errou e o que vai fazer diferente amanhã. Se não consegue explicar simples, ainda não entendeu.</p>
    <textarea class="diario" placeholder="Hoje eu aprendi que…"></textarea>
    <div class="rodape-bloco">${diaDe(n + 1) ? `<a href="#/dia/${n + 1}"><button class="forte">Próximo dia →</button></a>` : ''}</div>`);
  const ta = $('textarea', diario); ta.value = P.diario[d.dia] || '';
  ta.oninput = () => { P.diario[d.dia] = ta.value; salvar(); };
  m.append(diario);
  lateral(n); window.scrollTo(0, 0);
}

function telaRevisao() {
  const m = $('#principal'); const fila = cartoesDevidos();
  m.innerHTML = `<h1>Revisão espaçada</h1><p class="sub">Responda em voz alta ANTES de virar o cartão. Acertou: o cartão demora mais para voltar. Errou: volta amanhã.</p>`;
  if (!fila.length) {
    const total = Object.keys(P.cartoes).length;
    m.append(el('p', {}, total ? 'Fila zerada por hoje. Volte amanhã.' : 'Você ainda não tem cartões. Eles aparecem quando você conclui um dia.'));
    lateral(); return;
  }
  let k = 0;
  const palco = el('div'); m.append(palco);
  const mostrar = () => {
    if (k >= fila.length) { palco.innerHTML = '<p class="nota">Fila zerada. Era isso que ninguém queria fazer — e você fez.</p>'; lateral(); return; }
    const c = fila[k];
    palco.innerHTML = `<p class="sub">Cartão ${k + 1} de ${fila.length} · dia ${c.dia}</p><div class="flash"><div><div>${MD.render(c.frente)}</div><div class="verso" hidden>${MD.render(c.verso)}</div></div></div><div class="rodape-bloco"></div>`;
    const rod = $('.rodape-bloco', palco);
    const virar = el('button', { className: 'forte', textContent: 'Virar' });
    virar.onclick = () => {
      $('.verso', palco).hidden = false; rod.innerHTML = '';
      const nota = (acertou) => {
        const st = P.cartoes[c.id]; st.caixa = acertou ? Math.min(st.caixa + 1, INTERVALOS.length - 1) : 1;
        const dt = new Date(); dt.setDate(dt.getDate() + INTERVALOS[st.caixa]); st.proxima = dt.toISOString().slice(0, 10);
        P.dias[HOJE()] = true; salvar(); k++; mostrar();
      };
      const b1 = el('button', { textContent: 'Errei' }); b1.onclick = () => nota(false);
      const b2 = el('button', { className: 'ok', textContent: 'Acertei' }); b2.onclick = () => nota(true);
      rod.append(b1, b2);
    };
    rod.append(virar);
  };
  mostrar(); lateral();
}

function rotear() {
  const h = location.hash.replace(/^#\/?/, '');
  $('#lateral').classList.remove('aberto');
  if (h.startsWith('dia/')) return telaDia(Number(h.slice(4)));
  if (h === 'ementa') return telaTexto('Ementa', C.ementa);
  if (h === 'metodo') return telaTexto('Método', C.metodo);
  if (h === 'revisao') return telaRevisao();
  telaPainel();
}

async function statusCluster() {
  const s = $('#cluster');
  try { const r = await (await fetch('/api/status')).json(); s.textContent = r.cluster ? '● cluster ligado' : '● cluster desligado'; s.className = 'cluster ' + (r.cluster ? 'on' : 'off'); }
  catch { s.textContent = '● servidor fora'; s.className = 'cluster off'; }
}

(async function iniciar() {
  C = await (await fetch('/api/conteudo')).json();
  let remoto = {};
  try { remoto = await (await fetch('/api/progresso')).json(); } catch {}
  const local = JSON.parse(localStorage.getItem('ecl30') || '{}');
  const conta = (p) => Object.keys(p.feito || {}).length + Object.keys(p.quiz || {}).length;
  P = { ...P, ...(conta(remoto) >= conta(local) ? remoto : local) };
  $('#btnMenu').onclick = () => $('#lateral').classList.toggle('aberto');
  window.addEventListener('hashchange', rotear);
  rotear(); statusCluster(); setInterval(statusCluster, 20000);
})();
