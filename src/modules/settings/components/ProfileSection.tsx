import { zodResolver } from '@hookform/resolvers/zod';
import { Save, UserRound } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { Button } from '@/components/ui/Button';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { SelectField, TextField } from '@/components/ui/Field';
import { Notice } from '@/components/ui/Notice';
import { ErrorState, Skeleton } from '@/components/ui/States';
import { supportedTimeZones } from '@/lib/date';
import { useProfile } from '@/services/profile/profile-context';
import type { Profile } from '@/services/profile/profile-repository';
import { profileFormSchema, weekdayValue } from '../schemas';

const WEEKDAYS = [
  'Domingo',
  'Segunda-feira',
  'Terça-feira',
  'Quarta-feira',
  'Quinta-feira',
  'Sexta-feira',
  'Sábado',
];

export function ProfileSection() {
  const { state, reload } = useProfile();
  return (
    <Card aria-labelledby="settings-profile">
      <CardHeader
        title="Perfil"
        titleId="settings-profile"
        icon={<UserRound className="size-4" />}
        description="Salvo na sua conta"
      />
      <CardBody>
        {state.status === 'ready' ? (
          <ProfileForm key={state.profile.id} profile={state.profile} />
        ) : state.status === 'error' ? (
          <ErrorState
            title="Não foi possível carregar o perfil"
            description={state.error.message}
            onRetry={reload}
          />
        ) : (
          <div aria-hidden="true" className="grid gap-4 sm:grid-cols-2">
            <Skeleton className="h-11" />
            <Skeleton className="h-11" />
            <Skeleton className="h-11" />
          </div>
        )}
      </CardBody>
    </Card>
  );
}

function ProfileForm({ profile }: { profile: Profile }) {
  const { update } = useProfile();
  const zones = useMemo(() => {
    const list = supportedTimeZones();
    return list.includes(profile.timezone) ? list : [profile.timezone, ...list];
  }, [profile.timezone]);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting, isDirty },
  } = useForm({
    resolver: zodResolver(profileFormSchema),
    defaultValues: {
      displayName: profile.displayName,
      timezone: profile.timezone,
      weekStartsOn: weekdayValue(profile.weekStartsOn),
    },
  });

  const onSubmit = handleSubmit(async (values) => {
    setResult(null);
    const outcome = await update(values);
    if (outcome.ok) {
      reset({
        displayName: outcome.profile.displayName,
        timezone: outcome.profile.timezone,
        weekStartsOn: weekdayValue(outcome.profile.weekStartsOn),
      });
      setResult({ ok: true, message: 'Perfil salvo.' });
    } else {
      setResult({ ok: false, message: outcome.message });
    }
  });

  return (
    <form noValidate onSubmit={(e) => void onSubmit(e)} className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          label="Nome de exibição"
          autoComplete="nickname"
          error={errors.displayName?.message}
          {...register('displayName')}
        />
        <SelectField
          label="Fuso horário"
          hint="Define o que é “hoje” nos seus registros e relatórios."
          error={errors.timezone?.message}
          {...register('timezone')}
        >
          {zones.map((z) => (
            <option key={z} value={z}>
              {z.replace(/_/g, ' ')}
            </option>
          ))}
        </SelectField>
        <SelectField
          label="A semana começa"
          error={errors.weekStartsOn?.message}
          {...register('weekStartsOn')}
        >
          {WEEKDAYS.map((label, i) => (
            <option key={label} value={weekdayValue(i)}>
              {label}
            </option>
          ))}
        </SelectField>
      </div>
      {result && <Notice tone={result.ok ? 'success' : 'danger'}>{result.message}</Notice>}
      <div>
        <Button
          type="submit"
          disabled={isSubmitting || !isDirty}
          icon={<Save className="size-4" />}
        >
          {isSubmitting ? 'Salvando…' : 'Salvar perfil'}
        </Button>
      </div>
    </form>
  );
}
