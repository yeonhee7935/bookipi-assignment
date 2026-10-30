import type { Sale } from "./api";
import { Countdown } from "./components/Countdown";
import { ProductArt } from "./components/ProductArt";
import { PurchasePanel } from "./components/PurchasePanel";
import { StockMeter } from "./components/StockMeter";
import { useSale, useServerNow } from "./hooks";
import { formatDate } from "./time";

const statusBadge: Record<Sale["status"], string> = {
  upcoming: "Upcoming",
  active: "Live now",
  sold_out: "Sold out",
  ended: "Ended",
};

function SaleTiming({ sale, now }: { sale: Sale; now: number }) {
  if (sale.status === "upcoming")
    return (
      <Countdown
        label="Drop opens"
        target={new Date(sale.startsAt)}
        now={now}
      />
    );
  if (sale.status === "active")
    return (
      <Countdown label="Drop ends" target={new Date(sale.endsAt)} now={now} />
    );
  return (
    <div className="countdown">
      <span className="eyebrow">
        {sale.status === "ended" ? "Ended" : "Sold out"}
      </span>
      <strong className="countdown__date">
        {sale.status === "ended"
          ? formatDate(new Date(sale.endsAt))
          : "Thanks to everyone who joined."}
      </strong>
    </div>
  );
}

export function App() {
  const { sale, clockOffset, error } = useSale();
  const now = useServerNow(clockOffset);

  return (
    <>
      <header className="topbar">
        <span className="brand">Bookipi</span>
      </header>

      <main className="drop">
        <ProductArt
          stamp={
            sale?.status === "sold_out"
              ? "Sold out"
              : sale?.status === "ended"
                ? "Ended"
                : undefined
          }
        />

        <section className="details">
          {sale && (
            <span className={`badge badge--${sale.status}`}>
              {statusBadge[sale.status]}
            </span>
          )}
          <h1>Bookipi Pro Lifetime</h1>
          <p className="subtitle">Pro, for life. Pay once, never renew.</p>
          <p className="price">$199 AUD</p>

          {sale ? (
            <>
              <SaleTiming sale={sale} now={now} />
              <StockMeter remaining={sale.remaining} total={sale.totalStock} />
              <PurchasePanel status={sale.status} />
            </>
          ) : (
            <p className="muted">
              {error === "no_sale"
                ? "No drop is scheduled yet. Check back soon."
                : error === "unreachable"
                  ? "Cannot reach the store. Retrying…"
                  : "Loading…"}
            </p>
          )}
        </section>
      </main>
    </>
  );
}
