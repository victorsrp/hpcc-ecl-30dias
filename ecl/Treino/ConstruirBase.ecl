IMPORT $;

// Converte os CSVs crus nos arquivos base do curso. Roda no Thor.
// Uso: IMPORT Treino;  Treino.ConstruirBase;
A := $.Arquivos;

EXPORT ConstruirBase := SEQUENTIAL(
  OUTPUT(A.PessoasRaw,    , A.NomeBase('pessoas'),    OVERWRITE),
  OUTPUT(A.VeiculosRaw,   , A.NomeBase('veiculos'),   OVERWRITE),
  OUTPUT(A.SinistrosRaw,  , A.NomeBase('sinistros'),  OVERWRITE),
  OUTPUT(A.TransacoesRaw, , A.NomeBase('transacoes'), OVERWRITE),
  OUTPUT($.Limpeza.Pessoas(A.Pessoas), , A.NomeBase('pessoas_limpas'), OVERWRITE),
  OUTPUT($.Vinculo.Resolver(A.PessoasLimpas), , A.NomeBase('entidades'), OVERWRITE)
);
