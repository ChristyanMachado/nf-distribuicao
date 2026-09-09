-- SOMENTE no projeto nf-distribuicao-homologacao, após confirmar seu ID.
-- Dados sintéticos: não usar em portal fiscal. Não cria notas nem tarefas.
INSERT INTO fiscal.emitentes (id, nome, cnpj, credencial_referencia, valor_select_nfpe)
SELECT ('30000000-0000-4000-8000-' || lpad(i::text, 12, '0'))::uuid,
       'QA EMITENTE FICTÍCIO ' || i, '11222333000181', 'QA_SEM_CREDENCIAL_' || i, 'qa-nao-usar-no-portal-' || i
FROM generate_series(1,2) i ON CONFLICT (id) DO NOTHING;

INSERT INTO fiscal.clientes (id, nome, cnpj, inscricao_estadual, cep, numero_endereco, observacoes)
SELECT ('20000000-0000-4000-8000-' || lpad(i::text, 12, '0'))::uuid,
       'QA MERCADO FICTÍCIO ' || i, '11222333000181', '1234567890', '80000000', '1',
       'Fixture sintética. Nenhuma correspondência operacional. Não emitir.'
FROM generate_series(1,5) i ON CONFLICT (id) DO NOTHING;

INSERT INTO fiscal.cliente_emitentes (cliente_id, emitente_id)
SELECT c.id, e.id FROM fiscal.clientes c CROSS JOIN fiscal.emitentes e
WHERE c.id IN (SELECT ('20000000-0000-4000-8000-' || lpad(i::text,12,'0'))::uuid FROM generate_series(1,5) i)
AND e.id IN (SELECT ('30000000-0000-4000-8000-' || lpad(i::text,12,'0'))::uuid FROM generate_series(1,2) i)
ON CONFLICT (cliente_id, emitente_id) DO NOTHING;

INSERT INTO fiscal.produtos (id, descricao, codigo_interno, codigo_fiscal, regra_fiscal_id, unidade, preco_padrao)
SELECT ('10000000-0000-4000-8000-' || lpad(i::text,12,'0'))::uuid,
       'QA PRODUTO FICTÍCIO ' || lpad(i::text,2,'0'), 'QA-' || i, 'QA-' || i,
       r.id, 'UN', (i + 1)::numeric
FROM generate_series(1,26) i CROSS JOIN fiscal.regras_fiscais r
WHERE r.codigo='NFPE_VENDA_PADRAO' ON CONFLICT (id) DO NOTHING;
