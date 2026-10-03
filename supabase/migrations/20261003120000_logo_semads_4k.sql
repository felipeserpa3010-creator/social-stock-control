-- Identidade visual atualizada para a nova logomarca SEMADS em vetor escalável (4K+).
UPDATE public.settings
SET nome_instituicao = 'Depósito SEMADS',
    logo_url = '/semads-logo-4k.svg',
    updated_at = now();
