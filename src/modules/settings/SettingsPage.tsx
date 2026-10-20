import { Database, Palette, UserRound } from 'lucide-react';
import { useId } from 'react';
import { ThemeToggle } from '@/components/layout/ThemeToggle';
import { PageHeader } from '@/components/layout/PageHeader';
import { Badge } from '@/components/ui/Badge';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { cn } from '@/lib/cn';
import { useTheme } from '@/lib/theme/theme-context';
import {
  DATA_SOURCE_LABELS,
  dataSourceSchema,
  type DataSourceMode,
} from '@/services/data-source/data-source';
import { useDataSource } from '@/services/data-source/data-source-context';

export function SettingsPage() {
  const { resolved, preference } = useTheme();
  const { mode, setMode } = useDataSource();
  const groupName = useId();

  return (
    <div className="animate-fade-up">
      <PageHeader
        title="Configurações"
        description="Preferências deste dispositivo. Perfil e conta chegam com a integração ao Supabase."
      />

      <div className="grid gap-4">
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
                  : 'Escolha salva neste navegador.'}
              </p>
            </div>
            <ThemeToggle />
          </CardBody>
        </Card>

        <Card aria-labelledby="settings-data">
          <CardHeader
            title="Fonte de dados"
            titleId="settings-data"
            icon={<Database className="size-4" />}
            description="Temporário, até a integração com o backend"
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
                        <span className="block text-body-sm text-fg-subtle">
                          {info.description}
                        </span>
                      </span>
                    </label>
                  );
                })}
              </div>
            </fieldset>
          </CardBody>
        </Card>

        <Card aria-labelledby="settings-profile">
          <CardHeader
            title="Perfil e conta"
            titleId="settings-profile"
            icon={<UserRound className="size-4" />}
            action={<Badge tone="accent">Fase 2</Badge>}
          />
          <CardBody>
            <p className="text-body-sm text-fg-muted">
              Autenticação, nome de exibição, fuso horário e exportação de dados dependem do backend
              e ainda não estão disponíveis. Não há conta ou dado pessoal armazenado nesta versão.
            </p>
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
