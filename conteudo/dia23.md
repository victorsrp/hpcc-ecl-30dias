---
dia: 23
modulo: 5
titulo: Texto, XML e JSON
horas: 3
---

# MISSAO

> [goggins] Até hoje seus dados vieram em colunas bonitinhas. O mundo não é assim. O mundo manda JSON aninhado de API, XML de sistema de 1998 e texto livre digitado por um perito com pressa. Reclamar do formato não resolve nada. Quem sabe tirar estrutura do caos pega os projetos que ninguém mais consegue pegar.

**Hoje você vai:**

- Ler e gerar JSON com `FROMJSON` e `TOJSON`.
- Mapear campos com `XPATH`.
- Extrair dados de XML com `PARSE` e `XMLTEXT`.
- Extrair informação de texto livre com `PATTERN`, `RULE` e `PARSE`.

# PILULA: XPATH: o endereço de um valor

> [crianca] Num prédio, "apartamento 32, bloco B" diz exatamente onde alguém mora. Num documento JSON ou XML, cada valor também tem um endereço: "dentro de `pessoa`, dentro de `endereco`, o campo `cidade`". Esse endereço se escreve `pessoa/endereco/cidade` e se chama XPATH.

> [tecnico] Em um RECORD, `{XPATH('caminho')}` depois do nome do campo diz de onde o valor vem (na leitura) ou para onde vai (na escrita) em um documento hierárquico. Serve para renomear (`STRING nome{XPATH('name')}`), para descer níveis (`XPATH('address/city')`) e para listas. Campos filhos (`DATASET`) e conjuntos (`SET OF`) mapeiam listas do documento.

# PILULA: JSON: FROMJSON e TOJSON

> [tecnico] `FROMJSON(Layout, texto)` converte um texto JSON em **uma linha** com aquele layout. `TOJSON(linha)` faz o contrário. Para aplicar em uma coluna inteira de textos JSON, use dentro de um `PROJECT`. `ROW(...)` cria uma linha avulsa.

```ecl
Layout_End := {STRING20 cidade{XPATH('city')}, STRING2 uf{XPATH('state')}};

Layout_Pessoa := RECORD
  STRING20  nome{XPATH('name')};
  UNSIGNED1 idade{XPATH('age')};
  Layout_End endereco{XPATH('address')};
  SET OF STRING telefones{XPATH('phones')};
END;

Texto := '{"name": "Ana Smith", "age": 34, "address": {"city": "Miami", "state": "FL"}, "phones": ["3055550142", "3055550199"]}';

Linha := FROMJSON(Layout_Pessoa, Texto);

OUTPUT(Linha,                  NAMED('LinhaLida'));
OUTPUT(Linha.endereco.cidade,  NAMED('Cidade'));
OUTPUT(COUNT(Linha.telefones), NAMED('QtdTelefones'));
OUTPUT('{' + TOJSON(Linha) + '}', NAMED('DeVoltaParaJson'));
```

Uma coluna inteira de JSON (o caso real: cada linha do arquivo é uma resposta de API):

```ecl
Eventos := DATASET([{1, '{"type": "LOGIN",  "user": 533, "ip": "10.0.0.7"}'},
                    {2, '{"type": "CLAIM",  "user": 533, "amount": 45845}'},
                    {3, '{"type": "LOGIN",  "user": 12,  "ip": "10.0.0.9"}'}], {UNSIGNED4 seq, STRING200 corpo});

Layout_Ev := {STRING10 tipo{XPATH('type')}, UNSIGNED4 usuario{XPATH('user')}, STRING15 ip{XPATH('ip')}, UNSIGNED4 valor{XPATH('amount')}};

Layout_Saida := RECORD
  UNSIGNED4 seq;
  Layout_Ev;
END;

OUTPUT(PROJECT(Eventos,
               TRANSFORM(Layout_Saida,
                         SELF.seq := LEFT.seq;
                         SELF := FROMJSON(Layout_Ev, TRIM(LEFT.corpo)))));
```

Campo ausente no JSON vira vazio/zero, sem erro. Arquivos inteiros em JSON ou XML podem ser lidos direto com `DATASET('~arquivo', Layout, JSON('caminho_da_linha'))` e `XML('caminho_da_linha')`.

> [real] Dado de terceiros hoje chega quase todo como JSON. O padrão de ingestão é o que você acabou de ver: guarda-se o texto original intocado (para auditoria e para reprocessar quando o formato mudar) e extrai-se para colunas tipadas em um PROJECT.

# PILULA: XML com PARSE e XMLTEXT

> [tecnico] Para XML dentro de um campo de texto, `PARSE(dataset, campo, transform, XML('elemento'))` percorre o texto e chama o transform para **cada ocorrência** do elemento indicado. Dentro do transform, `XMLTEXT('caminho')` devolve o texto de um subelemento; `XMLTEXT('@atributo')` lê um atributo; `XMLTEXT('item[2]')` pega a segunda ocorrência.

```ecl
Docs := DATASET([{'<apolice numero="POL0000533"><segurado>Mary Jones</segurado><veiculo><marca>Ford</marca><ano>2019</ano></veiculo><veiculo><marca>Tesla</marca><ano>2023</ano></veiculo></apolice>'},
                 {'<apolice numero="POL0000001"><segurado>John Lee</segurado><veiculo><marca>Honda</marca><ano>2015</ano></veiculo></apolice>'}],
                {STRING400 xml});

// Uma linha por apólice
OUTPUT(PARSE(Docs, xml,
             TRANSFORM({STRING12 numero, STRING20 segurado, STRING12 primeira_marca},
                       SELF.numero         := XMLTEXT('@numero');
                       SELF.segurado       := XMLTEXT('segurado');
                       SELF.primeira_marca := XMLTEXT('veiculo[1]/marca')),
             XML('apolice')), NAMED('PorApolice'));

// Uma linha por veículo (o elemento que se repete)
OUTPUT(PARSE(Docs, xml,
             TRANSFORM({STRING12 marca, UNSIGNED2 ano},
                       SELF.marca := XMLTEXT('marca');
                       SELF.ano   := (UNSIGNED2)XMLTEXT('ano')),
             XML('apolice/veiculo')), NAMED('PorVeiculo'));
```

# PILULA: Texto livre com PATTERN e RULE

> [crianca] Você conhece o jeito de uma placa de carro: três letras, um espaço, quatro números. Mesmo no meio de uma redação inteira, você bate o olho e acha a placa. Você não leu a redação: reconheceu o **formato**. `PATTERN` ensina o computador a reconhecer formatos, e `RULE` combina formatos em frases.

> [tecnico] O ECL tem um analisador de texto embutido. `PATTERN` define padrões de caracteres; `TOKEN` é um padrão tratado como unidade indivisível; `RULE` combina padrões e tokens em uma estrutura. `PARSE(dataset, campo, regra, transform, opções)` procura a regra no texto de cada linha. No transform, `MATCHTEXT(padrão)` devolve o trecho que casou com aquele padrão, e `MATCHTEXT(padrão[2])` a segunda ocorrência dele na regra. É mais legível e mais poderoso que uma regex gigante, porque os pedaços têm **nome**.

```ecl
Notas := DATASET([{'Claim 30165 paid 45845 USD on 2025-12-26 to Crash Kings Auto'},
                  {'Claim 77 denied 0 USD on 2025-12-01'},
                  {'Customer called about billing. No claim.'}], {STRING200 txt});

PATTERN numero := PATTERN('[0-9]')+;
PATTERN dt     := numero '-' numero '-' numero;
PATTERN ws     := ' '+;
PATTERN estado := 'paid' | 'denied' | 'open';

RULE frase := 'Claim' ws numero ws estado ws numero ws 'USD' ws 'on' ws dt;

Extraido := PARSE(Notas, txt, frase,
                  TRANSFORM({UNSIGNED4 claim_id, STRING8 estado, UNSIGNED4 valor, STRING10 dia},
                            SELF.claim_id := (UNSIGNED4)MATCHTEXT(numero[1]);
                            SELF.estado   := MATCHTEXT(estado);
                            SELF.valor    := (UNSIGNED4)MATCHTEXT(numero[2]);
                            SELF.dia      := MATCHTEXT(dt)),
                  FIRST);
OUTPUT(Extraido);
```

A terceira nota não casa com a regra e não gera linha. `FIRST` pede só a primeira ocorrência por registro; sem ele, cada trecho que casar gera uma linha. Outras opções: `NOCASE`, `SCAN ALL`, e `NOT MATCHED` para também devolver as linhas em que nada casou.

> [real] Extração de texto livre é enorme no setor: boletins de ocorrência, laudos de sinistro, decisões judiciais, anotações de atendimento. A LexisNexis nasceu como empresa de busca em documentos jurídicos, e parte da plataforma ainda carrega esse DNA de processamento de texto. Para problemas simples, `REGEXFIND` (dia 13) resolve; quando há várias partes que você quer nomear e reaproveitar, `PATTERN`/`RULE` escala melhor.

# EXERCICIO: Lendo um JSON de transação

Converta o texto abaixo em uma linha com `txn_id`, `STRING16 loja` (do campo `merchant/name`), `STRING2 uf` (de `merchant/state`) e `DECIMAL9_2 valor` (de `amount`).

```ecl
Texto := '{"txn_id": 1002, "amount": 1299.00, "merchant": {"name": "Best Buy", "state": "FL"}}';

```

## GABARITO
```ecl
Texto := '{"txn_id": 1002, "amount": 1299.00, "merchant": {"name": "Best Buy", "state": "FL"}}';

Layout := RECORD
  UNSIGNED4  txn_id;
  STRING16   loja{XPATH('merchant/name')};
  STRING2    uf{XPATH('merchant/state')};
  DECIMAL9_2 valor{XPATH('amount')};
END;

OUTPUT(FROMJSON(Layout, Texto));
```
Quando o nome do campo no layout é igual ao do JSON (`txn_id`), o XPATH é dispensável.

# EXERCICIO: Uma linha por telefone, a partir de XML

Do XML abaixo, gere uma linha por telefone com `STRING10 tipo` (atributo `tipo`) e `STRING10 numero` (o texto do elemento).

```ecl
Docs := DATASET([{'<pessoa><nome>Ana</nome><fone tipo="casa">3055550142</fone><fone tipo="trabalho">3055550199</fone></pessoa>'},
                 {'<pessoa><nome>Bruno</nome><fone tipo="celular">4045550100</fone></pessoa>'}], {STRING300 xml});

```

## DICA
O elemento que se repete é `pessoa/fone`. O texto do próprio elemento se lê com `XMLTEXT('')`.

## GABARITO
```ecl
Docs := DATASET([{'<pessoa><nome>Ana</nome><fone tipo="casa">3055550142</fone><fone tipo="trabalho">3055550199</fone></pessoa>'},
                 {'<pessoa><nome>Bruno</nome><fone tipo="celular">4045550100</fone></pessoa>'}], {STRING300 xml});

OUTPUT(PARSE(Docs, xml,
             TRANSFORM({STRING10 tipo, STRING10 numero},
                       SELF.tipo   := XMLTEXT('@tipo');
                       SELF.numero := XMLTEXT('')),
             XML('pessoa/fone')));
```

# EXERCICIO: Achando placas em texto

Defina padrões para reconhecer uma placa no formato três letras maiúsculas seguidas de quatro dígitos (por exemplo `KXD4821`) e extraia a **primeira** placa de cada anotação. Saída: `STRING7 placa`.

```ecl
Notas := DATASET([{'Vehicle KXD4821 hit a parked car near Main St'},
                  {'Witness saw plate BTR0093 leaving the scene, also ZZP7710'},
                  {'No plate information'}], {STRING120 txt});

```

## DICA
`PATTERN letra := PATTERN('[A-Z]');`, `PATTERN digito := PATTERN('[0-9]');`, `PATTERN placa := letra letra letra digito digito digito digito;`. Uma `PATTERN` pode ser usada direto como regra do `PARSE`.

## GABARITO
```ecl
Notas := DATASET([{'Vehicle KXD4821 hit a parked car near Main St'},
                  {'Witness saw plate BTR0093 leaving the scene, also ZZP7710'},
                  {'No plate information'}], {STRING120 txt});

PATTERN letra  := PATTERN('[A-Z]');
PATTERN digito := PATTERN('[0-9]');
PATTERN placa  := letra letra letra digito digito digito digito;

OUTPUT(PARSE(Notas, txt, placa, TRANSFORM({STRING7 placa}, SELF.placa := MATCHTEXT(placa)), FIRST));
```

# REAL: Ingestão de avisos de sinistro em JSON

Uma seguradora parceira envia os avisos de sinistro por API. Cada linha do arquivo é um JSON, e o campo `note` é texto livre do atendente, onde às vezes aparece o **valor estimado** no formato `estimate 12500 USD`.

A partir dos dados abaixo, produza uma tabela com: `claim_id`, `STRING10 policy`, `UNSIGNED4 claim_date` (AAAAMMDD, convertido de `date`), `STRING10 claim_type` em maiúsculas, `STRING20 insured` (de `insured/name`), `STRING2 state` (de `insured/state`), `UNSIGNED4 estimate` (extraído da nota; 0 se não houver) e `BOOLEAN tem_estimativa`. Depois mostre um segundo resultado: a soma das estimativas por `state`, ordenada por `state`.

```ecl
IMPORT STD;

Avisos := DATASET([
  {'{"claim_id": 9001, "policy": "POL0000533", "date": "2026-11-02", "type": "injury", "insured": {"name": "Mary Jones", "state": "TX"}, "note": "Rear-end collision, neck pain. estimate 48000 USD pending doctor report"}'},
  {'{"claim_id": 9002, "policy": "POL0000001", "date": "2026-11-03", "type": "glass", "insured": {"name": "John Lee", "state": "FL"}, "note": "Windshield cracked on highway"}'},
  {'{"claim_id": 9003, "policy": "POL0000520", "date": "2026-11-03", "type": "injury", "insured": {"name": "Daniel Wright", "state": "TX"}, "note": "Passenger injured. Shop Crash Kings Auto. estimate 45500 USD"}'}
], {STRING400 corpo});

```

## DICA
Dois passos: (1) `PROJECT` com `FROMJSON` para um layout intermediário que inclui `STRING200 note` e `STRING10 date_txt{XPATH('date')}`; (2) `PROJECT` final que converte a data (`STD.Date.FromStringToDate(..., '%Y-%m-%d')`) e extrai a estimativa com `REGEXFIND('estimate ([0-9]+) USD', nota, 1)`.

## GABARITO
```ecl
IMPORT STD;

Avisos := DATASET([
  {'{"claim_id": 9001, "policy": "POL0000533", "date": "2026-11-02", "type": "injury", "insured": {"name": "Mary Jones", "state": "TX"}, "note": "Rear-end collision, neck pain. estimate 48000 USD pending doctor report"}'},
  {'{"claim_id": 9002, "policy": "POL0000001", "date": "2026-11-03", "type": "glass", "insured": {"name": "John Lee", "state": "FL"}, "note": "Windshield cracked on highway"}'},
  {'{"claim_id": 9003, "policy": "POL0000520", "date": "2026-11-03", "type": "injury", "insured": {"name": "Daniel Wright", "state": "TX"}, "note": "Passenger injured. Shop Crash Kings Auto. estimate 45500 USD"}'}
], {STRING400 corpo});

Layout_Json := RECORD
  UNSIGNED4 claim_id;
  STRING10  policy;
  STRING10  date_txt{XPATH('date')};
  STRING10  tipo{XPATH('type')};
  STRING20  insured{XPATH('insured/name')};
  STRING2   state{XPATH('insured/state')};
  STRING200 note;
END;

Lido := PROJECT(Avisos, TRANSFORM(Layout_Json, SELF := FROMJSON(Layout_Json, TRIM(LEFT.corpo))));

Layout_Final := RECORD
  UNSIGNED4 claim_id;
  STRING10  policy;
  UNSIGNED4 claim_date;
  STRING10  claim_type;
  STRING20  insured;
  STRING2   state;
  UNSIGNED4 estimate;
  BOOLEAN   tem_estimativa;
END;

Final := PROJECT(Lido,
                 TRANSFORM(Layout_Final,
                           achado := REGEXFIND('estimate ([0-9]+) USD', LEFT.note, 1);
                           SELF.claim_date     := STD.Date.FromStringToDate(LEFT.date_txt, '%Y-%m-%d');
                           SELF.claim_type     := STD.Str.ToUpperCase(LEFT.tipo);
                           SELF.estimate       := (UNSIGNED4)achado;
                           SELF.tem_estimativa := achado <> '';
                           SELF := LEFT));

OUTPUT(Final);
OUTPUT(SORT(TABLE(Final, {state, UNSIGNED4 total_estimado := SUM(GROUP, estimate)}, state, FEW), state));
```
Três formatos em um exercício: JSON aninhado (FROMJSON + XPATH), data em texto (STD.Date) e texto livre (regex com grupo de captura). É a cara de uma ingestão real. E repare em quem são os segurados dos dois avisos de lesão no Texas e em que oficina um deles já foi parar: a quadrilha continua ativa. Faltam cinco dias para você pegá-la.

# QUIZ

? O que `{XPATH('address/city')}` faz em um campo de RECORD?
- Valida o endereço
+ Indica o caminho, dentro do documento hierárquico, de onde o valor do campo é lido ou onde é escrito
- Cria um índice
- Converte o campo para maiúsculas
! É o endereço do valor em um JSON ou XML.

? O que `FROMJSON(Layout, texto)` devolve?
- Um dataset com uma linha por campo
+ Uma linha (ROW) com o layout informado
- Um texto formatado
- Um arquivo lógico
! Para uma coluna de textos, use dentro de PROJECT.

? Um campo do layout não existe no JSON lido. O que acontece?
- Erro de execução
+ O campo fica vazio ou zero
- A linha é descartada
- O campo recebe NULL
! ECL não tem NULL; ausência vira valor padrão.

? Em `PARSE(Docs, xml, TRANSFORM(...), XML('apolice/veiculo'))`, quantas linhas saem?
- Uma por documento
+ Uma por ocorrência do elemento `veiculo` dentro de `apolice`
- Uma por atributo
- Sempre uma
! O caminho em XML(...) define o elemento que gera cada linha.

? Como ler o atributo `numero` do elemento atual dentro do transform de um PARSE XML?
- `XMLTEXT('numero')`
+ `XMLTEXT('@numero')`
- `MATCHTEXT(numero)`
- `XPATH('numero')`
! O `@` indica atributo.

? Para que serve `MATCHTEXT(padrão[2])`?
- Para repetir o padrão duas vezes
+ Para obter o texto da segunda ocorrência daquele padrão dentro da regra
- Para casar apenas textos de 2 caracteres
- Para ignorar a primeira linha
! Quando o mesmo padrão aparece mais de uma vez na RULE, o índice escolhe qual.

? Por que guardar o texto JSON original além das colunas extraídas?
- Porque o Thor exige
+ Para auditoria e para reprocessar quando o formato da fonte mudar
- Porque colunas tipadas ocupam mais espaço
- Para acelerar os JOINs
! O original é a única fonte fiel; a extração pode precisar ser refeita.

# FLASHCARDS

Q: Como mapear um campo para um caminho do documento?
A: `TIPO nome{XPATH('caminho/no/documento')};`
Q: JSON em linha e linha em JSON.
A: `FROMJSON(Layout, texto)` e `TOJSON(linha)`.
Q: Como aplicar FROMJSON em uma coluna inteira?
A: `PROJECT(ds, TRANSFORM(Layout, SELF := FROMJSON(Layout, TRIM(LEFT.campo))))`
Q: PARSE de XML.
A: `PARSE(ds, campo, TRANSFORM(..., XMLTEXT('sub'), XMLTEXT('@atrib')), XML('elemento'))`
Q: PATTERN, TOKEN, RULE.
A: PATTERN: formato de caracteres; TOKEN: padrão indivisível; RULE: combinação de padrões em uma estrutura.
Q: Como pegar o trecho casado?
A: `MATCHTEXT(padrão)`; `MATCHTEXT(padrão[n])` para a n-ésima ocorrência.
Q: Como ler um arquivo JSON inteiro?
A: `DATASET('~arquivo', Layout, JSON('caminho_da_linha'))`
