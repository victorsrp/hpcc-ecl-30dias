---
dia: 12
modulo: 3
titulo: Como o Thor distribui: DISTRIBUTE, LOCAL e skew
horas: 3
---

# MISSAO

> [goggins] Até agora você escreveu ECL que **funciona**. Hoje você começa a escrever ECL que **escala**. A diferença está em entender o que acontece dentro da máquina quando você aperta Rodar. Quem não entende isso escreve job que roda em 10 minutos com 1 milhão de linhas e nunca termina com 1 bilhão, e não sabe por quê. Você vai saber por quê.

**Hoje você vai:**

- Enxergar como os dados ficam espalhados pelos nós.
- Controlar a distribuição com `DISTRIBUTE` e `HASH32`.
- Usar `LOCAL` para cada nó trabalhar sozinho, sem conversar com os outros.
- Medir skew e ler o grafo de execução no ECL Watch.

O seu cluster de estudo tem **2 workers** de Thor. Em produção são centenas, mas o raciocínio é idêntico. Todos os blocos de hoje rodam no thor.

# PILULA: O dado mora espalhado

> [crianca] Dois amigos dividem um baralho: metade das cartas na mesa de um, metade na mesa do outro. Se você perguntar "quantas cartas vermelhas temos?", cada um conta as suas e vocês somam: rápido, cada um trabalha sozinho. Mas se você perguntar "tem alguma carta repetida?", complica: a repetida de uma carta pode estar **na mesa do outro**. Para resolver, primeiro vocês precisam combinar: "todas as cartas de número igual vão para a mesma mesa".

> [tecnico] Num cluster Thor de N workers, cada arquivo tem N partes e cada worker processa a sua. Operações **linha a linha** (filtro, `PROJECT`) são triviais: cada nó trabalha na sua parte. Operações que precisam **ver registros de mesma chave juntos** (`JOIN`, `DEDUP`, `ROLLUP`, `TABLE` agrupado, `SORT` global) obrigam o Thor a mover dados entre nós pela rede. Mover dados é o que mais custa.

Veja em qual nó cada registro está. `STD.System.Thorlib.Node()` devolve o número do nó (começa em 0) e `CLUSTERSIZE` o total de workers:

```ecl thor
IMPORT Treino, STD;
P := Treino.Arquivos.Pessoas;

OUTPUT(CLUSTERSIZE, NAMED('Workers'));

PorNo := TABLE(P, {UNSIGNED2 no := STD.System.Thorlib.Node(), UNSIGNED4 qtd := COUNT(GROUP)},
               STD.System.Thorlib.Node(), LOCAL);
OUTPUT(PorNo, NAMED('LinhasPorNo'));
```

O arquivo foi gravado pelo spray em fatias iguais: metade em cada nó, sem critério nenhum sobre **quem** está em qual nó.

# PILULA: DISTRIBUTE: quem tem a mesma chave vai para a mesma mesa

> [tecnico] `DISTRIBUTE(recordset, HASH32(campos))` redistribui os registros: calcula um número (hash) a partir dos campos e manda cada registro para o nó `hash % N`. Garantia: **todos os registros com o mesmo valor de chave ficam no mesmo nó**. Não garante ordem e não garante equilíbrio: se uma chave tem muitos registros, o nó dela fica pesado.

```ecl thor
IMPORT Treino, STD;
P := Treino.Arquivos.Pessoas;

Conta(DATASET(RECORDOF(P)) ds) := TABLE(ds, {UNSIGNED2 no := STD.System.Thorlib.Node(), UNSIGNED4 qtd := COUNT(GROUP)},
                                        STD.System.Thorlib.Node(), LOCAL);

PorId     := DISTRIBUTE(P, HASH32(id));       // chave única: espalha bem
PorEstado := DISTRIBUTE(P, HASH32(state));    // 8 valores: tende a desequilibrar
PorSexo   := DISTRIBUTE(P, HASH32(gender));   // 2 valores: péssimo

OUTPUT(Conta(PorId),     NAMED('PorId'));
OUTPUT(Conta(PorEstado), NAMED('PorEstado'));
OUTPUT(Conta(PorSexo),   NAMED('PorSexo'));
```

> [cuidado] Chave boa de distribuição tem **muitos valores diferentes** e nenhum valor dominante: id de pessoa, número de conta, SSN não vazio. Chave ruim tem poucos valores (estado, sexo, status) ou um valor que concentra tudo (campo vazio). É a mesma doença do skew que você viu no dia 8, agora com o motivo exposto.

# PILULA: LOCAL: cada nó resolve o seu

> [crianca] Depois que vocês combinaram "cartas de número igual na mesma mesa", a pergunta das repetidas fica fácil: cada um procura repetidas **só na própria mesa**, ao mesmo tempo, sem falar com o outro. Ninguém precisa andar pela sala.

> [tecnico] A opção `LOCAL` diz: "execute esta operação **dentro de cada nó**, sem trocar dados com os outros". Vale para `SORT`, `DEDUP`, `ROLLUP`, `TABLE`, `JOIN`, `GROUP`, `ITERATE`. Só dá o resultado certo se os registros que precisam se encontrar **já estão no mesmo nó**, isto é, depois de um `DISTRIBUTE` pela chave. O padrão clássico:

```ecl thor
IMPORT Treino;
S := Treino.Arquivos.Sinistros;

// 1) Uma redistribuição só, pela chave que todas as próximas etapas usam
D := DISTRIBUTE(S, HASH32(person_id));

// 2) Daqui para frente, tudo LOCAL: nenhum dado cruza a rede de novo
Ordenado   := SORT(D, person_id, -claim_date, LOCAL);
MaisRecente := DEDUP(Ordenado, person_id, LOCAL);
Resumo     := TABLE(D, {person_id, UNSIGNED2 qtd := COUNT(GROUP), UNSIGNED8 total := SUM(GROUP, amount)}, person_id, LOCAL);

OUTPUT(COUNT(MaisRecente), NAMED('PessoasComSinistro'));
OUTPUT(COUNT(Resumo),      NAMED('LinhasDoResumo'));
OUTPUT(CHOOSEN(MaisRecente, 5), NAMED('Amostra'));
```

Sem os `LOCAL`, o Thor faria um sort global para o `SORT` e outra redistribuição para o `TABLE`: três viagens pela rede em vez de uma.

> [cuidado] `LOCAL` sem `DISTRIBUTE` antes produz **resultado errado sem erro nenhum**. Rode o bloco abaixo e compare as duas contagens: a segunda está inflada porque o mesmo estado existe nos dois nós e cada nó "achou" os seus.

```ecl thor
IMPORT Treino;
P := Treino.Arquivos.Pessoas;

OUTPUT(COUNT(DEDUP(SORT(P, state), state)),               NAMED('Certo_Global'));
OUTPUT(COUNT(DEDUP(SORT(P, state, LOCAL), state, LOCAL)), NAMED('Errado_LocalSemDistribute'));
OUTPUT(COUNT(DEDUP(SORT(DISTRIBUTE(P, HASH32(state)), state, LOCAL), state, LOCAL)), NAMED('Certo_DistributeMaisLocal'));
```

> [real] Num pipeline de produção é comum ver, logo no começo: `D := DISTRIBUTE(Base, HASH32(did));` e depois vinte operações `LOCAL` em cima. Uma viagem pela rede, vinte etapas de graça. Se as duas tabelas de um JOIN estão distribuídas pela mesma chave, `JOIN(A, B, ..., LOCAL)` também não move nada.

# PILULA: Ids únicos em paralelo

> [tecnico] No dia 4 você numerou linhas com `COUNTER`, e eu avisei que em escala isso tem custo: para a contagem ser global, um nó precisa esperar o outro. O truque é numerar **dentro de cada nó** (`PROJECT ... LOCAL`) com uma fórmula que não colide: o nó 0 gera 1, 3, 5...; o nó 1 gera 2, 4, 6... Em geral: `(COUNTER - 1) * CLUSTERSIZE + Node() + 1`.

```ecl thor
IMPORT Treino, STD;
V := Treino.Arquivos.Veiculos;

Layout_ComId := RECORD
  UNSIGNED8 seq;
  RECORDOF(V);
END;

ComId := PROJECT(V,
                 TRANSFORM(Layout_ComId,
                           SELF.seq := (COUNTER - 1) * CLUSTERSIZE + STD.System.Thorlib.Node() + 1;
                           SELF := LEFT),
                 LOCAL);

OUTPUT(COUNT(ComId),                                NAMED('Linhas'));
OUTPUT(COUNT(DEDUP(SORT(ComId, seq), seq)),         NAMED('IdsDistintos'));   // tem que ser igual
OUTPUT(CHOOSEN(ComId, 6),                           NAMED('Amostra'));
```

# PILULA: Lendo o grafo no ECL Watch

Rode qualquer bloco de hoje, clique no número do workunit na barra do editor e abra a aba de **métricas/grafos**. O que olhar:

| No grafo | Significa |
|---|---|
| Cada caixa | Uma **atividade**: Disk Read, Filter, Sort, Hash Distribute, Join, Hash Aggregate, Disk Write |
| Número na seta | Quantas **linhas** passaram de uma atividade para a outra |
| Subgrafos | Etapas; o Thor termina uma antes de começar a que depende dela |
| `Hash Distribute` | Dados cruzando a rede. Conte quantos aparecem: cada um é caro |
| Skew (+/- %) nas setas | O quanto o nó mais carregado/mais vazio se afasta da média. Acima de algumas dezenas de % é alerta |
| `Lookup Join`, `Local Sort` | Confirmação de que sua opção `LOOKUP`/`LOCAL` foi usada |
| Tempo por atividade | Onde o job gasta a vida. Otimize a caixa mais lenta, não a que você acha feia |

> [goggins] Ler grafo é chato. Ninguém gosta. E é a habilidade que separa quem "sabe ECL" de quem **resolve problema de produção às 3 da manhã**. A partir de hoje, todo job seu que rodar no Thor, você abre o grafo. Todo. Vira hábito ou não vira nada.

# EXERCICIO: Medindo a distribuição

Mostre quantas linhas de `Treino.Arquivos.Transacoes` ficam em cada nó em três situações, nesta ordem: (1) como está gravado; (2) distribuído por `HASH32(person_id)`; (3) distribuído por `HASH32(category)`. Cada resultado ordenado pelo número do nó.

```ecl thor
IMPORT Treino, STD;
T := Treino.Arquivos.Transacoes;

```

## GABARITO
```ecl thor
IMPORT Treino, STD;
T := Treino.Arquivos.Transacoes;

Conta(DATASET(RECORDOF(T)) ds) := SORT(TABLE(ds, {UNSIGNED2 no := STD.System.Thorlib.Node(), UNSIGNED4 qtd := COUNT(GROUP)},
                                             STD.System.Thorlib.Node(), LOCAL), no);

OUTPUT(Conta(T));
OUTPUT(Conta(DISTRIBUTE(T, HASH32(person_id))));
OUTPUT(Conta(DISTRIBUTE(T, HASH32(category))));
```

# EXERCICIO: Última transação de cada pessoa, sem sort global

Usando `DISTRIBUTE` + operações `LOCAL`, obtenha a transação mais recente de cada pessoa (maior `txn_date`, desempate pelo maior `txn_time`). Mostre a quantidade de linhas do resultado e as 5 de maior `amount` (desempate por `txn_id`).

```ecl thor
IMPORT Treino;
T := Treino.Arquivos.Transacoes;

```

## GABARITO
```ecl thor
IMPORT Treino;
T := Treino.Arquivos.Transacoes;

D       := DISTRIBUTE(T, HASH32(person_id));
Ultimas := DEDUP(SORT(D, person_id, -txn_date, -txn_time, LOCAL), person_id, LOCAL);

OUTPUT(COUNT(Ultimas));
OUTPUT(TOPN(Ultimas, 5, -amount, txn_id));
```

# EXERCICIO: Join local

Distribua `Treino.Arquivos.Veiculos` e `Treino.Arquivos.Sinistros` por `HASH32(vin)` e faça um JOIN `LOCAL` para obter, por `make`, a quantidade de sinistros e o valor total. Ordene pelo total decrescente.

```ecl thor
IMPORT Treino;
A := Treino.Arquivos;

```

## GABARITO
```ecl thor
IMPORT Treino;
A := Treino.Arquivos;

V := DISTRIBUTE(A.Veiculos,  HASH32(vin));
S := DISTRIBUTE(A.Sinistros, HASH32(vin));

J := JOIN(S, V, LEFT.vin = RIGHT.vin,
          TRANSFORM({STRING12 make, UNSIGNED4 amount}, SELF.make := RIGHT.make; SELF.amount := LEFT.amount),
          LOCAL);

OUTPUT(SORT(TABLE(J, {make, UNSIGNED4 qtd := COUNT(GROUP), UNSIGNED8 total := SUM(GROUP, amount)}, make, FEW), -total));
```
O layout de saída foi escrito inline com chaves dentro do `TRANSFORM`. Para layouts de uso único, é comum.

# REAL: Investigando um job lento

Um colega pediu ajuda: "meu job de ligar transações a pessoas pelo telefone ficou horrível em produção". Você pede o código e a primeira coisa que faz é **medir a chave**. Simule o problema com os dados do curso.

O cadastro `Treino.Arquivos.Pessoas` tem o campo `ssn`, que vem **vazio** em parte dos registros. Um JOIN por `ssn` mandaria todos os vazios para o mesmo nó.

Entregue, nesta ordem:

1. Os 3 valores de `ssn` mais frequentes com a quantidade de cada (desempate por `ssn`).
2. A contagem por nó depois de `DISTRIBUTE(Pessoas, HASH32(ssn))`, ordenada por nó.
3. A contagem por nó distribuindo **somente os registros com SSN preenchido**, ordenada por nó.
4. O **fator de skew** do caso 2 e do caso 3, como dois valores `DECIMAL6_2` em uma linha só (`skew_com_vazios`, `skew_sem_vazios`): o fator é `maior_no / media_dos_nos`. 1.00 é perfeito.

```ecl thor
IMPORT Treino, STD;
P := Treino.Arquivos.Pessoas;

```

## DICA
Crie uma função `Conta(ds)` como nos exercícios e outra `Fator(contagem) := MAX(contagem, qtd) / AVE(contagem, qtd);`. Para o item 4, `DATASET([{Fator(c2), Fator(c3)}], {DECIMAL6_2 skew_com_vazios, DECIMAL6_2 skew_sem_vazios})`.

## GABARITO
```ecl thor
IMPORT Treino, STD;
P := Treino.Arquivos.Pessoas;

Layout_Conta := {UNSIGNED2 no, UNSIGNED4 qtd};

Conta(DATASET(RECORDOF(P)) ds) := SORT(TABLE(ds, {UNSIGNED2 no := STD.System.Thorlib.Node(), UNSIGNED4 qtd := COUNT(GROUP)},
                                             STD.System.Thorlib.Node(), LOCAL), no);
Fator(DATASET(Layout_Conta) c) := MAX(c, qtd) / AVE(c, qtd);

Freq := TABLE(P, {ssn, UNSIGNED4 qtd := COUNT(GROUP)}, ssn);

C2 := PROJECT(Conta(DISTRIBUTE(P, HASH32(ssn))), Layout_Conta);
C3 := PROJECT(Conta(DISTRIBUTE(P(ssn <> ''), HASH32(ssn))), Layout_Conta);

OUTPUT(TOPN(Freq, 3, -qtd, ssn));
OUTPUT(C2);
OUTPUT(C3);
OUTPUT(DATASET([{Fator(C2), Fator(C3)}], {DECIMAL6_2 skew_com_vazios, DECIMAL6_2 skew_sem_vazios}));
```
Com 2 nós e ~300 vazios em 21.800, o desequilíbrio é pequeno. Agora faça a conta de produção: 400 nós, 2 bilhões de registros, 3% sem SSN. A média por nó é 5 milhões; o nó dos vazios recebe **60 milhões a mais**, 13 vezes a média, e o job inteiro fica esperando por ele (isso quando o disco do nó não enche antes). A resposta para o colega é a de sempre: tirar os vazios da chave antes do JOIN, tratar esses registros por outro caminho (outra chave, como telefone ou nome + nascimento) e juntar os resultados depois.

# QUIZ

? O que `DISTRIBUTE(ds, HASH32(person_id))` garante?
- Que os dados ficam ordenados por person_id
- Que cada nó recebe exatamente a mesma quantidade de linhas
+ Que todos os registros com o mesmo person_id ficam no mesmo nó
- Que os duplicados são removidos
! Garante co-localização por chave. Não garante ordem nem equilíbrio.

? O que a opção `LOCAL` faz?
- Roda a operação no hThor
+ Executa a operação dentro de cada nó, sem trocar dados entre nós
- Salva o resultado no disco local
- Limita a operação ao primeiro nó
! Cada nó trabalha só com os registros que tem.

? Quando `DEDUP(SORT(ds, k, LOCAL), k, LOCAL)` dá o resultado correto?
- Sempre
- Nunca
+ Quando os registros de mesma chave `k` já estão no mesmo nó (por exemplo, após DISTRIBUTE por `k`)
- Só quando o cluster tem um nó
! Sem co-localização, repetidos em nós diferentes não se encontram e sobram no resultado.

? Qual é a melhor chave de distribuição?
- `gender`
- `state`
- `status`
+ `person_id`
! Muitos valores distintos e nenhum dominante. As outras têm poucos valores e geram skew.

? Por que distribuir uma vez e usar várias operações LOCAL em seguida?
- Porque LOCAL é obrigatório depois de DISTRIBUTE
+ Porque mover dados pela rede é o mais caro; uma redistribuição serve a todas as etapas seguintes
- Porque o Thor não aceita mais de um SORT global
- Para o código ficar menor
! Uma viagem pela rede em vez de uma por operação.

? No grafo do ECL Watch, o que indica dados cruzando a rede entre os nós?
- Disk Read
- Filter
+ Hash Distribute
- Project
! Cada redistribuição é um custo alto; contar quantas há é o primeiro passo ao investigar um job lento.

? Como numerar registros com ids únicos sem forçar processamento sequencial?
- `PROJECT` com `COUNTER` global
+ `PROJECT(..., LOCAL)` com `(COUNTER - 1) * CLUSTERSIZE + Node() + 1`
- `SORT` global e depois `ITERATE`
- `DEDUP` com `KEEP 1`
! Cada nó numera sozinho em uma faixa que não colide com a dos outros.

# FLASHCARDS

Q: O que DISTRIBUTE garante e o que não garante?
A: Garante: mesma chave no mesmo nó. Não garante: ordem nem equilíbrio.
Q: Padrão "uma viagem só".
A: `D := DISTRIBUTE(ds, HASH32(chave));` e depois SORT/DEDUP/TABLE/ROLLUP/JOIN com `LOCAL`.
Q: O que acontece com LOCAL sem DISTRIBUTE antes?
A: Resultado errado sem erro: registros de mesma chave em nós diferentes não se encontram.
Q: Como ver quantas linhas há em cada nó?
A: `TABLE(ds, {no := STD.System.Thorlib.Node(), qtd := COUNT(GROUP)}, STD.System.Thorlib.Node(), LOCAL)`
Q: Fórmula de id único em paralelo.
A: `(COUNTER - 1) * CLUSTERSIZE + STD.System.Thorlib.Node() + 1` em `PROJECT(..., LOCAL)`.
Q: O que procurar primeiro no grafo de um job lento?
A: Quantos Hash Distribute/Sort globais há, o skew nas setas e qual atividade consome mais tempo.
Q: Chave boa de distribuição.
A: Alta cardinalidade e sem valor dominante (id, conta, SSN não vazio).
