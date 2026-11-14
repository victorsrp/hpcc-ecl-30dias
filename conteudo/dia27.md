---
dia: 27
modulo: 6
titulo: Automação e operação
horas: 3
---

# MISSAO

> [goggins] Você sabe construir. Agora precisa saber **manter**. O desenvolvedor que só sabe escrever código novo e trava quando o job de ontem falhou é meio profissional. Hoje é sobre o lado que ninguém ensina: agendar, vigiar, investigar e limpar. É o que você vai fazer na primeira semana de qualquer emprego com HPCC, porque é o trabalho que os veteranos empurram para o novato. Chegue sabendo.

**Hoje você vai:**

- Agendar jobs por horário e por evento.
- Conhecer a linha de comando do HPCC.
- Usar o ECL Watch para investigar um workunit que falhou.
- Fazer faxina de arquivos e listar o que existe no cluster por código.
- Entender controle de acesso por escopo de arquivo.

# PILULA: Agendamento: WHEN e CRON

> [crianca] Um despertador: você programa uma vez ("toda manhã às 7h") e ele toca sozinho todo dia. Não precisa lembrar de ligar.

> [tecnico] O workflow service `: WHEN(evento)` transforma um workunit em **agendado**: em vez de rodar e acabar, ele fica registrado no componente *ECL Scheduler* e executa cada vez que o evento acontece. `CRON('minuto hora dia mês dia_da_semana')` gera eventos por horário, no formato do cron do Unix e em **UTC**.

```ecl nao-rodar
IMPORT Treino;

// Roda todo dia às 03:00 UTC
BuildDiario := Treino.ConstruirBase : WHEN(CRON('0 3 * * *'));
BuildDiario;

// Outros exemplos de CRON:
//   '0 * * * *'       de hora em hora
//   '30 2 * * 1'      segundas às 02:30
//   '0 6 1 * *'       dia 1 de cada mês às 06:00
//   '*/15 * * * *'    a cada 15 minutos
```

| Sobre workunits agendados | |
|---|---|
| Onde ver | ECL Watch → **Event Scheduler** |
| Estado | Fica como *scheduled*/*wait* até o evento |
| Limitar execuções | `WHEN(CRON('...'), COUNT(5))` roda 5 vezes e termina |
| Cancelar | Na tela do Event Scheduler ou abortando o workunit (*Deschedule*) |

> [cuidado] Os blocos desta pílula e da próxima estão marcados para **não rodar** aqui: um workunit agendado fica vivo no seu cluster até alguém cancelar. Se quiser experimentar, submeta pelo Playground do ECL Watch com `COUNT(1)` e depois confira o Event Scheduler.

# PILULA: Eventos: um job que acorda outro

> [crianca] Corrida de revezamento: o segundo corredor não sai num horário marcado, ele sai **quando recebe o bastão**. Se o primeiro atrasar, o segundo espera; se adiantar, sai antes.

> [tecnico] Encadear jobs por horário ("o build de chaves começa às 4h porque o de base costuma terminar às 3h30") é frágil. O certo é encadear por **evento**: o primeiro job, ao terminar, dispara `NOTIFY('nome_do_evento', 'valor')`; o segundo fica agendado com `WHEN('nome_do_evento', 'filtro')` e só roda quando o evento chega.

```ecl nao-rodar
// JOB 2 (submetido uma vez; fica esperando): constrói as chaves quando a base ficar pronta
IMPORT Treino;
Treino.Chaves.Construir : WHEN('ecl30_base_pronta', '*');
```

```ecl nao-rodar
// JOB 1: constrói a base e, se deu certo, passa o bastão
IMPORT Treino, STD;
SEQUENTIAL(
  Treino.ConstruirBase,
  NOTIFY('ecl30_base_pronta', (STRING)STD.Date.Today())
);
```

O mesmo mecanismo serve para "arquivo chegou": um monitor de landing zone (`STD.File.MonitorFile`) gera um evento quando um arquivo aparece, e o pipeline de ingestão acorda.

> [real] Em operações grandes, por cima disso costuma existir um orquestrador (ferramentas de fluxo de trabalho corporativas, inclusive Airflow) que submete workunits pela API do ECL Watch e acompanha o estado, porque o processo envolve outros sistemas além do HPCC. A API é a mesma que esta plataforma usa para rodar o seu código: `WsWorkunits`.

# PILULA: A linha de comando

Tudo o que você faz por tela existe em linha de comando, e é assim que automações e esteiras de integração contínua trabalham. As ferramentas vêm no pacote *client tools*:

| Comando | Faz |
|---|---|
| `ecl run thor arquivo.ecl --server=host` | Compila, executa e mostra o resultado |
| `ecl deploy roxie arquivo.ecl` | Compila e cria o workunit, sem rodar |
| `ecl publish roxie arquivo.ecl --name=consulta --activate` | Compila e publica uma consulta |
| `ecl queries list roxie` | Lista as consultas publicadas |
| `ecl status --wuid=W2026...` | Estado de um workunit |
| `ecl abort --wuid=W2026...` | Aborta |
| `ecl packagemap add roxie pacote.pkg` | Publica um pacote de dados do Roxie |
| `eclcc -syntax arquivo.ecl` | Só verifica a sintaxe, localmente |
| `eclcc -E arquivo.ecl` | Gera o *archive*: o código com todas as dependências num arquivo só |
| `dfuplus action=spray ...` / `action=despray ...` | Spray e despray |

> [real] O fluxo de um time maduro: o código vive em Git; uma alteração abre um *pull request*; a esteira roda `eclcc -syntax` em tudo e executa os testes num cluster de desenvolvimento; depois de aprovada, a esteira faz `ecl publish` no ambiente de homologação e, com autorização, no de produção. Ninguém publica consulta de produção pela tela.

# PILULA: Investigando um workunit no ECL Watch

Quando um job falha ou demora, este é o roteiro. Abra o [ECL Watch](http://localhost:8010) e acompanhe em um workunit seu.

| Onde | O que procurar |
|---|---|
| **Workunits** (lista) | Estado: `completed`, `failed`, `aborted`, `blocked`, `running`. Filtre por dono, cluster, nome do job |
| Aba de erros/avisos do workunit | A **primeira** mensagem de erro. Avisos também contam: "skew", "spill", "limite" |
| Aba ECL | O código exato que rodou (em produção, o que rodou nem sempre é o que está no repositório hoje) |
| Aba de variáveis/resultados | Valores de entrada e saídas nomeadas |
| Aba de grafos/métricas | Atividade mais lenta, linhas por seta, skew, uso de disco temporário (*spill*) |
| Aba de logs | Log do Thor/Roxie daquele workunit: é onde aparece a causa real de um "System error" |
| **Files → Logical Files** | Se os arquivos de entrada existem, tamanho, data, quem gravou |
| **Published Queries** | Consultas, versões ativas, suspensas, erros de carga |
| **Operations/Topology** | Saúde dos componentes |
| Relatório **ZAP** | Um pacote com tudo sobre o workunit, para anexar a um chamado |

Estados que confundem iniciante: `blocked` é o job esperando na fila do cluster; `compiled` é o código compilado e não executado (normal para consultas publicadas); `wait`/`scheduled` é o job agendado esperando evento.

# PILULA: Faxina e inventário por código

> [tecnico] Cluster de estudo ou de produção, disco acaba. `STD.File` e `STD.System` permitem listar e limpar por código. Lembre do dia 14: funções de gerência conversam com o Dali, então rodam no **hthor**.

```ecl
IMPORT STD;

// Inventário: arquivos do seu escopo
Arquivos := STD.File.LogicalFileList('aluno::*');
OUTPUT(COUNT(Arquivos), NAMED('QtdArquivosDoAluno'));
OUTPUT(TOPN(TABLE(Arquivos, {name, size, rowcount, modified, BOOLEAN superfile := superfile}), 15, -size), NAMED('Maiores'));

// Uso de espaço por subescopo (segunda parte do nome)
OUTPUT(SORT(TABLE(Arquivos, {STRING30 escopo := STD.Str.SplitWords(name, '::')[2],
                             UNSIGNED4 qtd := COUNT(GROUP),
                             UNSIGNED8 bytes := SUM(GROUP, size)},
                  STD.Str.SplitWords(name, '::')[2], FEW), -bytes), NAMED('EspacoPorEscopo'));

// Informações do próprio job
OUTPUT(STD.System.Job.wuid(), NAMED('MeuWorkunit'));
OUTPUT(STD.System.Job.target(), NAMED('MeuCluster'));
```

Apagar exige cuidado. `STD.File.DeleteLogicalFile(nome)` remove o arquivo; um arquivo que é subfile de um superfile **não** pode ser apagado enquanto estiver na lista (proteção contra acidente):

```ecl
IMPORT STD;

// Cria, confere e apaga um arquivo de teste
Nome := '~aluno::dia27::descartavel';
SEQUENTIAL(
  OUTPUT(DATASET([{1}, {2}, {3}], {UNSIGNED1 n}), , Nome, OVERWRITE),
  OUTPUT(STD.File.FileExists(Nome), NAMED('ExisteAntes')),
  STD.File.DeleteLogicalFile(Nome),
  OUTPUT(STD.File.FileExists(Nome), NAMED('ExisteDepois'))
);
```

# PILULA: Segurança: quem pode ler o quê

> [tecnico] Em clusters corporativos o HPCC é integrado a um diretório (LDAP/Active Directory) e as permissões são por **escopo de arquivo**: o prefixo do nome lógico. Um grupo pode ter leitura em `prod::base::publicos::*` e nenhuma em `prod::base::credito::*`. Por isso o padrão de nomes não é só organização: ele **é** o modelo de segurança. Também há permissões por funcionalidade (quem pode publicar no Roxie, fazer spray, apagar arquivos) e por workunit.

> [real] Dados de crédito, registros de motorista e informações de saúde são regulados por leis específicas (nos EUA, FCRA, DPPA, GLBA, HIPAA; no Brasil, LGPD e a Lei do Cadastro Positivo). Cada consulta de produto registra **quem** consultou, **o quê** e com que **finalidade permitida**, e as respostas são filtradas conforme essa finalidade. Um desenvolvedor não copia arquivo de produção para o escopo pessoal "só para testar". Em empresa de dados, isso é demissão, e às vezes processo.

# EXERCICIO: Expressões CRON

Mostre uma tabela com duas colunas (`descricao`, `cron`) para: (1) todo dia às 02:15; (2) de segunda a sexta às 06:00; (3) a cada 30 minutos; (4) dia 15 de cada mês à meia-noite. A ordem das linhas é a do enunciado.

```ecl

```

## DICA
Os cinco campos são: minuto, hora, dia do mês, mês, dia da semana (0 = domingo; `1-5` = segunda a sexta).

## GABARITO
```ecl
OUTPUT(DATASET([{'todo dia 02:15',        '15 2 * * *'},
                {'seg a sex 06:00',       '0 6 * * 1-5'},
                {'a cada 30 minutos',     '*/30 * * * *'},
                {'dia 15, meia-noite',    '0 0 15 * *'}], {STRING24 descricao, STRING16 cron}));
```

# EXERCICIO: Inventário de superfiles

Liste os **superfiles** do seu escopo `aluno::*` com `name` e a quantidade de subfiles de cada um (`UNSIGNED2 qtd_subfiles`), ordenado por `name`.

```ecl
IMPORT STD;

```

## DICA
Filtre `superfile = TRUE` em `LogicalFileList` e, num `PROJECT`, use `COUNT(STD.File.SuperFileContents('~' + TRIM(LEFT.name)))`.

## GABARITO
```ecl
IMPORT STD;

Supers := STD.File.LogicalFileList('aluno::*')(superfile);
OUTPUT(SORT(PROJECT(Supers,
                    TRANSFORM({STRING80 name, UNSIGNED2 qtd_subfiles},
                              SELF.name := LEFT.name;
                              SELF.qtd_subfiles := COUNT(STD.File.SuperFileContents('~' + TRIM(LEFT.name))))), name));
```

# REAL: Rotina de retenção de versões

O build de veículos do dia 26 grava uma versão nova a cada execução (`~aluno::veic::<workunit>::base` e `::key_vin`) e nunca apaga as antigas. Escreva a **rotina de retenção** que o time de operação rodaria toda semana.

Em um bloco (hthor):

1. Liste os arquivos lógicos `aluno::veic::*` que **não** são superfiles.
2. Descubra quais estão **em uso**, isto é, são subfiles de `~aluno::veic::base` ou de `~aluno::veic::key_vin`.
3. Mostre o relatório `Versoes`: `name`, `size`, `modified` e `STRING8 situacao` (`'EM USO'` ou `'ANTIGA'`), ordenado por `modified` decrescente e `name`.
4. Mostre `Resumo`: uma linha com `qtd_em_uso`, `qtd_antigas` e `bytes_liberaveis` (soma do tamanho das antigas).
5. **Não apague nada.** Em vez disso, gere em `Comandos` o texto do comando que apagaria cada versão antiga, uma linha por arquivo, no formato `STD.File.DeleteLogicalFile('~nome');`.

Se você rodou o build do dia 26 só uma vez, rode de novo antes: assim haverá uma versão antiga para a rotina encontrar.

```ecl
IMPORT STD;

```

## DICA
`SuperFileContents` devolve os nomes sem o `~`, no mesmo formato de `LogicalFileList.name`. Una as duas listas de subfiles com `+` e use um JOIN `LEFT OUTER, LOOKUP` para marcar a situação.

## GABARITO
```ecl
IMPORT STD;

Todos := STD.File.LogicalFileList('aluno::veic::*')(NOT superfile);

EmUso := STD.File.SuperFileContents('~aluno::veic::base') + STD.File.SuperFileContents('~aluno::veic::key_vin');

Layout_V := {STRING100 name, UNSIGNED8 size, STRING19 modified, STRING8 situacao};

Versoes := JOIN(Todos, EmUso,
                TRIM(LEFT.name) = TRIM(RIGHT.name),
                TRANSFORM(Layout_V,
                          SELF.situacao := IF(RIGHT.name <> '', 'EM USO', 'ANTIGA');
                          SELF := LEFT),
                LEFT OUTER, LOOKUP);

Antigas := Versoes(situacao = 'ANTIGA');

OUTPUT(SORT(Versoes, -modified, name), NAMED('Versoes'));
OUTPUT(DATASET([{COUNT(Versoes(situacao = 'EM USO')), COUNT(Antigas), SUM(Antigas, size)}],
               {UNSIGNED4 qtd_em_uso, UNSIGNED4 qtd_antigas, UNSIGNED8 bytes_liberaveis}), NAMED('Resumo'));
OUTPUT(PROJECT(SORT(Antigas, name),
               TRANSFORM({STRING160 comando}, SELF.comando := 'STD.File.DeleteLogicalFile(\'~' + TRIM(LEFT.name) + '\');')), NAMED('Comandos'));
```
Por que gerar os comandos em vez de apagar? Porque rotina de limpeza é o tipo de código que **destrói dado de produção quando tem um bug**. O padrão seguro é em duas fases: a rotina produz o relatório do que *seria* apagado; alguém (ou um segundo job, com regras rígidas como "manter sempre as 3 versões mais recentes") revisa e executa. Uma rotina de retenção de verdade também nunca apaga a versão "pai", que é a rede de segurança do dia 14.

# QUIZ

? O que `: WHEN(CRON('0 3 * * *'))` faz com um workunit?
- Executa imediatamente e termina
+ Deixa-o agendado para executar todo dia às 03:00 UTC
- Compila sem executar
- Publica no Roxie
! O workunit fica registrado no scheduler e roda a cada evento.

? Por que encadear jobs por evento (`NOTIFY`/`WHEN`) é melhor do que por horário?
- Porque eventos são mais rápidos
+ Porque o segundo job só começa quando o primeiro realmente terminou, mesmo que atrase ou adiante
- Porque o CRON não funciona no Thor
- Porque usa menos disco
! Horário fixo assume uma duração que um dia não se confirma.

? Em que fuso o `CRON` do HPCC é interpretado?
- No fuso do usuário
- No fuso do servidor web
+ UTC
- No fuso do arquivo
! Erro clássico: agendar "3h da manhã" e o job rodar à meia-noite local.

? Qual comando publica uma consulta no Roxie pela linha de comando?
- `ecl run roxie arquivo.ecl`
+ `ecl publish roxie arquivo.ecl --name=consulta --activate`
- `eclcc -syntax arquivo.ecl`
- `dfuplus action=spray`
! É o que as esteiras de entrega usam.

? Um workunit está no estado `blocked`. O que isso significa?
- Falhou por erro de sintaxe
- Foi abortado
+ Está na fila, esperando o cluster ficar disponível
- Está agendado por CRON
! Não é erro: há outro job ocupando o cluster.

? Onde normalmente aparece a causa real de um "System error" de um job Thor?
- Na lista de arquivos lógicos
+ Nos logs do workunit
- No Event Scheduler
- Na aba ECL
! A mensagem do workunit é resumida; o log tem o contexto.

? Por que funções como `LogicalFileList` e `SuperFileContents` devem rodar no hthor?
- Porque são lentas
+ Porque precisam falar com o Dali, e os workers do Thor não têm esse acesso dentro de um grafo
- Porque o Thor não tem STD
- Porque o hthor tem mais memória
! Tarefas de gerência no hthor; processamento em massa no thor.

? Em um cluster corporativo, como costuma ser controlado o acesso a arquivos?
- Por senha em cada arquivo
+ Por permissões sobre escopos (prefixos do nome lógico), integradas ao diretório da empresa
- Não há controle
- Pelo tamanho do arquivo
! O padrão de nomes é o modelo de segurança.

# FLASHCARDS

Q: Como agendar por horário?
A: `acao : WHEN(CRON('min hora dia mes dia_semana'));` — em UTC.
Q: Como um job acorda outro?
A: Job 1: `NOTIFY('evento', 'valor')`. Job 2: `acao : WHEN('evento', 'filtro');`
Q: Quatro comandos de linha essenciais.
A: `ecl run`, `ecl publish`, `eclcc -syntax`, `dfuplus`.
Q: Roteiro de investigação de um workunit.
A: Estado → primeira mensagem de erro → código que rodou → grafo/métricas → logs → arquivos de entrada.
Q: Como listar arquivos por código?
A: `STD.File.LogicalFileList('escopo::*')` no hthor.
Q: Padrão seguro para rotinas de limpeza.
A: Duas fases: relatório do que seria apagado; execução só depois de revisão/regra rígida.
Q: O que é o relatório ZAP?
A: Um pacote com todas as informações de um workunit, para anexar a chamados de suporte.
