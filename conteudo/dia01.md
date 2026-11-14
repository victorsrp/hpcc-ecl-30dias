---
dia: 1
modulo: 1
titulo: HPCC, Thor, Roxie e seu primeiro ECL
horas: 2.5
---

# MISSAO

> [goggins] Dia 1. Você não sabe nada de ECL e isso não importa. O que importa é que daqui a 30 dias você vai olhar para hoje e rir de como isso era fácil. Mas só se você fizer TODOS os exercícios. Sem pular. Sem "esse eu já entendi".

**Hoje você vai:**

- Entender o que é o HPCC Systems e por que a LexisNexis o criou.
- Saber a diferença entre **Thor**, **Roxie** e **hThor** a ponto de explicar para uma criança.
- Entender a ideia mais importante do ECL: **definição não é ação**.
- Escrever e rodar seus primeiros códigos: valores, tipos, contas, textos e decisões.

# PILULA: O que é o HPCC Systems

> [crianca] Imagine uma biblioteca com **bilhões** de fichas de papel. Uma pessoa sozinha levaria anos para arrumar tudo. Então você chama 400 amigos: cada um pega um montinho de fichas e arruma o seu **ao mesmo tempo**. Em minutos está tudo pronto. O HPCC é o "chefe" que divide as fichas entre os amigos e junta o resultado.

> [tecnico] **HPCC** (High Performance Computing Cluster) é uma plataforma open source de processamento massivo de dados em paralelo. Um *cluster* é um grupo de máquinas (nós) que trabalham juntas. O dado é fatiado entre os nós e cada nó processa sua fatia ao mesmo tempo. A linguagem para programar tudo isso é o **ECL** (Enterprise Control Language).

> [real] A plataforma nasceu no ano 2000 dentro da empresa que hoje é a **LexisNexis Risk Solutions**. Eles precisavam cruzar bilhões de registros públicos dos EUA (endereços, veículos, imóveis, processos, falências) para responder perguntas como "essa pessoa é quem diz ser?" em menos de um segundo. Nenhum banco de dados da época aguentava, então construíram o próprio. Em 2011 abriram o código. Bancos, seguradoras, governos e birôs de crédito usam produtos que rodam em cima disso.

As peças que você vai ouvir todo dia:

| Peça | O que faz | Analogia |
|---|---|---|
| **Thor** | Motor de processamento em lote: limpa, cruza e transforma dados gigantes | A cozinha do restaurante |
| **Roxie** | Motor de consultas: responde milhares de perguntas por segundo, cada uma em milissegundos | O balcão de atendimento |
| **hThor** | Um "Thor de um nó só", para tarefas pequenas e testes | O micro-ondas |
| **ECL Watch** | Site de administração: você vê jobs, arquivos e grafos | O painel de controle |
| **Dali** | Guarda os metadados: que arquivos existem, que jobs rodaram | O livro de registros |
| **ESP** | Servidor web que expõe tudo por HTTP (o ECL Watch roda nele) | A recepção |

# PILULA: Thor cozinha, Roxie serve

> [crianca] Num restaurante, a **cozinha** passa a manhã inteira picando, cozinhando e montando os pratos. Isso demora, e tudo bem. Na hora do almoço, o **garçom** só pega o prato pronto e entrega em segundos. Se o garçom tivesse que cozinhar cada pedido do zero, a fila daria a volta no quarteirão. **Thor é a cozinha. Roxie é o garçom.**

> [tecnico] **Thor** roda *jobs em lote*: lê arquivos enormes, faz JOIN, SORT, limpeza, e grava arquivos novos e **índices**. Um job pode levar minutos ou horas. **Roxie** carrega esses índices e atende *consultas online*: recebe parâmetros (um nome, um CPF), busca nos índices e devolve em milissegundos, com milhares de usuários ao mesmo tempo. O fluxo clássico é: dado cru → **Thor** prepara → índices → **Roxie** serve.

Cada vez que você roda um código, o cluster cria um **workunit** (WU): a ficha daquele job, com um número tipo `W20261112-093015`. Nele ficam o código, o resultado, os erros e o grafo de execução. Depois de rodar qualquer exemplo abaixo, clique no número do workunit que aparece na barra do editor para vê-lo no ECL Watch.

Rode seu primeiro código. Antes de clicar, diga em voz alta o que vai aparecer.

```ecl
OUTPUT('Dia 1. Eu apareci.');
```

Agora troque o alvo de `hthor` para `thor` na caixinha ao lado do botão e rode de novo. O resultado é o mesmo; o que mudou foi **qual motor** executou.

# PILULA: Definição não é ação

Esta é a ideia que mais confunde quem vem de Python, Java ou SQL. Leia duas vezes.

> [crianca] Escrever uma receita de bolo num caderno **não faz** um bolo aparecer. A receita só diz *o que é* um bolo. O bolo só existe quando alguém fala "faz esse bolo agora!". Em ECL, o `:=` escreve a receita. O `OUTPUT` manda fazer.

> [tecnico] ECL é uma linguagem **declarativa**. `nome := expressão;` é uma **definição**: dá um nome a uma expressão, nada é executado. Uma **ação** (como `OUTPUT`) é o que dispara trabalho. O compilador pega só as definições que a ação realmente usa, monta um grafo e otimiza a ordem sozinho. Consequências práticas: (1) uma definição que ninguém usa nunca executa; (2) a ordem das linhas não é a ordem de execução; (3) um nome **não pode ser redefinido**: não existe `x := x + 1`.

```ecl
Preco      := 100;
Desconto   := 20;
PrecoFinal := Preco - Desconto;   // só uma receita: nada rodou ainda
NuncaUsado := Preco * 1000000;    // ninguém pede isso, então nunca é calculado

OUTPUT(PrecoFinal);               // agora sim: AÇÃO
```

Tente redefinir um nome e leia o erro com atenção. Ler erro é habilidade de sênior:

```ecl erro
Total := 10;
Total := Total + 1;
OUTPUT(Total);
```

> [cuidado] O sinal de definir é `:=` (dois pontos e igual). O `=` sozinho é **comparação**. Toda definição e toda ação terminam com `;`. ECL não liga para maiúsculas e minúsculas: `OUTPUT`, `Output` e `output` são a mesma coisa. Por convenção, palavras da linguagem vão em MAIÚSCULAS e os seus nomes em `EstiloAssim`.

# PILULA: Tipos de valor

> [crianca] Cada gaveta do armário guarda um tipo de coisa: uma para meias, outra para camisetas. Se você tentar guardar uma melancia na gaveta de meias, não cabe. Em ECL cada valor tem um **tipo**, que diz que coisa cabe ali e quanto espaço ocupa.

| Tipo | Guarda | Exemplo |
|---|---|---|
| `INTEGER` | Número inteiro com sinal (`INTEGER1`, `2`, `4`, `8` = quantos bytes) | `INTEGER4 Idade := 34;` |
| `UNSIGNED` | Inteiro que nunca é negativo (ids, contagens) | `UNSIGNED8 Id := 9001;` |
| `REAL` | Número com vírgula, aproximado | `REAL Taxa := 0.175;` |
| `DECIMAL8_2` | Número exato: 8 dígitos, 2 depois da vírgula (dinheiro!) | `DECIMAL8_2 Valor := 1999.90;` |
| `STRING` | Texto. `STRING20` tem tamanho fixo de 20; `STRING` sozinho é variável | `STRING10 Nome := 'Ana';` |
| `BOOLEAN` | Verdadeiro ou falso | `BOOLEAN Ativo := TRUE;` |

O tipo vem **antes** do nome. Se você não escrever, o ECL deduz.

```ecl
STRING20   Nome    := 'Maria Souza';
UNSIGNED1  Idade   := 34;
DECIMAL8_2 Salario := 5230.75;
BOOLEAN    Maior   := Idade >= 18;

OUTPUT(Nome);
OUTPUT(Idade);
OUTPUT(Salario);
OUTPUT(Maior);
```

> [real] Em tabelas com bilhões de linhas, tipo é dinheiro. Guardar uma idade em `INTEGER8` (8 bytes) em vez de `UNSIGNED1` (1 byte) em 10 bilhões de linhas desperdiça 70 GB. Em produção, todo campo tem tamanho pensado.

# PILULA: Contas, textos e comparações

```ecl
// Contas
OUTPUT(7 + 3);        // 10
OUTPUT(7 / 2);        // 3.5   divisão normal
OUTPUT(7 DIV 2);      // 3     divisão inteira
OUTPUT(7 % 2);        // 1     resto

// Textos: + junta, [a..b] recorta (começa em 1, não em 0!)
Nome := 'LexisNexis';
OUTPUT(Nome + ' Risk');     // LexisNexis Risk
OUTPUT(Nome[1..5]);         // Lexis
OUTPUT(Nome[6..]);          // Nexis
OUTPUT(LENGTH(Nome));       // 10

// Comparações devolvem BOOLEAN
OUTPUT(5 = 5);                    // true
OUTPUT(5 <> 3);                   // true  (diferente; também pode !=)
OUTPUT(5 > 3 AND NOT (2 > 9));    // true
```

Para trocar um valor de tipo, use **cast**: o tipo entre parênteses na frente.

```ecl
OUTPUT((STRING)2026 + ' é o ano');   // número virou texto
OUTPUT((INTEGER)'42' + 8);           // texto virou número: 50
```

# PILULA: Decisões com IF, MAP e CASE

> [crianca] "Se estiver chovendo, leve guarda-chuva; senão, leve óculos de sol." Isso é um `IF`. Quando são várias perguntas em fila ("se nevar, casaco; se chover, guarda-chuva; se fizer sol, boné; senão, nada"), é um `MAP`.

> [tecnico] `IF(condição, valor_se_verdade, valor_se_falso)` é uma **expressão que devolve um valor**, não um bloco de comandos. `MAP(c1 => v1, c2 => v2, padrão)` testa as condições em ordem e devolve o valor da primeira verdadeira. `CASE(expr, a => v1, b => v2, padrão)` compara uma expressão com valores exatos.

```ecl
Score := 640;

Faixa := MAP(Score >= 750 => 'BAIXO RISCO',
             Score >= 600 => 'MEDIO RISCO',
             'ALTO RISCO');

Estado := 'GA';
NomeEstado := CASE(Estado, 'FL' => 'Florida', 'GA' => 'Georgia', 'TX' => 'Texas', 'Outro');

OUTPUT(IF(Score >= 600, 'Aprovado', 'Negado'));
OUTPUT(Faixa);
OUTPUT(NomeEstado);
```

# EXERCICIO: Três definições, uma ação

Defina `Largura` com 8, `Altura` com 5 e `Area` como a multiplicação das duas. Mostre **somente** a área.

```ecl
// Suas definições aqui

```

## DICA
Multiplicação é `*`. Só a `Area` precisa de `OUTPUT`.

## GABARITO
```ecl
Largura := 8;
Altura  := 5;
Area    := Largura * Altura;
OUTPUT(Area);
```
`Largura` e `Altura` não têm `OUTPUT`, e mesmo assim são calculadas: a ação `OUTPUT(Area)` *depende* delas. O compilador puxa só o que é necessário.

# EXERCICIO: Recortando texto

O SSN americano (o "CPF" de lá) tem 9 dígitos. Dado `SSN := '912345678';`, mostre-o no formato `912-34-5678`.

```ecl
SSN := '912345678';
// Monte o formato com recortes e +

```

## DICA
Recorte três pedaços: `[1..3]`, `[4..5]` e `[6..9]`. Junte com `'-'` no meio.

## GABARITO
```ecl
SSN := '912345678';
Formatado := SSN[1..3] + '-' + SSN[4..5] + '-' + SSN[6..9];
OUTPUT(Formatado);
```
Posição em ECL começa em **1**. `SSN[6..]` também funcionaria para "do sexto até o fim".

# EXERCICIO: Tipos e cast

Defina um `UNSIGNED2` chamado `AnoNasc` com 1990 e um `UNSIGNED2` chamado `AnoAtual` com 2026. Mostre a frase `Idade: 36 anos` calculando a idade (não digite 36).

```ecl
UNSIGNED2 AnoNasc  := 1990;
UNSIGNED2 AnoAtual := 2026;

```

## DICA
A conta dá um número; para juntar com texto você precisa de `(STRING)(...)`.

## GABARITO
```ecl
UNSIGNED2 AnoNasc  := 1990;
UNSIGNED2 AnoAtual := 2026;
Idade := AnoAtual - AnoNasc;
OUTPUT('Idade: ' + (STRING)Idade + ' anos');
```

# EXERCICIO: Faixa etária com MAP

Com `Idade := 17;`, mostre `MENOR` se for abaixo de 18, `ADULTO` de 18 a 64 e `IDOSO` de 65 para cima. Depois troque a idade para 70 e para 30 e rode de novo para testar os três caminhos.

```ecl
Idade := 17;

```

## GABARITO
```ecl
Idade := 17;
Faixa := MAP(Idade < 18 => 'MENOR',
             Idade < 65 => 'ADULTO',
             'IDOSO');
OUTPUT(Faixa);
```
O `MAP` para na primeira condição verdadeira, então na segunda linha não é preciso repetir `Idade >= 18`.

# REAL: Regra de aprovação de crédito

Você entrou num time que mantém uma regra de pré-aprovação de crédito. O analista de negócio passou a regra:

- O cliente precisa ter **18 anos ou mais**.
- A parcela não pode passar de **30% da renda mensal**.
- Se o score for **menor que 500**, nega direto, não importa o resto.
- Resultado final: `APROVADO`, `NEGADO: IDADE`, `NEGADO: SCORE` ou `NEGADO: RENDA` (teste nessa ordem: idade, score, renda).

Dados do cliente de teste: idade 29, renda 4000.00, parcela 1100.00, score 610. Mostre o limite de parcela (30% da renda) e a decisão.

```ecl
UNSIGNED1  Idade   := 29;
DECIMAL8_2 Renda   := 4000.00;
DECIMAL8_2 Parcela := 1100.00;
UNSIGNED2  Score   := 610;

// 1) LimiteParcela
// 2) Definições BOOLEAN para cada regra (deixa o código legível)
// 3) Decisao com MAP
// 4) OUTPUT do limite e da decisão

```

## DICA
Crie definições booleanas com nome de pergunta: `IdadeOk := Idade >= 18;`. Depois o `MAP` lê quase como português: `NOT IdadeOk => 'NEGADO: IDADE'`.

## GABARITO
```ecl
UNSIGNED1  Idade   := 29;
DECIMAL8_2 Renda   := 4000.00;
DECIMAL8_2 Parcela := 1100.00;
UNSIGNED2  Score   := 610;

LimiteParcela := Renda * 0.30;

IdadeOk := Idade >= 18;
ScoreOk := Score >= 500;
RendaOk := Parcela <= LimiteParcela;

Decisao := MAP(NOT IdadeOk => 'NEGADO: IDADE',
               NOT ScoreOk => 'NEGADO: SCORE',
               NOT RendaOk => 'NEGADO: RENDA',
               'APROVADO');

OUTPUT(LimiteParcela);
OUTPUT(Decisao);
```
O limite é 1200.00 e a parcela é 1100.00, então `APROVADO`. Repare no estilo: **uma definição booleana por regra de negócio**. Em produção isso é ouro: quando a regra muda, você mexe em uma linha, e qualquer pessoa lê o `MAP` e entende a política.

# QUIZ

? O que o Thor faz?
- Responde consultas online em milissegundos
+ Processa grandes volumes de dados em lote, em paralelo
- Guarda os metadados dos arquivos
- É o site de administração do cluster
! Thor é a "cozinha": ETL pesado, joins, sorts, construção de índices.

? O que o Roxie faz?
- Compila o código ECL
- Faz a limpeza dos dados crus
+ Atende consultas com alta concorrência e resposta muito rápida usando índices
- Divide os arquivos entre os nós
! Roxie é o "garçom": entrega rápido o que o Thor preparou.

? O que acontece quando o cluster lê a linha `Total := Preco * 2;`?
- A multiplicação é calculada e guardada na memória
+ Nada é executado: é só uma definição
- O valor aparece no resultado
- Dá erro porque falta OUTPUT
! Definição é receita. Só uma ação (como OUTPUT) dispara execução.

? Qual linha está correta em ECL?
- `x = 10;`
- `x := 10`
+ `x := 10;`
- `x == 10;`
! Definição usa `:=` e termina com `;`. O `=` sozinho é comparação.

? Quanto vale `'ABCDEF'[2..4]`?
- `ABC`
+ `BCD`
- `CDE`
- `BC`
! Posições começam em 1 e os dois limites entram: B(2), C(3), D(4).

? Qual tipo é o mais adequado para guardar valores em dinheiro?
- `REAL`
- `INTEGER1`
+ `DECIMAL10_2`
- `BOOLEAN`
! REAL é aproximado e gera erro de centavos. DECIMAL é exato.

? Por que `x := x + 1;` não funciona em ECL?
- Porque falta o tipo
+ Porque um nome é definido uma única vez; não existe "variável que muda"
- Porque `+` não funciona com inteiros
- Funciona normalmente
! ECL é declarativo: definições são como fórmulas matemáticas, não caixas que mudam de valor.

# FLASHCARDS

Q: Thor em uma frase.
A: Motor de processamento em lote e em paralelo: limpa, cruza e transforma dados gigantes (a cozinha).
Q: Roxie em uma frase.
A: Motor de consultas online: usa índices para responder em milissegundos com muitos usuários (o garçom).
Q: Qual a diferença entre definição e ação?
A: Definição (`:=`) só dá nome a uma expressão, nada roda. Ação (ex.: `OUTPUT`) dispara a execução do que ela precisa.
Q: O que é um workunit?
A: A ficha de um job no cluster (ex.: W20261112-093015): guarda código, resultados, erros e grafo.
Q: Como se escreve "senão-se" em ECL?
A: `MAP(cond1 => valor1, cond2 => valor2, valor_padrao)`.
Q: `7 DIV 2` e `7 % 2` valem quanto?
A: 3 (divisão inteira) e 1 (resto).
Q: Como transformar o número 42 em texto?
A: Cast: `(STRING)42`.
