INSERT INTO public.units (nome, sigla, demo)
SELECT 'Gabinete SEMADS', 'SEMADS', false
WHERE NOT EXISTS (
  SELECT 1 FROM public.units WHERE lower(nome) = lower('Gabinete SEMADS')
);