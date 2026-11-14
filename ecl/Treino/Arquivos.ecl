IMPORT $;

// Onde estao os arquivos do curso no cluster.
// Uso: IMPORT Treino;  OUTPUT(CHOOSEN(Treino.Arquivos.Pessoas, 10));
EXPORT Arquivos := MODULE

  EXPORT Prefixo := '~ecl30::';

  // Nomes logicos
  EXPORT NomeRaw(STRING tabela)  := Prefixo + 'raw::'  + tabela;
  EXPORT NomeBase(STRING tabela) := Prefixo + 'base::' + tabela;

  // Arquivos crus (CSV com cabecalho), como chegaram da landing zone
  EXPORT PessoasRaw    := DATASET(NomeRaw('pessoas'),    $.Layouts.Pessoa,    CSV(HEADING(1)));
  EXPORT VeiculosRaw   := DATASET(NomeRaw('veiculos'),   $.Layouts.Veiculo,   CSV(HEADING(1)));
  EXPORT SinistrosRaw  := DATASET(NomeRaw('sinistros'),  $.Layouts.Sinistro,  CSV(HEADING(1)));
  EXPORT TransacoesRaw := DATASET(NomeRaw('transacoes'), $.Layouts.Transacao, CSV(HEADING(1)));

  // Arquivos base (formato nativo do Thor), prontos para processar
  EXPORT Pessoas    := DATASET(NomeBase('pessoas'),    $.Layouts.Pessoa,    THOR);
  EXPORT Veiculos   := DATASET(NomeBase('veiculos'),   $.Layouts.Veiculo,   THOR);
  EXPORT Sinistros  := DATASET(NomeBase('sinistros'),  $.Layouts.Sinistro,  THOR);
  EXPORT Transacoes := DATASET(NomeBase('transacoes'), $.Layouts.Transacao, THOR);

  // Derivados (construidos por Treino.ConstruirBase)
  EXPORT PessoasLimpas := DATASET(NomeBase('pessoas_limpas'), $.Layouts.PessoaLimpa, THOR);   // dia 13
  EXPORT Entidades     := DATASET(NomeBase('entidades'),      $.Layouts.Entidade,    THOR);   // dia 15

END;
