import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Brain, Upload, MessageSquare, Users, ArrowRight, Zap, Shield, Search } from "lucide-react";

const Landing = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen relative overflow-hidden">
      <div className="grid-pattern absolute inset-0 opacity-20" />

      {/* Glow effects */}
      <div className="absolute top-[-200px] left-1/2 -translate-x-1/2 w-[800px] h-[800px] rounded-full opacity-15 blur-[150px]" style={{ background: "hsl(160 100% 50%)" }} />
      <div className="absolute bottom-[-200px] right-[-100px] w-[500px] h-[500px] rounded-full opacity-10 blur-[120px]" style={{ background: "hsl(270 80% 65%)" }} />

      {/* Nav */}
      <nav className="relative z-10 flex items-center justify-between px-6 lg:px-12 py-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center glow-primary" style={{ background: "hsl(160 100% 50% / 0.15)" }}>
            <Brain className="w-5 h-5 text-primary" />
          </div>
          <span className="font-mono font-bold text-xl text-foreground">KnowHub</span>
        </div>
        <Button onClick={() => navigate("/auth")} variant="outline" className="border-border text-foreground hover:bg-secondary">
          Войти
        </Button>
      </nav>

      {/* Hero */}
      <section className="relative z-10 container mx-auto px-6 pt-20 pb-32 text-center">
        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full glass text-sm text-muted-foreground mb-8">
          <Zap className="w-4 h-4 text-primary" />
          <span>AI-поиск по вашей документации</span>
        </div>

        <h1 className="text-5xl lg:text-7xl font-bold mb-6 max-w-4xl mx-auto leading-tight">
          <span className="text-foreground">База знаний</span>
          <br />
          <span className="text-gradient">для вашей команды</span>
        </h1>

        <p className="text-xl text-muted-foreground max-w-2xl mx-auto mb-10">
          Загрузите документы, и AI мгновенно найдёт ответ на любой вопрос. PDF, DOCX, Markdown — всё в одном месте.
        </p>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
          <Button onClick={() => navigate("/auth")} size="lg" className="text-lg px-8 glow-primary">
            Начать бесплатно <ArrowRight className="ml-2 w-5 h-5" />
          </Button>
        </div>
      </section>

      {/* Features */}
      <section className="relative z-10 container mx-auto px-6 pb-32">
        <div className="grid md:grid-cols-3 gap-6">
          {[
            { icon: Upload, title: "Загрузка документов", desc: "PDF, DOCX, Markdown — загружайте любые файлы и они автоматически станут частью базы знаний." },
            { icon: MessageSquare, title: "AI-поиск", desc: "Задайте вопрос на естественном языке и получите точный ответ со ссылкой на источник." },
            { icon: Users, title: "Командная работа", desc: "Пригласите участников команды, управляйте доступом и делитесь знаниями." },
          ].map(({ icon: Icon, title, desc }) => (
            <div key={title} className="glass rounded-2xl p-8 hover:border-primary/30 transition-colors group">
              <div className="w-12 h-12 rounded-xl flex items-center justify-center mb-5" style={{ background: "hsl(160 100% 50% / 0.1)" }}>
                <Icon className="w-6 h-6 text-primary" />
              </div>
              <h3 className="text-lg font-semibold text-foreground mb-2">{title}</h3>
              <p className="text-muted-foreground">{desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Bottom CTA */}
      <section className="relative z-10 container mx-auto px-6 pb-20">
        <div className="glass rounded-3xl p-12 text-center">
          <div className="flex items-center justify-center gap-4 mb-6">
            <Shield className="w-6 h-6 text-primary" />
            <Search className="w-6 h-6 text-accent" />
          </div>
          <h2 className="text-3xl font-bold text-foreground mb-4">Готовы начать?</h2>
          <p className="text-muted-foreground mb-8 max-w-lg mx-auto">
            Создайте свою базу знаний за минуту. Без настроек серверов, без сложных интеграций.
          </p>
          <Button onClick={() => navigate("/auth")} size="lg" className="glow-primary">
            Создать базу знаний <ArrowRight className="ml-2 w-5 h-5" />
          </Button>
        </div>
      </section>

      {/* Footer */}
      <footer className="relative z-10 border-t border-border py-8 text-center">
        <p className="text-sm text-muted-foreground">© 2026 KnowHub. Все права защищены.</p>
      </footer>
    </div>
  );
};

export default Landing;
