import React, { useEffect, useState } from 'react';
import { supabase } from '../services/supabase';
import { Profile, UserRole } from '../types';
import { useFeedback } from './feedback/FeedbackProvider';

type StaffForm = {
  id?: string;
  name: string;
  email: string;
  role: UserRole;
};

const emptyForm: StaffForm = {
  name: '',
  email: '',
  role: 'WAITER',
};

const AdminStaff: React.FC = () => {
  const { toast, confirm } = useFeedback();
  const [staff, setStaff] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [formData, setFormData] = useState<StaffForm>(emptyForm);

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
        const { error } = await supabase.from('profiles').insert({
          name: formData.name.trim(),
          email: formData.email.trim().toLowerCase(),
          role: formData.role,
        });
        if (error) throw error;
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

  const handleSendPasswordReset = async (email: string) => {
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail) return;

    setLoading(true);
    const redirectHash = window.location.hash.startsWith('#/admin') ? window.location.hash : '#/admin';
    const redirectTo = `${window.location.origin}/${redirectHash}`;

    const { error } = await supabase.auth.resetPasswordForEmail(normalizedEmail, { redirectTo });
    setLoading(false);

    if (error) {
      toast(`Erro ao enviar redefinicao: ${error.message}`, 'error');
      return;
    }

    toast(`Link de redefinicao enviado para ${normalizedEmail}.`, 'success');
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
                      onClick={() => handleSendPasswordReset(user.email)}
                      disabled={loading}
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
        <div className="fixed inset-0 z-[150] bg-gray-900/90 backdrop-blur-sm flex items-center justify-center p-6">
          <form onSubmit={handleCreateOrUpdate} className="bg-white w-full max-w-md rounded-[32px] p-10 space-y-10 border border-gray-200">
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
    </div>
  );
};

export default AdminStaff;
