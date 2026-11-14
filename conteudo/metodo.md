> [goggins] Talento não te leva ao dia 30. Método e repetição levam. Abaixo está o porquê de cada coisa chata que esta plataforma te obriga a fazer.

## Os 7 métodos por trás da plataforma

Nada aqui é invenção. São as técnicas com mais evidência em pesquisa sobre aprendizagem, aplicadas a ECL.

| Método | O que é | Onde aparece aqui |
|---|---|---|
| **Prática de recuperação** | Puxar da memória fixa mais do que reler | Quiz diário e cartões: você responde antes de ver |
| **Repetição espaçada** | Rever em intervalos crescentes vence a curva do esquecimento | Cartões voltam em 1, 3, 7, 15 e 30 dias |
| **Exemplo resolvido → prática guiada → prática livre** | Iniciante aprende mais vendo um exemplo completo e depois tirando as rodinhas | Pílula (exemplo que roda) → fixação (com dica) → caso real (sem ajuda) |
| **Prática deliberada** | Treinar no limite da sua capacidade, com retorno imediato | Botão "Conferir" compara seu resultado com o gabarito na hora |
| **Intercalação** | Misturar assuntos antigos nos exercícios novos | Casos reais e desafios sempre usam coisas de dias anteriores |
| **Domínio antes de avançar** | Só segue quem domina a base | 80% no quiz para destravar o dia seguinte |
| **Técnica Feynman** | Se não explica simples, não entendeu | Explicação "para criança de 8 anos" em toda pílula e relatório pós-ação no fim do dia |

## Como estudar cada pílula

1. Leia a explicação para criança. Feche os olhos e repita com suas palavras.
2. Leia a versão técnica.
3. **Antes de rodar o código, diga em voz alta o que vai sair.** Depois rode. Errou a previsão? Ótimo: é ali que você aprende.
4. Mude uma coisa no código e rode de novo. Quebre de propósito e leia o erro.

## Como fazer cada exercício

1. Leia o enunciado e escreva a solução **sem rolar a tela para cima**.
2. Travou? Lute 10 minutos. Depois abra a dica.
3. Rode. Leia o erro inteiro: o compilador de ECL diz a linha e a coluna.
4. Clique em "Conferir". Só abra o gabarito depois de bater, ou depois de 3 tentativas sérias.
5. Leia o gabarito mesmo tendo acertado: sempre há um detalhe.

## Regra dos 40%

Quando sua cabeça disser "chega, entendi mais ou menos, vou pular", você está em 40% do que consegue. O exercício seguinte é exatamente onde o conhecimento vira habilidade. Faça mais um.

## Pote de biscoitos

Cada tarefa concluída fica registrada no painel. No dia em que um JOIN não fechar e der vontade de largar, abra o painel e olhe o que você já venceu. Você já fez coisa difícil antes: faz de novo.

## Espelho da responsabilidade

O relatório pós-ação no fim de cada dia é só seu. Não escreva "foi legal". Escreva o que você não entendeu, onde enrolou e o que vai refazer. Mentir ali só engana uma pessoa.

## Seu ambiente

| Peça | Para que serve | Onde |
|---|---|---|
| Esta plataforma | Aulas, editor, exercícios, revisão | http://localhost:3030 |
| ECL Watch | Painel oficial do cluster: workunits, arquivos, grafos, consultas publicadas | http://localhost:8010 |
| ECL Playground | Editor oficial no navegador, dentro do ECL Watch | ECL Watch → menu ECL → Playground |
| Pasta `ecl/` | Seu repositório de código (a partir do dia 9) | Abra no VS Code com a extensão ECL |
| Pasta `dados/` | Arquivos CSV crus; é a "landing zone" do cluster | Aparece no ECL Watch como dropzone `treino` |

O editor da plataforma tem três alvos: **hthor** (rápido, um processo só, ideal para testes pequenos), **thor** (o motor de processamento em massa) e **roxie** (o motor de consultas). Você vai entender a diferença no dia 1 e usar os três ao longo do curso.

Atalho: `Ctrl+Enter` roda o código do editor em que você está.
