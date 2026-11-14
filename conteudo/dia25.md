---
dia: 25
modulo: 5
titulo: Performance, depuração e prova do módulo 5
horas: 4
---

# MISSAO

> [goggins] Qualquer um escreve um job que funciona com 20 mil linhas. O mercado paga bem é quem pega um job que leva 9 horas e devolve rodando em 40 minutos. Isso não é talento, é **método**: medir, achar o gargalo, consertar o gargalo, medir de novo. Hoje você aprende o método e a lista dos pecados que causam 90% dos jobs lentos do planeta. Depois, desafio e prova. Cinco dias para o fim. Não afrouxa agora.

**Hoje você vai:**

- Seguir um método de investigação de performance.
- Reconhecer e consertar os anti-padrões mais comuns.
- Depurar com resultados intermediários e amostras.
- Fazer o desafio e o teste do módulo 5.

# PILULA: O método: medir antes de mexer

> [crianca] O carro não anda. Você não sai trocando peça por peça até funcionar. Você olha o painel: tem gasolina? A luz da bateria está acesa? Primeiro você **descobre o que está errado**, depois conserta só aquilo.

> [tecnico] Otimizar sem medir é superstição. O roteiro, sempre na mesma ordem:

1. **Abra o grafo** do workunit no ECL Watch e ordene as atividades por tempo. Quase sempre uma ou duas concentram o custo.
2. **Leia as contagens nas setas.** Onde o número de linhas explode (JOIN N-para-N)? Onde ele poderia ter caído antes (filtro tardio)?
3. **Procure o skew.** Alguma atividade com um nó muito acima da média?
4. **Conte as viagens de rede**: quantos `Hash Distribute` e sorts globais existem? Algum é repetido pela mesma chave?
5. **Mude uma coisa.** Rode. Compare tempo **e resultado**. Otimização que muda o resultado é bug.

> [real] Guarde os números de antes e depois. "Reduzi o build de 9h10 para 47 min trocando dois JOINs globais por DISTRIBUTE + LOCAL e filtrando chaves vazias" é a frase que entra na sua avaliação de desempenho. "Otimizei o job" não é.

# PILULA: Os anti-padrões e seus consertos

Dez causas que explicam a grande maioria dos jobs lentos:

| # | Anti-padrão | Conserto |
|---|---|---|
| 1 | **Filtrar depois** do JOIN/SORT | Filtre antes: menos linhas em tudo o que vem depois |
| 2 | **Carregar colunas que não usa** | `TABLE`/`PROJECT` para um layout enxuto antes de operações pesadas |
| 3 | **SORT que ninguém precisa** | Remova; para "os N maiores" use `TOPN`; para agrupar use `TABLE` |
| 4 | **JOIN comum contra tabela pequena** | `LOOKUP` (ou `ALL`, ou `DICTIONARY`) |
| 5 | **Chave vazia ou lixo no JOIN** | Filtre antes; `ATMOST` |
| 6 | **Várias redistribuições pela mesma chave** | Um `DISTRIBUTE` + operações `LOCAL` |
| 7 | **`COUNT(x) > 0`** | `EXISTS(x)` |
| 8 | **Recalcular a mesma etapa cara** | Uma definição reaproveitada; `PERSIST` entre execuções |
| 9 | **Ler CSV/JSON repetidamente** | Converta uma vez para arquivo nativo tipado |
| 10 | **Regex, Python ou serviço linha a linha em volume** | `STD.Str`, ECL nativo, JOIN com dado local |

Veja o número 1, 2 e 3 juntos. As duas versões dão o mesmo resultado:

```ecl thor
IMPORT Treino;
A := Treino.Arquivos;

// VERSÃO LENTA: ordena tudo, junta tudo com todas as colunas, filtra no fim
Layout_L := RECORD
  RECORDOF(A.Sinistros);
  STRING20 last_name;
  STRING2  estado_pessoa;
END;

TudoOrdenado := SORT(A.Sinistros, person_id, claim_date);
JuntoL := JOIN(TudoOrdenado, A.Pessoas, LEFT.person_id = RIGHT.id,
               TRANSFORM(Layout_L, SELF.last_name := RIGHT.last_name; SELF.estado_pessoa := RIGHT.state; SELF := LEFT));
Lenta := TABLE(JuntoL(claim_type = 'THEFT' AND status = 'PAID'), {estado_pessoa, UNSIGNED4 qtd := COUNT(GROUP), UNSIGNED8 total := SUM(GROUP, amount)}, estado_pessoa, FEW);

// VERSÃO RÁPIDA: filtra primeiro, leva só o necessário, sem sort
Roubos := TABLE(A.Sinistros(claim_type = 'THEFT' AND status = 'PAID'), {person_id, amount});
JuntoR := JOIN(Roubos, A.Pessoas, LEFT.person_id = RIGHT.id,
               TRANSFORM({STRING2 estado_pessoa, UNSIGNED4 amount}, SELF.estado_pessoa := RIGHT.state; SELF.amount := LEFT.amount));
Rapida := TABLE(JuntoR, {estado_pessoa, UNSIGNED4 qtd := COUNT(GROUP), UNSIGNED8 total := SUM(GROUP, amount)}, estado_pessoa, FEW);

OUTPUT(SORT(Lenta,  estado_pessoa), NAMED('Lenta'));
OUTPUT(SORT(Rapida, estado_pessoa), NAMED('Rapida'));
```

Abra o grafo deste workunit e compare os dois ramos: quantas linhas entram no JOIN de cada um? Com 30 mil sinistros a diferença de tempo é pequena; a diferença de **linhas trafegadas** é de dezenas de vezes, e é ela que vira horas em escala.

> [cuidado] O compilador do ECL é esperto e desfaz alguns desses pecados sozinho (ele empurra filtros para perto da leitura e descarta colunas não usadas quando consegue provar que pode). Não conte com isso: ele não atravessa `PERSIST`, arquivos intermediários, nem tudo o que envolve macros e funções complexas. Escreva certo e o resultado não depende da sorte.

# PILULA: Depuração: enxergar o que está no meio

> [tecnico] Quando o resultado final está errado, o erro está em **alguma etapa**. A técnica é a do eletricista: medir em cada ponto do fio até achar onde a corrente some.

| Ferramenta | Uso |
|---|---|
| `OUTPUT(CHOOSEN(etapa, 50), NAMED('Etapa3'))` | Ver uma amostra de qualquer definição intermediária |
| `OUTPUT(COUNT(etapa), NAMED('QtdEtapa3'))` | Achar onde as linhas somem ou explodem |
| `etapa(id = 533)` | Seguir **um** registro conhecido por todas as etapas |
| `SAMPLE(ds, 100)` / `ENTH(ds, 1000)` | Amostra de 1 a cada 100 linhas / 1000 linhas espalhadas pelo arquivo |
| `ASSERT(condição, 'mensagem')` | Travar uma suposição ("id é único aqui") |
| `#WORKUNIT('name', 'descrição')` | Dar nome ao job para achá-lo depois no ECL Watch |
| hthor com dados pequenos | Testar a lógica em segundos antes de pagar o Thor |

```ecl
#WORKUNIT('name', 'dia25_depuracao_exemplo');
IMPORT Aula;

Passo1 := Aula.Sinistros(status = 'PAID');
Passo2 := JOIN(Passo1, Aula.Clientes, LEFT.cliente_id = RIGHT.id,
               TRANSFORM({UNSIGNED4 sinistro_id, UNSIGNED4 cliente_id, STRING2 estado, UNSIGNED4 valor}, SELF := LEFT; SELF := RIGHT));
Passo3 := TABLE(Passo2, {estado, UNSIGNED4 total := SUM(GROUP, valor)}, estado, FEW);

// Medições em cada ponto do fio
OUTPUT(COUNT(Passo1), NAMED('Qtd1_Pagos'));
OUTPUT(COUNT(Passo2), NAMED('Qtd2_DepoisDoJoin'));
OUTPUT(Passo2(cliente_id = 4), NAMED('Seguindo_o_cliente_4'));
OUTPUT(SORT(Passo3, estado), NAMED('Final'));
```

> [real] Erro de compilação em ECL costuma apontar **para onde o problema apareceu**, não para onde ele nasceu: um campo com tipo errado declarado na linha 20 estoura num JOIN da linha 300. Leia a **primeira** mensagem da lista (as seguintes costumam ser consequência) e suba pelas definições até a origem.

# EXERCICIO: Conserte o filtro tardio

Reescreva o código abaixo para dar **exatamente o mesmo resultado**, sem o SORT e filtrando antes do JOIN, levando para o JOIN só as colunas necessárias.

```ecl thor
IMPORT Treino;
A := Treino.Arquivos;

// CÓDIGO LENTO: reescreva
Ordenado := SORT(A.Transacoes, person_id, txn_date);
Junto := JOIN(Ordenado, A.Pessoas, LEFT.person_id = RIGHT.id,
              TRANSFORM({RECORDOF(A.Transacoes), STRING2 casa}, SELF.casa := RIGHT.state; SELF := LEFT));
Filtrado := Junto(category = 'TRAVEL' AND amount > 1000);
OUTPUT(SORT(TABLE(Filtrado, {casa, UNSIGNED4 qtd := COUNT(GROUP)}, casa, FEW), casa));
```

## GABARITO
```ecl thor
IMPORT Treino;
A := Treino.Arquivos;

Viagens := TABLE(A.Transacoes(category = 'TRAVEL' AND amount > 1000), {person_id});
Junto   := JOIN(Viagens, A.Pessoas, LEFT.person_id = RIGHT.id, TRANSFORM({STRING2 casa}, SELF.casa := RIGHT.state));
OUTPUT(SORT(TABLE(Junto, {casa, UNSIGNED4 qtd := COUNT(GROUP)}, casa, FEW), casa));
```
O SORT inicial não servia para nada: o TABLE agrupa sozinho. O filtro reduz 120 mil transações a uma fração antes do JOIN, e a linha que viaja tem um campo em vez de nove.

# EXERCICIO: Conserte o JOIN contra tabela pequena

O código funciona, mas faz um JOIN comum (que redistribui 120 mil transações) contra uma tabela de 8 linhas, e ainda testa existência com COUNT. Conserte os dois problemas mantendo os resultados.

```ecl thor
IMPORT Treino;
T := Treino.Arquivos.Transacoes;

Pesos := DATASET([{'GROCERY', 1}, {'FUEL', 1}, {'RESTAURANT', 1}, {'PHARMACY', 1},
                  {'ONLINE', 2}, {'ATM', 3}, {'TRAVEL', 3}, {'ELECTRONICS', 4}], {STRING12 category, UNSIGNED1 peso});

// CÓDIGO A MELHORAR
ComPeso := JOIN(T, Pesos, LEFT.category = RIGHT.category,
                TRANSFORM({UNSIGNED4 person_id, UNSIGNED1 peso}, SELF.peso := RIGHT.peso; SELF := LEFT));
OUTPUT(SUM(ComPeso, peso));
OUTPUT(COUNT(ComPeso(peso = 4)) > 0);
```

## GABARITO
```ecl thor
IMPORT Treino;
T := Treino.Arquivos.Transacoes;

Pesos := DATASET([{'GROCERY', 1}, {'FUEL', 1}, {'RESTAURANT', 1}, {'PHARMACY', 1},
                  {'ONLINE', 2}, {'ATM', 3}, {'TRAVEL', 3}, {'ELECTRONICS', 4}], {STRING12 category, UNSIGNED1 peso});

ComPeso := JOIN(T, Pesos, LEFT.category = RIGHT.category,
                TRANSFORM({UNSIGNED4 person_id, UNSIGNED1 peso}, SELF.peso := RIGHT.peso; SELF := LEFT),
                LOOKUP);
OUTPUT(SUM(ComPeso, peso));
OUTPUT(EXISTS(ComPeso(peso = 4)));
```

# EXERCICIO: Uma redistribuição em vez de três

O código abaixo calcula três coisas por pessoa, cada uma com sua própria redistribuição global. Reescreva com **um** `DISTRIBUTE` e operações `LOCAL`, mantendo os três resultados.

```ecl thor
IMPORT Treino;
S := Treino.Arquivos.Sinistros;

// CÓDIGO A MELHORAR
Primeiro := DEDUP(SORT(S, person_id, claim_date), person_id);
Resumo   := TABLE(S, {person_id, UNSIGNED2 qtd := COUNT(GROUP), UNSIGNED8 total := SUM(GROUP, amount)}, person_id);
Maior    := DEDUP(SORT(S, person_id, -amount), person_id);

OUTPUT(COUNT(Primeiro));
OUTPUT(COUNT(Resumo(qtd >= 5)));
OUTPUT(SUM(Maior, amount));
```

## GABARITO
```ecl thor
IMPORT Treino;
S := Treino.Arquivos.Sinistros;

D := DISTRIBUTE(S, HASH32(person_id));

Primeiro := DEDUP(SORT(D, person_id, claim_date, LOCAL), person_id, LOCAL);
Resumo   := TABLE(D, {person_id, UNSIGNED2 qtd := COUNT(GROUP), UNSIGNED8 total := SUM(GROUP, amount)}, person_id, LOCAL);
Maior    := DEDUP(SORT(D, person_id, -amount, LOCAL), person_id, LOCAL);

OUTPUT(COUNT(Primeiro));
OUTPUT(COUNT(Resumo(qtd >= 5)));
OUTPUT(SUM(Maior, amount));
```

# DESAFIO: Biblioteca de análise genérica e otimizada

Sem dica. O time quer **componentes reutilizáveis** em vez de código copiado. Você vai entregar duas macros e usá-las num relatório, no Thor.

**Componente 1.** FUNCTIONMACRO `MaioresPorGrupo(ds, grupo, valor, n)`: devolve os `n` registros de maior `valor` em cada `grupo`, sem sort global (use `DISTRIBUTE` pelo grupo e operações `LOCAL`). O resultado mantém o layout de `ds`.

**Componente 2.** FUNCTIONMACRO `ResumoPonderado(ds, grupo, categoria, valor, tabela_pesos)`: `tabela_pesos` é um `DICTIONARY` de categoria para `peso`. Devolve, com `AGGREGATE`, uma linha por `grupo` com: o campo de grupo, `UNSIGNED4 qtd`, `UNSIGNED8 total` (soma de `valor`), `UNSIGNED4 pontos` (soma dos pesos das categorias; categoria fora do dicionário vale 0) e `UNSIGNED4 maior` (maior `valor`).

**Relatório.** Usando as macros:

- (a) Os 2 maiores sinistros (`amount`) de cada `repair_shop` de `Treino.Arquivos.Sinistros`, ordenados por `repair_shop`, `-amount`, `claim_id`. Mostre só `repair_shop, claim_id, claim_type, amount`.
- (b) As 2 maiores transações (`amount`) de cada `category` de `Treino.Arquivos.Transacoes`, ordenadas por `category`, `-amount`, `txn_id`. Mostre só `category, txn_id, merchant, amount`.
- (c) O resumo ponderado por `repair_shop` dos sinistros, com os pesos `INJURY` 5, `THEFT` 3, `FIRE` 3, `COLLISION` 1, `GLASS` 0, e uma coluna a mais `DECIMAL6_2 pontos_por_sinistro` (`pontos / qtd`), ordenado por `pontos_por_sinistro` decrescente.

```ecl thor
IMPORT Treino;
A := Treino.Arquivos;

```

## GABARITO
```ecl thor
IMPORT Treino;
A := Treino.Arquivos;

// Componente 1: os n maiores de cada grupo, com uma redistribuição só
MaioresPorGrupo(ds, grupo, valor, n) := FUNCTIONMACRO
  LOCAL Dist := DISTRIBUTE(ds, HASH32(grupo));
  LOCAL Agr  := GROUP(SORT(Dist, grupo, LOCAL), grupo, LOCAL);
  RETURN UNGROUP(TOPN(Agr, n, -valor));
ENDMACRO;

// Componente 2: resumo com pesos vindos de um dicionário
ResumoPonderado(ds, grupo, categoria, valor, tabela_pesos) := FUNCTIONMACRO
  LOCAL Layout_R := {TYPEOF(ds.grupo) grupo, UNSIGNED4 qtd, UNSIGNED8 total, UNSIGNED4 pontos, UNSIGNED4 maior};
  RETURN AGGREGATE(ds, Layout_R,
                   TRANSFORM(Layout_R,
                             SELF.grupo  := LEFT.grupo;
                             SELF.qtd    := RIGHT.qtd + 1;
                             SELF.total  := RIGHT.total + LEFT.valor;
                             SELF.pontos := RIGHT.pontos + tabela_pesos[LEFT.categoria].peso;
                             SELF.maior  := MAX(RIGHT.maior, LEFT.valor)),
                   LEFT.grupo);
ENDMACRO;

Pesos := DICTIONARY(DATASET([{'INJURY', 5}, {'THEFT', 3}, {'FIRE', 3}, {'COLLISION', 1}, {'GLASS', 0}],
                            {STRING10 tipo, UNSIGNED1 peso}), {tipo => peso});

// (a)
TopSin := MaioresPorGrupo(A.Sinistros, repair_shop, amount, 2);
OUTPUT(SORT(TABLE(TopSin, {repair_shop, claim_id, claim_type, amount}), repair_shop, -amount, claim_id));

// (b)
TopTxn := MaioresPorGrupo(A.Transacoes, category, amount, 2);
OUTPUT(SORT(TABLE(TopTxn, {category, txn_id, merchant, amount}), category, -amount, txn_id));

// (c)
Res := ResumoPonderado(A.Sinistros, repair_shop, claim_type, amount, Pesos);
OUTPUT(SORT(TABLE(Res, {repair_shop, qtd, total, pontos, maior, DECIMAL6_2 pontos_por_sinistro := pontos / qtd}), -pontos_por_sinistro));
```
`TYPEOF(ds.grupo)` devolve o tipo de um campo: é o que deixa a macro montar o layout de saída sem saber de antemão se o grupo é texto ou número. Quem é o primeiro colocado do item (c), com uma média de pontos por sinistro muito acima das outras oficinas? Uma macro genérica, escrita sem pensar em fraude, apontou a Crash Kings de novo. Componente bom faz isso: resolve o problema de hoje e os que ninguém previu.

# TESTE

? Por que uma FUNCTIONMACRO consegue receber "um campo qualquer" e uma função não?
- Porque macros rodam no Roxie
+ Porque os parâmetros da macro são substituídos como texto antes da compilação
- Porque funções não aceitam parâmetros
- Porque macros são mais rápidas
! A substituição textual acontece antes de o compilador ver o código.

? O que `#EXPAND('amount')` faz?
- Devolve o texto 'amount'
+ Insere `amount` como código no ponto em que aparece
- Soma o campo amount
- Declara um campo novo
! Texto vira código em tempo de compilação.

? Onde o código de template (`#FOR`, `#IF`) é executado?
- Nos workers do Thor
+ No compilador
- No Roxie
- No Dali
! Ele gera o código que depois será executado no cluster.

? O que `LOOP(ds, 5, Corpo(ROWS(LEFT)))` faz?
+ Aplica o corpo 5 vezes, cada vez sobre o resultado anterior
- Repete o dataset 5 vezes
- Processa 5 linhas por vez
- Executa o corpo em 5 nós
! É a forma de expressar processos iterativos.

? Em um AGGREGATE, `RIGHT` representa...
- o registro de entrada
+ o acumulado do grupo até o momento
- o último registro do dataset
- a tabela de pesos
! LEFT = entrada da vez; RIGHT = resultado parcial.

? Como consultar a chave `'FL'` no dicionário `D` e obter o campo `nome`?
- `D('FL').nome`
- `D.FL.nome`
+ `D['FL'].nome`
- `LOOKUP(D, 'FL', nome)`
! Colchetes com a chave.

? Para que serve `{XPATH('insured/state')}` em um campo?
+ Para indicar o caminho do valor em um JSON/XML
- Para validar o estado
- Para indexar o campo
- Para renomear o arquivo
! É o endereço do valor no documento.

? Qual função converte um texto JSON em uma linha tipada?
- `TOJSON`
- `PARSE`
+ `FROMJSON`
- `XMLTEXT`
! FROMJSON(Layout, texto).

? Um SOAPCALL em um job grande deve sempre ter...
- `PARALLEL(1000)`
+ `TIMEOUT`, `RETRY` e `ONFAIL`
- `LOOKUP`
- `OVERWRITE`
! Rede falha; o job precisa saber o que fazer quando a resposta não vem.

? Qual é a ordem de preferência para implementar uma função?
- Python → C++ → ECL
+ ECL nativo/STD → C++ embutido → Python embutido
- C++ → ECL → Python
- Não há diferença de custo
! Cada camada para fora do motor custa mais por chamada.

? Qual é o primeiro passo ao investigar um job lento?
- Reescrever os JOINs com LOOKUP
- Aumentar o cluster
+ Abrir o grafo e ver quais atividades consomem o tempo e onde as linhas explodem
- Adicionar PERSIST em tudo
! Medir antes de mexer.

? Qual destas trocas costuma reduzir mais dados trafegados em um JOIN?
- Trocar INNER por FULL OUTER
+ Filtrar as linhas e reduzir as colunas antes do JOIN
- Ordenar as tabelas antes
- Trocar UNSIGNED por STRING
! Menos linhas e linhas mais finas.

? Três operações seguidas agrupam pela mesma chave, cada uma com redistribuição global. Qual a melhoria?
- Adicionar um SORT global no início
+ Um DISTRIBUTE pela chave e as três operações com LOCAL
- Rodar no hThor
- Usar FULL OUTER
! Uma viagem pela rede em vez de três.

? Como depurar um resultado final errado em um pipeline de 8 etapas?
- Rodar de novo até acertar
+ Emitir contagens e amostras das etapas intermediárias e seguir um registro conhecido
- Apagar os PERSISTs
- Trocar o alvo para Roxie
! Medir em cada ponto até achar onde o dado deixa de estar certo.

? Uma otimização deixou o job 5 vezes mais rápido, mas a contagem final mudou. O que isso significa?
- Sucesso
+ Um bug: otimização não pode alterar o resultado
- Skew
- Que o cluster está sobrecarregado
! Compare sempre tempo e resultado.

# FLASHCARDS

Q: Cinco passos do método de performance.
A: Abrir o grafo; ler contagens; procurar skew; contar redistribuições; mudar uma coisa e comparar tempo e resultado.
Q: Três consertos mais baratos.
A: Filtrar antes; levar só as colunas necessárias; tirar SORT desnecessário.
Q: JOIN contra tabela pequena.
A: `LOOKUP` (ou DICTIONARY dentro de transform).
Q: Como seguir um registro pelo pipeline?
A: `OUTPUT(etapa(id = X), NAMED('EtapaN'))` em cada etapa.
Q: SAMPLE × ENTH.
A: `SAMPLE(ds, n)`: 1 a cada n linhas; `ENTH(ds, n)`: n linhas espalhadas pelo dataset.
Q: O que é TYPEOF(x)?
A: O tipo de um campo ou expressão; útil para macros montarem layouts.
Q: Como nomear um workunit?
A: `#WORKUNIT('name', 'descricao');`
