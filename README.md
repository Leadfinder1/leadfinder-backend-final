# LeadFinder AI Backend Stable

Backend CommonJS stabile per Railway.

## Variabili Railway richieste

DATABASE_URL=...
JWT_SECRET=leadfinder_super_secret_mega_secure_2026
OWNER_EMAIL=simonedepadova0088@gmail.com
CLIENT_ORIGIN=*
PORT=5000

Opzionale:
GOOGLE_API_KEY=...
DISCORD_INVITE=...

## Dopo upload su GitHub
Railway farà redeploy automatico.

## Migrazione database
Se Railway non crea le tabelle automaticamente, apri Railway Shell e lancia:

npx prisma db push

Poi controlla:
https://leadfinder-backend-final-production.up.railway.app/health
