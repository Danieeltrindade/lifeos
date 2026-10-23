import { Database, Palette } from 'lucide-react';
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
      <PageHeader title="Configurações" description="Perfil, aparência e conta." />

      <div className="grid gap-4">
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
