---
dia: 19
modulo: 4
titulo: Projeto de consultas Roxie
horas: 3.5
---

# MISSAO

> [goggins] Ontem você publicou um serviço. Parabéns, por 10 segundos. Agora a pergunta que importa: ele aguenta ser usado por gente de verdade? Gente que digita só o telefone. Gente que digita lixo. Gente que busca "Smith" sem mais nada às 9 da manhã de segunda. Hoje você aprende a construir consulta que **não quebra** e que devolve uma resposta que alguém consegue usar.

**Hoje você vai:**

- Escolher o melhor caminho de busca conforme os parâmetros recebidos.
- Montar respostas aninhadas (pessoa + veículos + sinistros).
- Ordenar resultados por relevância.
- Tratar erro e entrada inválida.
- Entender versões de consulta, superkeys e pacotes.

Hoje os blocos usam `#STORED` no topo para simular a entrada, assim você testa com **▶ Rodar** sem publicar. Para publicar, apague as linhas `#STORED`.

# PILULA: Vários caminhos de busca

> [crianca] Para achar um amigo na escola você pode ir pela **sala** dele, pelo **armário** dele ou perguntar na **secretaria** pelo nome. Se você sabe o número do armário, é o caminho mais curto: vai direto. Só pergunta pelo nome na secretaria se não tiver nada melhor.

> [tecnico] Uma boa consulta de pessoa aceita vários identificadores e usa **o mais seletivo que foi informado**: SSN (praticamente único) antes de telefone, telefone antes de nome. Cada caminho lê um índice diferente e todos terminam no mesmo formato: uma lista de `entidade_id`. `MAP` e `IF` funcionam com recordsets, desde que todos tenham o mesmo layout; só o ramo escolhido é executado.

```ecl
#STORED('Telefone', '4748367796');

IMPORT Treino, STD;
K := Treino.Chaves;

STRING9  Ssn       := '' : STORED('Ssn');
STRING20 Telefone  := '' : STORED('Telefone');
STRING20 Sobrenome := '' : STORED('Sobrenome');
STRING20 Nome      := '' : STORED('Nome');

S := STD.Str.Filter(Ssn, '0123456789');
F := STD.Str.Filter(Telefone, '0123456789');
L := STD.Str.ToUpperCase(STD.Str.CleanSpaces(Sobrenome));
N := STD.Str.ToUpperCase(STD.Str.CleanSpaces(Nome));

Layout_Id := {UNSIGNED4 entidade_id};

PeloSsn  := PROJECT(LIMIT(K.PorSsn(KEYED(ssn = S)),    100, SKIP), Layout_Id);
PeloFone := PROJECT(LIMIT(K.PorFone(KEYED(phone = F)), 100, SKIP), Layout_Id);
PeloNome := PROJECT(LIMIT(K.PorNome(KEYED(lname_clean = L), KEYED(N = '' OR fname_clean = N)),
                          500, FAIL(301, 'Busca ampla demais')), Layout_Id);

Caminho := MAP(S <> '' => 'SSN', F <> '' => 'TELEFONE', L <> '' => 'NOME', 'NENHUM');

Ids := DEDUP(SORT(MAP(S <> '' => PeloSsn,
                      F <> '' => PeloFone,
                      L <> '' => PeloNome,
                      DATASET([], Layout_Id)), entidade_id), entidade_id);

OUTPUT(Caminho, NAMED('CaminhoUsado'));
OUTPUT(Ids,     NAMED('Entidades'));
```

Troque a primeira linha por `#STORED('Sobrenome', 'nguyen');` e depois por `#STORED('Ssn', '987-90-3038');` e veja o caminho mudar. `DATASET([], Layout)` é um recordset vazio: a resposta para "não informou nada".

# PILULA: Resposta aninhada: o dossiê

> [tecnico] O cliente do serviço quer **uma chamada, tudo de uma vez**. A resposta ideal é um registro por pessoa com os filhos dentro (dia 11). No Roxie, a forma mais direta é ler o índice **dentro do TRANSFORM**: para cada pessoa, o campo filho recebe uma leitura `KEYED` do índice correspondente. Cada leitura tem seu próprio `LIMIT`.

```ecl
IMPORT Treino;
K := Treino.Chaves;

Ids := DATASET([{533}, {13468}], {UNSIGNED4 entidade_id});

Layout_Veic := {STRING17 vin, STRING12 make, STRING12 model, UNSIGNED2 year};
Layout_Sin  := {UNSIGNED4 claim_id, UNSIGNED4 claim_date, STRING10 claim_type, UNSIGNED4 amount, STRING6 status};

Layout_Dossie := RECORD
  UNSIGNED4 entidade_id;
  STRING20  first_name;
  STRING20  last_name;
  UNSIGNED4 dob;
  STRING20  city;
  STRING2   state;
  UNSIGNED2 qtd_cadastros;
  UNSIGNED4 total_sinistros;
  DATASET(Layout_Veic) veiculos;
  DATASET(Layout_Sin)  sinistros;
END;

Layout_Dossie Montar(RECORDOF(Ids) L) := TRANSFORM
  Cads  := LIMIT(K.PorEntidade(KEYED(entidade_id = L.entidade_id)), 100, SKIP);
  Princ := SORT(Cads, id)[1];                       // o cadastro mais antigo é o "principal"
  Sins  := LIMIT(K.SinistrosPorPessoa(KEYED(person_id = L.entidade_id)), 500, SKIP);
  SELF.entidade_id     := L.entidade_id;
  SELF.first_name      := Princ.first_name;
  SELF.last_name       := Princ.last_name;
  SELF.dob             := Princ.dob;
  SELF.city            := Princ.city;
  SELF.state           := Princ.state;
  SELF.qtd_cadastros   := COUNT(Cads);
  SELF.total_sinistros := SUM(Sins, amount);
  SELF.veiculos        := PROJECT(LIMIT(K.VeiculosPorPessoa(KEYED(person_id = L.entidade_id)), 100, SKIP), Layout_Veic);
  SELF.sinistros       := PROJECT(CHOOSEN(SORT(Sins, -claim_date), 20), Layout_Sin);
END;

OUTPUT(PROJECT(Ids, Montar(LEFT)), NAMED('Dossie'));
```

> [real] Em serviços de grande volume, esse dossiê já vem **pronto do Thor**: o build noturno denormaliza tudo e grava um índice cuja chave é o id e cujo payload é o registro aninhado inteiro. O Roxie faz uma leitura e devolve. Montar na hora (como acima) é mais flexível; pré-montar é mais rápido. A decisão é sempre a mesma balança: custo de build contra latência de consulta.

# PILULA: Ordenar por relevância

> [tecnico] Uma busca por nome devolve vários candidatos. A ordem em que aparecem é parte do produto: o mais provável primeiro. O padrão é calcular um **score de relevância** para cada candidato comparando-o com o que foi digitado, exatamente como os pontos do dia 15, e ordenar por ele.

```ecl
#STORED('Sobrenome', 'jones');
#STORED('Nome', 'mary');
#STORED('Estado', 'tx');
#STORED('Cidade', 'houston');

IMPORT Treino, STD;
K := Treino.Chaves;

STRING20 Sobrenome := '' : STORED('Sobrenome');
STRING20 Nome      := '' : STORED('Nome');
STRING2  Estado    := '' : STORED('Estado');
STRING20 Cidade    := '' : STORED('Cidade');

L := STD.Str.ToUpperCase(STD.Str.CleanSpaces(Sobrenome));
N := STD.Str.ToUpperCase(STD.Str.CleanSpaces(Nome));
E := STD.Str.ToUpperCase(Estado);
C := STD.Str.ToUpperCase(STD.Str.CleanSpaces(Cidade));

// Busca larga pelo sobrenome; o resto vira pontuação em vez de filtro
Lidos := LIMIT(K.PorNome(KEYED(lname_clean = L)), 2000, FAIL(301, 'Busca ampla demais'));

Layout_R := RECORD
  UNSIGNED4 entidade_id;
  STRING20  fname_clean;
  STRING20  lname_clean;
  STRING20  city_clean;
  STRING2   state;
  UNSIGNED1 relevancia;
END;

Pontuado := PROJECT(Lidos,
                    TRANSFORM(Layout_R,
                              SELF.relevancia := 40
                                               + MAP(N = '' => 0, LEFT.fname_clean = N => 30,
                                                     LEFT.fname_clean[1] = N[1] => 10, 0)
                                               + IF(E <> '' AND LEFT.state = E, 20, 0)
                                               + IF(C <> '' AND LEFT.city_clean = C, 10, 0);
                              SELF := LEFT));

// Um por pessoa (fica o cadastro de maior relevância), depois os melhores primeiro
Melhor := DEDUP(SORT(Pontuado, entidade_id, -relevancia), entidade_id);
OUTPUT(CHOOSEN(SORT(Melhor, -relevancia, entidade_id), 10), NAMED('Resultado'));
```

Filtrar com `KEYED` é mais barato; pontuar é mais tolerante (quem mudou de cidade ainda aparece, só mais abaixo). O projeto real mistura os dois: o que é certo vira filtro, o que é incerto vira ponto.

# PILULA: Erros e entrada inválida

> [tecnico] Três situações diferentes pedem três respostas diferentes:

| Situação | Resposta | Como |
|---|---|---|
| Não achou nada | Resposta normal e vazia | `LIMIT(..., SKIP)`; nenhum erro |
| Busca ampla demais | Erro com orientação | `LIMIT(..., n, FAIL(código, 'mensagem'))` |
| Entrada inválida ou ausente | Erro imediato, antes de ler qualquer índice | `IF(condição, FAIL(código, 'mensagem'))` como ação, ou `ASSERT` |

```ecl erro
STRING9 Ssn := '' : STORED('Ssn');
STRING20 Sobrenome := '' : STORED('Sobrenome');

EntradaOk := Ssn <> '' OR Sobrenome <> '';

IF(NOT EntradaOk, FAIL(400, 'Informe ao menos Ssn ou Sobrenome'));
OUTPUT('ok', NAMED('Status'));
```

> [real] Códigos de erro estáveis fazem parte do contrato. O sistema do cliente trata `301` mostrando "refine sua busca" para o usuário e `400` como defeito de integração. Mensagem genérica de "erro interno" significa telefone tocando no suporte.

# PILULA: Versões, superkeys e pacotes

Como se atualiza um serviço que não pode parar?

- **Versões da consulta.** Cada publicação com o mesmo nome cria `nome.1`, `nome.2`... e um *alias* (o nome puro) aponta para a versão **ativa**. Publicar uma versão nova e ativá-la é instantâneo; voltar para a anterior também. Veja em **Published Queries** no ECL Watch.
- **Superkeys.** O equivalente do superfile (dia 14) para índices. A consulta é compilada apontando para um nome fixo (`~prod::key::pessoa_nome`), que é um superfile contendo o índice datado do build mais recente.
- **Pacotes (*packagemaps*).** Um arquivo de configuração no Roxie que diz, para cada superkey, quais subfiles valem agora. Trocar o dado de produção é publicar um pacote novo: **nenhuma consulta é recompilada**, e o Roxie passa a ler os índices novos.

> [real] O ciclo diário na LexisNexis: o Thor constrói os índices com a data no nome, os controles de qualidade rodam, os arquivos são copiados para o Roxie, e um pacote novo é ativado. As consultas nunca souberam que o dado mudou. Se algo estiver errado, reativa-se o pacote de ontem. É o padrão de gerações do dia 14 levado para o lado da entrega.

# EXERCICIO: Caminho por SSN ou por telefone

Escreva uma consulta com os parâmetros `Ssn` e `Telefone`. Se vier `Ssn`, busca por ele; senão, pelo telefone. Devolva `Entidades` (ids distintos) e `Caminho` (`'SSN'`, `'TELEFONE'` ou `'NENHUM'`). Teste com `#STORED('Ssn', '987903038');`.

```ecl
#STORED('Ssn', '987903038');
IMPORT Treino, STD;
K := Treino.Chaves;

```

## GABARITO
```ecl
#STORED('Ssn', '987903038');
IMPORT Treino, STD;
K := Treino.Chaves;

STRING9  Ssn      := '' : STORED('Ssn');
STRING20 Telefone := '' : STORED('Telefone');

S := STD.Str.Filter(Ssn, '0123456789');
F := STD.Str.Filter(Telefone, '0123456789');

Layout_Id := {UNSIGNED4 entidade_id};
PeloSsn  := PROJECT(LIMIT(K.PorSsn(KEYED(ssn = S)),    100, SKIP), Layout_Id);
PeloFone := PROJECT(LIMIT(K.PorFone(KEYED(phone = F)), 100, SKIP), Layout_Id);

Ids := MAP(S <> '' => PeloSsn, F <> '' => PeloFone, DATASET([], Layout_Id));

OUTPUT(DEDUP(SORT(Ids, entidade_id), entidade_id), NAMED('Entidades'));
OUTPUT(MAP(S <> '' => 'SSN', F <> '' => 'TELEFONE', 'NENHUM'), NAMED('Caminho'));
```

# EXERCICIO: Pessoa com seus veículos

Para as entidades `[1, 504]`, devolva um registro por pessoa com `entidade_id`, `UNSIGNED2 qtd_veiculos` e o filho `veiculos` (`vin, make, model, year`), lendo `VeiculosPorPessoa` dentro do TRANSFORM.

```ecl
IMPORT Treino;
K := Treino.Chaves;
Ids := DATASET([{1}, {504}], {UNSIGNED4 entidade_id});

```

## GABARITO
```ecl
IMPORT Treino;
K := Treino.Chaves;
Ids := DATASET([{1}, {504}], {UNSIGNED4 entidade_id});

Layout_Veic := {STRING17 vin, STRING12 make, STRING12 model, UNSIGNED2 year};
Layout_P    := {UNSIGNED4 entidade_id, UNSIGNED2 qtd_veiculos, DATASET(Layout_Veic) veiculos};

OUTPUT(PROJECT(Ids,
               TRANSFORM(Layout_P,
                         V := PROJECT(LIMIT(K.VeiculosPorPessoa(KEYED(person_id = LEFT.entidade_id)), 100, SKIP), Layout_Veic);
                         SELF.qtd_veiculos := COUNT(V);
                         SELF.veiculos     := V;
                         SELF := LEFT)));
```

# REAL: Consulta de dossiê com busca flexível

Junte tudo. Escreva `dossie_v1`, o serviço que o analista de fraude usa.

**Entrada**: `Ssn`, `Telefone`, `Sobrenome`, `Nome`, `Estado` (todos texto, padrão vazio).

**Regras**:

1. Se nenhum de `Ssn`, `Telefone`, `Sobrenome` for informado: erro 400, `Informe Ssn, Telefone ou Sobrenome`.
2. Caminho de busca: SSN, senão telefone, senão nome (sobrenome obrigatório; nome e estado opcionais, na chave). Busca por nome com mais de 500 leituras: erro 301.
3. No máximo 20 entidades na resposta.
4. **Saída `Dossies`**: por entidade, `entidade_id`, `first_name`, `last_name`, `state` (do cadastro de menor `id`), `UNSIGNED2 qtd_sinistros`, `UNSIGNED4 total_pago`, `STRING10 risco` e o filho `sinistros` (os 5 mais recentes: `claim_date, claim_type, amount, repair_shop`). Ordenado por `total_pago` decrescente e `entidade_id`.
5. `risco`: `'ALTO'` se `total_pago >= 150000` ou se tiver 4 ou mais sinistros `INJURY`; `'MEDIO'` se `total_pago >= 40000`; senão `'BAIXO'`.
6. **Saída `Total`**: quantas entidades foram encontradas (antes do corte de 20).

Teste com as três entradas: `#STORED('Sobrenome','jones'); #STORED('Nome','mary'); #STORED('Estado','tx');`, depois só `Telefone`, depois nada (tem que dar o erro 400). Quando estiver certo, apague os `#STORED` e publique.

```ecl
#STORED('Sobrenome', 'jones');
#STORED('Nome', 'mary');
#STORED('Estado', 'tx');
// consulta: dossie_v1
IMPORT Treino, STD;
K := Treino.Chaves;

```

## DICA
Monte em quatro partes: (1) parâmetros e limpeza; (2) `Ids` com MAP, depois DEDUP; (3) `Layout_Dossie` e o TRANSFORM que lê `PorEntidade` e `SinistrosPorPessoa`; (4) ações: o `IF(..., FAIL(...))` primeiro, depois os dois OUTPUT. Para o corte: calcule o dossiê de todas as entidades encontradas (o LIMIT de 500 já protege), ordene e aplique `CHOOSEN(..., 20)`.

## GABARITO
```ecl
#STORED('Sobrenome', 'jones');
#STORED('Nome', 'mary');
#STORED('Estado', 'tx');
// consulta: dossie_v1
IMPORT Treino, STD;
K := Treino.Chaves;

STRING9  Ssn       := '' : STORED('Ssn');
STRING20 Telefone  := '' : STORED('Telefone');
STRING20 Sobrenome := '' : STORED('Sobrenome');
STRING20 Nome      := '' : STORED('Nome');
STRING2  Estado    := '' : STORED('Estado');

S := STD.Str.Filter(Ssn, '0123456789');
F := STD.Str.Filter(Telefone, '0123456789');
L := STD.Str.ToUpperCase(STD.Str.CleanSpaces(Sobrenome));
N := STD.Str.ToUpperCase(STD.Str.CleanSpaces(Nome));
E := STD.Str.ToUpperCase(Estado);

// Caminhos de busca
Layout_Id := {UNSIGNED4 entidade_id};
PeloSsn  := PROJECT(LIMIT(K.PorSsn(KEYED(ssn = S)),    100, SKIP), Layout_Id);
PeloFone := PROJECT(LIMIT(K.PorFone(KEYED(phone = F)), 100, SKIP), Layout_Id);
PeloNome := PROJECT(LIMIT(K.PorNome(KEYED(lname_clean = L),
                                    KEYED(N = '' OR fname_clean = N),
                                    KEYED(E = '' OR state = E)),
                          500, FAIL(301, 'Busca ampla demais: informe nome e estado')), Layout_Id);

Ids := DEDUP(SORT(MAP(S <> '' => PeloSsn, F <> '' => PeloFone, L <> '' => PeloNome, DATASET([], Layout_Id)),
                  entidade_id), entidade_id);

// Dossiê
Layout_Sin := {UNSIGNED4 claim_date, STRING10 claim_type, UNSIGNED4 amount, STRING25 repair_shop};

Layout_Dossie := RECORD
  UNSIGNED4 entidade_id;
  STRING20  first_name;
  STRING20  last_name;
  STRING2   state;
  UNSIGNED2 qtd_sinistros;
  UNSIGNED4 total_pago;
  STRING10  risco;
  DATASET(Layout_Sin) sinistros;
END;

Layout_Dossie Montar(Layout_Id I) := TRANSFORM
  Princ := SORT(LIMIT(K.PorEntidade(KEYED(entidade_id = I.entidade_id)), 100, SKIP), id)[1];
  Sinis := LIMIT(K.SinistrosPorPessoa(KEYED(person_id = I.entidade_id)), 500, SKIP);
  Pago  := SUM(Sinis(status = 'PAID'), amount);
  SELF.entidade_id   := I.entidade_id;
  SELF.first_name    := Princ.first_name;
  SELF.last_name     := Princ.last_name;
  SELF.state         := Princ.state;
  SELF.qtd_sinistros := COUNT(Sinis);
  SELF.total_pago    := Pago;
  SELF.risco         := MAP(Pago >= 150000 OR COUNT(Sinis(claim_type = 'INJURY')) >= 4 => 'ALTO',
                            Pago >= 40000 => 'MEDIO',
                            'BAIXO');
  SELF.sinistros     := PROJECT(CHOOSEN(SORT(Sinis, -claim_date), 5), Layout_Sin);
END;

Dossies := PROJECT(Ids, Montar(LEFT));

IF(S = '' AND F = '' AND L = '', FAIL(400, 'Informe Ssn, Telefone ou Sobrenome'));
OUTPUT(CHOOSEN(SORT(Dossies, -total_pago, entidade_id), 20), NAMED('Dossies'));
OUTPUT(COUNT(Ids), NAMED('Total'));
```
Esse é o esqueleto de praticamente toda consulta de pessoa em produção: **normalizar a entrada → escolher o caminho → reduzir a entidades → enriquecer por índices → pontuar/classificar → cortar e devolver**. Publique, chame com Mary Jones do Texas e veja a pessoa 533 voltar no topo com risco `ALTO`. Um analista de fraude acabou de ganhar, em 50 milissegundos, a informação que você levou o dia 10 inteiro para descobrir no Thor.

# QUIZ

? Uma consulta recebe SSN, telefone e nome. Qual caminho de busca deve ter prioridade?
- Nome, porque é o mais conhecido
+ SSN, porque é o mais seletivo
- Telefone, porque é numérico
- Todos ao mesmo tempo, sempre
! O identificador mais seletivo devolve menos candidatos e custa menos.

? Para que `MAP(c1 => ds1, c2 => ds2, DATASET([], L))` funcione, o que é necessário?
- Que os recordsets tenham o mesmo número de linhas
+ Que todos os recordsets tenham o mesmo layout
- Que todos sejam índices
- Que estejam ordenados
! Só o ramo escolhido é executado, mas todos precisam do mesmo formato.

? Como é montada uma resposta aninhada diretamente no Roxie?
- Com um SORT global
+ Com um TRANSFORM em que o campo filho recebe uma leitura KEYED de índice (com LIMIT)
- Com DISTRIBUTE e ROLLUP LOCAL
- Não é possível no Roxie
! Para cada pessoa, cada filho é uma pequena leitura de índice.

? Qual a diferença de efeito entre filtrar por estado e pontuar por estado?
- Nenhuma
+ O filtro elimina quem não bate; a pontuação mantém, mas coloca mais abaixo
- A pontuação é sempre mais rápida
- O filtro só funciona no Thor
! Certo vira filtro (barato); incerto vira ponto (tolerante).

? Uma busca legítima não encontrou ninguém. O que a consulta deve devolver?
- Erro 500
- Erro 301
+ Uma resposta normal, vazia
- Um registro com campos zerados
! "Não achei" é resposta, não falha. Use LIMIT com SKIP.

? Como trocar os dados de produção do Roxie sem recompilar as consultas?
- Republicando todas as consultas
- Reiniciando o cluster
+ Apontando as superkeys para os novos índices por meio de um novo pacote (packagemap)
- Apagando os índices antigos
! As consultas referenciam nomes fixos; o pacote decide quais arquivos valem.

? Para que servem as versões de uma consulta publicada (`nome.1`, `nome.2`)?
- Para dividir a carga entre nós
+ Para ativar uma versão nova ou voltar à anterior instantaneamente
- Para guardar os resultados
- Para compilar mais rápido
! O alias aponta para a versão ativa; trocar é imediato.

# FLASHCARDS

Q: Esqueleto de uma consulta de pessoa.
A: Normalizar entrada → escolher caminho → reduzir a entidades → enriquecer por índices → pontuar → cortar e devolver.
Q: Como escolher entre caminhos de busca?
A: `MAP(S <> '' => PeloSsn, F <> '' => PeloFone, PeloNome)` com recordsets de mesmo layout.
Q: Como criar um recordset vazio?
A: `DATASET([], Layout)`
Q: Como preencher um campo filho no Roxie?
A: Dentro do TRANSFORM: `SELF.filhos := PROJECT(LIMIT(Indice(KEYED(chave = L.id)), n, SKIP), LayoutFilho);`
Q: Três tipos de resposta de erro/vazio.
A: Não achou: vazio (SKIP). Ampla demais: FAIL com orientação. Entrada inválida: FAIL imediato (400).
Q: Superkey e packagemap.
A: Superkey = nome fixo de índice; packagemap = configuração do Roxie que diz quais índices valem agora.
Q: Filtro × pontuação.
A: Filtro elimina (barato, rígido); pontuação ordena (tolerante).
