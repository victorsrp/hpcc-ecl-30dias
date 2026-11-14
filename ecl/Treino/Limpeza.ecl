IMPORT $, STD;

// Funcoes de limpeza e padronizacao do curso (dia 13).
EXPORT Limpeza := MODULE

  EXPORT Texto(STRING s)     := STD.Str.ToUpperCase(STD.Str.CleanSpaces(s));
  EXPORT SoDigitos(STRING s) := STD.Str.Filter(s, '0123456789');

  EXPORT SsnValido(STRING s)   := REGEXFIND('^[0-9]{9}$', TRIM(s)) AND TRIM(s) NOT IN ['000000000', '999999999'];
  EXPORT FoneValido(STRING s)  := REGEXFIND('^[2-9][0-9]{2}[2-9][0-9]{6}$', TRIM(s));
  EXPORT EmailValido(STRING s) := REGEXFIND('^[a-z0-9._-]+@[a-z0-9-]+[.][a-z.]{2,}$', TRIM(s), NOCASE);
  EXPORT DataValida(UNSIGNED4 d, UNSIGNED4 hoje = 20261112) := STD.Date.IsValidDate(d) AND d BETWEEN 19000101 AND hoje;

  // Recebe o cadastro bruto e devolve o cadastro limpo (mesmas linhas, campos a mais).
  EXPORT Pessoas(DATASET($.Layouts.Pessoa) ds) := FUNCTION
    Passo1 := PROJECT(ds,
                      TRANSFORM($.Layouts.PessoaLimpa,
                                SELF.fname_clean := Texto(LEFT.first_name);
                                SELF.lname_clean := Texto(LEFT.last_name);
                                SELF.city_clean  := Texto(LEFT.city);
                                SELF.ssn_ok      := SsnValido(LEFT.ssn);
                                SELF.dob_ok      := DataValida(LEFT.dob);
                                SELF.phone_ok    := FoneValido(LEFT.phone);
                                SELF := LEFT));
    RETURN JOIN(Passo1, $.Apelidos,
                LEFT.fname_clean = RIGHT.apelido,
                TRANSFORM($.Layouts.PessoaLimpa,
                          SELF.fname_clean := IF(RIGHT.nome <> '', RIGHT.nome, LEFT.fname_clean);
                          SELF := LEFT),
                LEFT OUTER, LOOKUP);
  END;

END;
