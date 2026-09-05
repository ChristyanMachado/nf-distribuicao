"""Regressão em Chromium com HTML sintético, sem rede ou dados fiscais."""
import asyncio
import logging

from playwright.async_api import async_playwright, TimeoutError as PlaywrightTimeoutError
from src.flows.emissao import avancar_transporte


async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        page = await browser.new_page()
        await page.route('**/*', lambda route: route.abort())
        # Duas cópias visíveis, remoção da antiga e recriação da atual enquanto
        # click espera habilitação. Nenhuma posição histórica deve ser usada.
        await page.set_content('''<button disabled>Avançar</button>
            <div id="atual"><button disabled>Avançar</button></div>
            <script>setTimeout(() => {
              document.querySelector('button').remove();
              document.querySelector('#atual').innerHTML =
                `<button onclick="this.outerHTML='<button>Emitir</button>'">Avançar</button>`;
            }, 150);</script>''')
        await avancar_transporte(page, logging.getLogger('regressao'))
        assert await page.get_by_role('button', name='Emitir', exact=True).count() == 1
        # Cópia oculta posterior e botão com nome parecido não são candidatos.
        await page.set_content('''<button onclick="this.outerHTML='<button>Emitir</button>'">Avançar</button>
            <button style="display:none">Avançar</button><button>Avançar errado</button>''')
        await avancar_transporte(page, logging.getLogger('regressao'))
        assert await page.get_by_role('button', name='Emitir', exact=True).count() == 1
        await browser.close()
    print('Transporte dinamico: 2 cenarios aprovados; nenhuma emissao executada.')


if __name__ == '__main__':
    asyncio.run(main())
