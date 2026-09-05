"""Prepara configuração de homologação da VM sem imprimir segredos."""
from pathlib import Path
import json
import re
from urllib.parse import urlsplit, unquote

from dotenv import dotenv_values


def main():
    raiz = Path(__file__).resolve().parents[1]
    local = dotenv_values(raiz / '.env')
    identidade = dotenv_values(raiz / '.env.vm')
    url = identidade.get('WORKER_DATABASE_URL') or ''
    if unquote(urlsplit(url).username or '').split('.')[0] != 'nf_worker_vm':
        raise RuntimeError('Identidade da VM ausente ou incorreta.')
    permitidos = {'SISTEMA_FISCAL_URL', 'CLIENTES_ATIVOS', 'SUPABASE_URL',
                  'SUPABASE_SECRET_KEY', 'SUPABASE_STORAGE_BUCKET'}
    valores = {k: v for k, v in local.items() if v and (k in permitidos or
        re.fullmatch(r'CLIENTE_[A-Z0-9_]+_(LOGIN|SENHA|IDENTIDADE_ESPERADA|EMITENTE|NOME_EMITENTE)', k))}
    valores.update(WORKER_DATABASE_URL=url, WORKER_ID='worker-vm-homologacao',
        FONTE_TAREFAS='banco', AMBIENTE_EMISSAO='teste', MAX_CONCORRENCIA='1',
        DOWNLOAD_DIR='/app/downloads', LOG_DIR='/app/logs', DOCUMENTOS_RETENCAO_DIAS='30',
        WORKER_POLL_SECONDS='30')
    for nome in ('SMOKE_TEST', 'TESTAR_INTEGRACAO_BANCO', 'PROCESSAR_FILA_BANCO',
                 'TESTAR_NAVEGACAO_EMISSAO', 'TESTAR_PREENCHIMENTO_COMPLETO',
                 'TESTAR_EMISSAO_HOMOLOGACAO', 'ARMAZENAR_DOCUMENTOS',
                 'LIMPAR_DOCUMENTOS_EXPIRADOS', 'PROCESSAR_RECUPERACOES_DOCUMENTOS',
                 'WORKER_PERSISTENTE', 'HEADLESS'):
        valores[nome] = 'true'
    for nome in ('INSPECIONAR', 'PAUSAR_ANTES_TRANSPORTE', 'PAUSAR_ANTES_EMITIR',
                 'PAUSAR_APOS_DOWNLOADS', 'PAUSAR_APOS_CONSULTA',
                 'TESTAR_NAVEGACAO_CONSULTA', 'CONSULTAR_ULTIMO_XML', 'BAIXAR_DOCUMENTOS_CONSULTA'):
        valores[nome] = 'false'
    destino = raiz / '.env.vm.operacional'
    # Aspas simples preservam $, # e espaços no env_file do Compose.
    conteudo = ''.join(k + "='" + v.replace('\\', '\\\\').replace("'", "\\'") + "'\n"
                       for k, v in valores.items())
    destino.write_text(conteudo, encoding='utf-8')
    destino.chmod(0o600)
    if dict(dotenv_values(destino)) != valores:
        raise RuntimeError('Configuração não preservou os valores originais.')
    print(json.dumps({'configuracaoVmPreparada': True, 'segredosExibidos': False}))


if __name__ == '__main__':
    main()
