
-- Drop all RESTRICTIVE policies and recreate as PERMISSIVE for spaces
DROP POLICY IF EXISTS "Authenticated users can create spaces" ON public.spaces;
DROP POLICY IF EXISTS "Members can view their spaces" ON public.spaces;
DROP POLICY IF EXISTS "Owners can delete spaces" ON public.spaces;
DROP POLICY IF EXISTS "Owners can update spaces" ON public.spaces;

CREATE POLICY "Authenticated users can create spaces" ON public.spaces FOR INSERT TO authenticated WITH CHECK (auth.uid() = owner_id);
CREATE POLICY "Members can view their spaces" ON public.spaces FOR SELECT TO authenticated USING (is_space_member(auth.uid(), id));
CREATE POLICY "Owners can delete spaces" ON public.spaces FOR DELETE TO authenticated USING (auth.uid() = owner_id);
CREATE POLICY "Owners can update spaces" ON public.spaces FOR UPDATE TO authenticated USING (auth.uid() = owner_id);

-- Fix space_members
DROP POLICY IF EXISTS "Members can view other members" ON public.space_members;
DROP POLICY IF EXISTS "Owners can add members" ON public.space_members;
DROP POLICY IF EXISTS "Owners can remove members" ON public.space_members;

CREATE POLICY "Members can view other members" ON public.space_members FOR SELECT TO authenticated USING (is_space_member(auth.uid(), space_id));
CREATE POLICY "Owners can add members" ON public.space_members FOR INSERT TO authenticated WITH CHECK (
  (EXISTS (SELECT 1 FROM space_members sm WHERE sm.space_id = space_members.space_id AND sm.user_id = auth.uid() AND sm.role = 'owner'))
  OR (auth.uid() = user_id)
);
CREATE POLICY "Owners can remove members" ON public.space_members FOR DELETE TO authenticated USING (
  EXISTS (SELECT 1 FROM space_members sm WHERE sm.space_id = space_members.space_id AND sm.user_id = auth.uid() AND sm.role = 'owner')
);

-- Fix documents
DROP POLICY IF EXISTS "Members can delete their documents" ON public.documents;
DROP POLICY IF EXISTS "Members can upload documents" ON public.documents;
DROP POLICY IF EXISTS "Members can view documents" ON public.documents;

CREATE POLICY "Members can delete their documents" ON public.documents FOR DELETE TO authenticated USING (auth.uid() = uploaded_by);
CREATE POLICY "Members can upload documents" ON public.documents FOR INSERT TO authenticated WITH CHECK (is_space_member(auth.uid(), space_id) AND auth.uid() = uploaded_by);
CREATE POLICY "Members can view documents" ON public.documents FOR SELECT TO authenticated USING (is_space_member(auth.uid(), space_id));

-- Fix document_chunks
DROP POLICY IF EXISTS "Members can delete chunks" ON public.document_chunks;
DROP POLICY IF EXISTS "Members can insert chunks" ON public.document_chunks;
DROP POLICY IF EXISTS "Members can view chunks" ON public.document_chunks;

CREATE POLICY "Members can delete chunks" ON public.document_chunks FOR DELETE TO authenticated USING (is_space_member(auth.uid(), space_id));
CREATE POLICY "Members can insert chunks" ON public.document_chunks FOR INSERT TO authenticated WITH CHECK (is_space_member(auth.uid(), space_id));
CREATE POLICY "Members can view chunks" ON public.document_chunks FOR SELECT TO authenticated USING (is_space_member(auth.uid(), space_id));

-- Fix profiles
DROP POLICY IF EXISTS "Profiles are viewable by authenticated users" ON public.profiles;
DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;

CREATE POLICY "Profiles are viewable by authenticated users" ON public.profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users can insert own profile" ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = user_id);
