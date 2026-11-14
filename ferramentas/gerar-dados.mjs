// Gera os arquivos CSV de treino em dados/. Deterministico: roda de novo, sai igual.
// Dados 100% ficticios, no formato tipico de registros publicos e seguros dos EUA.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SAIDA = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'dados');
fs.mkdirSync(SAIDA, { recursive: true });

let semente = 20261112;
const rnd = () => { semente = (semente * 1664525 + 1013904223) % 4294967296; return semente / 4294967296; };
const int = (a, b) => a + Math.floor(rnd() * (b - a + 1));
const um = (lista) => lista[Math.floor(rnd() * lista.length)];
const pad = (n, t) => String(n).padStart(t, '0');

const NOMES = [['James', 'Jim'], ['Robert', 'Bob'], ['John', 'Johnny'], ['Michael', 'Mike'], ['William', 'Bill'], ['David', 'Dave'], ['Richard', 'Rick'], ['Joseph', 'Joe'], ['Thomas', 'Tom'], ['Charles', 'Chuck'],
  ['Mary', 'Mary'], ['Patricia', 'Pat'], ['Jennifer', 'Jen'], ['Linda', 'Linda'], ['Elizabeth', 'Liz'], ['Barbara', 'Barb'], ['Susan', 'Sue'], ['Jessica', 'Jess'], ['Sarah', 'Sarah'], ['Karen', 'Karen'],
  ['Daniel', 'Dan'], ['Matthew', 'Matt'], ['Anthony', 'Tony'], ['Margaret', 'Maggie'], ['Katherine', 'Kate'], ['Christopher', 'Chris'], ['Nancy', 'Nancy'], ['Steven', 'Steve'], ['Andrew', 'Andy'], ['Deborah', 'Debbie']];
const FEMININOS = new Set(['Mary', 'Patricia', 'Jennifer', 'Linda', 'Elizabeth', 'Barbara', 'Susan', 'Jessica', 'Sarah', 'Karen', 'Margaret', 'Katherine', 'Nancy', 'Deborah']);
const SOBRENOMES = ['Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller', 'Davis', 'Rodriguez', 'Martinez', 'Hernandez', 'Lopez', 'Gonzalez', 'Wilson', 'Anderson', 'Thomas', 'Taylor', 'Moore', 'Jackson', 'Martin', 'Lee', 'Perez', 'Thompson', 'White', 'Harris', 'Sanchez', 'Clark', 'Ramirez', 'Lewis', 'Robinson', 'Walker', 'Young', 'Allen', 'King', 'Wright', 'Scott', 'Torres', 'Nguyen', 'Hill', 'Flores'];
const CIDADES = [['Miami', 'FL', '331'], ['Orlando', 'FL', '328'], ['Tampa', 'FL', '336'], ['Boca Raton', 'FL', '334'], ['Atlanta', 'GA', '303'], ['Alpharetta', 'GA', '300'], ['Savannah', 'GA', '314'],
  ['Dallas', 'TX', '752'], ['Houston', 'TX', '770'], ['Austin', 'TX', '787'], ['New York', 'NY', '100'], ['Buffalo', 'NY', '142'], ['Dayton', 'OH', '454'], ['Columbus', 'OH', '432'],
  ['Los Angeles', 'CA', '900'], ['San Diego', 'CA', '921'], ['Chicago', 'IL', '606'], ['Phoenix', 'AZ', '850']];
const RUAS = ['Main St', 'Oak Ave', 'Maple Dr', 'Cedar Ln', 'Pine St', 'Elm St', 'Washington Blvd', 'Lake Rd', 'Hill St', 'Park Ave', 'Sunset Blvd', 'River Rd', 'Church St', 'Highland Ave', 'Peachtree St'];
const MARCAS = { Toyota: ['Corolla', 'Camry', 'RAV4'], Ford: ['F-150', 'Focus', 'Explorer'], Honda: ['Civic', 'Accord', 'CR-V'], Chevrolet: ['Silverado', 'Malibu', 'Equinox'], Nissan: ['Altima', 'Sentra', 'Rogue'], Tesla: ['Model 3', 'Model Y'] };
const TIPOS_SINISTRO = ['COLLISION', 'COLLISION', 'COLLISION', 'THEFT', 'GLASS', 'FIRE', 'INJURY', 'INJURY'];
const OFICINAS = ['QuickFix Auto', 'Sunshine Body Shop', 'Peach State Collision', 'Lone Star Repairs', 'Empire Auto Care', 'Buckeye Motors', 'Golden Gate Garage', 'Desert Auto Works'];
const CATEGORIAS = ['GROCERY', 'FUEL', 'RESTAURANT', 'ONLINE', 'TRAVEL', 'PHARMACY', 'ELECTRONICS', 'ATM'];
const LOJAS = { GROCERY: ['Publix', 'Kroger', 'Whole Foods'], FUEL: ['Shell', 'Chevron', 'BP'], RESTAURANT: ['Waffle House', 'Chipotle', 'Olive Garden'], ONLINE: ['Amazon', 'eBay', 'Etsy'], TRAVEL: ['Delta', 'Marriott', 'Hertz'], PHARMACY: ['CVS', 'Walgreens'], ELECTRONICS: ['Best Buy', 'Apple Store'], ATM: ['ATM Withdrawal'] };

const csv = (v) => (/[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
function gravar(nome, cabecalho, linhas) {
  fs.writeFileSync(path.join(SAIDA, nome), [cabecalho.join(','), ...linhas.map((l) => l.map(csv).join(','))].join('\n') + '\n');
  console.log(`${nome}: ${linhas.length} linhas`);
}
const dataAleatoria = (anoMin, anoMax) => `${int(anoMin, anoMax)}${pad(int(1, 12), 2)}${pad(int(1, 28), 2)}`;

// ---------- pessoas (com sujeira de proposito) ----------
const N_PESSOAS = 20000;
const pessoas = [];
for (let id = 1; id <= N_PESSOAS; id++) {
  const [nome] = um(NOMES);
  const [cidade, uf, cep3] = um(CIDADES);
  pessoas.push([id, nome, um(SOBRENOMES), dataAleatoria(1945, 2004), `9${pad(int(0, 99), 2)}${pad(int(10, 99), 2)}${pad(int(1, 9999), 4)}`,
    FEMININOS.has(nome) ? 'F' : 'M', `${int(1, 9999)} ${um(RUAS)}`, cidade, uf, cep3 + pad(int(1, 99), 2),
    `${int(200, 989)}${int(200, 999)}${pad(int(0, 9999), 4)}`, '']);
}
for (const p of pessoas) p[11] = `${p[1]}.${p[2]}${p[0] % 97}@example.com`.toLowerCase();

// Duplicatas "do mundo real": mesma pessoa cadastrada de novo com variacoes.
const sujas = [];
let proximoId = N_PESSOAS + 1;
for (let k = 0; k < 1800; k++) {
  const p = [...um(pessoas)];
  p[0] = proximoId++;
  const tipo = int(1, 6);
  if (tipo === 1) p[1] = (NOMES.find((n) => n[0] === p[1]) || [0, p[1]])[1];          // apelido: Robert -> Bob
  if (tipo === 2) { p[1] = p[1].toUpperCase(); p[2] = p[2].toUpperCase(); }          // caixa alta
  if (tipo === 3) p[2] = p[2].slice(0, -1) + (p[2].endsWith('s') ? 'z' : 's');       // erro de digitacao
  if (tipo === 4) p[4] = '';                                                         // SSN faltando
  if (tipo === 5) { p[1] = `  ${p[1]} `; p[7] = p[7].toLowerCase(); }                // espacos e caixa baixa
  if (tipo === 6) { const [c, uf, cep3] = um(CIDADES); p[6] = `${int(1, 9999)} ${um(RUAS)}`; p[7] = c; p[8] = uf; p[9] = cep3 + pad(int(1, 99), 2); } // mudou de endereco
  sujas.push(p);
}
const todas = [...pessoas, ...sujas].sort(() => rnd() - 0.5);
gravar('pessoas.csv', ['id', 'first_name', 'last_name', 'dob', 'ssn', 'gender', 'street', 'city', 'state', 'zip', 'phone', 'email'], todas);

// ---------- veiculos ----------
const veiculos = [];
const LETRAS = 'ABCDEFGHJKLMNPRSTUVWXYZ0123456789';
for (let k = 0; k < 15000; k++) {
  const marca = um(Object.keys(MARCAS));
  let vin = ''; for (let j = 0; j < 17; j++) vin += LETRAS[int(0, LETRAS.length - 1)];
  const dono = um(pessoas);
  veiculos.push([vin, dono[0], marca, um(MARCAS[marca]), int(2005, 2026), `${LETRAS[int(0, 22)]}${LETRAS[int(0, 22)]}${LETRAS[int(0, 22)]}${pad(int(0, 9999), 4)}`, dono[8]]);
}
gravar('veiculos.csv', ['vin', 'person_id', 'make', 'model', 'year', 'plate', 'state'], veiculos);

// ---------- sinistros de seguro (com uma quadrilha de fraude escondida) ----------
const sinistros = [];
let sid = 1;
for (let k = 0; k < 30000; k++) {
  const v = um(veiculos);
  const tipo = um(TIPOS_SINISTRO);
  const valor = tipo === 'GLASS' ? int(150, 900) : tipo === 'INJURY' ? int(2000, 60000) : int(500, 25000);
  sinistros.push([sid++, v[1], `POL${pad(v[1], 7)}`, dataAleatoria(2021, 2026), tipo, valor, v[0], um(OFICINAS), um(['PAID', 'PAID', 'PAID', 'OPEN', 'DENIED'])]);
}
// Quadrilha: 40 pessoas, sempre na mesma oficina, sinistros de lesao altos e em sequencia.
const quadrilha = pessoas.slice(500, 540);
for (const p of quadrilha) {
  for (let k = 0; k < int(4, 7); k++) {
    const v = veiculos.find((x) => x[1] === p[0]) || um(veiculos);
    sinistros.push([sid++, p[0], `POL${pad(p[0], 7)}`, `2025${pad(int(1, 12), 2)}${pad(int(1, 28), 2)}`, 'INJURY', int(38000, 49900), v[0], 'Crash Kings Auto', 'PAID']);
  }
}
gravar('sinistros.csv', ['claim_id', 'person_id', 'policy', 'claim_date', 'claim_type', 'amount', 'vin', 'repair_shop', 'status'], sinistros.sort(() => rnd() - 0.5));

// ---------- transacoes ----------
const transacoes = [];
for (let id = 1; id <= 120000; id++) {
  const p = um(pessoas);
  const cat = um(CATEGORIAS);
  const fora = rnd() < 0.03; // compra fora do estado de residencia
  const valor = cat === 'ELECTRONICS' ? int(5000, 250000) : cat === 'TRAVEL' ? int(8000, 180000) : int(300, 20000);
  transacoes.push([id, p[0], `${dataAleatoria(2026, 2026)}`, pad(int(0, 23), 2) + pad(int(0, 59), 2), (valor / 100).toFixed(2), um(LOJAS[cat]), cat, fora ? um(CIDADES)[1] : p[8]]);
}
gravar('transacoes.csv', ['txn_id', 'person_id', 'txn_date', 'txn_time', 'amount', 'merchant', 'category', 'state'], transacoes);

// ---------- arquivo de um parceiro (dia 30): outro formato, separado por |, sujo ----------
// 2.000 clientes que ja existem no cadastro (com variacoes) + 1.000 desconhecidos.
const fmtData = (d) => `${String(d).slice(4, 6)}/${String(d).slice(6, 8)}/${String(d).slice(0, 4)}`;
const fmtSsn = (s) => (s ? `${s.slice(0, 3)}-${s.slice(3, 5)}-${s.slice(5)}` : '');
const fmtFone = (f) => `(${f.slice(0, 3)}) ${f.slice(3, 6)}-${f.slice(6)}`;
const parceiro = [];
let contaParc = 1;
for (let k = 0; k < 2000; k++) {
  const p = um(pessoas);
  const v = int(1, 5);
  const nome = v === 1 ? (NOMES.find((n) => n[0] === p[1]) || [0, p[1]])[1] : p[1];
  const sobrenome = v === 2 ? p[2].toUpperCase() : p[2];
  parceiro.push([`PX${pad(contaParc++, 6)}`, `${sobrenome}, ${nome}`, fmtData(p[3]), v === 3 ? '' : fmtSsn(p[4]), fmtFone(p[10]), p[6], `${p[7]}, ${p[8]} ${p[9]}`, um(['GOLD', 'SILVER', 'BRONZE'])]);
}
for (let k = 0; k < 1000; k++) {
  const [nome] = um(NOMES); const [cidade, uf, cep3] = um(CIDADES);
  parceiro.push([`PX${pad(contaParc++, 6)}`, `${um(SOBRENOMES)}, ${nome}`, fmtData(dataAleatoria(1945, 2004)), fmtSsn(`9${pad(int(0, 99), 2)}${pad(int(10, 99), 2)}${pad(int(1, 9999), 4)}`),
    fmtFone(`${int(200, 989)}${int(200, 999)}${pad(int(0, 9999), 4)}`), `${int(1, 9999)} ${um(RUAS)}`, `${cidade}, ${uf} ${cep3}${pad(int(1, 99), 2)}`, um(['GOLD', 'SILVER', 'BRONZE'])]);
}
const linhasParc = parceiro.sort(() => rnd() - 0.5).map((l) => l.join('|'));
fs.writeFileSync(path.join(SAIDA, 'parceiro.txt'), ['ACCOUNT|FULLNAME|BIRTH|SSN|PHONE|ADDR|CITY_ST_ZIP|TIER', ...linhasParc].join('\n') + '\n');
console.log(`parceiro.txt: ${linhasParc.length} linhas`);
