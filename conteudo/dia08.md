---
dia: 8
modulo: 2
titulo: JOIN parte 2: opções que separam júnior de sênior
horas: 3.5
---

# MISSAO

> [goggins] Ontem você aprendeu a fazer JOIN. Hoje você aprende a fazer JOIN **que não derruba o cluster**. A diferença entre um job de 4 minutos e um de 4 horas quase sempre é uma palavra no final do JOIN. Júnior não sabe que essas palavras existem. Você vai saber.

**Hoje você vai:**

- Usar `LOOKUP` quando um lado é pequeno.
- Usar `ALL` quando a condição não é de igualdade.
- Controlar a quantidade de pares com `KEEP`, `ATMOST` e `LIMIT`.
- Fazer self-join para achar pares dentro da mesma tabela.
- Entender o que é *skew* e por que chave vazia é veneno.

# PILULA: LOOKUP: a colinha em cima da mesa

> [crianca] Cada um dos 400 trabalhadores precisa trocar siglas por nomes: "FL" vira "Flórida". Jeito bobo: juntar todos os papéis de todo mundo num salão, ordenar tudo e procurar. Jeito esperto: tirar 400 cópias da **colinha** de siglas e pôr uma na mesa de cada trabalhador. Ninguém sai do lugar.

> [tecnico] Num JOIN normal o Thor reorganiza **as duas** tabelas pela chave. Com `LOOKUP`, a tabela da **direita** é carregada inteira na memória de cada nó, como uma tabela hash, e a esquerda é só percorrida, sem sort e sem redistribuição. Requisitos: a direita tem que caber na memória (regra prática: até alguns milhões de linhas finas) e a condição precisa ter igualdade. Por padrão `LOOKUP` supõe **no máximo um par** por registro da esquerda (pega o primeiro); se a direita pode ter vários por chave, use `MANY LOOKUP`.

```ecl
IMPORT Aula;

Layout_UF := {STRING2 sigla, STRING12 nome_estado, STRING10 regiao};
Estados := DATASET([{'FL','Florida','Sudeste'}, {'GA','Georgia','Sudeste'}, {'TX','Texas','Sul'},
                    {'NY','New York','Nordeste'}, {'CA','California','Oeste'}], Layout_UF);

Layout_Saida := RECORD
  UNSIGNED4 id;
  STRING10  nome;
  STRING12  nome_estado;
  STRING10  regiao;
END;

ComRegiao := JOIN(Aula.Clientes, Estados,
                  LEFT.estado = RIGHT.sigla,
                  TRANSFORM(Layout_Saida, SELF := LEFT; SELF := RIGHT),
                  LEFT OUTER, LOOKUP);
OUTPUT(ComRegiao);
```

Novidade de sintaxe: `{STRING2 sigla, ...}` é um RECORD escrito de forma curta, entre chaves. Serve para layouts pequenos.

> [real] Tabelas de código (estados, tipos de sinistro, códigos de ocupação, faixas de CEP) são o caso clássico. Em produção: 8 bilhões de registros à esquerda, uma tabela de 50 mil códigos à direita, `LOOKUP`. O job passa pelos 8 bilhões uma vez só, sem ordenar nada.

# PILULA: ALL: quando não existe igualdade

> [tecnico] Todo JOIN normal precisa de pelo menos uma igualdade (`LEFT.a = RIGHT.b`) para o Thor saber em que nó os pares se encontram. Quando a condição é só de **faixa** ou desigualdade (`LEFT.valor BETWEEN RIGHT.minimo AND RIGHT.maximo`), use `ALL`: a direita vai inteira para a memória de cada nó e cada registro da esquerda é comparado com **todos** os da direita. Só é viável com a direita pequena.

```ecl
IMPORT Aula;

Faixas := DATASET([{0,      999,   'PEQUENO'},
                   {1000,   9999,  'MEDIO'},
                   {10000,  29999, 'GRANDE'},
                   {30000,  999999,'GIGANTE'}], {UNSIGNED4 minimo, UNSIGNED4 maximo, STRING8 porte});

Layout_Saida := RECORD
  UNSIGNED4 sinistro_id;
  UNSIGNED4 valor;
  STRING8   porte;
END;

Classificado := JOIN(Aula.Sinistros, Faixas,
                     LEFT.valor BETWEEN RIGHT.minimo AND RIGHT.maximo,
                     TRANSFORM(Layout_Saida, SELF := LEFT; SELF := RIGHT),
                     ALL);
OUTPUT(SORT(Classificado, sinistro_id));
```

# PILULA: KEEP, ATMOST e LIMIT: freios para a explosão

> [crianca] **KEEP(1)**: "achei um par, tá bom, não precisa procurar mais". **ATMOST(100)**: "se esse aluno tem mais de 100 pares, tem coisa errada com ele, pula". **LIMIT(100)**: "se alguém tiver mais de 100 pares, **para tudo** e me chama".

| Opção | Efeito |
|---|---|
| `KEEP(n)` | Para cada registro da esquerda, gera no máximo `n` pares |
| `ATMOST(n)` | Se um registro da esquerda tem **mais** de `n` pares, não gera **nenhum** para ele (num `LEFT OUTER`, ele sai como se não tivesse par) |
| `LIMIT(n)` | Se um registro da esquerda tem mais de `n` pares, o **job falha**; `LIMIT(n, SKIP)` descarta em vez de falhar |

```ecl
IMPORT Aula;

Layout_Saida := RECORD
  UNSIGNED4 id;
  STRING10  nome;
  UNSIGNED4 sinistro_id;
  UNSIGNED4 valor;
END;
T(Aula.Layouts.Cliente L, Aula.Layouts.Sinistro R) := TRANSFORM(Layout_Saida, SELF := L; SELF := R);

// Todos os pares: o cliente 4 aparece 3 vezes
OUTPUT(JOIN(Aula.Clientes, Aula.Sinistros, LEFT.id = RIGHT.cliente_id, T(LEFT, RIGHT)), NAMED('Todos'));

// No máximo 1 sinistro por cliente
OUTPUT(JOIN(Aula.Clientes, Aula.Sinistros, LEFT.id = RIGHT.cliente_id, T(LEFT, RIGHT), KEEP(1)), NAMED('Keep1'));

// Clientes com mais de 2 sinistros são ignorados (o cliente 4 some)
OUTPUT(JOIN(Aula.Clientes, Aula.Sinistros, LEFT.id = RIGHT.cliente_id, T(LEFT, RIGHT), ATMOST(2)), NAMED('Atmost2'));
```

> [real] `ATMOST` é a defesa contra **chave lixo**. Em todo cadastro real existem milhares de registros com SSN `000000000`, telefone `9999999999` ou nome `UNKNOWN`. Num JOIN por essa chave, esses registros casam todos entre si: 50 mil × 50 mil = 2,5 bilhões de pares inúteis que travam o job. `ATMOST(LEFT.ssn = RIGHT.ssn, 100)` diz "se um SSN casa com mais de 100 registros, isso não é uma pessoa, é lixo: ignore". Já `LIMIT` é usado no Roxie para não deixar uma busca ampla demais derrubar o serviço (dia 19).

# PILULA: Self-join: a tabela contra ela mesma

> [tecnico] Para achar **pares dentro da mesma tabela** (pessoas no mesmo endereço, cadastros com o mesmo telefone), você junta a tabela com ela mesma. Dois cuidados: (1) sem uma condição extra, cada registro casa **consigo mesmo**; (2) o par (A,B) aparece também como (B,A). A condição `LEFT.id < RIGHT.id` resolve os dois de uma vez.

```ecl
IMPORT Aula;
C := Aula.Clientes;

Layout_Par := RECORD
  STRING12  cidade;
  UNSIGNED4 id_a;
  STRING10  nome_a;
  UNSIGNED4 id_b;
  STRING10  nome_b;
END;

MesmaCidade := JOIN(C, C,
                    LEFT.cidade = RIGHT.cidade AND LEFT.estado = RIGHT.estado AND LEFT.id < RIGHT.id,
                    TRANSFORM(Layout_Par,
                              SELF.cidade := LEFT.cidade;
                              SELF.id_a := LEFT.id;  SELF.nome_a := LEFT.nome;
                              SELF.id_b := RIGHT.id; SELF.nome_b := RIGHT.nome));
OUTPUT(MesmaCidade);
```

# PILULA: Skew: quando um trabalhador recebe a pilha inteira

> [crianca] 400 amigos arrumando fichas, cada um cuida de uma letra do alfabeto. Só que metade das fichas começa com a letra "S". O amigo do "S" fica soterrado, trabalhando sozinho por horas, enquanto os outros 399 já terminaram e estão de braços cruzados. O trabalho todo só acaba quando **ele** acabar.

> [tecnico] Num JOIN (ou SORT, ou TABLE agrupado) o Thor manda registros de mesma chave para o mesmo nó. Se um valor de chave concentra uma fatia enorme dos dados, um nó recebe muito mais que os outros: isso é **skew**. O job fica tão lento quanto o nó mais carregado, e pode estourar disco ou memória. As causas mais comuns são chaves vazias ou padrão (`''`, `0`, `UNKNOWN`). Defesas: **filtrar a chave vazia antes do JOIN**, `ATMOST`, e `LOOKUP` quando o lado direito é pequeno (não redistribui nada).

```ecl thor
IMPORT Treino;
P := Treino.Arquivos.Pessoas;

// Quantas pessoas estão sem SSN? Todas elas iriam para o MESMO nó num JOIN por ssn.
OUTPUT(COUNT(P(ssn = '')), NAMED('SemSSN'));

// As chaves mais repetidas: é assim que se investiga skew antes de juntar
Freq := TABLE(P, {ssn, UNSIGNED4 qtd := COUNT(GROUP)}, ssn);
OUTPUT(TOPN(Freq, 5, -qtd), NAMED('SSNsMaisRepetidos'));
```

# EXERCICIO: Nome da categoria com LOOKUP

Crie uma tabela inline `Categorias` com `STRING12 categoria` e `STRING20 descricao` para: `GROCERY` → `Supermercado`, `FUEL` → `Combustivel`, `RESTAURANT` → `Restaurante`, `TRAVEL` → `Viagem`, `ELECTRONICS` → `Eletronicos`. Junte com `Aula.Transacoes` usando `LOOKUP`, mantendo **todas** as 20 transações (as sem descrição saem com o campo vazio). Mostre `txn_id`, `categoria`, `descricao`, ordenado por `txn_id`.

```ecl
IMPORT Aula;

```

## GABARITO
```ecl
IMPORT Aula;

Categorias := DATASET([{'GROCERY','Supermercado'}, {'FUEL','Combustivel'}, {'RESTAURANT','Restaurante'},
                       {'TRAVEL','Viagem'}, {'ELECTRONICS','Eletronicos'}], {STRING12 categoria, STRING20 descricao});

Layout_Saida := RECORD
  UNSIGNED4 txn_id;
  STRING12  categoria;
  STRING20  descricao;
END;

J := JOIN(Aula.Transacoes, Categorias,
          LEFT.categoria = RIGHT.categoria,
          TRANSFORM(Layout_Saida, SELF := LEFT; SELF := RIGHT),
          LEFT OUTER, LOOKUP);
OUTPUT(SORT(J, txn_id));
```

# EXERCICIO: Faixa de renda com ALL

Com a tabela de faixas abaixo, classifique cada cliente. Mostre `id`, `nome`, `renda` e `classe`, ordenado por `id`. O cliente com renda 0 deve aparecer com a classe vazia.

```ecl
IMPORT Aula;

Faixas := DATASET([{0.01, 2999.99, 'C'}, {3000, 7999.99, 'B'}, {8000, 99999.99, 'A'}],
                  {DECIMAL9_2 de, DECIMAL9_2 ate, STRING1 classe});

```

## DICA
`LEFT OUTER, ALL`. Sem o `LEFT OUTER` o cliente de renda 0 some.

## GABARITO
```ecl
IMPORT Aula;

Faixas := DATASET([{0.01, 2999.99, 'C'}, {3000, 7999.99, 'B'}, {8000, 99999.99, 'A'}],
                  {DECIMAL9_2 de, DECIMAL9_2 ate, STRING1 classe});

Layout_Saida := RECORD
  UNSIGNED4  id;
  STRING10   nome;
  DECIMAL9_2 renda;
  STRING1    classe;
END;

J := JOIN(Aula.Clientes, Faixas,
          LEFT.renda BETWEEN RIGHT.de AND RIGHT.ate,
          TRANSFORM(Layout_Saida, SELF := LEFT; SELF := RIGHT),
          LEFT OUTER, ALL);
OUTPUT(SORT(J, id));
```

# EXERCICIO: Uma linha por cliente, garantido

Gere uma tabela com **exatamente uma linha por cliente** (12 linhas) contendo `id`, `nome` e `BOOLEAN tem_sinistro`. Use JOIN com `KEEP(1)`. Ordene por `id`.

```ecl
IMPORT Aula;

```

## GABARITO
```ecl
IMPORT Aula;

Layout_Saida := RECORD
  UNSIGNED4 id;
  STRING10  nome;
  BOOLEAN   tem_sinistro;
END;

J := JOIN(Aula.Clientes, Aula.Sinistros,
          LEFT.id = RIGHT.cliente_id,
          TRANSFORM(Layout_Saida, SELF.tem_sinistro := RIGHT.sinistro_id <> 0; SELF := LEFT),
          LEFT OUTER, KEEP(1));
OUTPUT(SORT(J, id));
```
`LEFT OUTER` garante que ninguém da esquerda some; `KEEP(1)` garante que ninguém se multiplica. Esse par é o jeito padrão de "enriquecer sem alterar a contagem".

# EXERCICIO: Mesmo sobrenome, mesma cidade

Ache os pares de clientes com o mesmo `sobrenome` **e** a mesma `cidade` (possíveis parentes). Mostre `sobrenome`, `cidade`, `nome_a`, `nome_b`, cada par uma vez só.

```ecl
IMPORT Aula;

```

## GABARITO
```ecl
IMPORT Aula;
C := Aula.Clientes;

Layout_Par := RECORD
  STRING12 sobrenome;
  STRING12 cidade;
  STRING10 nome_a;
  STRING10 nome_b;
END;

Pares := JOIN(C, C,
              LEFT.sobrenome = RIGHT.sobrenome AND LEFT.cidade = RIGHT.cidade AND LEFT.id < RIGHT.id,
              TRANSFORM(Layout_Par, SELF.nome_a := LEFT.nome; SELF.nome_b := RIGHT.nome; SELF := LEFT));
OUTPUT(Pares);
```

# REAL: Caça a cadastros duplicados por SSN

O cadastro de pessoas foi alimentado por várias fontes ao longo dos anos e a mesma pessoa pode aparecer mais de uma vez, com `id` diferente. A área de qualidade quer um primeiro número: **quantos pares de cadastros têm o mesmo SSN?**

Use `Treino.Arquivos.Pessoas` no Thor e entregue, nesta ordem:

1. A quantidade de pares de registros com o mesmo `ssn` e `id` diferente, **ignorando SSN vazio**, cada par contado uma vez.
2. Dos pares do item 1, quantos têm `last_name` **diferente** entre os dois registros (comparando em maiúsculas): são candidatos a erro de digitação.
3. Uma amostra de 10 pares do item 2 com `ssn`, `id_a`, `nome_a` (first + last do registro A), `id_b`, `nome_b`, ordenada por `ssn`, `id_a`, `id_b`.
4. Para sentir o problema do skew: quantos pares **seriam gerados** só entre os registros de SSN vazio se você não filtrasse? Calcule com conta, **sem fazer o JOIN**: se há `n` registros sem SSN, os pares são `n × (n − 1) / 2`.

```ecl thor
IMPORT Treino, STD;
P := Treino.Arquivos.Pessoas;

```

## DICA
Filtre `ssn <> ''` em uma definição e faça o self-join em cima dela com `LEFT.ssn = RIGHT.ssn AND LEFT.id < RIGHT.id`. Leve no transform os campos que vai precisar depois, inclusive os dois sobrenomes.

## GABARITO
```ecl thor
IMPORT Treino, STD;
P := Treino.Arquivos.Pessoas;

ComSSN := P(ssn <> '');

Layout_Par := RECORD
  STRING9   ssn;
  UNSIGNED4 id_a;
  STRING41  nome_a;
  STRING20  last_a;
  UNSIGNED4 id_b;
  STRING41  nome_b;
  STRING20  last_b;
END;

Pares := JOIN(ComSSN, ComSSN,
              LEFT.ssn = RIGHT.ssn AND LEFT.id < RIGHT.id,
              TRANSFORM(Layout_Par,
                        SELF.ssn    := LEFT.ssn;
                        SELF.id_a   := LEFT.id;
                        SELF.nome_a := TRIM(LEFT.first_name) + ' ' + TRIM(LEFT.last_name);
                        SELF.last_a := LEFT.last_name;
                        SELF.id_b   := RIGHT.id;
                        SELF.nome_b := TRIM(RIGHT.first_name) + ' ' + TRIM(RIGHT.last_name);
                        SELF.last_b := RIGHT.last_name));

SobrenomeDiferente := Pares(STD.Str.ToUpperCase(last_a) <> STD.Str.ToUpperCase(last_b));

n := COUNT(P(ssn = ''));

OUTPUT(COUNT(Pares));
OUTPUT(COUNT(SobrenomeDiferente));
OUTPUT(CHOOSEN(SORT(TABLE(SobrenomeDiferente, {ssn, id_a, nome_a, id_b, nome_b}), ssn, id_a, id_b), 10));
OUTPUT(n * (n - 1) / 2);
```
Olhe a amostra do item 3: `Williams` e `Williamz`, `Jones` e `Jonez`. São a mesma pessoa, digitada errado em alguma fonte. Você acabou de dar o primeiro passo do que a LexisNexis chama de **vínculo de registros**, a tecnologia central da empresa (o LexID nasce daí). O SSN igual pega os casos fáceis; no dia 15 você vai pegar também os cadastros **sem** SSN, comparando nome, data de nascimento e endereço de forma aproximada. E o item 4 mostra por que o filtro `ssn <> ''` não é opcional: dezenas de milhares de pares falsos aqui, bilhões em produção.

# QUIZ

? Quando usar `LOOKUP` em um JOIN?
- Quando as duas tabelas são gigantes
+ Quando a tabela da direita é pequena o suficiente para caber na memória de cada nó
- Quando não há condição de igualdade
- Sempre, porque é mais rápido em qualquer caso
! A direita vira uma tabela hash em memória e a esquerda não precisa ser ordenada nem redistribuída.

? A condição do JOIN é `LEFT.valor BETWEEN RIGHT.minimo AND RIGHT.maximo`. Que opção é necessária?
- `LOOKUP`
- `KEEP(1)`
+ `ALL`
- `LEFT ONLY`
! Sem igualdade o Thor não sabe como parear por chave; ALL compara com todos os registros da direita.

? O que `KEEP(1)` faz?
- Mantém só o primeiro registro da tabela inteira
+ Gera no máximo um par para cada registro da esquerda
- Falha o job se houver mais de um par
- Remove duplicados da direita antes do JOIN
! Limita os pares por registro da esquerda.

? Um registro da esquerda casa com 500 da direita e o JOIN tem `ATMOST(100)`. O que sai para esse registro em um inner join?
- Os 100 primeiros pares
- 500 pares
+ Nenhum par
- O job falha
! ATMOST descarta todos os pares de quem passa do limite. KEEP é que corta nos N primeiros; LIMIT é que falha.

? Por que usar `LEFT.id < RIGHT.id` em um self-join?
- Para ordenar o resultado
+ Para evitar que um registro case consigo mesmo e que cada par apareça duas vezes
- Porque self-join exige desigualdade
- Para ativar o LOOKUP
! Elimina (A,A) e a duplicata (B,A).

? O que é skew?
- Um erro de sintaxe em JOIN
- O tempo de compilação do workunit
+ Distribuição desigual: poucos nós recebem a maior parte dos dados e seguram o job inteiro
- Um tipo de JOIN aproximado
! Costuma vir de chaves vazias ou padrão que concentram milhões de registros.

? Qual é a primeira defesa contra skew em um JOIN por SSN?
- Usar FULL OUTER
- Ordenar as duas tabelas antes
+ Filtrar os registros de SSN vazio ou inválido antes do JOIN
- Aumentar o número de OUTPUTs
! Chave vazia casa com todas as outras vazias e cai inteira num nó só.

? Diferença entre `LOOKUP` e `MANY LOOKUP`?
- Nenhuma
+ LOOKUP supõe no máximo um par por registro da esquerda; MANY LOOKUP permite vários
- MANY LOOKUP não carrega a direita em memória
- LOOKUP só funciona no Roxie
! Se a direita tem várias linhas por chave e você quer todas, use MANY LOOKUP.

# FLASHCARDS

Q: JOIN com tabela pequena de códigos: qual opção?
A: `LOOKUP` (a direita vai para a memória de cada nó; a esquerda não é reordenada).
Q: JOIN por faixa de valores: qual opção?
A: `ALL`, com a direita pequena.
Q: KEEP(n) × ATMOST(n) × LIMIT(n).
A: KEEP corta nos n primeiros pares; ATMOST descarta todos os pares de quem passa de n; LIMIT falha o job (ou SKIP).
Q: Condição padrão de self-join para pares únicos.
A: `LEFT.chave = RIGHT.chave AND LEFT.id < RIGHT.id`
Q: O que é skew e a causa mais comum?
A: Dados concentrados em poucos nós; chaves vazias/padrão como '', 0, UNKNOWN.
Q: Como enriquecer sem mudar a contagem de linhas?
A: `LEFT OUTER, KEEP(1)` (ou `LEFT OUTER, LOOKUP`).
Q: Como investigar skew antes de um JOIN?
A: `TOPN(TABLE(ds, {chave, qtd := COUNT(GROUP)}, chave), 10, -qtd)`
