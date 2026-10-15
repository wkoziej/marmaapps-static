import { describe, test, expect, afterEach, vi } from 'vitest';

describe('config', () => {
    afterEach(() => {
        vi.unstubAllEnvs();
        vi.restoreAllMocks();
        vi.resetModules();
    });

    test('humanModelPath uwzględnia BASE_URL', async () => {
        vi.stubEnv('BASE_URL', '/marmaapps-static/');
        vi.resetModules();

        const { humanModelPath } = await import('../config.js');

        expect(humanModelPath).toBe('/marmaapps-static/models/human.glb');
    });

    test('import w testach nie loguje błędu przy braku konfiguracji', async () => {
        vi.stubEnv('VITE_SUPABASE_URL', '');
        vi.stubEnv('VITE_SUPABASE_PUBLISHABLE_KEY', '');
        const error = vi.spyOn(console, 'error').mockImplementation(() => {});
        vi.resetModules();

        await import('../config.js');

        expect(error).not.toHaveBeenCalled();
    });
});
