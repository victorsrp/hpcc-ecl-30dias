---
dia: 17
modulo: 4
titulo: JOIN com índice: buscar só o que precisa
horas: 3
---

# MISSAO

> [goggins] Ontem você aprendeu a achar **uma** agulha. Hoje você acha **mil agulhas em mil palheiros diferentes**, de uma vez, sem ler nenhum palheiro inteiro. O JOIN com índice é a operação que o Roxie executa o dia todo. Se você entender isso até o osso, você entende como um produto de dados responde em 80 milissegundos tendo 20 bilhões de registros por trás.

**Hoje você vai:**

- Fazer JOIN em que o lado direito é um índice (*half-keyed join*).
- Encadear índices: de um nome para um id, de um id para os sinistros.
- Usar `LIMIT`, `ATMOST` e `KEEP` para proteger a consulta.
- Conhecer o `FETCH` e o *full-keyed join*, e por que o payload costuma dispensá-los.

Chaves prontas do curso em `Treino.Chaves` (declaradas em `ecl/Treino/Chaves.ecl`):

| Índice | Chave | Payload |
|---|---|---|
| `PorNome` | `lname_clean, fname_clean, state` | `entidade_id, id, dob, city_clean, zip, ssn, phone` |
| `PorSsn` | `ssn` | `entidade_id, id` |
| `PorFone` | `phone` | `entidade_id, id` |
| `PorEntidade` | `entidade_id` | `id, first_name, last_name, dob, ssn, street, city, state, zip, phone, email` |
| `SinistrosPorPessoa` | `person_id` | `claim_id, claim_date, claim_type, amount, repair_shop, status, vin` |
| `VeiculosPorPessoa` | `person_id` | `vin, make, model, year, plate, state` |

Nos sinistros e veículos, `person_id` é o `entidade_id` da pessoa.

# PILULA: Half-keyed join: a lista de compras e o supermercado

> [crianca] Você tem uma lista com 5 itens e vai a um supermercado gigante. Jeito bobo: andar por **todos** os corredores olhando prateleira por prateleira. Jeito esperto: olhar a placa de cada corredor ("massas", "limpeza") e ir **direto** nos 5 lugares. As placas são o índice. Sua lista é a tabela da esquerda.

> [tecnico] Quando o lado **direito** de um JOIN é um índice e a condição usa os campos de chave, o motor não lê o índice inteiro: para **cada registro da esquerda**, ele faz uma busca na árvore. Isso é o *half-keyed join*. O custo é proporcional ao tamanho da **esquerda**, não ao da direita. Dez registros à esquerda contra um índice de 10 bilhões: dez buscas. Marque a parte indexada da condição com `KEYED(...)` para garantir que é isso mesmo que acontece.

```ecl
IMPORT Treino;
K := Treino.Chaves;

// "Lista de compras": três pessoas que queremos investigar
Alvos := DATASET([{533}, {520}, {1}], {UNSIGNED4 pessoa});

Layout_Saida := RECORD
  UNSIGNED4 pessoa;
  UNSIGNED4 claim_id;
  UNSIGNED4 claim_date;
  STRING10  claim_type;
  UNSIGNED4 amount;
  STRING25  repair_shop;
END;

Sinistros := JOIN(Alvos, K.SinistrosPorPessoa,
                  KEYED(LEFT.pessoa = RIGHT.person_id),
                  TRANSFORM(Layout_Saida, SELF := LEFT; SELF := RIGHT));

OUTPUT(SORT(Sinistros, pessoa, claim_date));
```

Três buscas na árvore; o arquivo de 30 mil sinistros não foi lido. Rode no hthor e olhe o tempo.

# PILULA: Encadeando índices

> [tecnico] Uma consulta real raramente termina no primeiro índice. O padrão é uma **corrente**: o índice de busca devolve um identificador; esse identificador é a chave do próximo índice. Cada elo é um half-keyed join pequeno.

```ecl
IMPORT Treino;
K := Treino.Chaves;

// Elo 1: do nome ao entidade_id (um por pessoa real)
Achados  := K.PorNome(KEYED(lname_clean = 'KING' AND fname_clean = 'CHARLES'), WILD(state));
Pessoas  := DEDUP(SORT(TABLE(Achados, {entidade_id, lname_clean, fname_clean, state}), entidade_id), entidade_id);

// Elo 2: do entidade_id aos veículos
Layout_PV := RECORD
  UNSIGNED4 entidade_id;
  STRING2   state;
  STRING17  vin;
  STRING12  make;
  STRING12  model;
  UNSIGNED2 year;
END;

Veiculos := JOIN(Pessoas, K.VeiculosPorPessoa,
                 KEYED(LEFT.entidade_id = RIGHT.person_id),
                 TRANSFORM(Layout_PV, SELF.state := LEFT.state; SELF := LEFT; SELF := RIGHT));

OUTPUT(Pessoas,  NAMED('PessoasEncontradas'));
OUTPUT(Veiculos, NAMED('VeiculosDelas'));
```

> [real] Por que o `DEDUP` por `entidade_id`? O índice de nomes tem uma linha por **cadastro**, e a mesma pessoa pode ter três cadastros. Sem deduplicar, cada veículo sairia três vezes. Em toda consulta de pessoa, o primeiro passo depois da busca é reduzir a **entidades distintas**. É para isso que o vínculo do dia 15 existe.

# PILULA: Proteções: LIMIT, ATMOST, KEEP

> [crianca] Na lanchonete, alguém pede "um de cada coisa do cardápio, vezes mil". Se o atendente tentar fazer, a cozinha trava e ninguém mais é atendido. O atendente esperto diz: "desculpa, pedidos acima de 50 itens eu não aceito; diminua". Uma consulta online precisa desse atendente.

> [tecnico] Numa consulta online, uma busca ampla demais ("todos os SMITH") não pode consumir o servidor. As mesmas opções do dia 8 viram cinto de segurança:

| Opção | Onde | Comportamento |
|---|---|---|
| `LIMIT(recordset, n)` | Leitura de índice ou qualquer recordset | Falha a consulta se passar de `n` registros |
| `LIMIT(recordset, n, SKIP)` | Idem | Devolve vazio em vez de falhar |
| `LIMIT(recordset, n, FAIL(código, 'mensagem'))` | Idem | Falha com a **sua** mensagem de erro |
| `CHOOSEN(recordset, n)` | Idem | Corta nos `n` primeiros, sem erro |
| `JOIN(..., LIMIT(n))` / `ATMOST(n)` / `KEEP(n)` | JOIN com índice | Por registro da esquerda: falha / ignora / corta |

```ecl
IMPORT Treino;
K := Treino.Chaves.PorNome;

// Busca estreita: passa
OUTPUT(COUNT(LIMIT(K(KEYED(lname_clean = 'NGUYEN' AND fname_clean = 'MARY')), 100, SKIP)), NAMED('Estreita'));

// Busca ampla: mais de 100 registros; com SKIP volta vazio em vez de derrubar
OUTPUT(COUNT(LIMIT(K(KEYED(lname_clean = 'NGUYEN')), 100, SKIP)), NAMED('AmplaComSkip'));

// CHOOSEN corta sem reclamar: útil para "mostre os 20 primeiros"
OUTPUT(COUNT(CHOOSEN(K(KEYED(lname_clean = 'NGUYEN')), 20)), NAMED('AmplaCortada'));
```

Com mensagem própria, que é o que o cliente do serviço recebe:

```ecl erro
IMPORT Treino;
K := Treino.Chaves.PorNome;
OUTPUT(LIMIT(K(KEYED(lname_clean = 'NGUYEN')), 100, FAIL(301, 'Busca ampla demais: informe tambem o primeiro nome ou o estado')));
```

# PILULA: FETCH e full-keyed join

> [tecnico] E quando o campo que você precisa **não** está no payload? Todo índice guarda, para cada entrada, a posição do registro original no arquivo base. `FETCH(arquivo_base, indice_filtrado, RIGHT.posicao)` vai ao arquivo e busca os registros completos; o *full-keyed join* (`JOIN(esq, arquivo_base, condição, transform, KEYED(indice))`) faz o mesmo dentro de um JOIN. Os dois custam **uma leitura extra em disco por resultado**. Por isso o projeto moderno é: ponha no payload tudo o que a consulta devolve, e o FETCH deixa de ser necessário. Você vai encontrar FETCH em código antigo; saiba ler, prefira payload.

A forma mais limpa de "ir buscar o resto" é outro half-keyed join, contra um índice cuja chave é o id e cujo payload é o registro completo, como o `PorEntidade`:

```ecl
IMPORT Treino;
K := Treino.Chaves;

// Do SSN ao cadastro completo, em dois saltos de índice
PorSsn := K.PorSsn(KEYED(ssn = '987903038'));

Layout_Cad := RECORDOF(K.PorEntidade);

Completo := JOIN(PorSsn, K.PorEntidade,
                 KEYED(LEFT.entidade_id = RIGHT.entidade_id),
                 TRANSFORM(Layout_Cad, SELF := RIGHT),
                 LIMIT(100));
OUTPUT(Completo);
```

# EXERCICIO: Sinistros de uma lista de pessoas

Dada a lista de pessoas `[504, 505, 9000]`, traga pelo índice `SinistrosPorPessoa` os sinistros com status `PAID`, com os campos `pessoa`, `claim_id`, `claim_type`, `amount`. Ordene por `pessoa, claim_id`.

```ecl
IMPORT Treino;
K := Treino.Chaves;
Alvos := DATASET([{504}, {505}, {9000}], {UNSIGNED4 pessoa});

```

## DICA
A parte da chave vai em `KEYED(...)`; o filtro de status é uma condição a mais, fora do KEYED: `KEYED(LEFT.pessoa = RIGHT.person_id) AND RIGHT.status = 'PAID'`.

## GABARITO
```ecl
IMPORT Treino;
K := Treino.Chaves;
Alvos := DATASET([{504}, {505}, {9000}], {UNSIGNED4 pessoa});

J := JOIN(Alvos, K.SinistrosPorPessoa,
          KEYED(LEFT.pessoa = RIGHT.person_id) AND RIGHT.status = 'PAID',
          TRANSFORM({UNSIGNED4 pessoa, UNSIGNED4 claim_id, STRING10 claim_type, UNSIGNED4 amount}, SELF := LEFT; SELF := RIGHT));
OUTPUT(SORT(J, pessoa, claim_id));
```
`status` está no payload, não na chave: o motor acha pela árvore os sinistros da pessoa e descarta os que não são `PAID` depois de ler. Funciona bem porque cada pessoa tem poucos sinistros.

# EXERCICIO: De um telefone aos veículos

Dado o telefone `4748367796`, descubra a pessoa pelo índice `PorFone` e liste os veículos dela (`vin, make, model, year`) pelo índice `VeiculosPorPessoa`. Garanta que cada veículo aparece uma vez só. Ordene por `vin`.

```ecl
IMPORT Treino;
K := Treino.Chaves;

```

## GABARITO
```ecl
IMPORT Treino;
K := Treino.Chaves;

Donos := DEDUP(SORT(TABLE(K.PorFone(KEYED(phone = '4748367796')), {entidade_id}), entidade_id), entidade_id);

Veiculos := JOIN(Donos, K.VeiculosPorPessoa,
                 KEYED(LEFT.entidade_id = RIGHT.person_id),
                 TRANSFORM({STRING17 vin, STRING12 make, STRING12 model, UNSIGNED2 year}, SELF := RIGHT));
OUTPUT(SORT(Veiculos, vin));
```

# EXERCICIO: Busca protegida

Escreva uma busca por sobrenome `LEE` no estado `NY` (qualquer primeiro nome) que devolva **no máximo 25** linhas ordenadas por `fname_clean, id`, e que **falhe com a mensagem** `Refine a busca` se a leitura do índice encontrar mais de 500 registros.

```ecl
IMPORT Treino;
K := Treino.Chaves.PorNome;

```

## GABARITO
```ecl
IMPORT Treino;
K := Treino.Chaves.PorNome;

Lidos := LIMIT(K(KEYED(lname_clean = 'LEE'), WILD(fname_clean), KEYED(state = 'NY')), 500, FAIL(301, 'Refine a busca'));
OUTPUT(CHOOSEN(SORT(Lidos, fname_clean, id), 25));
```
Duas camadas com funções diferentes: `LIMIT` protege o **servidor** (teto de leitura); `CHOOSEN` formata a **resposta** (tamanho de página).

# REAL: Ficha rápida do segurado

O call center da seguradora atende um cliente que informa nome, sobrenome e estado. O atendente precisa ver, em uma tela, **quem é a pessoa e o resumo de sinistros dela**. Escreva a lógica usando só índices.

Para a busca `fname_clean = 'MARY'`, `lname_clean = 'JONES'`, `state = 'TX'`:

1. Leia `PorNome` com `KEYED`, protegendo com `LIMIT` de 200 e `SKIP`.
2. Reduza a entidades distintas, mantendo `entidade_id, fname_clean, lname_clean, state, city_clean, dob`.
3. Com um half-keyed join em `SinistrosPorPessoa`, calcule para cada pessoa: `UNSIGNED2 qtd_sinistros`, `UNSIGNED4 total_pago` (só status `PAID`) e `UNSIGNED4 ultimo_sinistro` (maior `claim_date`). Pessoas sem sinistro devem aparecer com zeros.
4. Entregue a lista ordenada por `total_pago` decrescente e `entidade_id`.

```ecl
IMPORT Treino;
K := Treino.Chaves;

```

## DICA
Uma forma simples: JOIN `LEFT OUTER` das pessoas com o índice de sinistros (uma linha por sinistro, ou uma linha vazia para quem não tem) e depois um `TABLE` agrupado por pessoa. Para contar só sinistros reais use `COUNT(GROUP, claim_id <> 0)`, e para o pago `SUM(GROUP, IF(status = 'PAID', amount, 0))`.

## GABARITO
```ecl
IMPORT Treino;
K := Treino.Chaves;

Lidos   := LIMIT(K.PorNome(KEYED(lname_clean = 'JONES' AND fname_clean = 'MARY' AND state = 'TX')), 200, SKIP);
Pessoas := DEDUP(SORT(TABLE(Lidos, {entidade_id, fname_clean, lname_clean, state, city_clean, dob}), entidade_id), entidade_id);

Layout_PS := RECORD
  RECORDOF(Pessoas);
  UNSIGNED4 claim_id;
  UNSIGNED4 claim_date;
  UNSIGNED4 amount;
  STRING6   status;
END;

ComSin := JOIN(Pessoas, K.SinistrosPorPessoa,
               KEYED(LEFT.entidade_id = RIGHT.person_id),
               TRANSFORM(Layout_PS, SELF := LEFT; SELF := RIGHT),
               LEFT OUTER, LIMIT(1000));

Ficha := TABLE(ComSin,
               {entidade_id, fname_clean, lname_clean, state, city_clean, dob,
                UNSIGNED2 qtd_sinistros   := COUNT(GROUP, claim_id <> 0),
                UNSIGNED4 total_pago      := SUM(GROUP, IF(status = 'PAID', amount, 0)),
                UNSIGNED4 ultimo_sinistro := MAX(GROUP, claim_date)},
               entidade_id, fname_clean, lname_clean, state, city_clean, dob, FEW);

OUTPUT(SORT(Ficha, -total_pago, entidade_id));
```
Conte o trabalho que o motor fez: uma descida na árvore de nomes, e uma descida na árvore de sinistros para cada pessoa encontrada. Nenhum arquivo foi varrido. Essa consulta teria o mesmo tempo de resposta se o cadastro tivesse 300 milhões de pessoas. No topo da lista aparece alguém com muitos sinistros altos: a Mary Jones do Texas é a pessoa 533, velha conhecida do dia 10. Amanhã você publica uma consulta dessas no Roxie e chama por HTTP.

# QUIZ

? O que caracteriza um half-keyed join?
- As duas tabelas são ordenadas e mescladas
+ O lado direito é um índice, e para cada registro da esquerda é feita uma busca na árvore
- O JOIN usa metade dos nós do cluster
- O lado esquerdo é um índice
! O custo acompanha o tamanho da esquerda, não o do índice.

? 50 registros à esquerda, índice com 8 bilhões de entradas à direita, half-keyed join. Quantas buscas na árvore?
- 8 bilhões
+ 50
- 1
- 400 bilhões
! Uma busca por registro da esquerda.

? Por que deduplicar por `entidade_id` depois de ler o índice de nomes?
- Porque o índice tem linhas repetidas por erro
+ Porque há uma linha por cadastro e a mesma pessoa pode ter vários; sem isso os dados seguintes saem multiplicados
- Para o resultado sair ordenado
- Porque o KEYED exige
! Primeiro passo de toda consulta de pessoa: reduzir a entidades distintas.

? Qual a diferença entre `LIMIT(ds, 100)` e `CHOOSEN(ds, 100)`?
- Nenhuma
+ LIMIT falha (ou devolve vazio com SKIP) se houver mais de 100; CHOOSEN devolve os 100 primeiros
- CHOOSEN falha e LIMIT corta
- LIMIT só funciona no Thor
! LIMIT é proteção; CHOOSEN é corte.

? O que `LIMIT(K(...), 500, FAIL(301, 'Refine a busca'))` faz quando a leitura passa de 500?
- Devolve os 500 primeiros
- Devolve vazio
+ Encerra a consulta com o erro 301 e a mensagem informada
- Ignora o limite
! É o que o sistema cliente recebe como resposta de erro.

? Quando o FETCH é necessário?
- Sempre que se usa um índice
+ Quando a consulta precisa de campos que não estão na chave nem no payload
- Quando o índice tem payload completo
- Só no Thor
! Com payload bem projetado, a ida ao arquivo base deixa de existir.

? Em `KEYED(LEFT.pessoa = RIGHT.person_id) AND RIGHT.status = 'PAID'`, como o filtro de status é aplicado?
- Pela árvore do índice
+ Depois da busca: o motor lê as entradas da pessoa e descarta as que não são PAID
- Antes da busca, no lado esquerdo
- Ele é ignorado
! `status` é payload. Só os campos de chave estreitam a busca na árvore.

# FLASHCARDS

Q: Forma do half-keyed join.
A: `JOIN(esquerda, Indice, KEYED(LEFT.k = RIGHT.chave), TRANSFORM(...), LIMIT(n))`
Q: De que depende o custo de um half-keyed join?
A: Do número de registros da esquerda (uma busca na árvore para cada um).
Q: Corrente típica de uma consulta de pessoa.
A: Índice de busca → entidade_id distinto → índices por entidade (cadastros, sinistros, veículos).
Q: LIMIT, LIMIT SKIP, LIMIT FAIL, CHOOSEN.
A: Falha; devolve vazio; falha com sua mensagem; corta nos N primeiros.
Q: Por que evitar FETCH?
A: É uma leitura extra em disco por resultado; payload resolve sem ela.
Q: Onde vai o filtro por campo de payload em um JOIN com índice?
A: Fora do KEYED: `KEYED(...) AND RIGHT.campo = valor` (filtra depois de ler).
