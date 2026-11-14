> [goggins] 30 dias. Um por vez. Você não precisa estar motivado, precisa aparecer. No dia 30 você vai pegar dado cru e sujo e entregar um serviço de busca no ar. Ninguém te deu isso: você construiu.

## O que você vai conseguir fazer no dia 30

No último dia você constrói, sozinho e do zero, um produto completo no estilo dos que a LexisNexis Risk Solutions opera em produção:

1. **Ingerir** arquivos crus (CSV) de pessoas, veículos e sinistros de seguro para dentro do Thor.
2. **Perfilar e limpar** os dados: padronizar nomes, datas, telefones, tratar campos vazios e lixo.
3. **Resolver identidades**: descobrir que "Bob Smith", "ROBERT SMITH" e "Robert Smiht" são a mesma pessoa e dar a ela um identificador único (o princípio por trás do LexID).
4. **Montar o arquivo base** com histórico e versões usando superfiles, do jeito que um build diário de produção funciona.
5. **Detectar uma quadrilha de fraude** de seguros escondida nos dados, cruzando pessoas, oficinas e valores.
6. **Construir índices** e **publicar no Roxie** uma consulta de busca de pessoa com nota de risco, que responde em milissegundos por HTTP/JSON.
7. **Ler o grafo de execução**, achar gargalo (skew, join errado, sort desnecessário) e consertar.
8. **Explicar cada decisão** como quem senta na cadeira de engenheiro de dados sênior.

Preview do tipo de código que você vai escrever sem consultar nada:

```ecl nao-rodar
IMPORT Treino, STD;

// 1) Thor: liga cada sinistro à identidade resolvida e calcula sinais de risco
SinaisPorPessoa := TABLE(Treino.Arquivos.SinistrosComId,
                         {entidade_id,
                          UNSIGNED2 qtd_sinistros := COUNT(GROUP),
                          UNSIGNED4 total_pago    := SUM(GROUP, amount),
                          UNSIGNED2 qtd_lesao     := COUNT(GROUP, claim_type = 'INJURY')},
                         entidade_id, MERGE);

// 2) Índice com payload para o Roxie não precisar ir ao disco duas vezes
ChaveRisco := INDEX(SinaisPorPessoa, {entidade_id}, {SinaisPorPessoa}, '~ecl30::key::risco');

// 3) Roxie: consulta publicada, resposta em milissegundos
STRING25 Sobrenome := '' : STORED('Sobrenome');
STRING2  Estado    := '' : STORED('Estado');
Achados := LIMIT(Treino.Chaves.PorNome(KEYED(last_name = Sobrenome), WILD(first_name), state = Estado),
                 500, FAIL(99, 'Busca ampla demais: refine os filtros'));
Resposta := JOIN(Achados, ChaveRisco, KEYED(LEFT.entidade_id = RIGHT.entidade_id),
                 TRANSFORM(Treino.Layouts.RespostaBusca, SELF := LEFT, SELF := RIGHT), LEFT OUTER, KEEP(1));
OUTPUT(CHOOSEN(SORT(Resposta, -total_pago), 50), NAMED('Resultado'));
```

Hoje isso parece grego. No dia 30 você escreve de cabeça.

## Fontes

Todo o conteúdo segue a documentação oficial da HPCC Systems (página [Learning ECL](https://hpccsystems.com/training/documentation/learning-ecl/)): ECL Language Reference, Standard Library Reference, ECL Programmer's Guide, Data Tutorial (Thor e Roxie), ECL Best Practices, Data Handling, ECL Scheduler, ECL Playground e Dynamic ESDL. Os casos práticos reproduzem, com dados fictícios, os tipos de problema que a LexisNexis Risk Solutions resolve com a plataforma: busca de pessoas, vínculo de registros, fraude em seguros, crédito e cobrança.

## Módulo 1 · Fundamentos (dias 1 a 5)

| Dia | Tema | Você sai sabendo |
|---|---|---|
| 1 | HPCC, Thor, Roxie e seu primeiro ECL | O que é cada peça, definição x ação, tipos, operadores, IF/MAP |
| 2 | RECORD, DATASET e filtros | Criar tabelas, filtrar, conjuntos, COUNT/EXISTS |
| 3 | Ordenar, cortar e resumir | SORT, DEDUP, CHOOSEN, TOPN, agregações |
| 4 | TRANSFORM e PROJECT | Criar e mudar colunas, textos e datas com a biblioteca padrão |
| 5 | TABLE agrupada e funções | Group by, funções próprias · **Desafio + Teste do módulo 1** |

## Módulo 2 · Dados de verdade no Thor (dias 6 a 10)

| Dia | Tema | Você sai sabendo |
|---|---|---|
| 6 | Arquivos: landing zone, spray e arquivos lógicos | Trazer CSV para o cluster, ler e gravar arquivos |
| 7 | JOIN parte 1 | Inner, outer, only, transform de join, explosão de linhas |
| 8 | JOIN parte 2 | LOOKUP, ALL, KEEP, ATMOST, LIMIT, self-join |
| 9 | MODULE, IMPORT e organização de repositório | Código reutilizável como em time de produção |
| 10 | ITERATE, ROLLUP e GROUP | Processar linha a linha e consolidar · **Desafio + Teste do módulo 2** |

## Módulo 3 · Transformações avançadas (dias 11 a 15)

| Dia | Tema | Você sai sabendo |
|---|---|---|
| 11 | Dados aninhados: NORMALIZE e DENORMALIZE | Datasets filhos, pai-filho |
| 12 | Como o Thor distribui: DISTRIBUTE, LOCAL e skew | Pensar em paralelo, ler grafos |
| 13 | Limpeza e padronização | Regex, STD.Str, perfil de dados |
| 14 | Workflow e superfiles | PERSIST, SEQUENTIAL, builds versionados |
| 15 | Vínculo de registros (entity resolution) | Dedup inteligente, match aproximado · **Desafio + Teste do módulo 3** |

## Módulo 4 · Índices e Roxie (dias 16 a 20)

| Dia | Tema | Você sai sabendo |
|---|---|---|
| 16 | INDEX e BUILD | Chave, payload, filtros KEYED/WILD |
| 17 | JOIN com índice | Half-keyed, full-keyed, limites |
| 18 | Roxie: sua primeira consulta publicada | STORED, publicar, chamar por HTTP/JSON |
| 19 | Projeto de consultas Roxie | Múltiplas chaves, LIMIT, erros, superkeys |
| 20 | Serviço de busca de ponta a ponta | **Desafio + Teste do módulo 4** |

## Módulo 5 · ECL avançado (dias 21 a 25)

| Dia | Tema | Você sai sabendo |
|---|---|---|
| 21 | MACRO, FUNCTIONMACRO e linguagem de template | Código genérico que gera código |
| 22 | LOOP, AGGREGATE, DICTIONARY, INTERFACE | Estruturas para problemas difíceis |
| 23 | Texto, XML e JSON | PARSE, XPATH, FROMJSON/TOJSON |
| 24 | Mundo externo | SOAPCALL/HTTPCALL, C++ e Python embutidos, PIPE |
| 25 | Performance e depuração | Grafos, skew, anti-padrões · **Desafio + Teste do módulo 5** |

## Módulo 6 · Produção e casos reais (dias 26 a 30)

| Dia | Tema | Você sai sabendo |
|---|---|---|
| 26 | Pipeline de build de produção | Ingestão → limpeza → base → chaves, com versões |
| 27 | Automação e operação | Scheduler, eventos, linha de comando, ECL Watch a fundo |
| 28 | Caso real: quadrilha de fraude em seguros | Investigar ligações entre pessoas e oficinas |
| 29 | Caso real: produto Roxie com nota de risco | Busca aproximada, pontuação, serviço em lote |
| 30 | Projeto final e prova final | **Tudo junto, sozinho, do zero** |

## Rotina diária (2h30 a 4h)

1. **5 min** · Revisão espaçada: zere os cartões devidos.
2. **Missão** · Leia o objetivo do dia.
3. **Pílulas** · Cada uma tem a explicação "para criança", a versão técnica e código que roda. Mexa no código.
4. **Exercícios de fixação** · Faça sem olhar o gabarito. Botão "Conferir" compara seu resultado com o esperado.
5. **Caso do dia a dia** · Um problema com cara de trabalho real.
6. **Quiz** · 80% para liberar o próximo dia.
7. **Relatório pós-ação** · Explique o dia com suas palavras.
