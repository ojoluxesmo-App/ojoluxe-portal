// TEMPORARY — diagnostic only, delete once the SUPABASE_SERVICE_ROLE_KEY
// preview env var issue is root-caused. Leaks no secret values, only
// presence/length booleans and public deployment metadata.
export default async function handler(req, res) {
  res.status(200).json({
    hasServiceKey: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
    serviceKeyLength: (process.env.SUPABASE_SERVICE_ROLE_KEY || "").length,
    hasAdminToken: Boolean(process.env.ADMIN_API_TOKEN),
    vercelEnv: process.env.VERCEL_ENV || null,
    gitBranch: process.env.VERCEL_GIT_COMMIT_REF || null,
    gitSha: (process.env.VERCEL_GIT_COMMIT_SHA || "").slice(0, 7) || null,
  });
}
