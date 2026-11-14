---
dia: 28
modulo: 6
titulo: Caso real: a quadrilha de fraude em seguros
horas: 4
---

# MISSAO

> [goggins] Desde o dia 3 tem uma oficina aparecendo no seu código. Você viu ela com 16 linhas, viu de novo no dia 10, no 17, no 25. Hoje acabou a desconfiança: você vai **desmontar a quadrilha inteira**, provar com números e entregar um relatório que um investigador consegue levar para o diretor. Hoje não é aula. É trabalho de campo.

**Hoje você vai:**

- Seguir o roteiro de uma investigação de fraude com dados.
- Encontrar a anomalia, delimitar o grupo, medir o tamanho do prejuízo.
- Montar a rede de ligações entre segurados, veículos e oficinas.
- Entregar um relatório com evidências, não com palpites.

Todos os blocos de hoje rodam no thor.

# PILULA: Como se investiga fraude com dados

> [crianca] Um detetive não sai prendendo quem tem cara de culpado. Ele acha **uma** coisa estranha ("por que essa porta estava aberta?"), puxa o fio, descobre quem mais passou por ali, e só acusa quando as pistas se fecham umas nas outras.

> [tecnico] Investigação de fraude organizada segue quatro passos, e cada um é um tipo de consulta que você já sabe escrever:

| Passo | Pergunta | Ferramenta ECL |
|---|---|---|
| 1. **Anomalia** | Que entidade se comporta diferente das outras? | `TABLE` agrupado + comparação com a média |
| 2. **Delimitação** | Quem está ligado a essa entidade? | `JOIN`, filtro por conteúdo |
| 3. **Rede** | Como essas pessoas se ligam entre si? | Self-join, `LOOP` (fecho transitivo) |
| 4. **Prova** | O padrão do grupo é estatisticamente diferente do resto? | Comparação grupo × população |

> [real] Seguradoras americanas perdem dezenas de bilhões de dólares por ano com fraude. O padrão que você vai encontrar hoje, de acidentes encenados com lesão corporal concentrados numa oficina ou clínica, é dos mais comuns e dos mais caros. Produtos de análise de fraude da LexisNexis fazem exatamente isto, em escala nacional: cruzam sinistros de várias seguradoras para ver o que nenhuma enxerga sozinha.

# PILULA: Passo 1: a anomalia

Para cada oficina, calcule indicadores e compare com a média de todas. Uma oficina normal tem a mesma "cara" das outras; uma oficina anômala foge em vários indicadores ao mesmo tempo.

```ecl thor
IMPORT Treino;
S := Treino.Arquivos.Sinistros(repair_shop <> '');

PorOficina := TABLE(S,
                    {repair_shop,
                     UNSIGNED4  qtd         := COUNT(GROUP),
                     UNSIGNED4  pessoas     := 0,
                     DECIMAL5_1 pct_lesao   := COUNT(GROUP, claim_type = 'INJURY') * 100 / COUNT(GROUP),
                     DECIMAL9_2 valor_medio := AVE(GROUP, amount),
                     DECIMAL5_1 pct_pago    := COUNT(GROUP, status = 'PAID') * 100 / COUNT(GROUP)},
                    repair_shop, FEW);

// Pessoas distintas por oficina
Distintas := TABLE(TABLE(S, {repair_shop, person_id}, repair_shop, person_id), {repair_shop, UNSIGNED4 n := COUNT(GROUP)}, repair_shop, FEW);
Completo  := JOIN(PorOficina, Distintas, LEFT.repair_shop = RIGHT.repair_shop,
                  TRANSFORM(RECORDOF(PorOficina), SELF.pessoas := RIGHT.n; SELF := LEFT), LOOKUP);

MediaLesao := AVE(Completo, pct_lesao);
MediaValor := AVE(Completo, valor_medio);

OUTPUT(SORT(TABLE(Completo, {repair_shop, qtd, pessoas, pct_lesao, valor_medio, pct_pago,
                             REAL lesao_x_media := pct_lesao / MediaLesao,
                             REAL valor_x_media := valor_medio / MediaValor}), -lesao_x_media), NAMED('Oficinas'));
```

Leia a linha do topo: percentual de lesão várias vezes acima da média, valor médio bem acima, praticamente tudo pago, e **poucas pessoas** para muitos sinistros. Quatro indicadores fora do padrão ao mesmo tempo não é acaso.

# PILULA: Passo 2: quem está ligado

```ecl thor
IMPORT Treino;
A := Treino.Arquivos;

Suspeita := 'Crash Kings Auto';
DaOficina := A.Sinistros(TRIM(repair_shop) = Suspeita);

// Pessoas com sinistro nessa oficina e o comportamento delas EM TODAS as oficinas
Pessoas := TABLE(DaOficina, {person_id}, person_id);

Historico := JOIN(A.Sinistros, Pessoas, LEFT.person_id = RIGHT.person_id, TRANSFORM(LEFT), LOOKUP);

PerfilPessoa := TABLE(Historico,
                      {person_id,
                       UNSIGNED2 qtd            := COUNT(GROUP),
                       UNSIGNED2 na_suspeita    := COUNT(GROUP, TRIM(repair_shop) = Suspeita),
                       UNSIGNED2 lesoes         := COUNT(GROUP, claim_type = 'INJURY'),
                       UNSIGNED8 total          := SUM(GROUP, amount)},
                      person_id);

OUTPUT(COUNT(Pessoas), NAMED('PessoasNaOficina'));
OUTPUT(SORT(TABLE(PerfilPessoa, {na_suspeita, UNSIGNED4 pessoas := COUNT(GROUP)}, na_suspeita, FEW), na_suspeita), NAMED('QuantasVezesCadaPessoaUsouAOficina'));
OUTPUT(TOPN(PerfilPessoa, 10, -total, person_id), NAMED('MaioresValores'));
```

A distribuição separa dois grupos: muita gente que passou **uma vez** pela oficina (cliente comum, que bateu o carro e consertou ali) e um núcleo que voltou **várias** vezes, sempre com lesão. É esse núcleo que interessa.

# PILULA: Passo 3: a rede

> [tecnico] Quadrilha não é só "muita gente na mesma oficina". As pessoas se ligam entre si: dividem endereço, telefone, sobrenome, carro. Ligações entre pessoas formam um **grafo**: pessoas são nós, atributos compartilhados são arestas. Para achar os grupos, você gera os pares (self-join por atributo) e fecha as cadeias com o `LOOP` do dia 22.

```ecl thor
IMPORT Treino;
A := Treino.Arquivos;

Nucleo := TABLE(A.Sinistros(TRIM(repair_shop) = 'Crash Kings Auto' AND claim_type = 'INJURY'),
                {person_id, UNSIGNED2 n := COUNT(GROUP)}, person_id)(n >= 3);

// Atributos das pessoas do núcleo
Attr := JOIN(A.Pessoas, Nucleo, LEFT.id = RIGHT.person_id,
             TRANSFORM({UNSIGNED4 id, STRING20 last_name, STRING5 zip, STRING2 state}, SELF := LEFT), LOOKUP);

// Ligações: mesmo CEP (vizinhos) ou mesmo sobrenome no mesmo estado (possíveis parentes)
Layout_Par := {UNSIGNED4 a, UNSIGNED4 b, STRING10 motivo};
PorCep  := JOIN(Attr, Attr, LEFT.zip = RIGHT.zip AND LEFT.id < RIGHT.id,
                TRANSFORM(Layout_Par, SELF.a := LEFT.id; SELF.b := RIGHT.id; SELF.motivo := 'CEP'));
PorNome := JOIN(Attr, Attr, LEFT.last_name = RIGHT.last_name AND LEFT.state = RIGHT.state AND LEFT.id < RIGHT.id,
                TRANSFORM(Layout_Par, SELF.a := LEFT.id; SELF.b := RIGHT.id; SELF.motivo := 'SOBRENOME'));

OUTPUT(COUNT(Nucleo),  NAMED('PessoasNoNucleo'));
OUTPUT(COUNT(PorCep),  NAMED('LigacoesPorCep'));
OUTPUT(COUNT(PorNome), NAMED('LigacoesPorSobrenome'));
OUTPUT(CHOOSEN(SORT(PorCep + PorNome, a, b), 20), NAMED('Amostra'));
```

> [cuidado] Num dado sintético como o do curso, as ligações por CEP e sobrenome são poucas: a quadrilha foi plantada pela oficina, não por endereço. Em dado real elas são a parte mais rica da investigação, e também a mais perigosa: dois vizinhos não são cúmplices por morarem perto. Ligação é **pista para o investigador humano**, nunca acusação automática.

# PILULA: Passo 4: a prova

> [tecnico] O investigador vai ouvir: "isso pode ser coincidência". A resposta é comparar o **grupo** com a **população** nos indicadores que importam e mostrar o tamanho da diferença. Quanto mais indicadores independentes divergem na mesma direção, menor a chance de acaso.

```ecl thor
IMPORT Treino;
S := Treino.Arquivos.Sinistros;

NoNucleo := SET(TABLE(S(TRIM(repair_shop) = 'Crash Kings Auto' AND claim_type = 'INJURY'),
                      {person_id, UNSIGNED2 n := COUNT(GROUP)}, person_id)(n >= 3), person_id);

Marcado := PROJECT(S, TRANSFORM({RECORDOF(S), STRING10 grupo},
                                SELF.grupo := IF(LEFT.person_id IN NoNucleo, 'NUCLEO', 'POPULACAO'); SELF := LEFT));

PorPessoa := TABLE(Marcado, {grupo, person_id, UNSIGNED2 qtd := COUNT(GROUP)}, grupo, person_id);

Comparacao := TABLE(Marcado,
                    {grupo,
                     UNSIGNED4  sinistros    := COUNT(GROUP),
                     DECIMAL5_1 pct_lesao    := COUNT(GROUP, claim_type = 'INJURY') * 100 / COUNT(GROUP),
                     DECIMAL9_2 valor_medio  := AVE(GROUP, amount),
                     UNSIGNED8  total_pago   := SUM(GROUP, IF(status = 'PAID', amount, 0))},
                    grupo, FEW);

Freq := TABLE(PorPessoa, {grupo, DECIMAL5_2 sinistros_por_pessoa := AVE(GROUP, qtd)}, grupo, FEW);

OUTPUT(SORT(Comparacao, grupo), NAMED('GrupoXPopulacao'));
OUTPUT(SORT(Freq, grupo), NAMED('FrequenciaPorPessoa'));
```

Novidade: `SET(recordset, campo)` transforma uma coluna num conjunto, e o conjunto vira filtro com `IN`. Use só quando o conjunto é pequeno (ele vai inteiro para cada nó).

# EXERCICIO: Concentração por oficina

Para cada oficina (ignorando vazias), calcule o percentual do **valor total pago em lesão corporal** de toda a carteira que passou por ela (`DECIMAL5_2 pct_do_total`). Mostre as 3 maiores, com desempate por `repair_shop`.

```ecl thor
IMPORT Treino;
S := Treino.Arquivos.Sinistros;

```

## GABARITO
```ecl thor
IMPORT Treino;
S := Treino.Arquivos.Sinistros;

Lesoes := S(claim_type = 'INJURY' AND status = 'PAID' AND repair_shop <> '');
Total  := SUM(Lesoes, amount);

OUTPUT(TOPN(TABLE(Lesoes, {repair_shop, DECIMAL5_2 pct_do_total := SUM(GROUP, amount) * 100 / Total}, repair_shop, FEW),
            3, -pct_do_total, repair_shop));
```

# EXERCICIO: Intervalo entre sinistros do núcleo

Para as pessoas com 3 ou mais sinistros de lesão na Crash Kings Auto, calcule o intervalo médio, em dias, entre sinistros consecutivos de lesão da mesma pessoa (`DECIMAL7_1 intervalo_medio`). Compare com o mesmo número para as **demais** pessoas com 2 ou mais sinistros de lesão. Mostre uma linha por grupo (`grupo`, `pessoas`, `intervalo_medio`), ordenado por `grupo`.

```ecl thor
IMPORT Treino, STD;
S := Treino.Arquivos.Sinistros;

```

## DICA
`GROUP` por pessoa + `ITERATE` (dia 10) para os dias desde o anterior; descarte o primeiro sinistro de cada pessoa antes de tirar a média.

## GABARITO
```ecl thor
IMPORT Treino, STD;
S := Treino.Arquivos.Sinistros;

Lesoes := S(claim_type = 'INJURY');
NoNucleo := SET(TABLE(Lesoes(TRIM(repair_shop) = 'Crash Kings Auto'), {person_id, UNSIGNED2 n := COUNT(GROUP)}, person_id)(n >= 3), person_id);
ComDuas  := TABLE(Lesoes, {person_id, UNSIGNED2 n := COUNT(GROUP)}, person_id)(n >= 2);

Layout_I := {UNSIGNED4 person_id, UNSIGNED4 claim_date, UNSIGNED4 dias, BOOLEAN primeiro};
Base := JOIN(Lesoes, ComDuas, LEFT.person_id = RIGHT.person_id,
             TRANSFORM(Layout_I, SELF.dias := 0; SELF.primeiro := FALSE; SELF := LEFT), LOOKUP);
G := GROUP(SORT(Base, person_id, claim_date), person_id);
ComDias := UNGROUP(ITERATE(G, TRANSFORM(Layout_I,
                                        SELF.primeiro := LEFT.claim_date = 0;
                                        SELF.dias := IF(LEFT.claim_date = 0, 0, STD.Date.DaysBetween(LEFT.claim_date, RIGHT.claim_date));
                                        SELF := RIGHT)));

Marcado := PROJECT(ComDias(NOT primeiro),
                   TRANSFORM({STRING10 grupo, UNSIGNED4 person_id, UNSIGNED4 dias},
                             SELF.grupo := IF(LEFT.person_id IN NoNucleo, 'NUCLEO', 'DEMAIS'); SELF := LEFT));

OUTPUT(SORT(TABLE(Marcado, {grupo,
                            UNSIGNED4  pessoas := COUNT(GROUP),
                            DECIMAL7_1 intervalo_medio := AVE(GROUP, dias)}, grupo, FEW), grupo));
```
O campo `pessoas` aqui conta **intervalos**, não pessoas distintas: um detalhe que um revisor apontaria. Se quiser o número exato de pessoas, conte `TABLE(Marcado, {grupo, person_id}, grupo, person_id)` por grupo.

# REAL: O relatório para a unidade de investigação

Entregue o relatório final do caso, em um único bloco no Thor, com quatro resultados nomeados. Ele vai ser lido por um investigador que não sabe ECL, então os nomes de campo devem ser autoexplicativos.

1. `Resumo`: uma linha com `oficina`, `pessoas_no_nucleo` (3+ sinistros de lesão na oficina), `sinistros_do_nucleo` (todos os sinistros dessas pessoas, em qualquer oficina), `valor_pago_ao_nucleo` (`UNSIGNED8`) e `pct_da_carteira_de_lesao` (`DECIMAL5_2`: quanto do total pago em lesão de toda a seguradora foi para o núcleo).
2. `Comparacao`: núcleo × resto da população, com `grupo`, `pct_lesao`, `valor_medio` e `sinistros_por_pessoa`.
3. `Suspeitos`: as pessoas do núcleo, uma por linha, com `person_id`, `nome` (first + last), `estado`, `sinistros`, `valor_pago` e `ultimo_sinistro`, ordenadas por `valor_pago` decrescente e `person_id`.
4. `Veiculos`: os veículos usados nos sinistros do núcleo, com `vin`, `marca`, `modelo` e `sinistros_com_o_veiculo`, só os que aparecem em **2 ou mais** sinistros, ordenados por `sinistros_com_o_veiculo` decrescente e `vin`.

```ecl thor
IMPORT Treino;
A := Treino.Arquivos;

```

## DICA
Defina o núcleo uma vez como recordset pequeno (`Nucleo`) e o conjunto (`SET`) dele. Daí: `SinNucleo := A.Sinistros(person_id IN NoNucleo)`. Cada resultado é um TABLE ou JOIN pequeno a partir disso.

## GABARITO
```ecl thor
IMPORT Treino;
A := Treino.Arquivos;

Oficina := 'Crash Kings Auto';

Nucleo   := TABLE(A.Sinistros(TRIM(repair_shop) = Oficina AND claim_type = 'INJURY'),
                  {person_id, UNSIGNED2 n := COUNT(GROUP)}, person_id)(n >= 3);
NoNucleo := SET(Nucleo, person_id);

SinNucleo := A.Sinistros(person_id IN NoNucleo);
LesaoPaga := A.Sinistros(claim_type = 'INJURY' AND status = 'PAID');

// 1) Resumo
PagoNucleo := SUM(SinNucleo(status = 'PAID'), amount);
Resumo := DATASET([{Oficina, COUNT(Nucleo), COUNT(SinNucleo), PagoNucleo,
                    SUM(LesaoPaga(person_id IN NoNucleo), amount) * 100 / SUM(LesaoPaga, amount)}],
                  {STRING25 oficina, UNSIGNED4 pessoas_no_nucleo, UNSIGNED4 sinistros_do_nucleo,
                   UNSIGNED8 valor_pago_ao_nucleo, DECIMAL5_2 pct_da_carteira_de_lesao});

// 2) Comparação
Marcado := PROJECT(A.Sinistros, TRANSFORM({RECORDOF(A.Sinistros), STRING10 grupo},
                                          SELF.grupo := IF(LEFT.person_id IN NoNucleo, 'NUCLEO', 'POPULACAO'); SELF := LEFT));
PorPessoa := TABLE(Marcado, {grupo, person_id, UNSIGNED2 qtd := COUNT(GROUP)}, grupo, person_id);
Indic := TABLE(Marcado, {grupo,
                         DECIMAL5_1 pct_lesao   := COUNT(GROUP, claim_type = 'INJURY') * 100 / COUNT(GROUP),
                         DECIMAL9_2 valor_medio := AVE(GROUP, amount)}, grupo, FEW);
Freq := TABLE(PorPessoa, {grupo, DECIMAL5_2 sinistros_por_pessoa := AVE(GROUP, qtd)}, grupo, FEW);
Comparacao := JOIN(Indic, Freq, LEFT.grupo = RIGHT.grupo,
                   TRANSFORM({STRING10 grupo, DECIMAL5_1 pct_lesao, DECIMAL9_2 valor_medio, DECIMAL5_2 sinistros_por_pessoa},
                             SELF := LEFT; SELF := RIGHT), LOOKUP);

// 3) Suspeitos
PerfilSus := TABLE(SinNucleo, {person_id,
                               UNSIGNED2 sinistros       := COUNT(GROUP),
                               UNSIGNED8 valor_pago      := SUM(GROUP, IF(status = 'PAID', amount, 0)),
                               UNSIGNED4 ultimo_sinistro := MAX(GROUP, claim_date)}, person_id);
Suspeitos := JOIN(PerfilSus, A.Pessoas, LEFT.person_id = RIGHT.id,
                  TRANSFORM({UNSIGNED4 person_id, STRING41 nome, STRING2 estado, UNSIGNED2 sinistros, UNSIGNED8 valor_pago, UNSIGNED4 ultimo_sinistro},
                            SELF.nome   := TRIM(RIGHT.first_name) + ' ' + TRIM(RIGHT.last_name);
                            SELF.estado := RIGHT.state;
                            SELF := LEFT),
                  LEFT OUTER, KEEP(1));

// 4) Veículos
PorVin := TABLE(SinNucleo, {vin, UNSIGNED2 sinistros_com_o_veiculo := COUNT(GROUP)}, vin)(sinistros_com_o_veiculo >= 2);
Veiculos := JOIN(PorVin, A.Veiculos, LEFT.vin = RIGHT.vin,
                 TRANSFORM({STRING17 vin, STRING12 marca, STRING12 modelo, UNSIGNED2 sinistros_com_o_veiculo},
                           SELF.marca := RIGHT.make; SELF.modelo := RIGHT.model; SELF := LEFT),
                 LEFT OUTER, KEEP(1));

OUTPUT(Resumo, NAMED('Resumo'));
OUTPUT(SORT(Comparacao, grupo), NAMED('Comparacao'));
OUTPUT(SORT(Suspeitos, -valor_pago, person_id), NAMED('Suspeitos'));
OUTPUT(SORT(Veiculos, -sinistros_com_o_veiculo, vin), NAMED('Veiculos'));
```
Leia o `Resumo` em voz alta como você leria para o diretor: "algumas dezenas de pessoas, todas com sinistros de lesão repetidos na mesma oficina, receberam uma fatia desproporcional de tudo o que a seguradora pagou em lesão corporal". O `Comparacao` responde ao "pode ser coincidência?", e o `Veiculos` mostra o mesmo carro "sofrendo acidente" várias vezes. Investigador nenhum consegue ignorar isso. Você começou o curso sem saber o que era um RECORD. Hoje você fechou um caso.

# QUIZ

? Qual é o primeiro passo de uma investigação de fraude organizada com dados?
- Listar todas as pessoas com sinistro
+ Encontrar a entidade cujo comportamento foge do padrão das demais em vários indicadores
- Acusar os maiores valores
- Fazer o despray dos arquivos
! Anomalia primeiro; depois delimitação, rede e prova.

? Por que olhar vários indicadores ao mesmo tempo (percentual de lesão, valor médio, frequência)?
- Para o relatório ficar maior
+ Porque um indicador isolado fora da média pode ser acaso; vários divergindo juntos é muito menos provável
- Porque o TABLE exige
- Para reduzir o skew
! Evidências independentes na mesma direção fortalecem a conclusão.

? O que `SET(Nucleo, person_id)` produz?
- Um índice
+ Um conjunto com os valores de person_id do recordset, utilizável com IN
- Um superfile
- Um dataset ordenado
! Bom para conjuntos pequenos, que vão inteiros para cada nó.

? Duas pessoas do núcleo moram no mesmo CEP. O que isso significa?
- Que são cúmplices
+ Que existe uma ligação a ser verificada por um investigador humano
- Que o dado está errado
- Nada
! Ligação é pista, nunca acusação automática.

? Por que comparar o grupo suspeito com a população?
- Para descobrir o estado de residência
+ Para responder objetivamente à objeção "pode ser coincidência"
- Porque o Roxie exige
- Para calcular o skew
! O tamanho da diferença é a prova.

? Num relatório para investigadores, por que usar nomes de campo como `valor_pago_ao_nucleo`?
- Porque nomes curtos não compilam
+ Porque quem lê não conhece o código; o nome precisa explicar o número
- Para economizar disco
- Para o JOIN funcionar
! O consumidor final do resultado é uma pessoa, não um programa.

# FLASHCARDS

Q: Quatro passos de uma investigação de fraude com dados.
A: Anomalia; delimitação; rede; prova.
Q: Como transformar uma coluna em conjunto para filtro?
A: `SET(recordset, campo)` e depois `campo IN conjunto` — só para conjuntos pequenos.
Q: Como montar a rede de ligações entre pessoas?
A: Self-joins por atributo compartilhado (CEP, telefone, sobrenome, veículo) e fecho com LOOP.
Q: O que responde "pode ser coincidência"?
A: A comparação grupo × população em vários indicadores.
Q: Ligação entre pessoas é prova?
A: Não: é pista para análise humana.
