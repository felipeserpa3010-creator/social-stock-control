-- Adiciona a unidade Conselho Tutelar ao cadastro do sistema.
INSERT INTO public.units (nome, sigla, demo)
SELECT 'Conselho Tutelar', 'CT', false
WHERE NOT EXISTS (
  SELECT 1 FROM public.units WHERE lower(nome) = lower('Conselho Tutelar')
);
