---
dia: 14
modulo: 3
titulo: Workflow e superfiles: jobs que rodam todo dia
horas: 3
---

# MISSAO

> [goggins] Duas semanas. Você já escreve ECL melhor do que muita gente que "trabalha com isso" há um ano. Mas até hoje seus jobs rodam uma vez e pronto. Produção é outra história: o job roda **todo dia**, às 3 da manhã, sem você olhando, e o dado de ontem não pode sumir se o de hoje vier quebrado. Hoje você aprende a construir coisas que aguentam o tranco sozinhas.

**Hoje você vai:**

- Controlar a ordem das ações com `SEQUENTIAL` e `PARALLEL`.
- Guardar resultados caros com `PERSIST`.
- Proteger o pipeline com `ASSERT` e ações condicionais.
- Usar **superfiles** para versionar dados sem mudar o nome que os outros usam.

# PILULA: A ordem das ações

> [crianca] Para fazer um sanduíche, tanto faz se você pega primeiro o queijo ou o presunto: dá para pedir ajuda e fazer os dois **ao mesmo tempo**. Mas você não pode fechar o pão **antes** de colocar o recheio. Algumas coisas têm ordem obrigatória, outras não.

> [tecnico] O compilador ECL é livre para executar ações independentes em qualquer ordem ou em paralelo. Quando uma ação lê um arquivo que outra grava, ele costuma descobrir a dependência sozinho, mas em pipelines você **declara** a ordem: `SEQUENTIAL(a1, a2, a3)` executa na ordem escrita, uma depois da outra; `PARALLEL(a1, a2)` libera execução simultânea. Dá para aninhar. Uma ação também pode receber nome e ser usada depois: `Passo1 := OUTPUT(...);`.

```ecl thor
IMPORT Treino;
S := Treino.Arquivos.Sinistros;
L := RECORDOF(S);

Grava2025 := OUTPUT(S(claim_date BETWEEN 20250101 AND 20251231), , '~aluno::dia14::sin2025', OVERWRITE);
Grava2026 := OUTPUT(S(claim_date BETWEEN 20260101 AND 20261231), , '~aluno::dia14::sin2026', OVERWRITE);

Le2025 := DATASET('~aluno::dia14::sin2025', L, THOR);
Le2026 := DATASET('~aluno::dia14::sin2026', L, THOR);

SEQUENTIAL(
  PARALLEL(Grava2025, Grava2026),                 // as duas gravações podem rodar juntas
  OUTPUT(COUNT(Le2025), NAMED('Qtd2025')),        // só depois de gravado
  OUTPUT(COUNT(Le2026), NAMED('Qtd2026'))
);
```

# PILULA: PERSIST: guardar o molho pronto na geladeira

> [crianca] Fazer molho de tomate leva duas horas. Se você vai comer macarrão a semana toda, não faz molho todo dia: faz uma panela grande, guarda na geladeira e usa. Só faz de novo quando o molho acaba **ou quando a receita muda**.

> [tecnico] `definição := expressão : PERSIST('nome');` manda o cluster **gravar o resultado** daquela definição num arquivo e reutilizá-lo nas próximas execuções. O cálculo só é refeito se o **código** da definição mudar ou se os **arquivos de entrada** mudarem. O `:` depois da expressão introduz um *workflow service*; `PERSIST` é o mais usado. Coloque PERSIST nas etapas caras e estáveis: o JOIN de 40 minutos que você reaproveita enquanto desenvolve as etapas seguintes.

```ecl thor
IMPORT Treino;
A := Treino.Arquivos;

// Etapa "cara": cruza sinistros com pessoas
SinComEstado := JOIN(A.Sinistros, A.Pessoas,
                     LEFT.person_id = RIGHT.id,
                     TRANSFORM({UNSIGNED4 claim_id, UNSIGNED4 amount, STRING10 claim_type, STRING2 state},
                               SELF.state := RIGHT.state; SELF := LEFT))
                : PERSIST('~aluno::persist::sin_com_estado');

// Etapas baratas em cima do resultado guardado
OUTPUT(TABLE(SinComEstado, {state, UNSIGNED4 qtd := COUNT(GROUP), UNSIGNED8 total := SUM(GROUP, amount)}, state, FEW));
```

Rode duas vezes e compare os tempos e os grafos no ECL Watch: na segunda execução o JOIN não aparece, só uma leitura do arquivo persistido. Agora mude algo **depois** do PERSIST (por exemplo, acrescente `maior := MAX(GROUP, amount)` no TABLE) e rode de novo: continua rápido, porque a parte cara não mudou.

Outros workflow services que você vai encontrar:

| Serviço | Faz |
|---|---|
| `: PERSIST('nome')` | Guarda o resultado e reaproveita enquanto código e entradas não mudarem |
| `: INDEPENDENT` | Calcula uma única vez no workunit, antes e fora do fluxo principal |
| `: SUCCESS(ação)` / `: FAILURE(ação)` | Executa a ação se a definição terminar bem / der erro (ex.: enviar e-mail) |
| `: STORED('nome')` | Permite que o valor venha de fora; é como o Roxie recebe parâmetros (dia 18) |
| `: WHEN(evento)` | Agenda a execução (dia 27) |

# PILULA: ASSERT: o pipeline que sabe parar

> [tecnico] Um job de madrugada precisa **se recusar a continuar** quando algo está errado, em vez de gravar lixo por cima de dado bom. `ASSERT(condição, 'mensagem', FAIL)` falha o workunit se a condição for falsa (sem o `FAIL` vira só um aviso). `IF(condição, ação_se_sim, ação_se_não)` escolhe entre ações. `FAIL('mensagem')` aborta com erro.

```ecl thor
IMPORT Treino;
S := Treino.Arquivos.Sinistros;

Qtd       := COUNT(S);
SemPessoa := COUNT(S(person_id = 0));

SEQUENTIAL(
  ASSERT(Qtd > 25000, 'Arquivo de sinistros menor que o esperado: ' + (STRING)Qtd, FAIL),
  ASSERT(SemPessoa = 0, 'Ha sinistros sem person_id', FAIL),
  OUTPUT('Controles ok: ' + (STRING)Qtd + ' sinistros', NAMED('Status'))
);
```

Troque `25000` por `50000` e rode: o workunit falha com a sua mensagem e a terceira ação nunca executa.

> [real] Controles típicos de um build de produção: a contagem não pode variar mais que X% em relação a ontem; o fill rate de campos-chave não pode cair; nenhuma chave primária duplicada. Passou em todos, promove. Falhou em um, para e avisa. É isso que deixa o time dormir.

# PILULA: Superfile: o fichário de nome fixo

> [crianca] Um fichário com a etiqueta "LIÇÕES DE CASA". Toda semana você coloca folhas novas e tira as velhas, mas a etiqueta nunca muda. Quem precisa das lições não quer saber quais folhas estão lá dentro: só pega **o fichário**. Um superfile é um fichário: um nome fixo que aponta para uma lista de arquivos que você troca quando quiser.

> [tecnico] Um **superfile** é um arquivo lógico que não tem dados próprios: é uma lista de **subfiles** com o mesmo layout. Ler o superfile é ler todos os subfiles como um só. Você muda o conteúdo trocando a lista, sem regravar dados e **sem mudar o nome** que os consumidores usam. As funções estão em `STD.File`:

| Função | Faz |
|---|---|
| `CreateSuperFile(nome)` | Cria um superfile vazio |
| `SuperFileExists(nome)` | Existe? |
| `AddSuperFile(super, sub)` | Acrescenta um subfile |
| `RemoveSuperFile(super, sub)` | Retira um subfile (não apaga o arquivo) |
| `ClearSuperFile(super)` | Esvazia a lista |
| `SuperFileContents(super)` | Lista os subfiles |
| `StartSuperFileTransaction()` / `FinishSuperFileTransaction()` | Tudo entre as duas chamadas vale junto ou não vale: ninguém lê o fichário pela metade |

```ecl
IMPORT Treino, STD;
L := RECORDOF(Treino.Arquivos.Sinistros);

Super := '~aluno::super::sinistros';

SEQUENTIAL(
  IF(NOT STD.File.SuperFileExists(Super), STD.File.CreateSuperFile(Super)),
  STD.File.StartSuperFileTransaction(),
  STD.File.ClearSuperFile(Super),
  STD.File.AddSuperFile(Super, '~aluno::dia14::sin2025'),
  STD.File.AddSuperFile(Super, '~aluno::dia14::sin2026'),
  STD.File.FinishSuperFileTransaction(),
  OUTPUT(STD.File.SuperFileContents(Super), NAMED('Subfiles')),
  OUTPUT(COUNT(DATASET(Super, L, THOR)), NAMED('LinhasNoSuper'))
);
```

(Esse bloco usa os dois arquivos gravados na primeira pílula de hoje. Se você pulou, volte e rode.)

> [cuidado] Repare que este bloco roda no **hthor**, não no thor. Funções de gerência de arquivos (`SuperFileContents`, listagens, promoções) conversam com o Dali, e os workers do Thor não têm esse acesso: dentro de um grafo do Thor elas falham com "No access to Dali". Tarefas de administração de arquivos rodam no hthor; o processamento pesado, no thor.

# PILULA: O padrão de gerações

> [tecnico] O uso mais importante de superfile é **promoção com rede de segurança**. Cada build grava um arquivo com a data no nome (`~x::base::20261112::pessoas`), e três superfiles apontam para as gerações: **atual**, **pai** (o build anterior) e **avô**. Promover é só girar os ponteiros: o novo vira atual, o atual vira pai, o pai vira avô. Se o build de hoje estiver ruim, voltar é girar ao contrário, em segundos, sem reprocessar nada. `STD.File.PromoteSuperFileList` faz esse giro numa chamada.

```ecl
IMPORT Treino, STD;
S := Treino.Arquivos.Sinistros;

Atual := '~aluno::ger::sinistros';
Pai   := '~aluno::ger::sinistros_pai';
Avo   := '~aluno::ger::sinistros_avo';

Versao := '~aluno::ger::sinistros_' + WORKUNIT;      // nome único por execução

CriaSeFalta(STRING n) := IF(NOT STD.File.SuperFileExists(n), STD.File.CreateSuperFile(n));

SEQUENTIAL(
  CriaSeFalta(Atual), CriaSeFalta(Pai), CriaSeFalta(Avo),
  OUTPUT(S, , Versao, OVERWRITE),
  STD.File.PromoteSuperFileList([Atual, Pai, Avo], Versao),
  OUTPUT(STD.File.SuperFileContents(Atual), NAMED('Atual')),
  OUTPUT(STD.File.SuperFileContents(Pai),   NAMED('Pai')),
  OUTPUT(STD.File.SuperFileContents(Avo),   NAMED('Avo'))
);
```

Rode três vezes e acompanhe as versões descendo de **Atual** para **Pai** para **Avô**. `WORKUNIT` é uma constante com o id do workunit em execução: um jeito simples de gerar um nome único por rodada.

> [real] É assim que a LexisNexis atualiza dados em produção sem derrubar nada: consultas Roxie e jobs Thor leem sempre o superfile "atual" (no Roxie, o equivalente para índices se chama *superkey*). O build novo fica pronto ao lado, passa nos controles, e a troca do ponteiro leva um instante. Deu problema? O "pai" está intacto.

# EXERCICIO: Ordem garantida

Grave em `~aluno::dia14::fl` as pessoas de `Treino.Arquivos.Pessoas` com `state = 'FL'` e **depois** mostre a quantidade de linhas lidas **do arquivo gravado**. Use `SEQUENTIAL`.

```ecl thor
IMPORT Treino;
P := Treino.Arquivos.Pessoas;

```

## GABARITO
```ecl thor
IMPORT Treino;
P := Treino.Arquivos.Pessoas;

Gravado := DATASET('~aluno::dia14::fl', RECORDOF(P), THOR);

SEQUENTIAL(
  OUTPUT(P(state = 'FL'), , '~aluno::dia14::fl', OVERWRITE),
  OUTPUT(COUNT(Gravado))
);
```

# EXERCICIO: Persistindo a etapa cara

Defina `GastoPorPessoa` como o TABLE de `Treino.Arquivos.Transacoes` por `person_id` com `qtd` e `total` (`DECIMAL12_2`), com `PERSIST('~aluno::persist::gasto_por_pessoa')`. Depois mostre: (1) quantas pessoas têm `total` acima de 5000; (2) as 5 de maior total (desempate por `person_id`).

```ecl thor
IMPORT Treino;
T := Treino.Arquivos.Transacoes;

```

## GABARITO
```ecl thor
IMPORT Treino;
T := Treino.Arquivos.Transacoes;

GastoPorPessoa := TABLE(T, {person_id, UNSIGNED4 qtd := COUNT(GROUP), DECIMAL12_2 total := SUM(GROUP, amount)}, person_id)
                  : PERSIST('~aluno::persist::gasto_por_pessoa');

OUTPUT(COUNT(GastoPorPessoa(total > 5000)));
OUTPUT(TOPN(GastoPorPessoa, 5, -total, person_id));
```
Rode duas vezes e compare o tempo e o grafo. Arquivos de PERSIST aparecem em Logical Files como qualquer outro.

# EXERCICIO: Controle de qualidade que para o job

Escreva um bloco que verifica `Treino.Arquivos.Veiculos` e **falha** se: (1) houver algum `vin` vazio; (2) houver `year` fora do intervalo 1980 a 2027. Se passar, mostra o texto `VEICULOS OK`.

```ecl thor
IMPORT Treino;
V := Treino.Arquivos.Veiculos;

```

## GABARITO
```ecl thor
IMPORT Treino;
V := Treino.Arquivos.Veiculos;

SEQUENTIAL(
  ASSERT(NOT EXISTS(V(vin = '')), 'Existe veiculo sem VIN', FAIL),
  ASSERT(NOT EXISTS(V(year NOT BETWEEN 1980 AND 2027)), 'Existe veiculo com ano fora da faixa', FAIL),
  OUTPUT('VEICULOS OK')
);
```

# REAL: Carga mensal de transações com superfile

O banco cliente manda um arquivo de transações por mês. Os consumidores (relatórios, modelos de fraude) leem sempre o mesmo nome: `~aluno::txn::todas`. Você vai montar a carga dos três primeiros meses de 2026.

Em **um único bloco** com `SEQUENTIAL`:

1. Grave três arquivos, um por mês, a partir de `Treino.Arquivos.Transacoes`: `~aluno::txn::202601`, `~aluno::txn::202602`, `~aluno::txn::202603` (filtre por `txn_date`).
2. Garanta que o superfile `~aluno::txn::todas` existe.
3. Dentro de uma **transação**, esvazie o superfile e acrescente os três meses.
4. **Controle**: falhe o job se a quantidade de linhas lidas pelo superfile for diferente da quantidade de transações do primeiro trimestre no arquivo original.
5. Mostre, lendo **pelo superfile**, a quantidade e o valor total por mês (`UNSIGNED3 mes` no formato AAAAMM), ordenado por mês.

```ecl thor
IMPORT Treino, STD;
T := Treino.Arquivos.Transacoes;

```

## DICA
`txn_date DIV 100` transforma 20260115 em 202601. Defina `DoMes(UNSIGNED3 m) := T(txn_date DIV 100 = m);` e `Nome(UNSIGNED3 m) := '~aluno::txn::' + (STRING)m;`. O dataset do superfile é declarado fora do SEQUENTIAL e usado dentro.

## GABARITO
```ecl thor
IMPORT Treino, STD;
T := Treino.Arquivos.Transacoes;

Super := '~aluno::txn::todas';
DoMes(UNSIGNED3 m) := T(txn_date DIV 100 = m);
Nome(UNSIGNED3 m)  := '~aluno::txn::' + (STRING)m;

Todas    := DATASET(Super, RECORDOF(T), THOR);
Esperado := COUNT(T(txn_date DIV 100 BETWEEN 202601 AND 202603));

PorMes := TABLE(Todas, {UNSIGNED3 mes := txn_date DIV 100,
                        UNSIGNED4 qtd := COUNT(GROUP),
                        DECIMAL12_2 total := SUM(GROUP, amount)}, txn_date DIV 100, FEW);

SEQUENTIAL(
  PARALLEL(OUTPUT(DoMes(202601), , Nome(202601), OVERWRITE),
           OUTPUT(DoMes(202602), , Nome(202602), OVERWRITE),
           OUTPUT(DoMes(202603), , Nome(202603), OVERWRITE)),
  IF(NOT STD.File.SuperFileExists(Super), STD.File.CreateSuperFile(Super)),
  STD.File.StartSuperFileTransaction(),
  STD.File.ClearSuperFile(Super),
  STD.File.AddSuperFile(Super, Nome(202601)),
  STD.File.AddSuperFile(Super, Nome(202602)),
  STD.File.AddSuperFile(Super, Nome(202603)),
  STD.File.FinishSuperFileTransaction(),
  ASSERT(COUNT(Todas) = Esperado, 'Superfile com contagem diferente do esperado', FAIL),
  OUTPUT(SORT(PorMes, mes))
);
```
Quando chegar abril, a carga é **uma linha**: `AddSuperFile(Super, Nome(202604))`. Ninguém que lê `~aluno::txn::todas` precisa mudar nada, e nenhum dos meses anteriores é regravado. Com o tempo, o superfile acumula centenas de subfiles pequenos e a leitura piora; por isso os builds reais consolidam periodicamente (junta tudo num arquivo só, troca a lista, apaga os pequenos).

# QUIZ

? O que `SEQUENTIAL(a, b, c)` garante?
- Que as três ações rodam ao mesmo tempo
+ Que as ações rodam na ordem escrita, uma depois da outra
- Que as ações rodam em ordem alfabética
- Que só a primeira ação roda
! Sem SEQUENTIAL o compilador pode reordenar ou paralelizar ações independentes.

? Quando uma definição com `: PERSIST('nome')` é recalculada?
- Toda vez que o workunit roda
- Nunca mais
+ Quando o código da definição ou os arquivos de entrada mudam
- Só quando o cluster reinicia
! Enquanto código e entradas estiverem iguais, o resultado gravado é reaproveitado.

? Qual a diferença entre `ASSERT(cond, 'msg')` e `ASSERT(cond, 'msg', FAIL)`?
- Nenhuma
+ Sem FAIL gera um aviso e continua; com FAIL o workunit falha
- Com FAIL a mensagem não aparece
- Sem FAIL o job para
! Em controles de pipeline, use FAIL para impedir que lixo seja promovido.

? O que é um superfile?
- Um arquivo comprimido
- Um arquivo com mais de um layout
+ Um arquivo lógico que é uma lista de subfiles de mesmo layout, lidos como um só
- Um arquivo que só o Roxie lê
! Não tem dados próprios; trocar a lista muda o conteúdo sem mudar o nome.

? Para que servem `StartSuperFileTransaction()` e `FinishSuperFileTransaction()`?
- Para acelerar a gravação
+ Para que as alterações na lista de subfiles valham todas juntas ou nenhuma
- Para apagar os subfiles antigos
- Para converter o superfile em arquivo normal
! Evita que alguém leia o superfile num estado intermediário (vazio ou pela metade).

? No padrão de gerações (atual, pai, avô), o que acontece ao promover um build novo?
- Os três arquivos são regravados
+ Os ponteiros giram: o novo vira atual, o atual vira pai, o pai vira avô
- O atual é apagado
- Nada muda até o cluster reiniciar
! É troca de ponteiro, rápida e reversível.

? Qual é a grande vantagem de os consumidores lerem um superfile e não o arquivo datado?
- O superfile é mais rápido de ler
+ O nome não muda: atualizar ou reverter dados não exige alterar nem recompilar quem consome
- O superfile ocupa menos disco
- O superfile valida os dados
! O nome fixo desacopla quem produz de quem consome.

# FLASHCARDS

Q: SEQUENTIAL × PARALLEL.
A: SEQUENTIAL executa ações na ordem escrita; PARALLEL libera execução simultânea.
Q: Sintaxe do PERSIST.
A: `x := expressão : PERSIST('~escopo::nome');`
Q: Como falhar o job quando um controle não passa?
A: `ASSERT(condição, 'mensagem', FAIL)`
Q: O que é um superfile?
A: Um nome fixo que aponta para uma lista de subfiles de mesmo layout.
Q: Sequência segura para trocar o conteúdo de um superfile.
A: StartSuperFileTransaction → ClearSuperFile → AddSuperFile(...) → FinishSuperFileTransaction.
Q: Padrão de gerações.
A: Superfiles atual/pai/avô; `STD.File.PromoteSuperFileList([atual, pai, avo], novo)` gira os ponteiros.
Q: O que é a constante WORKUNIT?
A: O id do workunit em execução; útil para nomes únicos por rodada.
