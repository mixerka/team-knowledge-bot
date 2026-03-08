import { useState, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import {
  Brain, ArrowLeft, Upload, FileText, Trash2, MessageSquare,
  Users, Send, UserPlus, X, File
} from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import ReactMarkdown from "react-markdown";

interface Document {
  id: string;
  name: string;
  file_type: string;
  file_size: number;
  created_at: string;
  content_text: string | null;
}

interface Member {
  id: string;
  user_id: string;
  role: string;
  joined_at: string;
  profiles?: { display_name: string | null; email: string | null } | null;
}

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

const SpacePage = () => {
  const { id: spaceId } = useParams<{ id: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();

  const [spaceName, setSpaceName] = useState("");
  const [documents, setDocuments] = useState<Document[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [uploading, setUploading] = useState(false);
  const [isOwner, setIsOwner] = useState(false);

  // Chat
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Invite
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteDialogOpen, setInviteDialogOpen] = useState(false);

  useEffect(() => {
    if (spaceId) {
      fetchSpace();
      fetchDocuments();
      fetchMembers();
    }
  }, [spaceId]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const fetchSpace = async () => {
    const { data } = await supabase.from("spaces").select("*").eq("id", spaceId!).single();
    if (data) {
      setSpaceName(data.name);
      setIsOwner(data.owner_id === user?.id);
    }
  };

  const fetchDocuments = async () => {
    const { data } = await supabase.from("documents").select("*").eq("space_id", spaceId!).order("created_at", { ascending: false });
    setDocuments(data || []);
  };

  const fetchMembers = async () => {
    const { data } = await supabase
      .from("space_members")
      .select("*, profiles(display_name, email)")
      .eq("space_id", spaceId!);
    setMembers((data as any) || []);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || !user) return;
    setUploading(true);

    for (const file of Array.from(files)) {
      const ext = file.name.split(".").pop()?.toLowerCase();
      if (!["pdf", "docx", "md", "txt"].includes(ext || "")) {
        toast.error(`Формат ${ext} не поддерживается`);
        continue;
      }

      const filePath = `${spaceId}/${Date.now()}_${file.name}`;
      const { error: uploadError } = await supabase.storage.from("documents").upload(filePath, file);

      if (uploadError) {
        toast.error(`Ошибка загрузки ${file.name}`);
        continue;
      }

      // For txt and md, read content directly
      let contentText: string | null = null;
      if (ext === "txt" || ext === "md") {
        contentText = await file.text();
      }

      const { data: docData, error: dbError } = await supabase.from("documents").insert({
        space_id: spaceId!,
        name: file.name,
        file_type: ext || "unknown",
        file_path: filePath,
        file_size: file.size,
        content_text: contentText,
        uploaded_by: user.id,
      }).select("id").single();

      if (dbError) {
        toast.error(`Ошибка сохранения ${file.name}`);
      } else {
        toast.success(`${file.name} загружен`);

        const triggerEmbedding = (docId: string) => {
          toast.info(`Индексация ${file.name} для AI-поиска...`);
          supabase.functions.invoke("embed-document", {
            body: { documentId: docId },
          }).then(({ data, error }) => {
            if (error) {
              console.error("Embed error:", error);
            } else {
              toast.success(`${file.name} проиндексирован (${data?.chunks || 0} фрагментов)`);
              fetchDocuments();
            }
          });
        };

        if (ext === "pdf" || ext === "docx") {
          toast.info(`Извлечение текста из ${file.name}...`);
          supabase.functions.invoke("parse-document", {
            body: { documentId: docData.id, filePath, fileType: ext },
          }).then(({ error }) => {
            if (error) {
              toast.error(`Не удалось извлечь текст из ${file.name}`);
            } else {
              toast.success(`Текст из ${file.name} извлечён`);
              triggerEmbedding(docData.id);
            }
          });
        } else {
          // txt/md — content already saved, just chunk it
          triggerEmbedding(docData.id);
        }
      }
    }

    setUploading(false);
    fetchDocuments();
    e.target.value = "";
  };

  const deleteDocument = async (doc: Document) => {
    await supabase.storage.from("documents").remove([`${spaceId}/${doc.name}`]);
    await supabase.from("documents").delete().eq("id", doc.id);
    toast.success("Документ удалён");
    fetchDocuments();
  };

  const sendChatMessage = async () => {
    if (!chatInput.trim() || chatLoading) return;
    const userMsg: ChatMessage = { role: "user", content: chatInput.trim() };
    const updatedMessages = [...messages, userMsg];
    setMessages(updatedMessages);
    setChatInput("");
    setChatLoading(true);

    try {
      const { data, error } = await supabase.functions.invoke("knowledge-chat", {
        body: { messages: updatedMessages, spaceId },
      });

      if (error) throw error;

      setMessages([...updatedMessages, { role: "assistant", content: data.answer || "Не удалось получить ответ" }]);
    } catch (err: any) {
      toast.error("Ошибка AI: " + (err.message || "Неизвестная ошибка"));
      setMessages([...updatedMessages, { role: "assistant", content: "Произошла ошибка. Попробуйте ещё раз." }]);
    } finally {
      setChatLoading(false);
    }
  };

  const inviteMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteEmail.trim()) return;

    // Find user by email
    const { data: profile } = await supabase
      .from("profiles")
      .select("user_id")
      .eq("email", inviteEmail.trim())
      .single();

    if (!profile) {
      toast.error("Пользователь с таким email не найден. Он должен сначала зарегистрироваться.");
      return;
    }

    const { error } = await supabase.from("space_members").insert({
      space_id: spaceId!,
      user_id: profile.user_id,
      role: "member",
      invited_email: inviteEmail.trim(),
    });

    if (error) {
      if (error.code === "23505") {
        toast.error("Пользователь уже в команде");
      } else {
        toast.error("Ошибка приглашения");
      }
      return;
    }

    toast.success("Участник добавлен!");
    setInviteEmail("");
    setInviteDialogOpen(false);
    fetchMembers();
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
    return (bytes / (1024 * 1024)).toFixed(1) + " MB";
  };

  return (
    <div className="min-h-screen relative overflow-hidden">
      <div className="grid-pattern absolute inset-0 opacity-10" />

      {/* Nav */}
      <nav className="relative z-10 flex items-center justify-between px-6 lg:px-12 py-6 border-b border-border">
        <div className="flex items-center gap-4">
          <button onClick={() => navigate("/dashboard")} className="text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: "hsl(160 100% 50% / 0.15)" }}>
              <Brain className="w-5 h-5 text-primary" />
            </div>
            <span className="font-mono font-bold text-xl text-foreground">{spaceName}</span>
          </div>
        </div>
      </nav>

      <div className="relative z-10 container mx-auto px-6 py-8">
        <Tabs defaultValue="chat" className="w-full">
          <TabsList className="bg-secondary border border-border mb-6">
            <TabsTrigger value="chat" className="data-[state=active]:bg-card data-[state=active]:text-foreground">
              <MessageSquare className="w-4 h-4 mr-2" /> AI-Чат
            </TabsTrigger>
            <TabsTrigger value="docs" className="data-[state=active]:bg-card data-[state=active]:text-foreground">
              <FileText className="w-4 h-4 mr-2" /> Документы
            </TabsTrigger>
            <TabsTrigger value="team" className="data-[state=active]:bg-card data-[state=active]:text-foreground">
              <Users className="w-4 h-4 mr-2" /> Команда
            </TabsTrigger>
          </TabsList>

          {/* AI Chat */}
          <TabsContent value="chat">
            <div className="glass rounded-2xl overflow-hidden flex flex-col" style={{ height: "calc(100vh - 280px)" }}>
              <div className="flex-1 overflow-y-auto p-6 space-y-4">
                {messages.length === 0 && (
                  <div className="flex flex-col items-center justify-center h-full text-center">
                    <MessageSquare className="w-16 h-16 text-muted-foreground mb-4" />
                    <h3 className="text-lg font-semibold text-foreground mb-2">AI-Ассистент</h3>
                    <p className="text-muted-foreground max-w-md">
                      Задайте вопрос по загруженным документам. AI найдёт ответ в вашей базе знаний.
                    </p>
                  </div>
                )}
                {messages.map((msg, i) => (
                  <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                    <div className={`max-w-[80%] rounded-2xl px-4 py-3 ${
                      msg.role === "user"
                        ? "bg-primary text-primary-foreground"
                        : "bg-secondary text-secondary-foreground"
                    }`}>
                      {msg.role === "assistant" ? (
                        <div className="prose prose-sm prose-invert max-w-none">
                          <ReactMarkdown>{msg.content}</ReactMarkdown>
                        </div>
                      ) : (
                        <p>{msg.content}</p>
                      )}
                    </div>
                  </div>
                ))}
                {chatLoading && (
                  <div className="flex justify-start">
                    <div className="bg-secondary text-secondary-foreground rounded-2xl px-4 py-3">
                      <div className="flex gap-1">
                        <span className="w-2 h-2 rounded-full bg-muted-foreground animate-pulse" />
                        <span className="w-2 h-2 rounded-full bg-muted-foreground animate-pulse" style={{ animationDelay: "0.15s" }} />
                        <span className="w-2 h-2 rounded-full bg-muted-foreground animate-pulse" style={{ animationDelay: "0.3s" }} />
                      </div>
                    </div>
                  </div>
                )}
                <div ref={chatEndRef} />
              </div>

              <div className="border-t border-border p-4">
                <form onSubmit={(e) => { e.preventDefault(); sendChatMessage(); }} className="flex gap-3">
                  <Input
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    placeholder="Задайте вопрос по базе знаний..."
                    className="bg-secondary border-border text-foreground placeholder:text-muted-foreground flex-1"
                    disabled={chatLoading}
                  />
                  <Button type="submit" disabled={chatLoading || !chatInput.trim()} size="icon">
                    <Send className="w-4 h-4" />
                  </Button>
                </form>
              </div>
            </div>
          </TabsContent>

          {/* Documents */}
          <TabsContent value="docs">
            <div className="glass rounded-2xl p-6">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-semibold text-foreground">Документы</h2>
                <label className="cursor-pointer">
                  <input
                    type="file"
                    accept=".pdf,.docx,.md,.txt"
                    multiple
                    onChange={handleFileUpload}
                    className="hidden"
                    disabled={uploading}
                  />
                  <Button asChild disabled={uploading}>
                    <span>
                      <Upload className="w-4 h-4 mr-2" />
                      {uploading ? "Загрузка..." : "Загрузить"}
                    </span>
                  </Button>
                </label>
              </div>

              {documents.length === 0 ? (
                <div className="text-center py-16">
                  <File className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
                  <p className="text-muted-foreground">Нет загруженных документов</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {documents.map((doc) => (
                    <div key={doc.id} className="flex items-center justify-between p-4 rounded-xl bg-secondary/50 border border-border">
                      <div className="flex items-center gap-3">
                        <FileText className="w-5 h-5 text-primary" />
                        <div>
                          <p className="text-foreground font-medium">{doc.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {doc.file_type.toUpperCase()} · {formatFileSize(doc.file_size)} · {new Date(doc.created_at).toLocaleDateString("ru")}
                          </p>
                        </div>
                      </div>
                      <Button variant="ghost" size="icon" onClick={() => deleteDocument(doc)} className="text-muted-foreground hover:text-destructive">
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </TabsContent>

          {/* Team */}
          <TabsContent value="team">
            <div className="glass rounded-2xl p-6">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-semibold text-foreground">Команда</h2>
                {isOwner && (
                  <Dialog open={inviteDialogOpen} onOpenChange={setInviteDialogOpen}>
                    <DialogTrigger asChild>
                      <Button>
                        <UserPlus className="w-4 h-4 mr-2" /> Пригласить
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="bg-card border-border">
                      <DialogHeader>
                        <DialogTitle className="text-foreground">Пригласить участника</DialogTitle>
                      </DialogHeader>
                      <form onSubmit={inviteMember} className="space-y-4 mt-4">
                        <Input
                          type="email"
                          placeholder="Email участника"
                          value={inviteEmail}
                          onChange={(e) => setInviteEmail(e.target.value)}
                          required
                          className="bg-secondary border-border text-foreground placeholder:text-muted-foreground"
                        />
                        <Button type="submit" className="w-full">Пригласить</Button>
                      </form>
                    </DialogContent>
                  </Dialog>
                )}
              </div>

              <div className="space-y-3">
                {members.map((member) => (
                  <div key={member.id} className="flex items-center justify-between p-4 rounded-xl bg-secondary/50 border border-border">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center">
                        <Users className="w-5 h-5 text-primary" />
                      </div>
                      <div>
                        <p className="text-foreground font-medium">
                          {member.profiles?.display_name || member.profiles?.email || "Участник"}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {member.role === "owner" ? "Владелец" : "Участник"}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

export default SpacePage;
