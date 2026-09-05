"""Prova local do Chromium no container, sem rede, banco ou credenciais."""
from __future__ import annotations

import asyncio
import json

from playwright.async_api import async_playwright


async def verificar() -> None:
    async with async_playwright() as playwright:
        browser = await playwright.chromium.launch(headless=True)
        try:
            context = await browser.new_context()
            try:
                page = await context.new_page()
                await page.set_content("<main data-runtime='ok'>Graalyst</main>")
                valor = await page.locator("main").get_attribute("data-runtime")
                if valor != "ok":
                    raise RuntimeError("O Chromium não confirmou o conteúdo local.")
            finally:
                await context.close()
        finally:
            await browser.close()


def main() -> int:
    asyncio.run(verificar())
    print(json.dumps({"runtimePlaywright": True}, separators=(",", ":")))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
