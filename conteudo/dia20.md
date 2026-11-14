---
dia: 20
modulo: 4
titulo: Serviço de ponta a ponta e prova do módulo 4
horas: 4
---

# MISSAO

> [goggins] Vinte dias. Dois terços. Hoje não tem matéria nova quase nenhuma: hoje você **entrega**. Do arquivo base no Thor até um serviço publicado respondendo por HTTP, sozinho. É o trabalho completo de um desenvolvedor HPCC, em miniatura. Se travar, lembre do pote de biscoitos: você já construiu cada pedaço disso nos últimos 5 dias. Agora é só juntar.

**Hoje você vai:**

- Aprender a regra de divisão do trabalho entre Thor e Roxie.
- Passar por uma lista de verificação de publicação.
- Construir um serviço completo: build de chaves no Thor + consulta no Roxie.
- Fazer o teste do módulo 4.

# PILULA: Pré-calcule no Thor, só leia no Roxie

> [crianca] O garçom não descasca batata na hora que o cliente pede batata frita. A cozinha descasca **de manhã**, deixa pronto, e na hora do pedido é só fritar. Tudo o que pode ser feito antes, é feito antes.

> [tecnico] Qualquer cálculo que **não depende dos parâmetros da requisição** deve sair do Roxie e ir para o build no Thor. "Total gasto por pessoa", "quantidade de sinistros", "nota de risco": nada disso muda entre uma consulta e outra, então é calculado uma vez por noite e gravado como payload de um índice. A consulta vira uma leitura. Compare:

| Abordagem | Na consulta | Latência |
|---|---|---|
| Calcular na hora | Lê 400 transações da pessoa e soma | Cresce com o histórico |
| Pré-calculado | Lê **1** registro de resumo | Constante |

```ecl thor
IMPORT Treino;
T := Treino.Arquivos.Transacoes;

// Resumo pré-calculado no Thor: uma linha por pessoa
Resumo := TABLE(T,
                {person_id,
                 UNSIGNED4   qtd       := COUNT(GROUP),
                 DECIMAL12_2 total     := SUM(GROUP, amount),
                 DECIMAL9_2  maior     := MAX(GROUP, amount),
                 UNSIGNED4   ultima_dt := MAX(GROUP, txn_date)},
                person_id);

ChaveResumo := INDEX(Resumo, {person_id}, {qtd, total, maior, ultima_dt}, '~aluno::key::gasto_resumo');
BUILD(ChaveResumo, OVERWRITE);
```

```ecl
IMPORT Treino;

// A mesma declaração, do lado da consulta. Em projeto real ela mora num módulo e é importada pelos dois lados.
Layout_Resumo := {UNSIGNED4 person_id, UNSIGNED4 qtd, DECIMAL12_2 total, DECIMAL9_2 maior, UNSIGNED4 ultima_dt};
ChaveResumo := INDEX(DATASET([], Layout_Resumo), {person_id}, {qtd, total, maior, ultima_dt}, '~aluno::key::gasto_resumo');

OUTPUT(ChaveResumo(KEYED(person_id = 533)), NAMED('ResumoDa533'));
```

Novidade: para **ler** um índice você não precisa do dataset de origem, só do layout. `INDEX(DATASET([], Layout), {chave}, {payload}, 'nome')` declara o índice pelo formato. É assim que as consultas declaram chaves sem depender dos arquivos de build.

# PILULA: Lista de verificação antes de publicar

Antes de chamar uma consulta de pronta, passe por cada linha. É a revisão de código que um time de produção faz.

| Verifique | Pergunta |
|---|---|
| Leituras | Toda leitura é de índice e tem `KEYED`? |
| Limites | Toda leitura e todo JOIN têm `LIMIT`, `ATMOST`, `KEEP` ou `CHOOSEN`? |
| Entrada | Os parâmetros são padronizados como o dado? Entrada vazia é tratada? |
| Erros | "Não achei" devolve vazio? Busca ampla devolve erro com orientação? |
| Saída | Todo `OUTPUT` tem `NAMED`? O tamanho máximo da resposta é conhecido? |
| Peso | Algum cálculo independe da entrada e poderia estar no build? |
| Contrato | Os nomes de parâmetros e resultados são definitivos? |
| Teste | Testou o caso feliz, o vazio, o amplo e o inválido? |

> [real] Latência se mede em percentis, não em média. "Média de 40 ms" esconde que 1% das chamadas leva 6 segundos, e é esse 1% que derruba o sistema do cliente. Os acordos de nível de serviço falam em p95 e p99: 95% ou 99% das chamadas abaixo de tantos milissegundos. Uma consulta sem `LIMIT` tem p99 ilimitado.

# DESAFIO: Serviço de perfil de gastos

Sem dica. Você vai entregar um serviço completo para o time antifraude de cartões: dado um SSN ou um telefone, devolver o **perfil de gastos** da pessoa.

**Parte 1: build no Thor.** A partir de `Treino.Arquivos.Transacoes` e `Treino.Arquivos.Entidades`, construa dois índices:

- `~aluno::key::txn_pessoa`: chave `person_id, txn_date`; payload `txn_id, txn_time, amount, merchant, category, state`.
- `~aluno::key::perfil_gasto`: chave `person_id`; payload pré-calculado por pessoa: `qtd` (transações), `total` (`DECIMAL12_2`), `ticket_medio` (`DECIMAL9_2`), `maior` (`DECIMAL9_2`), `qtd_fora` (transações feitas em estado **diferente** do estado de residência) e `estado_casa`. O estado de residência é o `state` do cadastro de menor `id` de cada `entidade_id` (em transações, `person_id` é o `entidade_id`).

O bloco de build deve terminar mostrando a quantidade de linhas do perfil (`NAMED('LinhasPerfil')`).

**Parte 2: consulta.** Escreva `perfil_gasto_v1`:

- Entrada: `Ssn` e `Telefone` (texto, padrão vazio). Sem nenhum dos dois: erro 400.
- Caminho: SSN, senão telefone, usando `Treino.Chaves.PorSsn` e `PorFone`. No máximo 5 entidades.
- Saída `Perfis`: por entidade, `entidade_id`, os campos do perfil, `DECIMAL5_1 pct_fora` (percentual de transações fora de casa), `STRING8 alerta` (`'VERMELHO'` se `pct_fora > 10` ou `maior > 2000`; `'AMARELO'` se `pct_fora > 3`; senão `'VERDE'`) e o filho `ultimas`: as 10 transações mais recentes (`txn_date, txn_time, amount, merchant, state`).
- Todas as leituras com `KEYED` e limite.

**Parte 3.** Publique como `perfil_gasto_v1` e teste pelo testador com o telefone `4748367796`.

> [cuidado] Depois de publicar, o Roxie passa a **manter abertos** os índices que a consulta usa. Se você rodar o build da Parte 1 de novo, o `BUILD(..., OVERWRITE)` vai falhar com `Lock held`: não se regrava um índice em uso. Para refazer o build durante o estudo, exclua antes a consulta em **Published Queries** no ECL Watch. Em produção ninguém sobrescreve: cada build grava índices com nome novo e troca o ponteiro, que é o assunto do dia 26.

```ecl thor
IMPORT Treino;
A := Treino.Arquivos;

// PARTE 1: build

```

```ecl sem-validar
#STORED('Telefone', '4748367796');
// consulta: perfil_gasto_v1
IMPORT Treino, STD;
K := Treino.Chaves;

// PARTE 2: consulta

```

## GABARITO
Parte 1, build:

```ecl thor
IMPORT Treino;
A := Treino.Arquivos;

// Estado de residência: o do cadastro de menor id de cada entidade
Casa := DEDUP(SORT(DISTRIBUTE(TABLE(A.Entidades, {entidade_id, id, state}), HASH32(entidade_id)),
                   entidade_id, id, LOCAL), entidade_id, LOCAL);

// Marca cada transação como dentro ou fora do estado de residência
Layout_T := RECORD
  UNSIGNED4  person_id;
  DECIMAL9_2 amount;
  STRING2    estado_casa;
  BOOLEAN    fora;
END;

Marcadas := JOIN(DISTRIBUTE(A.Transacoes, HASH32(person_id)), Casa,
                 LEFT.person_id = RIGHT.entidade_id,
                 TRANSFORM(Layout_T,
                           SELF.estado_casa := RIGHT.state;
                           SELF.fora        := RIGHT.state <> '' AND LEFT.state <> RIGHT.state;
                           SELF := LEFT),
                 LEFT OUTER, KEEP(1), LOCAL);

Perfil := TABLE(Marcadas,
                {person_id,
                 UNSIGNED4   qtd          := COUNT(GROUP),
                 DECIMAL12_2 total        := SUM(GROUP, amount),
                 DECIMAL9_2  ticket_medio := AVE(GROUP, amount),
                 DECIMAL9_2  maior        := MAX(GROUP, amount),
                 UNSIGNED4   qtd_fora     := COUNT(GROUP, fora),
                 STRING2     estado_casa  := MAX(GROUP, estado_casa)},
                person_id, LOCAL);

KTxn    := INDEX(A.Transacoes, {person_id, txn_date}, {txn_id, txn_time, amount, merchant, category, state}, '~aluno::key::txn_pessoa');
KPerfil := INDEX(Perfil, {person_id}, {qtd, total, ticket_medio, maior, qtd_fora, estado_casa}, '~aluno::key::perfil_gasto');

SEQUENTIAL(
  PARALLEL(BUILD(KTxn, OVERWRITE), BUILD(KPerfil, OVERWRITE)),
  OUTPUT(COUNT(KPerfil), NAMED('LinhasPerfil'))
);
```

Parte 2, consulta:

```ecl
#STORED('Telefone', '4748367796');
// consulta: perfil_gasto_v1
IMPORT Treino, STD;
K := Treino.Chaves;

STRING9  Ssn      := '' : STORED('Ssn');
STRING20 Telefone := '' : STORED('Telefone');

S := STD.Str.Filter(Ssn, '0123456789');
F := STD.Str.Filter(Telefone, '0123456789');

// Índices do build, declarados pelo layout
Layout_KT := {UNSIGNED4 person_id, UNSIGNED4 txn_date, UNSIGNED4 txn_id, STRING4 txn_time, DECIMAL9_2 amount, STRING16 merchant, STRING12 category, STRING2 state};
Layout_KP := {UNSIGNED4 person_id, UNSIGNED4 qtd, DECIMAL12_2 total, DECIMAL9_2 ticket_medio, DECIMAL9_2 maior, UNSIGNED4 qtd_fora, STRING2 estado_casa};
KTxn    := INDEX(DATASET([], Layout_KT), {person_id, txn_date}, {txn_id, txn_time, amount, merchant, category, state}, '~aluno::key::txn_pessoa');
KPerfil := INDEX(DATASET([], Layout_KP), {person_id}, {qtd, total, ticket_medio, maior, qtd_fora, estado_casa}, '~aluno::key::perfil_gasto');

// Caminho de busca
Layout_Id := {UNSIGNED4 entidade_id};
PeloSsn  := PROJECT(LIMIT(K.PorSsn(KEYED(ssn = S)),    100, SKIP), Layout_Id);
PeloFone := PROJECT(LIMIT(K.PorFone(KEYED(phone = F)), 100, SKIP), Layout_Id);
Ids := CHOOSEN(DEDUP(SORT(MAP(S <> '' => PeloSsn, F <> '' => PeloFone, DATASET([], Layout_Id)), entidade_id), entidade_id), 5);

// Resposta
Layout_U := {UNSIGNED4 txn_date, STRING4 txn_time, DECIMAL9_2 amount, STRING16 merchant, STRING2 state};

Layout_Resp := RECORD
  UNSIGNED4   entidade_id;
  UNSIGNED4   qtd;
  DECIMAL12_2 total;
  DECIMAL9_2  ticket_medio;
  DECIMAL9_2  maior;
  UNSIGNED4   qtd_fora;
  STRING2     estado_casa;
  DECIMAL5_1  pct_fora;
  STRING8     alerta;
  DATASET(Layout_U) ultimas;
END;

Layout_Resp Montar(Layout_Id I) := TRANSFORM
  P   := LIMIT(KPerfil(KEYED(person_id = I.entidade_id)), 1, SKIP)[1];
  Pct := IF(P.qtd = 0, 0, P.qtd_fora * 100 / P.qtd);
  SELF.entidade_id := I.entidade_id;
  SELF.pct_fora    := Pct;
  SELF.alerta      := MAP(Pct > 10 OR P.maior > 2000 => 'VERMELHO', Pct > 3 => 'AMARELO', 'VERDE');
  SELF.ultimas     := PROJECT(CHOOSEN(SORT(LIMIT(KTxn(KEYED(person_id = I.entidade_id)), 5000, SKIP), -txn_date, -txn_time), 10), Layout_U);
  SELF := P;
END;

IF(S = '' AND F = '', FAIL(400, 'Informe Ssn ou Telefone'));
OUTPUT(PROJECT(Ids, Montar(LEFT)), NAMED('Perfis'));
```
Confira com a lista de verificação da segunda pílula. O que este gabarito faz de propósito: o cálculo pesado (JOIN de 120 mil transações com o cadastro e a agregação) está **inteiro no Thor**, com `DISTRIBUTE` + `LOCAL` (dia 12); a consulta lê um registro de perfil pronto e as transações de uma pessoa; os índices são declarados pelo layout, sem depender dos arquivos de build; o erro 400 sai antes de qualquer leitura. Uma melhoria que um revisor pediria: `KTxn` tem `txn_date` na chave, então daria para ler só os últimos 90 dias com `KEYED(person_id = ... AND txn_date >= limite)`, em vez de ler o histórico todo e ordenar.

Você acabou de fazer, sozinho, o ciclo completo: dado no Thor, chave, consulta, publicação. Isso é o trabalho.

# TESTE

? O que torna a leitura de um índice rápida?
- O índice fica todo na memória do Thor
+ A organização em árvore ordenada pela chave: poucos blocos lidos por busca
- A compressão do arquivo
- O uso de SSD
! O custo de descer a árvore quase não cresce com o tamanho do arquivo.

? `INDEX(ds, {a, b, c}, {x, y}, '~k')`: quais campos são a chave?
+ `a, b, c`
- `x, y`
- `a` apenas
- Todos
! O primeiro bloco de chaves é a chave; o segundo é o payload.

? Com a chave `{state, make, year}`, qual filtro NÃO usa bem a árvore?
- `state = 'FL'`
- `state = 'FL' AND make = 'Ford'`
+ `make = 'Ford' AND year = 2020`
- `state = 'FL' AND make = 'Ford' AND year >= 2020`
! Falta o primeiro campo da chave.

? O que acontece com `OUTPUT(K(KEYED(b = 1)))` se `b` é o segundo campo da chave e o primeiro não foi informado?
- Roda devagar
+ Erro de compilação
- Devolve vazio
- Usa o payload
! KEYED exige que a condição seja resolvida pela chave; para pular o primeiro campo é preciso WILD.

? Half-keyed join de 200 registros contra um índice de 5 bilhões. O custo é da ordem de...
- 5 bilhões de leituras
+ 200 buscas na árvore
- 1 leitura
- 200 × 5 bilhões de comparações
! Uma busca por registro da esquerda.

? Qual opção faz uma leitura ampla demais devolver vazio em vez de erro?
- `LIMIT(ds, 100)`
+ `LIMIT(ds, 100, SKIP)`
- `LIMIT(ds, 100, FAIL(301, 'x'))`
- `KEEP(100)`
! SKIP devolve um recordset vazio quando o limite é ultrapassado.

? Para que serve o payload?
- Ordenar o índice
+ Evitar a ida ao arquivo base (FETCH) para buscar os campos que a consulta devolve
- Compactar a chave
- Validar a entrada
! Uma leitura a menos por resultado.

? O que `: STORED('Cpf')` cria em uma consulta publicada?
- Um arquivo chamado Cpf
+ Um parâmetro de entrada chamado Cpf
- Um índice por Cpf
- Um resultado nomeado
! STORED é a porta de entrada dos valores da requisição.

? Um cálculo dá o mesmo resultado em qualquer requisição (ex.: total de sinistros de cada pessoa). Onde ele deve ser feito?
- No Roxie, a cada chamada
+ No Thor, no build, e gravado como payload de um índice
- No ECL Watch
- No sistema do cliente
! Tudo o que não depende da entrada é pré-calculado.

? Por que a entrada do usuário precisa passar pelas mesmas regras de limpeza do build?
- Para ocupar menos memória
+ Porque a comparação com o índice é exata: `garcia` não casa com `GARCIA`
- Porque o Roxie rejeita minúsculas
- Para ativar o KEYED
! Dado e entrada têm que estar na mesma forma canônica.

? Qual destes é um problema grave numa consulta Roxie?
- Um SORT de 300 linhas de resultado
- Um DEDUP por entidade_id
+ Uma leitura de índice sem KEYED e sem LIMIT
- Três OUTPUTs com NAMED
! Varredura sem teto, multiplicada pela concorrência, derruba o serviço.

? Como declarar um índice para leitura sem ter o dataset de origem?
- Não é possível
+ `INDEX(DATASET([], Layout), {chave}, {payload}, '~nome')`
- `INDEX('~nome')`
- `DATASET('~nome', Layout, INDEX)`
! Para ler basta o formato; a origem só importa no BUILD.

? O que é uma superkey?
- Um índice com mais de 10 campos
+ Um superfile de índices: um nome fixo que aponta para o índice vigente
- A chave primária do arquivo
- Um índice sem payload
! Permite trocar o índice de produção sem recompilar consultas.

? Por que medir latência em p95/p99 e não em média?
- Porque é mais fácil de calcular
+ Porque a média esconde a minoria de chamadas muito lentas, que é justamente a que causa incidentes
- Porque o Roxie não calcula média
- Porque a média é sempre zero
! O pior 1% é o que estoura o tempo limite do cliente.

? Em uma busca de pessoa, por que reduzir a `entidade_id` distintos logo depois de ler o índice de busca?
- Para ordenar a resposta
+ Porque a mesma pessoa tem vários cadastros; sem reduzir, tudo o que vem depois sai multiplicado
- Porque o LIMIT exige
- Para liberar memória do Thor
! É o ponto em que o vínculo de registros do dia 15 paga a conta.

# FLASHCARDS

Q: Regra de divisão Thor × Roxie.
A: Tudo o que não depende da entrada é pré-calculado no Thor; o Roxie só lê índices e monta a resposta.
Q: Como declarar um índice só pelo layout?
A: `INDEX(DATASET([], Layout), {chave}, {payload}, '~nome')`
Q: Oito itens da lista de publicação.
A: Leituras KEYED; limites; entrada padronizada; erros/vazio; OUTPUT NAMED; peso no Thor; contrato estável; testes dos 4 casos.
Q: Os 4 casos de teste de uma consulta.
A: Feliz, vazio, amplo demais, inválido.
Q: Por que percentis?
A: A média esconde a cauda lenta; SLAs usam p95/p99.
Q: Como limitar a leitura de histórico em uma chave `{person_id, txn_date}`?
A: `KEYED(person_id = X AND txn_date >= limite)`: igualdade primeiro, faixa por último.
