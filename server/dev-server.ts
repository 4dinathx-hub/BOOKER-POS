import { app } from './src/app';

const port = process.env.PORT ? Number(process.env.PORT) : 4000;
app.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`Booker API listening on http://localhost:${port} (use this OR "netlify dev" — not both)`);
});
