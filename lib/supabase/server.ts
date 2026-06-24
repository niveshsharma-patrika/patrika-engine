import { makeCompatClient } from "@/lib/db/compat";

/**
 * Data clients. Despite the path, these no longer talk to Supabase — they
 * return a supabase-js–compatible builder over the RDS/Postgres pool, so the
 * existing `.from(...).select()...` call-sites keep working unchanged.
 *
 * Both are service-role-equivalent (no RLS); auth is handled separately by
 * lib/auth. `createClient` stays async to preserve its call signature.
 */
export async function createClient() {
  return makeCompatClient();
}

export function createAdminClient() {
  return makeCompatClient();
}
