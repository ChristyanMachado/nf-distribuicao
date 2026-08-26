import Card from "@/components/Card";
import { IconBuilding, IconChart, IconCrate, IconReceipt, IconUsers } from "@/components/icons";

const opcoes = [
  { href: "/relatorios", titulo: "Relatórios operacionais", descricao: "Resultados, volume, clientes e produtos.", Icon: IconChart },
  { href: "/entregas", titulo: "Roteiros de entrega", descricao: "Folha diária profissional para o motorista.", Icon: IconReceipt },
  { href: "/clientes", titulo: "Clientes", descricao: "Mercados e dados fiscais de destinatário.", Icon: IconUsers },
  { href: "/produtos", titulo: "Produtos", descricao: "Catálogo, preços e regra fiscal reutilizável.", Icon: IconCrate },
  { href: "/emitentes", titulo: "Emitentes", descricao: "Empresas emissoras e integração com o Worker.", Icon: IconBuilding },
];

export default function MaisPage() {
  return <div><h1 className="text-2xl font-medium">Mais</h1><p className="mt-1 text-[15px] text-[var(--ink-soft)]">Relatórios, entregas e cadastros em um só lugar.</p><div className="mt-5 grid gap-3 sm:grid-cols-2">{opcoes.map(({ href, titulo, descricao, Icon }) => <a key={href} href={href} className="block"><Card className="flex min-h-24 items-start gap-3 p-4 transition hover:border-[var(--line-strong)] active:scale-[0.99]"><Icon className="mt-0.5 h-5 w-5 shrink-0 text-[var(--field)]"/><span><span className="block font-medium">{titulo}</span><span className="mt-1 block text-[13px] leading-relaxed text-[var(--ink-soft)]">{descricao}</span></span></Card></a>)}</div></div>;
}
