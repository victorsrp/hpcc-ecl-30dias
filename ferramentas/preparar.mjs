// Prepara o cluster para o curso. Pode rodar quantas vezes quiser.
//  1) envia os arquivos de dados/ para a landing zone (dropzone)
//  2) faz o spray para ~ecl30::raw::*
//  3) constroi os arquivos base (~ecl30::base::*) e os indices (~ecl30::key::*)
//  4) publica no Roxie a consulta de apoio ecl30_resumo_pessoa
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { rodarEcl, publicarRoxie, ESP } from './hpcc.mjs';

const RAIZ = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const DADOS = path.join(RAIZ, 'dados');
const PASTA_ECL = path.join(RAIZ, 'ecl');
const DROPZONE = '/var/lib/HPCCSystems/dropzone';
// [arquivo na landing zone, nome logico, separador]
const ARQUIVOS = [
  ['pessoas.csv', 'pessoas', ''],
  ['veiculos.csv', 'veiculos', ''],
  ['sinistros.csv', 'sinistros', ''],
  ['transacoes.csv', 'transacoes', ''],
  ['parceiro.txt', 'parceiro', '|'],     // fonte nova do dia 30
];

for (const [arquivo] of ARQUIVOS) {
  const form = new FormData();
  form.append('UploadedFiles[]', new Blob([fs.readFileSync(path.join(DADOS, arquivo))]), arquivo);
  const r = await fetch(`${ESP}/FileSpray/UploadFile.json?upload_&rawxml_=1&DropZoneName=mydropzone&NetAddress=localhost&OS=2&Path=${DROPZONE}/`, { method: 'POST', body: form });
  console.log(`landing zone <- ${arquivo}: ${/Success/.test(await r.text()) ? 'ok' : 'FALHOU'}`);
}

const sprays = ARQUIVOS.map(([arquivo, nome, sep]) =>
  `STD.File.SprayDelimited(sourcePlane := 'mydropzone', sourcePath := '${DROPZONE}/${arquivo}',${sep ? ` sourceCsvSeparate := '${sep}',` : ''}
    destinationGroup := 'data', destinationLogicalName := '~ecl30::raw::${nome}', allowOverwrite := TRUE)`);

// Os indices so sao construidos se ainda nao existirem: depois que uma consulta publicada
// no Roxie passa a usa-los, o Roxie mantem os arquivos travados e um BUILD com OVERWRITE falha.
// (Em producao isso se resolve com nomes datados e superkeys: dias 14 e 19.)
const ecl = `IMPORT STD, Treino;
SEQUENTIAL(
  ${sprays.join(',\n  ')},
  Treino.ConstruirBase,
  IF(NOT STD.File.FileExists('~ecl30::key::veiculo_pessoa'), Treino.Chaves.Construir),
  OUTPUT(COUNT(Treino.Arquivos.Pessoas),   NAMED('Pessoas')),
  OUTPUT(COUNT(Treino.Arquivos.Sinistros), NAMED('Sinistros')),
  OUTPUT(COUNT(Treino.Arquivos.Entidades), NAMED('Entidades'))
);`;

const r = await rodarEcl(ecl, 'thor', PASTA_ECL, 'ecl30_preparar');
if (!r.ok) { console.log('FALHA ao preparar os dados: ' + JSON.stringify(r.excecoes)); process.exit(1); }
console.log('Arquivos e indices do curso prontos: ' + r.resultados.filter((x) => x.linhas.length).map((x) => `${x.nome}=${Object.values(x.linhas[0])[0]}`).join(', '));

const pub = await publicarRoxie(fs.readFileSync(path.join(RAIZ, 'ferramentas', 'consulta-resumo.ecl'), 'utf8'), 'ecl30_resumo_pessoa', PASTA_ECL);
console.log(pub.ok ? 'Consulta ecl30_resumo_pessoa publicada no Roxie.' : 'AVISO: nao consegui publicar a consulta de apoio: ' + JSON.stringify(pub.excecoes));
process.exit(0);
