import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Brain, Plus, FolderOpen, LogOut, ArrowRight } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

interface Space {
  id: string;
  name: string;
  description: string | null;
  owner_id: string;
  created_at: string;
}

const Dashboard = () => {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const [spaces, setSpaces] = useState<Space[]>([]);
  const [loading, setLoading] = useState(true);
  const [newSpaceName, setNewSpaceName] = useState("");
  const [newSpaceDesc, setNewSpaceDesc] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    fetchSpaces();
  }, []);

  const fetchSpaces = async () => {
    const { data, error } = await supabase.from("spaces").select("*").order("created_at", { ascending: false });
    if (error) {
      toast.error("Ошибка загрузки спейсов");
    } else {
      setSpaces(data || []);
    }
    setLoading(false);
  };

  const createSpace = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !newSpaceName.trim()) return;
    setCreating(true);

    const { data: space, error } = await supabase
      .from("spaces")
      .insert({ name: newSpaceName.trim(), description: newSpaceDesc.trim() || null, owner_id: user.id })
      .select()
      .single();

    if (error) {
      console.error("Space creation error:", error);
      toast.error(`Ошибка создания спейса: ${error.message}`);
      setCreating(false);
      return;
    }

    // Add owner as member
    await supabase.from("space_members").insert({ space_id: space.id, user_id: user.id, role: "owner" });

    toast.success("Спейс создан!");
    setNewSpaceName("");
    setNewSpaceDesc("");
    setDialogOpen(false);
    setCreating(false);
    fetchSpaces();
  };

  return (
    <div className="min-h-screen relative overflow-hidden">
      <div className="grid-pattern absolute inset-0 opacity-10" />
      <div className="absolute top-[-200px] right-[-100px] w-[500px] h-[500px] rounded-full opacity-10 blur-[120px]" style={{ background: "hsl(160 100% 50%)" }} />

      {/* Nav */}
      <nav className="relative z-10 flex items-center justify-between px-6 lg:px-12 py-6 border-b border-border">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: "hsl(160 100% 50% / 0.15)" }}>
            <Brain className="w-5 h-5 text-primary" />
          </div>
          <span className="font-mono font-bold text-xl text-foreground">KnowHub</span>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-sm text-muted-foreground hidden sm:block">{user?.email}</span>
          <Button variant="ghost" size="sm" onClick={signOut} className="text-muted-foreground hover:text-foreground">
            <LogOut className="w-4 h-4" />
          </Button>
        </div>
      </nav>

      {/* Content */}
      <div className="relative z-10 container mx-auto px-6 py-12">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-foreground">Ваши спейсы</h1>
            <p className="text-muted-foreground mt-1">Управляйте базами знаний вашей команды</p>
          </div>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button className="glow-primary">
                <Plus className="w-4 h-4 mr-2" /> Новый спейс
              </Button>
            </DialogTrigger>
            <DialogContent className="bg-card border-border">
              <DialogHeader>
                <DialogTitle className="text-foreground">Создать спейс</DialogTitle>
              </DialogHeader>
              <form onSubmit={createSpace} className="space-y-4 mt-4">
                <Input
                  placeholder="Название спейса"
                  value={newSpaceName}
                  onChange={(e) => setNewSpaceName(e.target.value)}
                  required
                  className="bg-secondary border-border text-foreground placeholder:text-muted-foreground"
                />
                <Input
                  placeholder="Описание (необязательно)"
                  value={newSpaceDesc}
                  onChange={(e) => setNewSpaceDesc(e.target.value)}
                  className="bg-secondary border-border text-foreground placeholder:text-muted-foreground"
                />
                <Button type="submit" disabled={creating} className="w-full">
                  {creating ? "Создание..." : "Создать"}
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        {loading ? (
          <div className="text-center text-muted-foreground py-20">Загрузка...</div>
        ) : spaces.length === 0 ? (
          <div className="glass rounded-2xl p-16 text-center">
            <FolderOpen className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
            <h2 className="text-xl font-semibold text-foreground mb-2">Нет спейсов</h2>
            <p className="text-muted-foreground mb-6">Создайте первый спейс для вашей команды</p>
            <Button onClick={() => setDialogOpen(true)} className="glow-primary">
              <Plus className="w-4 h-4 mr-2" /> Создать спейс
            </Button>
          </div>
        ) : (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {spaces.map((space) => (
              <button
                key={space.id}
                onClick={() => navigate(`/space/${space.id}`)}
                className="glass rounded-2xl p-6 text-left hover:border-primary/30 transition-all group"
              >
                <div className="flex items-center justify-between mb-4">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: "hsl(160 100% 50% / 0.1)" }}>
                    <FolderOpen className="w-5 h-5 text-primary" />
                  </div>
                  <ArrowRight className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors" />
                </div>
                <h3 className="text-lg font-semibold text-foreground mb-1">{space.name}</h3>
                {space.description && <p className="text-sm text-muted-foreground">{space.description}</p>}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default Dashboard;
