# CASA · Famiglia

PWA familiare condivisa con:
- Home con eventi di oggi e ultima notizia
- Bacheca condivisa con categorie
- Calendario mensile condiviso
- Creazione, modifica ed eliminazione di notizie ed eventi
- Notifiche push per nuove notizie, nuovi eventi e promemoria degli eventi del giorno
- Nessuna schermata di login

Backend: Supabase (tabelle `casa_family_*`).

## Nota sulla privacy
Per scelta progettuale l'app non richiede autenticazione. Chiunque conosca l'URL dell'app può quindi vedere e modificare i contenuti. Se in futuro servisse più privacy, il passo consigliato è un accesso invisibile tramite link famiglia o autenticazione anonima con regole più restrittive.

## Pubblicazione
La cartella è pronta per hosting statico HTTPS (Vercel, Netlify, GitHub Pages). HTTPS è necessario per le notifiche push e l'installazione PWA.
