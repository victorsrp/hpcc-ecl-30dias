---
dia: 26
modulo: 6
titulo: Pipeline de build de produção
horas: 3.5
---

# MISSAO

> [goggins] Último módulo. Acabou a fase de aprender peça por peça. Daqui até o dia 30 você trabalha como se já estivesse contratado: problema inteiro, do começo ao fim, com as preocupações de quem vai ser acordado às 3 da manhã se der errado. Hoje você monta a espinha dorsal de qualquer operação de dados: o **build**. Não é glamouroso. É o que mantém a empresa de pé.

**Hoje você vai:**

- Conhecer as etapas de um build de produção e o papel de cada uma.
- Versionar arquivos e índices e trocar a versão vigente com segurança.
- Entender por que o Roxie trava índices e como as superkeys resolvem.
- Registrar estatísticas de cada execução e comparar com a anterior.

# PILULA: A anatomia de um build

> [crianca] Uma padaria faz pão **toda madrugada**, sempre na mesma ordem: recebe a farinha, confere se veio certa, mistura, assa, prova um pão, e só então põe na vitrine. Se a farinha veio estragada, a padaria não joga fora o pão de ontem antes de ter o de hoje pronto. E se o pão de hoje queimou, a vitrine continua com o de ontem.

> [tecnico] Um build é um workunit (ou uma cadeia deles) que roda periodicamente e transforma dado cru em dado servível. As etapas quase não mudam de empresa para empresa:

| Etapa | O que faz | Você viu no dia |
|---|---|---|
| 1. **Ingestão** | Spray do arquivo cru; leitura com layout de entrada | 6 |
| 2. **Validação de entrada** | Contagem, layout, campos obrigatórios; para se estiver ruim | 13, 14 |
| 3. **Limpeza** | Padroniza; marca defeitos | 13 |
| 4. **Vínculo** | Liga à entidade (`entidade_id`) | 15 |
| 5. **Base** | Grava o arquivo base **versionado** | 6, 14 |
| 6. **Chaves** | Constrói os índices **versionados** | 16 |
| 7. **Controle de qualidade** | Compara com o build anterior; para se desviar | 14 |
| 8. **Promoção** | Troca os ponteiros (superfiles/superkeys) para a versão nova | 14, 19 |
| 9. **Registro** | Grava as estatísticas da execução | hoje |

Três propriedades separam um build profissional de um script:

- **Idempotente**: rodar duas vezes a mesma versão dá o mesmo resultado e não estraga nada.
- **Reversível**: a versão anterior fica intacta até a nova ser aprovada, e voltar é trocar um ponteiro.
- **Observável**: cada execução deixa números registrados; alguém consegue responder "o que mudou de ontem para hoje?".

# PILULA: Versão no nome, ponteiro fixo

> [tecnico] Toda saída de build leva a **versão** no nome (normalmente a data): `~prod::base::20261112::sinistros`. Os consumidores nunca usam esse nome: usam o superfile `~prod::base::sinistros`, que aponta para a versão vigente. O mesmo vale para índices.

Por que isso não é opcional para índices? Rode o bloco abaixo e leia o erro:

```ecl thor erro
IMPORT Treino;
// O índice de sinistros do curso está em uso pela consulta publicada ecl30_resumo_pessoa.
BUILD(Treino.Chaves.SinistrosPorPessoa, OVERWRITE);
```

`Lock held`: o Roxie mantém aberto todo índice usado por uma consulta publicada. **Não existe sobrescrever índice em produção.** A solução é a **superkey**: a consulta é compilada contra um nome fixo que é um superfile de índices; o build grava um índice novo ao lado e a promoção troca o subfile.

```ecl thor
IMPORT Treino, STD;
S := Treino.Arquivos.Sinistros;

Versao := (STRING)STD.Date.Today() + '_' + WORKUNIT[11..];     // data + sufixo do workunit: única por execução

// Declaração usada por QUEM CONSOME: aponta para a superkey (nome fixo)
Layout_K := {UNSIGNED4 person_id, UNSIGNED4 claim_id, UNSIGNED4 claim_date, STRING10 claim_type, UNSIGNED4 amount};
NomeSuper := '~aluno::key::sin_pessoa';
Chave     := INDEX(DATASET([], Layout_K), {person_id}, {claim_id, claim_date, claim_type, amount}, NomeSuper);

// Declaração usada PELO BUILD: mesmo formato, nome versionado
NomeVersao   := '~aluno::key::' + Versao + '::sin_pessoa';
ChaveVersao  := INDEX(S, {person_id}, {claim_id, claim_date, claim_type, amount}, NomeVersao);

SEQUENTIAL(
  BUILD(ChaveVersao),
  IF(NOT STD.File.SuperFileExists(NomeSuper), STD.File.CreateSuperFile(NomeSuper)),
  STD.File.StartSuperFileTransaction(),
  STD.File.ClearSuperFile(NomeSuper),
  STD.File.AddSuperFile(NomeSuper, NomeVersao),
  STD.File.FinishSuperFileTransaction(),
  OUTPUT(NomeVersao, NAMED('VersaoPromovida')),
  OUTPUT(COUNT(Chave(KEYED(person_id = 533))), NAMED('LidoPelaSuperkey'))
);
```

Rode duas vezes: cada execução cria um índice com nome novo e a superkey passa a apontar para ele. Em **Files → Logical Files** você vê as versões se acumulando. Um build real também apaga as versões antigas, mantendo as duas ou três últimas para poder voltar.

> [real] No Roxie de produção há um passo a mais: os índices precisam ser **copiados** para o armazenamento do Roxie e um *packagemap* novo é ativado (dia 19). A lógica é idêntica: nome fixo na consulta, versão no arquivo, troca de ponteiro na promoção.

# PILULA: Controle de qualidade contra o build anterior

> [tecnico] Validar um build só contra regras fixas ("mais de 25 mil linhas") é fraco. O teste forte é **comparar com o build anterior**: a contagem variou mais de X%? O fill rate de um campo-chave caiu? Para isso cada execução grava uma linha de **estatísticas** num arquivo de histórico, e a execução seguinte lê a última linha antes de promover.

```ecl thor
IMPORT Treino, STD;
S := Treino.Arquivos.Sinistros;

Layout_Stat := RECORD
  STRING30    build;
  STRING20    versao;
  UNSIGNED4   linhas;
  UNSIGNED8   soma_amount;
  DECIMAL5_2  pct_com_oficina;
END;

NomeHist   := '~aluno::build::historico';
NomeStat   := '~aluno::build::stat_' + WORKUNIT;
Historico  := DATASET(NomeHist, Layout_Stat, THOR, OPT);          // OPT: se não existir, é vazio

// Estatística desta execução
Agora := DATASET([{'sinistros', WORKUNIT, COUNT(S), SUM(S, amount), COUNT(S(repair_shop <> '')) * 100 / COUNT(S)}], Layout_Stat);

// Última execução registrada (se houver)
Anterior  := TOPN(Historico(build = 'sinistros'), 1, -versao);
TemAnt    := EXISTS(Anterior);
Variacao  := IF(TemAnt, ABS((REAL)Agora[1].linhas - Anterior[1].linhas) * 100 / Anterior[1].linhas, 0);

SEQUENTIAL(
  OUTPUT(Anterior, NAMED('BuildAnterior')),
  OUTPUT(Variacao, NAMED('VariacaoPercentualDeLinhas')),
  ASSERT(Variacao <= 10, 'Contagem variou mais de 10% em relacao ao build anterior', FAIL),
  ASSERT(Agora[1].pct_com_oficina >= 90, 'Fill rate de repair_shop abaixo de 90%', FAIL),
  // aprovado: registra
  OUTPUT(Agora, , NomeStat, OVERWRITE),
  IF(NOT STD.File.SuperFileExists(NomeHist), STD.File.CreateSuperFile(NomeHist)),
  STD.File.AddSuperFile(NomeHist, NomeStat),
  OUTPUT('BUILD APROVADO', NAMED('Status'))
);
```

Rode duas vezes. Na primeira não há build anterior; na segunda a variação é 0%. Novidade: a opção `OPT` na declaração do DATASET diz "se o arquivo não existir, trate como vazio em vez de dar erro", essencial para a primeira execução de qualquer processo. O histórico é um **superfile** que ganha um subfile pequeno por execução.

> [real] Os desvios que mais pegam problema na prática: contagem total, contagem por fonte, fill rate de campos de identificação (SSN, data de nascimento), quantidade de entidades novas e de entidades que "sumiram". Uma fonte que muda o formato de data sem avisar derruba o fill rate válido de 99% para 0% no mesmo dia, e o controle segura o build antes que o Roxie sirva data errada para um banco.

# PILULA: Carga completa e carga incremental

| | Completa (*full*) | Incremental (*delta*) |
|---|---|---|
| O que processa | Tudo, do zero | Só o que chegou desde o último build |
| Vantagem | Simples, sempre consistente | Rápida e barata |
| Risco | Custo cresce com o histórico | Erros se acumulam; exige lógica de atualização e remoção |
| Padrão comum | Semanal ou mensal | Diária, somada à base da última completa |

O desenho típico combina os dois: `base_vigente = base_completa + deltas_diarios` (um superfile!), com uma carga completa periódica que consolida tudo e zera os deltas. No Roxie isso aparece como uma superkey com o índice base grande e alguns índices delta pequenos.

# EXERCICIO: Nome de versão

Escreva a função `NomeVersionado(STRING escopo, STRING versao, STRING tabela)` que devolve `~escopo::versao::tabela` e a função `Hoje()` que devolve a data de referência `'20261112'` (fixa, para o resultado não mudar). Mostre o nome para o escopo `aluno::base`, a versão de `Hoje()` e a tabela `veiculos`.

```ecl

```

## GABARITO
```ecl
NomeVersionado(STRING escopo, STRING versao, STRING tabela) := '~' + escopo + '::' + versao + '::' + tabela;
Hoje() := '20261112';

OUTPUT(NomeVersionado('aluno::base', Hoje(), 'veiculos'));
```
Parece bobo, e é o tipo de função que evita que cada desenvolvedor monte nomes de um jeito. Em um repositório real ela mora no módulo de constantes.

# EXERCICIO: Controle que compara duas versões

Dadas as estatísticas de dois builds, mostre uma linha por campo com `campo`, `ontem`, `hoje`, `DECIMAL7_2 variacao_pct` e `BOOLEAN alerta` (variação absoluta acima de 5%). Ordene por `campo`.

```ecl
Stats := DATASET([{'20261111', 'linhas', 30100}, {'20261111', 'com_ssn', 29000}, {'20261111', 'com_fone', 30050},
                  {'20261112', 'linhas', 30207}, {'20261112', 'com_ssn', 21000}, {'20261112', 'com_fone', 30150}],
                 {STRING8 versao, STRING12 campo, UNSIGNED4 valor});

```

## DICA
Self-join por `campo`, com a versão de ontem à esquerda e a de hoje à direita.

## GABARITO
```ecl
Stats := DATASET([{'20261111', 'linhas', 30100}, {'20261111', 'com_ssn', 29000}, {'20261111', 'com_fone', 30050},
                  {'20261112', 'linhas', 30207}, {'20261112', 'com_ssn', 21000}, {'20261112', 'com_fone', 30150}],
                 {STRING8 versao, STRING12 campo, UNSIGNED4 valor});

Comparado := JOIN(Stats(versao = '20261111'), Stats(versao = '20261112'),
                  LEFT.campo = RIGHT.campo,
                  TRANSFORM({STRING12 campo, UNSIGNED4 ontem, UNSIGNED4 hoje, DECIMAL7_2 variacao_pct, BOOLEAN alerta},
                            v := ((REAL)RIGHT.valor - LEFT.valor) * 100 / LEFT.valor;
                            SELF.campo := LEFT.campo;
                            SELF.ontem := LEFT.valor;
                            SELF.hoje  := RIGHT.valor;
                            SELF.variacao_pct := v;
                            SELF.alerta := ABS(v) > 5));
OUTPUT(SORT(Comparado, campo));
```
O total de linhas quase não mexeu, mas `com_ssn` caiu 27%. Um controle só de contagem teria aprovado esse build.

# REAL: Build completo de veículos

Monte, em **um bloco**, o build da fonte de veículos, com todas as etapas. Thor.

1. **Ingestão**: leia `~ecl30::raw::veiculos` (CSV com cabeçalho) no layout `Treino.Layouts.Veiculo`.
2. **Validação de entrada** (falha o job): mais de 10.000 linhas; nenhum `vin` vazio.
3. **Limpeza**: `make` e `model` em maiúsculas sem espaços sobrando; acrescente `BOOLEAN ano_ok` (`year` entre 1980 e 2027) e `BOOLEAN vin_ok` (17 caracteres, só letras maiúsculas e dígitos).
4. **Base versionada**: grave em `'~aluno::veic::' + WORKUNIT + '::base'`.
5. **Chave versionada**: índice por `vin` com payload `person_id, make, model, year, plate, state`, em `'~aluno::veic::' + WORKUNIT + '::key_vin'`.
6. **Controle de qualidade** (falha o job): pelo menos 99% de `vin_ok` e de `ano_ok`; `vin` único no arquivo base.
7. **Promoção**: troque, em uma transação, o conteúdo do superfile `~aluno::veic::base` e da superkey `~aluno::veic::key_vin` pela versão nova.
8. **Resultados**, lidos **pelos nomes fixos**: (a) `LinhasBase`; (b) `PorMarca`: as 3 marcas com mais veículos (`make`, `qtd`), desempate por `make`; (c) `PeloIndice`: o veículo de VIN `K9TDD70FYGSR7FASL` lido pela superkey.

```ecl thor
IMPORT Treino, STD;

```

## DICA
Organize em definições nomeadas por etapa e deixe um único `SEQUENTIAL` no fim. Para ler pela superkey, declare um segundo `INDEX` com o mesmo formato e o nome fixo, usando `DATASET([], Layout)` como origem. Unicidade: `COUNT(Base) = COUNT(TABLE(Base, {vin}, vin))`.

## GABARITO
```ecl thor
IMPORT Treino, STD;

// ---------- nomes ----------
Versao     := WORKUNIT;
NomeBaseV  := '~aluno::veic::' + Versao + '::base';
NomeKeyV   := '~aluno::veic::' + Versao + '::key_vin';
SuperBase  := '~aluno::veic::base';
SuperKey   := '~aluno::veic::key_vin';

// ---------- 1) ingestão ----------
Cru := DATASET('~ecl30::raw::veiculos', Treino.Layouts.Veiculo, CSV(HEADING(1)));

// ---------- 3) limpeza ----------
Layout_Base := RECORD
  Treino.Layouts.Veiculo;
  BOOLEAN ano_ok;
  BOOLEAN vin_ok;
END;

Limpo := PROJECT(Cru,
                 TRANSFORM(Layout_Base,
                           SELF.make   := STD.Str.ToUpperCase(STD.Str.CleanSpaces(LEFT.make));
                           SELF.model  := STD.Str.ToUpperCase(STD.Str.CleanSpaces(LEFT.model));
                           SELF.ano_ok := LEFT.year BETWEEN 1980 AND 2027;
                           SELF.vin_ok := REGEXFIND('^[A-Z0-9]{17}$', LEFT.vin);
                           SELF := LEFT));

// ---------- 5) chave ----------
Layout_K := {STRING17 vin, UNSIGNED4 person_id, STRING12 make, STRING12 model, UNSIGNED2 year, STRING7 plate, STRING2 state};
BaseV    := DATASET(NomeBaseV, Layout_Base, THOR);
ChaveV   := INDEX(BaseV, {vin}, {person_id, make, model, year, plate, state}, NomeKeyV);

// ---------- leitura pelos nomes fixos ----------
BaseAtual  := DATASET(SuperBase, Layout_Base, THOR);
ChaveAtual := INDEX(DATASET([], Layout_K), {vin}, {person_id, make, model, year, plate, state}, SuperKey);

// ---------- 6) métricas de qualidade ----------
Total := COUNT(BaseV);
PctVin := COUNT(BaseV(vin_ok)) * 100 / Total;
PctAno := COUNT(BaseV(ano_ok)) * 100 / Total;

CriaSeFalta(STRING n) := IF(NOT STD.File.SuperFileExists(n), STD.File.CreateSuperFile(n));

SEQUENTIAL(
  // 2) validação de entrada
  ASSERT(COUNT(Cru) > 10000, 'Arquivo de veiculos menor que o esperado', FAIL),
  ASSERT(NOT EXISTS(Cru(vin = '')), 'Veiculo sem VIN na entrada', FAIL),
  // 4) base e 5) chave, versionadas
  OUTPUT(Limpo, , NomeBaseV, OVERWRITE),
  BUILD(ChaveV),
  // 6) controle de qualidade
  ASSERT(PctVin >= 99, 'vin_ok abaixo de 99%', FAIL),
  ASSERT(PctAno >= 99, 'ano_ok abaixo de 99%', FAIL),
  ASSERT(Total = COUNT(TABLE(BaseV, {vin}, vin)), 'VIN duplicado no arquivo base', FAIL),
  // 7) promoção
  CriaSeFalta(SuperBase), CriaSeFalta(SuperKey),
  STD.File.StartSuperFileTransaction(),
  STD.File.ClearSuperFile(SuperBase),
  STD.File.AddSuperFile(SuperBase, NomeBaseV),
  STD.File.ClearSuperFile(SuperKey),
  STD.File.AddSuperFile(SuperKey, NomeKeyV),
  STD.File.FinishSuperFileTransaction(),
  // 8) resultados pelos nomes fixos
  OUTPUT(COUNT(BaseAtual), NAMED('LinhasBase')),
  OUTPUT(TOPN(TABLE(BaseAtual, {make, UNSIGNED4 qtd := COUNT(GROUP)}, make, FEW), 3, -qtd, make), NAMED('PorMarca')),
  OUTPUT(ChaveAtual(KEYED(vin = 'K9TDD70FYGSR7FASL')), NAMED('PeloIndice'))
);
```
Confira as três propriedades. **Idempotente**: cada execução grava em nomes novos (por `WORKUNIT`) e nunca toca na versão vigente antes de aprovar. **Reversível**: a versão anterior continua no disco; voltar é trocar os subfiles. **Observável**: os controles falham com mensagem específica. Repare na ordem: os `ASSERT` de qualidade vêm **depois** de gravar a versão nova e **antes** da promoção. Se falharem, o job para, a versão ruim fica lá para ser investigada e os consumidores continuam lendo a boa. Isso é o que significa "build de produção".

# QUIZ

? O que significa um build ser idempotente?
- Rodar sempre no mesmo horário
+ Rodá-lo de novo com a mesma entrada dá o mesmo resultado e não corrompe nada
- Processar só os dados novos
- Não usar superfiles
! Reexecutar depois de uma falha precisa ser seguro.

? Por que a versão anterior não é apagada antes de a nova ser aprovada?
- Para ocupar disco
+ Para que os consumidores continuem servidos e seja possível voltar com uma troca de ponteiro
- Porque o Thor não permite apagar arquivos
- Para acelerar o build
! Reversibilidade: o dado bom só sai de cena quando o novo passou nos controles.

? Por que `BUILD(Indice, OVERWRITE)` falha para um índice usado por uma consulta publicada?
- Porque o índice é somente leitura para sempre
+ Porque o Roxie mantém o arquivo aberto (travado) enquanto a consulta o utiliza
- Porque o Thor não constrói índices
- Porque falta KEYED
! Por isso índices de produção são versionados e trocados por superkey/packagemap.

? O que é uma superkey?
+ Um superfile cujos subfiles são índices; as consultas usam o nome fixo
- Um índice com todos os campos na chave
- Uma chave primária composta
- Um índice que não precisa de BUILD
! Permite trocar o índice vigente sem recompilar nem travar.

? Qual controle de qualidade detecta melhor uma fonte que mudou de formato sem avisar?
- Contagem mínima fixa
+ Comparação de fill rate e contagens com o build anterior
- Verificar se o job terminou sem erro
- Conferir o tamanho do arquivo em bytes
! Um campo que deixa de ser preenchido derruba o fill rate mesmo com a contagem igual.

? Para que serve `OPT` em `DATASET('~arquivo', Layout, THOR, OPT)`?
- Otimiza a leitura
+ Trata o arquivo como vazio se ele não existir, em vez de dar erro
- Torna o arquivo opcional para o Roxie apenas
- Comprime o arquivo
! Indispensável na primeira execução de um processo que lê seu próprio histórico.

? Em que ponto do build devem ficar os controles de qualidade da saída?
- Antes da ingestão
- Depois da promoção
+ Depois de gravar a versão nova e antes de promovê-la
- No Roxie
! Se falharem, a versão ruim não chega aos consumidores e fica disponível para análise.

? Qual a principal desvantagem de uma carga incremental em relação à completa?
- É mais lenta
+ Erros se acumulam e exige lógica de atualização/remoção; por isso é combinada com cargas completas periódicas
- Não pode usar superfiles
- Não permite índices
! Delta diário + consolidação periódica é o desenho mais comum.

# FLASHCARDS

Q: Nove etapas de um build.
A: Ingestão; validação de entrada; limpeza; vínculo; base versionada; chaves versionadas; controle de qualidade; promoção; registro.
Q: Três propriedades de um build profissional.
A: Idempotente, reversível, observável.
Q: Por que não sobrescrever índice em produção?
A: O Roxie trava índices em uso; grava-se uma versão nova e troca-se a superkey/packagemap.
Q: Como gerar um nome único por execução?
A: Usar `WORKUNIT` (ou a data) no nome lógico.
Q: Como ler um arquivo que pode não existir ainda?
A: `DATASET('~nome', Layout, THOR, OPT)`
Q: Qual o teste de qualidade mais forte?
A: Comparar contagens e fill rates com o build anterior.
Q: Desenho base + delta.
A: Superfile/superkey com a base completa e deltas diários; consolidação periódica.
