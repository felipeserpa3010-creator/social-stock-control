ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'visualizador';
INSERT INTO public.units (nome, sigla, demo)
SELECT 'Gabinete SEMADS', 'SEMADS', false WHERE NOT EXISTS (SELECT 1 FROM public.units WHERE lower(nome) = lower('Gabinete SEMADS'));
INSERT INTO public.units (nome, sigla, demo)
SELECT 'Conselho Tutelar', 'CT', false WHERE NOT EXISTS (SELECT 1 FROM public.units WHERE lower(nome) = lower('Conselho Tutelar'));