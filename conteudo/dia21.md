---
dia: 21
modulo: 5
titulo: MACRO, FUNCTIONMACRO e linguagem de template
horas: 3
---

# MISSAO

> [goggins] Módulo 5. Reta final e a parte mais técnica do curso. Daqui para frente é o material que faz as pessoas dizerem "isso é coisa de sênior, não preciso saber". Precisa. É exatamente o que você vai encontrar quando abrir o repositório de uma empresa de verdade, e quem não lê macro fica olhando para o código dos outros sem entender nada. Hoje você aprende a escrever **código que escreve código**.

**Hoje você vai:**

- Entender por que funções comuns não bastam.
- Escrever `FUNCTIONMACRO` para lógica genérica sobre qualquer tabela e campo.
- Ler e escrever `MACRO`.
- Usar `#EXPAND`, `#TEXT`, `#UNIQUENAME` e os comandos de template.

# PILULA: O limite das funções

> [crianca] Um carimbo de "APROVADO" sempre imprime a mesma palavra. Agora imagine um carimbo com um **buraco**: antes de carimbar você encaixa a palavra que quiser no buraco. Um carimbo só, mil palavras. Uma macro é um carimbo com buraco: um molde de código com espaços que você preenche na hora de usar.

> [tecnico] Uma função ECL recebe **valores** com tipo declarado. Ela não consegue receber "um nome de campo qualquer" nem "uma tabela de qualquer layout". Para escrever `ContarPor(tabela, campo)` que funcione com **qualquer** tabela e **qualquer** campo, você precisa de substituição de texto **antes** da compilação: é isso que macros fazem. O compilador troca os parâmetros pelo texto que você passou e só então compila o resultado.

Este é o problema. A mesma lógica, copiada três vezes:

```ecl
IMPORT Aula;
OUTPUT(SORT(TABLE(Aula.Clientes,   {estado,    UNSIGNED4 qtd := COUNT(GROUP)}, estado,    FEW), -qtd, estado));
OUTPUT(SORT(TABLE(Aula.Sinistros,  {tipo,      UNSIGNED4 qtd := COUNT(GROUP)}, tipo,      FEW), -qtd, tipo));
OUTPUT(SORT(TABLE(Aula.Transacoes, {categoria, UNSIGNED4 qtd := COUNT(GROUP)}, categoria, FEW), -qtd, categoria));
```

# PILULA: FUNCTIONMACRO

> [tecnico] `Nome(parâmetros) := FUNCTIONMACRO ... RETURN expressão; ENDMACRO;` define uma macro que se **usa como função**: devolve um valor ou recordset. Os parâmetros não têm tipo, porque são texto. Definições internas levam `LOCAL` para não vazarem nem colidirem com nomes de quem chama.

```ecl
IMPORT Aula;

Frequencia(ds, campo) := FUNCTIONMACRO
  LOCAL Contado := TABLE(ds, {campo, UNSIGNED4 qtd := COUNT(GROUP)}, campo, FEW);
  RETURN SORT(Contado, -qtd, campo);
ENDMACRO;

OUTPUT(Frequencia(Aula.Clientes,   estado),    NAMED('ClientesPorEstado'));
OUTPUT(Frequencia(Aula.Sinistros,  tipo),      NAMED('SinistrosPorTipo'));
OUTPUT(Frequencia(Aula.Transacoes, categoria), NAMED('TransacoesPorCategoria'));
```

Uma definição, qualquer tabela, qualquer campo. Quando o compilador vê `Frequencia(Aula.Sinistros, tipo)`, ele literalmente escreve o TABLE com `Aula.Sinistros` no lugar de `ds` e `tipo` no lugar de `campo`.

> [cuidado] O erro dentro de uma macro aparece **no ponto em que ela foi chamada**, com uma mensagem sobre código que você não vê. Se passar um campo que não existe, o compilador reclama do TABLE gerado. Para depurar: teste primeiro a lógica como código normal, com nomes fixos, e só depois transforme em macro.

# PILULA: MACRO

> [tecnico] `Nome(parâmetros) := MACRO ... ENDMACRO;` gera **várias linhas de código** no ponto da chamada, em vez de devolver um valor. Para "devolver" algo, um dos parâmetros é o **nome de saída**: a macro define esse nome e quem chamou passa a usá-lo. Você vai encontrar muito disso em código mais antigo; hoje prefere-se FUNCTIONMACRO sempre que der.

```ecl
IMPORT Aula;

// Gera duas definições no lugar da chamada: uma estatística e uma lista dos maiores
Estatistica(ds, campo, saida_resumo, saida_top) := MACRO
  saida_resumo := TABLE(ds, {UNSIGNED4 qtd := COUNT(GROUP),
                             minimo := MIN(GROUP, campo),
                             maximo := MAX(GROUP, campo),
                             REAL media := AVE(GROUP, campo)});
  saida_top := TOPN(ds, 3, -campo);
ENDMACRO;

Estatistica(Aula.Sinistros, valor, ResumoSin, TopSin);
Estatistica(Aula.Clientes,  renda, ResumoCli, TopCli);

OUTPUT(ResumoSin, NAMED('ResumoSinistros'));
OUTPUT(TopSin,    NAMED('MaioresSinistros'));
OUTPUT(ResumoCli, NAMED('ResumoClientes'));
```

Se a macro precisa de nomes **internos**, eles podem colidir quando a macro é chamada duas vezes. `#UNIQUENAME(x)` cria um nome único a cada chamada; dentro da macro ele é usado como `%x%`.

```ecl
IMPORT Aula;

Faixas(ds, campo, corte, saida) := MACRO
  #UNIQUENAME(marcado)
  %marcado% := TABLE(ds, {STRING5 faixa := IF(campo >= corte, 'ALTO', 'BAIXO'), campo});
  saida := TABLE(%marcado%, {faixa, UNSIGNED4 qtd := COUNT(GROUP)}, faixa, FEW);
ENDMACRO;

Faixas(Aula.Sinistros, valor, 20000, FaixaSin);
Faixas(Aula.Clientes,  score, 700,   FaixaCli);

OUTPUT(FaixaSin, NAMED('Sinistros'));
OUTPUT(FaixaCli, NAMED('Clientes'));
```

# PILULA: #TEXT e #EXPAND: entre texto e código

| Comando | Faz | Exemplo |
|---|---|---|
| `#TEXT(argumento)` | Transforma o **código** passado em **texto** | `#TEXT(Aula.Sinistros)` → `'Aula.Sinistros'` |
| `#EXPAND(texto)` | Transforma **texto** em **código** | `#EXPAND('valor')` → o campo `valor` |

```ecl
IMPORT Aula;

// O nome do campo chega como TEXTO (por exemplo, de uma configuração)
CampoDeSoma := 'valor';
OUTPUT(SUM(Aula.Sinistros, #EXPAND(CampoDeSoma)), NAMED('SomaDinamica'));

// Uma macro que rotula o resultado com o nome do que recebeu
Contar(ds) := FUNCTIONMACRO
  RETURN DATASET([{#TEXT(ds), COUNT(ds)}], {STRING30 tabela, UNSIGNED4 linhas});
ENDMACRO;

OUTPUT(Contar(Aula.Clientes) + Contar(Aula.Sinistros) + Contar(Aula.Transacoes), NAMED('Contagens'));
```

> [cuidado] O texto de `#EXPAND` precisa ser conhecido **na compilação**: uma constante ou algo que o compilador consiga calcular antes de rodar. Não dá para expandir um valor que só existe em tempo de execução, como o conteúdo de um campo.

# PILULA: Linguagem de template: laços na compilação

> [tecnico] A linguagem de template roda **dentro do compilador**. Ela tem variáveis (`#DECLARE`, `#SET`, `#APPEND`), decisão (`#IF ... #ELSE ... #END`) e laço (`#FOR`, `#LOOP`). O comando `#EXPORTXML(nome, RECORD)` entrega a descrição de um layout (nome e tipo de cada campo), e `#FOR` percorre os campos. Com isso uma macro **gera código para cada campo** de qualquer tabela. Valores de template se leem com `%nome%` (como código) ou `%'nome'%` (como texto).

A macro abaixo calcula o preenchimento de **todos os campos** de qualquer tabela:

```ecl
IMPORT Aula;

Preenchimento(ds) := FUNCTIONMACRO
  #EXPORTXML(campos, RECORDOF(ds))
  #DECLARE(codigo)
  #SET(codigo, 'DATASET([], {STRING30 campo, UNSIGNED4 preenchidos})')
  #FOR(campos)
    #FOR(Field)
      #APPEND(codigo, ' + DATASET([{\'' + %'@name'% + '\', COUNT(' + #TEXT(ds) + '((STRING)' + %'@name'% + ' NOT IN [\'\', \'0\']))}], {STRING30 campo, UNSIGNED4 preenchidos})')
    #END
  #END
  RETURN %codigo%;
ENDMACRO;

OUTPUT(Preenchimento(Aula.Sinistros), NAMED('Sinistros'));
OUTPUT(Preenchimento(Aula.Clientes),  NAMED('Clientes'));
```

Leia devagar: o `#FOR` monta um **texto** de código, um pedacinho por campo, e o `RETURN %codigo%` entrega esse texto ao compilador como se você o tivesse digitado. Para a tabela de sinistros, o código gerado tem sete `COUNT`, um por campo, que você nunca escreveu.

> [real] O `STD.DataPatterns.Profile` que você usou no dia 13 é uma macro exatamente desse tipo, com centenas de linhas de template. As bibliotecas de vínculo de registros, de qualidade de dados e de machine learning do HPCC são construídas assim: você entrega uma tabela e nomes de campos, e a macro gera o programa. Você raramente vai escrever template pesado, mas vai **ler** toda semana.

# EXERCICIO: Top N genérico

Escreva a FUNCTIONMACRO `Maiores(ds, campo, n)` que devolve os `n` registros com maior valor de `campo`. Use-a para mostrar, nesta ordem: os 3 maiores sinistros por `valor` e os 2 clientes de maior `renda`.

```ecl
IMPORT Aula;

```

## GABARITO
```ecl
IMPORT Aula;

Maiores(ds, campo, n) := FUNCTIONMACRO
  RETURN TOPN(ds, n, -campo);
ENDMACRO;

OUTPUT(Maiores(Aula.Sinistros, valor, 3));
OUTPUT(Maiores(Aula.Clientes, renda, 2));
```

# EXERCICIO: Resumo numérico genérico

Escreva a FUNCTIONMACRO `ResumoNumerico(ds, campo)` que devolve **uma linha** com `STRING30 nome_campo` (o nome do campo, via `#TEXT`), `qtd`, `minimo`, `maximo` e `REAL media`. Junte em um só resultado os resumos de `valor` em `Aula.Sinistros` e de `score` em `Aula.Clientes`.

```ecl
IMPORT Aula;

```

## DICA
Para os dois resumos poderem ser somados com `+`, os layouts precisam ser iguais: dê tipo explícito a `minimo` e `maximo` (`REAL`).

## GABARITO
```ecl
IMPORT Aula;

ResumoNumerico(ds, campo) := FUNCTIONMACRO
  RETURN TABLE(ds, {STRING30 nome_campo := #TEXT(campo),
                    UNSIGNED4 qtd    := COUNT(GROUP),
                    REAL      minimo := MIN(GROUP, campo),
                    REAL      maximo := MAX(GROUP, campo),
                    REAL      media  := AVE(GROUP, campo)});
ENDMACRO;

OUTPUT(ResumoNumerico(Aula.Sinistros, valor) + ResumoNumerico(Aula.Clientes, score));
```

# REAL: Macro de controle de duplicidade para qualquer arquivo

Todo build precisa verificar se a chave primária de um arquivo é realmente única. Em vez de cada desenvolvedor reescrever isso, o time quer **uma** macro no repositório.

Escreva a FUNCTIONMACRO `ControleDeChave(ds, chave)` que devolve uma linha com:

- `STRING40 arquivo`: o nome do dataset recebido (via `#TEXT`);
- `STRING20 campo`: o nome da chave;
- `UNSIGNED4 linhas`: total de registros;
- `UNSIGNED4 distintos`: quantidade de valores distintos da chave;
- `UNSIGNED4 duplicados`: `linhas - distintos`;
- `BOOLEAN unica`: verdadeiro quando não há duplicados.

Aplique no Thor a quatro casos e junte tudo em um resultado só, nesta ordem: `Treino.Arquivos.Pessoas` por `id`; `Treino.Arquivos.Pessoas` por `ssn`; `Treino.Arquivos.Veiculos` por `vin`; `Treino.Arquivos.Sinistros` por `claim_id`.

```ecl thor
IMPORT Treino;
A := Treino.Arquivos;

```

## DICA
Dentro da macro: `LOCAL total := COUNT(ds);` e `LOCAL dist := COUNT(TABLE(ds, {chave}, chave));`. O retorno é um `DATASET([{...}], {layout})` de uma linha.

## GABARITO
```ecl thor
IMPORT Treino;
A := Treino.Arquivos;

ControleDeChave(ds, chave) := FUNCTIONMACRO
  LOCAL total := COUNT(ds);
  LOCAL dist  := COUNT(TABLE(ds, {chave}, chave));
  RETURN DATASET([{#TEXT(ds), #TEXT(chave), total, dist, total - dist, total = dist}],
                 {STRING40 arquivo, STRING20 campo, UNSIGNED4 linhas, UNSIGNED4 distintos, UNSIGNED4 duplicados, BOOLEAN unica});
ENDMACRO;

OUTPUT(ControleDeChave(A.Pessoas, id)
     + ControleDeChave(A.Pessoas, ssn)
     + ControleDeChave(A.Veiculos, vin)
     + ControleDeChave(A.Sinistros, claim_id));
```
`id`, `vin` e `claim_id` são únicos; `ssn` não, pelas duplicatas que você já conhece. Num pipeline real, o passo seguinte seria `ASSERT(resultado[1].unica, 'chave duplicada', FAIL)`. Uma macro de 6 linhas que o time inteiro reusa em todo arquivo: é esse o tipo de contribuição que faz alguém ser lembrado num repositório.

# QUIZ

? Por que uma função comum não serve para "contar por um campo qualquer de uma tabela qualquer"?
- Porque funções não aceitam datasets
+ Porque parâmetros de função são valores tipados; nome de campo e layout variável exigem substituição de texto antes da compilação
- Porque funções não podem usar TABLE
- Porque funções são lentas
! Macros trocam os parâmetros pelo texto passado e só depois o código é compilado.

? Qual a diferença entre FUNCTIONMACRO e MACRO?
- Nenhuma
+ FUNCTIONMACRO devolve um valor/recordset e é usada como função; MACRO gera linhas de código e "devolve" por um nome de saída
- MACRO é mais rápida
- FUNCTIONMACRO só roda no Roxie
! FUNCTIONMACRO é a forma preferida hoje.

? Para que serve `LOCAL` dentro de uma FUNCTIONMACRO?
- Para rodar a operação em cada nó
+ Para que a definição interna não vaze nem colida com nomes de quem chama a macro
- Para tornar a macro mais rápida
- Para exportar a definição
! Dentro de macro, LOCAL marca definições internas. (Não confundir com a opção LOCAL de operações do Thor.)

? O que `#TEXT(Aula.Sinistros)` produz?
- O conteúdo da tabela
- A quantidade de linhas
+ O texto `'Aula.Sinistros'`
- Um erro
! Converte o código passado como argumento em texto.

? O que `#EXPAND('valor')` produz?
- O texto 'valor'
+ O código `valor` (por exemplo, a referência ao campo com esse nome)
- O número zero
- Um novo dataset
! Converte texto em código, em tempo de compilação.

? Para que serve `#UNIQUENAME(x)`?
- Para remover duplicados
+ Para criar um nome interno que não colide quando a macro é chamada mais de uma vez
- Para nomear um resultado
- Para criar um arquivo único
! O nome é usado dentro da macro como `%x%`.

? Quando o código de template (`#FOR`, `#IF`, `#SET`) é executado?
- Em cada nó do Thor
- No Roxie, a cada requisição
+ Dentro do compilador, antes de o programa existir
- No ECL Watch
! Template gera o código; o que roda no cluster é o resultado gerado.

# FLASHCARDS

Q: Estrutura de uma FUNCTIONMACRO.
A: `Nome(a, b) := FUNCTIONMACRO LOCAL x := ...; RETURN ...; ENDMACRO;`
Q: Como uma MACRO "devolve" resultado?
A: Por um parâmetro de saída: a macro define esse nome e quem chamou o usa depois.
Q: #TEXT × #EXPAND.
A: #TEXT: código → texto. #EXPAND: texto → código.
Q: Como percorrer os campos de um layout em template?
A: `#EXPORTXML(c, RECORDOF(ds))` + `#FOR(c) #FOR(Field) ... %'@name'% ... #END #END`
Q: Como depurar uma macro?
A: Escrever e testar a lógica como código normal com nomes fixos; só depois parametrizar.
Q: Exemplo de macro da biblioteca padrão que você já usou.
A: `STD.DataPatterns.Profile`.
