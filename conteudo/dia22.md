---
dia: 22
modulo: 5
titulo: LOOP, AGGREGATE, DICTIONARY e INTERFACE
horas: 3
---

# MISSAO

> [goggins] Hoje é caixa de ferramentas. Quatro peças que você não usa todo dia, mas no dia em que precisa, não existe substituto. A diferença entre o profissional e o amador não é saber usar o martelo: é saber que existe uma chave específica para aquele parafuso esquisito, em vez de ficar duas horas batendo com o martelo.

**Hoje você vai:**

- Repetir um processamento até estabilizar com `LOOP` (e fechar a pendência do dia 15).
- Agregar com lógica própria usando `AGGREGATE`.
- Fazer consultas instantâneas em memória com `DICTIONARY`.
- Organizar parâmetros com `INTERFACE`.

# PILULA: DICTIONARY: a colinha de bolso

> [crianca] Você tem um papelzinho no bolso: "FL = Flórida, GA = Geórgia". Quando alguém fala "GA", você olha o papelzinho e responde na hora. Você não faz fila, não junta tabelas: só **consulta**.

> [tecnico] `DICTIONARY(dataset, {chave => valores})` cria uma tabela hash em memória. Você consulta com colchetes, `D[chave].campo`, e testa existência com `chave IN D`. Chave inexistente devolve valores vazios, sem erro. É a alternativa a um JOIN `LOOKUP` quando a tradução acontece **dentro de uma expressão** (num TRANSFORM, num filtro). Só para tabelas pequenas.

```ecl
IMPORT Aula;

Codigos := DATASET([{'FL', 'Florida', 'Sudeste'}, {'GA', 'Georgia', 'Sudeste'}, {'TX', 'Texas', 'Sul'},
                    {'NY', 'New York', 'Nordeste'}], {STRING2 uf, STRING12 nome, STRING10 regiao});

Estados := DICTIONARY(Codigos, {uf => nome, regiao});

OUTPUT(Estados['GA'].nome,   NAMED('NomeDaGA'));
OUTPUT('CA' IN Estados,      NAMED('TemCalifornia'));

// Dentro de um TRANSFORM, sem JOIN
OUTPUT(PROJECT(Aula.Clientes,
               TRANSFORM({UNSIGNED4 id, STRING10 nome, STRING12 estado_nome, STRING10 regiao},
                         SELF.estado_nome := IF(LEFT.estado IN Estados, Estados[LEFT.estado].nome, 'DESCONHECIDO');
                         SELF.regiao      := Estados[LEFT.estado].regiao;
                         SELF := LEFT)), NAMED('ClientesComRegiao'));
```

# PILULA: AGGREGATE: agregação com TRANSFORM

> [tecnico] O `TABLE` agrupado oferece COUNT, SUM, MAX, MIN, AVE. Quando o resumo do grupo precisa de **lógica própria** (montar uma lista, guardar o registro "vencedor" por uma regra), use `AGGREGATE(dataset, LayoutSaida, transform, campos_de_grupo)`. No transform, `LEFT` é o registro de entrada da vez e `RIGHT` é o **resultado acumulado** do grupo até ali (vazio no primeiro). Diferente do ROLLUP, não exige ordenação.

```ecl
IMPORT Aula;

Layout_R := {STRING10 tipo, UNSIGNED2 qtd, UNSIGNED4 total, UNSIGNED4 maior_valor, UNSIGNED4 id_do_maior, STRING80 ids};

Resumo := AGGREGATE(Aula.Sinistros, Layout_R,
                    TRANSFORM(Layout_R,
                              SELF.tipo        := LEFT.tipo;
                              SELF.qtd         := RIGHT.qtd + 1;
                              SELF.total       := RIGHT.total + LEFT.valor;
                              SELF.maior_valor := MAX(RIGHT.maior_valor, LEFT.valor);
                              SELF.id_do_maior := IF(LEFT.valor > RIGHT.maior_valor, LEFT.sinistro_id, RIGHT.id_do_maior);
                              SELF.ids         := TRIM(RIGHT.ids) + IF(RIGHT.ids = '', '', ',') + (STRING)LEFT.sinistro_id),
                    LEFT.tipo, FEW);

OUTPUT(SORT(Resumo, tipo));
```

"O id do maior sinistro de cada tipo" e "a lista de ids", numa passada só. Com TABLE você precisaria de um JOIN extra.

# PILULA: LOOP: repetir até estabilizar

> [crianca] Brincadeira do telefone sem fio ao contrário: cada criança da roda olha para os vizinhos e passa a usar **o menor número** que vir. Na primeira rodada só os vizinhos diretos se acertam. Na segunda, o número menor já andou mais um pouco. Depois de algumas rodadas, toda a roda tem o mesmo número. Ninguém sabia quantas rodadas seriam: você repete **até ninguém mais mudar**.

> [tecnico] ECL não tem `for` nem `while` sobre linhas, porque as operações já são sobre conjuntos. Mas alguns problemas são **iterativos por natureza**: o resultado de uma passada é a entrada da próxima. `LOOP(dataset, n, corpo)` aplica o `corpo` `n` vezes; dentro dele, `ROWS(LEFT)` é o dataset que veio da iteração anterior e `COUNTER` é o número da rodada. Há também a forma com condição, que para quando o dataset fica vazio ou a condição deixa de valer.

O exemplo clássico é o **fecho transitivo**, a pendência do dia 15. Temos pares "A é a mesma pessoa que B" formando **cadeias**: 1-2, 2-3, 3-4. Queremos que 1, 2, 3 e 4 recebam o mesmo grupo.

```ecl
Pares := DATASET([{1, 2}, {2, 3}, {3, 4}, {10, 11}], {UNSIGNED4 a, UNSIGNED4 b});

// Cada nó começa sendo o seu próprio grupo
Layout_No := {UNSIGNED4 id, UNSIGNED4 grupo};
Inicio := DATASET([{1,1},{2,2},{3,3},{4,4},{10,10},{11,11},{20,20}], Layout_No);

// Uma rodada: cada nó adota o menor grupo entre os seus vizinhos, se for menor que o dele
Rodada(DATASET(Layout_No) atual) := FUNCTION
  Layout_V := {UNSIGNED4 id, UNSIGNED4 g};
  Vizinhos := JOIN(Pares, atual, LEFT.a = RIGHT.id, TRANSFORM(Layout_V, SELF.id := LEFT.b; SELF.g := RIGHT.grupo))
            + JOIN(Pares, atual, LEFT.b = RIGHT.id, TRANSFORM(Layout_V, SELF.id := LEFT.a; SELF.g := RIGHT.grupo));
  Menor := TABLE(Vizinhos, {id, UNSIGNED4 g := MIN(GROUP, g)}, id);
  RETURN JOIN(atual, Menor, LEFT.id = RIGHT.id,
              TRANSFORM(Layout_No,
                        SELF.grupo := IF(RIGHT.id <> 0 AND RIGHT.g < LEFT.grupo, RIGHT.g, LEFT.grupo);
                        SELF := LEFT),
              LEFT OUTER, LOOKUP);
END;

OUTPUT(SORT(LOOP(Inicio, 1, Rodada(ROWS(LEFT))), id), NAMED('Depois_de_1_rodada'));
OUTPUT(SORT(LOOP(Inicio, 2, Rodada(ROWS(LEFT))), id), NAMED('Depois_de_2_rodadas'));
OUTPUT(SORT(LOOP(Inicio, 3, Rodada(ROWS(LEFT))), id), NAMED('Depois_de_3_rodadas'));
```

Acompanhe o nó 4: depois de 1 rodada ele está no grupo 3; depois de 2, no grupo 2; depois de 3, no grupo 1. A cadeia fechou. O passo de um dia inteiro do dia 15 (menor id ligado) é a **primeira rodada** disso.

> [real] O vínculo de registros de produção roda esse laço em bilhões de registros, até a quantidade de mudanças numa rodada chegar a zero. Cada rodada é um conjunto de JOINs caros, então o número de rodadas é monitorado: cadeias longas demais costumam indicar uma regra de ligação frouxa, que está encadeando pessoas diferentes.

# PILULA: INTERFACE: um contrato de parâmetros

> [crianca] O formulário de matrícula da escola tem sempre os mesmos campos: nome, idade, série. Não importa quem preenche nem de onde vem: se você tem o formulário preenchido, a secretaria sabe atender. `INTERFACE` é o formulário em branco; cada situação preenche o seu.

> [tecnico] Uma consulta de busca real tem 30 parâmetros. Passar 30 argumentos de função em função é inviável. `INTERFACE` declara um **conjunto nomeado de valores**, com padrões opcionais. Um `MODULE(NomeDaInterface)` é uma implementação concreta, que preenche (ou herda) os valores. As funções recebem **um** parâmetro: a interface. E `STORED(NomeDaInterface)` cria automaticamente um `STORED` para cada campo, que é como a camada de consulta Roxie entrega os parâmetros para a lógica.

```ecl
IMPORT Treino;

IBusca := INTERFACE
  EXPORT STRING20  sobrenome;
  EXPORT STRING20  nome   := '';
  EXPORT STRING2   estado := '';
  EXPORT UNSIGNED2 maximo := 5;
END;

// A lógica recebe o "formulário preenchido", não 4 argumentos soltos
Buscar(IBusca p) := CHOOSEN(Treino.Chaves.PorNome(KEYED(lname_clean = p.sobrenome),
                                                 KEYED(p.nome = '' OR fname_clean = p.nome),
                                                 KEYED(p.estado = '' OR state = p.estado)), p.maximo);

// Duas implementações diferentes do mesmo contrato
BuscaA := MODULE(IBusca)
  EXPORT STRING20 sobrenome := 'NGUYEN';
  EXPORT STRING2  estado    := 'TX';
END;

BuscaB := MODULE(IBusca)
  EXPORT STRING20  sobrenome := 'KING';
  EXPORT STRING20  nome      := 'CHARLES';
  EXPORT UNSIGNED2 maximo    := 2;
END;

OUTPUT(Buscar(BuscaA), NAMED('NguyenNoTexas'));
OUTPUT(Buscar(BuscaB), NAMED('CharlesKing'));
```

> [real] Esse é o desenho das consultas grandes: a consulta Roxie é uma casca fina que lê os `STORED` para dentro de uma interface e chama a função de busca; a mesma função é chamada pelo processo em lote no Thor com outra implementação da interface. Uma lógica, vários pontos de entrada, sem duplicar código.

# EXERCICIO: Tradução com DICTIONARY

Crie um dicionário de `tipo` de sinistro para `STRING12 descricao`: `COLLISION` → `Colisao`, `INJURY` → `Lesao`, `GLASS` → `Vidro`, `THEFT` → `Roubo`. Mostre `sinistro_id`, `tipo` e `descricao` de todos os sinistros de `Aula.Sinistros`; quando o tipo não estiver no dicionário, a descrição deve ser `Outro`. Ordene por `sinistro_id`.

```ecl
IMPORT Aula;

```

## GABARITO
```ecl
IMPORT Aula;

D := DICTIONARY(DATASET([{'COLLISION', 'Colisao'}, {'INJURY', 'Lesao'}, {'GLASS', 'Vidro'}, {'THEFT', 'Roubo'}],
                        {STRING10 tipo, STRING12 descricao}), {tipo => descricao});

OUTPUT(SORT(PROJECT(Aula.Sinistros,
                    TRANSFORM({UNSIGNED4 sinistro_id, STRING10 tipo, STRING12 descricao},
                              SELF.descricao := IF(LEFT.tipo IN D, D[LEFT.tipo].descricao, 'Outro');
                              SELF := LEFT)), sinistro_id));
```

# EXERCICIO: Juros compostos com LOOP

Comece com um dataset de uma linha `{UNSIGNED1 mes := 0, DECIMAL12_2 saldo := 1000}`. Use `LOOP` para aplicar 12 rodadas em que `mes` aumenta 1 e `saldo` cresce 2%. Mostre o resultado final.

```ecl

```

## DICA
`LOOP(Inicio, 12, PROJECT(ROWS(LEFT), TRANSFORM(...)))`.

## GABARITO
```ecl
Layout := {UNSIGNED1 mes, DECIMAL12_2 saldo};
Inicio := DATASET([{0, 1000}], Layout);

OUTPUT(LOOP(Inicio, 12,
            PROJECT(ROWS(LEFT), TRANSFORM(Layout, SELF.mes := LEFT.mes + 1; SELF.saldo := LEFT.saldo * 1.02))));
```

# EXERCICIO: A loja preferida, com AGGREGATE

Com `AGGREGATE` sobre `Aula.Transacoes`, produza por `cliente_id`: `UNSIGNED2 qtd`, `DECIMAL10_2 total`, `DECIMAL9_2 maior_compra` e `STRING16 loja_da_maior` (a loja onde foi feita a maior compra). Ordene por `cliente_id`.

```ecl
IMPORT Aula;

```

## GABARITO
```ecl
IMPORT Aula;

Layout_R := {UNSIGNED4 cliente_id, UNSIGNED2 qtd, DECIMAL10_2 total, DECIMAL9_2 maior_compra, STRING16 loja_da_maior};

R := AGGREGATE(Aula.Transacoes, Layout_R,
               TRANSFORM(Layout_R,
                         SELF.cliente_id    := LEFT.cliente_id;
                         SELF.qtd           := RIGHT.qtd + 1;
                         SELF.total         := RIGHT.total + LEFT.valor;
                         SELF.maior_compra  := MAX(RIGHT.maior_compra, LEFT.valor);
                         SELF.loja_da_maior := IF(LEFT.valor > RIGHT.maior_compra, LEFT.loja, RIGHT.loja_da_maior)),
               LEFT.cliente_id);
OUTPUT(SORT(R, cliente_id));
```

# REAL: Fecho transitivo de verdade no cadastro

No dia 15 você atribuiu o `entidade_id` em **uma passada** e eu avisei que cadeias poderiam ficar abertas. Hora de provar, no Thor, que o resultado está fechado, usando `LOOP`.

1. Pegue os pares aprovados: `Treino.Vinculo.Candidatos(Treino.Arquivos.PessoasLimpas)(pontos >= 7)` (campos `id_a`, `id_b`).
2. Crie os nós: um por `id` de `PessoasLimpas`, com `grupo` inicial igual ao próprio `id`.
3. Escreva a função `Rodada` (como na pílula) e aplique `LOOP` com **4 rodadas**.
4. Entregue, nesta ordem: (a) a quantidade de grupos distintos depois de 1 rodada; (b) depois de 4 rodadas; (c) quantos nós mudaram de grupo entre a rodada 1 e a rodada 4.

```ecl thor
IMPORT Treino;
P := Treino.Arquivos.PessoasLimpas;

```

## DICA
Para o item (c), junte o resultado de 1 rodada com o de 4 rodadas por `id` e conte onde o `grupo` difere.

## GABARITO
```ecl thor
IMPORT Treino;
P := Treino.Arquivos.PessoasLimpas;

Pares := PROJECT(Treino.Vinculo.Candidatos(P)(pontos >= 7), {UNSIGNED4 id_a, UNSIGNED4 id_b});

Layout_No := {UNSIGNED4 id, UNSIGNED4 grupo};
Inicio := PROJECT(P, TRANSFORM(Layout_No, SELF.grupo := LEFT.id; SELF := LEFT));

Rodada(DATASET(Layout_No) atual) := FUNCTION
  Layout_V := {UNSIGNED4 id, UNSIGNED4 g};
  Vizinhos := JOIN(Pares, atual, LEFT.id_a = RIGHT.id, TRANSFORM(Layout_V, SELF.id := LEFT.id_b; SELF.g := RIGHT.grupo))
            + JOIN(Pares, atual, LEFT.id_b = RIGHT.id, TRANSFORM(Layout_V, SELF.id := LEFT.id_a; SELF.g := RIGHT.grupo));
  Menor := TABLE(Vizinhos, {id, UNSIGNED4 g := MIN(GROUP, g)}, id);
  RETURN JOIN(atual, Menor, LEFT.id = RIGHT.id,
              TRANSFORM(Layout_No,
                        SELF.grupo := IF(RIGHT.id <> 0 AND RIGHT.g < LEFT.grupo, RIGHT.g, LEFT.grupo);
                        SELF := LEFT),
              LEFT OUTER, LOOKUP);
END;

R1 := LOOP(Inicio, 1, Rodada(ROWS(LEFT)));
R4 := LOOP(Inicio, 4, Rodada(ROWS(LEFT)));

Mudaram := JOIN(R1, R4, LEFT.id = RIGHT.id AND LEFT.grupo <> RIGHT.grupo, TRANSFORM(LEFT));

OUTPUT(COUNT(TABLE(R1, {grupo}, grupo)));
OUTPUT(COUNT(TABLE(R4, {grupo}, grupo)));
OUTPUT(COUNT(Mudaram));
```
20.000 grupos nas duas medições e zero nós mudando: nos dados do curso todo cadastro duplicado se liga direto ao original, então uma rodada já fecha tudo. Agora você **sabe** disso, em vez de supor. Em dados reais a diferença entre as duas contagens existe e é exatamente a quantidade de cadeias que a passada única teria deixado abertas. Verificar a suposição em vez de confiar nela: guarde esse hábito.

# QUIZ

? Como consultar o valor de uma chave em um DICTIONARY `D`?
- `D(chave).campo`
+ `D[chave].campo`
- `LOOKUP(D, chave)`
- `D.chave`
! Colchetes com a chave; `chave IN D` testa a existência.

? O que acontece ao consultar uma chave que não existe em um DICTIONARY?
- Erro em tempo de execução
- O job para
+ Devolve os campos com valor vazio/zero
- Devolve o primeiro registro
! Por isso é comum testar `chave IN D` quando o vazio precisa de tratamento.

? No transform de `AGGREGATE`, o que é `RIGHT`?
- O próximo registro de entrada
+ O resultado acumulado do grupo até o momento
- O registro anterior de entrada
- A tabela da direita
! LEFT é o registro de entrada da vez; RIGHT é o acumulado (vazio no início).

? Quando AGGREGATE é preferível a TABLE agrupado?
- Sempre
+ Quando o resumo exige lógica que COUNT/SUM/MAX/MIN não expressam, como guardar o id do maior ou montar uma lista
- Quando há poucos grupos
- Quando os dados estão ordenados
! AGGREGATE dá um transform para acumular com regra própria.

? O que `LOOP(ds, 3, Corpo(ROWS(LEFT)))` faz?
- Executa o corpo uma vez para cada 3 registros
+ Aplica o corpo 3 vezes, cada vez sobre o resultado da vez anterior
- Divide o dataset em 3 partes
- Repete até o dataset ficar vazio
! ROWS(LEFT) é o dataset vindo da iteração anterior.

? Por que o fecho transitivo precisa de várias rodadas?
- Porque o Thor erra na primeira
+ Porque em cada rodada a informação do menor grupo só avança um elo na cadeia
- Porque os pares estão desordenados
- Porque o LOOP exige no mínimo 2
! Cadeia de comprimento k precisa de cerca de k rodadas para o menor id chegar à ponta.

? Para que serve uma INTERFACE?
- Para criar telas no ECL Watch
+ Para declarar um conjunto nomeado de parâmetros que as funções recebem como um único argumento
- Para acelerar JOINs
- Para definir o layout de um arquivo
! Um contrato de parâmetros; MODULE(Interface) fornece os valores.

# FLASHCARDS

Q: Como criar e consultar um DICTIONARY?
A: `D := DICTIONARY(ds, {chave => valor});` → `D[k].valor`, `k IN D`.
Q: Assinatura do AGGREGATE.
A: `AGGREGATE(ds, LayoutSaida, TRANSFORM(..., LEFT = entrada, RIGHT = acumulado), campos_de_grupo)`
Q: Forma simples do LOOP.
A: `LOOP(ds, n, corpo_usando_ROWS(LEFT))` — o corpo é aplicado n vezes.
Q: O que é fecho transitivo?
A: Propagar o identificador por cadeias (A-B, B-C ⇒ A, B, C no mesmo grupo), repetindo até estabilizar.
Q: INTERFACE e sua implementação.
A: `I := INTERFACE EXPORT TIPO campo := padrão; END;` e `M := MODULE(I) EXPORT TIPO campo := valor; END;`
Q: Quando usar DICTIONARY em vez de JOIN LOOKUP?
A: Quando a tradução acontece dentro de uma expressão/transform e a tabela é pequena.
