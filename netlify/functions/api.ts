import serverless from 'serverless-http';
import { app } from '../../server/src/app';

// Netlify routes /api/* here per netlify.toml's redirect. serverless-http
// adapts the plain Express app (used as-is for local `npm run dev:vite`
// + a small local server too, see server/dev-server.ts) to the Lambda-style
// handler signature Netlify Functions expects — this is the ONLY
// Netlify-specific file in the whole backend, so `app.ts` stays portable
// if you ever move off Netlify.
export const handler = serverless(app);
