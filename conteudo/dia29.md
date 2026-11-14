---
dia: 29
modulo: 6
titulo: Caso real: produto Roxie com nota de risco
horas: 4
---

# MISSAO

> [goggins] Ontem você investigou o passado. Hoje você constrói o que **impede** o próximo caso: um produto que, no momento em que a seguradora vai aceitar um cliente novo ou pagar um sinistro, devolve em milissegundos uma nota de risco. Esse é literalmente o tipo de produto que a LexisNexis vende para metade das seguradoras dos EUA. Penúltimo dia. Você está pronto para isso.

**Hoje você vai:**

- Construir uma busca que perdoa erro de digitação (chave fonética).
- Calcular no Thor um modelo de risco por regras, com motivos explicáveis.
- Publicar uma consulta que devolve nota, faixa e motivos.
- Rodar o mesmo modelo em lote no Thor para uma carteira inteira.

# PILULA: Busca que perdoa erro: chave fonética

> [crianca] Se alguém fala "Jonez" ao telefone, você entende "Jones". Você não comparou as letras; comparou o **som**. Um índice fonético guarda o som do nome em vez das letras.

> [tecnico] O índice `PorNome` exige o sobrenome exato. Para tolerar grafias diferentes, constrói-se um índice cuja chave é o **código fonético** do sobrenome (`STD.Metaphone.Primary`, dia 15). Na consulta, calcula-se o código do que foi digitado e busca-se por ele; depois, os candidatos são **pontuados** pela proximidade real (distância de edição, nome, data de nascimento), porque o som sozinho liga demais (`JONES` e `JOHNS` soam igual).

```ecl thor
IMPORT Treino, STD;
E := Treino.Arquivos.Entidades;

ComSom := PROJECT(E, TRANSFORM({RECORDOF(E), STRING8 lname_som},
                               SELF.lname_som := STD.Metaphone.Primary(TRIM(LEFT.lname_clean)); SELF := LEFT));

KSom := INDEX(ComSom, {lname_som, state}, {entidade_id, id, fname_clean, lname_clean, dob, city_clean}, '~aluno::key::nome_fonetico');
BUILD(KSom, OVERWRITE);
```

```ecl
IMPORT STD;

Layout_KS := {STRING8 lname_som, STRING2 state, UNSIGNED4 entidade_id, UNSIGNED4 id, STRING20 fname_clean, STRING20 lname_clean, UNSIGNED4 dob, STRING20 city_clean};
KSom := INDEX(DATASET([], Layout_KS), {lname_som, state}, {entidade_id, id, fname_clean, lname_clean, dob, city_clean}, '~aluno::key::nome_fonetico');

Digitado := 'JONEZ';
Som := STD.Metaphone.Primary(Digitado);

Candidatos := LIMIT(KSom(KEYED(lname_som = Som), KEYED(state = 'TX')), 2000, SKIP);
OUTPUT(Som, NAMED('Codigo'));
OUTPUT(TABLE(Candidatos, {lname_clean, UNSIGNED4 qtd := COUNT(GROUP)}, lname_clean, FEW), NAMED('SobrenomesEncontrados'));
```

`JONEZ` não existe no cadastro, e mesmo assim a busca chega aos `JONES` (e também aos `JOHNS`, se houvesse). A pontuação decide quem sobe.

> [cuidado] Lembre do dia 20: se você rodar o build de novo **depois** de publicar a consulta que usa este índice, o `OVERWRITE` vai falhar com `Lock held`. Para estudar, exclua a consulta antes; em produção, versão + superkey.

# PILULA: Modelo de risco por regras, com motivos

> [crianca] O médico não diz só "você está doente": ele diz **por quê** ("febre alta e garganta inflamada"). Uma nota de risco sem motivo não ajuda ninguém a decidir.

> [tecnico] O modelo do curso é um **scorecard**: começa em uma nota base e cada sinal de risco soma pontos. Cada sinal acionado gera um **código de motivo** (*reason code*). A nota vai para uma faixa (BAIXO, MEDIO, ALTO). Tudo é calculado **no Thor**, por pessoa, e gravado como payload de um índice: a consulta só lê.

| Sinal | Pontos | Código |
|---|---|---|
| 3 ou mais sinistros de lesão | +35 | `R01 Lesoes repetidas` |
| Sinistros em oficina de alta concentração de lesão | +25 | `R02 Oficina de risco` |
| Valor médio de sinistro acima de 30.000 | +15 | `R03 Valor medio alto` |
| Mais de um cadastro (identidades variadas) | +10 | `R04 Multiplos cadastros` |
| Mais de 5% das compras fora do estado | +10 | `R05 Compras fora do estado` |
| Faixa: 0–29 BAIXO · 30–59 MEDIO · 60+ ALTO | | |

> [real] Modelos de risco em produção costumam ser estatísticos (regressão, árvores, gradient boosting) treinados com histórico, mas a regra dos **motivos** é a mesma: em crédito nos EUA a lei obriga a informar ao consumidor os principais motivos de uma recusa. Um modelo que só cospe um número não chega a produção. O HPCC tem bibliotecas de machine learning (ECL-ML, *LearningTrees*); a entrega para o Roxie é idêntica à de hoje: o Thor calcula, o índice guarda, o Roxie lê.

# PILULA: O build do modelo

```ecl thor
IMPORT Treino;
A := Treino.Arquivos;

// Oficinas de risco: percentual de lesão acima de 60%
Ofi := TABLE(A.Sinistros(repair_shop <> ''), {repair_shop, REAL pct := COUNT(GROUP, claim_type = 'INJURY') * 100 / COUNT(GROUP)}, repair_shop, FEW);
OficinasRisco := SET(Ofi(pct > 60), repair_shop);

Sinis := TABLE(A.Sinistros, {person_id,
                           UNSIGNED2 lesoes   := COUNT(GROUP, claim_type = 'INJURY'),
                           UNSIGNED2 em_risco := COUNT(GROUP, repair_shop IN OficinasRisco),
                           REAL      media    := AVE(GROUP, amount)}, person_id);

Cad := TABLE(A.Entidades, {entidade_id, UNSIGNED2 cadastros := COUNT(GROUP), STRING2 casa := MIN(GROUP, state)}, entidade_id);

TxnCasa := JOIN(A.Transacoes, Cad, LEFT.person_id = RIGHT.entidade_id,
                TRANSFORM({UNSIGNED4 person_id, BOOLEAN fora}, SELF.fora := LEFT.state <> RIGHT.casa; SELF := LEFT), LOOKUP);
Txn := TABLE(TxnCasa, {person_id, REAL pct_fora := COUNT(GROUP, fora) * 100 / COUNT(GROUP)}, person_id);

Layout_Risco := RECORD
  UNSIGNED4 entidade_id;
  UNSIGNED1 nota;
  STRING5   faixa;
  STRING120 motivos;
END;

Base1 := JOIN(Cad, Sinis, LEFT.entidade_id = RIGHT.person_id,
              TRANSFORM({UNSIGNED4 entidade_id, UNSIGNED2 cadastros, UNSIGNED2 lesoes, UNSIGNED2 em_risco, REAL media},
                        SELF := LEFT; SELF := RIGHT), LEFT OUTER);
Base2 := JOIN(Base1, Txn, LEFT.entidade_id = RIGHT.person_id,
              TRANSFORM({RECORDOF(Base1), REAL pct_fora}, SELF := LEFT; SELF := RIGHT), LEFT OUTER);

Risco := PROJECT(Base2,
                 TRANSFORM(Layout_Risco,
                           r1 := LEFT.lesoes >= 3;
                           r2 := LEFT.em_risco > 0;
                           r3 := LEFT.media > 30000;
                           r4 := LEFT.cadastros > 1;
                           r5 := LEFT.pct_fora > 5;
                           n  := IF(r1, 35, 0) + IF(r2, 25, 0) + IF(r3, 15, 0) + IF(r4, 10, 0) + IF(r5, 10, 0);
                           SELF.nota    := n;
                           SELF.faixa   := MAP(n >= 60 => 'ALTO', n >= 30 => 'MEDIO', 'BAIXO');
                           SELF.motivos := IF(r1, 'R01 ', '') + IF(r2, 'R02 ', '') + IF(r3, 'R03 ', '') + IF(r4, 'R04 ', '') + IF(r5, 'R05', '');
                           SELF := LEFT));

KRisco := INDEX(Risco, {entidade_id}, {nota, faixa, motivos}, '~aluno::key::risco');

SEQUENTIAL(
  BUILD(KRisco, OVERWRITE),
  OUTPUT(SORT(TABLE(Risco, {faixa, UNSIGNED4 pessoas := COUNT(GROUP)}, faixa, FEW), faixa), NAMED('DistribuicaoPorFaixa'))
);
```

Olhe a distribuição: a imensa maioria em BAIXO e um grupo pequeno em ALTO. Um bom modelo de risco é assim: ele separa poucos para análise, não acusa todo mundo.

# PILULA: Lote no Thor, consulta no Roxie

> [tecnico] O mesmo produto tem dois jeitos de ser consumido. **Online**: um cliente por vez, pelo Roxie, na hora da decisão. **Em lote** (*batch*): a seguradora manda a carteira inteira, 2 milhões de apólices, e recebe um arquivo com a nota de todas. Lote **não** se faz chamando o Roxie 2 milhões de vezes: faz-se um JOIN no Thor contra o mesmo índice (ou o mesmo arquivo base), com a mesma lógica.

```ecl thor
Layout_KR := {UNSIGNED4 entidade_id, UNSIGNED1 nota, STRING5 faixa, STRING120 motivos};
KRisco := INDEX(DATASET([], Layout_KR), {entidade_id}, {nota, faixa, motivos}, '~aluno::key::risco');

// "Arquivo do cliente": uma carteira de apólices
Carteira := DATASET([{'POL0000533', 533}, {'POL0000001', 1}, {'POL0013468', 13468}, {'POL0000520', 520}, {'POL0099999', 99999}],
                    {STRING10 apolice, UNSIGNED4 entidade_id});

Resultado := JOIN(Carteira, KRisco, KEYED(LEFT.entidade_id = RIGHT.entidade_id),
                  TRANSFORM({STRING10 apolice, UNSIGNED4 entidade_id, UNSIGNED1 nota, STRING5 faixa, STRING120 motivos},
                            SELF.faixa := IF(RIGHT.entidade_id = 0, 'N/A', RIGHT.faixa);
                            SELF := LEFT; SELF := RIGHT),
                  LEFT OUTER, KEEP(1));
OUTPUT(SORT(Resultado, -nota, apolice));
```

# EXERCICIO: Código fonético de vários nomes

Mostre o código `STD.Metaphone.Primary` e a distância de edição em relação a `SMITH` para: `SMITH`, `SMYTH`, `SMITHE`, `SCHMIDT`, `SMALL`. Campos: `nome`, `STRING8 som`, `UNSIGNED1 distancia`, `BOOLEAN mesmo_som` (igual ao som de `SMITH`).

```ecl
IMPORT STD;
Nomes := DATASET([{'SMITH'}, {'SMYTH'}, {'SMITHE'}, {'SCHMIDT'}, {'SMALL'}], {STRING10 nome});

```

## GABARITO
```ecl
IMPORT STD;
Nomes := DATASET([{'SMITH'}, {'SMYTH'}, {'SMITHE'}, {'SCHMIDT'}, {'SMALL'}], {STRING10 nome});

Ref := STD.Metaphone.Primary('SMITH');
OUTPUT(PROJECT(Nomes, TRANSFORM({STRING10 nome, STRING8 som, UNSIGNED1 distancia, BOOLEAN mesmo_som},
                                SELF.som       := STD.Metaphone.Primary(TRIM(LEFT.nome));
                                SELF.distancia := STD.Str.EditDistance(TRIM(LEFT.nome), 'SMITH');
                                SELF.mesmo_som := SELF.som = Ref;
                                SELF := LEFT)));
```

# EXERCICIO: Explicando os motivos

Escreva a função `DescreveMotivos(STRING motivos)` que transforma os códigos em texto legível, separado por `; ` (por exemplo `'R01 R04 '` → `'Lesoes repetidas; Multiplos cadastros'`). Teste com `'R01 R02 R03 '`, `'R04 '` e `''` (que deve devolver `'Sem sinais de risco'`).

```ecl
IMPORT STD;

```

## DICA
Uma forma simples: monte o texto com cinco `IF(STD.Str.Find(motivos, 'R01', 1) > 0, 'Lesoes repetidas; ', '')` e corte o `; ` final.

## GABARITO
```ecl
IMPORT STD;

DescreveMotivos(STRING motivos) := FUNCTION
  Tem(STRING c) := STD.Str.Find(motivos, c, 1) > 0;
  t := IF(Tem('R01'), 'Lesoes repetidas; ', '')
     + IF(Tem('R02'), 'Oficina de risco; ', '')
     + IF(Tem('R03'), 'Valor medio alto; ', '')
     + IF(Tem('R04'), 'Multiplos cadastros; ', '')
     + IF(Tem('R05'), 'Compras fora do estado; ', '');
  RETURN IF(t = '', 'Sem sinais de risco', t[1..LENGTH(t) - 2]);
END;

OUTPUT(DescreveMotivos('R01 R02 R03 '));
OUTPUT(DescreveMotivos('R04 '));
OUTPUT(DescreveMotivos(''));
```

# REAL: Publique o produto `risco_segurado_v1`

Junte tudo numa consulta Roxie. Ela deve atender o atendente de subscrição, que digita o que tem do cliente.

**Entrada**: `Sobrenome`, `Nome`, `Estado`, `Nascimento` (AAAAMMDD, opcional). Sobrenome e estado obrigatórios: sem eles, erro 400.

**Lógica**:

1. Buscar candidatos pelo índice fonético (`~aluno::key::nome_fonetico`) com `KEYED` no som do sobrenome e no estado; `LIMIT` de 2000 com `SKIP`.
2. Pontuar cada candidato: `+40` se o sobrenome é igual ao digitado, `+25` se a distância de edição é 1, `+20` se o nome é igual, `+30` se o nascimento informado é igual. Ficar com o melhor cadastro de cada entidade.
3. Manter só candidatos com **50 pontos ou mais**, os 5 melhores.
4. Para cada um, ler a nota no índice `~aluno::key::risco`.

**Saída `Resultado`**: `entidade_id`, `nome`, `sobrenome`, `cidade`, `nascimento`, `confianca` (os pontos), `nota`, `faixa`, `motivos`, ordenado por `confianca` e `nota` decrescentes.

Teste com `#STORED` para: `JONEZ` / `MARY` / `TX`; e depois `JONES` / `MARY` / `TX` / nascimento da pessoa 533 (descubra pela primeira busca). Quando estiver certo, apague os `#STORED` e publique.

```ecl
#STORED('Sobrenome', 'jonez');
#STORED('Nome', 'mary');
#STORED('Estado', 'tx');
// consulta: risco_segurado_v1
IMPORT STD;

```

## GABARITO
```ecl
#STORED('Sobrenome', 'jonez');
#STORED('Nome', 'mary');
#STORED('Estado', 'tx');
// consulta: risco_segurado_v1
IMPORT STD;

STRING20  Sobrenome  := '' : STORED('Sobrenome');
STRING20  Nome       := '' : STORED('Nome');
STRING2   Estado     := '' : STORED('Estado');
UNSIGNED4 Nascimento := 0  : STORED('Nascimento');

L   := STD.Str.ToUpperCase(STD.Str.CleanSpaces(Sobrenome));
N   := STD.Str.ToUpperCase(STD.Str.CleanSpaces(Nome));
E   := STD.Str.ToUpperCase(Estado);
Som := STD.Metaphone.Primary(L);

Layout_KS := {STRING8 lname_som, STRING2 state, UNSIGNED4 entidade_id, UNSIGNED4 id, STRING20 fname_clean, STRING20 lname_clean, UNSIGNED4 dob, STRING20 city_clean};
KSom   := INDEX(DATASET([], Layout_KS), {lname_som, state}, {entidade_id, id, fname_clean, lname_clean, dob, city_clean}, '~aluno::key::nome_fonetico');
Layout_KR := {UNSIGNED4 entidade_id, UNSIGNED1 nota, STRING5 faixa, STRING120 motivos};
KRisco := INDEX(DATASET([], Layout_KR), {entidade_id}, {nota, faixa, motivos}, '~aluno::key::risco');

Cand := LIMIT(KSom(KEYED(lname_som = Som), KEYED(state = E)), 2000, SKIP);

Layout_C := {UNSIGNED4 entidade_id, STRING20 nome, STRING20 sobrenome, STRING20 cidade, UNSIGNED4 nascimento, UNSIGNED1 confianca};
Pontuado := PROJECT(Cand, TRANSFORM(Layout_C,
                                    d := STD.Str.EditDistance(TRIM(LEFT.lname_clean), TRIM(L));
                                    SELF.confianca := MAP(d = 0 => 40, d = 1 => 25, 0)
                                                    + IF(N <> '' AND LEFT.fname_clean = N, 20, 0)
                                                    + IF(Nascimento <> 0 AND LEFT.dob = Nascimento, 30, 0);
                                    SELF.nome := LEFT.fname_clean; SELF.sobrenome := LEFT.lname_clean;
                                    SELF.cidade := LEFT.city_clean; SELF.nascimento := LEFT.dob;
                                    SELF := LEFT));

Melhores := TOPN(DEDUP(SORT(Pontuado(confianca >= 50), entidade_id, -confianca), entidade_id), 5, -confianca, entidade_id);

Layout_R := RECORD
  Layout_C;
  UNSIGNED1 nota;
  STRING5   faixa;
  STRING120 motivos;
END;

Resultado := JOIN(Melhores, KRisco, KEYED(LEFT.entidade_id = RIGHT.entidade_id),
                  TRANSFORM(Layout_R, SELF := LEFT; SELF := RIGHT), LEFT OUTER, KEEP(1), LIMIT(10));

IF(L = '' OR E = '', FAIL(400, 'Informe ao menos Sobrenome e Estado'));
OUTPUT(SORT(Resultado, -confianca, -nota, entidade_id), NAMED('Resultado'));
```
Com `JONEZ`, ninguém tem sobrenome igual: os `JONES` entram com 25 (distância 1) + 20 (nome) = 45, abaixo do corte de 50, e a resposta vem **vazia**. Isso está certo: com uma grafia errada e só o nome, o produto não deve afirmar quem é a pessoa. Informe o nascimento (`#STORED('Nascimento', '...')`) e a confiança sobe para 75: aparece a pessoa 533, com faixa ALTO e os motivos R01, R02 e R03. Esse é o comportamento de um produto sério: tolerante a erro de digitação, mas exigente para afirmar identidade, e sempre explicando o porquê da nota.

# QUIZ

? Por que construir um índice fonético além do índice de nome exato?
- Porque é menor
+ Para encontrar candidatos mesmo quando o sobrenome foi digitado com grafia diferente
- Para substituir o vínculo de registros
- Porque o Roxie exige
! A chave é o som do nome, não as letras.

? Por que a busca fonética precisa de pontuação depois?
- Porque o Metaphone é lento
+ Porque nomes diferentes podem ter o mesmo som; a pontuação ordena e corta os candidatos fracos
- Porque o índice não tem payload
- Porque o KEYED não funciona com códigos
! Som igual é candidato, não confirmação.

? O que é um código de motivo (reason code)?
- Um código de erro da consulta
+ A explicação de qual sinal contribuiu para a nota de risco
- O id do workunit
- A versão do modelo
! Nota sem motivo não ajuda a decidir e, em crédito, é exigência legal.

? Onde deve ser calculada a nota de risco de cada pessoa?
- No Roxie, a cada consulta
+ No Thor, no build, e gravada como payload de um índice
- No navegador do usuário
- No ECL Watch
! Não depende da entrada da consulta; pré-calcule.

? A seguradora quer a nota de 2 milhões de apólices. Como entregar?
- Chamando a consulta Roxie 2 milhões de vezes
+ Com um JOIN em lote no Thor contra o mesmo índice ou arquivo base
- Com HTTPCALL em paralelo
- Exportando o índice para Excel
! Lote é trabalho do Thor; mesma lógica, sem milhões de viagens de rede.

? A consulta não encontrou nenhum candidato com confiança mínima. O que ela deve devolver?
- O candidato de maior pontuação mesmo assim
+ Uma resposta vazia, sem erro
- Erro 500
- Todos os candidatos
! Melhor não afirmar identidade do que afirmar errado.

# FLASHCARDS

Q: Como montar uma busca tolerante a grafia?
A: Índice com chave `STD.Metaphone.Primary(sobrenome)`; pontuar candidatos por EditDistance, nome, nascimento.
Q: O que é um scorecard?
A: Nota base + pontos por sinal de risco, com faixas e códigos de motivo.
Q: Online × lote.
A: Online: Roxie, um por vez. Lote: JOIN no Thor sobre o mesmo dado, mesma lógica.
Q: Por que exigir confiança mínima para responder?
A: Para não atribuir a nota de uma pessoa a outra.
Q: Onde fica o modelo de risco?
A: Calculado no Thor, gravado como payload de índice, lido pela consulta.
