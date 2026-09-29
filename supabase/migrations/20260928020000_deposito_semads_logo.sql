-- Identidade visual e nome oficial do depósito.
-- Atualiza instalações existentes e mantém o mesmo padrão em novas instalações.
UPDATE public.settings
SET nome_instituicao = 'Depósito SEMADS',
    logo_url = '/semads-logo-original.png',
    updated_at = now();

