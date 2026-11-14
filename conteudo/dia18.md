---
dia: 18
modulo: 4
titulo: Roxie: sua primeira consulta publicada
horas: 3
---

# MISSAO

> [goggins] Dezessete dias na cozinha. Hoje você abre o restaurante. No fim do dia vai existir um serviço na rede, com nome, que qualquer sistema pode chamar por HTTP e que responde em milissegundos, e foi **você** que escreveu. Para de ler e vai construir.

**Hoje você vai:**

- Entender como o Roxie funciona por dentro e o que ele **não** deve fazer.
- Receber parâmetros com `STORED`.
- Publicar uma consulta e chamá-la por formulário e por URL.
- Seguir as regras de ouro de uma consulta online.

O editor ganhou um botão: **⇪ Publicar no Roxie**. Ele compila o código para o Roxie e o publica com o nome que você der; em seguida aparece um testador que chama a consulta por HTTP e mostra o tempo de resposta.

# PILULA: O que o Roxie é (e o que não é)

> [crianca] A cozinha (Thor) recebe um pedido de bolo e leva duas horas: tudo bem, é bolo. O garçom (Roxie) recebe um pedido de água e leva três segundos. Agora imagine pedir para o **garçom** fazer o bolo, no meio do salão, enquanto 500 mesas esperam a água. É isso que acontece quando alguém põe um SORT de 1 bilhão de linhas dentro de uma consulta Roxie.

> [tecnico] O Roxie é um cluster de servidores que mantém **consultas pré-compiladas** carregadas na memória e os **índices** abertos. Cada consulta publicada é um programa pronto esperando parâmetros. Quando chega uma requisição, ele executa imediatamente, sem compilar nada, lendo só os poucos blocos de índice necessários. Milhares de requisições rodam ao mesmo tempo. Diferenças para o Thor:

| | Thor | Roxie |
|---|---|---|
| Para quê | Processar tudo | Responder uma pergunta |
| Duração típica | Minutos a horas | Milissegundos |
| Concorrência | Poucos jobs por vez | Milhares de consultas simultâneas |
| Lê | Arquivos inteiros | Índices, pontualmente |
| Código | Compilado a cada execução | Compilado uma vez, na publicação |
| Entrada | Arquivos | Parâmetros da requisição |

# PILULA: STORED: a porta de entrada dos parâmetros

> [crianca] Uma máquina de refrigerante tem **botões**. O que está dentro da máquina é sempre igual; o que muda é o botão que a pessoa aperta. `STORED` é como você instala um botão na sua consulta.

> [tecnico] `TIPO Nome := valor_padrão : STORED('NomeExterno');` declara que o valor daquela definição pode ser **fornecido de fora** em tempo de execução. Publicada no Roxie, cada `STORED` vira um campo do serviço: aparece no formulário, na URL e no JSON de entrada. Se quem chama não informar, vale o padrão. O resultado que volta para o cliente são os `OUTPUT`, e por isso todo OUTPUT de consulta leva `NAMED('...')`: é o nome do campo na resposta.

```ecl roxie
// consulta: ola_roxie
STRING20 Nome := 'mundo' : STORED('Nome');

OUTPUT('Ola, ' + TRIM(Nome) + '! Respondido pelo Roxie.', NAMED('Mensagem'));
```

Faça agora, nesta ordem:

1. Clique em **▶ Rodar** (alvo roxie): executa uma vez, com o valor padrão.
2. Clique em **⇪ Publicar no Roxie** e aceite o nome `ola_roxie`.
3. No testador que aparece, digite seu nome no campo e clique em **Chamar**. Olhe o tempo de resposta.
4. Abra o link do formulário oficial (WsECL). É a tela que o HPCC gera sozinho para cada consulta publicada.
5. Copie a URL que o testador mostra e cole numa aba nova do navegador. Você acabou de consumir um serviço web escrito em ECL.

No [ECL Watch](http://localhost:8010), em **Published Queries**, a sua consulta aparece listada, com estado e versão.

> [real] O `STORED` de teste e o de produção são o mesmo. Para testar uma consulta no hThor ou no Thor com valores de entrada sem mexer no padrão, use `#STORED('Nome', 'valor');` no começo do código: ele simula o valor que viria de fora.

# PILULA: Uma consulta de busca de verdade

```ecl roxie
// consulta: busca_pessoa_v1
IMPORT Treino;
K := Treino.Chaves;

STRING20 Sobrenome := '' : STORED('Sobrenome');
STRING20 Nome      := '' : STORED('Nome');
STRING2  Estado    := '' : STORED('Estado');

// Padroniza a entrada do mesmo jeito que o dado foi padronizado no build
IMPORT STD;
S := STD.Str.ToUpperCase(STD.Str.CleanSpaces(Sobrenome));
N := STD.Str.ToUpperCase(STD.Str.CleanSpaces(Nome));
E := STD.Str.ToUpperCase(Estado);

Lidos := LIMIT(K.PorNome(KEYED(lname_clean = S),
                         KEYED(N = '' OR fname_clean = N),
                         KEYED(E = '' OR state = E)),
               500, FAIL(301, 'Busca ampla demais: informe nome ou estado'));

Layout_Resp := RECORD
  UNSIGNED4 entidade_id;
  STRING20  nome;
  STRING20  sobrenome;
  UNSIGNED4 nascimento;
  STRING20  cidade;
  STRING2   estado;
END;

Pessoas := DEDUP(SORT(PROJECT(Lidos, TRANSFORM(Layout_Resp,
                                               SELF.nome := LEFT.fname_clean; SELF.sobrenome := LEFT.lname_clean;
                                               SELF.nascimento := LEFT.dob; SELF.cidade := LEFT.city_clean;
                                               SELF.estado := LEFT.state; SELF := LEFT)),
                      entidade_id), entidade_id);

OUTPUT(CHOOSEN(SORT(Pessoas, sobrenome, nome, entidade_id), 50), NAMED('Pessoas'));
OUTPUT(COUNT(Pessoas), NAMED('Total'));
```

Publique como `busca_pessoa_v1` e teste: `Sobrenome = garcia`, `Nome = maria`... não acha nada. Tente `Nome = mary`, `Estado = fl`. Depois só `Sobrenome = smith`, sem mais nada, e veja a sua mensagem de erro voltar.

Três detalhes de profissional neste código:

- **A entrada é padronizada igual ao dado.** O usuário digita `garcia`; o índice tem `GARCIA`. Se você não aplicar a mesma limpeza do build, nada casa.
- **Parâmetro opcional com `KEYED(N = '' OR fname_clean = N)`.** Quando `N` vem vazio, a condição vira "qualquer valor" (como um `WILD`); quando vem preenchido, usa a árvore.
- **Erro com mensagem útil.** Quem chama precisa saber o que fazer diferente.

# PILULA: As regras de ouro de uma consulta Roxie

| Regra | Por quê |
|---|---|
| Leia **só índices**, sempre com `KEYED` | Arquivo plano e varredura de índice custam segundos, e cada segundo multiplica por mil usuários |
| Todo acesso tem `LIMIT`, `ATMOST` ou `KEEP` | Uma busca ampla não pode consumir o servidor |
| Trabalho pesado fica no Thor | SORT e JOIN de poucas centenas de linhas no Roxie: ok. De milhões: nunca |
| Padronize a entrada como o dado | Senão nada casa |
| Todo `OUTPUT` tem `NAMED` | É o contrato da resposta |
| Nomes de `STORED` e de resultados não mudam depois de publicados | Há sistemas chamando; mudar o contrato quebra o cliente |

> [real] Em produção existem centenas de consultas publicadas, cada uma chamada milhões de vezes por dia por bancos, seguradoras e órgãos públicos. Uma consulta nova passa por revisão justamente nesses pontos: tem leitura sem KEYED? tem JOIN sem limite? Uma consulta ruim não fica só lenta: ela rouba recursos de todas as outras no mesmo cluster.

# EXERCICIO: Consulta com dois parâmetros

Escreva uma consulta com os parâmetros `A` e `B` (inteiros, padrão 0) que devolve dois resultados nomeados: `Soma` e `Maior` (o maior dos dois). Rode, publique como `calc_v1` e teste com 7 e 12.

```ecl roxie
// consulta: calc_v1

```

## GABARITO
```ecl roxie
// consulta: calc_v1
INTEGER A := 0 : STORED('A');
INTEGER B := 0 : STORED('B');

OUTPUT(A + B,            NAMED('Soma'));
OUTPUT(IF(A > B, A, B),  NAMED('Maior'));
```

# EXERCICIO: De quem é este telefone?

Escreva a consulta `fone_reverso_v1`: parâmetro `Telefone` (texto). Limpe a entrada deixando só dígitos, busque em `Treino.Chaves.PorFone` com `KEYED` e `LIMIT` de 50 com `SKIP`, e devolva em `Pessoas` os `entidade_id` distintos. Teste rodando com o padrão `'(474) 836-7796'`, depois publique.

```ecl roxie
// consulta: fone_reverso_v1
IMPORT Treino, STD;

```

## GABARITO
```ecl roxie
// consulta: fone_reverso_v1
IMPORT Treino, STD;

STRING20 Telefone := '(474) 836-7796' : STORED('Telefone');

F := STD.Str.Filter(Telefone, '0123456789');

Lidos := LIMIT(Treino.Chaves.PorFone(KEYED(phone = F)), 50, SKIP);
OUTPUT(DEDUP(SORT(TABLE(Lidos, {entidade_id}), entidade_id), entidade_id), NAMED('Pessoas'));
```
O padrão preenchido serve só para o teste. Antes de publicar de verdade, o padrão volta a ser `''`.

# REAL: Serviço de consulta de sinistros por segurado

A central de sinistros quer um serviço: dado o **id da pessoa**, devolver os dados cadastrais, a lista de sinistros e um resumo. Escreva e publique `sinistros_pessoa_v1`.

Parâmetro: `PessoaId` (`UNSIGNED4`, use padrão `533` enquanto testa).

Resultados nomeados:

1. `Cadastro`: do índice `PorEntidade`, **uma linha** (a de menor `id`) com `entidade_id, first_name, last_name, dob, city, state`.
2. `Sinistros`: do índice `SinistrosPorPessoa`, os sinistros da pessoa com `claim_id, claim_date, claim_type, amount, repair_shop, status`, do mais recente para o mais antigo, no máximo 100.
3. `Resumo`: uma linha com `UNSIGNED2 qtd`, `UNSIGNED4 total`, `UNSIGNED4 total_pago`, `UNSIGNED4 maior`.

Proteja as duas leituras com `LIMIT`. Depois de publicar, teste com `533`, com `1` e com `99999999` (inexistente: a consulta deve responder vazio, sem erro).

```ecl roxie
// consulta: sinistros_pessoa_v1
IMPORT Treino;
K := Treino.Chaves;

```

## DICA
`Cadastro`: `CHOOSEN(SORT(LIMIT(K.PorEntidade(KEYED(entidade_id = PessoaId)), 100, SKIP), id), 1)`. Para o resumo, um `TABLE` sem campo de grupo sobre os sinistros lidos devolve uma linha.

## GABARITO
```ecl roxie
// consulta: sinistros_pessoa_v1
IMPORT Treino;
K := Treino.Chaves;

UNSIGNED4 PessoaId := 533 : STORED('PessoaId');

Cad := LIMIT(K.PorEntidade(KEYED(entidade_id = PessoaId)), 100, SKIP);
Sinis := LIMIT(K.SinistrosPorPessoa(KEYED(person_id = PessoaId)), 1000, SKIP);

OUTPUT(CHOOSEN(SORT(TABLE(Cad, {entidade_id, id, first_name, last_name, dob, city, state}), id), 1), NAMED('Cadastro'));

OUTPUT(CHOOSEN(SORT(TABLE(Sinis, {claim_id, claim_date, claim_type, amount, repair_shop, status}), -claim_date, claim_id), 100), NAMED('Sinistros'));

OUTPUT(TABLE(Sinis, {UNSIGNED2 qtd        := COUNT(GROUP),
                   UNSIGNED4 total      := SUM(GROUP, amount),
                   UNSIGNED4 total_pago := SUM(GROUP, IF(status = 'PAID', amount, 0)),
                   UNSIGNED4 maior      := MAX(GROUP, amount)}), NAMED('Resumo'));
```
(O recordset se chama `Sinis` e não `Sin` porque `SIN` é a função seno do ECL: mais uma palavra reservada para a sua lista.) Publique e chame com `533`. Olhe o tempo: dezenas de milissegundos, com duas descidas de índice. O serviço responde igual com 30 mil ou 30 bilhões de sinistros no arquivo, porque só toca as entradas daquela pessoa. O `SKIP` nos limites faz o id inexistente devolver listas vazias em vez de erro: para o cliente, "não achei" é uma resposta normal, não uma falha.

# QUIZ

? Por que uma consulta Roxie responde rápido?
- Porque o Roxie tem mais nós que o Thor
+ Porque a consulta já está compilada e carregada, e só lê os poucos blocos de índice necessários
- Porque o Roxie guarda todas as respostas em cache
- Porque o Roxie usa SQL
! Compilada uma vez na publicação; cada chamada só executa.

? O que `STRING20 Nome := '' : STORED('Nome');` faz em uma consulta publicada?
- Grava o valor em disco
+ Declara um parâmetro de entrada chamado Nome, com padrão vazio
- Cria um índice
- Agenda a consulta
! Cada STORED vira um campo do serviço.

? Por que todo OUTPUT de consulta deve ter `NAMED`?
- Para rodar mais rápido
+ Porque o nome é o campo da resposta que o sistema cliente vai ler
- Porque o Roxie não aceita OUTPUT sem nome
- Para gravar em arquivo
! É o contrato de saída do serviço.

? O usuário digita `garcia` e o índice guarda `GARCIA`. O que a consulta deve fazer?
- Nada: o Roxie ignora maiúsculas
- Reconstruir o índice em minúsculas
+ Padronizar a entrada com as mesmas regras usadas no build (maiúsculas, sem espaços sobrando)
- Usar WILD no sobrenome
! Entrada e dado precisam passar pela mesma limpeza para casar.

? O que `KEYED(N = '' OR fname_clean = N)` faz quando `N` vem vazio?
- Dá erro
- Busca nomes vazios
+ Aceita qualquer valor nesse campo, como um WILD
- Varre o arquivo base
! É o padrão para parâmetro opcional em campo de chave.

? Qual destas operações NÃO deve estar em uma consulta Roxie?
- Leitura de índice com KEYED e LIMIT
- SORT de 200 linhas de resultado
+ JOIN entre dois arquivos planos de milhões de linhas
- DEDUP por entidade_id do que foi lido
! Trabalho pesado é do Thor; o Roxie só busca e monta a resposta.

? Para testar no hThor uma consulta com STORED, simulando um valor de entrada, usa-se...
- `OUTPUT('Nome', 'valor')`
+ `#STORED('Nome', 'valor');`
- `STORED := 'valor'`
- Não é possível
! `#STORED` injeta o valor como se viesse de fora.

# FLASHCARDS

Q: Thor × Roxie em uma linha.
A: Thor processa tudo em lote; Roxie responde uma pergunta em milissegundos lendo índices.
Q: Como declarar um parâmetro de consulta?
A: `TIPO Nome := padrão : STORED('NomeExterno');`
Q: Padrão de parâmetro opcional em campo de chave.
A: `KEYED(P = '' OR campo = P)`
Q: Regras de ouro de uma consulta Roxie.
A: Só índices com KEYED; todo acesso com LIMIT/ATMOST/KEEP; entrada padronizada; OUTPUT com NAMED; pesado fica no Thor.
Q: Como simular entrada ao testar fora do Roxie?
A: `#STORED('Nome', 'valor');`
Q: Como chamar uma consulta publicada por URL?
A: `http://servidor:8002/WsEcl/submit/query/roxie/NOME/json?Param=valor`
Q: Por que nomes de STORED e de resultados não mudam depois de publicados?
A: São o contrato do serviço; há sistemas clientes dependendo deles.
