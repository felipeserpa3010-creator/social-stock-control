-- Adiciona o novo papel em uma migração separada.
-- O uso do novo valor do enum ocorre na migração seguinte, após o commit deste ALTER TYPE.
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'visualizador';
