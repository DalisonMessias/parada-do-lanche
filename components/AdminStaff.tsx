import React, { useEffect, useState } from 'react';
import { createClient } from '@supabase/supabase-js';
import { supabase, supabaseKey, supabaseUrl } from '../services/supabase';
import { Profile, UserRole } from '../types';
import { useFeedback } from './feedback/FeedbackProvider';

type StaffForm = {
  id?: string;
  name: string;
  email: string;
  role: UserRole;
  password: string;
};

const emptyForm: StaffForm = {
  name: '',
  email: '',
  role: 'WAITER',
  password: '',
};

interface AdminStaffProps {
  profile: Profile | null;
}

const AdminStaff: React.FC<AdminStaffProps> = ({ profile }) => {
  const { toast, confirm } = useFeedback();
  const [staff, setStaff] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [formData, setFormData] = useState<StaffForm>(emptyForm);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [passwordTarget, setPasswordTarget] = useState<Profile | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [updatingPassword, setUpdatingPassword] = useState(false);

  const fetchStaff = async () => {
    const { data, error } = await supabase.from('profiles').select('*').order('name');
    if (error) {
      toast(`Erro ao carregar equipe: ${error.message}`, 'error');
      return;
    }
    if (data) setStaff(data as Profile[]);
  };

  useEffect(() => {
    fetchStaff();
  }, []);

  const openCreateModal = () => {
    setIsEditing(false);
    setFormData(emptyForm);
    setShowModal(true);
  };

  const openEditModal = (user: Profile) => {
    setIsEditing(true);
    setFormData({
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      password: '',
    });
    setShowModal(true);
  };

  const handleCreateOrUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      if (isEditing && formData.id) {
        const { error } = await supabase
          .from('profiles')
          .update({
            name: formData.name.trim(),
            email: formData.email.trim().toLowerCase(),
            role: formData.role,
          })
          .eq('id', formData.id);

        if (error) throw error;
        toast('Perfil atualizado com sucesso.', 'success');
      } else {
        const normalizedName = formData.name.trim();
        const normalizedEmail = formData.email.trim().toLowerCase();
        const normalizedPassword = formData.password;
        if (normalizedPassword.length < 6) {
          throw new Error('A senha deve ter no minimo 6 caracteres.');
        }
        const signupClient = createClient(supabaseUrl, supabaseKey, {
          auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
        });
        const { data: signupData, error: signupError } = await signupClient.auth.signUp({
          email: normalizedEmail,
          password: normalizedPassword,
          options: { data: { name: normalizedName } },
        });

        if (signupError) {
          const msg = (signupError.message || '').toLowerCase();
          if (msg.includes('already') || msg.includes('registered')) {
            throw new Error('Este e-mail ja esta cadastrado no Auth. Use o botao Senha para alterar acesso.');
          }
          throw signupError;
        }

        const authUserId = signupData.user?.id;
        const hasIdentity = (((signupData.user as any)?.identities || []) as any[]).length > 0;
        if (!authUserId || !hasIdentity) {
          throw new Error('Nao foi possivel criar usuario no Auth para este e-mail.');
        }

        const { error: profileError } = await supabase.from('profiles').upsert(
          {
            id: authUserId,
            name: normalizedName,
            email: normalizedEmail,
            role: formData.role,
          },
          { onConflict: 'id' }
        );
        if (profileError) throw profileError;

        toast('Perfil criado com sucesso.', 'success');
      }

      setShowModal(false);
      setFormData(emptyForm);
      setIsEditing(false);
      fetchStaff();
    } catch (error: any) {
      toast(`Erro: ${error.message}`, 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    const ok = await confirm('Deseja excluir este perfil?');
    if (!ok) return;

    const { error } = await supabase.from('profiles').delete().eq('id', id);
    if (error) {
      toast(`Erro ao excluir perfil: ${error.message}`, 'error');
      return;
    }
    toast('Perfil removido.', 'success');
    fetchStaff();
  };

  const openPasswordModal = (user: Profile) => {
    setPasswordTarget(user);
    setNewPassword('');
    setConfirmPassword('');
    setPasswordError('');
    setShowPasswordModal(true);
  };

  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!passwordTarget) return;

    if (profile?.role !== 'ADMIN') {
      setPasswordError('Permissao insuficiente para alterar senha.');
      return;
    }

    const cleanPassword = newPassword.trim();
    if (cleanPassword.length < 8) {
      setPasswordError('A senha deve ter no minimo 8 caracteres.');
      return;
    }
    if (cleanPassword !== confirmPassword.trim()) {
      setPasswordError('A confirmacao de senha precisa ser igual a nova senha.');
      return;
    }

    setUpdatingPassword(true);
    setPasswordError('');

    const { error } = await supabase.rpc('admin_set_user_password', {
      p_actor_profile_id: profile.id,
      p_actor_name: profile.name || 'Administrador',
      p_target_profile_id: passwordTarget.id,
      p_new_password: cleanPassword,
    });

    setUpdatingPassword(false);
    if (error) {
      setPasswordError(error.message || 'Falha ao atualizar senha.');
      return;
    }

    setShowPasswordModal(false);
    setPasswordTarget(null);
    toast(`Senha de ${passwordTarget.name} atualizada com sucesso.`, 'success');
  };

  return (
    <div className="space-y-10">
      <div className="flex justify-between items-center bg-white p-8 rounded-[28px] border border-gray-200">
        <div>
          <h2 className="text-3xl font-black text-gray-900 uppercase tracking-tighter">Equipe e Acessos</h2>
          <p className="text-[10px] text-gray-400 font-black uppercase tracking-[0.2em] mt-2 italic">
            Controle usuarios e permissoes do sistema
          </p>
        </div>
        <button
          onClick={openCreateModal}
          className="bg-gray-900 text-white px-8 py-4 rounded-xl text-[10px] font-black uppercase tracking-widest active:scale-95 transition-transform"
        >
          Novo Perfil
        </button>
      </div>

      <div className="bg-white rounded-[28px] border border-gray-200 overflow-hidden">
        <table className="w-full text-left">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-100 italic">
              <th className="px-8 py-5 text-[9px] font-black text-gray-400 uppercase tracking-widest">Nome</th>
              <th className="px-8 py-5 text-[9px] font-black text-gray-400 uppercase tracking-widest">E-mail</th>
              <th className="px-8 py-5 text-[9px] font-black text-gray-400 uppercase tracking-widest text-center">Nivel</th>
              <th className="px-8 py-5 text-[9px] font-black text-gray-400 uppercase tracking-widest text-right">Acoes</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {staff.map((user) => (
              <tr key={user.id} className="hover:bg-gray-50/30 transition-colors">
                <td className="px-8 py-5">
                  <span className="font-black text-gray-900 uppercase tracking-tighter text-base">{user.name}</span>
                </td>
                <td className="px-8 py-5">
                  <span className="text-[10px] text-gray-400 font-black uppercase tracking-widest">{user.email}</span>
                </td>
                <td className="px-8 py-5 text-center">
                  <span className={`px-4 py-1.5 rounded-full text-[8px] font-black uppercase tracking-widest border ${
                    user.role === 'ADMIN'
                      ? 'bg-blue-50 text-blue-600 border-blue-100'
                      : user.role === 'MANAGER'
                        ? 'bg-emerald-50 text-emerald-600 border-emerald-100'
                        : 'bg-gray-50 text-gray-400 border-gray-100'
                  }`}>
                    {user.role === 'ADMIN' ? 'Administrador' : user.role === 'MANAGER' ? 'Gerente' : 'Garcom'}
                  </span>
                </td>
                <td className="px-8 py-5">
                  <div className="flex justify-end gap-2">
                    <button
                      onClick={() => openEditModal(user)}
                      className="px-3 py-2 rounded-lg border border-gray-200 text-[9px] font-black uppercase tracking-widest text-gray-600 hover:bg-gray-50"
                    >
                      Editar
                    </button>
                    <button
                      onClick={() => openPasswordModal(user)}
                      disabled={loading || updatingPassword}
                      className="px-3 py-2 rounded-lg border border-gray-200 text-[9px] font-black uppercase tracking-widest text-amber-600 hover:bg-amber-50"
                    >
                      Senha
                    </button>
                    <button
                      onClick={() => handleDelete(user.id)}
                      className="px-3 py-2 rounded-lg border border-red-100 text-[9px] font-black uppercase tracking-widest text-red-500 hover:bg-red-50"
                    >
                      Excluir
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showModal && (
        <div className="fixed inset-0 z-[150] bg-gray-900/90 backdrop-blur-sm flex items-end sm:items-center justify-center p-3 sm:p-6">
          <form onSubmit={handleCreateOrUpdate} className="bg-white w-full max-w-md rounded-t-[28px] sm:rounded-[32px] p-6 sm:p-10 flex flex-col gap-8 sm:gap-10 border border-gray-200 max-h-[calc(100dvh-1.5rem)] sm:max-h-[calc(100dvh-3rem)] overflow-y-auto">
            <h3 className="text-2xl font-black uppercase tracking-tighter italic text-gray-900">
              {isEditing ? 'Editar Perfil' : 'Novo Perfil'}
            </h3>
            <div className="space-y-6">
              <div className="space-y-2">
                <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest ml-1">Nome Completo</label>
                <input
                  required
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full p-4 border border-gray-200 rounded-xl outline-none focus:border-primary font-black"
                  placeholder="Ex: Lucas"
                />
              </div>
              <div className="space-y-2">
                <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest ml-1">E-mail</label>
                <input
                  required
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  className="w-full p-4 border border-gray-200 rounded-xl outline-none focus:border-primary font-black"
                  placeholder="equipe@loja.com"
                />
              </div>
              <div className="space-y-2">
                <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest ml-1">Funcao</label>
                <select
                  value={formData.role}
                  onChange={(e) => setFormData({ ...formData, role: e.target.value as UserRole })}
                  className="w-full p-4 border border-gray-200 rounded-xl outline-none focus:border-primary font-black appearance-none"
                >
                  <option value="ADMIN">ADMINISTRADOR</option>
                  <option value="MANAGER">GERENTE</option>
                  <option value="WAITER">GARCOM</option>
                </select>
              </div>
              {!isEditing && (
                <div className="space-y-2">
                  <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest ml-1">Senha inicial</label>
                  <input
                    required
                    type="password"
                    minLength={6}
                    value={formData.password}
                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                    className="w-full p-4 border border-gray-200 rounded-xl outline-none focus:border-primary font-black"
                    placeholder="Minimo 6 caracteres"
                  />
                </div>
              )}
              {isEditing && (
                <p className="text-[9px] text-gray-400 font-black uppercase tracking-widest leading-relaxed">
                  Troca de senha e feita pelo botao &quot;Senha&quot; na lista de usuarios.
                </p>
              )}
            </div>
            <div className="flex gap-4 border-t border-gray-100 pt-8">
              <button type="button" onClick={() => setShowModal(false)} className="flex-1 py-4 text-gray-400 font-black uppercase tracking-widest text-[10px]">
                Cancelar
              </button>
              <button type="submit" disabled={loading} className="flex-1 py-4 bg-gray-900 text-white rounded-xl font-black uppercase tracking-widest text-[10px]">
                {isEditing ? 'Salvar' : 'Criar Agora'}
              </button>
            </div>
          </form>
        </div>
      )}

      {showPasswordModal && passwordTarget && (
        <div className="fixed inset-0 z-[160] bg-gray-900/90 backdrop-blur-sm flex items-end sm:items-center justify-center p-3 sm:p-6">
          <form
            onSubmit={handleUpdatePassword}
            className="bg-white w-full max-w-md rounded-t-[28px] sm:rounded-[32px] p-6 sm:p-10 flex flex-col gap-8 border border-gray-200"
          >
            <div>
              <h3 className="text-2xl font-black uppercase tracking-tighter italic text-gray-900">Alterar Senha</h3>
              <p className="text-[10px] text-gray-400 font-black uppercase tracking-widest mt-2">
                Colaborador: {passwordTarget.name}
              </p>
            </div>

            <div className="space-y-5">
              <div className="space-y-2">
                <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest ml-1">Nova senha</label>
                <input
                  required
                  type="password"
                  minLength={8}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full p-4 border border-gray-200 rounded-xl outline-none focus:border-primary font-black"
                  placeholder="Minimo 8 caracteres"
                />
              </div>

              <div className="space-y-2">
                <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest ml-1">Confirmar nova senha</label>
                <input
                  required
                  type="password"
                  minLength={8}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full p-4 border border-gray-200 rounded-xl outline-none focus:border-primary font-black"
                  placeholder="Repita a senha"
                />
              </div>

              {passwordError && (
                <div className="rounded-xl border border-red-100 bg-red-50 px-4 py-3">
                  <p className="text-[10px] text-red-600 font-black uppercase tracking-widest">{passwordError}</p>
                </div>
              )}
            </div>

            <div className="flex gap-4 border-t border-gray-100 pt-6">
              <button
                type="button"
                onClick={() => {
                  setShowPasswordModal(false);
                  setPasswordTarget(null);
                }}
                className="flex-1 py-4 text-gray-400 font-black uppercase tracking-widest text-[10px]"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={updatingPassword}
                className="flex-1 py-4 bg-gray-900 text-white rounded-xl font-black uppercase tracking-widest text-[10px] disabled:opacity-50"
              >
                {updatingPassword ? 'Salvando...' : 'Salvar'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};

export default AdminStaff;
