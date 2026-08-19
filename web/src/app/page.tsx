import Card from "@/components/Card";
import { IconScale, IconList, IconUsers, IconCrate, IconChart } from "@/components/icons";

const ATALHOS = [
  {
    href: "/distribuicao",
    Icon: IconScale,
    titulo: "Nova distribuição",
    desc: "Informar disponibilidade e dividir entre clientes.",
    destaque: true,
  },
  {
    href: "/relatorios",
    Icon: IconChart,
    titulo: "Relatórios",
    desc: "Faturamento, ranking de clientes e produtos.",
  },
  {
    href: "/tarefas",
    Icon: IconList,
    titulo: "Tarefas de emissão",
    desc: "Status das notas pendentes e emitidas.",
  },
  {
    href: "/clientes",
    Icon: IconUsers,
    titulo: "Clientes",
    desc: "Cadastro e emitente associado.",
  },
  {
    href: "/produtos",
    Icon: IconCrate,
    titulo: "Produtos",
    desc: "Cadastro e preço padrão.",
  },
];

export default function DashboardPage() {
  return (
    <div>
      <h1 className="text-2xl font-medium">Início</h1>
      <p className="mt-2 text-[15px] leading-relaxed text-[var(--ink-soft)]">
        Registrar a disponibilidade, distribuir entre os clientes e gerar as
        tarefas de emissão — nessa ordem.
      </p>

      <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
        {ATALHOS.map(({ href, Icon, titulo, desc, destaque }) => (
          <a key={href} href={href} className="block">
            <Card
              className={`p-4 transition active:scale-[0.98] ${
                destaque
                  ? "border-[var(--field)] bg-[var(--field-tint)]"
                  : "hover:border-[var(--line-strong)]"
              }`}
            >
              <Icon
                className={`h-5 w-5 ${
                  destaque ? "text-[var(--field-strong)]" : "text-[var(--ink-soft)]"
                }`}
              />
              <p className="mt-2 font-medium">{titulo}</p>
              <p className="mt-0.5 text-[13px] text-[var(--ink-soft)]">{desc}</p>
            </Card>
          </a>
        ))}
      </div>
    </div>
  );
}
