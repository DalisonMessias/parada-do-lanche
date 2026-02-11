
import React, { useState, useEffect } from 'react';
import { supabase } from '../services/supabase';
import { Profile, UserRole } from '../types';

const AdminStaff: React.FC = () => {
  const [staff, setStaff] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [formData, setFormData] = useState({ name: '', email: '', password: '', role: 'WAITER' as UserRole });

  const fetchStaff = async () => {
    const { data } = await supabase.from('profiles').select('*').order('name');
    if (data) setStaff(data);
  };

  useEffect(() => { fetchStaff(); }, []);

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.from('profiles').insert({ name: formData.name, email: formData.email, role: formData.role });
    if (error) alert("Erro: " + error.message);
    else { setShowModal(false); fetchStaff(); }
    setLoading(false);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Deseja excluir este perfil?')) return;
    await supabase.from('profiles').delete().eq('id', id);
    fetchStaff();
  };

  return (
    <div className="space-y-10">
      <div className="flex justify-between items-center bg-white p-8 rounded-[28px] border border-gray-200">
        <div>
          <h2 className="text-3xl font-black text-gray-900 uppercase tracking-tighter">Equipe e Acessos</h2>
          <p className="text-[10px] text-gray-400 font-black uppercase tracking-[0.2em] mt-2 italic">Controle quem opera o sistema</p>
        </div>
        <button onClick={() => setShowModal(true)} className="bg-gray-900 text-white px-8 py-4 rounded-xl text-[10px] font-black uppercase tracking-widest active:scale-95 transition-transform">
          Novo Perfil
        </button>
      </div>

      <div className="bg-white rounded-[28px] border border-gray-200 overflow-hidden">
        <table className="w-full text-left">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-100 italic">
              <th className="px-8 py-5 text-[9px] font-black text-gray-400 uppercase tracking-widest">NOME</th>
              <th className="px-8 py-5 text-[9px] font-black text-gray-400 uppercase tracking-widest">E-MAIL</th>
              <th className="px-8 py-5 text-[9px] font-black text-gray-400 uppercase tracking-widest text-center">NÍVEL</th>
              <th className="px-8 py-5 text-[9px] font-black text-gray-400 uppercase tracking-widest text-right">AÇÕES</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {staff.map(user => (
              <tr key={user.id} className="hover:bg-gray-50/30 transition-colors">
                <td className="px-8 py-5">
                  <span className="font-black text-gray-900 uppercase tracking-tighter text-base">{user.name}</span>
                </td>
                <td className="px-8 py-5">
                  <span className="text-[10px] text-gray-400 font-black uppercase tracking-widest">{user.email}</span>
                </td>
                <td className="px-8 py-5 text-center">
                  <span className={`px-4 py-1.5 rounded-full text-[8px] font-black uppercase tracking-widest border ${
                    user.role === 'ADMIN' ? 'bg-purple-50 text-purple-600 border-purple-100' :
                    user.role === 'MANAGER' ? 'bg-blue-50 text-blue-600 border-blue-100' : 'bg-gray-50 text-gray-400 border-gray-100'
                  }`}>
                    {user.role}
                  </span>
                </td>
                <td className="px-8 py-5 text-right">
                  <button onClick={() => handleDelete(user.id)} className="text-gray-300 hover:text-red-500 transition-colors">
                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showModal && (
        <div className="fixed inset-0 z-[150] bg-gray-900/90 backdrop-blur-sm flex items-center justify-center p-6">
          <form onSubmit={handleCreateUser} className="bg-white w-full max-w-md rounded-[32px] p-10 space-y-10 border border-gray-200">
            <h3 className="text-2xl font-black uppercase tracking-tighter italic text-gray-900">Novo Perfil</h3>
            <div className="space-y-6">
              <div className="space-y-2">
                <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest ml-1">NOME COMPLETO</label>
                <input required value={formData.name} onChange={e=>setFormData({...formData, name: e.target.value})} className="w-full p-4 border border-gray-200 rounded-xl outline-none focus:border-primary font-black" placeholder="Ex: Lucas" />
              </div>
              <div className="space-y-2">
                <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest ml-1">E-MAIL</label>
                <input required type="email" value={formData.email} onChange={e=>setFormData({...formData, email: e.target.value})} className="w-full p-4 border border-gray-200 rounded-xl outline-none focus:border-primary font-black" placeholder="equipe@loja.com" />
              </div>
              <div className="space-y-2">
                <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest ml-1">FUNÇÃO</label>
                <select value={formData.role} onChange={e=>setFormData({...formData, role: e.target.value as UserRole})} className="w-full p-4 border border-gray-200 rounded-xl outline-none focus:border-primary font-black appearance-none">
                  <option value="ADMIN">ADMINISTRADOR</option>
                  <option value="MANAGER">GERENTE</option>
                  <option value="WAITER">GARÇOM</option>
                </select>
              </div>
            </div>
            <div className="flex gap-4 border-t border-gray-100 pt-8">
              <button type="button" onClick={() => setShowModal(false)} className="flex-1 py-4 text-gray-400 font-black uppercase tracking-widest text-[10px]">Cancelar</button>
              <button type="submit" disabled={loading} className="flex-1 py-4 bg-gray-900 text-white rounded-xl font-black uppercase tracking-widest text-[10px]">Criar Agora</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};

export default AdminStaff;
