-- ENUMS
CREATE TYPE public.app_role AS ENUM ('admin','responsavel');
CREATE TYPE public.movement_type AS ENUM ('entrada','saida','conferencia','ajuste');

-- UNITS
CREATE TABLE public.units (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  sigla text,
  responsavel text,
  endereco text,
  telefone text,
  observacao text,
  ativo boolean NOT NULL DEFAULT true,
  demo boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.units TO authenticated;
GRANT ALL ON public.units TO service_role;

-- PROFILES
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  nome text NOT NULL DEFAULT '',
  email text NOT NULL DEFAULT '',
  unit_id uuid REFERENCES public.units(id) ON DELETE SET NULL,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;

CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  role public.app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;

-- HELPERS
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role);
$$;

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin');
$$;

CREATE OR REPLACE FUNCTION public.my_unit()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT unit_id FROM public.profiles WHERE user_id = auth.uid() AND ativo = true;
$$;

CREATE OR REPLACE FUNCTION public.can_access_unit(_unit_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.is_admin() OR (_unit_id IS NOT NULL AND _unit_id = public.my_unit());
$$;

CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

-- CATEGORIES
CREATE TABLE public.categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL UNIQUE,
  ativo boolean NOT NULL DEFAULT true,
  demo boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.categories TO authenticated;
GRANT ALL ON public.categories TO service_role;

-- PRODUCTS
CREATE TABLE public.products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  category_id uuid NOT NULL REFERENCES public.categories(id) ON DELETE RESTRICT,
  unidade_medida text NOT NULL,
  estoque_minimo numeric,
  estoque_maximo numeric,
  observacao text,
  ativo boolean NOT NULL DEFAULT true,
  demo boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.products TO authenticated;
GRANT ALL ON public.products TO service_role;
CREATE INDEX idx_products_category ON public.products(category_id);

-- STOCK
CREATE TABLE public.stock (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  unit_id uuid NOT NULL REFERENCES public.units(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  quantidade numeric NOT NULL DEFAULT 0 CHECK (quantidade >= 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (unit_id, product_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.stock TO authenticated;
GRANT ALL ON public.stock TO service_role;
CREATE INDEX idx_stock_unit ON public.stock(unit_id);

-- MOVEMENTS
CREATE TABLE public.stock_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  unit_id uuid NOT NULL REFERENCES public.units(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  tipo public.movement_type NOT NULL,
  quantidade numeric NOT NULL,
  data date NOT NULL DEFAULT current_date,
  user_id uuid,
  responsavel text,
  observacao text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.stock_movements TO authenticated;
GRANT ALL ON public.stock_movements TO service_role;
CREATE INDEX idx_mov_unit_data ON public.stock_movements(unit_id, data);
CREATE INDEX idx_mov_product ON public.stock_movements(product_id);

-- CHECKS
CREATE TABLE public.stock_checks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  unit_id uuid NOT NULL REFERENCES public.units(id) ON DELETE CASCADE,
  data_conferencia date NOT NULL DEFAULT current_date,
  user_id uuid,
  responsavel text,
  observacao text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.stock_checks TO authenticated;
GRANT ALL ON public.stock_checks TO service_role;
CREATE INDEX idx_checks_unit ON public.stock_checks(unit_id, data_conferencia DESC);

CREATE TABLE public.stock_check_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  stock_check_id uuid NOT NULL REFERENCES public.stock_checks(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  quantidade_registrada numeric NOT NULL DEFAULT 0,
  quantidade_conferida numeric NOT NULL DEFAULT 0,
  diferenca numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.stock_check_items TO authenticated;
GRANT ALL ON public.stock_check_items TO service_role;
CREATE INDEX idx_check_items ON public.stock_check_items(stock_check_id);

-- SETTINGS
CREATE TABLE public.settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome_instituicao text NOT NULL DEFAULT 'Secretaria de Assistência Social',
  nome_secretaria text NOT NULL DEFAULT 'Secretaria Municipal de Assistência Social',
  logo_url text,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.settings TO authenticated;
GRANT ALL ON public.settings TO service_role;

-- TRIGGERS: estoque
CREATE OR REPLACE FUNCTION public.apply_movement()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE atual numeric; nova numeric; unit_ativa boolean;
BEGIN
  SELECT ativo INTO unit_ativa FROM public.units WHERE id = NEW.unit_id;
  IF unit_ativa IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'Unidade desativada: não é possível registrar movimentações.';
  END IF;
  IF NEW.quantidade <= 0 AND NEW.tipo IN ('entrada','saida') THEN
    RAISE EXCEPTION 'A quantidade deve ser maior que zero.';
  END IF;
  IF NEW.tipo IN ('conferencia') THEN RETURN NEW; END IF;

  INSERT INTO public.stock (unit_id, product_id, quantidade)
  VALUES (NEW.unit_id, NEW.product_id, 0)
  ON CONFLICT (unit_id, product_id) DO NOTHING;

  SELECT quantidade INTO atual FROM public.stock WHERE unit_id = NEW.unit_id AND product_id = NEW.product_id;
  IF NEW.tipo = 'entrada' THEN nova := atual + NEW.quantidade;
  ELSIF NEW.tipo = 'saida' THEN nova := atual - NEW.quantidade;
  ELSE nova := atual + NEW.quantidade; END IF;

  IF nova < 0 THEN
    RAISE EXCEPTION 'Estoque insuficiente. Disponível: %', atual;
  END IF;

  UPDATE public.stock SET quantidade = nova, updated_at = now()
  WHERE unit_id = NEW.unit_id AND product_id = NEW.product_id;
  RETURN NEW;
END; $$;
CREATE TRIGGER trg_apply_movement BEFORE INSERT ON public.stock_movements
FOR EACH ROW EXECUTE FUNCTION public.apply_movement();

CREATE OR REPLACE FUNCTION public.apply_check_item()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE u uuid; d date; uid uuid; resp text;
BEGIN
  SELECT unit_id, data_conferencia, user_id, responsavel INTO u, d, uid, resp
  FROM public.stock_checks WHERE id = NEW.stock_check_id;

  NEW.diferenca := NEW.quantidade_conferida - NEW.quantidade_registrada;

  INSERT INTO public.stock (unit_id, product_id, quantidade)
  VALUES (u, NEW.product_id, GREATEST(NEW.quantidade_conferida, 0))
  ON CONFLICT (unit_id, product_id)
  DO UPDATE SET quantidade = GREATEST(NEW.quantidade_conferida, 0), updated_at = now();

  IF NEW.diferenca <> 0 THEN
    INSERT INTO public.stock_movements (unit_id, product_id, tipo, quantidade, data, user_id, responsavel, observacao)
    VALUES (u, NEW.product_id, 'conferencia', NEW.diferenca, d, uid, resp, 'Ajuste automático por conferência');
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER trg_apply_check_item BEFORE INSERT ON public.stock_check_items
FOR EACH ROW EXECUTE FUNCTION public.apply_check_item();

CREATE TRIGGER trg_units_touch BEFORE UPDATE ON public.units FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER trg_products_touch BEFORE UPDATE ON public.products FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER trg_profiles_touch BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- RLS
ALTER TABLE public.units ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_checks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_check_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY units_select ON public.units FOR SELECT TO authenticated
  USING (public.is_admin() OR id = public.my_unit());
CREATE POLICY units_admin_write ON public.units FOR INSERT TO authenticated WITH CHECK (public.is_admin());
CREATE POLICY units_admin_update ON public.units FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY units_admin_delete ON public.units FOR DELETE TO authenticated USING (public.is_admin());

CREATE POLICY profiles_select ON public.profiles FOR SELECT TO authenticated
  USING (public.is_admin() OR user_id = auth.uid());
CREATE POLICY profiles_self_update ON public.profiles FOR UPDATE TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid() AND unit_id IS NOT DISTINCT FROM public.my_unit());
CREATE POLICY profiles_admin_update ON public.profiles FOR UPDATE TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE POLICY roles_select ON public.user_roles FOR SELECT TO authenticated
  USING (public.is_admin() OR user_id = auth.uid());

CREATE POLICY cat_select ON public.categories FOR SELECT TO authenticated USING (true);
CREATE POLICY cat_insert ON public.categories FOR INSERT TO authenticated WITH CHECK (public.is_admin());
CREATE POLICY cat_update ON public.categories FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY cat_delete ON public.categories FOR DELETE TO authenticated USING (public.is_admin());

CREATE POLICY prod_select ON public.products FOR SELECT TO authenticated USING (true);
CREATE POLICY prod_insert ON public.products FOR INSERT TO authenticated WITH CHECK (public.is_admin());
CREATE POLICY prod_update ON public.products FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY prod_delete ON public.products FOR DELETE TO authenticated USING (public.is_admin());

CREATE POLICY stock_select ON public.stock FOR SELECT TO authenticated USING (public.can_access_unit(unit_id));
CREATE POLICY stock_insert ON public.stock FOR INSERT TO authenticated WITH CHECK (public.can_access_unit(unit_id));
CREATE POLICY stock_update ON public.stock FOR UPDATE TO authenticated USING (public.can_access_unit(unit_id)) WITH CHECK (public.can_access_unit(unit_id));

CREATE POLICY mov_select ON public.stock_movements FOR SELECT TO authenticated USING (public.can_access_unit(unit_id));
CREATE POLICY mov_insert ON public.stock_movements FOR INSERT TO authenticated
  WITH CHECK (public.can_access_unit(unit_id) AND user_id = auth.uid());

CREATE POLICY checks_select ON public.stock_checks FOR SELECT TO authenticated USING (public.can_access_unit(unit_id));
CREATE POLICY checks_insert ON public.stock_checks FOR INSERT TO authenticated
  WITH CHECK (public.can_access_unit(unit_id) AND user_id = auth.uid());

CREATE POLICY check_items_select ON public.stock_check_items FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.stock_checks c WHERE c.id = stock_check_id AND public.can_access_unit(c.unit_id)));
CREATE POLICY check_items_insert ON public.stock_check_items FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.stock_checks c WHERE c.id = stock_check_id AND public.can_access_unit(c.unit_id) AND c.user_id = auth.uid()));

CREATE POLICY settings_select ON public.settings FOR SELECT TO authenticated USING (true);
CREATE POLICY settings_insert ON public.settings FOR INSERT TO authenticated WITH CHECK (public.is_admin());
CREATE POLICY settings_update ON public.settings FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

-- SEED
INSERT INTO public.settings (nome_instituicao, nome_secretaria) VALUES
  ('Prefeitura Municipal', 'Secretaria Municipal de Assistência Social');

INSERT INTO public.categories (nome, demo) VALUES
  ('Alimentos', true),('Produtos de limpeza', true),('Verduras e hortaliças', true),
  ('Fraldas', true),('Higiene pessoal', true),('Outros', true);

INSERT INTO public.units (nome, sigla, demo) VALUES
  ('CRAS','CRAS',true),('CRAS Primavera','CRAS-P',true),('ILPI','ILPI',true),
  ('Abrigo das Crianças','ABRIGO',true),('SCFV','SCFV',true),('CREAS','CREAS',true);

INSERT INTO public.products (nome, category_id, unidade_medida, estoque_minimo, demo)
SELECT p.nome, c.id, p.um, p.min, true FROM (VALUES
  ('Arroz','Alimentos','Kg',10),
  ('Feijão','Alimentos','Kg',8),
  ('Açúcar','Alimentos','Kg',5),
  ('Café','Alimentos','Pacote',5),
  ('Leite','Alimentos','Caixa',12),
  ('Macarrão','Alimentos','Pacote',10),
  ('Detergente','Produtos de limpeza','Unidade',10),
  ('Água sanitária','Produtos de limpeza','Litro',6),
  ('Desinfetante','Produtos de limpeza','Litro',6),
  ('Sabão em pó','Produtos de limpeza','Pacote',5),
  ('Papel higiênico','Higiene pessoal','Pacote',6),
  ('Fralda M','Fraldas','Pacote',5),
  ('Fralda G','Fraldas','Pacote',5),
  ('Alface','Verduras e hortaliças','Unidade',5),
  ('Tomate','Verduras e hortaliças','Kg',3),
  ('Cebola','Verduras e hortaliças','Kg',3)
) AS p(nome, cat, um, min)
JOIN public.categories c ON c.nome = p.cat;