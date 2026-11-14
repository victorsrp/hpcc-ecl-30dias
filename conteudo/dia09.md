---
dia: 9
modulo: 2
titulo: MODULE, IMPORT e organização de repositório
horas: 3
---

# MISSAO

> [goggins] Até hoje você escreveu código descartável: um bloco, roda, joga fora. Profissional não trabalha assim. Profissional escreve uma vez, guarda no lugar certo e reusa por dez anos. Hoje você para de ser turista e monta a **sua casa** dentro do repositório. É um dia menos "emocionante" que JOIN. É exatamente por isso que amador pula e depois vive copiando e colando layout errado.

**Hoje você vai:**

- Entender como o ECL organiza código: pasta = módulo, arquivo = definição.
- Usar `EXPORT`, `SHARED` e `IMPORT`.
- Criar módulos com a estrutura `MODULE`.
- Criar o seu próprio módulo `Meu` no repositório, pelo VS Code.

# PILULA: Pasta é módulo, arquivo é definição

> [crianca] Sua casa tem cômodos, e em cada cômodo há gavetas com etiqueta. As meias estão em "quarto → gaveta de meias". Quando você precisa de meia, não sai procurando pela casa: vai direto no endereço. No ECL, o **cômodo** é a pasta (módulo), a **gaveta** é o arquivo, e a **etiqueta** é o nome da definição.

> [tecnico] Um repositório ECL é uma árvore de pastas. Cada **pasta** é um módulo; cada **arquivo `.ecl`** contém **uma** definição exportada, e o nome da definição **tem que ser igual** ao nome do arquivo. O arquivo `Treino/Layouts.ecl` define `EXPORT Layouts := ...`, e de qualquer lugar você chega nele com `IMPORT Treino;` e `Treino.Layouts`. É por isso que `IMPORT Aula;` e `IMPORT Treino;` funcionam desde o dia 3: essas pastas estão em `ecl/` no seu projeto.

Abra a pasta `ecl/` no VS Code agora (`File → Open Folder`) e leia os arquivos de `Aula/` e `Treino/`. É a primeira vez que você vê por dentro o que vinha usando.

| Palavra | Quem enxerga a definição |
|---|---|
| *(nada)* | Só o próprio arquivo, e só as linhas abaixo dela |
| `SHARED` | Qualquer definição do mesmo módulo |
| `EXPORT` | Todo mundo que importar o módulo |

Formas de `IMPORT`:

| Forma | Significado |
|---|---|
| `IMPORT Treino;` | Usa como `Treino.Arquivos` |
| `IMPORT Treino AS T;` | Apelido: `T.Arquivos` |
| `IMPORT Treino.Arquivos;` | Traz só essa definição: `Arquivos.Pessoas` |
| `IMPORT $;` | `$` é "o módulo (pasta) onde este arquivo está" |
| `IMPORT STD;` | A biblioteca padrão é um módulo como qualquer outro |

# PILULA: A estrutura MODULE

> [tecnico] `MODULE ... END;` agrupa várias definições debaixo de um nome só. Dentro dele valem as mesmas regras de visibilidade: `EXPORT` aparece para fora, `SHARED` só para as definições do próprio módulo, sem nada é local. É assim que um arquivo só (`Layouts.ecl`) consegue oferecer vários layouts: `Treino.Layouts.Pessoa`, `Treino.Layouts.Veiculo`.

Um MODULE também pode ser escrito direto no código, o que permite treinar aqui no editor:

```ecl
Regras := MODULE
  SHARED  IdadeMinima   := 18;                               // visível só dentro do módulo
  EXPORT  ScoreMinimo   := 600;
  EXPORT  MaiorDeIdade(UNSIGNED1 idade) := idade >= IdadeMinima;
  EXPORT  Aprovado(UNSIGNED1 idade, UNSIGNED2 score) := MaiorDeIdade(idade) AND score >= ScoreMinimo;
END;

OUTPUT(Regras.ScoreMinimo);
OUTPUT(Regras.Aprovado(30, 650));
OUTPUT(Regras.Aprovado(16, 800));
```

Tente acessar `Regras.IdadeMinima` de fora e leia o erro:

```ecl erro
Regras := MODULE
  SHARED IdadeMinima := 18;
  EXPORT ScoreMinimo := 600;
END;
OUTPUT(Regras.IdadeMinima);
```

> [real] Esconder com `SHARED` não é frescura. Tudo o que é `EXPORT` vira **contrato**: outros times vão usar, e você não pode mais mudar sem quebrar alguém. O que é interno fica `SHARED` para você poder refatorar em paz.

# PILULA: Módulo com parâmetros

> [tecnico] Um MODULE pode receber parâmetros, como uma função que devolve um pacote de definições. É muito usado para "a mesma análise, para um recorte diferente".

```ecl
IMPORT Aula;

AnaliseEstado(STRING2 uf) := MODULE
  EXPORT Clientes   := Aula.Clientes(estado = uf);
  EXPORT Qtd        := COUNT(Clientes);
  EXPORT RendaMedia := AVE(Clientes, renda);
  EXPORT Melhor     := TOPN(Clientes, 1, -score);
END;

FL := AnaliseEstado('FL');
GA := AnaliseEstado('GA');

OUTPUT(FL.Qtd,        NAMED('FL_Qtd'));
OUTPUT(FL.RendaMedia, NAMED('FL_RendaMedia'));
OUTPUT(GA.Melhor,     NAMED('GA_MelhorScore'));
```

# PILULA: Como um repositório de produção é organizado

Não existe um único padrão, mas quase todo repositório grande de ECL segue esta ideia, com um módulo (pasta) por assunto ou fonte de dados:

```texto
Seguros/
  Layouts.ecl        formatos de registro (RECORDs)
  Constantes.ecl     nomes de arquivos lógicos, limites, códigos
  Arquivos.ecl       declarações DATASET (onde o dado está)
  Regras.ecl         regras de negócio como funções
  Chaves.ecl         declarações de INDEX (dia 16)
  Build_Base.ecl     ação que constrói o arquivo base
  Build_Chaves.ecl   ação que constrói os índices
  Consulta_X.ecl     consultas Roxie (dia 18)
```

Princípios que você vai ver em todo lugar:

- **Nome de arquivo lógico nunca fica espalhado.** Ele mora em um lugar só (`Constantes` ou `Arquivos`). Quando o arquivo muda de nome, você altera uma linha.
- **Layout é declarado uma vez.** Todo mundo usa `Seguros.Layouts.Sinistro`. Copiar e colar RECORD é o caminho mais curto para dados deslocados.
- **Arquivo de build contém ação; os outros só definições.** Importar `Arquivos` não executa nada. Rodar `Build_Base` executa.
- **Regra de negócio é função exportada**, com nome que o analista de negócio reconhece.

> [real] Na LexisNexis o repositório tem dezenas de milhares de definições e centenas de desenvolvedores. O que mantém isso de pé é disciplina de módulo: você chega num time, abre a pasta da fonte de dados e já sabe onde procurar o layout, o arquivo e a chave, porque todo módulo tem a mesma cara.

# EXERCICIO: Módulo de conversão

No editor, crie o módulo `Conv` com: `SHARED Fator := 1.60934;`, `EXPORT MilhasParaKm(REAL m)` e `EXPORT KmParaMilhas(REAL k)`. Mostre, nesta ordem, 26.2 milhas em km (uma maratona) e 100 km em milhas.

```ecl

```

## GABARITO
```ecl
Conv := MODULE
  SHARED Fator := 1.60934;
  EXPORT MilhasParaKm(REAL m) := m * Fator;
  EXPORT KmParaMilhas(REAL k) := k / Fator;
END;

OUTPUT(Conv.MilhasParaKm(26.2));
OUTPUT(Conv.KmParaMilhas(100));
```

# EXERCICIO: Módulo parametrizado de sinistros

Crie `SinistrosDoTipo(STRING10 t)` como MODULE que exporta: `Dados` (os sinistros de `Aula.Sinistros` daquele tipo), `Qtd`, `Total` e `Maior` (o registro de maior valor, via `TOPN`). Mostre, nesta ordem: a quantidade de `INJURY`, o total de `INJURY` e o maior sinistro de `COLLISION`.

```ecl
IMPORT Aula;

```

## GABARITO
```ecl
IMPORT Aula;

SinistrosDoTipo(STRING10 t) := MODULE
  EXPORT Dados := Aula.Sinistros(tipo = t);
  EXPORT Qtd   := COUNT(Dados);
  EXPORT Total := SUM(Dados, valor);
  EXPORT Maior := TOPN(Dados, 1, -valor);
END;

Lesao   := SinistrosDoTipo('INJURY');
Colisao := SinistrosDoTipo('COLLISION');

OUTPUT(Lesao.Qtd);
OUTPUT(Lesao.Total);
OUTPUT(Colisao.Maior);
```

# REAL: Monte o seu módulo no repositório

Agora de verdade, com arquivos. Você vai criar o módulo `Meu` dentro da pasta `ecl/` do projeto, usando o VS Code. A plataforma envia a pasta `ecl/` inteira junto com cada execução, então assim que você **salvar** os arquivos, `IMPORT Meu;` passa a funcionar aqui no editor.

Crie a pasta `ecl/Meu/` com três arquivos:

**1. `ecl/Meu/Layouts.ecl`**: um MODULE exportado chamado `Layouts` com o layout `Resumo`: `UNSIGNED4 person_id`, `UNSIGNED2 qtd`, `UNSIGNED8 total`, `UNSIGNED4 maior`.

**2. `ecl/Meu/Regras.ecl`**: um MODULE exportado chamado `Regras` com: `SHARED LimiteAlto := 20000;`, `EXPORT AltoValor(UNSIGNED4 v)` (verdadeiro quando `v >= LimiteAlto`) e `EXPORT Nivel(UNSIGNED2 qtd, UNSIGNED8 total)` que devolve `'CRITICO'` quando `qtd >= 4` e `total >= 100000`; `'ATENCAO'` quando `qtd >= 3`; `'NORMAL'` nos outros casos.

**3. `ecl/Meu/Sinistros.ecl`**: um MODULE exportado chamado `Sinistros` (usa `IMPORT $, Treino;`) com: `EXPORT Pagos` (sinistros de `Treino.Arquivos.Sinistros` com status `PAID`) e `EXPORT ResumoPorPessoa` (TABLE de `Pagos` por `person_id` no formato de `$.Layouts.Resumo`).

Depois de salvar os três arquivos, rode o teste abaixo no Thor. Ele deve mostrar as 10 pessoas com maior total pago e o nível de cada uma.

```ecl thor sem-validar
IMPORT Meu;

R := Meu.Sinistros.ResumoPorPessoa;

Top := TOPN(R, 10, -total, person_id);
OUTPUT(TABLE(Top, {person_id, qtd, total, maior, STRING8 nivel := Meu.Regras.Nivel(qtd, total)}));
OUTPUT(COUNT(R(Meu.Regras.Nivel(qtd, total) = 'CRITICO')), NAMED('QtdCriticos'));
```

## DICA
Um TABLE pode usar um layout nomeado se você escrever os campos com os mesmos nomes e tipos. O mais simples é declarar o formato do TABLE com chaves e os campos na mesma ordem do layout `Resumo`; ou fazer o TABLE e depois `PROJECT(..., $.Layouts.Resumo)`, que converte de um layout para outro quando os nomes batem.

## GABARITO
Conteúdo dos três arquivos:

```ecl nao-rodar
// ecl/Meu/Layouts.ecl
EXPORT Layouts := MODULE
  EXPORT Resumo := RECORD
    UNSIGNED4 person_id;
    UNSIGNED2 qtd;
    UNSIGNED8 total;
    UNSIGNED4 maior;
  END;
END;
```

```ecl nao-rodar
// ecl/Meu/Regras.ecl
EXPORT Regras := MODULE
  SHARED LimiteAlto := 20000;
  EXPORT AltoValor(UNSIGNED4 v) := v >= LimiteAlto;
  EXPORT STRING8 Nivel(UNSIGNED2 qtd, UNSIGNED8 total) :=
    MAP(qtd >= 4 AND total >= 100000 => 'CRITICO',
        qtd >= 3                     => 'ATENCAO',
        'NORMAL');
END;
```

```ecl nao-rodar
// ecl/Meu/Sinistros.ecl
IMPORT $, Treino;

EXPORT Sinistros := MODULE
  EXPORT Pagos := Treino.Arquivos.Sinistros(status = 'PAID');

  SHARED Agrupado := TABLE(Pagos,
                           {person_id,
                            UNSIGNED2 qtd   := COUNT(GROUP),
                            UNSIGNED8 total := SUM(GROUP, amount),
                            UNSIGNED4 maior := MAX(GROUP, amount)},
                           person_id);

  EXPORT ResumoPorPessoa := PROJECT(Agrupado, $.Layouts.Resumo);
END;
```

`PROJECT(recordset, Layout)` sem transform é um atalho: converte para o layout copiando os campos de mesmo nome. Repare no resultado do teste: as pessoas no topo têm vários sinistros de valor muito parecido, todos altos. Você já viu esse filme com 16 linhas no dia 5. Se o teste deu erro de "módulo não encontrado", confira: a pasta chama `Meu`, está dentro de `ecl/`, cada arquivo tem o mesmo nome da definição exportada e você salvou.

# QUIZ

? O arquivo `ecl/Seguros/Regras.ecl` deve conter qual definição exportada?
- `EXPORT Seguros := ...`
+ `EXPORT Regras := ...`
- Qualquer nome
- Nenhuma; arquivos não exportam
! O nome da definição exportada tem que ser igual ao nome do arquivo.

? Qual a diferença entre `SHARED` e `EXPORT`?
- Nenhuma
- SHARED é visível para todos e EXPORT só no arquivo
+ SHARED é visível só dentro do próprio módulo; EXPORT é visível para quem importar
- SHARED é para datasets e EXPORT para funções
! EXPORT é o contrato público; SHARED é o que você quer poder mudar depois.

? O que `IMPORT $;` significa?
- Importa a biblioteca padrão
- Importa todos os módulos do repositório
+ Dá acesso ao módulo (pasta) em que o arquivo atual está
- Importa variáveis de ambiente
! `$.Layouts` é "o Layouts que mora na mesma pasta que eu".

? Por que os nomes de arquivos lógicos devem ficar em um único lugar do repositório?
- Porque o compilador exige
+ Para que uma mudança de nome seja feita em uma linha só, sem caçar cópias espalhadas
- Para o Roxie ficar mais rápido
- Porque nomes lógicos não podem ser usados em JOIN
! Um ponto único de verdade evita que jobs diferentes leiam arquivos diferentes sem querer.

? Importar um módulo que só tem definições (como `Treino.Arquivos`) executa alguma coisa no cluster?
- Sim, lê todos os arquivos
- Sim, compila e grava os arquivos
+ Não: definições só são avaliadas quando uma ação precisa delas
- Só no Thor
! Importar é só tornar os nomes disponíveis.

? `AnaliseEstado(STRING2 uf) := MODULE ... END;` — o que é isso?
- Um erro: MODULE não aceita parâmetro
+ Um módulo parametrizado: cada chamada devolve um pacote de definições para aquele parâmetro
- Uma função que devolve BOOLEAN
- Um arquivo lógico
! É muito usado para repetir a mesma análise em recortes diferentes.

? O que `PROJECT(ds, LayoutNovo)` faz, sem TRANSFORM?
- Dá erro
- Remove duplicados
+ Converte para o layout novo, copiando os campos de mesmo nome
- Ordena pelo primeiro campo
! É o atalho para mudar de layout quando os nomes coincidem.

# FLASHCARDS

Q: Como o ECL mapeia repositório para código?
A: Pasta = módulo; arquivo .ecl = uma definição exportada com o mesmo nome do arquivo.
Q: Três níveis de visibilidade.
A: Local (sem palavra), SHARED (dentro do módulo), EXPORT (para quem importar).
Q: O que é `$`?
A: O módulo/pasta onde o arquivo atual está (`IMPORT $;` → `$.Layouts`).
Q: Para que serve um MODULE parametrizado?
A: Devolver um pacote de definições para um parâmetro: `M(STRING2 uf) := MODULE ... END;`
Q: Onde devem morar layouts e nomes de arquivos lógicos?
A: Em um lugar só (Layouts / Constantes / Arquivos), nunca copiados pelo código.
Q: Atalho para mudar de layout sem TRANSFORM.
A: `PROJECT(ds, LayoutNovo)` copia os campos de mesmo nome.
