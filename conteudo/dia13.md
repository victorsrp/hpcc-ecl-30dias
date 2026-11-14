---
dia: 13
modulo: 3
titulo: Limpeza e padronização de dados
horas: 3.5
---

# MISSAO

> [goggins] Hoje é o dia do trabalho sujo. Literalmente. Ninguém posta no LinkedIn "passei o dia tirando espaço em branco de sobrenome". Mas escuta: 80% do valor de um birô de dados está em **dado limpo**. O algoritmo mais genial do mundo, alimentado com lixo, cospe lixo. Quem faz bem o trabalho que ninguém quer fazer vira a pessoa que ninguém consegue substituir.

**Hoje você vai:**

- Perfilar um arquivo antes de confiar nele.
- Padronizar textos com `STD.Str`.
- Validar e extrair com expressões regulares (`REGEXFIND`, `REGEXREPLACE`).
- Resolver apelidos com tabela de referência.
- Marcar problemas em vez de apagar registros.

# PILULA: Antes de limpar, olhe: perfil de dados

> [crianca] Antes de arrumar o quarto você olha em volta: "tem roupa no chão, brinquedo embaixo da cama, e aquele canto está ok". Você não começa a arrumar de olho fechado. Perfilar é **olhar o quarto** antes de arrumar.

> [tecnico] Perfil de dados (*data profiling*) responde, para cada campo: quantos % estão preenchidos (*fill rate*), quantos valores distintos existem (*cardinalidade*), quais os valores mais comuns, tamanhos mínimo e máximo e **padrões de formato**. A biblioteca padrão traz isso pronto em `STD.DataPatterns.Profile(dataset)`. Nos padrões, `A` é letra maiúscula, `a` minúscula e `9` é dígito: um CEP americano bom tem padrão `99999`.

```ecl thor
IMPORT Treino, STD;

Amostra := CHOOSEN(Treino.Arquivos.Pessoas, 5000);
Perfil  := STD.DataPatterns.Profile(Amostra, features := 'fill_rate,cardinality,lengths,patterns,modes');

OUTPUT(Perfil, ALL);
```

Leia o resultado campo por campo e responda para você mesmo: qual é o `fill_rate` de `ssn`? Quantos padrões diferentes aparecem em `first_name`? E em `city`? Cada padrão inesperado é um problema que você acabou de descobrir **antes** de ele estragar um JOIN.

> [real] Toda fonte nova que entra na LexisNexis passa por perfil antes de qualquer outra coisa. E o perfil é refeito a cada entrega: se o `fill_rate` do SSN cai de 97% para 60% de um mês para o outro, a fonte quebrou alguma coisa, e é melhor descobrir no perfil do que num cliente reclamando.

# PILULA: Padronizar texto

> [tecnico] Para duas grafias da mesma coisa casarem num JOIN, elas precisam virar **exatamente** o mesmo texto. A convenção em arquivos base é: **tudo em maiúsculas, sem espaços sobrando, sem pontuação desnecessária**. Coloque cada regra em uma função com nome; a mesma função é usada em toda fonte.

```ecl
IMPORT STD;

// Funções de limpeza reutilizáveis
LimpaTexto(STRING s) := STD.Str.ToUpperCase(STD.Str.CleanSpaces(s));
SoDigitos(STRING s)  := STD.Str.Filter(s, '0123456789');
SoLetras(STRING s)   := STD.Str.Filter(STD.Str.ToUpperCase(s), 'ABCDEFGHIJKLMNOPQRSTUVWXYZ ');

OUTPUT(LimpaTexto('  mary   ann '));              // MARY ANN
OUTPUT(SoDigitos('(305) 555-0142'));              // 3055550142
OUTPUT(LimpaTexto(SoLetras('O\'Brien-Smith, Jr.')));  // OBRIENSMITH JR
OUTPUT(STD.Str.FindReplace(LimpaTexto('123 Main Street'), ' STREET', ' ST'));
```

> [cuidado] Limpeza **destrói informação**. `O'Brien` virar `OBRIEN` ajuda a casar registros, mas você perdeu o apóstrofo para sempre. Por isso o padrão profissional é **guardar os dois**: o campo original intocado (`last_name`) e o campo limpo ao lado (`lname_clean`). O original vai para a tela do cliente; o limpo vai para os JOINs.

# PILULA: Expressões regulares

> [crianca] Um molde de biscoito: você aperta o molde na massa e só o que tem **aquele formato** sai. Uma expressão regular é um molde para texto: "cinco números seguidos", "letras, depois arroba, depois letras, ponto, letras".

> [tecnico] `REGEXFIND(padrão, texto)` devolve `TRUE` se o texto casa com o padrão. `REGEXFIND(padrão, texto, n)` devolve o texto capturado pelo n-ésimo par de parênteses (0 = o trecho inteiro). `REGEXREPLACE(padrão, texto, substituto)` troca o que casar. A opção `NOCASE` ignora maiúsculas/minúsculas.

| Símbolo | Significa |
|---|---|
| `^` e `$` | Começo e fim do texto |
| `[0-9]` `[A-Z]` `[a-z]` | Um dígito / uma maiúscula / uma minúscula |
| `[^0-9]` | Qualquer coisa que **não** seja dígito |
| `.` | Qualquer caractere |
| `+` `*` `?` | Um ou mais / zero ou mais / zero ou um |
| `{5}` `{2,4}` | Exatamente 5 / de 2 a 4 |
| `( )` | Grupo de captura |
| `a|b` | a ou b |

```ecl
// Validar
OUTPUT(REGEXFIND('^[0-9]{5}$', '30301'));                 // CEP americano: true
OUTPUT(REGEXFIND('^[0-9]{5}$', '3030A'));                 // false
OUTPUT(REGEXFIND('^[a-z0-9._-]+@[a-z0-9-]+[.][a-z.]{2,}$', 'Ana.Smith@Example.com', NOCASE));

// Extrair com grupos de captura
Rua := '1771 Park Ave';
OUTPUT(REGEXFIND('^([0-9]+) (.+)$', Rua, 1));             // 1771
OUTPUT(REGEXFIND('^([0-9]+) (.+)$', Rua, 2));             // Park Ave

// Substituir
OUTPUT(REGEXREPLACE('[^0-9]', '(305) 555-0142', ''));     // 3055550142
OUTPUT(REGEXREPLACE(' +', 'muitos    espacos   aqui', ' '));
```

> [real] Regex é poderosa e **cara**: cada chamada custa muito mais que um `STD.Str.Filter` ou uma comparação. Em 10 bilhões de linhas isso vira hora de cluster. Regra de bolso: se dá para resolver com `STD.Str`, resolva com `STD.Str`; guarde a regex para o que só ela faz.

# PILULA: Apelidos e tabelas de referência

> [tecnico] Nenhuma função transforma `BOB` em `ROBERT`: isso é **conhecimento**, e conhecimento mora em tabela. O padrão é um JOIN `LEFT OUTER, LOOKUP` com a tabela de referência: se achou, usa o nome formal; se não achou, mantém o que veio. O curso traz uma pronta em `Treino.Apelidos` (campos `apelido`, `nome`).

```ecl
IMPORT Treino, STD;

Nomes := DATASET([{1, 'Bob'}, {2, 'ROBERT'}, {3, 'liz'}, {4, 'Zoraide'}], {UNSIGNED4 id, STRING20 first_name});

Layout_Saida := {UNSIGNED4 id, STRING20 first_name, STRING20 fname_clean};

Resolvido := JOIN(Nomes, Treino.Apelidos,
                  STD.Str.ToUpperCase(LEFT.first_name) = RIGHT.apelido,
                  TRANSFORM(Layout_Saida,
                            SELF.fname_clean := IF(RIGHT.nome <> '', RIGHT.nome, STD.Str.ToUpperCase(LEFT.first_name));
                            SELF := LEFT),
                  LEFT OUTER, LOOKUP);
OUTPUT(SORT(Resolvido, id));
```

> [real] A LexisNexis mantém tabelas de referência enormes: apelidos em vários idiomas, abreviações de endereço do correio americano (`STREET`→`ST`, `AVENUE`→`AVE`), nomes de empresas e suas variações. Padronizar endereço é uma disciplina inteira: existem produtos só para isso.

# PILULA: Marque, não apague

> [crianca] A professora não rasga a prova que tem erro: ela **circula o erro de vermelho** e devolve. Assim dá para ver o que estava errado, contar quantos erraram cada questão e ainda aproveitar o que estava certo.

> [tecnico] Registro com defeito raramente deve ser descartado na ingestão: um SSN inválido não invalida o nome e o endereço. O padrão é acrescentar **campos de qualidade** (`ssn_ok`, `dob_ok`, `email_ok`) e deixar cada etapa seguinte decidir o que usar. De quebra, a contagem desses campos é o seu relatório de qualidade.

```ecl
IMPORT STD;

Cadastro := DATASET([{1, '912345678', 19900315, 'ana@example.com'},
                     {2, '',          19850230, 'bruno(at)example.com'},
                     {3, '000000000', 20301201, 'carla@example.com'},
                     {4, '91234567',  19761104, ''}], {UNSIGNED4 id, STRING9 ssn, UNSIGNED4 dob, STRING40 email});

Layout_Q := RECORD
  RECORDOF(Cadastro);
  BOOLEAN ssn_ok;
  BOOLEAN dob_ok;
  BOOLEAN email_ok;
END;

Hoje := 20261112;

Marcado := PROJECT(Cadastro,
                   TRANSFORM(Layout_Q,
                             SELF.ssn_ok   := REGEXFIND('^[0-9]{9}$', LEFT.ssn) AND LEFT.ssn NOT IN ['000000000', '999999999'];
                             SELF.dob_ok   := STD.Date.IsValidDate(LEFT.dob) AND LEFT.dob BETWEEN 19000101 AND Hoje;
                             SELF.email_ok := REGEXFIND('^[a-z0-9._-]+@[a-z0-9-]+[.][a-z.]{2,}$', TRIM(LEFT.email), NOCASE);
                             SELF := LEFT));
OUTPUT(Marcado);

// Relatório de qualidade
OUTPUT(TABLE(Marcado, {UNSIGNED4 total    := COUNT(GROUP),
                       UNSIGNED4 ssn_bom  := COUNT(GROUP, ssn_ok),
                       UNSIGNED4 dob_boa  := COUNT(GROUP, dob_ok),
                       UNSIGNED4 email_bom := COUNT(GROUP, email_ok)}));
```

# EXERCICIO: Função de limpeza de nome

Escreva `NomeLimpo(STRING s)` que devolve o texto em maiúsculas, só com letras e espaços, sem espaços sobrando. Aplique nos quatro valores abaixo e mostre `original` e `STRING30 limpo`.

```ecl
IMPORT STD;
Nomes := DATASET([{'  mary-ann  '}, {'O\'CONNOR'}, {'de la   cruz'}, {'Smith Jr.'}], {STRING30 original});

```

## DICA
Primeiro maiúsculas, depois `STD.Str.Filter` com as letras e o espaço, depois `CleanSpaces`. O hífen some e as duas partes se juntam: tudo bem, é o comportamento pedido.

## GABARITO
```ecl
IMPORT STD;
Nomes := DATASET([{'  mary-ann  '}, {'O\'CONNOR'}, {'de la   cruz'}, {'Smith Jr.'}], {STRING30 original});

NomeLimpo(STRING s) := STD.Str.CleanSpaces(STD.Str.Filter(STD.Str.ToUpperCase(s), 'ABCDEFGHIJKLMNOPQRSTUVWXYZ '));

OUTPUT(PROJECT(Nomes, TRANSFORM({STRING30 original, STRING30 limpo}, SELF.limpo := NomeLimpo(LEFT.original); SELF := LEFT)));
```

# EXERCICIO: Validar telefones

Um telefone americano válido, depois de limpo, tem 10 dígitos, e nem o primeiro nem o quarto dígito podem ser 0 ou 1. Gere `original`, `STRING10 limpo` e `BOOLEAN valido`.

```ecl
IMPORT STD;
Fones := DATASET([{'(305) 555-0142'}, {'404.555.0199'}, {'555-0100'}, {'1234567890'}, {'212 155 0177'}], {STRING20 original});

```

## DICA
Limpe com `STD.Str.Filter`. O padrão: `'^[2-9][0-9]{2}[2-9][0-9]{6}$'`.

## GABARITO
```ecl
IMPORT STD;
Fones := DATASET([{'(305) 555-0142'}, {'404.555.0199'}, {'555-0100'}, {'1234567890'}, {'212 155 0177'}], {STRING20 original});

OUTPUT(PROJECT(Fones,
               TRANSFORM({STRING20 original, STRING10 limpo, BOOLEAN valido},
                         d := STD.Str.Filter(LEFT.original, '0123456789');
                         SELF.limpo  := d;
                         SELF.valido := REGEXFIND('^[2-9][0-9]{2}[2-9][0-9]{6}$', TRIM(d));
                         SELF := LEFT)));
```

# EXERCICIO: Quebrar o endereço

Separe `street` em `STRING6 numero` e `STRING30 logradouro` (maiúsculas), trocando o sufixo final `STREET` por `ST` e `AVENUE` por `AVE`.

```ecl
IMPORT STD;
Enderecos := DATASET([{'1771 Park Avenue'}, {'6893 Peachtree Street'}, {'12 Lake Rd'}], {STRING30 street});

```

## DICA
Capture com `'^([0-9]+) (.+)$'`. Para o sufixo, `REGEXREPLACE(' STREET$', texto, ' ST')`: o `$` garante que só troca no fim.

## GABARITO
```ecl
IMPORT STD;
Enderecos := DATASET([{'1771 Park Avenue'}, {'6893 Peachtree Street'}, {'12 Lake Rd'}], {STRING30 street});

Padrao := '^([0-9]+) (.+)$';

OUTPUT(PROJECT(Enderecos,
               TRANSFORM({STRING30 street, STRING6 numero, STRING30 logradouro},
                         bruto := STD.Str.ToUpperCase(TRIM(REGEXFIND(Padrao, TRIM(LEFT.street), 2)));
                         SELF.numero     := REGEXFIND(Padrao, TRIM(LEFT.street), 1);
                         SELF.logradouro := REGEXREPLACE(' AVENUE$', REGEXREPLACE(' STREET$', bruto, ' ST'), ' AVE');
                         SELF := LEFT)));
```

# REAL: Arquivo de pessoas limpo, com relatório de qualidade

Hora de limpar o cadastro de verdade. A partir de `Treino.Arquivos.Pessoas` (21.800 linhas), produza o arquivo `~aluno::base::pessoas_limpas` com **todos os campos originais** e mais:

| Campo novo | Regra |
|---|---|
| `STRING20 fname_clean` | `first_name` em maiúsculas sem espaços sobrando; se for um apelido de `Treino.Apelidos`, o nome formal |
| `STRING20 lname_clean` | `last_name` em maiúsculas sem espaços sobrando |
| `STRING20 city_clean` | `city` em maiúsculas sem espaços sobrando |
| `BOOLEAN ssn_ok` | 9 dígitos e diferente de `000000000` e `999999999` |
| `BOOLEAN dob_ok` | Data válida entre 19000101 e 20261112 |
| `BOOLEAN phone_ok` | Padrão `^[2-9][0-9]{2}[2-9][0-9]{6}$` |

Entregue, nesta ordem: (a) a quantidade de linhas do arquivo limpo (tem que ser 21.800); (b) o relatório de qualidade em uma linha: `total`, `ssn_bom`, `dob_boa`, `phone_bom`, `apelidos_resolvidos` (quantos registros tiveram `fname_clean` diferente do `first_name` em maiúsculas); (c) a quantidade de valores **distintos** de `first_name` (original) e de `fname_clean`, em uma linha: `distintos_antes`, `distintos_depois`.

```ecl thor
IMPORT Treino, STD;
P := Treino.Arquivos.Pessoas;

```

## DICA
Faça em dois passos: um `PROJECT` que cria os campos limpos e os de qualidade (com `fname_clean` ainda sem resolver apelido), e depois um JOIN `LEFT OUTER, LOOKUP` com `Treino.Apelidos` que troca `fname_clean` quando acha. Para contar distintos: `COUNT(TABLE(ds, {campo}, campo))`.

## GABARITO
```ecl thor
IMPORT Treino, STD;
P := Treino.Arquivos.Pessoas;

Limpa(STRING s) := STD.Str.ToUpperCase(STD.Str.CleanSpaces(s));

Layout_Limpo := RECORD
  RECORDOF(P);
  STRING20 fname_clean;
  STRING20 lname_clean;
  STRING20 city_clean;
  BOOLEAN  ssn_ok;
  BOOLEAN  dob_ok;
  BOOLEAN  phone_ok;
END;

Passo1 := PROJECT(P,
                  TRANSFORM(Layout_Limpo,
                            SELF.fname_clean := Limpa(LEFT.first_name);
                            SELF.lname_clean := Limpa(LEFT.last_name);
                            SELF.city_clean  := Limpa(LEFT.city);
                            SELF.ssn_ok      := REGEXFIND('^[0-9]{9}$', LEFT.ssn) AND LEFT.ssn NOT IN ['000000000', '999999999'];
                            SELF.dob_ok      := STD.Date.IsValidDate(LEFT.dob) AND LEFT.dob BETWEEN 19000101 AND 20261112;
                            SELF.phone_ok    := REGEXFIND('^[2-9][0-9]{2}[2-9][0-9]{6}$', LEFT.phone);
                            SELF := LEFT));

Limpo := JOIN(Passo1, Treino.Apelidos,
              LEFT.fname_clean = RIGHT.apelido,
              TRANSFORM(Layout_Limpo,
                        SELF.fname_clean := IF(RIGHT.nome <> '', RIGHT.nome, LEFT.fname_clean);
                        SELF := LEFT),
              LEFT OUTER, LOOKUP);

OUTPUT(Limpo, , '~aluno::base::pessoas_limpas', OVERWRITE);

OUTPUT(COUNT(Limpo));
OUTPUT(TABLE(Limpo, {UNSIGNED4 total               := COUNT(GROUP),
                     UNSIGNED4 ssn_bom             := COUNT(GROUP, ssn_ok),
                     UNSIGNED4 dob_boa             := COUNT(GROUP, dob_ok),
                     UNSIGNED4 phone_bom           := COUNT(GROUP, phone_ok),
                     UNSIGNED4 apelidos_resolvidos := COUNT(GROUP, fname_clean <> STD.Str.ToUpperCase(first_name))}));
OUTPUT(DATASET([{COUNT(TABLE(Limpo, {first_name}, first_name)), COUNT(TABLE(Limpo, {fname_clean}, fname_clean))}],
               {UNSIGNED4 distintos_antes, UNSIGNED4 distintos_depois}));
```
O item (c) é a prova de que a limpeza funcionou: dezenas de grafias (`Robert`, `ROBERT`, `Bob`) colapsaram em 30 nomes. Cada grafia que você unifica é um JOIN futuro que deixa de perder registros. O JOIN de apelidos usa `LOOKUP` (tabela de 25 linhas contra 21.800) e `LEFT OUTER` (quem não é apelido continua no arquivo). Depois de amanhã esse arquivo limpo é a entrada do vínculo de registros.

# QUIZ

? O que é o `fill_rate` de um campo em um perfil de dados?
- O tamanho médio do campo
+ O percentual de registros em que o campo está preenchido
- A quantidade de valores distintos
- O padrão mais comum
! Fill rate baixo ou que muda de repente é o primeiro sinal de problema numa fonte.

? Por que manter o campo original ao lado do campo limpo?
- Para ocupar mais espaço
+ Porque a limpeza destrói informação: o original serve para exibição e auditoria, o limpo para os JOINs
- Porque o ECL exige
- Para poder usar DEDUP
! Você nunca recupera o apóstrofo de O'Brien depois de removê-lo.

? O que `REGEXFIND('^([0-9]+) (.+)$', '1771 Park Ave', 2)` devolve?
- `TRUE`
- `1771`
+ `Park Ave`
- `1771 Park Ave`
! O terceiro parâmetro pede o texto capturado pelo segundo par de parênteses.

? Qual expressão remove tudo que não é dígito?
- `REGEXFIND('[0-9]', s)`
+ `REGEXREPLACE('[^0-9]', s, '')`
- `REGEXREPLACE('[0-9]', s, '')`
- `STD.Str.CleanSpaces(s)`
! `[^0-9]` casa com qualquer caractere que não seja dígito; o substituto vazio os remove. `STD.Str.Filter(s, '0123456789')` faz o mesmo e é mais barato.

? Como transformar `BOB` em `ROBERT`?
- Com `STD.Str.ToUpperCase`
- Com uma regex
+ Com um JOIN (LEFT OUTER, LOOKUP) contra uma tabela de apelidos
- Com `DEDUP`
! Apelido é conhecimento de referência, não transformação de texto.

? Um registro chegou com SSN inválido, mas nome e endereço bons. Qual a prática recomendada na ingestão?
- Descartar o registro
- Preencher o SSN com zeros
+ Manter o registro e marcar `ssn_ok = FALSE`
- Parar o pipeline
! Marcar preserva o que é aproveitável e gera o relatório de qualidade.

? Por que preferir `STD.Str.Filter` a uma regex quando as duas resolvem?
- Porque regex não funciona no Thor
+ Porque regex custa muito mais processamento por linha
- Porque Filter aceita NOCASE
- Não há diferença
! Em bilhões de linhas, o custo por chamada vira horas de cluster.

# FLASHCARDS

Q: O que um perfil de dados mostra?
A: Fill rate, cardinalidade, valores mais comuns, tamanhos e padrões de formato de cada campo.
Q: Função da biblioteca padrão para perfilar.
A: `STD.DataPatterns.Profile(dataset)`
Q: Convenção de texto em arquivo base.
A: Maiúsculas, sem espaços sobrando, mantendo o original ao lado do campo limpo.
Q: REGEXFIND com 2 e com 3 parâmetros.
A: 2: TRUE/FALSE se casa. 3: devolve o grupo de captura n (0 = trecho inteiro).
Q: Padrão de resolução de apelido.
A: `JOIN(ds, Apelidos, chave = RIGHT.apelido, TRANSFORM(... IF(RIGHT.nome <> '', RIGHT.nome, original)), LEFT OUTER, LOOKUP)`
Q: "Marque, não apague": o que significa?
A: Em vez de descartar registros com defeito, criar campos de qualidade (`ssn_ok`...) e contar.
Q: Como contar valores distintos de um campo?
A: `COUNT(TABLE(ds, {campo}, campo))`
