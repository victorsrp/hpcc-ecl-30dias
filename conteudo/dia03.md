---
dia: 3
modulo: 1
titulo: Ordenar, cortar e resumir
horas: 3
---

# MISSAO

> [goggins] Dois dias feitos. A maioria das pessoas que "quer aprender" já desistiu aqui. Você não é a maioria. Hoje você aprende a tirar **resposta** de uma tabela: o maior, o menor, o total, os 3 primeiros, os repetidos. É isso que um chefe pede 20 vezes por dia.

**Hoje você vai:**

- Ordenar com `SORT`.
- Pegar só os primeiros com `CHOOSEN` e os melhores com `TOPN`.
- Remover repetidos com `DEDUP`.
- Resumir com `COUNT`, `SUM`, `AVE`, `MAX` e `MIN`.

A partir de hoje os exemplos usam tabelas prontas. A linha `IMPORT Aula;` traz três tabelas pequenas para o seu código (você vai aprender a criar módulos assim no dia 9):

| Tabela | Campos |
|---|---|
| `Aula.Clientes` (12 linhas) | `id, nome, sobrenome, estado, cidade, nascimento, renda, score` |
| `Aula.Sinistros` (16 linhas) | `sinistro_id, cliente_id, tipo, valor, dt, oficina, status` |
| `Aula.Transacoes` (20 linhas) | `txn_id, cliente_id, dt, valor, loja, categoria, estado` |

> [cuidado] O campo de data dessas tabelas se chama `dt`, e não `data`, porque `DATA` é palavra reservada do ECL (é um tipo de dado binário). Sempre que um nome "óbvio" der erro de sintaxe estranho, desconfie de palavra reservada.

Rode e **olhe os dados** antes de continuar. Você não consegue trabalhar com uma tabela que nunca viu.

```ecl
IMPORT Aula;
OUTPUT(Aula.Clientes,   NAMED('Clientes'));
OUTPUT(Aula.Sinistros,  NAMED('Sinistros'));
OUTPUT(Aula.Transacoes, NAMED('Transacoes'));
```

# PILULA: SORT põe em ordem

> [crianca] Arrumar as cartas do baralho na mão: do menor para o maior. Se duas cartas têm o mesmo número, você usa o naipe para desempatar. `SORT` faz isso com as linhas da tabela.

> [tecnico] `SORT(recordset, campo1, campo2, ...)` devolve o recordset ordenado. A ordem padrão é crescente; um **sinal de menos** na frente do campo inverte para decrescente: `-valor`. Os campos seguintes são critérios de desempate. No Thor, o SORT é *global*: os dados são redistribuídos entre os nós para que a ordem valha para o cluster inteiro. É uma das operações mais caras que existem; não ordene sem precisar.

```ecl
IMPORT Aula;

PorScore        := SORT(Aula.Clientes, -score);            // maior score primeiro
PorEstadoENome  := SORT(Aula.Clientes, estado, nome);      // estado A-Z, depois nome A-Z
PorEstadoRenda  := SORT(Aula.Clientes, estado, -renda);    // em cada estado, maior renda primeiro

OUTPUT(PorScore,       NAMED('PorScore'));
OUTPUT(PorEstadoENome, NAMED('PorEstadoENome'));
OUTPUT(PorEstadoRenda, NAMED('PorEstadoRenda'));
```

# PILULA: CHOOSEN e TOPN pegam os primeiros

> [crianca] `CHOOSEN` é "me dá as 3 fichas de cima da pilha", do jeito que a pilha estiver. `TOPN` é "me dá as 3 fichas com as **maiores notas**": ele procura as melhores sem precisar arrumar a pilha inteira.

> [tecnico] `CHOOSEN(recordset, n)` devolve os primeiros `n` registros na ordem em que estiverem. `TOPN(recordset, n, campos_de_ordem)` devolve os `n` primeiros **segundo uma ordenação**, e é mais eficiente que `CHOOSEN(SORT(...), n)` porque cada nó só precisa guardar seus `n` melhores, sem ordenar tudo.

```ecl
IMPORT Aula;

Amostra       := CHOOSEN(Aula.Sinistros, 5);          // 5 quaisquer (os primeiros)
MaioresTres   := TOPN(Aula.Sinistros, 3, -valor);     // os 3 de maior valor
MaisAntigos   := TOPN(Aula.Sinistros, 2, dt);       // os 2 mais antigos

OUTPUT(Amostra,     NAMED('Amostra'));
OUTPUT(MaioresTres, NAMED('MaioresTres'));
OUTPUT(MaisAntigos, NAMED('MaisAntigos'));
```

> [real] `CHOOSEN(arquivo, 100)` é a primeira coisa que todo mundo roda ao receber um arquivo novo de 2 bilhões de linhas: "deixa eu ver a cara disso". Nunca dê `OUTPUT` num arquivo gigante inteiro.

# PILULA: DEDUP tira repetidos

> [crianca] Você tem figurinhas repetidas e quer ficar com **uma de cada**. Jeito fácil: primeiro arruma as figurinhas por número (as iguais ficam lado a lado), depois vai passando e joga fora cada uma que for igual à anterior.

> [tecnico] `DEDUP(recordset, condição_ou_campos)` compara cada registro com o **vizinho anterior** e descarta o segundo quando "são iguais" segundo os campos informados. Por isso o normal é **ordenar antes**: `DEDUP(SORT(ds, campo), campo)`. A opção `ALL` compara todos com todos (dispensa o sort, mas só serve para dados pequenos). Fica o **primeiro** de cada grupo; use `RIGHT` para ficar com o último. Sem campos, `DEDUP(ds)` remove linhas totalmente idênticas.

```ecl
IMPORT Aula;

// Um registro por oficina (o primeiro que aparecer de cada)
PorOficina   := SORT(Aula.Sinistros, oficina);
UmPorOficina := DEDUP(PorOficina, oficina);

// O sinistro MAIS CARO de cada cliente: ordena por cliente e valor decrescente, fica o primeiro
Ordenado      := SORT(Aula.Sinistros, cliente_id, -valor);
MaiorPorCli   := DEDUP(Ordenado, cliente_id);

OUTPUT(UmPorOficina, NAMED('UmPorOficina'));
OUTPUT(MaiorPorCli,  NAMED('MaiorSinistroDeCadaCliente'));
```

> [cuidado] O truque "**SORT pelo grupo + critério, depois DEDUP pelo grupo**" é um dos padrões mais usados em ECL: "o registro mais recente de cada pessoa", "o endereço mais novo de cada CPF", "a maior compra de cada cartão". Decore esse padrão. O erro clássico é esquecer o SORT e o DEDUP não remover nada, porque os iguais não estavam lado a lado.

# PILULA: Agregações: uma resposta para a tabela inteira

> [tecnico] As funções de agregação recebem um recordset e devolvem **um valor**: `COUNT(ds)` quantos; `SUM(ds, campo)` soma; `AVE(ds, campo)` média; `MAX(ds, campo)` maior; `MIN(ds, campo)` menor. Como o primeiro parâmetro é um recordset, você pode filtrar ali mesmo.

```ecl
IMPORT Aula;
S := Aula.Sinistros;      // apelido curto para digitar menos

OUTPUT(COUNT(S),                     NAMED('Quantidade'));
OUTPUT(SUM(S, valor),                NAMED('ValorTotal'));
OUTPUT(AVE(S, valor),                NAMED('ValorMedio'));
OUTPUT(MAX(S, valor),                NAMED('Maior'));
OUTPUT(MIN(S, valor),                NAMED('Menor'));
OUTPUT(SUM(S(status = 'PAID'), valor), NAMED('TotalPago'));
OUTPUT(AVE(S(tipo = 'INJURY'), valor), NAMED('MediaLesao'));
```

Quer saber **qual é a linha** que tem o maior valor? Filtre pelo próprio máximo:

```ecl
IMPORT Aula;
S := Aula.Sinistros;
MaiorValor := MAX(S, valor);
OUTPUT(S(valor = MaiorValor));
```

# EXERCICIO: Ranking de renda

Mostre os clientes ordenados por estado (A-Z) e, dentro de cada estado, da **maior** para a menor renda.

```ecl
IMPORT Aula;

```

## GABARITO
```ecl
IMPORT Aula;
OUTPUT(SORT(Aula.Clientes, estado, -renda));
```

# EXERCICIO: Os 3 melhores scores

Mostre os 3 clientes com maior score usando `TOPN`.

```ecl
IMPORT Aula;

```

## GABARITO
```ecl
IMPORT Aula;
OUTPUT(TOPN(Aula.Clientes, 3, -score));
```
`CHOOSEN(SORT(Aula.Clientes, -score), 3)` dá o mesmo resultado, mas ordena a tabela inteira para usar só 3 linhas. Em 12 linhas tanto faz; em 12 bilhões é a diferença entre minutos e horas.

# EXERCICIO: Estados sem repetição

Mostre uma linha por estado onde existe cliente (qualquer cliente serve como representante), em ordem alfabética de estado.

```ecl
IMPORT Aula;

```

## DICA
Ordene por `estado` e depois deduplique por `estado`.

## GABARITO
```ecl
IMPORT Aula;
OUTPUT(DEDUP(SORT(Aula.Clientes, estado), estado));
```

# EXERCICIO: A transação mais recente de cada cliente

Para cada cliente, mostre só a transação mais recente (maior `dt`). Se houver empate de data, fica a de maior `valor`. O resultado deve sair ordenado por `cliente_id`.

```ecl
IMPORT Aula;

```

## DICA
É o padrão SORT + DEDUP. Ordene por `cliente_id, -dt, -valor` e deduplique por `cliente_id`.

## GABARITO
```ecl
IMPORT Aula;
Ordenado := SORT(Aula.Transacoes, cliente_id, -dt, -valor);
OUTPUT(DEDUP(Ordenado, cliente_id));
```
O cliente 10 tem dois saques de 500.00 no mesmo dia; empataram em data e valor, então fica o que vier primeiro na ordenação.

# EXERCICIO: Números do negócio

Produza, nesta ordem: (1) quantas transações existem; (2) o valor total gasto; (3) o valor médio das transações da categoria `TRAVEL`; (4) a maior transação feita na Flórida (só o valor).

```ecl
IMPORT Aula;
T := Aula.Transacoes;

```

## GABARITO
```ecl
IMPORT Aula;
T := Aula.Transacoes;

OUTPUT(COUNT(T));
OUTPUT(SUM(T, valor));
OUTPUT(AVE(T(categoria = 'TRAVEL'), valor));
OUTPUT(MAX(T(estado = 'FL'), valor));
```

# REAL: Relatório para a diretoria de sinistros

Segunda-feira, 8h. O diretor quer um resumo da carteira de sinistros antes da reunião das 9h. Ele pediu, nesta ordem:

1. Quanto já foi **pago** no total (status `PAID`).
2. Qual o **valor em aberto** (status `OPEN`): é o risco que ainda pode virar pagamento.
3. Os **3 maiores** sinistros pagos.
4. O **último** sinistro (mais recente) de cada oficina, ignorando sinistros sem oficina (campo vazio), ordenado pelo nome da oficina.
5. `TRUE`/`FALSE`: a média dos sinistros de `INJURY` é maior que 40000?

```ecl
IMPORT Aula;
S := Aula.Sinistros;

```

## DICA
Crie `Pagos := S(status = 'PAID');` e reaproveite. Para o item 4: filtre `oficina <> ''`, ordene por `oficina, -dt`, deduplique por `oficina`.

## GABARITO
```ecl
IMPORT Aula;
S := Aula.Sinistros;

Pagos   := S(status = 'PAID');
Abertos := S(status = 'OPEN');

ComOficina       := S(oficina <> '');
UltimoPorOficina := DEDUP(SORT(ComOficina, oficina, -dt), oficina);

MediaLesao := AVE(S(tipo = 'INJURY'), valor);

OUTPUT(SUM(Pagos, valor));
OUTPUT(SUM(Abertos, valor));
OUTPUT(TOPN(Pagos, 3, -valor));
OUTPUT(UltimoPorOficina);
OUTPUT(MediaLesao > 40000);
```
Total pago: 211050. Em aberto: 52400. A média de lesão é 43475, então o item 5 é `TRUE`. Repare que todos os sinistros de lesão passam pela mesma oficina. Guarde essa pulga atrás da orelha.

# QUIZ

? Como ordenar sinistros do maior valor para o menor?
- `SORT(Sinistros, valor DESC)`
+ `SORT(Sinistros, -valor)`
- `SORT(Sinistros, valor, REVERSE)`
- `ORDER(Sinistros, valor)`
! O sinal de menos na frente do campo inverte a ordem.

? Por que normalmente se usa `SORT` antes de `DEDUP`?
- Porque o DEDUP dá erro de compilação sem SORT
+ Porque o DEDUP compara registros vizinhos; os iguais precisam estar lado a lado
- Porque o SORT já remove os repetidos
- Para o resultado ficar mais bonito
! DEDUP compara cada registro com o anterior. Sem ordenar, repetidos distantes não são removidos.

? Qual expressão devolve o registro mais recente de cada cliente?
- `DEDUP(Transacoes, cliente_id)`
- `TOPN(Transacoes, 1, -dt)`
+ `DEDUP(SORT(Transacoes, cliente_id, -dt), cliente_id)`
- `SORT(DEDUP(Transacoes, cliente_id), -dt)`
! Ordena por cliente e data decrescente; o DEDUP por cliente mantém o primeiro, que é o mais recente.

? Qual a vantagem de `TOPN(ds, 10, -valor)` sobre `CHOOSEN(SORT(ds, -valor), 10)`?
- Nenhuma, são idênticos em custo
+ TOPN não precisa ordenar o dataset inteiro
- TOPN devolve o resultado em ordem aleatória
- CHOOSEN não funciona depois de SORT
! Cada nó só mantém seus 10 melhores. O resultado é o mesmo, o custo é muito menor.

? O que `SUM(Sinistros(status = 'PAID'), valor)` devolve?
- Um recordset com os sinistros pagos
+ Um único número: a soma do valor dos sinistros pagos
- A quantidade de sinistros pagos
- Erro: não pode filtrar dentro do SUM
! O primeiro parâmetro é um recordset (aqui, já filtrado); o resultado é um valor só.

? O que `CHOOSEN(Arquivo, 100)` faz?
- Escolhe 100 registros aleatórios
+ Devolve os 100 primeiros registros na ordem em que estão
- Devolve os 100 maiores
- Remove 100 registros do arquivo
! Primeiros N, sem ordenar. Ótimo para espiar um arquivo grande.

# FLASHCARDS

Q: Como ordenar por estado crescente e renda decrescente?
A: `SORT(ds, estado, -renda)`
Q: Padrão para "o registro mais recente de cada cliente".
A: `DEDUP(SORT(ds, cliente_id, -dt), cliente_id)`
Q: Diferença entre CHOOSEN e TOPN.
A: CHOOSEN pega os N primeiros como estão; TOPN pega os N melhores segundo uma ordem, sem ordenar tudo.
Q: Cinco funções de agregação.
A: COUNT, SUM, AVE, MAX, MIN — recebem um recordset e devolvem um valor.
Q: Por que evitar SORT desnecessário no Thor?
A: É global: redistribui dados entre os nós. Uma das operações mais caras.
Q: O que `DEDUP(ds, campo, ALL)` faz de diferente?
A: Compara todos com todos, sem precisar de SORT; só para volumes pequenos.
