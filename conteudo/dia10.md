---
dia: 10
modulo: 2
titulo: ITERATE, ROLLUP, GROUP e prova do módulo 2
horas: 4
---

# MISSAO

> [goggins] Dez dias. Um terço do caminho. Seu cérebro está cansado e é exatamente agora que os outros param. Hoje tem três ferramentas novas que fazem o que TABLE e JOIN não conseguem: **olhar para a linha de cima**. Depois, desafio e prova do módulo 2. Você não chegou até aqui para tirar 79%.

**Hoje você vai:**

- Carregar valores de uma linha para a próxima com `ITERATE`.
- Fundir linhas com `ROLLUP`.
- Tratar cada grupo como uma mini-tabela com `GROUP`.
- Enfrentar o desafio e o teste do módulo 2.

# PILULA: ITERATE: cada linha enxerga a anterior

> [crianca] Fila do recreio. Cada criança pergunta para a da frente: "qual é o seu número?" e diz: "então o meu é o seu mais um". A primeira não tem ninguém na frente, então parte do zero. No fim, todo mundo sabe sua posição. O `ITERATE` faz as linhas "conversarem" com a linha da frente.

> [tecnico] `ITERATE(recordset, transform)` percorre os registros em ordem. No transform, `RIGHT` é o registro **atual** e `LEFT` é o registro **anterior já transformado** (na primeira linha, `LEFT` vem zerado/vazio). O layout de entrada e saída é o mesmo. Serve para acumulados, diferenças entre linhas consecutivas e numeração.

```ecl
IMPORT Aula;

Layout_Acum := RECORD
  UNSIGNED4  txn_id;
  UNSIGNED4  dt;
  DECIMAL9_2 valor;
  DECIMAL10_2 acumulado;
END;

// 1) Prepara: ordena e cria o campo novo zerado
Base := PROJECT(SORT(Aula.Transacoes, dt, txn_id),
                TRANSFORM(Layout_Acum, SELF.acumulado := 0; SELF := LEFT));

// 2) Itera: o acumulado de cada linha = acumulado da anterior + valor da atual
Acumulado := ITERATE(Base,
                     TRANSFORM(Layout_Acum,
                               SELF.acumulado := LEFT.acumulado + RIGHT.valor;
                               SELF := RIGHT));
OUTPUT(Acumulado);
```

> [cuidado] No `ITERATE`, quem é copiado no final é o **RIGHT** (`SELF := RIGHT`), porque é a linha atual. Trocar por `SELF := LEFT` é o erro mais comum: todas as linhas viram cópia da primeira.

# PILULA: ROLLUP: fundir linhas vizinhas

> [crianca] Você tem várias moedinhas da mesma pessoa espalhadas em fichas diferentes. Vai juntando: pega a primeira ficha, soma a segunda **dentro dela** e joga a segunda fora; soma a terceira dentro dela, joga a terceira fora. Sobra uma ficha por pessoa com o total.

> [tecnico] `ROLLUP(recordset, condição, transform)` compara registros vizinhos. Quando a condição é verdadeira, funde os dois: o transform recebe `LEFT` (o acumulado até aqui) e `RIGHT` (o próximo) e devolve o novo acumulado. Como no DEDUP, os registros precisam estar **ordenados** para os iguais ficarem lado a lado. A vantagem sobre o TABLE: no transform você faz qualquer lógica, não só soma e contagem; por exemplo, **concatenar textos** ou guardar o primeiro e o último valor.

```ecl
IMPORT Aula;

Layout_R := RECORD
  UNSIGNED4   cliente_id;
  UNSIGNED2   qtd;
  DECIMAL10_2 total;
  UNSIGNED4   primeira_dt;
  UNSIGNED4   ultima_dt;
  STRING100   lojas;
END;

Base := PROJECT(SORT(Aula.Transacoes, cliente_id, dt, txn_id),
                TRANSFORM(Layout_R,
                          SELF.qtd := 1; SELF.total := LEFT.valor;
                          SELF.primeira_dt := LEFT.dt; SELF.ultima_dt := LEFT.dt;
                          SELF.lojas := TRIM(LEFT.loja);
                          SELF := LEFT));

PorCliente := ROLLUP(Base,
                     LEFT.cliente_id = RIGHT.cliente_id,
                     TRANSFORM(Layout_R,
                               SELF.qtd       := LEFT.qtd + 1;
                               SELF.total     := LEFT.total + RIGHT.total;
                               SELF.ultima_dt := RIGHT.ultima_dt;
                               SELF.lojas     := TRIM(LEFT.lojas) + ', ' + TRIM(RIGHT.lojas);
                               SELF := LEFT));
OUTPUT(PorCliente);
```

| Quero... | Use |
|---|---|
| Só jogar fora os repetidos | `DEDUP` |
| Contar/somar por grupo | `TABLE` agrupado |
| Fundir linhas com lógica própria (listas, primeiro/último, regras) | `ROLLUP` |

# PILULA: GROUP: cada grupo vira uma mini-tabela

> [crianca] Em vez de uma fila só com a escola inteira, você separa **uma fila por turma**. Agora, quando você diz "os 2 mais altos, um passo à frente", saem os 2 mais altos **de cada turma**. Mesma ordem, resultado completamente diferente.

> [tecnico] `GROUP(recordset_ordenado, campos)` marca fronteiras de grupo. Depois disso, as operações rodam **dentro de cada grupo**, separadamente: `TOPN` devolve os N de cada grupo, `ITERATE` recomeça a cada grupo, `SORT` ordena dentro do grupo, `DEDUP` deduplica dentro do grupo, `COUNTER` do `PROJECT` recomeça em 1. O recordset precisa estar ordenado pelos campos de grupo. `UNGROUP(...)` remove as fronteiras. No Thor isso é eficiente porque cada grupo cabe em um nó e todos trabalham ao mesmo tempo.

```ecl
IMPORT Aula;

// As 2 maiores transações DE CADA cliente
Agrupado := GROUP(SORT(Aula.Transacoes, cliente_id), cliente_id);
Top2     := TOPN(Agrupado, 2, -valor);
OUTPUT(UNGROUP(Top2), NAMED('Top2PorCliente'));
```

ITERATE com GROUP: o acumulado **recomeça** em cada cliente.

```ecl
IMPORT Aula;

Layout_Acum := RECORD
  UNSIGNED4   cliente_id;
  UNSIGNED4   dt;
  DECIMAL9_2  valor;
  DECIMAL10_2 acumulado;
  UNSIGNED2   ordem;
END;

Base := PROJECT(Aula.Transacoes, TRANSFORM(Layout_Acum, SELF.acumulado := 0; SELF.ordem := 0; SELF := LEFT));
G    := GROUP(SORT(Base, cliente_id, dt), cliente_id);

PorCliente := ITERATE(G, TRANSFORM(Layout_Acum,
                                   SELF.acumulado := LEFT.acumulado + RIGHT.valor;
                                   SELF.ordem     := LEFT.ordem + 1;
                                   SELF := RIGHT));
OUTPUT(UNGROUP(PorCliente));
```

O `ROLLUP` tem uma forma especial para dados agrupados: `ROLLUP(agrupado, GROUP, transform)` chama o transform **uma vez por grupo**, com `LEFT` sendo o primeiro registro e `ROWS(LEFT)` sendo **todos** os registros do grupo, como um dataset.

```ecl
IMPORT Aula;

Layout_Res := RECORD
  UNSIGNED4 cliente_id;
  UNSIGNED2 qtd;
  UNSIGNED4 maior;
  UNSIGNED2 qtd_lesao;
END;

G := GROUP(SORT(Aula.Sinistros, cliente_id), cliente_id);

Resumo := ROLLUP(G, GROUP,
                 TRANSFORM(Layout_Res,
                           SELF.cliente_id := LEFT.cliente_id;
                           SELF.qtd        := COUNT(ROWS(LEFT));
                           SELF.maior      := MAX(ROWS(LEFT), valor);
                           SELF.qtd_lesao  := COUNT(ROWS(LEFT)(tipo = 'INJURY'))));
OUTPUT(Resumo);
```

> [real] "O endereço mais recente e o anterior de cada pessoa", "dias entre uma compra e a seguinte no mesmo cartão", "a sequência de empregos de cada CPF": tudo isso é `SORT` + `GROUP` + `ITERATE`/`ROLLUP`. São as ferramentas de **linha do tempo**, e histórico é o que mais vale num birô de dados.

# EXERCICIO: Valor acumulado de sinistros

Ordene `Aula.Sinistros` por `dt` e gere `sinistro_id`, `dt`, `valor` e `UNSIGNED4 acumulado` (soma corrida dos valores).

```ecl
IMPORT Aula;

```

## GABARITO
```ecl
IMPORT Aula;

Layout_A := RECORD
  UNSIGNED4 sinistro_id;
  UNSIGNED4 dt;
  UNSIGNED4 valor;
  UNSIGNED4 acumulado;
END;

Base := PROJECT(SORT(Aula.Sinistros, dt), TRANSFORM(Layout_A, SELF.acumulado := 0; SELF := LEFT));
OUTPUT(ITERATE(Base, TRANSFORM(Layout_A, SELF.acumulado := LEFT.acumulado + RIGHT.valor; SELF := RIGHT)));
```

# EXERCICIO: Lista de tipos de sinistro por cliente

Com `ROLLUP`, gere uma linha por `cliente_id` com `UNSIGNED2 qtd`, `UNSIGNED4 total` e `STRING60 tipos` (os tipos na ordem da data, separados por `' > '`, por exemplo `INJURY > INJURY > COLLISION`).

```ecl
IMPORT Aula;

```

## DICA
Ordene por `cliente_id, dt`. No `PROJECT` de preparação: `qtd := 1`, `total := LEFT.valor`, `tipos := TRIM(LEFT.tipo)`.

## GABARITO
```ecl
IMPORT Aula;

Layout_R := RECORD
  UNSIGNED4 cliente_id;
  UNSIGNED2 qtd;
  UNSIGNED4 total;
  STRING60  tipos;
END;

Base := PROJECT(SORT(Aula.Sinistros, cliente_id, dt),
                TRANSFORM(Layout_R, SELF.qtd := 1; SELF.total := LEFT.valor; SELF.tipos := TRIM(LEFT.tipo); SELF := LEFT));

OUTPUT(ROLLUP(Base,
              LEFT.cliente_id = RIGHT.cliente_id,
              TRANSFORM(Layout_R,
                        SELF.qtd   := LEFT.qtd + 1;
                        SELF.total := LEFT.total + RIGHT.total;
                        SELF.tipos := TRIM(LEFT.tipos) + ' > ' + TRIM(RIGHT.tipos);
                        SELF := LEFT)));
```

# EXERCICIO: O maior sinistro de cada oficina, com GROUP

Usando `GROUP` e `TOPN`, mostre o sinistro de maior valor de cada oficina (ignore oficina vazia). Resultado ordenado por oficina.

```ecl
IMPORT Aula;

```

## GABARITO
```ecl
IMPORT Aula;

G := GROUP(SORT(Aula.Sinistros(oficina <> ''), oficina), oficina);
OUTPUT(SORT(UNGROUP(TOPN(G, 1, -valor)), oficina));
```
No dia 3 você fez isso com `DEDUP(SORT(...))`. Os dois funcionam. `GROUP` + `TOPN` generaliza para "os N maiores de cada grupo", que o DEDUP também faz com `KEEP n`, mas a versão agrupada combina com todo o resto (ITERATE, ROLLUP, PROJECT).

# EXERCICIO: Dias desde o sinistro anterior

Para cada sinistro, calcule quantos dias se passaram desde o sinistro **anterior do mesmo cliente** (0 para o primeiro de cada cliente). Campos: `cliente_id`, `sinistro_id`, `dt`, `UNSIGNED4 dias_desde_anterior`. Ordene por `cliente_id, dt`.

```ecl
IMPORT Aula, STD;

```

## DICA
`GROUP` por cliente e `ITERATE`. Na primeira linha de cada grupo `LEFT.dt` é 0: use `IF(LEFT.dt = 0, 0, STD.Date.DaysBetween(LEFT.dt, RIGHT.dt))`.

## GABARITO
```ecl
IMPORT Aula, STD;

Layout_D := RECORD
  UNSIGNED4 cliente_id;
  UNSIGNED4 sinistro_id;
  UNSIGNED4 dt;
  UNSIGNED4 dias_desde_anterior;
END;

Base := PROJECT(Aula.Sinistros, TRANSFORM(Layout_D, SELF.dias_desde_anterior := 0; SELF := LEFT));
G    := GROUP(SORT(Base, cliente_id, dt), cliente_id);

ComDias := ITERATE(G, TRANSFORM(Layout_D,
                                SELF.dias_desde_anterior := IF(LEFT.dt = 0, 0, STD.Date.DaysBetween(LEFT.dt, RIGHT.dt));
                                SELF := RIGHT));
OUTPUT(SORT(UNGROUP(ComDias), cliente_id, dt));
```

# DESAFIO: Detector de sinistros em série

Sem dica. Tabelas grandes, no Thor. Tudo o que você precisa está nos dias 1 a 10.

A unidade de investigação da seguradora quer uma lista de **segurados com sinistros de lesão corporal em série**. Usando `Treino.Arquivos.Sinistros` e `Treino.Arquivos.Pessoas`:

1. Considere apenas os sinistros do tipo `INJURY`.
2. Para cada sinistro, calcule `dias_desde_anterior`: dias desde o sinistro de lesão anterior **da mesma pessoa** (0 para o primeiro).
3. Monte o resumo por pessoa: `person_id`, `qtd` (sinistros de lesão), `total` (soma de `amount`, `UNSIGNED8`), `menor_intervalo` (o menor `dias_desde_anterior` entre os sinistros que **não** são o primeiro da pessoa; 0 se só houver um).
4. **Em série** é quem tem `qtd >= 4`.
5. Acrescente `first_name`, `last_name` e `state` da pessoa. A contagem de linhas não pode mudar nesse cruzamento.
6. Descubra em qual oficina (`repair_shop`) os sinistros de lesão das pessoas em série mais acontecem.

Entregue quatro resultados, nesta ordem: (a) a quantidade de pessoas em série; (b) as 10 pessoas em série de maior `total`, com nome e estado (desempate por `person_id`); (c) a quantidade de pessoas em série por `state`, da maior para a menor (desempate por `state`); (d) as 3 oficinas com mais sinistros de lesão de pessoas em série, com a quantidade.

```ecl thor
IMPORT Treino, STD;
A := Treino.Arquivos;

```

## GABARITO
```ecl thor
IMPORT Treino, STD;
A := Treino.Arquivos;

Lesoes := A.Sinistros(claim_type = 'INJURY');

// 2) dias desde o sinistro anterior da mesma pessoa
Layout_L := RECORD
  UNSIGNED4 person_id;
  UNSIGNED4 claim_date;
  UNSIGNED4 amount;
  STRING25  repair_shop;
  UNSIGNED4 dias_desde_anterior;
  BOOLEAN   primeiro;
END;

Base := PROJECT(Lesoes, TRANSFORM(Layout_L, SELF.dias_desde_anterior := 0; SELF.primeiro := FALSE; SELF := LEFT));
G    := GROUP(SORT(Base, person_id, claim_date), person_id);

ComDias := UNGROUP(ITERATE(G, TRANSFORM(Layout_L,
                                        SELF.primeiro            := LEFT.claim_date = 0;
                                        SELF.dias_desde_anterior := IF(LEFT.claim_date = 0, 0, STD.Date.DaysBetween(LEFT.claim_date, RIGHT.claim_date));
                                        SELF := RIGHT)));

// 3) resumo por pessoa
Resumo := TABLE(ComDias,
                {person_id,
                 UNSIGNED2 qtd             := COUNT(GROUP),
                 UNSIGNED8 total           := SUM(GROUP, amount),
                 UNSIGNED4 menor_intervalo := MIN(GROUP, IF(primeiro, 999999, dias_desde_anterior))},
                person_id);

// 4) em série
EmSerie := PROJECT(Resumo(qtd >= 4),
                   TRANSFORM(RECORDOF(Resumo),
                             SELF.menor_intervalo := IF(LEFT.menor_intervalo = 999999, 0, LEFT.menor_intervalo);
                             SELF := LEFT));

// 5) nome e estado, sem alterar a contagem
Layout_Final := RECORD
  RECORDOF(EmSerie);
  STRING20 first_name;
  STRING20 last_name;
  STRING2  state;
END;

Final := JOIN(EmSerie, A.Pessoas,
              LEFT.person_id = RIGHT.id,
              TRANSFORM(Layout_Final, SELF := LEFT; SELF := RIGHT),
              LEFT OUTER, KEEP(1));

// 6) oficinas dos sinistros de lesão das pessoas em série
LesoesEmSerie := JOIN(Lesoes, EmSerie, LEFT.person_id = RIGHT.person_id, TRANSFORM(LEFT), LOOKUP);
PorOficina    := TABLE(LesoesEmSerie, {repair_shop, UNSIGNED4 qtd := COUNT(GROUP)}, repair_shop, FEW);

OUTPUT(COUNT(Final));
OUTPUT(TOPN(Final, 10, -total, person_id));
OUTPUT(SORT(TABLE(Final, {state, UNSIGNED4 qtd := COUNT(GROUP)}, state, FEW), -qtd, state));
OUTPUT(TOPN(PorOficina, 3, -qtd, repair_shop));
```
Pontos de sênior neste gabarito: o `MIN` com `IF(primeiro, 999999, ...)` ignora o primeiro sinistro de cada pessoa sem precisar de um segundo JOIN; `TRANSFORM(LEFT)` é o atalho para "devolva o registro da esquerda como está"; o último JOIN usa `LOOKUP` porque `EmSerie` é minúsculo perto de `Lesoes`.

E o resultado: uma oficina chamada **Crash Kings Auto** dispara na frente de todas as outras. No arquivo de 30 mil linhas ela era invisível, 0,7% dos registros. O seu código a encontrou. Guarde esse workunit: no dia 28 você volta para desmontar essa quadrilha inteira.

# TESTE

? O que acontece no spray?
- O código ECL é compilado para C++
+ Um arquivo da landing zone é copiado para o cluster e dividido em partes pelos nós
- Os índices são carregados no Roxie
- As partes de um arquivo são reunidas em um só
! Spray distribui; despray reúne.

? `DATASET('~x::clientes', Layout, CSV(HEADING(1)))` — como os campos do layout são preenchidos?
- Pelo nome das colunas no cabeçalho
+ Pela posição das colunas no arquivo
- Em ordem alfabética
- Pelo tipo de cada coluna
! CSV é posicional. Layout em ordem errada lê dados deslocados sem dar erro.

? Qual opção de JOIN usar para listar pedidos cujo cliente NÃO existe no cadastro (pedidos à esquerda)?
- `LEFT OUTER`
- `RIGHT ONLY`
+ `LEFT ONLY`
- `FULL OUTER`
! LEFT ONLY devolve os registros da esquerda sem par.

? A chave aparece 3 vezes à esquerda e 4 à direita. Quantas linhas um inner join gera para ela?
- 7
+ 12
- 4
- 3
! Uma por par: 3 × 4.

? Você precisa trocar um código de 2 letras pelo nome em uma tabela de 5 bilhões de linhas, usando uma tabela de 60 códigos. Qual a melhor forma?
- JOIN comum
- JOIN com `ALL`
+ JOIN com `LOOKUP`
- Self-join
! A tabela pequena vai para a memória de cada nó; os 5 bilhões não são reordenados.

? O que `ATMOST(50)` faz com um registro da esquerda que casa com 800 registros da direita?
- Gera 50 pares
+ Não gera nenhum par para ele
- Falha o job
- Gera 800 pares e emite um aviso
! ATMOST descarta o registro "explosivo" por inteiro. É a defesa contra chave lixo.

? Qual condição evita pares repetidos e o registro casando consigo mesmo em um self-join?
- `LEFT.id = RIGHT.id`
- `LEFT.id <> RIGHT.id`
+ `LEFT.id < RIGHT.id`
- `LEFT.id >= RIGHT.id`
! `<>` remove o auto-par, mas mantém (A,B) e (B,A). `<` remove os dois problemas.

? O arquivo `ecl/Fraude/Regras.ecl` precisa exportar uma definição chamada...
- `Fraude`
+ `Regras`
- `Fraude_Regras`
- qualquer nome
! Nome do arquivo = nome da definição exportada.

? Qual palavra torna uma definição visível só dentro do próprio módulo?
- `EXPORT`
- `LOCAL`
+ `SHARED`
- `PRIVATE`
! SHARED: visível no módulo, invisível para quem importa.

? No transform de um `ITERATE`, o que são LEFT e RIGHT?
- LEFT é a tabela da esquerda e RIGHT a da direita
+ LEFT é o registro anterior já transformado; RIGHT é o registro atual
- LEFT é o atual e RIGHT o próximo
- LEFT é o primeiro registro do grupo e RIGHT o último
! Por isso se termina com `SELF := RIGHT`.

? Quando preferir `ROLLUP` a um `TABLE` agrupado?
- Sempre, é mais rápido
+ Quando a fusão das linhas exige lógica própria, como concatenar textos ou guardar primeiro e último valor
- Quando não há campo de grupo
- Quando os dados não estão ordenados
! TABLE resolve agregações padrão; ROLLUP dá um transform para lógica livre.

? O que muda depois de `G := GROUP(SORT(ds, cliente_id), cliente_id)`?
- Os dados são gravados em disco por cliente
- O dataset passa a ter uma linha por cliente
+ Operações como TOPN, ITERATE e SORT passam a atuar dentro de cada grupo separadamente
- Nada, GROUP é só um comentário
! GROUP marca fronteiras; cada grupo é tratado como uma mini-tabela.

? Em `ROLLUP(G, GROUP, TRANSFORM(...))`, o que é `ROWS(LEFT)`?
- O número de linhas do dataset
- O primeiro registro do grupo
+ Todos os registros do grupo atual, como um dataset
- Os registros que não entraram em nenhum grupo
! Permite usar COUNT, SUM, MAX e filtros sobre o grupo inteiro dentro do transform.

? Qual é a causa mais comum de skew em um JOIN?
- Usar LOOKUP
+ Muitos registros com a mesma chave, tipicamente vazia ou padrão
- Usar tipos UNSIGNED
- Ter poucos registros
! Chaves como '' ou 0 concentram milhões de registros num único nó.

? Por que conferir `COUNT` antes e depois de um JOIN de enriquecimento?
- Porque o JOIN só executa se houver COUNT
+ Para detectar explosão (chave duplicada do outro lado) ou perda de registros
- Para acelerar o JOIN
- Para o resultado sair ordenado
! É o teste de sanidade mais barato que existe.

# FLASHCARDS

Q: ITERATE: quem é LEFT e quem é RIGHT?
A: LEFT = linha anterior já transformada (vazia na primeira); RIGHT = linha atual. Termina com `SELF := RIGHT`.
Q: ROLLUP: quem é LEFT e quem é RIGHT?
A: LEFT = acumulado até agora; RIGHT = próximo registro. Precisa de SORT antes.
Q: O que o GROUP faz?
A: Marca fronteiras: TOPN, ITERATE, SORT, DEDUP, COUNTER passam a valer por grupo. `UNGROUP` desfaz.
Q: Como pegar os N maiores de cada grupo?
A: `UNGROUP(TOPN(GROUP(SORT(ds, chave), chave), N, -valor))`
Q: Forma de ROLLUP que roda uma vez por grupo.
A: `ROLLUP(agrupado, GROUP, TRANSFORM(..., ROWS(LEFT) ...))`
Q: DEDUP × TABLE × ROLLUP.
A: DEDUP descarta repetidos; TABLE agrega (COUNT/SUM); ROLLUP funde com lógica livre.
Q: Atalho para um JOIN devolver o registro da esquerda intacto.
A: `TRANSFORM(LEFT)`
