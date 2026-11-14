---
dia: 15
modulo: 3
titulo: Vínculo de registros e prova do módulo 3
horas: 4.5
---

# MISSAO

> [goggins] Metade do caminho. Olha para trás: há 15 dias você não sabia o que era um RECORD. Hoje você vai fazer a coisa que construiu uma empresa de bilhões de dólares: olhar para dois cadastros diferentes e provar, com código, que são **a mesma pessoa**. Esse é o coração da LexisNexis. O dia é longo e termina com desafio e prova. Você já fez dias longos antes. Mais um.

**Hoje você vai:**

- Entender o problema do vínculo de registros (*record linkage* ou *entity resolution*).
- Reduzir comparações com **blocagem**.
- Comparar de forma aproximada com `EditDistance` e `Metaphone`.
- Pontuar pares e decidir com um limiar.
- Dar um identificador único a cada pessoa real.

Hoje você parte do cadastro já limpo (o que você construiu no dia 13): `Treino.Arquivos.PessoasLimpas`, que tem os campos originais mais `fname_clean`, `lname_clean`, `city_clean`, `ssn_ok`, `dob_ok`, `phone_ok`.

# PILULA: O problema: quem é quem

> [crianca] Na escola existem três fichas: "Roberto Silva, nascido em 5 de maio", "Beto Silva, nascido em 5 de maio" e "Roberto Sliva, nascido em 5 de maio". Qualquer professora sabe que é **o mesmo menino**: o Beto é apelido e "Sliva" foi alguém digitando com pressa. O computador não sabe. Para ele são três crianças. Seu trabalho hoje é ensinar o computador a pensar como a professora.

> [tecnico] **Vínculo de registros** é decidir quais registros se referem à mesma entidade do mundo real quando não existe uma chave confiável em comum. O resultado é um **identificador de entidade**: todos os cadastros da mesma pessoa recebem o mesmo número. O processo tem quatro etapas: (1) **limpar e padronizar** (feito); (2) **blocar**: escolher quais pares vale a pena comparar; (3) **comparar e pontuar** cada par; (4) **agrupar**: transformar pares em grupos com um id.

> [real] Na LexisNexis esse identificador se chama **LexID**. Ele liga dezenas de bilhões de registros públicos e privados a algumas centenas de milhões de pessoas. Quando um banco pergunta "este cliente tem histórico de fraude?", a resposta só existe porque alguém, antes, ligou a multa de trânsito de 2009, o endereço de 2014 e o cadastro do banco à mesma pessoa. Os dois erros possíveis custam caro: **ligar demais** (duas pessoas viram uma: o crime de um vai para a ficha do outro) e **ligar de menos** (uma pessoa vira duas: o fraudador abre conta nova e ninguém percebe).

# PILULA: Blocagem: não compare todo mundo com todo mundo

> [crianca] Para achar figurinhas repetidas num álbum com 20 mil figurinhas, você não compara cada uma com todas as outras: seriam 200 milhões de comparações. Você primeiro **separa por time**. Repetida só pode estar no montinho do mesmo time. Agora cada comparação é dentro de um montinho pequeno.

> [tecnico] Comparar todos os pares de `N` registros custa `N × (N−1) / 2`: para 21.800 registros são 237 milhões de pares; para 1 bilhão de registros, não há cluster que resolva. **Blocagem** é gerar só os pares que compartilham uma **chave de bloco**, uma igualdade barata que duas fichas da mesma pessoa provavelmente têm em comum. Como nenhuma chave pega todos os casos, usam-se **vários blocos** e os pares são unidos. Uma chave de bloco é um self-join com igualdade, `LEFT.id < RIGHT.id` e `ATMOST` contra chaves lixo.

```ecl thor
IMPORT Treino;
P := Treino.Arquivos.PessoasLimpas;

Layout_Par := {UNSIGNED4 id_a, UNSIGNED4 id_b};
Par(RECORDOF(P) a, RECORDOF(P) b) := TRANSFORM(Layout_Par, SELF.id_a := a.id; SELF.id_b := b.id);

// Bloco 1: mesmo SSN válido
ComSsn := P(ssn_ok);
Bloco1 := JOIN(ComSsn, ComSsn,
               LEFT.ssn = RIGHT.ssn AND LEFT.id < RIGHT.id,
               Par(LEFT, RIGHT), ATMOST(LEFT.ssn = RIGHT.ssn, 50));

// Bloco 2: mesma data de nascimento E mesmo telefone (pega quem está sem SSN)
Bloco2 := JOIN(P, P,
               LEFT.dob = RIGHT.dob AND LEFT.phone = RIGHT.phone AND LEFT.id < RIGHT.id,
               Par(LEFT, RIGHT), ATMOST(LEFT.dob = RIGHT.dob AND LEFT.phone = RIGHT.phone, 50));

// União sem repetir o mesmo par
Candidatos := DEDUP(SORT(Bloco1 + Bloco2, id_a, id_b), id_a, id_b);

OUTPUT(COUNT(Bloco1),     NAMED('ParesPorSSN'));
OUTPUT(COUNT(Bloco2),     NAMED('ParesPorNascimentoEFone'));
OUTPUT(COUNT(Candidatos), NAMED('CandidatosUnicos'));
```

De 237 milhões de pares possíveis para menos de 2 mil candidatos. Novidade: `A + B` concatena dois recordsets de mesmo layout (o `UNION ALL` do SQL).

> [cuidado] Par candidato **não é** par igual. A blocagem só diz "vale a pena olhar". Dois irmãos gêmeos moram na mesma casa, têm o mesmo telefone e a mesma data de nascimento. Quem decide é a próxima etapa.

# PILULA: Comparação aproximada

> [tecnico] Duas ferramentas da biblioteca padrão para "parecido":

| Função | Mede | Exemplo |
|---|---|---|
| `STD.Str.EditDistance(a, b)` | Quantas trocas, inserções ou remoções de letra levam de `a` até `b` | `JONES` → `JONEZ` = 1; `SMITH` → `SMYTHE` = 2 |
| `STD.Metaphone.Primary(s)` | Um código que representa o **som** da palavra em inglês | `SMITH` e `SMYTHE` → `SM0`; `WILLIAMS` e `WILLIAMZ` → `ALMS` |

```ecl
IMPORT STD;

Pares := DATASET([{'JONES', 'JONEZ'}, {'SMITH', 'SMYTHE'}, {'WILLIAMS', 'WILLIAMZ'},
                  {'JONES', 'JOHNS'}, {'GARCIA', 'MILLER'}], {STRING20 a, STRING20 b});

OUTPUT(TABLE(Pares, {a, b,
                     UNSIGNED1 distancia := STD.Str.EditDistance(TRIM(a), TRIM(b)),
                     STRING8   som_a     := STD.Metaphone.Primary(TRIM(a)),
                     STRING8   som_b     := STD.Metaphone.Primary(TRIM(b)),
                     BOOLEAN   mesmo_som := STD.Metaphone.Primary(TRIM(a)) = STD.Metaphone.Primary(TRIM(b))}));
```

Olhe a linha `JONES` / `JOHNS`: sobrenomes **diferentes** com o **mesmo som**. Fonética sozinha liga demais. Por isso comparação aproximada nunca decide sozinha: ela soma pontos junto com outras evidências.

> [cuidado] `EditDistance` é cara e `STRING20` vem cheio de espaços no fim: sempre use `TRIM`. E nunca a use como condição de JOIN em tabela grande (seria um `ALL`): aplique **depois** da blocagem, só nos pares candidatos.

# PILULA: Pontuar e decidir

> [crianca] O detetive junta pistas. "Mesmo sapato": uma pista fraca, muita gente tem. "Mesma impressão digital": pista fortíssima. Ele soma os pontos de cada pista e só prende o suspeito se a soma passar de um número combinado. Uma pista sozinha, mesmo forte, pode enganar.

> [tecnico] Cada campo comparado vale **pontos** proporcionais à sua força como evidência: um SSN igual vale muito (quase único); um CEP igual vale pouco (milhares de pessoas no mesmo CEP). A soma é comparada com um **limiar**: acima, o par é considerado a mesma pessoa. O limiar é a alavanca entre os dois erros: baixo demais liga gente diferente, alto demais deixa duplicatas. A regra do curso:

| Evidência | Pontos |
|---|---|
| SSN válido e igual | 5 |
| Data de nascimento igual | 3 |
| Sobrenome igual / distância de edição 1 | 3 / 2 |
| Primeiro nome igual (após apelido) | 2 |
| Telefone igual | 2 |
| CEP igual | 1 |
| **Limiar para ligar** | **7** |

```ecl thor
IMPORT Treino, STD;
P := Treino.Arquivos.PessoasLimpas;
R := RECORDOF(P);

Layout_Par := {UNSIGNED4 id_a, UNSIGNED4 id_b, UNSIGNED1 pontos};

Pontuar(R a, R b) :=
    IF(a.ssn_ok AND b.ssn_ok AND a.ssn = b.ssn, 5, 0)
  + IF(a.dob = b.dob, 3, 0)
  + MAP(a.lname_clean = b.lname_clean => 3,
        STD.Str.EditDistance(TRIM(a.lname_clean), TRIM(b.lname_clean)) <= 1 => 2,
        0)
  + IF(a.fname_clean = b.fname_clean, 2, 0)
  + IF(a.phone = b.phone AND a.phone <> '', 2, 0)
  + IF(a.zip = b.zip, 1, 0);

Par(R a, R b) := TRANSFORM(Layout_Par, SELF.id_a := a.id; SELF.id_b := b.id; SELF.pontos := Pontuar(a, b));

ComSsn := P(ssn_ok);
Bloco1 := JOIN(ComSsn, ComSsn, LEFT.ssn = RIGHT.ssn AND LEFT.id < RIGHT.id,
               Par(LEFT, RIGHT), ATMOST(LEFT.ssn = RIGHT.ssn, 50));
Bloco2 := JOIN(P, P, LEFT.dob = RIGHT.dob AND LEFT.phone = RIGHT.phone AND LEFT.id < RIGHT.id,
               Par(LEFT, RIGHT), ATMOST(LEFT.dob = RIGHT.dob AND LEFT.phone = RIGHT.phone, 50));
Candidatos := DEDUP(SORT(Bloco1 + Bloco2, id_a, id_b), id_a, id_b);

// Como os pontos se distribuem? É assim que se escolhe o limiar.
OUTPUT(SORT(TABLE(Candidatos, {pontos, UNSIGNED4 qtd := COUNT(GROUP)}, pontos, FEW), pontos), NAMED('DistribuicaoDePontos'));
```

Olhe a distribuição: há um grupo pequeno com **5 pontos** e todo o resto tem 10 ou mais. Esse vale no meio é o lugar natural do limiar. Os pares de 5 pontos têm o mesmo SSN e **mais nada** em comum: são pessoas diferentes com SSN digitado errado em alguma fonte. Uma regra ingênua de "SSN igual = mesma pessoa" teria fundido essas pessoas. O seu sistema de pontos não cai nessa.

# PILULA: Dos pares ao identificador de entidade

> [tecnico] Com os pares aprovados, falta dar um número a cada grupo. Convenção simples: o id da entidade é o **menor id** entre os registros ligados. Para cada registro que aparece como `id_b` em algum par, pegue o menor `id_a` com que ele se ligou; quem não aparece em par nenhum fica com o próprio id. Depois um JOIN `LEFT OUTER` leva o resultado de volta ao cadastro.

```ecl thor
IMPORT Treino;
P := Treino.Arquivos.PessoasLimpas;

// Pares aprovados pela regra de pontos (a implementação de referência do curso)
Iguais := Treino.Vinculo.Candidatos(P)(pontos >= 7);

Menor := TABLE(Iguais, {id_b, UNSIGNED4 menor := MIN(GROUP, id_a)}, id_b);

Layout_Ent := RECORD
  UNSIGNED4 entidade_id;
  RECORDOF(P);
END;

Entidades := JOIN(P, Menor,
                  LEFT.id = RIGHT.id_b,
                  TRANSFORM(Layout_Ent,
                            SELF.entidade_id := IF(RIGHT.id_b <> 0, RIGHT.menor, LEFT.id);
                            SELF := LEFT),
                  LEFT OUTER, KEEP(1));

OUTPUT(COUNT(Entidades),                                    NAMED('Cadastros'));
OUTPUT(COUNT(TABLE(Entidades, {entidade_id}, entidade_id)), NAMED('PessoasReais'));

// Um exemplo: todos os cadastros de uma mesma pessoa
Tamanhos := TABLE(Entidades, {entidade_id, UNSIGNED2 n := COUNT(GROUP)}, entidade_id);
Exemplo  := TOPN(Tamanhos, 1, -n, entidade_id)[1].entidade_id;
OUTPUT(TABLE(Entidades(entidade_id = Exemplo), {entidade_id, id, first_name, last_name, dob, ssn, street, city}), NAMED('UmaPessoaVariosCadastros'));
```

21.800 cadastros, 20.000 pessoas reais. Olhe o último resultado: a mesma pessoa com apelido, com nome em maiúsculas, com sobrenome digitado errado, sem SSN, de endereço novo. Você ensinou o computador a pensar como a professora.

> [cuidado] O "menor id" de uma passada só funciona quando todos os cadastros de uma pessoa se ligam direto a um mesmo registro. No mundo real existem **cadeias**: A liga com B, B liga com C, mas A e C não foram comparados. Fechar essas cadeias (*fecho transitivo*) exige repetir a propagação do menor id até nada mais mudar. Você vai fazer isso com `LOOP` no dia 22.

# EXERCICIO: Pontuação em dados pequenos

Com os cadastros abaixo, gere todos os pares (`id_a < id_b`) que tenham o **mesmo `dob`** e calcule para cada par: `UNSIGNED1 dist_sobrenome` (distância de edição entre os sobrenomes) e `UNSIGNED1 pontos` pela regra: dob igual 3; sobrenome igual 3 ou distância 1 → 2; nome igual 2; telefone igual 2. Mostre só os pares com 7 pontos ou mais, ordenados por `id_a, id_b`.

```ecl
IMPORT STD;

C := DATASET([{1, 'ROBERT', 'SMITH',  19800505, '3055550142'},
              {2, 'ROBERT', 'SMITHE', 19800505, '3055550142'},
              {3, 'ROBERTA','SMITH',  19800505, '4045550199'},
              {4, 'MARY',   'JONES',  19910312, '2125550177'},
              {5, 'MARY',   'JONEZ',  19910312, '2125550177'},
              {6, 'JOHN',   'JONES',  19910312, '6465550101'}],
             {UNSIGNED4 id, STRING10 nome, STRING10 sobrenome, UNSIGNED4 dob, STRING10 fone});

```

## DICA
Self-join por `dob` com `LEFT.id < RIGHT.id`. Dentro do TRANSFORM, calcule a distância em uma definição local e reutilize.

## GABARITO
```ecl
IMPORT STD;

C := DATASET([{1, 'ROBERT', 'SMITH',  19800505, '3055550142'},
              {2, 'ROBERT', 'SMITHE', 19800505, '3055550142'},
              {3, 'ROBERTA','SMITH',  19800505, '4045550199'},
              {4, 'MARY',   'JONES',  19910312, '2125550177'},
              {5, 'MARY',   'JONEZ',  19910312, '2125550177'},
              {6, 'JOHN',   'JONES',  19910312, '6465550101'}],
             {UNSIGNED4 id, STRING10 nome, STRING10 sobrenome, UNSIGNED4 dob, STRING10 fone});

Layout_Par := {UNSIGNED4 id_a, UNSIGNED4 id_b, UNSIGNED1 dist_sobrenome, UNSIGNED1 pontos};

Pares := JOIN(C, C,
              LEFT.dob = RIGHT.dob AND LEFT.id < RIGHT.id,
              TRANSFORM(Layout_Par,
                        d := STD.Str.EditDistance(TRIM(LEFT.sobrenome), TRIM(RIGHT.sobrenome));
                        SELF.id_a := LEFT.id;
                        SELF.id_b := RIGHT.id;
                        SELF.dist_sobrenome := d;
                        SELF.pontos := 3
                                     + MAP(d = 0 => 3, d = 1 => 2, 0)
                                     + IF(LEFT.nome = RIGHT.nome, 2, 0)
                                     + IF(LEFT.fone = RIGHT.fone, 2, 0)));

OUTPUT(SORT(Pares(pontos >= 7), id_a, id_b));
```
Passam (1,2) com 9 e (4,5) com 9. O par (1,3) fica com 6: mesmo sobrenome e nascimento, mas nome e telefone diferentes. Podem ser gêmeos. A regra não liga, e está certa em não ligar.

# EXERCICIO: Um terceiro bloco

Imagine que parte do cadastro viesse **sem SSN e sem telefone**. Crie um bloco alternativo em `Treino.Arquivos.PessoasLimpas`: mesmo `lname_clean`, mesmo `dob` e mesmo `zip`. Mostre: (1) quantos pares esse bloco gera; (2) quantos desses pares têm `fname_clean` **diferente**.

```ecl thor
IMPORT Treino;
P := Treino.Arquivos.PessoasLimpas;

```

## GABARITO
```ecl thor
IMPORT Treino;
P := Treino.Arquivos.PessoasLimpas;

Layout_Par := {UNSIGNED4 id_a, UNSIGNED4 id_b, BOOLEAN nome_diferente};

Bloco3 := JOIN(P, P,
               LEFT.lname_clean = RIGHT.lname_clean AND LEFT.dob = RIGHT.dob AND LEFT.zip = RIGHT.zip AND LEFT.id < RIGHT.id,
               TRANSFORM(Layout_Par,
                         SELF.id_a := LEFT.id; SELF.id_b := RIGHT.id;
                         SELF.nome_diferente := LEFT.fname_clean <> RIGHT.fname_clean));

OUTPUT(COUNT(Bloco3));
OUTPUT(COUNT(Bloco3(nome_diferente)));
```
Esse bloco perde os casos de sobrenome digitado errado e os de quem mudou de endereço: cada bloco tem um ponto cego. Por isso se usam vários.

# DESAFIO: Do cadastro limpo ao dossiê por pessoa

Sem dica. Thor. Tudo dos dias 11 a 15.

A partir de `Treino.Arquivos.PessoasLimpas`, construa o **arquivo de entidades** e o **dossiê por pessoa real**, com controles, pronto para ser promovido.

1. **Blocagem com três blocos**: (i) SSN válido igual; (ii) `dob` e `phone` iguais; (iii) `lname_clean`, `dob` e `zip` iguais. Use `ATMOST` de 50 em todos. Una e remova pares repetidos.
2. **Pontue** cada par candidato com a regra da aula (SSN 5; dob 3; sobrenome igual 3 ou distância 1 → 2; nome 2; telefone 2; CEP 1) e aprove os pares com **7 ou mais**.
3. **Atribua `entidade_id`** (menor id ligado) a todos os 21.800 cadastros.
4. **Monte o dossiê**: um registro por `entidade_id` com `UNSIGNED2 qtd_cadastros` e um dataset filho `cadastros` contendo `id, first_name, last_name, ssn, street, city, state` de cada cadastro daquela pessoa.
5. **Controles** (o job falha se algum não passar): a soma de `qtd_cadastros` do dossiê tem que ser 21.800; a quantidade de entidades tem que estar entre 19.900 e 20.100.
6. **Grave** o dossiê em um arquivo com nome único por execução (`'~aluno::dossie::v_' + WORKUNIT`) e coloque-o como único subfile do superfile `~aluno::dossie::atual`, dentro de uma transação.
7. Entregue, **lendo pelo superfile**, nesta ordem: (a) a quantidade de entidades; (b) a distribuição `qtd_cadastros` → quantidade de entidades, ordenada por `qtd_cadastros`; (c) quantas entidades têm cadastros em **mais de um estado**.

```ecl thor
IMPORT Treino, STD;
P := Treino.Arquivos.PessoasLimpas;

```

## GABARITO
```ecl thor
IMPORT Treino, STD;
P := Treino.Arquivos.PessoasLimpas;
R := RECORDOF(P);

// 1 e 2) blocagem e pontuação
Layout_Par := {UNSIGNED4 id_a, UNSIGNED4 id_b, UNSIGNED1 pontos};

Pontuar(R a, R b) :=
    IF(a.ssn_ok AND b.ssn_ok AND a.ssn = b.ssn, 5, 0)
  + IF(a.dob = b.dob, 3, 0)
  + MAP(a.lname_clean = b.lname_clean => 3,
        STD.Str.EditDistance(TRIM(a.lname_clean), TRIM(b.lname_clean)) <= 1 => 2,
        0)
  + IF(a.fname_clean = b.fname_clean, 2, 0)
  + IF(a.phone = b.phone AND a.phone <> '', 2, 0)
  + IF(a.zip = b.zip, 1, 0);

Par(R a, R b) := TRANSFORM(Layout_Par, SELF.id_a := a.id; SELF.id_b := b.id; SELF.pontos := Pontuar(a, b));

ComSsn := P(ssn_ok);
B1 := JOIN(ComSsn, ComSsn, LEFT.ssn = RIGHT.ssn AND LEFT.id < RIGHT.id,
           Par(LEFT, RIGHT), ATMOST(LEFT.ssn = RIGHT.ssn, 50));
B2 := JOIN(P, P, LEFT.dob = RIGHT.dob AND LEFT.phone = RIGHT.phone AND LEFT.id < RIGHT.id,
           Par(LEFT, RIGHT), ATMOST(LEFT.dob = RIGHT.dob AND LEFT.phone = RIGHT.phone, 50));
B3 := JOIN(P, P, LEFT.lname_clean = RIGHT.lname_clean AND LEFT.dob = RIGHT.dob AND LEFT.zip = RIGHT.zip AND LEFT.id < RIGHT.id,
           Par(LEFT, RIGHT), ATMOST(LEFT.lname_clean = RIGHT.lname_clean AND LEFT.dob = RIGHT.dob AND LEFT.zip = RIGHT.zip, 50));

Iguais := DEDUP(SORT(B1 + B2 + B3, id_a, id_b), id_a, id_b)(pontos >= 7);

// 3) entidade_id
Menor := TABLE(Iguais, {id_b, UNSIGNED4 menor := MIN(GROUP, id_a)}, id_b);

Layout_Ent := RECORD
  UNSIGNED4 entidade_id;
  R;
END;

Entidades := JOIN(P, Menor, LEFT.id = RIGHT.id_b,
                  TRANSFORM(Layout_Ent, SELF.entidade_id := IF(RIGHT.id_b <> 0, RIGHT.menor, LEFT.id); SELF := LEFT),
                  LEFT OUTER, KEEP(1));

// 4) dossiê: um registro por pessoa real, com os cadastros como filho
Layout_Cad := {UNSIGNED4 id, STRING20 first_name, STRING20 last_name, STRING9 ssn, STRING30 street, STRING20 city, STRING2 state};

Layout_Dossie := RECORD
  UNSIGNED4 entidade_id;
  UNSIGNED2 qtd_cadastros;
  DATASET(Layout_Cad) cadastros;
END;

D := DISTRIBUTE(Entidades, HASH32(entidade_id));
G := GROUP(SORT(D, entidade_id, id, LOCAL), entidade_id, LOCAL);

Dossie := ROLLUP(G, GROUP,
                 TRANSFORM(Layout_Dossie,
                           SELF.entidade_id   := LEFT.entidade_id;
                           SELF.qtd_cadastros := COUNT(ROWS(LEFT));
                           SELF.cadastros     := PROJECT(ROWS(LEFT), Layout_Cad)));

// 5 e 6) controles, gravação e promoção
Super  := '~aluno::dossie::atual';
Versao := '~aluno::dossie::v_' + WORKUNIT;
Lido   := DATASET(Super, Layout_Dossie, THOR);

SEQUENTIAL(
  ASSERT(SUM(Dossie, qtd_cadastros) = 21800, 'Dossie perdeu ou duplicou cadastros', FAIL),
  ASSERT(COUNT(Dossie) BETWEEN 19900 AND 20100, 'Quantidade de entidades fora do esperado', FAIL),
  OUTPUT(Dossie, , Versao, OVERWRITE),
  IF(NOT STD.File.SuperFileExists(Super), STD.File.CreateSuperFile(Super)),
  STD.File.StartSuperFileTransaction(),
  STD.File.ClearSuperFile(Super),
  STD.File.AddSuperFile(Super, Versao),
  STD.File.FinishSuperFileTransaction(),
  OUTPUT(COUNT(Lido)),
  OUTPUT(SORT(TABLE(Lido, {qtd_cadastros, UNSIGNED4 entidades := COUNT(GROUP)}, qtd_cadastros, FEW), qtd_cadastros)),
  OUTPUT(COUNT(Lido(COUNT(TABLE(cadastros, {state}, state)) > 1)))
);
```
Leia o gabarito como uma revisão do módulo inteiro: blocagem e pontos (dia 15), `ATMOST` contra chave lixo (dia 8), `DISTRIBUTE` + `LOCAL` para agrupar sem sort global (dia 12), `ROLLUP` de grupo criando dataset filho (dias 10 e 11), filtro por conteúdo do filho no item (c) (dia 11), `ASSERT`, nome por `WORKUNIT` e troca de superfile em transação (dia 14). O item (c) conta pessoas que **mudaram de estado**: histórico de endereços é uma das informações mais valiosas que um birô vende, e ela só existe depois do vínculo.

Você construiu, em escala pequena, o processo que sustenta o principal ativo da LexisNexis. A partir de amanhã o curso muda de lado: do Thor, que prepara, para o Roxie, que entrega.

# TESTE

? O que é um dataset filho?
- Uma cópia reduzida de um arquivo
+ Um campo que guarda uma tabela dentro de cada registro
- Um arquivo que depende de outro para existir
- O lado direito de um JOIN
! `DATASET(Layout) campo;` em um RECORD.

? Qual operação transforma um registro pai com 5 filhos em 5 registros planos?
- DENORMALIZE
+ NORMALIZE
- ROLLUP
- DEDUP
! NORMALIZE gera uma saída por filho; DENORMALIZE faz o caminho inverso.

? Como filtrar pessoas que têm algum veículo da marca Tesla no campo filho `veiculos`?
- `Pessoas(veiculos.make = 'Tesla')`
- `Pessoas(make IN veiculos)`
+ `Pessoas(EXISTS(veiculos(make = 'Tesla')))`
- `NORMALIZE(Pessoas, 'Tesla')`
! Filtra-se o filho como dataset e testa-se com EXISTS.

? O que `DISTRIBUTE(ds, HASH32(k))` garante?
+ Registros com o mesmo valor de `k` ficam no mesmo nó
- Todos os nós recebem a mesma quantidade de registros
- Os registros ficam ordenados por `k`
- Os duplicados de `k` são removidos
! Co-localização por chave, sem ordem e sem garantia de equilíbrio.

? Em que condição uma operação com `LOCAL` produz o resultado correto?
- Sempre
+ Quando os registros que precisam se encontrar já estão no mesmo nó
- Quando o dataset está ordenado globalmente
- Quando o cluster tem número par de nós
! Normalmente depois de um DISTRIBUTE pela mesma chave.

? Uma chave de JOIN tem 4% de valores vazios em um arquivo de 5 bilhões de linhas. O que acontece em um cluster de 400 nós?
- Nada: os vazios são ignorados automaticamente
+ Os 200 milhões de vazios vão para o mesmo nó, que segura o job inteiro (skew)
- O job roda mais rápido
- O compilador recusa o JOIN
! A média por nó seria 12,5 milhões; um nó recebe 200 milhões a mais.

? O que `STD.DataPatterns.Profile` fornece?
- A lista de arquivos do cluster
+ Fill rate, cardinalidade, tamanhos e padrões de formato de cada campo
- O grafo de execução
- O layout ideal para um índice
! É a "radiografia" do arquivo, feita antes de limpar.

? Por que manter `last_name` original junto de `lname_clean`?
+ O original preserva a informação para exibição e auditoria; o limpo serve para comparação
- Porque o ECL não permite apagar campos
- Para o arquivo ficar ordenado
- Para o DEDUP funcionar
! Limpeza destrói informação; nunca sobrescreva o original.

? O que `x := ... : PERSIST('~a::p');` faz?
- Executa `x` em outro cluster
- Impede que `x` seja usado mais de uma vez
+ Grava o resultado e o reaproveita enquanto código e entradas não mudarem
- Publica `x` no Roxie
! Poupa o reprocessamento de etapas caras e estáveis.

? Qual é a principal vantagem de um superfile em um processo diário?
- Compactar os dados
+ Manter um nome fixo para os consumidores enquanto os subfiles são trocados
- Dispensar o uso de layouts
- Acelerar o spray
! Atualizar ou reverter é trocar ponteiro, sem alterar quem consome.

? O que a blocagem resolve no vínculo de registros?
- A limpeza dos nomes
+ A impossibilidade de comparar todos os pares: só são gerados pares com uma chave em comum
- A escolha do limiar
- A gravação do arquivo final
! De N² pares possíveis para um conjunto pequeno de candidatos.

? Por que usar mais de uma chave de bloco?
- Para o job demorar mais
- Porque o ECL exige ao menos duas
+ Porque cada chave tem pontos cegos (campo vazio, erro de digitação, mudança de endereço)
- Para aumentar o skew
! Um par que escapa de um bloco pode ser pego por outro.

? `STD.Str.EditDistance('JONES', 'JONEZ')` vale...
- 0
+ 1
- 2
- 5
! Uma troca de letra.

? Dois cadastros têm o mesmo SSN e nada mais em comum (nome, nascimento e telefone diferentes). Pela regra de pontos da aula (limiar 7), eles são ligados?
- Sim, SSN igual sempre liga
+ Não: somam 5 pontos, abaixo do limiar
- Sim, porque passaram na blocagem
- Depende do Metaphone
! Passar na blocagem só os torna candidatos. Uma evidência isolada não basta.

? Qual o risco de um limiar baixo demais?
- Deixar muitas duplicatas sem ligar
+ Ligar pessoas diferentes como se fossem a mesma
- Aumentar o skew
- Impedir a blocagem
! Ligar demais mistura o histórico de pessoas distintas; ligar de menos deixa a mesma pessoa repartida.

# FLASHCARDS

Q: Quatro etapas do vínculo de registros.
A: Limpar/padronizar; blocar; comparar e pontuar; agrupar em entidades.
Q: O que é blocagem?
A: Gerar só os pares que compartilham uma chave barata, em vez de comparar todos com todos.
Q: Duas funções de comparação aproximada.
A: `STD.Str.EditDistance(a, b)` (letras de diferença) e `STD.Metaphone.Primary(s)` (código do som).
Q: Os dois erros do vínculo.
A: Ligar demais (pessoas diferentes viram uma) e ligar de menos (uma pessoa vira várias).
Q: Como unir dois recordsets de mesmo layout?
A: `A + B`
Q: Como atribuir id de entidade em uma passada?
A: Menor id ligado: `TABLE(Pares, {id_b, menor := MIN(GROUP, id_a)}, id_b)` e JOIN LEFT OUTER de volta.
Q: Por que nunca usar EditDistance como condição de JOIN em tabela grande?
A: Sem igualdade vira comparação de todos com todos; aplique só nos pares já blocados.
