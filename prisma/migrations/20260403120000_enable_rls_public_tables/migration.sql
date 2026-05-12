-- Supabase linter 0013 (rls_disabled_in_public) : activer la RLS sur les tables exposées au schéma public.
-- L’app métier passe par Prisma (connexion postgres / rôle propriétaire) qui contourne la RLS.
-- Aucune politique permissive : via PostgREST (clés anon/authenticated), l’accès aux lignes reste refusé par défaut.
-- Si vous ajoutez plus tard des requêtes client Supabase (.from(...)), il faudra créer des policies explicites.

ALTER TABLE "public"."hr_remarks" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."employees" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."users" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."sites" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."schedules" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."fraud_attempts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."holidays" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."audit_logs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."leave_requests" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."attendance_records" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."missions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."_prisma_migrations" ENABLE ROW LEVEL SECURITY;
