# Diffora web

See the root [`README.md`](../README.md) for setup and [`DIFFORA.md`](../DIFFORA.md) for the specification.

## Commands

```powershell
npm install
Copy-Item .env.example .env.local   # fill Supabase URLs and secrets
npm run db:deploy                   # apply prisma/migrations
npm run dev
```

Useful scripts:

```text
npm run db:generate   Prisma client generation
npm run db:validate   Validate schema.prisma
npm run db:migrate    Create/apply a development migration
npm run db:deploy     Apply migrations with DIRECT_URL
npm run db:studio     Prisma Studio
```

The Next.js application lives in `src/app`. The generated Prisma client is in `src/generated/prisma` and is gitignored; `predev` and `prebuild` regenerate it automatically.
