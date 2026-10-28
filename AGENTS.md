<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

- Return typed failure results for expected authentication rejections so forms can show feedback without triggering the global runtime error screen.
- Use the shared SEMADS brand asset exported by `src/lib/brand.ts` for screens and generated reports so branding stays consistent.
- Shipment functions use separate leaf routes with a shared view component and access guard so navigation displays only the selected workflow without duplicating business logic.
- Account deletion runs through an authenticated server function with CEO and target-account checks; database-linked history must never be deleted to force account removal.
- Inventory-controller dispatches reuse material receipt headers with per-item stock/source flags; database RPCs reserve pending central quantities and atomically apply transfers on destination confirmation, so mixed receipts remain idempotent and historical receipts default to untracked.
- CEO and viewer dashboards reuse a read-only intelligent-panel component; route-level CEO authorization stays separate so sharing charts never shares administrative access.
