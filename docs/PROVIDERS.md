# Providers

Adapters implement the domain port and are registered in the composition root.

## Port

```ts
// backend/src/domain/ports/JobProvider.ts
interface JobProvider {
  readonly name: string;
  fetchJobs(company: Company): Promise<Job[]>;
}
```

- Parse jobs from `company.careerUrl` (and provider-specific conventions).  
- Return **domain** `Job` objects (no Prisma / Express types).  
- Throw `AppError` with a clear code on bad URLs or upstream failures.  
- Log with `logger.provider.*`.

## Registration

Wire the adapter in `backend/src/infrastructure/di/container.ts`:

```ts
const providers = new ProviderRegistry([
  // …
  new MyProvider(),
]);
```

`ProviderRegistry` resolves by `company.provider === adapter.name`.

## Checklist for a new ATS

1. Create `backend/src/infrastructure/providers/<name>/<Name>Provider.ts`.  
2. Prefer public JSON APIs; use `withChromiumBrowser()` only when required (WAF / JS boards).  
3. Add unit tests with a mocked `fetch` / fixture HTML or JSON.  
4. Register in `container.ts`.  
5. Add the id to `DEFAULT_PROVIDERS` in `shared/config/defaults.ts` and the Companies UI `PROVIDERS` list.  
6. Optionally seed a target company in `targetCompanies.ts`.  
7. Run **Fetch now** and confirm Provider Health + Logs.

Dedicated careers-site adapters already registered: `microsoft`, `goldman`, `google`, `amazon`, `apple`.

## Runtime behavior

`FetchCompanyJobsUseCase` selects the provider, fetches, dedups, scores, notifies, then updates `ProviderHealth` / `ProviderLog`.

See also [pipeline.md](./pipeline.md).
