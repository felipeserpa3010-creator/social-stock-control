-- Configura o perfil somente leitura do Gabinete SEMADS após a criação do valor do enum.
CREATE OR REPLACE FUNCTION public.is_viewer()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid() AND role = 'visualizador'
  );
$$;

CREATE OR REPLACE FUNCTION public.can_access_unit(_unit_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.is_admin()
    OR public.is_viewer()
    OR (_unit_id IS NOT NULL AND _unit_id = public.my_unit());
$$;

DROP POLICY IF EXISTS units_select ON public.units;
CREATE POLICY units_select ON public.units FOR SELECT TO authenticated
  USING (public.is_admin() OR public.is_viewer() OR id = public.my_unit());

UPDATE public.user_roles ur
SET role = 'visualizador'
WHERE ur.role = 'responsavel'
  AND EXISTS (
    SELECT 1
    FROM public.profiles p
    JOIN public.units u ON u.id = p.unit_id
    WHERE p.user_id = ur.user_id
      AND lower(u.nome) = lower('Gabinete SEMADS')
  );

CREATE OR REPLACE FUNCTION public.enforce_semads_viewer()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE unit_name text;
BEGIN
  SELECT lower(nome) INTO unit_name FROM public.units WHERE id = NEW.unit_id;

  IF unit_name = lower('Gabinete SEMADS') AND NEW.role <> 'visualizador' THEN
    RAISE EXCEPTION 'Usuários do Gabinete SEMADS devem ter perfil Visualizador.';
  END IF;

  IF NEW.role = 'visualizador' AND unit_name IS DISTINCT FROM lower('Gabinete SEMADS') THEN
    RAISE EXCEPTION 'O perfil Visualizador é exclusivo do Gabinete SEMADS.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_semads_viewer ON public.user_roles;
CREATE TRIGGER trg_enforce_semads_viewer
BEFORE INSERT OR UPDATE OF role ON public.user_roles
FOR EACH ROW EXECUTE FUNCTION public.enforce_semads_viewer();
