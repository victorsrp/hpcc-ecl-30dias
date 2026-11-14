---
dia: 4
modulo: 1
titulo: TRANSFORM e PROJECT
horas: 3.5
---

# MISSAO

> [goggins] Até aqui você só **escolheu** linhas e colunas que já existiam. Hoje você **cria**. TRANSFORM é o coração do ECL: aparece em PROJECT, JOIN, ROLLUP, ITERATE, NORMALIZE... em tudo. Quem entende TRANSFORM de verdade aprende o resto em metade do tempo. Então hoje não tem meio-termo: você vai escrever TRANSFORM até a mão doer.

**Hoje você vai:**

- Escolher colunas com `TABLE` (fatia vertical).
- Criar e modificar colunas com `PROJECT` e `TRANSFORM`.
- Entender `SELF`, `LEFT` e `COUNTER`.
- Usar a biblioteca padrão para textos (`STD.Str`) e datas (`STD.Date`).

# PILULA: TABLE para escolher colunas

> [crianca] Sua ficha tem 8 espaços preenchidos, mas a professora só quer saber **nome** e **cidade**. Você copia só esses dois numa ficha menor. Isso é uma fatia vertical: menos colunas, mesmas linhas.

> [tecnico] `TABLE(recordset, {campo1, campo2})` cria um novo recordset só com os campos listados. Dentro das chaves você também pode criar campos calculados: `{nome, TIPO novo := expressão}`. Hoje usamos TABLE só para fatiar; amanhã ela ganha superpoderes de agrupamento.

```ecl
IMPORT Aula;
C := Aula.Clientes;

OUTPUT(TABLE(C, {nome, sobrenome, estado}), NAMED('TresColunas'));

// Campo novo calculado na hora
OUTPUT(TABLE(C, {id, nome, DECIMAL10_2 renda_anual := renda * 12}), NAMED('ComRendaAnual'));
```

# PILULA: TRANSFORM é a receita, PROJECT é o cozinheiro

> [crianca] Uma fábrica de brinquedos tem uma esteira. Em cada ponto da esteira chega um carrinho **sem pintura** (a linha de entrada). Um robô segue uma **folha de instruções**: "pinte de vermelho, cole as rodas, escreva o número na porta". No fim sai um carrinho pronto (a linha de saída). A folha de instruções é o `TRANSFORM`. O robô que aplica a folha em cada carrinho da esteira é o `PROJECT`.

> [tecnico] `TRANSFORM` é uma função que monta **um registro de saída**. Ela declara o layout de saída e diz como preencher cada campo: `SELF.campo := expressão;`. `SELF` é o registro que está sendo construído; `LEFT` é o registro de entrada. `PROJECT(recordset, transform)` chama o transform uma vez para cada registro. Resultado: mesmo número de linhas, formato novo.

```ecl
IMPORT Aula;

Layout_Saida := RECORD
  UNSIGNED4   id;
  STRING25    nome_completo;
  DECIMAL10_2 renda_anual;
  BOOLEAN     score_bom;
END;

Layout_Saida Montar(Aula.Layouts.Cliente L) := TRANSFORM
  SELF.id            := L.id;
  SELF.nome_completo := TRIM(L.nome) + ' ' + TRIM(L.sobrenome);
  SELF.renda_anual   := L.renda * 12;
  SELF.score_bom     := L.score >= 700;
END;

Resultado := PROJECT(Aula.Clientes, Montar(LEFT));
OUTPUT(Resultado);
```

Leia a primeira linha do transform devagar: `Layout_Saida Montar(Aula.Layouts.Cliente L) := TRANSFORM` quer dizer "`Montar` recebe um registro `L` no formato de cliente e devolve um registro no formato `Layout_Saida`". No `PROJECT`, `LEFT` é "o registro da vez".

> [cuidado] **Todo campo do layout de saída precisa ser preenchido.** Esqueceu um? O compilador reclama. E é aqui que entra o atalho que você vai usar pelo resto da vida.

# PILULA: SELF := LEFT e o transform inline

> [tecnico] `SELF := LEFT;` significa "para todo campo de saída que eu ainda não preenchi e que tem **o mesmo nome** na entrada, copie". Regra de ouro: escreva primeiro os campos que mudam e termine com `SELF := LEFT;`. Se sobrar campo de saída sem correspondente, use `SELF := [];` para preencher o resto com vazio/zero. E quando o transform é curto, escreva-o **inline**, direto no PROJECT.

```ecl
IMPORT Aula, STD;

// Layout de saída = todos os campos do cliente + dois novos
Layout_Mais := RECORD
  Aula.Layouts.Cliente;        // "herda" todos os campos do layout de cliente
  STRING25  nome_completo;
  STRING10  faixa;
END;

Enriquecido := PROJECT(Aula.Clientes,
                       TRANSFORM(Layout_Mais,
                                 SELF.nome_completo := TRIM(LEFT.nome) + ' ' + TRIM(LEFT.sobrenome);
                                 SELF.faixa         := MAP(LEFT.score >= 750 => 'OTIMO',
                                                           LEFT.score >= 600 => 'BOM',
                                                           LEFT.score >  0   => 'RUIM',
                                                           'SEM SCORE');
                                 SELF.sobrenome     := STD.Str.ToUpperCase(LEFT.sobrenome);  // sobrescreve um campo existente
                                 SELF := LEFT));                                             // o resto copia igual
OUTPUT(Enriquecido);
```

Três coisas novas aqui: (1) pôr o nome de um layout dentro de outro RECORD copia todos os seus campos; (2) o transform inline `TRANSFORM(LayoutSaida, atribuições...)`; (3) a ordem importa: o que você atribui explicitamente vence o `SELF := LEFT`.

# PILULA: COUNTER numera as linhas

> [tecnico] O `PROJECT` aceita um segundo parâmetro no transform: `COUNTER`, que vale 1 na primeira linha, 2 na segunda, e assim por diante. Serve para criar um número sequencial ou um ranking.

```ecl
IMPORT Aula;

Layout_Rank := RECORD
  UNSIGNED2 posicao;
  STRING10  nome;
  UNSIGNED2 score;
END;

Ordenado := SORT(Aula.Clientes, -score);
Ranking  := PROJECT(Ordenado, TRANSFORM(Layout_Rank, SELF.posicao := COUNTER; SELF := LEFT));
OUTPUT(Ranking);
```

> [real] No Thor, com dados espalhados por 400 nós, o `COUNTER` do PROJECT obriga o cluster a processar as partes em sequência para a numeração ficar certa. Para gerar ids únicos em bilhões de linhas existe um truque paralelo com `PROJECT(..., LOCAL)` que você verá no dia 12.

# PILULA: Biblioteca padrão: textos

> [crianca] Você não precisa inventar a tesoura toda vez que quer cortar papel: ela já está no estojo. A biblioteca padrão (`STD`) é o estojo do ECL: funções prontas para texto, data, arquivo.

Comece o código com `IMPORT STD;`. As mais usadas de `STD.Str`:

| Função | Faz | Exemplo → resultado |
|---|---|---|
| `STD.Str.ToUpperCase(s)` | Tudo maiúsculo | `'ana'` → `'ANA'` |
| `STD.Str.ToLowerCase(s)` | Tudo minúsculo | `'ANA'` → `'ana'` |
| `STD.Str.ToTitleCase(s)` | Primeira letra maiúscula | `'ana smith'` → `'Ana Smith'` |
| `STD.Str.CleanSpaces(s)` | Tira espaços sobrando | `'  a   b '` → `'a b'` |
| `STD.Str.Find(s, alvo, n)` | Posição da n-ésima ocorrência (0 = não achou) | `Find('abcabc','c',1)` → `3` |
| `STD.Str.FindReplace(s, de, para)` | Troca todas as ocorrências | `('a-b','-',' ')` → `'a b'` |
| `STD.Str.Filter(s, permitidos)` | Mantém só os caracteres permitidos | `('(305) 555','0123456789')` → `'305555'` |
| `STD.Str.StartsWith(s, prefixo)` | Começa com? | `('Miami','Mi')` → `TRUE` |
| `TRIM(s)` / `TRIM(s, LEFT, RIGHT)` | Corta espaços do fim / dos dois lados | nativa, sem STD |
| `LENGTH(s)` | Tamanho | nativa, sem STD |

```ecl
IMPORT STD;
Bruto := '  joHN   o\'connor  ';   // aspa simples dentro de texto: barra invertida antes

Limpo := STD.Str.ToTitleCase(STD.Str.ToLowerCase(STD.Str.CleanSpaces(Bruto)));
OUTPUT(Limpo);

Telefone := '(305) 555-0142';
OUTPUT(STD.Str.Filter(Telefone, '0123456789'));          // 3055550142
OUTPUT(STD.Str.Find('ana.smith@example.com', '@', 1));   // 10
```

# PILULA: Biblioteca padrão: datas

> [tecnico] Em HPCC, data costuma ser guardada como número no formato **AAAAMMDD** (`UNSIGNED4`): 15 de março de 1990 é `19900315`. O tipo `STD.Date.Date_t` é exatamente isso. Vantagens: ocupa 4 bytes, ordena certo e compara certo (`data >= 20260101`). As funções de `STD.Date` fazem o resto.

| Função | Faz |
|---|---|
| `STD.Date.Today()` | Data de hoje em AAAAMMDD |
| `STD.Date.Year(d)`, `Month(d)`, `Day(d)` | Pedaços da data |
| `STD.Date.YearsBetween(de, ate)` | Anos completos entre duas datas (idade!) |
| `STD.Date.DaysBetween(de, ate)` | Dias entre duas datas |
| `STD.Date.AdjustDate(d, anos, meses, dias)` | Soma ou subtrai tempo |
| `STD.Date.DateToString(d, '%d/%m/%Y')` | Formata para texto |
| `STD.Date.FromStringToDate(s, '%m/%d/%Y')` | Lê texto em um formato e devolve AAAAMMDD |
| `STD.Date.IsValidDate(d)` | A data existe? |

```ecl
IMPORT STD;
Nasc := 19900315;
Ref  := 20261112;     // usamos uma data fixa nos exercícios para o resultado não mudar com o tempo

OUTPUT(STD.Date.Year(Nasc));                              // 1990
OUTPUT(STD.Date.YearsBetween(Nasc, Ref));                 // 36 (idade)
OUTPUT(STD.Date.DaysBetween(20260101, Ref));              // dias desde o ano novo
OUTPUT(STD.Date.DateToString(Nasc, '%d/%m/%Y'));          // 15/03/1990
OUTPUT(STD.Date.FromStringToDate('03/15/1990', '%m/%d/%Y'));
OUTPUT(STD.Date.AdjustDate(Ref, 0, 0, 30));               // daqui a 30 dias
OUTPUT(STD.Date.IsValidDate(20260230));                   // 30 de fevereiro: false
```

# EXERCICIO: Fatia vertical

Mostre só `sinistro_id`, `tipo` e `valor` dos sinistros com status `OPEN`.

```ecl
IMPORT Aula;

```

## GABARITO
```ecl
IMPORT Aula;
OUTPUT(TABLE(Aula.Sinistros(status = 'OPEN'), {sinistro_id, tipo, valor}));
```
Filtre primeiro, fatie depois: quanto antes você joga fora linha e coluna que não precisa, menos dado o cluster carrega.

# EXERCICIO: Seu primeiro PROJECT

Crie um layout `Layout_Etiqueta` com `UNSIGNED4 id` e `STRING40 etiqueta`. Use PROJECT para gerar, para cada cliente, a etiqueta no formato `SOBRENOME, Nome (UF)`: sobrenome em maiúsculas. Exemplo: `SMITH, Ana (FL)`.

```ecl
IMPORT Aula, STD;

Layout_Etiqueta := RECORD
  UNSIGNED4 id;
  STRING40  etiqueta;
END;

```

## DICA
Dentro do transform: `SELF.etiqueta := STD.Str.ToUpperCase(TRIM(LEFT.sobrenome)) + ', ' + TRIM(LEFT.nome) + ' (' + LEFT.estado + ')';`. O `id` pode vir pelo `SELF := LEFT;`.

## GABARITO
```ecl
IMPORT Aula, STD;

Layout_Etiqueta := RECORD
  UNSIGNED4 id;
  STRING40  etiqueta;
END;

Etiquetas := PROJECT(Aula.Clientes,
                     TRANSFORM(Layout_Etiqueta,
                               SELF.etiqueta := STD.Str.ToUpperCase(TRIM(LEFT.sobrenome)) + ', ' +
                                                TRIM(LEFT.nome) + ' (' + LEFT.estado + ')';
                               SELF := LEFT));
OUTPUT(Etiquetas);
```
Sem o `TRIM`, `'Smith       '` (STRING12) levaria os espaços junto e a etiqueta sairia `SMITH       , Ana`.

# EXERCICIO: Idade com STD.Date

Gere uma tabela com `id`, `nome`, `UNSIGNED1 idade` e `BOOLEAN maior_de_idade` para todos os clientes, considerando a data de referência `20261112`.

```ecl
IMPORT Aula, STD;
Ref := 20261112;

```

## GABARITO
```ecl
IMPORT Aula, STD;
Ref := 20261112;

Layout_Idade := RECORD
  UNSIGNED4 id;
  STRING10  nome;
  UNSIGNED1 idade;
  BOOLEAN   maior_de_idade;
END;

ComIdade := PROJECT(Aula.Clientes,
                    TRANSFORM(Layout_Idade,
                              SELF.idade          := STD.Date.YearsBetween(LEFT.nascimento, Ref);
                              SELF.maior_de_idade := SELF.idade >= 18;
                              SELF := LEFT));
OUTPUT(ComIdade);
```
Detalhe útil: dentro do transform você pode **ler** um campo de `SELF` que já foi preenchido acima (`SELF.idade >= 18`).

# EXERCICIO: Ranking com COUNTER

Monte o ranking das transações por valor (maior primeiro) com os campos `UNSIGNED2 posicao`, `txn_id`, `loja` e `valor`. Mostre só as 5 primeiras posições.

```ecl
IMPORT Aula;

```

## DICA
`TOPN` das 5 maiores primeiro, depois `PROJECT` com `COUNTER`.

## GABARITO
```ecl
IMPORT Aula;

Layout_Rank := RECORD
  UNSIGNED2  posicao;
  UNSIGNED4  txn_id;
  STRING16   loja;
  DECIMAL9_2 valor;
END;

Top5 := TOPN(Aula.Transacoes, 5, -valor);
OUTPUT(PROJECT(Top5, TRANSFORM(Layout_Rank, SELF.posicao := COUNTER; SELF := LEFT)));
```

# REAL: Padronizar um cadastro que chegou sujo

Um parceiro mandou um arquivo de cadastro e, como sempre no mundo real, veio uma bagunça: nomes com espaços e caixa misturada, telefone com símbolos, data como texto no formato americano `MM/DD/AAAA`. Seu trabalho é entregar o arquivo **padronizado**, no layout da empresa:

| Campo de saída | Regra |
|---|---|
| `UNSIGNED4 id` | Sequencial começando em 1 |
| `STRING20 first_name`, `STRING20 last_name` | Sem espaços sobrando, formato `Title Case` |
| `STRING10 phone` | Só os dígitos |
| `UNSIGNED4 dob` | Data em AAAAMMDD |
| `UNSIGNED1 age` | Idade na data de referência `20261112` |
| `BOOLEAN phone_ok` | `TRUE` se o telefone limpo tem exatamente 10 dígitos |

```ecl
IMPORT STD;
Ref := 20261112;

Layout_Bruto := RECORD
  STRING30 fname;
  STRING30 lname;
  STRING20 phone;
  STRING10 dob;       // MM/DD/AAAA
END;

Bruto := DATASET([{'  jOHN ',     'SMITH   ',      '(305) 555-0142', '03/15/1990'},
                  {'MARY  ANN',   '  o\'brien',    '404.555.0199',   '11/02/1985'},
                  {'robert',      'GARCIA  LOPEZ', '555-0100',       '07/04/1976'},
                  {'  Li ',       'nguyen',        '+1 212 555 0177','12/31/2001'}], Layout_Bruto);

Layout_Padrao := RECORD
  UNSIGNED4 id;
  STRING20  first_name;
  STRING20  last_name;
  STRING10  phone;
  UNSIGNED4 dob;
  UNSIGNED1 age;
  BOOLEAN   phone_ok;
END;

// Seu PROJECT aqui

```

## DICA
Monte uma definição auxiliar para não repetir: `Arruma(STRING s) := STD.Str.ToTitleCase(STD.Str.ToLowerCase(STD.Str.CleanSpaces(s)));`. Isso é uma função; você vai estudá-las amanhã, mas já pode usar. Para o telefone: guarde os dígitos numa definição local do transform: `SoDigitos := STD.Str.Filter(LEFT.phone, '0123456789');`.

## GABARITO
```ecl
IMPORT STD;
Ref := 20261112;

Layout_Bruto := RECORD
  STRING30 fname;
  STRING30 lname;
  STRING20 phone;
  STRING10 dob;
END;

Bruto := DATASET([{'  jOHN ',     'SMITH   ',      '(305) 555-0142', '03/15/1990'},
                  {'MARY  ANN',   '  o\'brien',    '404.555.0199',   '11/02/1985'},
                  {'robert',      'GARCIA  LOPEZ', '555-0100',       '07/04/1976'},
                  {'  Li ',       'nguyen',        '+1 212 555 0177','12/31/2001'}], Layout_Bruto);

Layout_Padrao := RECORD
  UNSIGNED4 id;
  STRING20  first_name;
  STRING20  last_name;
  STRING10  phone;
  UNSIGNED4 dob;
  UNSIGNED1 age;
  BOOLEAN   phone_ok;
END;

Arruma(STRING s) := STD.Str.ToTitleCase(STD.Str.ToLowerCase(STD.Str.CleanSpaces(s)));

Layout_Padrao Padronizar(Layout_Bruto L, UNSIGNED4 n) := TRANSFORM
  SoDigitos       := STD.Str.Filter(L.phone, '0123456789');
  SELF.id         := n;
  SELF.first_name := Arruma(L.fname);
  SELF.last_name  := Arruma(L.lname);
  SELF.phone      := SoDigitos;
  SELF.dob        := STD.Date.FromStringToDate(L.dob, '%m/%d/%Y');
  SELF.age        := STD.Date.YearsBetween(SELF.dob, Ref);
  SELF.phone_ok   := LENGTH(TRIM(SoDigitos)) = 10;
END;

OUTPUT(PROJECT(Bruto, Padronizar(LEFT, COUNTER)));
```
Pontos de atenção: (1) definições locais dentro do transform (`SoDigitos`) evitam repetir expressão; (2) o telefone da linha 4 tem 11 dígitos (com o `1` do país): ao ser gravado num `STRING10` ele é truncado, mas o `phone_ok` é calculado **antes** de truncar, por isso sai `FALSE`; (3) a linha 3 tem só 7 dígitos, também `FALSE`. Padronizar e **marcar o que está ruim** em vez de jogar fora é exatamente o que um pipeline de ingestão profissional faz.

# QUIZ

? O que o `PROJECT` faz?
- Remove linhas duplicadas
+ Aplica um TRANSFORM a cada registro, gerando um registro de saída para cada um
- Junta duas tabelas
- Ordena o dataset
! PROJECT percorre o recordset e chama o transform uma vez por linha.

? Dentro de um TRANSFORM de PROJECT, o que são `SELF` e `LEFT`?
- SELF é a tabela inteira e LEFT é a primeira linha
+ SELF é o registro de saída em construção; LEFT é o registro de entrada da vez
- SELF é a entrada e LEFT é a saída
- São a mesma coisa
! Você lê de LEFT e escreve em SELF.

? O que `SELF := LEFT;` faz?
- Copia a tabela inteira
- Substitui todos os campos, inclusive os já atribuídos
+ Copia de LEFT todos os campos de mesmo nome que ainda não foram atribuídos
- Dá erro se os layouts forem diferentes
! É o atalho para "o resto fica igual". Atribuições explícitas têm prioridade.

? Como a data 4 de julho de 2026 costuma ser guardada em HPCC?
- `'04/07/2026'` (STRING10)
- `'2026-07-04'` (STRING10)
+ `20260704` (UNSIGNED4, formato AAAAMMDD)
- `4072026` (INTEGER)
! AAAAMMDD como inteiro ocupa 4 bytes, ordena e compara corretamente.

? Qual função mantém somente os dígitos de `'(305) 555-0142'`?
- `STD.Str.CleanSpaces(s)`
- `STD.Str.Find(s, '0123456789', 1)`
+ `STD.Str.Filter(s, '0123456789')`
- `TRIM(s)`
! Filter mantém apenas os caracteres que estão no segundo parâmetro.

? Para que serve o `COUNTER` em um PROJECT?
- Conta quantos campos o layout tem
+ Informa o número da linha que está sendo processada (1, 2, 3...)
- Conta os registros do dataset inteiro
- Limita o número de linhas de saída
! COUNTER vale 1 no primeiro registro, 2 no segundo, e assim por diante.

? O que acontece se um campo do layout de saída não for preenchido no TRANSFORM (e não houver `SELF := LEFT` nem `SELF := []`)?
- O campo fica vazio automaticamente
+ O compilador acusa erro
- O registro é descartado
- O campo recebe NULL
! Todo campo de saída precisa receber valor. ECL não tem NULL.

# FLASHCARDS

Q: Estrutura de um TRANSFORM nomeado.
A: `LayoutSaida Nome(LayoutEntrada L) := TRANSFORM SELF.campo := ...; SELF := L; END;`
Q: Como chamar um transform em todas as linhas?
A: `PROJECT(ds, Nome(LEFT))` ou inline `PROJECT(ds, TRANSFORM(Layout, ...; SELF := LEFT))`.
Q: O que significa `SELF := [];`?
A: Preenche os campos de saída restantes com valor vazio/zero.
Q: Como calcular idade a partir de uma data AAAAMMDD?
A: `STD.Date.YearsBetween(nascimento, STD.Date.Today())`
Q: Como padronizar um nome sujo?
A: `STD.Str.ToTitleCase(STD.Str.ToLowerCase(STD.Str.CleanSpaces(s)))`
Q: Como herdar todos os campos de um layout em outro?
A: Escreva o nome do layout dentro do novo RECORD: `Novo := RECORD Antigo; STRING extra; END;`
Q: Como converter '03/15/1990' para 19900315?
A: `STD.Date.FromStringToDate('03/15/1990', '%m/%d/%Y')`
