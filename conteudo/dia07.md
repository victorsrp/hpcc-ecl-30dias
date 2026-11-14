---
dia: 7
modulo: 2
titulo: JOIN parte 1: cruzando tabelas
horas: 3.5
---

# MISSAO

> [goggins] Uma semana. Você está aqui e a maioria não. Hoje é o dia do JOIN, a operação que paga o salário de quem trabalha com dados. A LexisNexis existe porque sabe cruzar tabelas melhor do que ninguém. Vai embolar a cabeça no começo: LEFT, RIGHT, OUTER, ONLY. Não fuja. Desenhe no papel se precisar. Você só sai daqui quando conseguir prever o número de linhas de um JOIN **antes** de rodar.

**Hoje você vai:**

- Cruzar duas tabelas com `JOIN`.
- Escrever o TRANSFORM de duas entradas (`LEFT` e `RIGHT`).
- Dominar os tipos: inner, `LEFT OUTER`, `RIGHT OUTER`, `FULL OUTER`, `LEFT ONLY`, `RIGHT ONLY`.
- Entender (e evitar) a explosão de linhas.

A partir de hoje você também usa as tabelas grandes do cluster com `IMPORT Treino;`:

| Tabela | Linhas | Campos |
|---|---|---|
| `Treino.Arquivos.Pessoas` | 21.800 | `id, first_name, last_name, dob, ssn, gender, street, city, state, zip, phone, email` |
| `Treino.Arquivos.Veiculos` | 15.000 | `vin, person_id, make, model, year, plate, state` |
| `Treino.Arquivos.Sinistros` | 30.207 | `claim_id, person_id, policy, claim_date, claim_type, amount, vin, repair_shop, status` |
| `Treino.Arquivos.Transacoes` | 120.000 | `txn_id, person_id, txn_date, txn_time, amount, merchant, category, state` |

# PILULA: O que é um JOIN

> [crianca] A professora tem duas listas. Na primeira: **número do aluno e nome**. Na segunda: **número do aluno e o lanche que pediu**. Ela quer uma lista só, com nome e lanche. Então ela olha o número em uma lista, procura o **mesmo número** na outra e escreve as duas informações na mesma linha. O número do aluno é a **chave** que liga as duas listas.

> [tecnico] `JOIN(esquerda, direita, condição, transform)` combina registros de dois recordsets quando a condição é verdadeira. Na condição e no transform, `LEFT` é o registro da tabela da esquerda e `RIGHT` o da direita. Para cada **par** que casa, o transform monta **um** registro de saída. O tipo padrão é o *inner join*: só saem os pares que casaram.

```ecl
IMPORT Aula;

Layout_Saida := RECORD
  UNSIGNED4 sinistro_id;
  STRING10  tipo;
  UNSIGNED4 valor;
  STRING10  nome;
  STRING2   estado;
END;

Layout_Saida Juntar(Aula.Layouts.Sinistro S, Aula.Layouts.Cliente C) := TRANSFORM
  SELF.nome   := C.nome;
  SELF.estado := C.estado;
  SELF        := S;          // sinistro_id, tipo e valor vêm do sinistro
END;

SinistrosComNome := JOIN(Aula.Sinistros, Aula.Clientes,
                         LEFT.cliente_id = RIGHT.id,
                         Juntar(LEFT, RIGHT));

OUTPUT(SinistrosComNome);
OUTPUT(COUNT(Aula.Sinistros), NAMED('SinistrosEntrada'));
OUTPUT(COUNT(SinistrosComNome), NAMED('LinhasSaida'));
```

Entraram 16 sinistros e saíram 15. Antes de ler a próxima pílula, descubra **qual sumiu e por quê**.

A forma inline é a mais usada no dia a dia:

```ecl
IMPORT Aula;

Layout_Saida := RECORD
  UNSIGNED4 sinistro_id;
  UNSIGNED4 valor;
  STRING10  nome;
END;

J := JOIN(Aula.Sinistros, Aula.Clientes,
          LEFT.cliente_id = RIGHT.id,
          TRANSFORM(Layout_Saida, SELF := LEFT; SELF := RIGHT));
OUTPUT(J);
```

> [cuidado] `SELF := LEFT; SELF := RIGHT;` preenche primeiro com o que houver na esquerda e depois completa com a direita. Se as duas tabelas têm um campo de **mesmo nome** (por exemplo `estado` ou `id`), vale o que foi atribuído primeiro. Quando o nome se repete e você quer os dois, crie campos distintos (`estado_cliente`, `estado_compra`) e atribua explicitamente.

# PILULA: Os tipos de JOIN

O sinistro 116 aponta para o cliente 99, que não existe. E os clientes 2 e 11 não têm sinistro. O tipo de JOIN decide o que fazer com quem **ficou sem par**.

> [crianca] Festa de dança em pares: meninos numa fila, meninas na outra. **Inner**: só entra na pista quem achou par. **Left outer**: todos da fila da esquerda entram; quem não achou par dança sozinho. **Left only**: a lista de quem da esquerda ficou **sem** par. **Full outer**: todo mundo entra, com ou sem par.

| Tipo | Sai o quê |
|---|---|
| *(padrão, inner)* | Só os pares que casaram |
| `LEFT OUTER` | Todos da esquerda; sem par, os campos da direita saem vazios/zero |
| `RIGHT OUTER` | Todos da direita; sem par, os campos da esquerda saem vazios/zero |
| `FULL OUTER` | Todos dos dois lados |
| `LEFT ONLY` | Só os da esquerda que **não** têm par |
| `RIGHT ONLY` | Só os da direita que **não** têm par |
| `FULL ONLY` | Os sem par dos dois lados |

O tipo vai depois do transform:

```ecl
IMPORT Aula;

Layout_Saida := RECORD
  UNSIGNED4 sinistro_id;
  UNSIGNED4 cliente_id;
  UNSIGNED4 valor;
  STRING10  nome;
END;
T(Aula.Layouts.Sinistro S, Aula.Layouts.Cliente C) := TRANSFORM(Layout_Saida, SELF := S; SELF := C);

OUTPUT(JOIN(Aula.Sinistros, Aula.Clientes, LEFT.cliente_id = RIGHT.id, T(LEFT, RIGHT), LEFT OUTER), NAMED('LeftOuter_16linhas'));
OUTPUT(JOIN(Aula.Sinistros, Aula.Clientes, LEFT.cliente_id = RIGHT.id, T(LEFT, RIGHT), LEFT ONLY),  NAMED('LeftOnly_SinistroOrfao'));
```

Para achar clientes **sem sinistro**, a tabela "de quem você quer saber" vai na esquerda. Em `LEFT ONLY` você nem precisa de transform: sem ele, o JOIN devolve o registro da esquerda como está.

```ecl
IMPORT Aula;

ClientesSemSinistro := JOIN(Aula.Clientes, Aula.Sinistros,
                            LEFT.id = RIGHT.cliente_id,
                            LEFT ONLY);
OUTPUT(ClientesSemSinistro);
```

> [tecnico] ECL **não tem NULL**. Num outer join, os campos do lado que não casou saem com o valor padrão do tipo: texto vazio, zero, `FALSE`. Para saber se houve par, teste um campo que nunca seria zero/vazio num registro real: `RIGHT.id = 0` significa "não achou".

```ecl
IMPORT Aula;

Layout_Flag := RECORD
  UNSIGNED4 sinistro_id;
  UNSIGNED4 cliente_id;
  STRING10  nome;
  BOOLEAN   cliente_encontrado;
END;

Marcado := JOIN(Aula.Sinistros, Aula.Clientes,
                LEFT.cliente_id = RIGHT.id,
                TRANSFORM(Layout_Flag,
                          SELF.cliente_encontrado := RIGHT.id <> 0;
                          SELF := LEFT;
                          SELF := RIGHT),
                LEFT OUTER);
OUTPUT(Marcado(NOT cliente_encontrado));
```

# PILULA: Explosão de linhas

> [crianca] Se o Pedro pediu 3 lanches e na lista de alunos o Pedro aparece 2 vezes por engano, a professora vai escrever 3 × 2 = **6 linhas** para o Pedro. Ninguém pediu 6 lanches. A lista "explodiu".

> [tecnico] Um JOIN gera uma linha para **cada par** que satisfaz a condição. Se a chave aparece `m` vezes na esquerda e `n` vezes na direita, saem `m × n` linhas. Relação 1-para-N é normal (um cliente, vários sinistros). N-para-N quase sempre é erro: valores somados em dobro, relatórios inflados. **Hábito de profissional: conte as linhas antes e depois de todo JOIN** e saiba explicar a diferença.

```ecl
IMPORT Aula;

// Sinistros x Transacoes pelo cliente: N-para-N. Não faz sentido de negócio, e explode.
Layout_X := RECORD
  UNSIGNED4 cliente_id;
  UNSIGNED4 sinistro_id;
  UNSIGNED4 txn_id;
END;

Explodido := JOIN(Aula.Sinistros, Aula.Transacoes,
                  LEFT.cliente_id = RIGHT.cliente_id,
                  TRANSFORM(Layout_X, SELF := LEFT; SELF := RIGHT));

OUTPUT(COUNT(Aula.Sinistros),  NAMED('Sinistros'));
OUTPUT(COUNT(Aula.Transacoes), NAMED('Transacoes'));
OUTPUT(COUNT(Explodido),       NAMED('DepoisDoJoin'));
OUTPUT(SORT(Explodido, cliente_id, sinistro_id, txn_id));
```

A defesa é **resumir um dos lados antes** (um registro por chave) e só então juntar:

```ecl
IMPORT Aula;

// Um registro por cliente com o total de sinistros
SinPorCli := TABLE(Aula.Sinistros, {cliente_id, UNSIGNED2 qtd_sin := COUNT(GROUP), UNSIGNED4 total_sin := SUM(GROUP, valor)}, cliente_id);

Layout_Perfil := RECORD
  UNSIGNED4 id;
  STRING10  nome;
  STRING2   estado;
  UNSIGNED2 qtd_sin;
  UNSIGNED4 total_sin;
END;

Perfil := JOIN(Aula.Clientes, SinPorCli,
               LEFT.id = RIGHT.cliente_id,
               TRANSFORM(Layout_Perfil, SELF := LEFT; SELF := RIGHT),
               LEFT OUTER);
OUTPUT(SORT(Perfil, -total_sin));   // 12 clientes entram, 12 saem
```

> [real] No Thor, um JOIN comum ordena ou distribui **as duas tabelas** pela chave para que registros com a mesma chave caiam no mesmo nó. Em tabelas de bilhões isso é o que mais custa num job. Duas regras baratas que valem ouro: **filtre antes** de juntar (menos linhas viajando) e **leve só as colunas necessárias** (linhas mais finas). Amanhã você conhece as opções que evitam esse custo em casos especiais.

# EXERCICIO: Transações com nome do cliente

Junte `Aula.Transacoes` com `Aula.Clientes` e mostre `txn_id`, `valor`, `loja`, `nome` e `sobrenome`, ordenado por `txn_id`.

```ecl
IMPORT Aula;

```

## GABARITO
```ecl
IMPORT Aula;

Layout_Saida := RECORD
  UNSIGNED4  txn_id;
  DECIMAL9_2 valor;
  STRING16   loja;
  STRING10   nome;
  STRING12   sobrenome;
END;

J := JOIN(Aula.Transacoes, Aula.Clientes,
          LEFT.cliente_id = RIGHT.id,
          TRANSFORM(Layout_Saida, SELF := LEFT; SELF := RIGHT));
OUTPUT(SORT(J, txn_id));
```

# EXERCICIO: Quem nunca comprou

Mostre os clientes que **não têm nenhuma transação**.

```ecl
IMPORT Aula;

```

## GABARITO
```ecl
IMPORT Aula;
OUTPUT(JOIN(Aula.Clientes, Aula.Transacoes, LEFT.id = RIGHT.cliente_id, LEFT ONLY));
```
Só o Bruno (id 2), que é menor de idade e não tem cartão.

# EXERCICIO: Compra fora do estado de residência

Mostre as transações feitas em um estado **diferente** do estado onde o cliente mora. Campos: `txn_id`, `nome`, `STRING2 estado_residencia`, `STRING2 estado_compra`, `valor`. Ordene por `txn_id`.

```ecl
IMPORT Aula;

```

## DICA
A condição do JOIN pode ter mais de uma parte: `LEFT.cliente_id = RIGHT.id AND LEFT.estado <> RIGHT.estado`. Como `estado` existe nos dois lados, atribua os dois campos explicitamente.

## GABARITO
```ecl
IMPORT Aula;

Layout_Fora := RECORD
  UNSIGNED4  txn_id;
  STRING10   nome;
  STRING2    estado_residencia;
  STRING2    estado_compra;
  DECIMAL9_2 valor;
END;

Fora := JOIN(Aula.Transacoes, Aula.Clientes,
             LEFT.cliente_id = RIGHT.id AND LEFT.estado <> RIGHT.estado,
             TRANSFORM(Layout_Fora,
                       SELF.estado_residencia := RIGHT.estado;
                       SELF.estado_compra     := LEFT.estado;
                       SELF := LEFT;
                       SELF := RIGHT));
OUTPUT(SORT(Fora, txn_id));
```
Compra longe de casa é um dos sinais clássicos de cartão clonado. O cliente 10 sacou 500 na Geórgia e 500 na Flórida no mesmo dia.

# EXERCICIO: Total de sinistros por estado do cliente

Mostre, por estado de residência do cliente, a quantidade de sinistros e o valor total, ordenado pelo total decrescente. Sinistros de clientes que não existem ficam de fora.

```ecl
IMPORT Aula;

```

## DICA
Primeiro um inner JOIN que leva o `estado` para cada sinistro; depois um `TABLE` agrupado.

## GABARITO
```ecl
IMPORT Aula;

Layout_SinEstado := RECORD
  UNSIGNED4 sinistro_id;
  UNSIGNED4 valor;
  STRING2   estado;
END;

SinEstado := JOIN(Aula.Sinistros, Aula.Clientes,
                  LEFT.cliente_id = RIGHT.id,
                  TRANSFORM(Layout_SinEstado, SELF := LEFT; SELF := RIGHT));

PorEstado := TABLE(SinEstado, {estado, UNSIGNED2 qtd := COUNT(GROUP), UNSIGNED4 total := SUM(GROUP, valor)}, estado, FEW);
OUTPUT(SORT(PorEstado, -total));
```

# REAL: Carteira de sinistros pagos por estado, em escala

Agora nas tabelas grandes, no Thor. A área de precificação quer saber **quanto a seguradora pagou em sinistros por estado de residência do segurado** e também quer um controle de qualidade do cruzamento.

Usando `Treino.Arquivos.Sinistros` (30.207 linhas) e `Treino.Arquivos.Pessoas` (21.800 linhas; `id` é único), entregue, nesta ordem:

1. A quantidade de sinistros com status `PAID` (antes do JOIN).
2. A quantidade de linhas depois de cruzar os sinistros pagos com as pessoas (`person_id = id`). Tem que ser igual ao item 1; se não for, algo explodiu ou sumiu.
3. O resumo por `state`: quantidade, valor total (`UNSIGNED8`) e valor médio (`DECIMAL10_2`), ordenado pelo total decrescente.
4. A quantidade de **pessoas que possuem veículo mas nunca tiveram sinistro** (use `Treino.Arquivos.Veiculos` e conte pessoas distintas, não veículos).

```ecl thor
IMPORT Treino;
A := Treino.Arquivos;

```

## DICA
Item 3: leve para o JOIN só o necessário (filtre `PAID` antes; o transform só precisa de `amount` e `state`). Item 4: uma pessoa pode ter vários veículos e vários sinistros. Reduza os veículos a uma linha por `person_id` (SORT + DEDUP, ou TABLE agrupado) e use `LEFT ONLY` contra os sinistros.

## GABARITO
```ecl thor
IMPORT Treino;
A := Treino.Arquivos;

Pagos := A.Sinistros(status = 'PAID');

Layout_PagoEstado := RECORD
  UNSIGNED4 amount;
  STRING2   state;
END;

PagoEstado := JOIN(Pagos, A.Pessoas,
                   LEFT.person_id = RIGHT.id,
                   TRANSFORM(Layout_PagoEstado, SELF.amount := LEFT.amount; SELF.state := RIGHT.state));

PorEstado := TABLE(PagoEstado,
                   {state,
                    UNSIGNED4   qtd   := COUNT(GROUP),
                    UNSIGNED8   total := SUM(GROUP, amount),
                    DECIMAL10_2 media := AVE(GROUP, amount)},
                   state, FEW);

Donos         := TABLE(A.Veiculos, {person_id}, person_id);   // uma linha por pessoa que tem veículo
DonosSemSinis := JOIN(Donos, A.Sinistros, LEFT.person_id = RIGHT.person_id, LEFT ONLY);

OUTPUT(COUNT(Pagos));
OUTPUT(COUNT(PagoEstado));
OUTPUT(SORT(PorEstado, -total));
OUTPUT(COUNT(DonosSemSinis));
```
Três hábitos de quem trabalha com isso de verdade apareceram aqui: **filtrar antes do JOIN** (`Pagos`), **levar só as colunas necessárias** no transform, e **conferir a contagem antes e depois**. `TABLE(ds, {person_id}, person_id)` é um jeito limpo de obter os valores distintos de um campo. Depois de rodar, abra o workunit no ECL Watch e olhe a aba de grafos: cada caixinha é uma atividade, e os números nas setas são as linhas que passaram. Você vai aprender a ler isso a fundo no dia 12.

# QUIZ

? Em `JOIN(A, B, LEFT.x = RIGHT.y, ...)`, o que é `RIGHT`?
- O resultado do JOIN
- O registro de A
+ O registro de B (a tabela da direita) que está sendo comparado
- O último registro processado
! LEFT é o registro do primeiro recordset e RIGHT o do segundo.

? A tem 100 registros, todos com par em B, e cada registro de A casa com exatamente 3 de B. Quantas linhas saem do inner join?
- 100
- 103
+ 300
- 3
! Uma linha por par: 100 × 3.

? Como listar os clientes que NÃO têm sinistro?
- `JOIN(Clientes, Sinistros, LEFT.id = RIGHT.cliente_id, LEFT OUTER)`
+ `JOIN(Clientes, Sinistros, LEFT.id = RIGHT.cliente_id, LEFT ONLY)`
- `JOIN(Clientes, Sinistros, LEFT.id <> RIGHT.cliente_id)`
- `Clientes(id NOT IN Sinistros)`
! LEFT ONLY devolve os registros da esquerda sem nenhum par. A opção com `<>` gera um produto quase cartesiano.

? Num `LEFT OUTER`, o que vem nos campos da direita quando não há par?
- NULL
+ O valor padrão do tipo: vazio, zero ou FALSE
- O registro é descartado
- O valor do registro anterior
! ECL não tem NULL. Teste um campo como `RIGHT.id = 0` para saber se achou.

? A chave aparece 4 vezes na esquerda e 5 vezes na direita. Quantas linhas o JOIN gera para essa chave?
- 9
- 5
+ 20
- 4
! m × n. Por isso N-para-N explode.

? Qual é o melhor hábito para detectar explosão ou perda de linhas?
- Rodar o JOIN duas vezes
+ Contar as linhas antes e depois do JOIN e explicar a diferença
- Usar sempre FULL OUTER
- Ordenar as tabelas antes
! COUNT antes e depois é o teste mais barato e mais valioso que existe.

? Em `TRANSFORM(Saida, SELF := LEFT; SELF := RIGHT)`, as duas tabelas têm um campo `estado`. Qual valor fica?
+ O de LEFT, porque foi atribuído primeiro
- O de RIGHT, porque foi atribuído por último
- Os dois, concatenados
- Erro de compilação
! A segunda atribuição só preenche o que ainda está sem valor.

? Antes de um JOIN grande no Thor, o que mais reduz o custo?
- Trocar a ordem das tabelas aleatoriamente
+ Filtrar as linhas e levar só as colunas necessárias antes de juntar
- Converter tudo para STRING
- Dar OUTPUT nas duas tabelas
! Menos linhas e linhas mais finas significam menos dados ordenados e trafegados entre os nós.

# FLASHCARDS

Q: Sintaxe básica do JOIN.
A: `JOIN(esq, dir, LEFT.k = RIGHT.k, TRANSFORM(Saida, SELF := LEFT; SELF := RIGHT), tipo)`
Q: Sete tipos de JOIN.
A: inner (padrão), LEFT OUTER, RIGHT OUTER, FULL OUTER, LEFT ONLY, RIGHT ONLY, FULL ONLY.
Q: Como achar registros da esquerda sem par?
A: `JOIN(esq, dir, condição, LEFT ONLY)`
Q: Quantas linhas saem se a chave repete m vezes à esquerda e n à direita?
A: m × n.
Q: Como saber, num LEFT OUTER, se houve par?
A: Testar um campo da direita que nunca é zero/vazio: `RIGHT.id <> 0`.
Q: Três hábitos antes/depois de um JOIN grande.
A: Filtrar antes; levar só as colunas necessárias; contar linhas antes e depois.
Q: Como obter os valores distintos de um campo?
A: `TABLE(ds, {campo}, campo)` ou `DEDUP(SORT(ds, campo), campo)`.
