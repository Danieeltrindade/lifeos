import { zodResolver } from '@hookform/resolvers/zod';
import { LogIn } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link, useLocation, useSearchParams } from 'react-router';
import { Button } from '@/components/ui/Button';
import { TextField } from '@/components/ui/Field';
import { Notice } from '@/components/ui/Notice';
import { useAuth } from '@/services/auth/auth-context';
import { AuthLayout, linkClass } from './AuthLayout';
import { readAuthCallbackError } from './callback-error';
import { signInSchema } from './schemas';

const REASON_NOTICE = {
  expired: { tone: 'warning', text: 'Sua sessão expirou. Entre novamente para continuar.' },
  account_deleted: { tone: 'success', text: 'Sua conta e todos os seus dados foram excluídos.' },
} as const;

export function SignInPage() {
  const { state, signIn } = useAuth();
  const [params] = useSearchParams();
  const location = useLocation();
  const [submitError, setSubmitError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm({ resolver: zodResolver(signInSchema), defaultValues: { email: '', password: '' } });

  const callbackError = readAuthCallbackError(location.search, location.hash);
  const reason =
    state.status === 'signed_out' &&
    (state.reason === 'expired' || state.reason === 'account_deleted')
      ? REASON_NOTICE[state.reason]
      : null;
  const signUpLink = `/cadastro${params.get('redirectTo') ? `?redirectTo=${encodeURIComponent(params.get('redirectTo') ?? '')}` : ''}`;

  const onSubmit = handleSubmit(async ({ email, password }) => {
    setSubmitError(null);
    const result = await signIn(email, password);
    // Em caso de sucesso, a rota pública redireciona para o destino (ver route-guards).
    if (!result.ok) setSubmitError(result.message);
  });

  return (
    <AuthLayout
      title="Entrar"
      description="Acesse seu LifeOS."
      footer={
        <>
          Ainda não tem conta?{' '}
          <Link to={signUpLink} className={linkClass}>
            Criar conta
          </Link>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {params.get('confirmado') === '1' && !callbackError && (
          <Notice tone="success">E-mail confirmado. Entre com seu e-mail e senha.</Notice>
        )}
        {callbackError && <Notice tone="danger">{callbackError}</Notice>}
        {reason && <Notice tone={reason.tone}>{reason.text}</Notice>}
        {submitError && <Notice tone="danger">{submitError}</Notice>}

        <form noValidate onSubmit={(e) => void onSubmit(e)} className="flex flex-col gap-4">
          <TextField
            label="E-mail"
            type="email"
            autoComplete="email"
            inputMode="email"
            error={errors.email?.message}
            {...register('email')}
          />
          <TextField
            label="Senha"
            type="password"
            autoComplete="current-password"
            error={errors.password?.message}
            {...register('password')}
          />
          <div className="-mt-1 text-right text-body-sm">
            <Link to="/recuperar-senha" className={linkClass}>
              Esqueci minha senha
            </Link>
          </div>
          <Button type="submit" disabled={isSubmitting} icon={<LogIn className="size-4" />}>
            {isSubmitting ? 'Entrando…' : 'Entrar'}
          </Button>
        </form>
      </div>
    </AuthLayout>
  );
}
