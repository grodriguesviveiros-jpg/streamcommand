-- ============================================================================
-- Escrita em workspaces por membro do próprio workspace
--
-- O callback da Twitch atualiza workspaces.channel_name dentro do contexto do
-- workspace. A política original exigia owner_user_id = app_uid() no WITH CHECK,
-- então qualquer escrita sem app.user_id (ou feita por um membro autorizado com
-- twitch.manage que não é o dono) falhava com
-- "new row violates row-level security policy for table workspaces".
--
-- O USING continua idêntico. O WITH CHECK passa a aceitar, além do dono, um
-- usuário autenticado que seja membro do workspace ativo (app.workspace_id).
-- O isolamento entre workspaces não muda: nenhuma linha de outro workspace
-- pode ser lida ou escrita.
-- ============================================================================

drop policy if exists workspaces_access on workspaces;
create policy workspaces_access on workspaces
  using (
    id = app_ws()
    or owner_user_id = app_uid()
    or id in (select workspace_id from workspace_members where user_id = app_uid())
  )
  with check (
    owner_user_id = app_uid()
    or (
      id = app_ws()
      and exists (
        select 1 from workspace_members m
         where m.workspace_id = workspaces.id and m.user_id = app_uid()
      )
    )
  );
