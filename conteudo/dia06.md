---
dia: 6
modulo: 2
titulo: Arquivos: landing zone, spray e arquivos lógicos
horas: 3
---

# MISSAO

> [goggins] Módulo 1 no bolso. Põe no pote de biscoitos e fecha a tampa, porque acabou a brincadeira de 12 linhas. A partir de hoje você trabalha com **arquivos de verdade dentro do cluster**: 21 mil pessoas, 30 mil sinistros, 120 mil transações. É pouco perto de produção, mas o código que funciona aqui é o mesmo que roda em 20 bilhões de linhas. Hoje você aprende o caminho que todo dado faz para entrar no Thor.

**Hoje você vai:**

- Entender landing zone, spray, arquivo lógico e arquivo físico.
- Ler arquivos CSV e arquivos nativos do Thor com `DATASET`.
- Gravar arquivos com `OUTPUT`.
- Fazer o seu próprio spray, pela tela e por código.

Os blocos de hoje rodam no **thor** (o editor já vem com esse alvo selecionado).

# PILULA: O caminho do dado: landing zone → spray → Thor

> [crianca] Chegou um caminhão com uma caixa gigante de peças de LEGO. Primeiro o caminhão descarrega a caixa na **calçada** da fábrica (a landing zone). Mas ninguém consegue trabalhar com uma caixa só: então um funcionário **distribui** as peças em 400 mesinhas, um punhado para cada trabalhador (o spray). Agora todo mundo consegue montar ao mesmo tempo. Quando o brinquedo fica pronto e precisa sair da fábrica, alguém junta tudo numa caixa só de novo (o despray).

> [tecnico] **Landing zone** (ou *dropzone*) é uma pasta comum, visível para o cluster, onde arquivos externos chegam. **Spray** é o processo que copia o arquivo da landing zone para dentro do Thor, **quebrando-o em partes**, uma por nó. O resultado é um **arquivo lógico**: um nome registrado no Dali (por exemplo `~ecl30::raw::pessoas`) que aponta para N **partes físicas** espalhadas no disco dos nós (`pessoas._1_of_400`, `pessoas._2_of_400`...). Você sempre trabalha com o nome lógico; o cluster cuida das partes. **Despray** é o caminho de volta: junta as partes num arquivo só na landing zone.

Nomes lógicos seguem a convenção `~escopo::subescopo::nome`. Os `::` funcionam como pastas. O `~` no começo quer dizer "nome completo, não acrescente nada na frente". No curso:

| Nome | O que é |
|---|---|
| `~ecl30::raw::pessoas` | CSV cru de pessoas, como veio da landing zone |
| `~ecl30::raw::veiculos`, `sinistros`, `transacoes` | Idem para as outras tabelas |
| `~ecl30::base::pessoas` (e as outras) | Mesmos dados já convertidos para o formato nativo do Thor |
| `~aluno::...` | **Seu espaço**: tudo o que você gravar vai aqui |

Abra o [ECL Watch](http://localhost:8010), menu **Files → Logical Files**, e encontre esses arquivos. Clique em um e veja a aba de conteúdo e a de partes. Depois vá em **Files → Landing Zones** e veja os CSVs originais parados na "calçada".

> [real] Em produção na LexisNexis chegam milhares de arquivos por dia de fontes diferentes: cartórios, DMVs (os Detrans americanos), tribunais, operadoras. Cada fonte cai numa pasta da landing zone, um job agendado faz o spray e dispara o pipeline. O padrão de nome carrega a informação: `~thor::in::dmv::fl::20261112::vehicles` diz ambiente, estágio, fonte, estado e data só pelo nome.

# PILULA: Lendo um arquivo CSV

> [tecnico] `DATASET('nome_logico', Layout, CSV(opções))` declara um dataset que lê um arquivo delimitado. Opções mais comuns: `HEADING(1)` pula a linha de cabeçalho; `SEPARATOR('|')` muda o separador (padrão vírgula); `QUOTE('"')` define o caractere de aspas; `TERMINATOR('\n')` o fim de linha. Os campos do layout são preenchidos **pela ordem das colunas**, não pelo nome. Prática profissional para arquivo que você nunca viu: leia **tudo como STRING** primeiro, olhe, e só depois converta.

```ecl thor
Layout_Cru := RECORD
  STRING vin;
  STRING person_id;
  STRING make;
  STRING model;
  STRING year;
  STRING plate;
  STRING state;
END;

VeiculosCru := DATASET('~ecl30::raw::veiculos', Layout_Cru, CSV(HEADING(1)));

OUTPUT(COUNT(VeiculosCru),       NAMED('Linhas'));
OUTPUT(CHOOSEN(VeiculosCru, 10), NAMED('Amostra'));
```

Se você declarar os campos já com tipo (`UNSIGNED4 person_id; UNSIGNED2 year;`), o leitor de CSV converte o texto na leitura:

```ecl thor
Layout_Veiculo := RECORD
  STRING17  vin;
  UNSIGNED4 person_id;
  STRING12  make;
  STRING12  model;
  UNSIGNED2 year;
  STRING7   plate;
  STRING2   state;
END;

Veiculos := DATASET('~ecl30::raw::veiculos', Layout_Veiculo, CSV(HEADING(1)));
OUTPUT(TABLE(Veiculos, {make, UNSIGNED4 qtd := COUNT(GROUP), UNSIGNED2 mais_novo := MAX(GROUP, year)}, make, FEW));
```

> [cuidado] O `DATASET` de arquivo é só uma **declaração**: ele não confere se o layout bate com o arquivo. Se você errar a ordem ou esquecer uma coluna, o código compila e os dados saem **deslocados**, com placa no lugar do estado. Sempre rode um `CHOOSEN(..., 10)` e olhe com os próprios olhos.

# PILULA: Gravando e lendo arquivos nativos do Thor

> [crianca] O CSV é como um caderno escrito à mão: qualquer pessoa lê, mas é lento de consultar. O arquivo nativo do Thor é como fichas já impressas no tamanho certo, cada informação sempre no mesmo lugar: a máquina lê voando.

> [tecnico] `OUTPUT(recordset, , 'nome_logico', OVERWRITE)` grava o recordset como arquivo lógico no formato nativo (também chamado *flat* ou THOR), com os tipos binários do layout. Repare nas **duas vírgulas**: o segundo parâmetro (formato de colunas) fica vazio. Sem `OVERWRITE`, rodar duas vezes dá erro porque o arquivo já existe. Para ler de volta: `DATASET('nome_logico', Layout, THOR)`. Aqui o layout **precisa** ser exatamente o da gravação. Outros formatos de saída: `CSV(HEADING(SINGLE))`, `XML`, `JSON`.

```ecl thor
Layout_Veiculo := RECORD
  STRING17  vin;
  UNSIGNED4 person_id;
  STRING12  make;
  STRING12  model;
  UNSIGNED2 year;
  STRING7   plate;
  STRING2   state;
END;
Veiculos := DATASET('~ecl30::raw::veiculos', Layout_Veiculo, CSV(HEADING(1)));

Teslas := Veiculos(make = 'Tesla');

// Grava um arquivo novo no seu espaço
OUTPUT(Teslas, , '~aluno::dia06::teslas', OVERWRITE);

// Declara a leitura do arquivo gravado e usa
TeslasGravados := DATASET('~aluno::dia06::teslas', Layout_Veiculo, THOR);
OUTPUT(COUNT(TeslasGravados),       NAMED('QtdTeslas'));
OUTPUT(CHOOSEN(TeslasGravados, 5),  NAMED('Amostra'));
```

Depois de rodar, procure `aluno::dia06::teslas` em **Files → Logical Files** no ECL Watch.

> [real] O padrão de todo pipeline é este: lê cru (CSV), converte e limpa, **grava base** em formato nativo, e daí para frente todos os jobs leem o arquivo base. Ninguém processa CSV duas vezes. Ler formato nativo é várias vezes mais rápido porque não há texto para interpretar.

# PILULA: Spray: trazendo um arquivo novo

Você vai fazer o spray de `pessoas.csv` para o seu espaço de duas formas.

**Pela tela (faça agora):**

1. ECL Watch → **Files → Landing Zones**.
2. Abra a dropzone `mydropzone` e marque `pessoas.csv`.
3. Clique em **Delimited** (spray de arquivo delimitado).
4. Em *Target Name* escreva `aluno::tela::pessoas`, marque *Overwrite* e confirme.
5. Vá em **Files → Logical Files** e confira que o arquivo apareceu.

**Por código** (é assim que jobs automáticos fazem):

```ecl thor
IMPORT STD;

STD.File.SprayDelimited(sourcePlane            := 'mydropzone',
                        sourcePath             := '/var/lib/HPCCSystems/dropzone/pessoas.csv',
                        destinationGroup       := 'data',
                        destinationLogicalName := '~aluno::raw::pessoas',
                        allowOverwrite         := TRUE);

OUTPUT(STD.File.FileExists('~aluno::raw::pessoas'), NAMED('Existe'));
```

> [tecnico] `SprayDelimited` serve para CSV e outros arquivos com separador e tamanho de linha variável. Para arquivos de largura fixa existe `SprayFixed` (você informa o tamanho do registro), e para XML/JSON, `SprayXml`/`SprayJson`. `sourcePlane` é a landing zone; `destinationGroup` é onde o arquivo vai morar (neste cluster, o plano de dados `data`). Outras funções úteis de `STD.File`: `FileExists(nome)`, `DeleteLogicalFile(nome)`, `RenameLogicalFile(de, para)`, `Despray(...)`.

# EXERCICIO: Lendo o CSV de sinistros

O arquivo `~ecl30::raw::sinistros` tem estas colunas, nesta ordem: `claim_id, person_id, policy, claim_date, claim_type, amount, vin, repair_shop, status`. Declare um layout com **todos os campos como STRING**, leia o arquivo e mostre: (1) a quantidade de linhas; (2) as 5 primeiras linhas.

```ecl thor

```

## GABARITO
```ecl thor
Layout_Cru := RECORD
  STRING claim_id;
  STRING person_id;
  STRING policy;
  STRING claim_date;
  STRING claim_type;
  STRING amount;
  STRING vin;
  STRING repair_shop;
  STRING status;
END;

SinistrosCru := DATASET('~ecl30::raw::sinistros', Layout_Cru, CSV(HEADING(1)));
OUTPUT(COUNT(SinistrosCru));
OUTPUT(CHOOSEN(SinistrosCru, 5));
```

# EXERCICIO: Do cru ao tipado

Leia de novo `~ecl30::raw::sinistros`, agora com tipos: `UNSIGNED4 claim_id`, `UNSIGNED4 person_id`, `STRING10 policy`, `UNSIGNED4 claim_date`, `STRING10 claim_type`, `UNSIGNED4 amount`, `STRING17 vin`, `STRING25 repair_shop`, `STRING6 status`. Mostre um resumo por `claim_type` com quantidade e valor total, ordenado pelo total decrescente.

```ecl thor

```

## GABARITO
```ecl thor
Layout_Sinistro := RECORD
  UNSIGNED4 claim_id;
  UNSIGNED4 person_id;
  STRING10  policy;
  UNSIGNED4 claim_date;
  STRING10  claim_type;
  UNSIGNED4 amount;
  STRING17  vin;
  STRING25  repair_shop;
  STRING6   status;
END;

Sinistros := DATASET('~ecl30::raw::sinistros', Layout_Sinistro, CSV(HEADING(1)));

PorTipo := TABLE(Sinistros,
                 {claim_type, UNSIGNED4 qtd := COUNT(GROUP), UNSIGNED8 total := SUM(GROUP, amount)},
                 claim_type, FEW);
OUTPUT(SORT(PorTipo, -total));
```
`UNSIGNED8` no total: somas em tabelas grandes estouram 4 bytes (limite de ~4,29 bilhões) com facilidade. Na dúvida, soma vai em 8 bytes.

# EXERCICIO: Gravar e reler

Usando o mesmo layout tipado: filtre os sinistros com status `OPEN`, grave em `~aluno::dia06::abertos`, declare a leitura do arquivo gravado e mostre a quantidade de linhas e a soma de `amount` **lidas do arquivo gravado**.

```ecl thor
Layout_Sinistro := RECORD
  UNSIGNED4 claim_id;
  UNSIGNED4 person_id;
  STRING10  policy;
  UNSIGNED4 claim_date;
  STRING10  claim_type;
  UNSIGNED4 amount;
  STRING17  vin;
  STRING25  repair_shop;
  STRING6   status;
END;
Sinistros := DATASET('~ecl30::raw::sinistros', Layout_Sinistro, CSV(HEADING(1)));

```

## DICA
`OUTPUT(ds, , 'nome', OVERWRITE);` com duas vírgulas. A leitura usa `THOR` no lugar de `CSV(...)`.

## GABARITO
```ecl thor
Layout_Sinistro := RECORD
  UNSIGNED4 claim_id;
  UNSIGNED4 person_id;
  STRING10  policy;
  UNSIGNED4 claim_date;
  STRING10  claim_type;
  UNSIGNED4 amount;
  STRING17  vin;
  STRING25  repair_shop;
  STRING6   status;
END;
Sinistros := DATASET('~ecl30::raw::sinistros', Layout_Sinistro, CSV(HEADING(1)));

OUTPUT(Sinistros(status = 'OPEN'), , '~aluno::dia06::abertos', OVERWRITE);

Abertos := DATASET('~aluno::dia06::abertos', Layout_Sinistro, THOR);
OUTPUT(COUNT(Abertos));
OUTPUT(SUM(Abertos, amount));
```

# REAL: Ingestão do arquivo de transações

Chegou na landing zone o arquivo diário de transações de cartão de um banco cliente. Sua tarefa é a etapa de **ingestão**: do CSV cru ao arquivo base, com um relatório de controle. É a primeira etapa de qualquer pipeline de produção.

O arquivo cru é `~ecl30::raw::transacoes`, colunas na ordem: `txn_id, person_id, txn_date, txn_time, amount, merchant, category, state`.

Entregue:

1. Um arquivo base `~aluno::base::transacoes` em formato nativo com os tipos: `UNSIGNED4 txn_id`, `UNSIGNED4 person_id`, `UNSIGNED4 txn_date`, `STRING4 txn_time`, `DECIMAL9_2 amount`, `STRING16 merchant`, `STRING12 category`, `STRING2 state`, **mais** um campo novo `UNSIGNED1 hora` (os dois primeiros caracteres de `txn_time` convertidos para número) e um campo `BOOLEAN madrugada` (`TRUE` quando a hora é menor que 6).
2. Lendo **do arquivo base gravado**, o relatório de controle com três resultados, nesta ordem: (a) total de linhas; (b) soma de `amount`; (c) quantidade de transações de madrugada por categoria, ordenada da maior para a menor.

```ecl thor

```

## DICA
Leia o CSV com um layout de entrada (8 campos). Crie o layout de saída herdando o de entrada e acrescentando `hora` e `madrugada`. Um `PROJECT` faz a conversão: `SELF.hora := (UNSIGNED1)LEFT.txn_time[1..2];`.

## GABARITO
```ecl thor
Layout_Entrada := RECORD
  UNSIGNED4  txn_id;
  UNSIGNED4  person_id;
  UNSIGNED4  txn_date;
  STRING4    txn_time;
  DECIMAL9_2 amount;
  STRING16   merchant;
  STRING12   category;
  STRING2    state;
END;

Layout_Base := RECORD
  Layout_Entrada;
  UNSIGNED1 hora;
  BOOLEAN   madrugada;
END;

Cru := DATASET('~ecl30::raw::transacoes', Layout_Entrada, CSV(HEADING(1)));

Convertido := PROJECT(Cru,
                      TRANSFORM(Layout_Base,
                                SELF.hora      := (UNSIGNED1)LEFT.txn_time[1..2];
                                SELF.madrugada := SELF.hora < 6;
                                SELF := LEFT));

OUTPUT(Convertido, , '~aluno::base::transacoes', OVERWRITE);

Base := DATASET('~aluno::base::transacoes', Layout_Base, THOR);

OUTPUT(COUNT(Base));
OUTPUT(SUM(Base, amount));
OUTPUT(SORT(TABLE(Base(madrugada), {category, UNSIGNED4 qtd := COUNT(GROUP)}, category, FEW), -qtd));
```
Um relatório de controle (quantas linhas entraram, quanto somam) parece burocracia até o dia em que a fonte manda o arquivo pela metade e ninguém percebe por uma semana. Em produção, esses números são comparados com os do dia anterior, e uma variação grande **para o pipeline**. Como o compilador sabe que precisa gravar antes de ler? Ele vê que as ações de leitura dependem do arquivo que a primeira ação grava e ordena sozinho. No dia 14 você vai aprender a controlar essa ordem explicitamente.

# QUIZ

? O que é a landing zone?
- O conjunto de nós do Thor
+ Uma pasta de chegada onde arquivos externos ficam antes de entrar no cluster
- O banco de metadados do cluster
- O nome do arquivo depois do spray
! É a "calçada": o arquivo chega ali inteiro e ainda não está distribuído.

? O que o spray faz?
- Apaga arquivos antigos
- Compila o código ECL
+ Copia um arquivo da landing zone para o cluster, dividindo-o em partes pelos nós
- Junta as partes de um arquivo em um só
! Spray distribui; despray junta de volta.

? Qual a relação entre arquivo lógico e arquivos físicos?
- São sinônimos
+ O arquivo lógico é um nome no Dali que aponta para várias partes físicas nos nós
- O físico é o CSV e o lógico é o XML
- O lógico só existe no Roxie
! Você usa o nome lógico; o cluster localiza as partes.

? Qual declaração lê corretamente um CSV com linha de cabeçalho?
- `DATASET('~x::arq', Layout, THOR)`
- `DATASET('~x::arq', Layout, CSV)`
+ `DATASET('~x::arq', Layout, CSV(HEADING(1)))`
- `READ('~x::arq', Layout)`
! HEADING(1) pula a primeira linha. Sem isso o cabeçalho vira uma linha de dados.

? Como gravar um recordset em arquivo nativo do Thor, podendo rodar várias vezes?
- `OUTPUT(ds, '~aluno::x')`
+ `OUTPUT(ds, , '~aluno::x', OVERWRITE)`
- `WRITE(ds, '~aluno::x')`
- `OUTPUT(ds, OVERWRITE)`
! O nome do arquivo é o terceiro parâmetro; OVERWRITE permite regravar.

? Você declarou o layout de um CSV com as colunas em ordem errada. O que acontece?
- Erro de compilação
- O ECL corrige pela linha de cabeçalho
+ Compila e roda, mas os dados saem nos campos errados
- O cluster rejeita o arquivo
! CSV é lido por posição. Sempre confira uma amostra.

? Por que gravar um arquivo base em formato nativo em vez de reler o CSV em cada job?
- Porque CSV não pode ser lido duas vezes
+ Porque o formato nativo é mais rápido de ler e os tipos já estão convertidos
- Porque o CSV é apagado após o spray
- Porque o Roxie não aceita CSV
! Converte uma vez, lê rápido para sempre.

# FLASHCARDS

Q: Landing zone, spray, despray: uma frase para cada.
A: Pasta de chegada; cópia para o cluster dividindo em partes; junção das partes de volta para a landing zone.
Q: Como ler um CSV com cabeçalho?
A: `DATASET('~nome', Layout, CSV(HEADING(1)))`
Q: Como gravar um arquivo nativo?
A: `OUTPUT(ds, , '~nome', OVERWRITE);` (duas vírgulas)
Q: Como ler um arquivo nativo?
A: `DATASET('~nome', Layout, THOR)` — layout idêntico ao da gravação.
Q: O que significa o `~` no nome lógico?
A: Nome absoluto: o cluster não acrescenta o escopo padrão na frente.
Q: Função para fazer spray de CSV por código.
A: `STD.File.SprayDelimited(sourcePlane, sourcePath, destinationGroup, destinationLogicalName, allowOverwrite)`
Q: Por que somar em UNSIGNED8?
A: Somas em tabelas grandes estouram 4 bytes (~4,29 bilhões).
