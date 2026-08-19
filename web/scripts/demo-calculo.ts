/**
 * Roda com: npm run demo:calculo
 *
 * Reproduz o exemplo da seção 5 do documento de visão:
 *   Couve-flor disponível: 100
 *   Cliente A → 40 (troca: 3)
 *   Cliente B → 30
 *   Cliente C → 30
 *
 * Não depende de banco nem de login no sistema fiscal — serve para validar
 * a regra de negócio isoladamente enquanto o acesso fiscal não chega.
 */
import {
  calcularFaturavel,
  validarDistribuicaoTotal,
  agruparEmTarefas,
} from "../src/lib/calculos";

const PRODUTO_COUVE_FLOR = "produto-couve-flor";
const CLIENTE_A = "cliente-a";
const CLIENTE_B = "cliente-b";
const CLIENTE_C = "cliente-c";

const quantidadeDisponivel = 100;
const precoUnitario = 4.5;

const itens = [
  { clienteId: CLIENTE_A, quantidadeDistribuida: 40, quantidadeTroca: 3, precoUnitario },
  { clienteId: CLIENTE_B, quantidadeDistribuida: 30, quantidadeTroca: 0, precoUnitario },
  { clienteId: CLIENTE_C, quantidadeDistribuida: 30, quantidadeTroca: 0, precoUnitario },
];

console.log("=== Validação do total distribuído ===");
const validacao = validarDistribuicaoTotal(quantidadeDisponivel, itens);
console.log(validacao);

console.log("\n=== Quantidade faturável por cliente ===");
for (const item of itens) {
  console.log(calcularFaturavel(item));
}

console.log("\n=== Tarefas geradas (RF11) ===");
const tarefas = agruparEmTarefas([
  { produtoId: PRODUTO_COUVE_FLOR, quantidadeDisponivel, itens },
]);
console.log(JSON.stringify(tarefas, null, 2));
