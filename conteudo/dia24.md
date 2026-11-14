---
dia: 24
modulo: 5
titulo: Mundo externo: serviços, C++, Python e limites
horas: 3
---

# MISSAO

> [goggins] O HPCC não vive numa ilha. O Thor chama serviços, o Roxie chama outros Roxies, e de vez em quando existe uma biblioteca em C++ ou Python que faz exatamente o que você precisa. Hoje você aprende a abrir a porta para o mundo de fora, e, mais importante, aprende **quando deixar a porta fechada**. Ferramenta poderosa na mão de quem não pensa vira incidente.

**Hoje você vai:**

- Chamar serviços web a partir do ECL com `SOAPCALL`.
- Tratar falhas de rede: `TIMEOUT`, `RETRY`, `ONFAIL`.
- Embutir C++ e Python no ECL.
- Saber os custos e os limites de cada um.

O ambiente do curso publicou no Roxie a consulta `ecl30_resumo_pessoa`: recebe `PessoaId` e devolve o resultado `Resumo` com `pessoa_id, qtd, total, total_pago` dos sinistros da pessoa. Teste no navegador: [resumo da pessoa 533](http://localhost:8002/WsEcl/submit/query/roxie/ecl30_resumo_pessoa/json?PessoaId=533).

# PILULA: SOAPCALL: o ECL chamando um serviço

> [crianca] Você está fazendo a lição e não sabe uma resposta. Liga para um amigo, pergunta, espera, anota o que ele disse e continua a lição. `SOAPCALL` é o seu código fazendo essa ligação: manda uma pergunta para outro sistema e usa a resposta.

> [tecnico] `SOAPCALL` envia uma requisição a um serviço web e converte a resposta em linhas ECL. Toda consulta Roxie é um serviço SOAP/JSON, então é assim que um job Thor ou outra consulta **reusa** uma consulta publicada. Os ingredientes: a URL, o nome do serviço, o layout da **requisição** (os nomes dos campos são os `STORED` do serviço), o layout da **resposta** e o `XPATH` que diz onde, dentro da resposta, estão as linhas.

Dentro do cluster, os serviços têm nomes internos de rede: `http://eclqueries:8002` é o WsECL e `http://roxie:9876` é o Roxie direto. (O `localhost:8002` do seu navegador só existe do lado de fora.)

```ecl
// Requisição: os campos são os parâmetros do serviço; aqui com valor fixo
Requisicao := {UNSIGNED4 PessoaId{XPATH('PessoaId')} := 533};

// Resposta: os campos do resultado "Resumo"
Resposta := {UNSIGNED4 pessoa_id, UNSIGNED2 qtd, UNSIGNED4 total, UNSIGNED4 total_pago};

Resultado := SOAPCALL('http://eclqueries:8002/WsEcl/soap/query/roxie/ecl30_resumo_pessoa',
                      'ecl30_resumo_pessoa',
                      Requisicao,
                      DATASET(Resposta),
                      XPATH('ecl30_resumo_pessoaResponse/Results/Result/Dataset[@name="Resumo"]/Row'),
                      TIMEOUT(5), RETRY(3));

OUTPUT(Resultado);
```

`TIMEOUT(5), RETRY(3)`: espera no máximo 5 segundos e tenta até 3 vezes de novo. Você vai entender por que isso nunca deve faltar daqui a duas pílulas.

O `XPATH` segue a estrutura da resposta SOAP de qualquer consulta Roxie: `NomeDaConsultaResponse/Results/Result/Dataset[@name="NomeDoResultado"]/Row`.

# PILULA: Uma chamada por linha

> [tecnico] A forma mais usada recebe um **dataset de entrada** e faz uma chamada para cada registro: `SOAPCALL(dataset, url, serviço, LayoutRequisição, transform, DATASET(LayoutResposta), opções)`. O transform monta a requisição a partir de cada linha (`LEFT`). As chamadas são feitas em paralelo.

```ecl
Alvos := DATASET([{533}, {520}, {1}, {99999999}], {UNSIGNED4 pid});

Requisicao := {UNSIGNED4 PessoaId{XPATH('PessoaId')}};
Resposta   := {UNSIGNED4 pessoa_id, UNSIGNED2 qtd, UNSIGNED4 total, UNSIGNED4 total_pago};

Resumos := SOAPCALL(Alvos,
                    'http://eclqueries:8002/WsEcl/soap/query/roxie/ecl30_resumo_pessoa',
                    'ecl30_resumo_pessoa',
                    Requisicao,
                    TRANSFORM(Requisicao, SELF.PessoaId := LEFT.pid),
                    DATASET(Resposta),
                    XPATH('ecl30_resumo_pessoaResponse/Results/Result/Dataset[@name="Resumo"]/Row'),
                    TIMEOUT(5), RETRY(3), ONFAIL(SKIP));

OUTPUT(SORT(Resumos, pessoa_id));
```

| Opção | Efeito |
|---|---|
| `TIMEOUT(segundos)` | Quanto esperar por uma resposta |
| `RETRY(n)` | Quantas vezes tentar de novo |
| `ONFAIL(SKIP)` | Se falhar de vez, descarta aquela linha e segue |
| `ONFAIL(transform)` | Se falhar, gera uma linha "de erro" com `FAILCODE` e `FAILMESSAGE` |
| `PARALLEL(n)` | Quantas chamadas simultâneas |
| `MERGE(n)` | Agrupa `n` linhas em uma requisição só (o serviço precisa aceitar) |

> [cuidado] Rede **falha**. Sempre. Um SOAPCALL sem `TIMEOUT` e sem `ONFAIL` em um job de 50 milhões de linhas significa que **uma** resposta lenta trava ou derruba o job inteiro depois de 6 horas rodando. Decida de antemão o que acontece quando a chamada não volta: pular, marcar ou abortar. E faça as contas: 50 milhões de chamadas a 20 ms, 100 em paralelo, ainda são quase 3 horas, e o serviço do outro lado precisa aguentar. Quando o volume é grande, o certo é trazer o **dado** e fazer JOIN no Thor, não chamar serviço linha a linha.

# PILULA: HTTPCALL e serviços REST

`HTTPCALL(url, método, tipo, LayoutResposta, XPATH(...))` faz uma chamada HTTP simples (GET) e converte a resposta. É o caminho para APIs REST que devolvem JSON ou XML.

```ecl nao-rodar
Resposta := {UNSIGNED4 pessoa_id{XPATH('pessoa_id')}, UNSIGNED2 qtd{XPATH('qtd')}, UNSIGNED4 total{XPATH('total')}};

R := HTTPCALL('http://servico.exemplo/api/resumo?id=533', 'GET', 'application/json',
              Resposta, XPATH('resumo'));
OUTPUT(R);
```

> [real] Dentro da LexisNexis, a composição de produtos é feita assim: a consulta "relatório completo" chama por SOAPCALL as consultas de endereço, veículos, imóveis e processos, cada uma mantida por um time diferente, e monta a resposta. Chamadas para **fora** da empresa são raras e muito controladas: cada dependência externa é um ponto de falha que você não controla.

# PILULA: C++ embutido

> [crianca] Sua caixa de LEGO tem quase tudo. Mas um dia você precisa de uma peça com um formato que não existe na caixa. Então você mesmo **molda** a peça e encaixa. O encaixe é igual ao das outras; só o miolo é que foi você quem fez.

> [tecnico] O ECL é compilado para C++, então escrever uma função diretamente em C++ é natural: `BEGINC++ ... ENDC++` ou `EMBED(C++) ... ENDEMBED`. O protótipo é ECL; o corpo é C++. Parâmetros `STRING` chegam como comprimento (`lenNome`) e ponteiro (`nome`); o retorno de um `STRING` é feito por `__lenResult` e `__result`. Use para algoritmos que não existem na biblioteca e são críticos em desempenho: um cálculo de dígito verificador, uma distância especial, um hash.

```ecl
// Soma dos dígitos de um texto (base de vários dígitos verificadores)
UNSIGNED4 SomaDigitos(STRING s) := BEGINC++
  #option pure
  unsigned total = 0;
  for (unsigned i = 0; i < lenS; i++)
    if (s[i] >= '0' && s[i] <= '9') total += s[i] - '0';
  return total;
ENDC++;

// Inverte um texto
STRING Inverte(STRING s) := EMBED(C++)
  char * saida = (char *)rtlMalloc(lenS);
  for (unsigned i = 0; i < lenS; i++) saida[i] = s[lenS - 1 - i];
  __lenResult = lenS;
  __result = saida;
ENDEMBED;

OUTPUT(SomaDigitos('987-90-3038'), NAMED('SomaDosDigitos'));
OUTPUT(Inverte('ROXIE'),           NAMED('Invertido'));
```

`#option pure` avisa o compilador que a função não tem efeitos colaterais: mesmo argumento, mesmo resultado, o que libera otimizações.

# PILULA: Python embutido

> [tecnico] `IMPORT Python3 AS Python;` habilita `EMBED(Python)`. O corpo é Python comum; os tipos são convertidos automaticamente (inteiros, textos, conjuntos, e até datasets viram listas). É a porta para o ecossistema Python: bibliotecas científicas, modelos, validações já prontas.

```ecl
IMPORT Python3 AS Python;

// Algoritmo de Luhn: valida número de cartão de crédito
BOOLEAN LuhnOk(STRING numero) := EMBED(Python)
  digitos = [int(c) for c in numero if c.isdigit()]
  if len(digitos) < 12:
      return False
  total = 0
  for i, d in enumerate(reversed(digitos)):
      if i % 2 == 1:
          d = d * 2
          if d > 9:
              d -= 9
      total += d
  return total % 10 == 0
ENDEMBED;

Cartoes := DATASET([{'4539 1488 0343 6467'}, {'4539 1488 0343 6468'}, {'1234'}], {STRING20 numero});
OUTPUT(PROJECT(Cartoes, TRANSFORM({STRING20 numero, BOOLEAN valido}, SELF.valido := LuhnOk(LEFT.numero); SELF := LEFT)));
```

> [cuidado] Cada chamada cruza a fronteira entre o motor em C++ e o interpretador Python, o que custa **ordens de grandeza** mais que uma função ECL nativa. Em 12 linhas, tanto faz. Em 2 bilhões, é a diferença entre 10 minutos e um dia. Ordem de preferência: (1) ECL nativo e `STD`; (2) C++ embutido, quando o desempenho importa; (3) Python, quando a biblioteca justifica e o volume é moderado, ou passando o dataset inteiro de uma vez em vez de linha a linha.

# PILULA: PIPE e por que ele está trancado

`PIPE('comando', Layout)` executa um **programa do sistema operacional** e lê a saída como dataset. Experimente:

```ecl erro
OUTPUT(PIPE('echo ola', {STRING linha}, CSV));
```

O cluster recusou: `Unauthorized pipe program`. Não é defeito, é segurança: rodar comandos arbitrários nos servidores do cluster é um risco enorme, então o administrador libera apenas uma lista de programas autorizados (ou nenhum).

> [real] Em ambientes regulados (dados de crédito, saúde, registros públicos) tudo o que sai do "mundo ECL" é auditado: programas via PIPE, bibliotecas embutidas, chamadas externas. Antes de desenhar uma solução que depende disso, pergunte ao time de plataforma o que é permitido. Descobrir no dia da entrega que seu job não pode rodar em produção é um erro de principiante.

# EXERCICIO: Resumo de uma pessoa por SOAPCALL

Chame `ecl30_resumo_pessoa` para a pessoa `520` e mostre o resultado.

```ecl

```

## GABARITO
```ecl
Requisicao := {UNSIGNED4 PessoaId{XPATH('PessoaId')} := 520};
Resposta   := {UNSIGNED4 pessoa_id, UNSIGNED2 qtd, UNSIGNED4 total, UNSIGNED4 total_pago};

OUTPUT(SOAPCALL('http://eclqueries:8002/WsEcl/soap/query/roxie/ecl30_resumo_pessoa',
                'ecl30_resumo_pessoa', Requisicao, DATASET(Resposta),
                XPATH('ecl30_resumo_pessoaResponse/Results/Result/Dataset[@name="Resumo"]/Row'),
                TIMEOUT(5), RETRY(3)));
```

# EXERCICIO: Função em C++

Escreva em C++ embutido a função `UNSIGNED4 ContaVogais(STRING s)` que conta as vogais (maiúsculas ou minúsculas). Mostre o resultado para `'Enterprise Control Language'`.

```ecl

```

## GABARITO
```ecl
UNSIGNED4 ContaVogais(STRING s) := BEGINC++
  #option pure
  unsigned n = 0;
  for (unsigned i = 0; i < lenS; i++) {
    char c = s[i] | 0x20;   // transforma em minúscula
    if (c == 'a' || c == 'e' || c == 'i' || c == 'o' || c == 'u') n++;
  }
  return n;
ENDC++;

OUTPUT(ContaVogais('Enterprise Control Language'));
```

# EXERCICIO: Função em Python

Escreva em Python embutido a função `STRING Iniciais(STRING nome)` que devolve as iniciais em maiúsculas (por exemplo `'mary ann jones'` → `'MAJ'`). Aplique nos três nomes abaixo.

```ecl
IMPORT Python3 AS Python;
Nomes := DATASET([{'mary ann jones'}, {'john lee'}, {'  robert   de la cruz '}], {STRING40 nome});

```

## GABARITO
```ecl
IMPORT Python3 AS Python;
Nomes := DATASET([{'mary ann jones'}, {'john lee'}, {'  robert   de la cruz '}], {STRING40 nome});

STRING Iniciais(STRING nome) := EMBED(Python)
  return ''.join(p[0].upper() for p in nome.split())
ENDEMBED;

OUTPUT(PROJECT(Nomes, TRANSFORM({STRING40 nome, STRING10 iniciais}, SELF.iniciais := Iniciais(LEFT.nome); SELF := LEFT)));
```

# REAL: Enriquecimento de uma lista de investigação

A unidade de investigação mandou uma lista de 8 pessoas para análise prioritária. Você precisa enriquecer a lista chamando o serviço `ecl30_resumo_pessoa`, **sem perder nenhuma linha**, mesmo que a chamada falhe ou a pessoa não tenha sinistros.

Entregue uma tabela com as 8 pessoas, ordenada por `total_pago` decrescente e `pid`, com: `pid`, `motivo`, `qtd`, `total`, `total_pago` e `STRING10 prioridade` (`'URGENTE'` se `total_pago >= 200000`; `'ALTA'` se `total_pago >= 50000`; senão `'NORMAL'`).

```ecl
Lista := DATASET([{533, 'denuncia'}, {520, 'denuncia'}, {504, 'auditoria'}, {1, 'amostra'},
                  {2, 'amostra'}, {536, 'denuncia'}, {99999999, 'id invalido'}, {13468, 'amostra'}],
                 {UNSIGNED4 pid, STRING12 motivo});

```

## DICA
O SOAPCALL com `ONFAIL(SKIP)` devolve só as linhas que deram certo e que tiveram resposta. Para não perder ninguém, faça depois um JOIN `LEFT OUTER` da lista original com os resumos (`LEFT.pid = RIGHT.pessoa_id`).

## GABARITO
```ecl
Lista := DATASET([{533, 'denuncia'}, {520, 'denuncia'}, {504, 'auditoria'}, {1, 'amostra'},
                  {2, 'amostra'}, {536, 'denuncia'}, {99999999, 'id invalido'}, {13468, 'amostra'}],
                 {UNSIGNED4 pid, STRING12 motivo});

Requisicao := {UNSIGNED4 PessoaId{XPATH('PessoaId')}};
Resposta   := {UNSIGNED4 pessoa_id, UNSIGNED2 qtd, UNSIGNED4 total, UNSIGNED4 total_pago};

Resumos := SOAPCALL(Lista,
                    'http://eclqueries:8002/WsEcl/soap/query/roxie/ecl30_resumo_pessoa',
                    'ecl30_resumo_pessoa',
                    Requisicao,
                    TRANSFORM(Requisicao, SELF.PessoaId := LEFT.pid),
                    DATASET(Resposta),
                    XPATH('ecl30_resumo_pessoaResponse/Results/Result/Dataset[@name="Resumo"]/Row'),
                    TIMEOUT(5), RETRY(3), ONFAIL(SKIP));

Layout_Final := RECORD
  UNSIGNED4 pid;
  STRING12  motivo;
  UNSIGNED2 qtd;
  UNSIGNED4 total;
  UNSIGNED4 total_pago;
  STRING10  prioridade;
END;

Final := JOIN(Lista, Resumos,
              LEFT.pid = RIGHT.pessoa_id,
              TRANSFORM(Layout_Final,
                        SELF.prioridade := MAP(RIGHT.total_pago >= 200000 => 'URGENTE',
                                               RIGHT.total_pago >= 50000  => 'ALTA',
                                               'NORMAL');
                        SELF := LEFT;
                        SELF := RIGHT),
              LEFT OUTER, KEEP(1));

OUTPUT(SORT(Final, -total_pago, pid));
```
O padrão "chama o serviço com `ONFAIL(SKIP)` e depois `LEFT OUTER` com a lista original" é o jeito seguro de enriquecer: falha de rede vira linha sem dados em vez de linha perdida. Para 8 pessoas, SOAPCALL é perfeito. Para 8 milhões, você leria `Treino.Chaves.SinistrosPorPessoa` direto no Thor com um JOIN: mesma informação, sem 8 milhões de viagens de rede.

# QUIZ

? Para que serve o SOAPCALL?
- Para publicar uma consulta no Roxie
+ Para o código ECL chamar um serviço web e usar a resposta como linhas
- Para compilar C++
- Para fazer spray de arquivos
! É como Thor e Roxie reutilizam consultas publicadas e serviços externos.

? No layout de requisição de um SOAPCALL para uma consulta Roxie, os nomes dos campos correspondem a quê?
- Aos nomes dos índices
- Aos nomes dos resultados
+ Aos nomes dos `STORED` (parâmetros) da consulta
- Aos nomes dos nós do cluster
! A requisição preenche os parâmetros de entrada do serviço.

? O que `ONFAIL(SKIP)` faz?
- Repete a chamada até dar certo
+ Descarta a linha cuja chamada falhou e continua o job
- Aborta o workunit
- Ignora o TIMEOUT
! Sem ONFAIL, uma falha derruba o job inteiro.

? Você precisa de um dado de serviço para 40 milhões de linhas. Qual a abordagem mais adequada?
- SOAPCALL linha a linha sem limite
- SOAPCALL com PARALLEL(1000)
+ Obter o dado em arquivo/índice e fazer JOIN no Thor
- EMBED(Python) com requisições HTTP
! Em grande volume, mover o dado para perto do processamento vence milhões de viagens de rede.

? Em C++ embutido, como um parâmetro `STRING s` chega ao corpo da função?
- Como um objeto std::string
+ Como comprimento `lenS` e ponteiro `s`
- Como um arquivo
- Como JSON
! Strings ECL não terminam em zero; o comprimento vem separado.

? Qual é a ordem de preferência recomendada para implementar uma função?
- Python, C++, ECL
- C++, Python, ECL
+ ECL nativo/STD, depois C++ embutido, depois Python
- Tanto faz
! Cada passo para fora do motor custa mais por chamada.

? Por que o `PIPE` costuma ser bloqueado?
- Porque é lento
+ Porque executa programas do sistema operacional nos servidores do cluster, o que é um risco de segurança
- Porque só funciona no Windows
- Porque não aceita layouts
! O administrador autoriza apenas programas específicos, quando autoriza.

# FLASHCARDS

Q: Forma de SOAPCALL com dataset de entrada.
A: `SOAPCALL(ds, url, 'servico', LayoutReq, TRANSFORM(LayoutReq, ...LEFT...), DATASET(LayoutResp), XPATH(...), opções)`
Q: XPATH da resposta SOAP de uma consulta Roxie.
A: `NomeResponse/Results/Result/Dataset[@name="Resultado"]/Row`
Q: Três opções obrigatórias em SOAPCALL de produção.
A: `TIMEOUT(s)`, `RETRY(n)`, `ONFAIL(SKIP ou transform)`.
Q: Padrão de enriquecimento seguro por serviço.
A: SOAPCALL com ONFAIL(SKIP) + JOIN LEFT OUTER com a lista original.
Q: Como embutir C++?
A: `TIPO Nome(params) := BEGINC++ ... ENDC++;` ou `EMBED(C++) ... ENDEMBED;`
Q: Como embutir Python?
A: `IMPORT Python3 AS Python;` e `TIPO Nome(params) := EMBED(Python) ... ENDEMBED;`
Q: Quando NÃO chamar serviço linha a linha?
A: Em grande volume: traga o dado e faça JOIN no Thor.
