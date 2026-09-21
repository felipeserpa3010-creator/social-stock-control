import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  categoriesOptions,
  productsOptions,
  removeCategory,
  removeProduct,
  saveCategory,
  saveProduct,
  unitsOptions,
  type Category,
  type Product,
} from "@/lib/queries";
import { EmptyState, Field, PageHeader, Panel, SearchInput, TableSkeleton } from "@/components/ui-kit";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export const Route = createFileRoute("/_authenticated/produtos")({
  head: () => ({
    meta: [
      { title: "Produtos e categorias — Controle de Inventário" },
      {
        name: "description",
        content: "Cadastro de produtos da dispensa, unidades de medida, mínimos e categorias.",
      },
      { property: "og:title", content: "Produtos e categorias — Controle de Inventário" },
      {
        property: "og:description",
        content: "Gerencie os produtos controlados no inventário e suas categorias.",
      },
    ],
  }),
  component: ProductsPage,
});

const MEDIDAS = ["Kg", "Unidade", "Pacote", "Caixa", "Litro", "Fardo", "Pote", "Saco", "Outro"];

const emptyProduct = {
  nome: "",
  category_id: "",
  unidade_medida: "Unidade",
  estoque_minimo: "",
  estoque_maximo: "",
  observacao: "",
  ativo: true,
};

function ProductsPage() {
  const queryClient = useQueryClient();
  const { data: products = [], isPending } = useQuery(productsOptions(true));
  const { data: categories = [] } = useQuery(categoriesOptions(true));
  const [term, setTerm] = useState("");
  const [catFilter, setCatFilter] = useState("");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const [form, setForm] = useState(emptyProduct);
  const [saving, setSaving] = useState(false);
  const [confirm, setConfirm] = useState<Product | null>(null);

  const rows = useMemo(
    () =>
      products.filter((p) => {
        if (catFilter && p.category_id !== catFilter) return false;
        if (!term.trim()) return true;
        const q = term.trim().toLowerCase();
        return p.nome.toLowerCase().includes(q) || (p.categories?.nome ?? "").toLowerCase().includes(q);
      }),
    [products, term, catFilter],
  );

  const startNew = () => {
    setEditing(null);
    setForm({ ...emptyProduct, category_id: categories.find((c) => c.ativo)?.id ?? "" });
    setOpen(true);
  };
  const startEdit = (p: Product) => {
    setEditing(p);
    setForm({
      nome: p.nome,
      category_id: p.category_id,
      unidade_medida: p.unidade_medida,
      estoque_minimo: p.estoque_minimo === null ? "" : String(p.estoque_minimo),
      estoque_maximo: p.estoque_maximo === null ? "" : String(p.estoque_maximo),
      observacao: p.observacao ?? "",
      ativo: p.ativo,
    });
    setOpen(true);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.nome.trim()) {
      toast.error("Informe o nome do produto.");
      return;
    }
    if (!form.category_id) {
      toast.error("Selecione a categoria.");
      return;
    }
    setSaving(true);
    try {
      await saveProduct(editing?.id ?? null, {
        nome: form.nome.trim(),
        category_id: form.category_id,
        unidade_medida: form.unidade_medida,
        estoque_minimo: form.estoque_minimo.trim() === "" ? null : Number(form.estoque_minimo.replace(",", ".")),
        estoque_maximo: form.estoque_maximo.trim() === "" ? null : Number(form.estoque_maximo.replace(",", ".")),
        observacao: form.observacao.trim() || null,
        ativo: form.ativo,
      });
      queryClient.invalidateQueries({ queryKey: ["products"] });
      toast.success(editing ? "Produto atualizado." : "Produto cadastrado.");
      setOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Não foi possível salvar.");
    } finally {
      setSaving(false);
    }
  };

  const doDelete = async () => {
    if (!confirm) return;
    try {
      await removeProduct(confirm.id);
      queryClient.invalidateQueries({ queryKey: ["products"] });
      toast.success("Produto excluído.");
    } catch {
      toast.error("Este produto possui lançamentos. Desative-o em vez de excluir.");
    } finally {
      setConfirm(null);
    }
  };

  return (
    <>
      <PageHeader
        title="Produtos e categorias"
        description="Defina o que é controlado na dispensa, em qual medida e a partir de qual quantidade o estoque é considerado baixo."
      />
      <Tabs defaultValue="produtos" className="space-y-4">
        <TabsList>
          <TabsTrigger value="produtos">Produtos</TabsTrigger>
          <TabsTrigger value="categorias">Categorias</TabsTrigger>
        </TabsList>

        <TabsContent value="produtos" className="space-y-4">
          <Panel
            title={`${products.length} produtos cadastrados`}
            actions={
              <div className="flex flex-wrap items-center gap-2">
                <SearchInput value={term} onChange={setTerm} placeholder="Buscar produto..." className="w-44" />
                <select
                  value={catFilter}
                  onChange={(e) => setCatFilter(e.target.value)}
                  aria-label="Filtrar categoria"
                  className="h-9 rounded-md border border-input bg-background px-2 text-sm"
                >
                  <option value="">Todas as categorias</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nome}
                    </option>
                  ))}
                </select>
                <Button size="sm" onClick={startNew}>
                  <Plus /> Novo produto
                </Button>
              </div>
            }
            bodyClassName="p-0"
          >
            {isPending ? (
              <div className="p-4">
                <TableSkeleton rows={8} cols={4} />
              </div>
            ) : rows.length === 0 ? (
              <div className="p-4">
                <EmptyState
                  title="Nenhum produto nesta lista"
                  description="Cadastre produtos ou ajuste a busca."
                  action={<Button size="sm" onClick={startNew}>Cadastrar produto</Button>}
                />
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table className="min-w-[760px]">
                  <TableHeader>
                    <TableRow>
                      <TableHead>Produto</TableHead>
                      <TableHead>Categoria</TableHead>
                      <TableHead>Medida</TableHead>
                      <TableHead className="text-right">Mínimo</TableHead>
                      <TableHead className="text-right">Máximo</TableHead>
                      <TableHead>Situação</TableHead>
                      <TableHead className="text-right">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((p) => (
                      <TableRow key={p.id}>
                        <TableCell className="font-medium">{p.nome}</TableCell>
                        <TableCell className="text-muted-foreground">
                          {p.categories?.nome ?? "—"}
                        </TableCell>
                        <TableCell>{p.unidade_medida}</TableCell>
                        <TableCell className="text-right tabular-nums">
                          {p.estoque_minimo ?? "—"}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {p.estoque_maximo ?? "—"}
                        </TableCell>
                        <TableCell>
                          <Badge variant={p.ativo ? "secondary" : "outline"}>
                            {p.ativo ? "Ativo" : "Inativo"}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            <Button variant="ghost" size="sm" onClick={() => startEdit(p)}>
                              Editar
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              aria-label={`Excluir ${p.nome}`}
                              onClick={() => setConfirm(p)}
                            >
                              <Trash2 className="text-destructive" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </Panel>
        </TabsContent>

        <TabsContent value="categorias">
          <CategoriesPanel categories={categories} />
        </TabsContent>
      </Tabs>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? "Editar produto" : "Novo produto"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={submit} className="space-y-4">
            <Field label="Nome" htmlFor="p-nome" required>
              <Input
                id="p-nome"
                value={form.nome}
                onChange={(e) => setForm({ ...form, nome: e.target.value })}
                placeholder="Ex.: Flocão de milho"
              />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Categoria" htmlFor="p-cat" required>
                <select
                  id="p-cat"
                  value={form.category_id}
                  onChange={(e) => setForm({ ...form, category_id: e.target.value })}
                  className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                >
                  <option value="">Selecione...</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nome}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Unidade de medida" htmlFor="p-med" required>
                <Input
                  id="p-med"
                  list="medidas"
                  value={form.unidade_medida}
                  onChange={(e) => setForm({ ...form, unidade_medida: e.target.value })}
                />
                <datalist id="medidas">
                  {MEDIDAS.map((m) => (
                    <option key={m} value={m} />
                  ))}
                </datalist>
              </Field>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Estoque mínimo" htmlFor="p-min" hint="Alerta de reposição.">
                <Input
                  id="p-min"
                  inputMode="decimal"
                  value={form.estoque_minimo}
                  onChange={(e) => setForm({ ...form, estoque_minimo: e.target.value })}
                  placeholder="0"
                />
              </Field>
              <Field label="Estoque máximo" htmlFor="p-max" hint="Opcional.">
                <Input
                  id="p-max"
                  inputMode="decimal"
                  value={form.estoque_maximo}
                  onChange={(e) => setForm({ ...form, estoque_maximo: e.target.value })}
                  placeholder="—"
                />
              </Field>
            </div>
            <Field label="Observação" htmlFor="p-obs">
              <Textarea
                id="p-obs"
                rows={2}
                value={form.observacao}
                onChange={(e) => setForm({ ...form, observacao: e.target.value })}
              />
            </Field>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="size-4 accent-primary"
                checked={form.ativo}
                onChange={(e) => setForm({ ...form, ativo: e.target.checked })}
              />
              Produto ativo
            </label>
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={saving}>
                {saving && <Loader2 className="animate-spin" />}
                Salvar
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(confirm)} onOpenChange={(o) => !o && setConfirm(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Excluir produto</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Excluir <strong>{confirm?.nome}</strong> remove o produto das listas. Produtos com
            histórico não podem ser excluídos — nesse caso, desative o produto.
          </p>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirm(null)}>
              Cancelar
            </Button>
            <Button variant="destructive" onClick={doDelete}>
              Excluir
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function CategoriesPanel({ categories }: { categories: Category[] }) {
  const queryClient = useQueryClient();
  const { data: products = [] } = useQuery(productsOptions(true));
  const [nome, setNome] = useState("");
  const [saving, setSaving] = useState(false);
  const [confirm, setConfirm] = useState<Category | null>(null);

  const countBy = (id: string) => products.filter((p) => p.category_id === id).length;

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nome.trim()) return;
    setSaving(true);
    try {
      await saveCategory(null, nome.trim(), true);
      queryClient.invalidateQueries({ queryKey: ["categories"] });
      setNome("");
      toast.success("Categoria criada.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Não foi possível criar.");
    } finally {
      setSaving(false);
    }
  };

  const rename = async (c: Category) => {
    const next = window.prompt("Novo nome da categoria", c.nome);
    if (next === null || !next.trim() || next === c.nome) return;
    try {
      await saveCategory(c.id, next.trim(), c.ativo);
      queryClient.invalidateQueries({ queryKey: ["categories"] });
      toast.success("Categoria atualizada.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Não foi possível renomear.");
    }
  };

  const toggle = async (c: Category) => {
    try {
      await saveCategory(c.id, c.nome, !c.ativo);
      queryClient.invalidateQueries({ queryKey: ["categories"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Não foi possível atualizar.");
    }
  };

  const doDelete = async () => {
    if (!confirm) return;
    try {
      await removeCategory(confirm.id);
      queryClient.invalidateQueries({ queryKey: ["categories"] });
      toast.success("Categoria excluída.");
    } catch {
      toast.error("Esta categoria possui produtos. Mova os produtos antes de excluir.");
    } finally {
      setConfirm(null);
    }
  };

  return (
    <Panel
      title={`${categories.length} categorias`}
      description="Categorias organizam os produtos nos relatórios e nas buscas."
      bodyClassName="p-0"
    >
      <form onSubmit={add} className="flex flex-wrap items-center gap-2 border-b border-border/70 p-4">
        <Input
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          placeholder="Nova categoria (ex.: Materials de higiene)"
          className="w-full sm:max-w-xs"
          aria-label="Nome da nova categoria"
        />
        <Button type="submit" size="sm" disabled={saving}>
          <Plus /> Adicionar
        </Button>
      </form>
      {categories.length === 0 ? (
        <div className="p-4">
          <EmptyState title="Nenhuma categoria" description="Crie a primeira categoria acima." />
        </div>
      ) : (
        <ul className="divide-y divide-border/70">
          {categories.map((c) => (
            <li key={c.id} className="flex flex-wrap items-center gap-3 px-4 py-2.5">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{c.nome}</p>
                <p className="text-[11px] text-muted-foreground">
                  {countBy(c.id)} produtos · {c.ativo ? "ativa" : "inativa"}
                </p>
              </div>
              <Button variant="ghost" size="sm" onClick={() => rename(c)}>
                Renomear
              </Button>
              <Button variant="ghost" size="sm" onClick={() => toggle(c)}>
                {c.ativo ? "Desativar" : "Ativar"}
              </Button>
              <Button variant="ghost" size="sm" aria-label={`Excluir ${c.nome}`} onClick={() => setConfirm(c)}>
                <Trash2 className="text-destructive" />
              </Button>
            </li>
          ))}
        </ul>
      )}

      <Dialog open={Boolean(confirm)} onOpenChange={(o) => !o && setConfirm(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Excluir categoria</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            <strong>{confirm?.nome}</strong> será excluída. Categorias com produtos não podem ser
            excluídas.
          </p>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirm(null)}>
              Cancelar
            </Button>
            <Button variant="destructive" onClick={doDelete}>
              Excluir
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Panel>
  );
}
