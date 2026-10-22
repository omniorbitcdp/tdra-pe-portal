/** The brand / story panel shared by the sign-in and business-registration
 *  screens, so the two entry points stay visually identical. */
import { t as tr } from '@/lib/i18n/live';

export interface Brand { name: string; short: string; logo: string | null }

const HIGHLIGHTS = [
  { title: 'Register & onboard your business', body: 'Complete your entity and signatory details in one guided flow.' },
  { title: 'Manage business display names', body: 'Raise headers, track every approval stage and keep the DLT reference in one place.' },
  { title: 'Configure headers & templates', body: 'Declare variables as <var1>, <var2> … with the sample content a reviewer needs.' },
  { title: 'Clear your KYC pack', body: 'Trade licence, Emirates ID, signatory letter and VAT certificate — reviewed end to end.' },
];

export const AUTH_HEADLINE = 'Transforming the Unsolicited Communication Landscape';

export const COPYRIGHT = '© Onextel Copyright 2026';

/** Small brand row shown above the card on narrow screens, where the left
 *  panel is hidden. */
export function AuthMobileBrand({ brand }: { brand: Brand }) {
  return (
    <div className="mb-8 flex items-center gap-3 lg:hidden">
      {brand.logo ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={brand.logo} alt={brand.name} className="h-10 w-auto max-w-[150px] object-contain" />
      ) : (
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-sm font-bold text-blue-700 ring-1 ring-blue-100">
          {brand.short.slice(0, 2).toUpperCase()}
        </span>
      )}
      <span className="text-base font-bold text-slate-800">{brand.name}</span>
    </div>
  );
}

export function AuthBrandPanel({ brand }: { brand: Brand }) {
  return (
    <aside className="relative hidden overflow-hidden bg-gradient-to-br from-sky-50 via-blue-50 to-indigo-100 lg:flex lg:flex-col lg:justify-between lg:p-12">
      <div aria-hidden className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-blue-200/50 blur-3xl" />
      <div aria-hidden className="pointer-events-none absolute -bottom-32 -left-24 h-80 w-80 rounded-full bg-sky-200/50 blur-3xl" />
      <div aria-hidden className="pointer-events-none absolute right-16 top-1/4 h-40 w-40 rounded-full bg-amber-100/70 blur-2xl" />

      <div className="relative flex items-center gap-3">
        {brand.logo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={brand.logo} alt={brand.name} className="h-12 w-auto max-w-[180px] object-contain" />
        ) : (
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white text-base font-bold text-blue-700 shadow-sm ring-1 ring-blue-100">
            {brand.short.slice(0, 2).toUpperCase()}
          </span>
        )}
        <span className="text-lg font-bold tracking-tight text-slate-800">{brand.name}</span>
      </div>

      <div className="relative max-w-xl">
        <span className="inline-flex items-center gap-2 rounded-full bg-white/80 px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-blue-700 ring-1 ring-blue-100">
          {tr('Business Communication Platform')}
        </span>
        <h1 className="mt-5 text-4xl font-bold leading-tight tracking-tight text-slate-900">{tr(AUTH_HEADLINE)}</h1>
        <p className="mt-4 text-sm leading-relaxed text-slate-600">
          {tr('A secure and compliant platform that streamlines your business registration and commercial messaging, while ensuring regulatory adherence at every step.')}
        </p>

        <ul className="mt-8 space-y-3.5">
          {HIGHLIGHTS.map((h) => (
            <li key={tr(h.title)} className="flex gap-3">
              <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-[11px] font-bold text-emerald-700 ring-1 ring-emerald-200">✓</span>
              <span>
                <span className="block text-sm font-semibold text-slate-800">{tr(h.title)}</span>
                <span className="block text-xs leading-relaxed text-slate-500">{tr(h.body)}</span>
              </span>
            </li>
          ))}
        </ul>
      </div>

      {/* illustration: registered business messages */}
      <div className="relative mt-10 flex items-end gap-4">
        <svg viewBox="0 0 300 168" className="h-[168px] w-full max-w-[420px]" role="img" aria-label="Registered business messages">
          <rect x="8" y="14" width="132" height="146" rx="14" fill="#ffffff" stroke="#dbeafe" />
          <rect x="56" y="22" width="36" height="5" rx="2.5" fill="#e2e8f0" />
          <rect x="22" y="42" width="78" height="26" rx="9" fill="#eff6ff" />
          <rect x="30" y="50" width="52" height="4" rx="2" fill="#bfdbfe" />
          <rect x="30" y="58" width="34" height="4" rx="2" fill="#bfdbfe" />
          <rect x="48" y="78" width="80" height="26" rx="9" fill="#3b82f6" />
          <rect x="56" y="86" width="54" height="4" rx="2" fill="#bfdbfe" />
          <rect x="56" y="94" width="38" height="4" rx="2" fill="#bfdbfe" />
          <rect x="22" y="114" width="70" height="22" rx="9" fill="#eff6ff" />
          <rect x="30" y="121" width="44" height="4" rx="2" fill="#bfdbfe" />
          <rect x="30" y="128" width="28" height="4" rx="2" fill="#bfdbfe" />

          <rect x="160" y="6" width="128" height="46" rx="12" fill="#ffffff" stroke="#e2e8f0" />
          <circle cx="180" cy="29" r="11" fill="#dcfce7" />
          <path d="M175 29l4 4 7-8" stroke="#16a34a" strokeWidth="2.4" fill="none" strokeLinecap="round" strokeLinejoin="round" />
          <rect x="199" y="21" width="72" height="5" rx="2.5" fill="#e2e8f0" />
          <rect x="199" y="32" width="48" height="5" rx="2.5" fill="#eef2f7" />

          <rect x="160" y="62" width="128" height="46" rx="12" fill="#ffffff" stroke="#e2e8f0" />
          <circle cx="180" cy="85" r="11" fill="#dbeafe" />
          <rect x="175" y="80" width="10" height="7" rx="1.6" fill="#3b82f6" />
          <path d="M175 82l5 4 5-4" stroke="#ffffff" strokeWidth="1.3" fill="none" />
          <rect x="199" y="77" width="72" height="5" rx="2.5" fill="#e2e8f0" />
          <rect x="199" y="88" width="40" height="5" rx="2.5" fill="#eef2f7" />

          <rect x="160" y="118" width="128" height="46" rx="12" fill="#ffffff" stroke="#e2e8f0" />
          <circle cx="180" cy="141" r="11" fill="#fef3c7" />
          <rect x="175" y="138" width="10" height="7" rx="1.6" fill="#f59e0b" />
          <rect x="199" y="133" width="72" height="5" rx="2.5" fill="#e2e8f0" />
          <rect x="199" y="144" width="56" height="5" rx="2.5" fill="#eef2f7" />
        </svg>
      </div>
    </aside>
  );
}
