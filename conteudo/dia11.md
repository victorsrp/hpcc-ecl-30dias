---
dia: 11
modulo: 3
titulo: Dados aninhados: NORMALIZE e DENORMALIZE
horas: 3
---

# MISSAO

> [goggins] Módulo 3. Aqui é onde o curso deixa de ser "SQL com outra sintaxe" e vira ECL de verdade. Hoje você aprende uma coisa que banco relacional não faz bem e que o HPCC faz como ninguém: **tabela dentro de tabela**. Vai parecer estranho. Estranho é só o nome que a gente dá para o que ainda não treinou.

**Hoje você vai:**

- Criar e consultar **datasets filhos** (child datasets).
- Montar pai + filhos com `DENORMALIZE`.
- Desmontar de volta com `NORMALIZE`.
- Transformar colunas repetidas (telefone1, telefone2, telefone3) em linhas.

# PILULA: Dataset filho: uma tabela dentro da ficha

> [crianca] A ficha do aluno tem nome e idade. Agora imagine que você **grampeia** na ficha uma listinha com os irmãos dele: um aluno tem 2 irmãos, outro tem nenhum, outro tem 5. Cada ficha carrega a sua própria listinha. Quando você pega a ficha, os irmãos vêm junto, sem precisar procurar em outro armário.

> [tecnico] Um campo de um RECORD pode ser um `DATASET(LayoutFilho)`: uma tabela inteira dentro de cada registro, com tamanho variável. Você trata o campo filho como qualquer dataset: `COUNT(pai.filhos)`, `SUM(pai.filhos, valor)`, filtro, `SORT`. E pode filtrar os **pais** olhando os filhos: `Pais(EXISTS(filhos(condição)))`.

```ecl
Layout_Sinistro := {UNSIGNED4 sinistro_id, STRING10 tipo, UNSIGNED4 valor};

Layout_Cliente := RECORD
  UNSIGNED4 id;
  STRING10  nome;
  DATASET(Layout_Sinistro) sinistros;     // tabela dentro da linha
END;

Clientes := DATASET([
  {1, 'Ana',   [{101, 'COLLISION', 8400}, {108, 'COLLISION', 1500}]},
  {2, 'Bruno', []},
  {4, 'Diego', [{102, 'INJURY', 45000}, {104, 'INJURY', 38000}, {112, 'COLLISION', 9700}]}
], Layout_Cliente);

OUTPUT(Clientes, NAMED('Aninhado'));

// Consultando os filhos
OUTPUT(TABLE(Clientes, {id, nome,
                        UNSIGNED2 qtd   := COUNT(sinistros),
                        UNSIGNED4 total := SUM(sinistros, valor),
                        UNSIGNED4 maior := MAX(sinistros, valor)}), NAMED('ResumoPorPai'));

// Filtrando os pais pelo conteúdo dos filhos
OUTPUT(Clientes(EXISTS(sinistros(tipo = 'INJURY'))), NAMED('QuemTemLesao'));
OUTPUT(Clientes(NOT EXISTS(sinistros)),              NAMED('SemSinistro'));
```

> [real] Esse é o formato natural de um **dossiê**. Quando alguém consulta uma pessoa num produto da LexisNexis, a resposta é um registro com filhos: endereços, telefones, veículos, imóveis, parentes. Guardar já aninhado significa que o Roxie lê **um** registro do disco e entrega tudo, em vez de fazer oito buscas em oito tabelas. É uma das razões da resposta em milissegundos.

# PILULA: DENORMALIZE: grampear os filhos no pai

> [tecnico] `DENORMALIZE(pais, filhos, condição, GROUP, transform)` junta cada pai com **todos** os seus filhos de uma vez. Com a opção `GROUP`, o transform roda uma vez por pai; `LEFT` é o pai e `ROWS(RIGHT)` é o dataset com todos os filhos que casaram. Pais sem filhos continuam no resultado. O layout do pai precisa ter o campo filho, então o primeiro passo é um `PROJECT` que cria esse campo vazio (`[]`).

```ecl
IMPORT Aula;

Layout_SinFilho := {UNSIGNED4 sinistro_id, STRING10 tipo, UNSIGNED4 valor, UNSIGNED4 dt};

Layout_Pai := RECORD
  UNSIGNED4 id;
  STRING10  nome;
  STRING2   estado;
  DATASET(Layout_SinFilho) sinistros;
END;

// 1) Pais com o campo filho vazio
Pais := PROJECT(Aula.Clientes, TRANSFORM(Layout_Pai, SELF.sinistros := []; SELF := LEFT));

// 2) Grampeia os filhos
Dossie := DENORMALIZE(Pais, Aula.Sinistros,
                      LEFT.id = RIGHT.cliente_id,
                      GROUP,
                      TRANSFORM(Layout_Pai,
                                SELF.sinistros := PROJECT(ROWS(RIGHT), Layout_SinFilho);
                                SELF := LEFT));
OUTPUT(Dossie);
```

`PROJECT(ROWS(RIGHT), Layout_SinFilho)` converte os sinistros completos para o layout enxuto do filho (lembra do atalho do dia 9?).

# PILULA: NORMALIZE: tirar os filhos da ficha

> [crianca] O contrário: você tira o grampo e faz **uma ficha para cada irmão**, copiando em cada uma o nome do aluno a quem ele pertence. De uma ficha com 3 irmãos saem 3 fichas.

> [tecnico] `NORMALIZE(pais, LEFT.filhos, transform)` gera um registro de saída **para cada filho**. No transform, `LEFT` é o pai e `RIGHT` é o filho da vez. Pais sem filhos não geram nada.

```ecl
Layout_Sinistro := {UNSIGNED4 sinistro_id, STRING10 tipo, UNSIGNED4 valor};
Layout_Cliente  := {UNSIGNED4 id, STRING10 nome, DATASET(Layout_Sinistro) sinistros};

Clientes := DATASET([
  {1, 'Ana',   [{101, 'COLLISION', 8400}, {108, 'COLLISION', 1500}]},
  {2, 'Bruno', []},
  {4, 'Diego', [{102, 'INJURY', 45000}, {104, 'INJURY', 38000}, {112, 'COLLISION', 9700}]}
], Layout_Cliente);

Layout_Plano := RECORD
  UNSIGNED4 cliente_id;
  STRING10  nome;
  UNSIGNED4 sinistro_id;
  STRING10  tipo;
  UNSIGNED4 valor;
END;

Plano := NORMALIZE(Clientes, LEFT.sinistros,
                   TRANSFORM(Layout_Plano,
                             SELF.cliente_id := LEFT.id;
                             SELF.nome       := LEFT.nome;
                             SELF := RIGHT));
OUTPUT(Plano);
```

# PILULA: NORMALIZE com contador: colunas repetidas viram linhas

> [tecnico] A segunda forma é `NORMALIZE(recordset, n, transform)`: chama o transform `n` vezes para cada registro, com `COUNTER` valendo 1, 2, ..., n. É o remédio para o layout "largo" que toda fonte antiga manda: `phone1, phone2, phone3`. A função `CHOOSE(n, a, b, c)` devolve o n-ésimo valor da lista.

```ecl
Layout_Largo := {UNSIGNED4 id, STRING10 nome, STRING10 phone1, STRING10 phone2, STRING10 phone3};

Largo := DATASET([{1, 'Ana',   '3055550142', '3055550199', ''},
                  {2, 'Bruno', '4045550100', '',           ''},
                  {3, 'Carla', '2125550177', '2125550178', '6465550101'}], Layout_Largo);

Layout_Fone := {UNSIGNED4 id, UNSIGNED1 ordem, STRING10 phone};

Fones := NORMALIZE(Largo, 3,
                   TRANSFORM(Layout_Fone,
                             SELF.id    := LEFT.id;
                             SELF.ordem := COUNTER;
                             SELF.phone := CHOOSE(COUNTER, LEFT.phone1, LEFT.phone2, LEFT.phone3)));

OUTPUT(Fones(phone <> ''));      // joga fora as posições vazias
```

> [real] Uma linha por telefone é o formato que permite **indexar por telefone** e responder "de quem é este número?" (busca reversa). Com três colunas você precisaria de três índices. Normalizar antes de indexar é rotina em toda ingestão.

# EXERCICIO: Consultando filhos

Com o dataset aninhado abaixo, mostre uma linha por cliente com `id`, `nome`, `UNSIGNED2 qtd_compras`, `DECIMAL9_2 total` e `BOOLEAN comprou_viagem` (verdadeiro se há alguma compra da categoria `TRAVEL`).

```ecl
Layout_Compra  := {STRING12 categoria, DECIMAL9_2 valor};
Layout_Cliente := {UNSIGNED4 id, STRING10 nome, DATASET(Layout_Compra) compras};

Clientes := DATASET([
  {1, 'Ana',   [{'GROCERY', 54.90}, {'ELECTRONICS', 1299.00}, {'RESTAURANT', 38.40}]},
  {6, 'Fabio', [{'TRAVEL', 2450.00}, {'TRAVEL', 310.00}]},
  {2, 'Bruno', []}
], Layout_Cliente);

```

## GABARITO
```ecl
Layout_Compra  := {STRING12 categoria, DECIMAL9_2 valor};
Layout_Cliente := {UNSIGNED4 id, STRING10 nome, DATASET(Layout_Compra) compras};

Clientes := DATASET([
  {1, 'Ana',   [{'GROCERY', 54.90}, {'ELECTRONICS', 1299.00}, {'RESTAURANT', 38.40}]},
  {6, 'Fabio', [{'TRAVEL', 2450.00}, {'TRAVEL', 310.00}]},
  {2, 'Bruno', []}
], Layout_Cliente);

OUTPUT(TABLE(Clientes, {id, nome,
                        UNSIGNED2  qtd_compras    := COUNT(compras),
                        DECIMAL9_2 total          := SUM(compras, valor),
                        BOOLEAN    comprou_viagem := EXISTS(compras(categoria = 'TRAVEL'))}));
```

# EXERCICIO: Dossiê de transações

Use `DENORMALIZE` para montar, a partir de `Aula.Clientes` e `Aula.Transacoes`, um registro por cliente com `id`, `nome` e o filho `transacoes` contendo `txn_id`, `dt`, `valor`, `loja`. Ordene o resultado por `id`.

```ecl
IMPORT Aula;

```

## DICA
Layout do filho, layout do pai com `DATASET(filho)`, `PROJECT` criando o filho vazio, depois `DENORMALIZE(..., GROUP, TRANSFORM(...))`.

## GABARITO
```ecl
IMPORT Aula;

Layout_Txn := {UNSIGNED4 txn_id, UNSIGNED4 dt, DECIMAL9_2 valor, STRING16 loja};
Layout_Pai := {UNSIGNED4 id, STRING10 nome, DATASET(Layout_Txn) transacoes};

Pais := PROJECT(Aula.Clientes, TRANSFORM(Layout_Pai, SELF.transacoes := []; SELF := LEFT));

Dossie := DENORMALIZE(Pais, Aula.Transacoes,
                      LEFT.id = RIGHT.cliente_id,
                      GROUP,
                      TRANSFORM(Layout_Pai, SELF.transacoes := PROJECT(ROWS(RIGHT), Layout_Txn); SELF := LEFT));
OUTPUT(SORT(Dossie, id));
```

# EXERCICIO: E-mails em linhas

A fonte manda até 2 e-mails por pessoa em colunas. Gere uma linha por e-mail **não vazio**, com `id`, `UNSIGNED1 ordem` e `STRING40 email` em minúsculas.

```ecl
IMPORT STD;

Largo := DATASET([{1, 'ANA@EXAMPLE.COM', 'ana.smith@work.com'},
                  {2, 'bruno@example.com', ''},
                  {3, '', ''}], {UNSIGNED4 id, STRING40 email1, STRING40 email2});

```

## GABARITO
```ecl
IMPORT STD;

Largo := DATASET([{1, 'ANA@EXAMPLE.COM', 'ana.smith@work.com'},
                  {2, 'bruno@example.com', ''},
                  {3, '', ''}], {UNSIGNED4 id, STRING40 email1, STRING40 email2});

Layout_Email := {UNSIGNED4 id, UNSIGNED1 ordem, STRING40 email};

Emails := NORMALIZE(Largo, 2,
                    TRANSFORM(Layout_Email,
                              SELF.id    := LEFT.id;
                              SELF.ordem := COUNTER;
                              SELF.email := STD.Str.ToLowerCase(CHOOSE(COUNTER, LEFT.email1, LEFT.email2))));
OUTPUT(Emails(email <> ''));
```

# REAL: Perfil 360 do segurado

O time de produto quer um arquivo "perfil 360": **um registro por pessoa**, já com os veículos e os sinistros dela aninhados. Esse arquivo vai virar, mais à frente, a base de uma consulta Roxie.

Usando as tabelas de `Treino.Arquivos` no Thor:

1. Layout do filho veículo: `vin, make, model, year`. Layout do filho sinistro: `claim_id, claim_date, claim_type, amount, status`.
2. Layout do perfil: `id, first_name, last_name, state` + `veiculos` + `sinistros`.
3. Monte o perfil com dois `DENORMALIZE` em sequência (primeiro veículos, depois sinistros).
4. Grave em `~aluno::base::perfil360`.
5. Entregue, nesta ordem: (a) a quantidade de perfis (tem que ser igual à de pessoas); (b) quantas pessoas têm 2 ou mais veículos; (c) quantas pessoas têm algum sinistro de `THEFT` **e** nenhum veículo fabricado depois de 2015; (d) os 5 perfis com mais sinistros (desempate por `id`), mostrando `id`, `first_name`, `last_name`, `UNSIGNED2 qtd_veiculos`, `UNSIGNED2 qtd_sinistros`.

```ecl thor
IMPORT Treino;
A := Treino.Arquivos;

```

## DICA
Item (c): `Perfil(EXISTS(sinistros(claim_type = 'THEFT')) AND NOT EXISTS(veiculos(year > 2015)))`. Para os itens (a) a (d), use o recordset em memória; a gravação é uma ação a mais.

## GABARITO
```ecl thor
IMPORT Treino;
A := Treino.Arquivos;

Layout_Veic := {STRING17 vin, STRING12 make, STRING12 model, UNSIGNED2 year};
Layout_Sin  := {UNSIGNED4 claim_id, UNSIGNED4 claim_date, STRING10 claim_type, UNSIGNED4 amount, STRING6 status};

Layout_Perfil := RECORD
  UNSIGNED4 id;
  STRING20  first_name;
  STRING20  last_name;
  STRING2   state;
  DATASET(Layout_Veic) veiculos;
  DATASET(Layout_Sin)  sinistros;
END;

Pais := PROJECT(A.Pessoas, TRANSFORM(Layout_Perfil, SELF.veiculos := []; SELF.sinistros := []; SELF := LEFT));

ComVeic := DENORMALIZE(Pais, A.Veiculos, LEFT.id = RIGHT.person_id, GROUP,
                       TRANSFORM(Layout_Perfil, SELF.veiculos := PROJECT(ROWS(RIGHT), Layout_Veic); SELF := LEFT));

Perfil := DENORMALIZE(ComVeic, A.Sinistros, LEFT.id = RIGHT.person_id, GROUP,
                      TRANSFORM(Layout_Perfil, SELF.sinistros := PROJECT(ROWS(RIGHT), Layout_Sin); SELF := LEFT));

OUTPUT(Perfil, , '~aluno::base::perfil360', OVERWRITE);

OUTPUT(COUNT(Perfil));
OUTPUT(COUNT(Perfil(COUNT(veiculos) >= 2)));
OUTPUT(COUNT(Perfil(EXISTS(sinistros(claim_type = 'THEFT')) AND NOT EXISTS(veiculos(year > 2015)))));
OUTPUT(TOPN(TABLE(Perfil, {id, first_name, last_name,
                           UNSIGNED2 qtd_veiculos  := COUNT(veiculos),
                           UNSIGNED2 qtd_sinistros := COUNT(sinistros)}), 5, -qtd_sinistros, id));
```
Repare na pergunta (c): em tabelas planas ela exigiria dois JOINs e um `LEFT ONLY`. No formato aninhado é **um filtro de uma linha**. Esse é o poder do dado denormalizado: perguntas sobre "a pessoa e tudo o que é dela" ficam triviais. Abra o arquivo gravado no ECL Watch e veja como ele mostra os filhos.

# QUIZ

? O que é um dataset filho (child dataset)?
- Um arquivo menor copiado de outro
+ Um campo de um registro que contém uma tabela inteira
- Um dataset criado com filtro
- Um índice secundário
! `DATASET(Layout) campo;` dentro de um RECORD: cada linha carrega sua própria tabela.

? Como selecionar os clientes que têm ao menos um sinistro do tipo THEFT no campo filho `sinistros`?
- `Clientes(sinistros.tipo = 'THEFT')`
+ `Clientes(EXISTS(sinistros(tipo = 'THEFT')))`
- `Clientes(sinistros IN ['THEFT'])`
- `JOIN(Clientes, sinistros, tipo = 'THEFT')`
! O campo filho é um dataset: filtre-o e teste com EXISTS.

? Em `DENORMALIZE(Pais, Filhos, cond, GROUP, TRANSFORM(...))`, o que é `ROWS(RIGHT)`?
- O primeiro filho que casou
- O número de filhos
+ O dataset com todos os filhos que casaram com o pai atual
- Todos os registros de Filhos
! Com GROUP o transform roda uma vez por pai e recebe todos os filhos de uma vez.

? Um pai tem 4 filhos no campo `itens`. Quantos registros `NORMALIZE(Pais, LEFT.itens, ...)` gera para ele?
- 1
+ 4
- 5
- 0
! Um registro de saída por filho. Pais sem filhos não geram nada.

? Para que serve `NORMALIZE(ds, 3, TRANSFORM(..., CHOOSE(COUNTER, LEFT.p1, LEFT.p2, LEFT.p3)))`?
- Para repetir cada registro 3 vezes sem alteração
+ Para transformar três colunas repetidas em três linhas
- Para criar três campos filhos
- Para dividir o dataset em três arquivos
! O transform roda 3 vezes por registro; CHOOSE pega a coluna da vez.

? Por que guardar dados aninhados ajuda consultas de dossiê no Roxie?
- Porque ocupa menos espaço que qualquer outro formato
+ Porque uma única leitura traz o registro e tudo o que pertence a ele, sem vários JOINs
- Porque o Roxie não sabe fazer JOIN
- Porque arquivos aninhados não precisam de índice
! Menos leituras em disco por consulta significa menor latência.

# FLASHCARDS

Q: Como declarar um campo filho?
A: `DATASET(LayoutFilho) nome_do_campo;` dentro do RECORD.
Q: DENORMALIZE com GROUP.
A: `DENORMALIZE(pais, filhos, cond, GROUP, TRANSFORM(Pai, SELF.filhos := PROJECT(ROWS(RIGHT), LayoutFilho); SELF := LEFT))`
Q: NORMALIZE por campo filho.
A: `NORMALIZE(pais, LEFT.filhos, TRANSFORM(Plano, SELF.id := LEFT.id; SELF := RIGHT))`
Q: NORMALIZE por contador.
A: `NORMALIZE(ds, n, TRANSFORM(..., COUNTER))` — transform roda n vezes por registro.
Q: O que `CHOOSE(2, a, b, c)` devolve?
A: `b` (o segundo valor).
Q: Como filtrar pais sem nenhum filho?
A: `Pais(NOT EXISTS(filhos))`
