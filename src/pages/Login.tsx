import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { LogIn, UserPlus, Shield, Zap, BarChart3 } from "lucide-react";
import logoLaVitta from "@/assets/logo-la-vitta.png";

const Login = () => {
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [nome, setNome] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const navigate = useNavigate();
  const { signIn, signUp } = useAuth();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMessage(null);
    setLoading(true);

    try {
      if (isSignUp) {
        const { error } = await signUp(email, password, nome);
        if (error) {
          setError(error);
        } else {
          setSuccessMessage("Conta criada! Verifique seu email para confirmar o cadastro.");
          setIsSignUp(false);
        }
      } else {
        const { error } = await signIn(email, password);
        if (error) {
          setError(error);
        } else {
          navigate("/");
        }
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex">
      {/* Left panel - branding */}
      <div className="hidden lg:flex lg:w-[45%] relative overflow-hidden bg-gradient-to-br from-primary via-[hsl(150,30%,28%)] to-[hsl(150,25%,18%)] text-primary-foreground flex-col justify-between p-12">
        {/* Decorative elements */}
        <div className="absolute top-0 right-0 w-[500px] h-[500px] rounded-full bg-white/5 -translate-y-1/2 translate-x-1/3" />
        <div className="absolute bottom-0 left-0 w-[400px] h-[400px] rounded-full bg-white/5 translate-y-1/3 -translate-x-1/4" />
        <div className="absolute top-1/2 left-1/2 w-[300px] h-[300px] rounded-full bg-white/[0.03] -translate-x-1/2 -translate-y-1/2" />

        <div className="relative z-10">
          <div className="flex items-center gap-3 mb-2">
            <img src={logoLaVitta} alt="La Vitta" className="h-12 w-auto brightness-0 invert" />
            <span className="text-lg font-semibold tracking-tight">La Vitta — CORE IA</span>
          </div>
        </div>

        <div className="relative z-10 space-y-8">
          <div>
            <h2 className="text-3xl font-bold leading-tight mb-3">
              Inteligência Artificial<br />para sua Clínica
            </h2>
            <p className="text-white/70 text-base leading-relaxed max-w-md">
              Automatize atendimentos, analise ligações e tome decisões estratégicas com IA avançada.
            </p>
          </div>

          <div className="space-y-4">
            <div className="flex items-start gap-3">
              <div className="h-9 w-9 rounded-lg bg-white/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                <Zap className="h-4 w-4" />
              </div>
              <div>
                <p className="font-medium text-sm">Automação Inteligente</p>
                <p className="text-white/60 text-xs mt-0.5">Reativação, prospecção e confirmação automáticas</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="h-9 w-9 rounded-lg bg-white/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                <BarChart3 className="h-4 w-4" />
              </div>
              <div>
                <p className="font-medium text-sm">Análise Estratégica</p>
                <p className="text-white/60 text-xs mt-0.5">Insights, previsões e relatórios em tempo real</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="h-9 w-9 rounded-lg bg-white/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                <Shield className="h-4 w-4" />
              </div>
              <div>
                <p className="font-medium text-sm">Supervisão & Controle</p>
                <p className="text-white/60 text-xs mt-0.5">Monitoramento completo com aprovação humana</p>
              </div>
            </div>
          </div>
        </div>

        <div className="relative z-10">
          <p className="text-white/40 text-xs">© 2026 La Vitta · Todos os direitos reservados</p>
        </div>
      </div>

      {/* Right panel - form */}
      <div className="flex-1 flex items-center justify-center bg-background px-6 py-12">
        <div className="w-full max-w-[400px] space-y-8">
          {/* Mobile logo */}
          <div className="text-center space-y-3 lg:space-y-4">
            <div className="lg:hidden mx-auto">
              <img src={logoLaVitta} alt="La Vitta" className="h-14 w-auto" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-foreground">
                {isSignUp ? "Criar conta" : "Bem-vindo de volta"}
              </h1>
              <p className="text-sm text-muted-foreground mt-1">
                {isSignUp ? "Preencha os dados para começar" : "Acesse o painel de controle"}
              </p>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            {isSignUp && (
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">Nome</label>
                <input
                  type="text"
                  value={nome}
                  onChange={(e) => setNome(e.target.value)}
                  required
                  className="w-full rounded-lg border border-input bg-card px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent transition-all"
                  placeholder="Seu nome completo"
                />
              </div>
            )}

            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full rounded-lg border border-input bg-card px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent transition-all"
                placeholder="seu@email.com"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Senha</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
                className="w-full rounded-lg border border-input bg-card px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent transition-all"
                placeholder="••••••••"
              />
            </div>

            {error && (
              <div className="rounded-lg bg-destructive/10 border border-destructive/20 p-3">
                <p className="text-sm text-destructive">{error}</p>
              </div>
            )}

            {successMessage && (
              <div className="rounded-lg bg-[hsl(var(--success))]/10 border border-[hsl(var(--success))]/20 p-3">
                <p className="text-sm text-[hsl(var(--success))]">{successMessage}</p>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 rounded-lg bg-primary text-primary-foreground py-3 text-sm font-semibold hover:bg-primary/90 transition-all disabled:opacity-50 shadow-lg shadow-primary/25 active:scale-[0.98]"
            >
              {isSignUp ? <UserPlus className="h-4 w-4" /> : <LogIn className="h-4 w-4" />}
              {loading ? "Processando..." : isSignUp ? "Criar Conta" : "Entrar"}
            </button>
          </form>

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-border" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-background px-3 text-muted-foreground">ou</span>
            </div>
          </div>

          <p className="text-center text-sm text-muted-foreground">
            {isSignUp ? "Já tem conta? " : "Não tem conta? "}
            <button
              onClick={() => { setIsSignUp(!isSignUp); setError(null); setSuccessMessage(null); }}
              className="text-primary hover:underline font-semibold"
            >
              {isSignUp ? "Fazer login" : "Criar conta"}
            </button>
          </p>
        </div>
      </div>
    </div>
  );
};

export default Login;
