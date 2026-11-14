---
dia: 5
modulo: 1
titulo: TABLE agrupada, funções e prova do módulo 1
horas: 4
---

# MISSAO

> [goggins] Dia de prova. Duas pílulas novas, depois o **desafio do módulo** e o **teste de conceitos**. Hoje ninguém segura sua mão: o desafio não tem passo a passo. Vai dar vontade de abrir o gabarito no primeiro erro. Não abre. O desconforto de ficar travado **é** o treino.

**Hoje você vai:**

- Agrupar e resumir com `TABLE` (o `GROUP BY` do ECL).
- Criar suas próprias funções.
- Provar que domina o módulo 1.

# PILULA: TABLE agrupada: um resumo por grupo

> [crianca] Você tem um saco de balas misturadas e quer saber quantas tem de cada cor. Você faz um montinho para cada cor e conta cada montinho. No fim você tem uma listinha: "vermelha: 12, azul: 7, verde: 9". Isso é agrupar.

> [tecnico] `TABLE(recordset, {formato}, campos_de_grupo)` gera **uma linha por combinação** dos campos de grupo. Dentro do formato, as funções de agregação usam a palavra `GROUP` no lugar do recordset: `COUNT(GROUP)`, `SUM(GROUP, campo)`, `AVE(GROUP, campo)`, `MAX(GROUP, campo)`, `MIN(GROUP, campo)`. Um segundo parâmetro em `COUNT(GROUP, condição)` conta só o que satisfaz a condição. É a famosa **crosstab**.

```ecl
IMPORT Aula;
S := Aula.Sinistros;

PorTipo := TABLE(S,
                 {tipo,
                  UNSIGNED2  qtd       := COUNT(GROUP),
                  UNSIGNED4  total     := SUM(GROUP, valor),
                  DECIMAL9_2 media     := AVE(GROUP, valor),
                  UNSIGNED4  maior     := MAX(GROUP, valor),
                  UNSIGNED2  qtd_pagos := COUNT(GROUP, status = 'PAID')},
                 tipo);

OUTPUT(SORT(PorTipo, -total));
```

Leia assim: "para cada `tipo`, me dê a quantidade, o total, a média, o maior e quantos foram pagos". Os campos novos precisam de **nome** (`qtd := ...`); o tipo na frente é opcional, mas é boa prática.

Dá para agrupar por mais de um campo e por uma **expressão**:

```ecl
IMPORT Aula;
S := Aula.Sinistros;

// Por ano (dt DIV 10000 transforma 20250310 em 2025) e status
PorAnoStatus := TABLE(S,
                      {UNSIGNED2 ano := dt DIV 10000,
                       status,
                       UNSIGNED2 qtd := COUNT(GROUP),
                       UNSIGNED4 total := SUM(GROUP, valor)},
                      dt DIV 10000, status);

OUTPUT(SORT(PorAnoStatus, ano, status));
```

> [real] No Thor, o TABLE agrupado redistribui ou ordena os dados pelo campo de grupo. Quando você **sabe** que o resultado terá poucos grupos (estados, tipos, meses), acrescente `, FEW` no final: `TABLE(ds, {...}, estado, FEW)`. O Thor então monta o resumo na memória de cada nó e só junta os resumos, sem mexer no dado bruto. Em tabelas de bilhões, essa palavrinha economiza horas.

> [cuidado] Sem campos de grupo, `TABLE(ds, {total := SUM(GROUP, valor)})` devolve **uma linha só** com o resumo geral. E a ordem de saída de um TABLE agrupado não é garantida: se a ordem importa, use `SORT`.

# PILULA: Funções: dê nome ao que se repete

> [crianca] Uma máquina de suco: você põe uma fruta, aperta o botão, sai o suco. Não importa se é laranja ou limão, a máquina faz a mesma coisa com o que você puser. Uma função é uma máquina dessas: entra valor, sai resultado.

> [tecnico] Uma definição com **parâmetros** vira função: `Nome(TIPO parametro) := expressão;`. Parâmetros podem ter valor padrão (`TIPO p = valor`). Quando a lógica precisa de passos intermediários, use a estrutura `FUNCTION ... RETURN ... END;`. Parâmetros podem ser valores, sets ou datasets inteiros (`DATASET(Layout) ds`).

```ecl
IMPORT STD;

// Função de uma linha
Dobro(INTEGER x) := x * 2;

// Com valor padrão
ComImposto(DECIMAL10_2 valor, REAL taxa = 0.07) := valor * (1 + taxa);

// Com passos intermediários
STRING NomeLimpo(STRING bruto) := FUNCTION
  SemEspacos := STD.Str.CleanSpaces(bruto);
  Minusculo  := STD.Str.ToLowerCase(SemEspacos);
  RETURN STD.Str.ToTitleCase(Minusculo);
END;

OUTPUT(Dobro(21));
OUTPUT(ComImposto(100));          // usa a taxa padrão
OUTPUT(ComImposto(100, 0.10));    // informa outra taxa
OUTPUT(NomeLimpo('  mARIA   da  SILVA '));
```

Função que recebe e devolve tabela:

```ecl
IMPORT Aula;

// Devolve os N maiores sinistros de um tipo
MaioresDoTipo(DATASET(Aula.Layouts.Sinistro) ds, STRING10 t, UNSIGNED n = 3) :=
  TOPN(ds(tipo = t), n, -valor);

OUTPUT(MaioresDoTipo(Aula.Sinistros, 'INJURY'),       NAMED('Top3Lesao'));
OUTPUT(MaioresDoTipo(Aula.Sinistros, 'COLLISION', 2), NAMED('Top2Colisao'));
```

> [real] Regra de negócio que aparece em mais de um lugar **tem que** virar função. Se "cliente de alto risco" é definido em cinco arquivos diferentes, no dia em que a regra mudar alguém vai esquecer um deles, e dois relatórios da mesma empresa vão mostrar números diferentes. Isso acontece de verdade, e custa caro.

# EXERCICIO: Clientes por estado

Para cada estado, mostre: quantidade de clientes, renda média (`DECIMAL9_2`) e maior score. Ordene por quantidade decrescente e, no empate, por estado A-Z.

```ecl
IMPORT Aula;

```

## GABARITO
```ecl
IMPORT Aula;

PorEstado := TABLE(Aula.Clientes,
                   {estado,
                    UNSIGNED2  qtd         := COUNT(GROUP),
                    DECIMAL9_2 renda_media := AVE(GROUP, renda),
                    UNSIGNED2  maior_score := MAX(GROUP, score)},
                   estado, FEW);
OUTPUT(SORT(PorEstado, -qtd, estado));
```

# EXERCICIO: Gasto por categoria

Para cada categoria de transação, mostre quantidade, total gasto e quantas transações foram acima de 500.00. Ordene pelo total decrescente.

```ecl
IMPORT Aula;

```

## DICA
`COUNT(GROUP, valor > 500)` conta com condição.

## GABARITO
```ecl
IMPORT Aula;

PorCategoria := TABLE(Aula.Transacoes,
                      {categoria,
                       UNSIGNED2   qtd       := COUNT(GROUP),
                       DECIMAL10_2 total     := SUM(GROUP, valor),
                       UNSIGNED2   acima_500 := COUNT(GROUP, valor > 500)},
                      categoria, FEW);
OUTPUT(SORT(PorCategoria, -total));
```

# EXERCICIO: Uma função de faixa de score

Escreva a função `FaixaScore(UNSIGNED2 s)` que devolve `'A'` para score de 750 ou mais, `'B'` de 650 a 749, `'C'` de 500 a 649, `'D'` abaixo de 500 e `'SEM'` quando o score é 0. Depois use-a num `TABLE` para contar quantos clientes há em cada faixa, ordenado pela faixa.

```ecl
IMPORT Aula;

```

## DICA
A função é um `MAP`. Teste o zero **primeiro**. No TABLE, crie o campo `STRING3 faixa := FaixaScore(score)` e agrupe pela mesma expressão: `FaixaScore(score)`.

## GABARITO
```ecl
IMPORT Aula;

STRING3 FaixaScore(UNSIGNED2 s) := MAP(s = 0    => 'SEM',
                                       s >= 750 => 'A',
                                       s >= 650 => 'B',
                                       s >= 500 => 'C',
                                       'D');

PorFaixa := TABLE(Aula.Clientes,
                  {STRING3 faixa := FaixaScore(score), UNSIGNED2 qtd := COUNT(GROUP)},
                  FaixaScore(score), FEW);
OUTPUT(SORT(PorFaixa, faixa));
```

# DESAFIO: Painel de risco por oficina

Sem dica. Sem passo a passo. Você tem tudo o que precisa dos dias 1 a 5.

O time antifraude quer um painel que mostre **quais oficinas concentram sinistros graves**. Usando `Aula.Sinistros`:

1. Ignore os sinistros sem oficina (campo vazio).
2. Crie a função `Gravidade(STRING10 tipo, UNSIGNED4 valor)` que devolve `'CRITICO'` quando o tipo é `INJURY` **e** o valor é 40000 ou mais; `'ALTO'` quando o valor é 20000 ou mais; `'NORMAL'` nos outros casos.
3. Monte um resumo **por oficina** com: `qtd` (quantidade de sinistros), `total` (soma dos valores), `media` (`DECIMAL9_2`), `qtd_criticos` (quantos são `CRITICO` segundo a função) e `pct_lesao` (`DECIMAL5_1`: percentual dos sinistros da oficina que são `INJURY`, de 0 a 100).
4. Gere o **ranking** por `total` decrescente, acrescentando o campo `UNSIGNED1 posicao` como primeira coluna.
5. Entregue três resultados, nesta ordem: (a) o ranking completo; (b) o nome da oficina na posição 1; (c) `TRUE`/`FALSE`: a oficina da posição 1 concentra **mais da metade** do valor total de todos os sinistros com oficina?

```ecl
IMPORT Aula;

```

## GABARITO
```ecl
IMPORT Aula;

ComOficina := Aula.Sinistros(oficina <> '');

STRING8 Gravidade(STRING10 tipo, UNSIGNED4 valor) :=
  MAP(tipo = 'INJURY' AND valor >= 40000 => 'CRITICO',
      valor >= 20000                     => 'ALTO',
      'NORMAL');

PorOficina := TABLE(ComOficina,
                    {oficina,
                     UNSIGNED2  qtd          := COUNT(GROUP),
                     UNSIGNED4  total        := SUM(GROUP, valor),
                     DECIMAL9_2 media        := AVE(GROUP, valor),
                     UNSIGNED2  qtd_criticos := COUNT(GROUP, Gravidade(tipo, valor) = 'CRITICO'),
                     DECIMAL5_1 pct_lesao    := COUNT(GROUP, tipo = 'INJURY') * 100 / COUNT(GROUP)},
                    oficina, FEW);

Layout_Rank := RECORD
  UNSIGNED1 posicao;
  RECORDOF(PorOficina);
END;

Ranking := PROJECT(SORT(PorOficina, -total),
                   TRANSFORM(Layout_Rank, SELF.posicao := COUNTER; SELF := LEFT));

TotalGeral := SUM(ComOficina, valor);

OUTPUT(Ranking);
OUTPUT(Ranking[1].oficina);
OUTPUT(Ranking[1].total > TotalGeral / 2);
```
Novidade no gabarito: `RECORDOF(PorOficina)` significa "o layout daquele recordset"; evita reescrever todos os campos. Se você redigitou os campos à mão, está certo também.

O que o painel mostra: **Crash Kings Auto** tem 5 sinistros, 4 deles de lesão corporal, 3 críticos, e sozinha responde por bem mais da metade do dinheiro. Uma oficina de lataria com 80% de sinistros de lesão corporal não é coincidência: é o desenho clássico de uma quadrilha que encena acidentes. Com 16 linhas você viu no olho; com 300 milhões só o painel mostra. Foi para isso que essa plataforma foi criada.

# TESTE

? Qual componente do HPCC é usado para preparar dados em lote e construir índices?
+ Thor
- Roxie
- ESP
- Dali
! Thor é o motor de ETL em paralelo.

? Qual componente atende consultas online de baixa latência?
- Thor
+ Roxie
- hThor
- DFU Server
! Roxie serve consultas em milissegundos a partir de índices.

? Em ECL, a linha `Ativos := Clientes(status = 'A');` ...
- executa o filtro imediatamente
- cria uma cópia física dos dados
+ apenas define um recordset; nada executa até uma ação precisar dele
- altera o dataset Clientes
! Definições são declarações. Só ações disparam execução.

? Qual destas é uma **ação**?
- `Total := SUM(ds, valor);`
- `Layout := RECORD ... END;`
+ `OUTPUT(ds);`
- `Adultos := ds(idade >= 18);`
! OUTPUT é ação; as outras são definições.

? Qual tipo você escolheria para um campo "quantidade de filhos" em uma tabela de 5 bilhões de linhas?
- `INTEGER8`
- `REAL`
- `STRING`
+ `UNSIGNED1`
! Vai de 0 a 255 em 1 byte. Tamanho de campo é custo em escala.

? Como selecionar clientes de FL ou GA com score acima de 700?
- `Clientes(estado = 'FL' OR estado = 'GA' AND score > 700)`
+ `Clientes(estado IN ['FL','GA'] AND score > 700)`
- `Clientes(estado = ['FL','GA'], score > 700)`
- `Clientes[estado IN ('FL','GA')]`
! Na primeira opção o AND tem precedência sobre o OR e a regra sai errada. IN com SET resolve.

? Qual expressão devolve o sinistro de maior valor de **cada** cliente?
- `TOPN(Sinistros, 1, -valor)`
- `DEDUP(Sinistros, cliente_id)`
+ `DEDUP(SORT(Sinistros, cliente_id, -valor), cliente_id)`
- `MAX(Sinistros, valor)`
! Padrão SORT + DEDUP: ordena pelo grupo e critério, fica o primeiro de cada grupo.

? O que está errado em `TABLE(S, {tipo, COUNT(GROUP)}, tipo)`?
- TABLE não aceita COUNT
+ O campo calculado precisa de nome, por exemplo `qtd := COUNT(GROUP)`
- Falta ordenar antes
- GROUP só funciona com SUM
! Campos calculados em um formato de TABLE precisam ser nomeados.

? Dentro de `PROJECT(ds, TRANSFORM(Saida, SELF.x := LEFT.a * 2; SELF := LEFT))`, o que `SELF := LEFT` faz com o campo `x`?
- Sobrescreve `x` com o valor de LEFT.x
+ Nada: `x` já foi atribuído, e a atribuição explícita prevalece
- Gera erro de atribuição duplicada
- Zera o campo
! SELF := LEFT só preenche o que ainda não foi atribuído.

? Qual a forma correta de guardar a data 25/12/2026 para ordenar e comparar bem?
- `'25/12/2026'`
- `25122026`
+ `20261225`
- `'12-25-2026'`
! AAAAMMDD: a ordem numérica coincide com a ordem cronológica.

? Para que serve a opção `FEW` em um TABLE agrupado?
- Limita o resultado a poucas linhas
+ Avisa que haverá poucos grupos, permitindo agregar em memória sem redistribuir os dados
- Faz o TABLE rodar no hThor
- Remove grupos pequenos
! Com poucos grupos, cada nó resume localmente e só os resumos são combinados.

? `ComImposto(DECIMAL10_2 valor, REAL taxa = 0.07) := valor * (1 + taxa);` — quanto vale `ComImposto(200)`?
- 200
- 207
+ 214
- Erro: falta o segundo parâmetro
! O parâmetro `taxa` tem valor padrão 0.07: 200 * 1.07 = 214.

? Qual é a diferença entre `COUNT(ds)` e `COUNT(GROUP)`?
- Nenhuma
- COUNT(GROUP) conta colunas
+ COUNT(ds) conta um recordset inteiro; COUNT(GROUP) conta os registros de cada grupo dentro de um TABLE agrupado
- COUNT(GROUP) só funciona no Roxie
! GROUP representa "os registros do grupo atual" numa crosstab.

? Por que evitar `OUTPUT(ArquivoGigante)` sem `CHOOSEN`?
- Porque dá erro de compilação
+ Porque tenta devolver o arquivo inteiro como resultado do workunit
- Porque apaga o arquivo
- Porque OUTPUT só funciona com datasets inline
! Para espiar dados use CHOOSEN(arquivo, 100).

? O que significa `STRING10 nome` com o valor `'Ana'`?
- O campo ocupa 3 bytes
+ O campo ocupa 10 bytes: 'Ana' seguido de 7 espaços
- O valor é rejeitado por ser curto
- O campo ocupa 10 bytes preenchidos com zeros
! STRING de tamanho fixo é completada com espaços à direita; use TRIM ao concatenar.

# FLASHCARDS

Q: Sintaxe do TABLE agrupado.
A: `TABLE(ds, {grupo, qtd := COUNT(GROUP), total := SUM(GROUP, campo)}, grupo)`
Q: Como contar só parte do grupo num TABLE?
A: `COUNT(GROUP, condição)`, ex.: `COUNT(GROUP, status = 'PAID')`.
Q: Quando usar FEW no TABLE?
A: Quando o número de grupos é pequeno (cabe na memória): evita redistribuir/ordenar o dado.
Q: Como declarar função com valor padrão?
A: `Nome(TIPO a, TIPO b = padrão) := expressão;`
Q: Estrutura FUNCTION.
A: `TIPO Nome(params) := FUNCTION definições locais; RETURN expressão; END;`
Q: O que é RECORDOF(x)?
A: O layout do recordset x, sem precisar reescrever os campos.
Q: Como passar uma tabela como parâmetro?
A: `Nome(DATASET(Layout) ds) := ...`
