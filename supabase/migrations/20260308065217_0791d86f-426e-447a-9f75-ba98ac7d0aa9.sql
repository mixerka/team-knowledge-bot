
-- Create updated_at trigger function
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Spaces table (a team's knowledge base)
CREATE TABLE public.spaces (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.spaces ENABLE ROW LEVEL SECURITY;

-- Documents table
CREATE TABLE public.documents (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  space_id UUID NOT NULL REFERENCES public.spaces(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  file_type TEXT NOT NULL,
  file_path TEXT NOT NULL,
  file_size BIGINT NOT NULL DEFAULT 0,
  content_text TEXT,
  uploaded_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;

-- Space members table
CREATE TABLE public.space_members (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  space_id UUID NOT NULL REFERENCES public.spaces(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'member')),
  invited_email TEXT,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(space_id, user_id)
);

ALTER TABLE public.space_members ENABLE ROW LEVEL SECURITY;

-- Profiles table
CREATE TABLE public.profiles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT,
  email TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (user_id, email, display_name)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1)));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Helper: check if user is member of a space
CREATE OR REPLACE FUNCTION public.is_space_member(_user_id UUID, _space_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.space_members
    WHERE user_id = _user_id AND space_id = _space_id
  )
$$;

-- RLS Policies for spaces
CREATE POLICY "Members can view their spaces" ON public.spaces
  FOR SELECT USING (public.is_space_member(auth.uid(), id));

CREATE POLICY "Authenticated users can create spaces" ON public.spaces
  FOR INSERT WITH CHECK (auth.uid() = owner_id);

CREATE POLICY "Owners can update spaces" ON public.spaces
  FOR UPDATE USING (auth.uid() = owner_id);

CREATE POLICY "Owners can delete spaces" ON public.spaces
  FOR DELETE USING (auth.uid() = owner_id);

-- RLS Policies for documents
CREATE POLICY "Members can view documents" ON public.documents
  FOR SELECT USING (public.is_space_member(auth.uid(), space_id));

CREATE POLICY "Members can upload documents" ON public.documents
  FOR INSERT WITH CHECK (public.is_space_member(auth.uid(), space_id) AND auth.uid() = uploaded_by);

CREATE POLICY "Members can delete their documents" ON public.documents
  FOR DELETE USING (auth.uid() = uploaded_by);

-- RLS Policies for space_members
CREATE POLICY "Members can view other members" ON public.space_members
  FOR SELECT USING (public.is_space_member(auth.uid(), space_id));

CREATE POLICY "Owners can add members" ON public.space_members
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM public.space_members WHERE space_id = space_members.space_id AND user_id = auth.uid() AND role = 'owner')
    OR auth.uid() = user_id
  );

CREATE POLICY "Owners can remove members" ON public.space_members
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM public.space_members sm WHERE sm.space_id = space_members.space_id AND sm.user_id = auth.uid() AND sm.role = 'owner')
  );

-- RLS Policies for profiles
CREATE POLICY "Profiles are viewable by authenticated users" ON public.profiles
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Users can update own profile" ON public.profiles
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own profile" ON public.profiles
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Triggers for updated_at
CREATE TRIGGER update_spaces_updated_at BEFORE UPDATE ON public.spaces
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_documents_updated_at BEFORE UPDATE ON public.documents
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Storage bucket for documents
INSERT INTO storage.buckets (id, name, public) VALUES ('documents', 'documents', false);

CREATE POLICY "Members can upload docs" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'documents' AND auth.role() = 'authenticated');

CREATE POLICY "Members can view docs" ON storage.objects
  FOR SELECT USING (bucket_id = 'documents' AND auth.role() = 'authenticated');

CREATE POLICY "Users can delete own docs" ON storage.objects
  FOR DELETE USING (bucket_id = 'documents' AND auth.role() = 'authenticated');
