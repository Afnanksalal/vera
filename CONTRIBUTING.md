# Contributing

Thanks for taking an interest in Vera. This is a small, self-contained project, and contributions are welcome.

## Getting set up

```bash
npm install
npm run dev
npm test
```

The engine lives in `src/mandate` and has no framework dependencies, so most changes can be developed and tested from the command line without running the web app.

## Ground rules

- Keep the verifier the only component that can commit a claim. A model or a heuristic may propose; it may never decide.
- Amounts are integer paise. Do not introduce floating point money.
- Every new behavior needs a test. The suite runs with `npm test`.
- Run `npm run lint` and `npm run build` before opening a pull request.

## Style

- Write plain, direct prose in comments and docs. Skip marketing language.
- Prefer clear names over clever ones.
- If you add a fault type, a claim, or an anomaly rule, extend the fixture and the answer key so the eval still measures it honestly.

## Reporting issues

Open an issue with the command you ran, the seed, and what you expected. Because the fixture is seeded, most behavior is reproducible from a seed alone.
