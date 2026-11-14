# ECL 30 Dias

Plataforma de estudo intensivo de HPCC Systems / ECL: do zero (dia 1) ao avançado em Thor e Roxie (dia 30).

Cada aula tem explicação simples, versão técnica, código que roda de verdade num cluster HPCC no seu computador, exercício conferido com gabarito, quiz e revisão espaçada. No dia 30 você pega dado cru e sujo e entrega um serviço de busca publicado no Roxie.

## O que você precisa

| Item | Para quê |
|---|---|
| PC com **16 GB de RAM** (ou mais) | O cluster HPCC usa uns 6 GB |
| **Docker Desktop** com **Kubernetes ligado** ([download](https://www.docker.com/products/docker-desktop/)) | Onde o cluster HPCC roda. Em *Settings → Kubernetes*, marque *Enable Kubernetes* e espere ficar verde |
| **Helm** | Instala o cluster. Windows: `winget install Helm.Helm` · Mac: `brew install helm` · Linux: [helm.sh](https://helm.sh/docs/intro/install/) |
| **Node.js** LTS ([download](https://nodejs.org)) | Roda a plataforma |
| Uns 10 GB livres e internet na primeira vez | Imagens do HPCC |

Dê ao Docker pelo menos **8 GB de memória**. No Mac/Linux: *Settings → Resources*. No Windows com WSL 2, crie o arquivo `%UserProfile%\.wslconfig` com:

```ini
[wsl2]
memory=8GB
```

e rode `wsl --shutdown` antes de abrir o Docker de novo.

## Como começar

```bash
git clone https://github.com/victorsrp/hpcc-ecl-30dias.git
cd hpcc-ecl-30dias
```

Sem Git? Use **Code → Download ZIP** aqui no GitHub e descompacte.

- **Windows**: dê dois cliques em **`iniciar.bat`**.
- **Mac / Linux**: `bash iniciar.sh`.

O script:

1. liga o Docker Desktop, se estiver desligado;
2. na primeira vez, instala o cluster HPCC 10.8.2 com os charts oficiais da HPCC Systems (`ferramentas/instalar-cluster.bat`); o download das imagens leva de 5 a 15 minutos;
3. espera o cluster responder;
4. na primeira vez, carrega os dados de treino no cluster;
5. abre a plataforma em **http://localhost:3030**.

Deixe a janela do terminal aberta enquanto estuda (`Ctrl+C` encerra). Comece pela **Ementa** e por **Como estudar**.

## O que tem aqui

| Pasta / arquivo | Para quê |
|---|---|
| `conteudo/` | As 30 aulas (`diaNN.md`), a ementa e o método. Texto puro: dá para ler sem a plataforma |
| `app/` + `servidor.mjs` | A plataforma (editor, botão Rodar, conferência com gabarito, quiz, revisão espaçada). Sem dependências de Node |
| `ecl/` | Repositório ECL. `Aula/` e `Treino/` são módulos do curso; crie os seus aqui a partir do dia 9 |
| `dados/` | Arquivos crus de treino (fictícios): pessoas, veículos, sinistros, transações, parceiro |
| `ferramentas/` | Instalação e preparo do cluster, gerador de dados, validador das aulas |
| `progresso.json` | Seu progresso (criado quando você começa; fica fora do Git) |

## Cluster

- ECL Watch: http://localhost:8010
- Consultas Roxie (WsECL): http://localhost:8002

Se o seu cluster HPCC estiver em outro endereço, defina as variáveis `ECL30_ESP` (por exemplo `http://meu-servidor:8010`) e `ECL30_WSECL` (`http://meu-servidor:8002`) antes de rodar `node servidor.mjs`.

## Comandos úteis

```bash
node ferramentas/preparar.mjs          # recarrega dados, arquivos base, índices e a consulta de apoio
node ferramentas/validar.mjs           # confere a sintaxe de todos os códigos das aulas
node ferramentas/validar.mjs --rodar 7 # executa de verdade todos os códigos do dia 7
```

## Problemas comuns

| Sintoma | O que fazer |
|---|---|
| Fica parado em "Esperando o Kubernetes" | Abra o Docker Desktop e confira se o Kubernetes está ligado e verde |
| "Falta o Helm" | Instale o Helm (tabela acima), feche e abra o terminal |
| Docker travou / ficou muito lento | Feche o Docker Desktop, rode `wsl --shutdown` (Windows) e abra o `iniciar` de novo. A plataforma roda no máximo 2 jobs ao mesmo tempo (1 se for Roxie) para poupar memória |
| Reinstalei o cluster e os arquivos sumiram | Apague o arquivo `.preparado` e abra o `iniciar` de novo |
| "Lock held" ao refazer um índice | Índices usados por consultas publicadas ficam travados pelo Roxie: exclua antes a consulta em *Published Queries* no ECL Watch (explicado nos dias 20 e 26) |

Para remover o cluster: `helm uninstall mycluster` e depois `helm uninstall localfile`.

## Créditos e licença

HPCC Systems e ECL são projetos de código aberto da HPCC Systems / LexisNexis Risk Solutions. Este curso é independente e não tem relação oficial com eles. Os dados de treino são fictícios.

Material sob [Creative Commons Atribuição 4.0 Internacional (CC BY 4.0)](https://creativecommons.org/licenses/by/4.0/deed.pt-br): você pode usar, copiar, adaptar e redistribuir, inclusive para fins comerciais, desde que dê o crédito (Victor Pereira, link para este repositório) e indique se fez alterações. Texto completo em [`LICENSE`](LICENSE).
