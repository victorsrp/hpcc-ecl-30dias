IMPORT $;

// Indices de referencia do curso (modulo 4 em diante).
// Uso: IMPORT Treino;  OUTPUT(Treino.Chaves.PorNome(KEYED(lname_clean = 'SMITH')));
// Construcao: Treino.Chaves.Construir;  (roda no Thor)
EXPORT Chaves := MODULE

  SHARED E := $.Arquivos.Entidades;
  SHARED Nome(STRING n) := $.Arquivos.Prefixo + 'key::' + n;

  // Busca por nome: sobrenome, nome, estado
  EXPORT PorNome := INDEX(E, {lname_clean, fname_clean, state},
                          {entidade_id, id, dob, city_clean, zip, ssn, phone}, Nome('pessoa_nome'));

  // Busca reversa por SSN e por telefone
  EXPORT PorSsn  := INDEX(E(ssn_ok),      {ssn},   {entidade_id, id}, Nome('pessoa_ssn'));
  EXPORT PorFone := INDEX(E(phone <> ''), {phone}, {entidade_id, id}, Nome('pessoa_fone'));

  // Todos os cadastros de uma pessoa real
  EXPORT PorEntidade := INDEX(E, {entidade_id},
                              {id, first_name, last_name, dob, ssn, street, city, state, zip, phone, email}, Nome('pessoa_entidade'));

  // Sinistros e veiculos de uma pessoa (person_id = entidade_id)
  EXPORT SinistrosPorPessoa := INDEX($.Arquivos.Sinistros, {person_id},
                                     {claim_id, claim_date, claim_type, amount, repair_shop, status, vin}, Nome('sinistro_pessoa'));
  EXPORT VeiculosPorPessoa  := INDEX($.Arquivos.Veiculos, {person_id},
                                     {vin, make, model, year, plate, state}, Nome('veiculo_pessoa'));

  EXPORT Construir := PARALLEL(
    BUILD(PorNome, OVERWRITE),
    BUILD(PorSsn, OVERWRITE),
    BUILD(PorFone, OVERWRITE),
    BUILD(PorEntidade, OVERWRITE),
    BUILD(SinistrosPorPessoa, OVERWRITE),
    BUILD(VeiculosPorPessoa, OVERWRITE)
  );

END;
