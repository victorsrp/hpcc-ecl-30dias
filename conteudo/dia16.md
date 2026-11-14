---
dia: 16
modulo: 4
titulo: INDEX e BUILD: achar uma agulha em milissegundos
horas: 3
---

# MISSAO

> [goggins] Segunda metade. A partir de hoje você constrói o que o cliente realmente vê. Tudo que você fez em 15 dias, limpar, cruzar, ligar, era a cozinha. Agora você vai aprender a **servir**. E servir tem uma regra só: rápido. Ninguém espera 4 minutos por uma consulta de crédito no caixa da loja. Hoje você aprende a estrutura que transforma minutos em milissegundos.

**Hoje você vai:**

- Entender o que é um índice e por que ele é rápido.
- Declarar um `INDEX` com campos de chave e *payload*.
- Construir com `BUILD` e ler com filtros `KEYED` e `WILD`.
- Saber por que a **ordem dos campos da chave** decide tudo.

Você parte do arquivo de entidades do dia 15: `Treino.Arquivos.Entidades` (21.800 cadastros com `entidade_id`, campos originais e campos limpos).

# PILULA: O que é um índice

> [crianca] Um dicionário tem 100 mil palavras e você acha "girafa" em 10 segundos. Por quê? Porque as palavras estão **em ordem** e você não lê tudo: abre no meio, vê que está no "M", volta um pouco, cai no "G", e pronto. Agora imagine o mesmo dicionário com as palavras **embaralhadas**: você teria que ler as 100 mil. Um arquivo comum é o dicionário embaralhado. Um índice é o dicionário em ordem.

> [tecnico] Um **índice** é um arquivo especial, ordenado pelos **campos de chave** e organizado como uma árvore (B-tree): poucos blocos no topo dizem em que bloco de baixo está cada faixa de valores. Para achar uma chave, o motor desce a árvore lendo 3 ou 4 blocos, não o arquivo inteiro. Em um arquivo de 10 bilhões de registros, a diferença é entre ler alguns kilobytes e ler terabytes. Além da chave, o índice pode carregar um **payload**: campos extras que vêm "de carona" e evitam uma segunda leitura.

```ecl nao-rodar
NomeDoIndice := INDEX(dataset_de_origem,
                      {campos_de_chave},        // por onde se busca; o índice fica ordenado por eles
                      {campos_de_payload},      // o que vem junto na resposta
                      '~nome::logico::do::indice');
```

A declaração é só uma definição. Quem cria o arquivo de índice no disco é a ação `BUILD`.

# PILULA: Declarar, construir, ler

```ecl thor
IMPORT Treino;
E := Treino.Arquivos.Entidades;

// 1) Declarar: busca por sobrenome e nome; devolve id da pessoa, nascimento e cidade
ChaveNome := INDEX(E,
                   {lname_clean, fname_clean},
                   {entidade_id, id, dob, city_clean, state},
                   '~aluno::key::pessoa_nome');

// 2) Construir (roda no Thor: ordena e grava a árvore)
BUILD(ChaveNome, OVERWRITE);
```

Agora leia. O índice se usa como um dataset com filtro, e esta leitura pode rodar no hthor, porque quase não há dado para ler:

```ecl
IMPORT Treino;
E := Treino.Arquivos.Entidades;
ChaveNome := INDEX(E, {lname_clean, fname_clean}, {entidade_id, id, dob, city_clean, state}, '~aluno::key::pessoa_nome');

OUTPUT(ChaveNome(lname_clean = 'NGUYEN' AND fname_clean = 'MARY'), NAMED('MaryNguyen'));
OUTPUT(COUNT(ChaveNome(lname_clean = 'NGUYEN')),                   NAMED('QuantosNguyen'));
```

> [real] No mundo real você não repete a declaração do índice em cada código: ela mora em um módulo (`Chaves.ecl`, dia 9) e todo mundo importa. O curso já traz um conjunto pronto em `Treino.Chaves` (abra `ecl/Treino/Chaves.ecl` no VS Code). A partir de amanhã você vai usá-lo.

# PILULA: A ordem dos campos da chave é tudo

> [crianca] A lista telefônica está em ordem de **sobrenome, depois nome**. Achar "Silva, Ana" é instantâneo. Achar todos os "Silva" também. Mas e achar todas as pessoas chamadas "Ana", de qualquer sobrenome? Aí a ordem não ajuda em nada: tem Ana no A, no B, no C... você teria que ler a lista inteira.

> [tecnico] O índice está ordenado pelo primeiro campo da chave; dentro dele, pelo segundo; e assim por diante. Um filtro só "desce a árvore" enquanto usa os campos **da esquerda para a direita, sem pular**. Filtrar pelo 1º campo: ótimo. Pelo 1º e 2º: ótimo. Só pelo 2º: o motor precisa varrer o índice inteiro.

Com a chave `{lname_clean, fname_clean}`:

| Filtro | O que acontece |
|---|---|
| `lname_clean = 'SMITH'` | Busca direta: desce a árvore até SMITH |
| `lname_clean = 'SMITH' AND fname_clean = 'MARY'` | Busca direta, ainda mais estreita |
| `fname_clean = 'MARY'` | **Varredura do índice inteiro**: MARY está espalhada por todos os sobrenomes |

Duas palavras tornam sua intenção explícita e protegem você de erros:

- `KEYED(condição)`: "isto **tem que** usar a árvore". Se a condição não puder ser resolvida pela chave, o compilador dá **erro** em vez de fazer uma varredura silenciosa.
- `WILD(campo)`: "estou pulando este campo de propósito; aceite qualquer valor aqui e continue usando os campos seguintes".

```ecl
IMPORT Treino;
K := Treino.Chaves.PorNome;     // chave: lname_clean, fname_clean, state

// Sobrenome + estado, com qualquer primeiro nome
OUTPUT(COUNT(K(KEYED(lname_clean = 'GARCIA'), WILD(fname_clean), KEYED(state = 'TX'))), NAMED('GarciaNoTexas'));

// Prefixo: sobrenomes que começam com "WIL" (um intervalo dentro da ordem do índice)
OUTPUT(TABLE(K(KEYED(lname_clean[1..3] = 'WIL')), {lname_clean, UNSIGNED4 qtd := COUNT(GROUP)}, lname_clean, FEW), NAMED('ComecaComWIL'));
```

Agora veja o compilador te proteger. Este filtro não informa o sobrenome, o primeiro campo da chave:

```ecl erro
IMPORT Treino;
K := Treino.Chaves.PorNome;
OUTPUT(COUNT(K(KEYED(fname_clean = 'MARY'))));
```

> [cuidado] Sem `KEYED`, o mesmo filtro **compila e roda**, varrendo o índice inteiro. Em 21 mil linhas você não percebe. Em produção, no Roxie, com 500 usuários ao mesmo tempo, isso derruba o serviço. Regra do curso: **toda leitura de índice destinada ao Roxie usa `KEYED`**.

# PILULA: Payload e a escolha das chaves

> [tecnico] Se a consulta precisa de um campo que não está no índice, o motor tem que ir ao arquivo base buscar o registro completo: uma leitura a mais por resultado (operação `FETCH`). Colocar no **payload** os campos que a consulta devolve elimina essa ida ao disco. O custo é um índice maior. Regra prática: chave = por onde você **busca**; payload = o que você **mostra**.

Como se desenha um conjunto de índices? Partindo das perguntas que o serviço precisa responder:

| Pergunta do cliente | Chave | Payload |
|---|---|---|
| "Ache pessoas por sobrenome, nome e estado" | `lname_clean, fname_clean, state` | `entidade_id` e dados de exibição |
| "De quem é este SSN?" | `ssn` | `entidade_id, id` |
| "De quem é este telefone?" | `phone` | `entidade_id, id` |
| "Me dê tudo desta pessoa" | `entidade_id` | cadastros completos |
| "Sinistros desta pessoa" | `person_id` | dados do sinistro |

> [real] É exatamente assim em produção: **uma pergunta, um índice**. O mesmo dado é indexado 5, 10, 20 vezes, cada vez ordenado para uma forma diferente de busca. Disco é barato; latência é cara. O Thor gasta horas construindo essas chaves de madrugada para que o Roxie gaste milissegundos de dia.

# EXERCICIO: Índice por telefone

Declare e construa o índice `~aluno::key::pessoa_fone` sobre `Treino.Arquivos.Entidades`, **só com registros que têm telefone**, chave `phone`, payload `entidade_id, id, fname_clean, lname_clean`.

```ecl thor
IMPORT Treino;
E := Treino.Arquivos.Entidades;

```

## GABARITO
```ecl thor
IMPORT Treino;
E := Treino.Arquivos.Entidades;

ChaveFone := INDEX(E(phone <> ''), {phone}, {entidade_id, id, fname_clean, lname_clean}, '~aluno::key::pessoa_fone');
BUILD(ChaveFone, OVERWRITE);
```
O filtro `phone <> ''` na origem deixa as chaves vazias fora do índice. É o mesmo cuidado com chave lixo do dia 8, aplicado na construção.

# EXERCICIO: Busca reversa de telefone

Usando o índice que você construiu, mostre quem tem o telefone `4748367796`. Use `KEYED`.

```ecl
IMPORT Treino;
E := Treino.Arquivos.Entidades;
ChaveFone := INDEX(E(phone <> ''), {phone}, {entidade_id, id, fname_clean, lname_clean}, '~aluno::key::pessoa_fone');

```

## GABARITO
```ecl
IMPORT Treino;
E := Treino.Arquivos.Entidades;
ChaveFone := INDEX(E(phone <> ''), {phone}, {entidade_id, id, fname_clean, lname_clean}, '~aluno::key::pessoa_fone');

OUTPUT(ChaveFone(KEYED(phone = '4748367796')));
```

# EXERCICIO: Lendo o índice de nomes

Com `Treino.Chaves.PorNome` (chave `lname_clean, fname_clean, state`), produza nesta ordem: (1) a quantidade de `LOPEZ` chamados `DAVID`; (2) a quantidade de pessoas de sobrenome `KING` no estado `GA`, com qualquer primeiro nome; (3) as cidades distintas onde há alguém de sobrenome `TORRES` no estado `FL`, em ordem alfabética.

```ecl
IMPORT Treino;
K := Treino.Chaves.PorNome;

```

## DICA
Item 2: `KEYED(lname_clean = 'KING'), WILD(fname_clean), KEYED(state = 'GA')`. Item 3: `TABLE(..., {city_clean}, city_clean)` e `SORT`.

## GABARITO
```ecl
IMPORT Treino;
K := Treino.Chaves.PorNome;

OUTPUT(COUNT(K(KEYED(lname_clean = 'LOPEZ' AND fname_clean = 'DAVID'))));
OUTPUT(COUNT(K(KEYED(lname_clean = 'KING'), WILD(fname_clean), KEYED(state = 'GA'))));
OUTPUT(SORT(TABLE(K(KEYED(lname_clean = 'TORRES'), WILD(fname_clean), KEYED(state = 'FL')), {city_clean}, city_clean), city_clean));
```

# REAL: Projetando as chaves de um produto de veículos

O time de produto vai lançar um serviço de consulta de veículos para seguradoras. As perguntas que o serviço precisa responder em milissegundos:

- **P1**: "Dado um VIN (chassi), qual é o veículo e quem é o dono?"
- **P2**: "Dada uma placa e o estado, qual é o veículo?"
- **P3**: "Quais veículos de uma marca e modelo, de um certo ano em diante, existem em um estado?" (para campanhas de recall)

Usando `Treino.Arquivos.Veiculos` (`vin, person_id, make, model, year, plate, state`):

1. Declare e construa três índices em `~aluno::key::veic_vin`, `~aluno::key::veic_placa` e `~aluno::key::veic_modelo`. Escolha chave e payload de cada um para responder à pergunta **sem ir ao arquivo base**. Pense bem na **ordem** dos campos da chave de P3.
2. Depois de construir, responda nesta ordem, usando `KEYED`: (a) o veículo de VIN `K9TDD70FYGSR7FASL`; (b) quantos `Toyota` `Camry` de 2020 em diante há na `FL`; (c) quantos `Tesla` (qualquer modelo) há no `TX`.

Faça em dois blocos: primeiro o de construção (thor), depois o de leitura.

```ecl thor
IMPORT Treino;
V := Treino.Arquivos.Veiculos;

// Declarações e BUILD dos três índices

```

```ecl sem-validar
IMPORT Treino;
V := Treino.Arquivos.Veiculos;

// Repita as declarações e responda (a), (b), (c)

```

## DICA
Em P3 os campos com **igualdade** vêm primeiro e o campo de **faixa** (`year >= ...`) vem por último: depois de um intervalo, a árvore não consegue mais estreitar pelos campos seguintes. Uma boa ordem: `state, make, model, year`. Para (c), o modelo fica livre: como é o último campo usado antes do ano e você não filtra o ano, basta parar em `make`.

## GABARITO
Construção:

```ecl thor
IMPORT Treino;
V := Treino.Arquivos.Veiculos;

KVin    := INDEX(V, {vin},                       {person_id, make, model, year, plate, state}, '~aluno::key::veic_vin');
KPlaca  := INDEX(V, {plate, state},              {vin, person_id, make, model, year},          '~aluno::key::veic_placa');
KModelo := INDEX(V, {state, make, model, year},  {vin, person_id, plate},                      '~aluno::key::veic_modelo');

PARALLEL(BUILD(KVin, OVERWRITE), BUILD(KPlaca, OVERWRITE), BUILD(KModelo, OVERWRITE));
```

Leitura:

```ecl
IMPORT Treino;
V := Treino.Arquivos.Veiculos;

KVin    := INDEX(V, {vin},                       {person_id, make, model, year, plate, state}, '~aluno::key::veic_vin');
KModelo := INDEX(V, {state, make, model, year},  {vin, person_id, plate},                      '~aluno::key::veic_modelo');

OUTPUT(KVin(KEYED(vin = 'K9TDD70FYGSR7FASL')));
OUTPUT(COUNT(KModelo(KEYED(state = 'FL' AND make = 'Toyota' AND model = 'Camry' AND year >= 2020))));
OUTPUT(COUNT(KModelo(KEYED(state = 'TX' AND make = 'Tesla'))));
```
A lição de projeto está em P3. Com a chave `{state, make, model, year}`, os três primeiros campos são igualdades e o ano é a faixa no fim: a árvore vai direto ao trecho "FL / Toyota / Camry / 2020 em diante". Se o ano viesse antes do modelo, a árvore estreitaria só até "FL / Toyota / 2020+" e teria que ler todos os modelos para achar os Camry. **Igualdades primeiro, faixa por último.** E repare que o mesmo arquivo de 15 mil veículos virou três índices: uma pergunta, um índice.

# QUIZ

? Por que a leitura por índice é rápida?
- Porque o índice fica na memória do Dali
+ Porque está ordenado pela chave em forma de árvore: lê-se poucos blocos em vez do arquivo inteiro
- Porque o índice é comprimido
- Porque roda no Thor
! Descer uma B-tree custa 3 ou 4 leituras, qualquer que seja o tamanho do arquivo.

? Qual ação cria fisicamente o arquivo de índice?
- `INDEX(...)`
- `OUTPUT(...)`
+ `BUILD(...)`
- `KEYED(...)`
! INDEX só declara; BUILD ordena e grava.

? O índice tem chave `{lname, fname, state}`. Qual filtro usa a árvore de forma eficiente?
- `fname = 'MARY'`
- `state = 'FL'`
+ `lname = 'SMITH' AND fname = 'MARY'`
- `fname = 'MARY' AND state = 'FL'`
! Os campos precisam ser usados da esquerda para a direita, sem pular o primeiro.

? O que `KEYED(condição)` garante?
- Que o resultado sai ordenado
+ Que a condição é resolvida pela chave do índice; se não puder, o compilador dá erro
- Que o índice será reconstruído
- Que o payload é ignorado
! Transforma uma varredura silenciosa em erro de compilação.

? Para que serve `WILD(fname)`?
- Para fazer busca aproximada no nome
+ Para declarar que o campo é pulado de propósito, aceitando qualquer valor, e continuar usando os campos seguintes da chave
- Para ignorar maiúsculas e minúsculas
- Para apagar o campo do índice
! Permite filtrar `lname` e `state` deixando `fname` livre.

? O que é o payload de um índice?
- Os campos pelos quais o índice é ordenado
+ Campos extras guardados no índice para a consulta não precisar ir ao arquivo base
- O tamanho do índice em disco
- A lista de subfiles
! Chave = por onde se busca; payload = o que se devolve.

? Em uma chave para filtros `state = X AND make = Y AND year >= Z`, qual a melhor ordem?
- `year, state, make`
- `year, make, state`
+ `state, make, year`
- A ordem não importa
! Igualdades primeiro, faixa por último: depois de um intervalo a árvore não estreita mais.

# FLASHCARDS

Q: Sintaxe do INDEX.
A: `INDEX(dataset, {campos_chave}, {campos_payload}, '~nome::logico')`
Q: Como construir um índice?
A: `BUILD(Indice, OVERWRITE);` no Thor.
Q: Regra de uso dos campos da chave.
A: Da esquerda para a direita, sem pular; igualdades primeiro, faixa por último.
Q: KEYED × WILD.
A: KEYED obriga o uso da árvore (erro se não der); WILD pula um campo de propósito.
Q: Chave × payload.
A: Chave: por onde se busca. Payload: o que vem junto na resposta.
Q: Princípio de projeto de índices.
A: Uma pergunta, um índice: o mesmo dado é indexado várias vezes, uma por forma de busca.
Q: Por que filtrar chaves vazias na origem do índice?
A: Chave lixo incha o índice e cria respostas gigantes e inúteis.
