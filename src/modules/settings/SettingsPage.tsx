import { Database, KeyRound, Palette, ShieldAlert, UserRound } from 'lucide-react';
import { useId } from 'react';
import { ThemeToggle } from '@/components/layout/ThemeToggle';
import { PageHeader } from '@/components/layout/PageHeader';
import { Badge } from '@/components/ui/Badge';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { cn } from '@/lib/cn';
import { useTheme } from '@/lib/theme/theme-context';
import {
  DATA_SOURCE_LABELS,
  DEV_TOOLS_ENABLED,
  dataSourceSchema,
  type DataSourceMode,
} from '@/services/data-source/data-source';
import { useDataSource } from '@/services/data-source/data-source-context';
import { AccountSection } from './components/AccountSection';
import { ProfileSection } from './components/ProfileSection';

export function SettingsPage() {
  const { resolved, preference } = useTheme();

  return (
    <div className="animate-fade-up">
      <PageHeader
        module="settings"
        title="Configurações"
        description="Perfil, aparência e conta."
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[13rem_minmax(0,1fr)] lg:items-start">
        <SectionNav />
        <div className="grid min-w-0 gap-4">
          <ProfileSection />

          <Card aria-labelledby="settings-appearance">
            <CardHeader
              title="Aparência"
              titleId="settings-appearance"
              icon={<Palette className="size-4" />}
            />
            <CardBody className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="font-medium">Tema</p>
                <p className="text-body-sm text-fg-subtle">
                  {preference === 'system'
                    ? `Seguindo o sistema operacional (atualmente ${resolved === 'dark' ? 'escuro' : 'claro'}).`
                    : 'Salvo na sua conta e aplicado neste navegador.'}
                </p>
              </div>
              <ThemeToggle />
            </CardBody>
          </Card>

          <AccountSection />

          {DEV_TOOLS_ENABLED && <DataSourceCard />}
        </div>
      </div>
    </div>
  );
}

const SECTIONS = [
  { href: '#settings-profile', label: 'Perfil', icon: UserRound },
  { href: '#settings-appearance', label: 'Aparência', icon: Palette },
  { href: '#settings-account', label: 'Conta e dados', icon: KeyRound },
  { href: '#settings-danger', label: 'Excluir conta', icon: ShieldAlert },
];

/** Atalhos para as seções desta página (âncoras reais; a página continua rolável). */
function SectionNav() {
  return (
    <nav aria-label="Seções das configurações" className="min-w-0 lg:sticky lg:top-8">
      <ul className="flex gap-1 overflow-x-auto rounded-lg border border-border bg-surface/70 p-1 lg:flex-col">
        {SECTIONS.map(({ href, label, icon: Icon }) => (
          <li key={href} className="shrink-0">
            <a
              href={href}
              className="flex h-10 items-center gap-2.5 rounded-md px-3 text-body-sm font-medium whitespace-nowrap text-fg-muted transition-colors hover:bg-primary-soft hover:text-fg"
            >
              <Icon aria-hidden="true" className="size-4 text-primary" />
              {label}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}

/** Ferramenta de desenvolvimento: não existe no build de produção. */
function DataSourceCard() {
  const { mode, setMode } = useDataSource();
  const groupName = useId();
  return (
    <Card aria-labelledby="settings-data">
      <CardHeader
        title="Fonte de dados do dashboard"
        titleId="settings-data"
        icon={<Database className="size-4" />}
        description="Visível apenas em desenvolvimento (npm run dev)"
        action={<Badge tone="warning">Dev</Badge>}
      />
      <CardBody>
        <fieldset>
          <legend className="sr-only">Fonte de dados do dashboard</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {dataSourceSchema.options.map((option: DataSourceMode) => {
              const checked = option === mode;
              const info = DATA_SOURCE_LABELS[option];
              return (
                <label
                  key={option}
                  className={cn(
                    'flex cursor-pointer gap-3 rounded-md border p-3.5 transition-colors',
                    checked
                      ? 'border-primary bg-primary-soft'
                      : 'border-border hover:border-border-strong',
                  )}
                >
                  <input
                    type="radio"
                    name={groupName}
                    value={option}
                    checked={checked}
                    onChange={() => {
                      setMode(option);
                    }}
                    className="mt-1 size-4 accent-[var(--lo-primary)]"
                  />
                  <span>
                    <span className="block text-body-sm font-medium">{info.label}</span>
                    <span className="block text-body-sm text-fg-subtle">{info.description}</span>
                  </span>
                </label>
              );
            })}
          </div>
        </fieldset>
      </CardBody>
    </Card>
  );
}
