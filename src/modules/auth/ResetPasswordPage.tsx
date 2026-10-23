import { zodResolver } from '@hookform/resolvers/zod';
import { KeyRound } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link, useLocation } from 'react-router';
import { SessionLoading } from '@/components/layout/FullPageStatus';
import { Button } from '@/components/ui/Button';
import { buttonClasses } from '@/components/ui/button-classes';
import { TextField } from '@/components/ui/Field';
import { Notice } from '@/components/ui/Notice';
import { useAuth } from '@/services/auth/auth-context';
import { AuthLayout, linkClass } from './AuthLayout';
import { readAuthCallbackError } from './callback-error';
import { PASSWORD_MIN, resetPasswordSchema } from './schemas';

/**
 * Destino do link de recuperação. O supabase-js troca o código do link por uma sessão
 * de recuperação; só então a nova senha pode ser gravada.
 */
export function ResetPasswordPage() {
  const { state, updatePassword } = useAuth();
  const location = useLocation();
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: { password: '', confirmPassword: '' },
  });

  const onSubmit = handleSubmit(async ({ password }) => {
    setSubmitError(null);
    const result = await updatePassword(password);
    if (result.ok) setDone(true);
    else setSubmitError(result.message);
  });

  if (state.status === 'loading') return <SessionLoading />;

  const callbackError = readAuthCallbackError(location.search, location.hash);

  if (state.status === 'signed_out' || callbackError) {
    return (
      <AuthLayout
        title="Link inválido"
        footer={
          <Link to="/entrar" className={linkClass}>
            Voltar para entrar
          </Link>
        }
      >
        <div className="flex flex-col gap-4">
          <Notice tone="warning">
            {callbackError ?? 'Este link de recuperação expirou ou já foi usado.'}
          </Notice>
          <Link to="/recuperar-senha" className={buttonClasses('primary')}>
            Pedir um novo link
          </Link>
        </div>
      </AuthLayout>
    );
  }

  if (done) {
    return (
      <AuthLayout title="Senha alterada">
        <div className="flex flex-col gap-4">
          <Notice tone="success">Sua nova senha já está valendo.</Notice>
          <Link to="/" className={buttonClasses('primary')}>
            Ir para o LifeOS
          </Link>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout title="Criar nova senha" description={state.user.email ?? undefined}>
      <form noValidate onSubmit={(e) => void onSubmit(e)} className="flex flex-col gap-4">
        {submitError && <Notice tone="danger">{submitError}</Notice>}
        <TextField
          label="Nova senha"
          type="password"
          autoComplete="new-password"
          hint={`Pelo menos ${PASSWORD_MIN} caracteres.`}
          error={errors.password?.message}
          {...register('password')}
        />
        <TextField
          label="Confirme a nova senha"
          type="password"
          autoComplete="new-password"
          error={errors.confirmPassword?.message}
          {...register('confirmPassword')}
        />
        <Button type="submit" disabled={isSubmitting} icon={<KeyRound className="size-4" />}>
          {isSubmitting ? 'Salvando…' : 'Salvar nova senha'}
        </Button>
      </form>
    </AuthLayout>
  );
}
