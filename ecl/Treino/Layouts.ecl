// Layouts dos arquivos grandes do curso (IMPORT Treino;)
EXPORT Layouts := MODULE

  // 21.800 linhas. Tem duplicatas e sujeira de proposito (dias 13 e 15).
  EXPORT Pessoa := RECORD
    UNSIGNED4   id;
    STRING20    first_name;
    STRING20    last_name;
    UNSIGNED4   dob;          // AAAAMMDD
    STRING9     ssn;          // pode vir vazio
    STRING1     gender;
    STRING30    street;
    STRING20    city;
    STRING2     state;
    STRING5     zip;
    STRING10    phone;
    STRING50    email;
  END;

  // 15.000 linhas
  EXPORT Veiculo := RECORD
    STRING17    vin;
    UNSIGNED4   person_id;
    STRING12    make;
    STRING12    model;
    UNSIGNED2   year;
    STRING7     plate;
    STRING2     state;
  END;

  // ~30.000 linhas
  EXPORT Sinistro := RECORD
    UNSIGNED4   claim_id;
    UNSIGNED4   person_id;
    STRING10    policy;
    UNSIGNED4   claim_date;   // AAAAMMDD
    STRING10    claim_type;   // COLLISION, INJURY, GLASS, THEFT, FIRE
    UNSIGNED4   amount;
    STRING17    vin;
    STRING25    repair_shop;
    STRING6     status;       // PAID, OPEN, DENIED
  END;

  // 120.000 linhas
  EXPORT Transacao := RECORD
    UNSIGNED4   txn_id;
    UNSIGNED4   person_id;
    UNSIGNED4   txn_date;     // AAAAMMDD
    STRING4     txn_time;     // HHMM
    DECIMAL9_2  amount;
    STRING16    merchant;
    STRING12    category;
    STRING2     state;        // onde a compra aconteceu
  END;

  // Pessoa depois da limpeza do dia 13: campos originais + campos limpos e de qualidade
  EXPORT PessoaLimpa := RECORD
    Pessoa;
    STRING20    fname_clean;  // maiusculas, apelido resolvido
    STRING20    lname_clean;
    STRING20    city_clean;
    BOOLEAN     ssn_ok;
    BOOLEAN     dob_ok;
    BOOLEAN     phone_ok;
  END;

  // Pessoa depois do vinculo de registros do dia 15
  EXPORT Entidade := RECORD
    UNSIGNED4   entidade_id;  // o mesmo numero para todos os cadastros da mesma pessoa
    PessoaLimpa;
  END;

END;
