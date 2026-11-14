IMPORT $, STD;

// Vinculo de registros (dia 15): descobre quais cadastros sao a mesma pessoa
// e da a todos eles o mesmo entidade_id (o menor id do grupo).
EXPORT Vinculo := MODULE

  EXPORT Layout_Par := RECORD
    UNSIGNED4 id_a;
    UNSIGNED4 id_b;
    UNSIGNED1 pontos;
  END;

  SHARED Layout_Fino := RECORD
    UNSIGNED4 id;
    STRING20  fname_clean;
    STRING20  lname_clean;
    UNSIGNED4 dob;
    STRING9   ssn;
    BOOLEAN   ssn_ok;
    STRING10  phone;
    STRING5   zip;
  END;

  // Regra de pontuacao: quanto mais campos batem, mais pontos.
  EXPORT Pontuar(Layout_Fino a, Layout_Fino b) :=
      IF(a.ssn_ok AND b.ssn_ok AND a.ssn = b.ssn, 5, 0)
    + IF(a.dob = b.dob, 3, 0)
    + MAP(a.lname_clean = b.lname_clean => 3,
          STD.Str.EditDistance(TRIM(a.lname_clean), TRIM(b.lname_clean)) <= 1 => 2,
          0)
    + IF(a.fname_clean = b.fname_clean, 2, 0)
    + IF(a.phone = b.phone AND a.phone <> '', 2, 0)
    + IF(a.zip = b.zip, 1, 0);

  EXPORT Limiar := 7;

  SHARED Layout_Par FazPar(Layout_Fino a, Layout_Fino b) := TRANSFORM
    SELF.id_a   := a.id;
    SELF.id_b   := b.id;
    SELF.pontos := Pontuar(a, b);
  END;

  // Pares candidatos (blocagem) ja pontuados
  EXPORT Candidatos(DATASET($.Layouts.PessoaLimpa) ds) := FUNCTION
    Fino   := PROJECT(ds, Layout_Fino);
    ComSsn := Fino(ssn_ok);
    Bloco1 := JOIN(ComSsn, ComSsn,
                   LEFT.ssn = RIGHT.ssn AND LEFT.id < RIGHT.id,
                   FazPar(LEFT, RIGHT), ATMOST(LEFT.ssn = RIGHT.ssn, 50));
    Bloco2 := JOIN(Fino, Fino,
                   LEFT.dob = RIGHT.dob AND LEFT.phone = RIGHT.phone AND LEFT.id < RIGHT.id,
                   FazPar(LEFT, RIGHT), ATMOST(LEFT.dob = RIGHT.dob AND LEFT.phone = RIGHT.phone, 50));
    RETURN DEDUP(SORT(Bloco1 + Bloco2, id_a, id_b), id_a, id_b);
  END;

  // Cadastro com entidade_id
  EXPORT Resolver(DATASET($.Layouts.PessoaLimpa) ds) := FUNCTION
    Iguais := Candidatos(ds)(pontos >= Limiar);
    Menor  := TABLE(Iguais, {id_b, UNSIGNED4 menor := MIN(GROUP, id_a)}, id_b);
    RETURN JOIN(ds, Menor,
                LEFT.id = RIGHT.id_b,
                TRANSFORM($.Layouts.Entidade,
                          SELF.entidade_id := IF(RIGHT.id_b <> 0, RIGHT.menor, LEFT.id);
                          SELF := LEFT),
                LEFT OUTER, KEEP(1));
  END;

END;
