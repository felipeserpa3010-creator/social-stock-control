CREATE OR REPLACE FUNCTION public.enforce_semads_viewer()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE unit_name text;
BEGIN
  IF NEW.role = 'admin' THEN RETURN NEW; END IF;
  SELECT lower(u.nome) INTO unit_name
  FROM public.profiles p JOIN public.units u ON u.id = p.unit_id
  WHERE p.user_id = NEW.user_id;
  IF unit_name = lower('Gabinete SEMADS') AND NEW.role <> 'visualizador' THEN
    RAISE EXCEPTION 'Usuários do Gabinete SEMADS devem ter perfil Visualizador.';
  END IF;
  IF NEW.role = 'visualizador' AND unit_name IS DISTINCT FROM lower('Gabinete SEMADS') THEN
    RAISE EXCEPTION 'O perfil Visualizador é exclusivo do Gabinete SEMADS.';
  END IF;
  RETURN NEW;
END; $function$;