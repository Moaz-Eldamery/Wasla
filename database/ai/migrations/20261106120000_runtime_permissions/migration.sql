-- Keep Prisma's migration bookkeeping private from the AI runtime role.
REVOKE ALL ON TABLE public._prisma_migrations FROM wasla_ai;
