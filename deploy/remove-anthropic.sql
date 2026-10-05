-- Remove Anthropic / Claude from the AI config entirely. Any use-case pointed at
-- a Claude model falls back to the env default (OpenAI) once its config row is
-- gone. Idempotent — safe to re-run.
DELETE FROM ai_config
 WHERE model_id IN (
   SELECT m.id FROM ai_models m JOIN ai_providers p ON p.id = m.provider_id
    WHERE p.provider_key = 'anthropic'
 );
DELETE FROM ai_models
 WHERE provider_id IN (SELECT id FROM ai_providers WHERE provider_key = 'anthropic');
DELETE FROM ai_providers WHERE provider_key = 'anthropic';
