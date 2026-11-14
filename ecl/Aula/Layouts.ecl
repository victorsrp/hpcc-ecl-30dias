// Layouts das tabelas pequenas usadas nas aulas (IMPORT Aula;)
EXPORT Layouts := MODULE

  EXPORT Cliente := RECORD
    UNSIGNED4   id;
    STRING10    nome;
    STRING12    sobrenome;
    STRING2     estado;
    STRING12    cidade;
    UNSIGNED4   nascimento;   // AAAAMMDD
    DECIMAL9_2  renda;        // renda mensal
    UNSIGNED2   score;        // score de credito (0 = sem score)
  END;

  EXPORT Sinistro := RECORD
    UNSIGNED4   sinistro_id;
    UNSIGNED4   cliente_id;
    STRING10    tipo;         // COLLISION, INJURY, GLASS, THEFT, FIRE
    UNSIGNED4   valor;
    UNSIGNED4   dt;           // data em AAAAMMDD ("data" e palavra reservada do ECL)
    STRING22    oficina;
    STRING6     status;       // PAID, OPEN, DENIED
  END;

  EXPORT Transacao := RECORD
    UNSIGNED4   txn_id;
    UNSIGNED4   cliente_id;
    UNSIGNED4   dt;           // data em AAAAMMDD ("data" e palavra reservada do ECL)
    DECIMAL9_2  valor;
    STRING16    loja;
    STRING12    categoria;
    STRING2     estado;       // onde a compra aconteceu
  END;

END;
