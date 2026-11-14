---
dia: 2
modulo: 1
titulo: RECORD, DATASET e filtros
horas: 3
---

# MISSAO

> [goggins] Ontem você brincou com um valor de cada vez. Bonitinho. Hoje começa o trabalho de verdade: **tabelas**. Tudo em HPCC é tabela. Se você dominar o que vem hoje, o resto do curso é variação do mesmo tema. Se enrolar hoje, vai sofrer até o dia 30. Escolha.

**Hoje você vai:**

- Descrever o formato de uma linha com `RECORD`.
- Criar tabelas com `DATASET`.
- Filtrar linhas (o `WHERE` do ECL) com condições simples e combinadas.
- Usar conjuntos com `IN`, intervalos com `BETWEEN` e contar com `COUNT` e `EXISTS`.

# PILULA: RECORD é o molde, DATASET é a pilha de fichas

> [crianca] Pense numa ficha de cadastro da escola: tem um espaço para **nome**, um para **idade**, um para **cidade**. A ficha em branco é o **molde**. Quando você preenche uma ficha para cada aluno e empilha todas, você tem a **pilha de fichas**. Em ECL, o molde se chama `RECORD` e a pilha se chama `DATASET`.

> [tecnico] `RECORD ... END;` define o **layout**: a lista de campos, cada um com tipo e nome. `DATASET` é um conjunto de registros com aquele layout. Um dataset pode vir de um arquivo no cluster (dia 6) ou ser escrito direto no código, chamado *inline*, ótimo para testes: `DATASET([ {linha1}, {linha2} ], Layout)`. Os valores de cada linha seguem a **ordem dos campos** do RECORD.

```ecl
Layout_Pessoa := RECORD
  UNSIGNED4 id;
  STRING15  nome;
  STRING2   estado;
  UNSIGNED1 idade;
END;

Pessoas := DATASET([{1, 'Ana',    'FL', 34},
                    {2, 'Bruno',  'GA', 17},
                    {3, 'Carla',  'FL', 52},
                    {4, 'Diego',  'TX', 29},
                    {5, 'Elisa',  'GA', 71}], Layout_Pessoa);

OUTPUT(Pessoas);
```

> [cuidado] `Pessoas := DATASET(...)` continua sendo só uma **definição** (receita). A tabela só aparece por causa do `OUTPUT`. E `STRING15` tem tamanho fixo: `'Ana'` é guardado como `'Ana'` mais 12 espaços. Isso importa quando você junta textos; a função `TRIM()` corta os espaços do fim.

# PILULA: Filtrar linhas

> [crianca] Você tem a pilha de fichas e quer só as dos alunos que moram na Flórida. Você passa ficha por ficha e separa as que têm "FL" escrito. Em ECL você escreve a pilha e, **entre parênteses**, a pergunta que cada ficha tem que responder "sim".

> [tecnico] `dataset(condição)` devolve um novo recordset só com os registros em que a condição é verdadeira. É o equivalente ao `WHERE` do SQL. Combine condições com `AND`, `OR` e `NOT`. Vírgula entre condições também significa `AND`. O filtro **não altera** o dataset original: ele descreve outro conjunto.

```ecl
Layout_Pessoa := RECORD
  UNSIGNED4 id;
  STRING15  nome;
  STRING2   estado;
  UNSIGNED1 idade;
END;
Pessoas := DATASET([{1,'Ana','FL',34},{2,'Bruno','GA',17},{3,'Carla','FL',52},
                    {4,'Diego','TX',29},{5,'Elisa','GA',71}], Layout_Pessoa);

DaFlorida      := Pessoas(estado = 'FL');
Adultos        := Pessoas(idade >= 18);
AdultosDaGA    := Pessoas(estado = 'GA' AND idade >= 18);
JovensOuIdosos := Pessoas(idade < 18 OR idade >= 65);

OUTPUT(DaFlorida,      NAMED('DaFlorida'));
OUTPUT(AdultosDaGA,    NAMED('AdultosDaGA'));
OUTPUT(JovensOuIdosos, NAMED('JovensOuIdosos'));
```

`NAMED('...')` dá um nome ao resultado para ele não aparecer só como "Result 1".

> [real] Definições se empilham. Em código de produção você vê cadeias assim: `Ativos := Clientes(status = 'A'); AtivosFL := Ativos(estado = 'FL'); AtivosFLAdultos := AtivosFL(idade >= 18);`. Cada nome é um degrau reaproveitável. É o estilo "dicionário" do ECL: você vai criando palavras novas a partir das anteriores.

# PILULA: Conjuntos, IN e BETWEEN

> [crianca] Em vez de perguntar "é da Flórida? ou é da Geórgia? ou é do Texas?", você escreve uma **lista** num papel e pergunta uma vez só: "o estado desta ficha está na lista?".

> [tecnico] Um **SET** é uma lista de valores entre colchetes: `['FL','GA','TX']`. O operador `IN` testa se um valor pertence ao conjunto; `NOT IN` testa o contrário. `BETWEEN a AND b` testa um intervalo e **inclui** as duas pontas. Um SET também pode receber nome e tipo: `SET OF STRING2 Sudeste := ['FL','GA'];`.

```ecl
Layout_Pessoa := RECORD
  UNSIGNED4 id;
  STRING15  nome;
  STRING2   estado;
  UNSIGNED1 idade;
END;
Pessoas := DATASET([{1,'Ana','FL',34},{2,'Bruno','GA',17},{3,'Carla','FL',52},
                    {4,'Diego','TX',29},{5,'Elisa','GA',71}], Layout_Pessoa);

SET OF STRING2 Sudeste := ['FL', 'GA'];

OUTPUT(Pessoas(estado IN Sudeste),           NAMED('NoSudeste'));
OUTPUT(Pessoas(estado NOT IN Sudeste),       NAMED('ForaDoSudeste'));
OUTPUT(Pessoas(idade BETWEEN 29 AND 52),     NAMED('De29a52'));
```

# PILULA: Contar e perguntar se existe

> [tecnico] `COUNT(recordset)` devolve quantos registros há. `EXISTS(recordset)` devolve `TRUE` se houver pelo menos um; é mais barato que `COUNT(...) > 0`, porque para no primeiro que achar. `NOT EXISTS(...)` é o "não tem nenhum".

```ecl
Layout_Pessoa := RECORD
  UNSIGNED4 id;
  STRING15  nome;
  STRING2   estado;
  UNSIGNED1 idade;
END;
Pessoas := DATASET([{1,'Ana','FL',34},{2,'Bruno','GA',17},{3,'Carla','FL',52},
                    {4,'Diego','TX',29},{5,'Elisa','GA',71}], Layout_Pessoa);

OUTPUT(COUNT(Pessoas),                  NAMED('Total'));
OUTPUT(COUNT(Pessoas(estado = 'FL')),   NAMED('QtdFlorida'));
OUTPUT(EXISTS(Pessoas(idade > 100)),    NAMED('TemCentenario'));
OUTPUT(EXISTS(Pessoas(estado = 'TX')),  NAMED('TemTexas'));
```

> [goggins] Você acabou de ver os quatro tipos de definição do ECL: **valor** (`Total := 10`), **booleana** (`Maior := idade >= 18`), **conjunto** (`Sudeste := ['FL','GA']`) e **recordset** (`Adultos := Pessoas(idade >= 18)`). Não existe um quinto. Todo código ECL do planeta é combinação desses quatro. Guarda isso.

# PILULA: Acessando um campo e uma linha

Para falar de um campo fora de um filtro, use `dataset.campo`. Para pegar a linha número N, use colchetes: `Pessoas[1]` é a primeira linha (começa em 1). `Pessoas[1].nome` é o nome da primeira pessoa.

```ecl
Layout_Pessoa := RECORD
  UNSIGNED4 id;
  STRING15  nome;
  STRING2   estado;
  UNSIGNED1 idade;
END;
Pessoas := DATASET([{1,'Ana','FL',34},{2,'Bruno','GA',17},{3,'Carla','FL',52}], Layout_Pessoa);

OUTPUT(Pessoas[2].nome);                       // Bruno
OUTPUT(TRIM(Pessoas[1].nome) + ' mora em ' + Pessoas[1].estado);
OUTPUT(Pessoas[2..3]);                         // linhas 2 até 3
```

# EXERCICIO: Seu primeiro RECORD e DATASET

Crie um layout `Layout_Veiculo` com `STRING17 vin`, `STRING12 marca`, `UNSIGNED2 ano` e `STRING2 estado`. Crie o dataset `Veiculos` com estas 4 linhas e mostre-o:

| vin | marca | ano | estado |
|---|---|---|---|
| 1HGCM82633A004352 | Honda | 2019 | FL |
| 5YJ3E1EA7KF317000 | Tesla | 2023 | CA |
| 1FTFW1ET5DFC10312 | Ford | 2013 | TX |
| 2T1BURHE0JC034301 | Toyota | 2018 | FL |

```ecl
// Layout_Veiculo

// Veiculos

```

## DICA
Molde: `Nome := RECORD` ... campos com `;` ... `END;`. Linhas: `DATASET([{...},{...}], Layout_Veiculo)`. Textos entre aspas simples.

## GABARITO
```ecl
Layout_Veiculo := RECORD
  STRING17  vin;
  STRING12  marca;
  UNSIGNED2 ano;
  STRING2   estado;
END;

Veiculos := DATASET([{'1HGCM82633A004352', 'Honda',  2019, 'FL'},
                     {'5YJ3E1EA7KF317000', 'Tesla',  2023, 'CA'},
                     {'1FTFW1ET5DFC10312', 'Ford',   2013, 'TX'},
                     {'2T1BURHE0JC034301', 'Toyota', 2018, 'FL'}], Layout_Veiculo);
OUTPUT(Veiculos);
```

# EXERCICIO: Filtros combinados

Usando o dataset abaixo, produza **três resultados, nesta ordem**: (1) veículos da Flórida; (2) veículos de 2018 ou mais novos que **não** são da Flórida; (3) quantos veículos são anteriores a 2015.

```ecl
Layout_Veiculo := RECORD
  STRING17  vin;
  STRING12  marca;
  UNSIGNED2 ano;
  STRING2   estado;
END;
Veiculos := DATASET([{'1HGCM82633A004352','Honda',2019,'FL'},{'5YJ3E1EA7KF317000','Tesla',2023,'CA'},
                     {'1FTFW1ET5DFC10312','Ford',2013,'TX'},{'2T1BURHE0JC034301','Toyota',2018,'FL'},
                     {'1N4AL3AP8JC231503','Nissan',2010,'GA'},{'1G1ZD5ST8LF091234','Chevrolet',2020,'TX'}], Layout_Veiculo);

// (1)
// (2)
// (3)

```

## GABARITO
```ecl
Layout_Veiculo := RECORD
  STRING17  vin;
  STRING12  marca;
  UNSIGNED2 ano;
  STRING2   estado;
END;
Veiculos := DATASET([{'1HGCM82633A004352','Honda',2019,'FL'},{'5YJ3E1EA7KF317000','Tesla',2023,'CA'},
                     {'1FTFW1ET5DFC10312','Ford',2013,'TX'},{'2T1BURHE0JC034301','Toyota',2018,'FL'},
                     {'1N4AL3AP8JC231503','Nissan',2010,'GA'},{'1G1ZD5ST8LF091234','Chevrolet',2020,'TX'}], Layout_Veiculo);

OUTPUT(Veiculos(estado = 'FL'));
OUTPUT(Veiculos(ano >= 2018 AND estado <> 'FL'));
OUTPUT(COUNT(Veiculos(ano < 2015)));
```

# EXERCICIO: IN, BETWEEN e EXISTS

Com o mesmo dataset: (1) defina o conjunto `Japonesas` com Honda, Toyota e Nissan e mostre os veículos dessas marcas; (2) mostre os veículos com ano entre 2013 e 2019; (3) mostre `TRUE`/`FALSE` respondendo "existe algum Tesla no Texas?".

```ecl
Layout_Veiculo := RECORD
  STRING17  vin;
  STRING12  marca;
  UNSIGNED2 ano;
  STRING2   estado;
END;
Veiculos := DATASET([{'1HGCM82633A004352','Honda',2019,'FL'},{'5YJ3E1EA7KF317000','Tesla',2023,'CA'},
                     {'1FTFW1ET5DFC10312','Ford',2013,'TX'},{'2T1BURHE0JC034301','Toyota',2018,'FL'},
                     {'1N4AL3AP8JC231503','Nissan',2010,'GA'},{'1G1ZD5ST8LF091234','Chevrolet',2020,'TX'}], Layout_Veiculo);

```

## DICA
`SET OF STRING12 Japonesas := [...]`. Para o item 3, o filtro vai **dentro** do `EXISTS`.

## GABARITO
```ecl
Layout_Veiculo := RECORD
  STRING17  vin;
  STRING12  marca;
  UNSIGNED2 ano;
  STRING2   estado;
END;
Veiculos := DATASET([{'1HGCM82633A004352','Honda',2019,'FL'},{'5YJ3E1EA7KF317000','Tesla',2023,'CA'},
                     {'1FTFW1ET5DFC10312','Ford',2013,'TX'},{'2T1BURHE0JC034301','Toyota',2018,'FL'},
                     {'1N4AL3AP8JC231503','Nissan',2010,'GA'},{'1G1ZD5ST8LF091234','Chevrolet',2020,'TX'}], Layout_Veiculo);

SET OF STRING12 Japonesas := ['Honda', 'Toyota', 'Nissan'];

OUTPUT(Veiculos(marca IN Japonesas));
OUTPUT(Veiculos(ano BETWEEN 2013 AND 2019));
OUTPUT(EXISTS(Veiculos(marca = 'Tesla' AND estado = 'TX')));
```
Repare: `marca` é `STRING12` e `'Honda'` tem 5 letras. A comparação de textos em ECL ignora os espaços do fim, então funciona sem `TRIM`.

# REAL: Triagem de sinistros suspeitos

Você trabalha no time antifraude de uma seguradora. Chegou um lote de sinistros e a regra de triagem do analista é:

- **Alto valor**: valor acima de 20000.
- **Suspeito**: é de alto valor, do tipo `INJURY` (lesão corporal) **e** foi aberto com menos de 30 dias de apólice.
- **Fila rápida**: tipo `GLASS` (vidro) com valor até 800: paga sem análise.

Entregue quatro resultados, nesta ordem: (1) os sinistros suspeitos; (2) a quantidade de suspeitos; (3) os da fila rápida; (4) `TRUE`/`FALSE`: existe algum sinistro que **não** é de alto valor mas tem menos de 5 dias de apólice?

```ecl
Layout_Sinistro := RECORD
  UNSIGNED4 sinistro_id;
  STRING10  tipo;
  UNSIGNED4 valor;
  UNSIGNED2 dias_de_apolice;   // dias entre contratar o seguro e o sinistro
END;

Sinistros := DATASET([{101, 'COLLISION',  8400, 410},
                      {102, 'INJURY',    45000,  12},
                      {103, 'GLASS',       350, 200},
                      {104, 'INJURY',    38000, 600},
                      {105, 'THEFT',     27000,   3},
                      {106, 'GLASS',      1200,  90},
                      {107, 'INJURY',    49900,  25},
                      {108, 'COLLISION',  1500,   2}], Layout_Sinistro);

// Crie definições com nome: AltoValor, Suspeitos, FilaRapida...

```

## DICA
Comece por `AltoValor := Sinistros(valor > 20000);` e depois filtre **em cima dela**: `Suspeitos := AltoValor(...)`. Para o item 4, `NOT IN` não serve; use a condição contrária de alto valor (`valor <= 20000`).

## GABARITO
```ecl
Layout_Sinistro := RECORD
  UNSIGNED4 sinistro_id;
  STRING10  tipo;
  UNSIGNED4 valor;
  UNSIGNED2 dias_de_apolice;
END;

Sinistros := DATASET([{101,'COLLISION',8400,410},{102,'INJURY',45000,12},{103,'GLASS',350,200},
                      {104,'INJURY',38000,600},{105,'THEFT',27000,3},{106,'GLASS',1200,90},
                      {107,'INJURY',49900,25},{108,'COLLISION',1500,2}], Layout_Sinistro);

AltoValor  := Sinistros(valor > 20000);
Suspeitos  := AltoValor(tipo = 'INJURY' AND dias_de_apolice < 30);
FilaRapida := Sinistros(tipo = 'GLASS' AND valor <= 800);

OUTPUT(Suspeitos);
OUTPUT(COUNT(Suspeitos));
OUTPUT(FilaRapida);
OUTPUT(EXISTS(Sinistros(valor <= 20000 AND dias_de_apolice < 5)));
```
Suspeitos: 102 e 107. Fila rápida: 103. O item 4 é `TRUE` por causa do 108. Fraude logo depois de contratar a apólice é um padrão clássico que as seguradoras monitoram; você vai caçar uma quadrilha inteira assim no dia 28.

# QUIZ

? O que um `RECORD` define?
- Os dados de uma tabela
+ O formato de uma linha: os campos, seus tipos e nomes
- Um filtro
- Uma ação que grava em disco
! RECORD é o molde. Os dados ficam no DATASET.

? Como filtrar as pessoas com idade maior que 30?
- `Pessoas WHERE idade > 30`
- `FILTER(Pessoas, idade > 30)`
+ `Pessoas(idade > 30)`
- `Pessoas[idade > 30]`
! Filtro é o dataset seguido da condição entre parênteses. Colchetes são para pegar linhas por posição.

? Quanto vale `Pessoas[1]`?
- O primeiro campo de todas as linhas
+ A primeira linha do dataset
- A segunda linha (porque começa em zero)
- Um erro
! Índices em ECL começam em 1.

? `x BETWEEN 10 AND 20` é verdadeiro para quais valores?
- 11 a 19
- 10 a 19
+ 10 a 20, incluindo as duas pontas
- 11 a 20
! BETWEEN é inclusivo nos dois lados.

? Qual é a forma mais eficiente de saber se há pelo menos um registro do Texas?
- `COUNT(Pessoas(estado = 'TX')) > 0`
+ `EXISTS(Pessoas(estado = 'TX'))`
- `Pessoas(estado = 'TX')[1]`
- `IF(Pessoas.estado = 'TX', TRUE, FALSE)`
! EXISTS pode parar no primeiro registro encontrado; COUNT precisa contar todos.

? `Adultos := Pessoas(idade >= 18);` — o que essa linha faz com o dataset `Pessoas`?
- Apaga os menores de idade de `Pessoas`
- Executa o filtro e guarda o resultado em disco
+ Nada: só define um novo recordset; `Pessoas` continua igual
- Ordena por idade
! Filtro descreve outro conjunto. Nada é alterado e nada roda até uma ação pedir.

? Quais são os quatro tipos de definição em ECL?
- Variável, função, classe e tabela
+ Valor, booleana, conjunto (SET) e recordset
- Inteiro, texto, data e tabela
- Thor, Roxie, hThor e Dali
! Valor, booleana, set e recordset. Tudo em ECL é combinação desses quatro.

# FLASHCARDS

Q: Como se escreve um layout?
A: `Nome := RECORD` + campos (`TIPO nome;`) + `END;`
Q: Como criar um dataset inline?
A: `DATASET([{v1, v2}, {v1, v2}], Layout)` — valores na ordem dos campos.
Q: Como filtrar um dataset?
A: `Dataset(condição)`, ex.: `Pessoas(estado = 'FL' AND idade >= 18)`.
Q: Como testar se um valor está numa lista?
A: `campo IN ['A','B','C']` (ou `NOT IN`).
Q: Diferença entre COUNT e EXISTS.
A: COUNT conta todos os registros; EXISTS só diz se há pelo menos um e é mais barato.
Q: Como pegar o nome da terceira linha de Pessoas?
A: `Pessoas[3].nome`
Q: Para que serve NAMED em um OUTPUT?
A: Dá nome ao resultado: `OUTPUT(ds, NAMED('Nome'))`.
