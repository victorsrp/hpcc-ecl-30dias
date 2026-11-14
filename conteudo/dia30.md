---
dia: 30
modulo: 6
titulo: Projeto final e prova final
horas: 5
---

# MISSAO

> [goggins] Dia 30. Lembra do dia 1? `OUTPUT('Dia 1. Eu apareci.');`. Você apareceu 29 vezes seguidas. Hoje chega uma demanda real, sem pílula, sem dica, sem gabarito à vista, do jeito que vai chegar na sua mesa na segunda-feira. Você vai resolver de ponta a ponta. Depois, a prova final, que cobre os 30 dias. Quando terminar, você não "fez um curso". Você virou alguém que entrega. Vai.

**Hoje:**

1. A demanda: integrar um parceiro novo, do arquivo cru ao serviço publicado.
2. A prova final de conceitos: 30 perguntas, uma por dia de curso.
3. O que fazer a partir de amanhã.

# PILULA: A demanda

O e-mail chegou às 8h12:

> "Fechamos com a **Partner X**, uma corretora que vai nos mandar a carteira de clientes dela para checagem de risco antes de renovar as apólices. O primeiro arquivo já está na landing zone (`parceiro.txt`, chegou como `~ecl30::raw::parceiro`). Formato diferente do nosso, claro. Precisamos: (1) saber quantos clientes deles nós já conhecemos; (2) a nota de risco de cada um; (3) um serviço para o time de atendimento deles consultar um cliente pelo número da conta. A diretoria quer os números até o fim do dia."

O arquivo é separado por `|`, com cabeçalho, e tem estas colunas:

| Coluna | Exemplo | Observação |
|---|---|---|
| `ACCOUNT` | `PX002897` | Número da conta no parceiro (único) |
| `FULLNAME` | `Lopez, John` | **Sobrenome, Nome**, numa coluna só, com apelidos e caixa variada |
| `BIRTH` | `01/08/1945` | MM/DD/AAAA |
| `SSN` | `970-91-0332` | Com traços; às vezes vazio |
| `PHONE` | `(676) 258-9711` | Formatado |
| `ADDR` | `9875 Pine St` | Rua |
| `CITY_ST_ZIP` | `Buffalo, NY 14223` | Cidade, estado e CEP **numa coluna só** |
| `TIER` | `GOLD` | Categoria do cliente no parceiro |

Você já tem no cluster tudo o que precisa: o cadastro limpo e ligado (`Treino.Arquivos.Entidades`), as chaves de `Treino.Chaves`, as funções de `Treino.Limpeza`, a tabela `Treino.Apelidos` e o índice de risco do dia 29 (`~aluno::key::risco`).

# DESAFIO: Integração da Partner X

Sem dica. As etapas abaixo são o **contrato** da entrega; como você implementa cada uma é com você.

**Parte A · Ingestão e padronização (Thor)**

1. Leia `~ecl30::raw::parceiro` (separador `|`, com cabeçalho).
2. Valide a entrada: falhe o job se houver menos de 2.500 linhas ou se `ACCOUNT` não for único.
3. Padronize para um layout seu com: `account`, `fname_clean` (com apelido resolvido), `lname_clean`, `dob` (AAAAMMDD), `ssn` (9 dígitos), `ssn_ok`, `phone` (10 dígitos), `city_clean`, `state`, `zip`, `tier`.

**Parte B · Vínculo com a nossa base (Thor)**

4. Ligue cada cliente do parceiro a um `entidade_id` nosso, com pelo menos dois caminhos de blocagem (por exemplo: SSN válido; e sobrenome + data de nascimento + estado), pontuando os candidatos com a regra do dia 15 e aceitando só **7 pontos ou mais**. Cada conta recebe **no máximo um** `entidade_id` (o de maior pontuação; empate, o menor id).
5. Clientes sem par ficam com `entidade_id = 0`.

**Parte C · Risco e entrega em lote (Thor)**

6. Leia a nota de risco de cada cliente ligado no índice `~aluno::key::risco` (half-keyed join). Não ligados: faixa `'N/A'`.
7. Grave o arquivo de entrega em uma versão com o `WORKUNIT` no nome e promova para o superfile `~aluno::partnerx::entrega`, com controle: a quantidade de linhas entregue tem que ser **igual** à recebida.
8. Grave também um índice por `account` (payload: `entidade_id`, `nota`, `faixa`, `motivos`, `tier`) versionado, promovido para a superkey `~aluno::partnerx::key_conta`.
9. Resultados nomeados: `Recebidos`, `Ligados`, `PctLigados` (`DECIMAL5_2`), `PorFaixa` (faixa e quantidade, ordenado por faixa) e `AltoRiscoGold` (quantos clientes `GOLD` estão na faixa `ALTO`).

**Parte D · Serviço (Roxie)**

10. Publique `partnerx_conta_v1`: entrada `Conta`; lê **pela superkey** `~aluno::partnerx::key_conta`; devolve `Resultado` com `account`, `tier`, `conhecido` (BOOLEAN), `nota`, `faixa` e `motivos_texto` (os códigos traduzidos como no dia 29). Conta vazia: erro 400. Conta inexistente: resposta vazia.

**Parte E · Relatório para a diretoria**

11. Escreva no relatório pós-ação, no fim desta página, em linguagem de negócio, sem termos técnicos: quantos clientes do parceiro já conhecíamos, quantos estão em alto risco, o que você recomenda e qual a principal limitação da análise.

Faça a Parte A a C num bloco Thor e a Parte D noutro. Teste o serviço com o testador depois de publicar. Só abra o gabarito depois de entregar, e então compare com a sua solução linha por linha: não para ver se "acertou", mas para ver o que você faria diferente.

```ecl thor
IMPORT Treino, STD;

// PARTES A, B e C

```

```ecl sem-validar
// consulta: partnerx_conta_v1
IMPORT STD;

// PARTE D

```

## GABARITO
Partes A, B e C (Thor):

```ecl thor
IMPORT Treino, STD;
L := Treino.Limpeza;

// ===================== A) INGESTÃO E PADRONIZAÇÃO =====================
Layout_Cru := {STRING account, STRING fullname, STRING birth, STRING ssn, STRING phone, STRING addr, STRING city_st_zip, STRING tier};
Cru := DATASET('~ecl30::raw::parceiro', Layout_Cru, CSV(HEADING(1), SEPARATOR('|')));

Layout_P := RECORD
  STRING10  account;
  STRING20  fname_clean;
  STRING20  lname_clean;
  UNSIGNED4 dob;
  STRING9   ssn;
  BOOLEAN   ssn_ok;
  STRING10  phone;
  STRING20  city_clean;
  STRING2   state;
  STRING5   zip;
  STRING6   tier;
END;

Passo1 := PROJECT(Cru,
                  TRANSFORM(Layout_P,
                            virg := STD.Str.Find(LEFT.fullname, ',', 1);
                            cs   := LEFT.city_st_zip;
                            vc   := STD.Str.Find(cs, ',', 1);
                            resto := TRIM(cs[vc + 1..], LEFT, RIGHT);          // "NY 14223"
                            SELF.account     := TRIM(LEFT.account);
                            SELF.lname_clean := L.Texto(LEFT.fullname[1..virg - 1]);
                            SELF.fname_clean := L.Texto(LEFT.fullname[virg + 1..]);
                            SELF.dob         := STD.Date.FromStringToDate(LEFT.birth, '%m/%d/%Y');
                            SELF.ssn         := L.SoDigitos(LEFT.ssn);
                            SELF.ssn_ok      := L.SsnValido(L.SoDigitos(LEFT.ssn));
                            SELF.phone       := L.SoDigitos(LEFT.phone);
                            SELF.city_clean  := L.Texto(cs[1..vc - 1]);
                            SELF.state       := STD.Str.ToUpperCase(resto[1..2]);
                            SELF.zip         := TRIM(resto[4..], LEFT, RIGHT);
                            SELF.tier        := STD.Str.ToUpperCase(TRIM(LEFT.tier))));

Parceiro := JOIN(Passo1, Treino.Apelidos, LEFT.fname_clean = RIGHT.apelido,
                 TRANSFORM(Layout_P, SELF.fname_clean := IF(RIGHT.nome <> '', RIGHT.nome, LEFT.fname_clean); SELF := LEFT),
                 LEFT OUTER, LOOKUP);

// ===================== B) VÍNCULO =====================
E := Treino.Arquivos.Entidades;

Layout_Par := {STRING10 account, UNSIGNED4 entidade_id, UNSIGNED1 pontos};

Pontuar(Layout_P a, RECORDOF(E) b) :=
    IF(a.ssn_ok AND b.ssn_ok AND a.ssn = b.ssn, 5, 0)
  + IF(a.dob = b.dob, 3, 0)
  + MAP(a.lname_clean = b.lname_clean => 3,
        STD.Str.EditDistance(TRIM(a.lname_clean), TRIM(b.lname_clean)) <= 1 => 2,
        0)
  + IF(a.fname_clean = b.fname_clean, 2, 0)
  + IF(a.phone = b.phone AND a.phone <> '', 2, 0)
  + IF(a.zip = b.zip, 1, 0);

Par(Layout_P a, RECORDOF(E) b) := TRANSFORM(Layout_Par, SELF.account := a.account; SELF.entidade_id := b.entidade_id; SELF.pontos := Pontuar(a, b));

B1 := JOIN(Parceiro(ssn_ok), E(ssn_ok), LEFT.ssn = RIGHT.ssn,
           Par(LEFT, RIGHT), ATMOST(LEFT.ssn = RIGHT.ssn, 50));
B2 := JOIN(Parceiro, E, LEFT.lname_clean = RIGHT.lname_clean AND LEFT.dob = RIGHT.dob AND LEFT.state = RIGHT.state,
           Par(LEFT, RIGHT), ATMOST(LEFT.lname_clean = RIGHT.lname_clean AND LEFT.dob = RIGHT.dob AND LEFT.state = RIGHT.state, 50));
B3 := JOIN(Parceiro, E, LEFT.phone = RIGHT.phone AND LEFT.dob = RIGHT.dob,
           Par(LEFT, RIGHT), ATMOST(LEFT.phone = RIGHT.phone AND LEFT.dob = RIGHT.dob, 50));

Aprovados := (B1 + B2 + B3)(pontos >= 7);
Melhor    := DEDUP(SORT(Aprovados, account, -pontos, entidade_id), account);

// ===================== C) RISCO E ENTREGA =====================
Layout_KR := {UNSIGNED4 entidade_id, UNSIGNED1 nota, STRING5 faixa, STRING120 motivos};
KRisco := INDEX(DATASET([], Layout_KR), {entidade_id}, {nota, faixa, motivos}, '~aluno::key::risco');

Layout_Entrega := RECORD
  STRING10  account;
  STRING6   tier;
  UNSIGNED4 entidade_id;
  UNSIGNED1 pontos_vinculo;
  UNSIGNED1 nota;
  STRING5   faixa;
  STRING120 motivos;
END;

ComId := JOIN(Parceiro, Melhor, LEFT.account = RIGHT.account,
              TRANSFORM(Layout_Entrega,
                        SELF.pontos_vinculo := RIGHT.pontos;
                        SELF.entidade_id    := RIGHT.entidade_id;
                        SELF.nota := 0; SELF.faixa := ''; SELF.motivos := '';
                        SELF := LEFT),
              LEFT OUTER, KEEP(1));

Entrega := JOIN(ComId, KRisco, LEFT.entidade_id <> 0 AND KEYED(LEFT.entidade_id = RIGHT.entidade_id),
                TRANSFORM(Layout_Entrega,
                          SELF.faixa   := IF(LEFT.entidade_id = 0, 'N/A', RIGHT.faixa);
                          SELF.nota    := RIGHT.nota;
                          SELF.motivos := RIGHT.motivos;
                          SELF := LEFT),
                LEFT OUTER, KEEP(1));

// nomes
NomeV     := '~aluno::partnerx::' + WORKUNIT + '::entrega';
NomeKV    := '~aluno::partnerx::' + WORKUNIT + '::key_conta';
Super     := '~aluno::partnerx::entrega';
SuperKey  := '~aluno::partnerx::key_conta';

EntregaV  := DATASET(NomeV, Layout_Entrega, THOR);
KContaV   := INDEX(EntregaV, {account}, {entidade_id, nota, faixa, motivos, tier}, NomeKV);
Lida      := DATASET(Super, Layout_Entrega, THOR);

Recebidos := COUNT(Cru);
CriaSeFalta(STRING n) := IF(NOT STD.File.SuperFileExists(n), STD.File.CreateSuperFile(n));

SEQUENTIAL(
  ASSERT(Recebidos >= 2500, 'Arquivo do parceiro menor que o esperado', FAIL),
  ASSERT(Recebidos = COUNT(TABLE(Parceiro, {account}, account)), 'ACCOUNT duplicado no arquivo do parceiro', FAIL),
  OUTPUT(Entrega, , NomeV, OVERWRITE),
  ASSERT(COUNT(EntregaV) = Recebidos, 'Entrega com quantidade diferente da recebida', FAIL),
  BUILD(KContaV),
  CriaSeFalta(Super), CriaSeFalta(SuperKey),
  STD.File.StartSuperFileTransaction(),
  STD.File.ClearSuperFile(Super),    STD.File.AddSuperFile(Super, NomeV),
  STD.File.ClearSuperFile(SuperKey), STD.File.AddSuperFile(SuperKey, NomeKV),
  STD.File.FinishSuperFileTransaction(),
  OUTPUT(Recebidos, NAMED('Recebidos')),
  OUTPUT(COUNT(Lida(entidade_id <> 0)), NAMED('Ligados')),
  OUTPUT((DECIMAL5_2)(COUNT(Lida(entidade_id <> 0)) * 100 / COUNT(Lida)), NAMED('PctLigados')),
  OUTPUT(SORT(TABLE(Lida, {faixa, UNSIGNED4 qtd := COUNT(GROUP)}, faixa, FEW), faixa), NAMED('PorFaixa')),
  OUTPUT(COUNT(Lida(tier = 'GOLD' AND faixa = 'ALTO')), NAMED('AltoRiscoGold'))
);
```

Parte D (Roxie):

```ecl
#STORED('Conta', 'PX002897');
// consulta: partnerx_conta_v1
IMPORT STD;

STRING10 Conta := '' : STORED('Conta');
C := STD.Str.ToUpperCase(TRIM(Conta, LEFT, RIGHT));

Layout_KC := {STRING10 account, UNSIGNED4 entidade_id, UNSIGNED1 nota, STRING5 faixa, STRING120 motivos, STRING6 tier};
KConta := INDEX(DATASET([], Layout_KC), {account}, {entidade_id, nota, faixa, motivos, tier}, '~aluno::partnerx::key_conta');

DescreveMotivos(STRING m) := FUNCTION
  Tem(STRING c) := STD.Str.Find(m, c, 1) > 0;
  t := IF(Tem('R01'), 'Lesoes repetidas; ', '') + IF(Tem('R02'), 'Oficina de risco; ', '')
     + IF(Tem('R03'), 'Valor medio alto; ', '') + IF(Tem('R04'), 'Multiplos cadastros; ', '')
     + IF(Tem('R05'), 'Compras fora do estado; ', '');
  RETURN IF(t = '', 'Sem sinais de risco', t[1..LENGTH(t) - 2]);
END;

Lido := LIMIT(KConta(KEYED(account = C)), 1, SKIP);

IF(C = '', FAIL(400, 'Informe a Conta'));
OUTPUT(PROJECT(Lido, TRANSFORM({STRING10 account, STRING6 tier, BOOLEAN conhecido, UNSIGNED1 nota, STRING5 faixa, STRING120 motivos_texto},
                               SELF.conhecido     := LEFT.entidade_id <> 0;
                               SELF.motivos_texto := IF(LEFT.entidade_id = 0, 'Cliente nao encontrado na base', DescreveMotivos(LEFT.motivos));
                               SELF := LEFT)), NAMED('Resultado'));
```

O que um revisor sênior observaria nesta solução:

- **A** reaproveita `Treino.Limpeza` em vez de reescrever regras: entrada do parceiro e base ficam na mesma forma canônica, senão nada casa.
- **B** tem três blocos com `ATMOST` e decide por pontos, com desempate determinístico (`-pontos, entidade_id`): rodar duas vezes dá o mesmo resultado.
- **C** usa `LEFT OUTER, KEEP(1)` nos dois enriquecimentos e um controle de contagem antes de promover: **nenhum cliente some**, que é a primeira coisa que o parceiro vai conferir.
- **D** lê pela superkey, então amanhã, com o arquivo novo do parceiro, a consulta não muda: só a promoção.
- Os números: 3.000 recebidos, cerca de 2.000 ligados (dois terços), meia dúzia em ALTO. O arquivo foi montado com 2.000 clientes da nossa base e 1.000 desconhecidos, e o vínculo deve chegar muito perto disso. Se der um ou dois a mais, um cliente "desconhecido" casou por coincidência com alguém nosso: é exatamente o tipo de caso que um bom relatório lista para conferência manual. Essa é a limitação que vai para a diretoria: o vínculo é probabilístico, e uma nota de risco só vale se a pessoa ligada for a pessoa certa.

# TESTE

? Dia 1: qual é a diferença entre definição e ação em ECL?
- Definição executa; ação só declara
+ Definição (`:=`) só dá nome a uma expressão; ação (como OUTPUT) dispara a execução do que ela precisa
- Não há diferença
- Ação só existe no Roxie
! O compilador executa apenas o que as ações exigem.

? Dia 2: `Clientes(estado IN ['FL','GA'] AND score > 700)` é...
+ um filtro que define um novo recordset
- uma alteração do dataset Clientes
- um JOIN
- um índice
! Filtrar não altera a origem.

? Dia 3: como obter o registro mais recente de cada pessoa?
- `TOPN(ds, 1, -data)`
+ `DEDUP(SORT(ds, pessoa, -data), pessoa)`
- `DEDUP(ds, pessoa)`
- `MAX(ds, data)`
! Ordena pelo grupo e pelo critério; o DEDUP fica com o primeiro de cada grupo.

? Dia 4: dentro de um TRANSFORM de PROJECT, o que `SELF := LEFT;` faz?
- Copia a tabela inteira
+ Preenche os campos ainda não atribuídos com os de mesmo nome do registro de entrada
- Sobrescreve todas as atribuições
- Apaga o registro
! Atribuições explícitas vêm antes e têm prioridade.

? Dia 5: em `TABLE(ds, {estado, qtd := COUNT(GROUP)}, estado, FEW)`, o que `FEW` indica?
- Poucas colunas
+ Poucos grupos: a agregação pode ser feita em memória sem redistribuir os dados
- Resultado limitado a poucas linhas
- Execução no hThor
! Otimização importante em tabelas grandes.

? Dia 6: o que acontece no spray?
- Os índices são publicados
+ O arquivo da landing zone é copiado para o cluster e dividido em partes pelos nós
- O código é compilado
- Os arquivos são apagados
! O resultado é um arquivo lógico com várias partes físicas.

? Dia 7: a chave aparece 3 vezes à esquerda e 5 à direita. Quantas linhas o inner join gera para ela?
- 8
+ 15
- 5
- 3
! m × n.

? Dia 8: para que serve `ATMOST` em um JOIN?
- Para limitar o resultado total
+ Para descartar registros que casariam com mais pares que o limite, típicos de chave lixo
- Para acelerar o LOOKUP
- Para ordenar
! Defesa contra explosão por chaves como SSN vazio.

? Dia 9: o arquivo `ecl/Fraude/Regras.ecl` deve exportar...
+ `Regras`
- `Fraude`
- qualquer nome
- nada
! Nome do arquivo = nome da definição exportada.

? Dia 10: no ITERATE, `LEFT` e `RIGHT` são...
- tabela da esquerda e da direita
+ o registro anterior já transformado e o registro atual
- o primeiro e o último registro
- o acumulado e o total
! Por isso se termina com `SELF := RIGHT`.

? Dia 11: como filtrar pessoas que têm algum veículo Tesla no campo filho `veiculos`?
- `Pessoas(veiculos.make = 'Tesla')`
+ `Pessoas(EXISTS(veiculos(make = 'Tesla')))`
- `NORMALIZE(Pessoas, 'Tesla')`
- `JOIN(Pessoas, 'Tesla')`
! O filho é um dataset: filtra-se e testa-se com EXISTS.

? Dia 12: `LOCAL` sem `DISTRIBUTE` antes, numa deduplicação por chave, costuma produzir...
- erro de compilação
+ resultado errado sem erro, porque iguais em nós diferentes não se encontram
- o mesmo resultado, mais rápido
- skew
! Co-localização primeiro, LOCAL depois.

? Dia 13: por que manter o campo original ao lado do campo limpo?
+ Porque a limpeza destrói informação; o original serve para exibição e auditoria
- Porque o ECL não deixa apagar campos
- Para acelerar JOINs
- Para o Roxie funcionar
! Limpo para comparar, original para mostrar.

? Dia 14: qual a principal vantagem de os consumidores lerem um superfile?
- Leitura mais rápida
+ Nome fixo: trocar ou reverter dados não exige mudar quem consome
- Menos disco
- Validação automática
! Troca de ponteiro em vez de troca de nome.

? Dia 15: para que serve a blocagem no vínculo de registros?
- Para apagar duplicatas
+ Para gerar só pares candidatos que compartilham uma chave barata, em vez de comparar todos com todos
- Para escolher o limiar
- Para gravar o arquivo final
! De N² pares para poucos candidatos.

? Dia 16: com a chave `{lname, fname, state}`, qual filtro NÃO desce a árvore?
- `lname = 'X'`
- `lname = 'X' AND fname = 'Y'`
+ `fname = 'Y'`
- `lname = 'X' AND fname = 'Y' AND state = 'Z'`
! Sem o primeiro campo, é varredura.

? Dia 17: de que depende o custo de um half-keyed join?
- Do tamanho do índice
+ Do número de registros da esquerda
- Da quantidade de nós
- Do payload
! Uma busca na árvore por registro da esquerda.

? Dia 18: o que `: STORED('Nome')` cria numa consulta publicada?
- Um arquivo
+ Um parâmetro de entrada do serviço
- Um índice
- Um resultado
! A porta de entrada da requisição.

? Dia 19: uma busca legítima não encontrou ninguém. A resposta correta é...
- erro 500
- erro 301
+ uma resposta normal e vazia
- o registro mais próximo
! "Não achei" é resposta, não falha.

? Dia 20: um total por pessoa que não depende da entrada da consulta deve ser calculado...
- no Roxie, a cada chamada
+ no Thor, no build, e gravado como payload
- no cliente
- no ECL Watch
! Tudo o que independe da entrada é pré-calculado.

? Dia 21: o que permite a uma FUNCTIONMACRO receber "qualquer campo de qualquer tabela"?
- Tipagem dinâmica no Thor
+ A substituição textual dos parâmetros antes da compilação
- O uso de DICTIONARY
- Rodar no Roxie
! Macro é código que gera código.

? Dia 22: para que serve o LOOP no fecho transitivo?
- Para ordenar os pares
+ Para repetir a propagação do menor id até as cadeias fecharem
- Para deduplicar
- Para criar índices
! Cada rodada avança um elo.

? Dia 23: o que `{XPATH('insured/state')}` indica?
+ O caminho do valor dentro de um documento JSON/XML
- Um índice por estado
- Um filtro
- Uma validação
! Endereço do valor no documento.

? Dia 24: um SOAPCALL em um job de produção deve sempre ter...
- PARALLEL alto
+ TIMEOUT, RETRY e ONFAIL
- LOOKUP
- OVERWRITE
! Rede falha; o job precisa saber o que fazer.

? Dia 25: primeiro passo para otimizar um job lento?
- Reescrever tudo com LOOKUP
+ Medir: abrir o grafo e achar a atividade mais cara e onde as linhas explodem
- Aumentar o cluster
- Remover os ASSERTs
! Otimizar sem medir é superstição.

? Dia 26: por que não se sobrescreve um índice de produção com `BUILD(..., OVERWRITE)`?
+ Porque o Roxie o mantém em uso; grava-se uma versão nova e troca-se a superkey/pacote
- Porque é proibido pelo compilador
- Porque índices não têm OVERWRITE
- Porque o Thor não constrói índices
! Versão no nome, ponteiro fixo.

? Dia 27: por que encadear jobs por evento em vez de horário?
- Porque CRON não existe
+ Porque o segundo só começa quando o primeiro de fato terminou
- Porque eventos usam menos memória
- Porque é obrigatório no Thor
! Horário fixo pressupõe uma duração que pode não se confirmar.

? Dia 28: duas pessoas suspeitas moram no mesmo CEP. Isso é...
- prova de cumplicidade
+ uma ligação a ser verificada por um investigador humano
- irrelevante
- erro de dado
! Ligação é pista, não acusação.

? Dia 29: por que exigir confiança mínima antes de devolver a nota de risco?
- Para a consulta ficar mais rápida
+ Para não atribuir a nota de uma pessoa a outra
- Porque o Roxie exige
- Para reduzir o payload
! Melhor não responder do que responder sobre a pessoa errada.

? Dia 30: qual é a primeira coisa que um parceiro confere numa entrega em lote?
- O tempo de processamento
+ Se nenhum registro enviado sumiu ou foi duplicado
- A cor do relatório
- O nome do workunit
! Por isso: LEFT OUTER, KEEP(1) e controle de contagem antes de promover.

# FLASHCARDS

Q: O ciclo completo de um produto de dados HPCC em uma frase.
A: Spray → limpeza → vínculo → base versionada → chaves versionadas → controles → promoção → consulta Roxie lendo por superkey.
Q: As três regras de ouro de uma entrega em lote.
A: Ninguém some (LEFT OUTER), ninguém se multiplica (KEEP/DEDUP), contagem conferida antes de promover.
Q: As três regras de ouro de uma consulta Roxie.
A: Só índices com KEYED; tudo com limite; pesado fica no Thor.
Q: O que fazer quando uma demanda chega e você não sabe por onde começar?
A: Olhar o dado (CHOOSEN, perfil), escrever o contrato de saída, e resolver etapa por etapa medindo contagens.

# PILULA: E agora?

Você terminou. Algumas coisas para os próximos 30 dias:

- **Mantenha a revisão.** Os cartões continuam voltando em 7, 15 e 30 dias. Cinco minutos por dia. É o que impede que o mês inteiro evapore.
- **Reconstrua sem olhar.** Escolha um caso real (dia 10, 15, 20, 26 ou 30) e refaça do zero numa folha em branco. Onde travar é o que precisa de mais um treino.
- **Leia código dos outros.** O [repositório da HPCC Systems](https://github.com/hpcc-systems/HPCC-Platform) tem a biblioteca padrão inteira em ECL (`ecllibrary/std`): ler `STD.DataPatterns` e `STD.File` por dentro ensina muito.
- **Documentação oficial.** A página [Learning ECL](https://hpccsystems.com/training/documentation/learning-ecl/) traz a ECL Language Reference, o Programmer's Guide, a Standard Library Reference, o Data Tutorial e o ECL Best Practices. Agora você consegue ler tudo isso sem se perder.
- **ECL Watch e Playground.** Seu cluster continua aqui. Explore a parte de *Published Queries*, *Event Scheduler* e os grafos dos seus jobs.

> [goggins] Trinta dias atrás você não sabia o que era um RECORD. Hoje você integrou um parceiro, ligou identidades, pontuou risco e publicou um serviço. Ninguém te deu isso. Você apareceu todo dia e fez. Quando a próxima demanda impossível chegar, lembre deste pote de biscoitos. E aparece de novo.
