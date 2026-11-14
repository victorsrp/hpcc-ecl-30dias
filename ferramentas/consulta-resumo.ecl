// Consulta de apoio do curso, publicada no Roxie como "ecl30_resumo_pessoa" pelo preparar.mjs.
// Usada no dia 24 (SOAPCALL) e no modulo 6.
IMPORT Treino;

UNSIGNED4 PessoaId := 0 : STORED('PessoaId');

Sinis := LIMIT(Treino.Chaves.SinistrosPorPessoa(KEYED(person_id = PessoaId)), 1000, SKIP);

OUTPUT(TABLE(Sinis, {UNSIGNED4 pessoa_id  := PessoaId,
                     UNSIGNED2 qtd        := COUNT(GROUP),
                     UNSIGNED4 total      := SUM(GROUP, amount),
                     UNSIGNED4 total_pago := SUM(GROUP, IF(status = 'PAID', amount, 0))}), NAMED('Resumo'));
