// Shared by My Profile and Settings: changing the photo and the optional personal details.
import { useEffect, useState, type FormEvent } from 'react';
import { Camera, Save } from 'lucide-react';
import { COOKING_LEVELS, saveAvatarUrl, saveDisplayName, saveProfileDetails, type ProfileDetails } from '../lib/accountApi';
import { uploadAvatar } from '../lib/uploads';
import { ErrorNote, Modal } from './ui';

export function AvatarPhotoButton({ hasPhoto, className, iconSize = 22, onError }: { hasPhoto: boolean; className: string; iconSize?: number; onError: (message: string) => void }) {
  const [busy, setBusy] = useState(false);
  const label = busy ? 'Uploading…' : hasPhoto ? 'Change photo' : 'Upload photo';
  const change = (file: File) => {
    setBusy(true);
    onError('');
    uploadAvatar(file).then(saveAvatarUrl).catch((e: Error) => onError(e.message)).finally(() => setBusy(false));
  };
  return (
    <label title={label} className={`absolute grid cursor-pointer place-items-center rounded-full border-2 border-crimson bg-white text-crimson shadow ${busy ? 'opacity-60' : ''} ${className}`}>
      <Camera size={iconSize} aria-hidden="true" /><span className="sr-only">{label}</span>
      <input type="file" accept="image/webp,image/jpeg,image/png" className="sr-only" disabled={busy}
        onChange={(e) => { const file = e.target.files?.[0]; e.target.value = ''; if (file) change(file); }} />
    </label>
  );
}

export function EditProfileModal({ open, userId, name, details, onClose, onSaved }: {
  open: boolean; userId: string; name: string; details: ProfileDetails; onClose: () => void; onSaved: (name: string, details: ProfileDetails) => void;
}) {
  const [form, setForm] = useState({ ...details, name });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (open) { setForm({ ...details, name }); setError(''); }
    // Start from the current values each time the form opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const { name: nextName, ...nextDetails } = form;
      if (nextName !== name) await saveDisplayName(userId, nextName);
      const clean = await saveProfileDetails(nextDetails);
      onSaved(nextName.trim(), clean);
      onClose();
    } catch (err) { setError((err as Error).message); } finally { setBusy(false); }
  };

  return (
    <Modal open={open} title="Edit Profile" onClose={onClose}>
      <form className="grid gap-3 text-sm sm:grid-cols-2" onSubmit={submit} noValidate>
        <label className="block font-semibold sm:col-span-2">Display name<input className="field mt-1 font-normal" maxLength={30} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></label>
        <label className="block font-semibold">Phone (optional)<input className="field mt-1 font-normal" inputMode="tel" autoComplete="tel" maxLength={20} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></label>
        <label className="block font-semibold">Date of birth (optional)<input className="field mt-1 font-normal" type="date" autoComplete="bday" value={form.birthDate} onChange={(e) => setForm({ ...form, birthDate: e.target.value })} /></label>
        <label className="block font-semibold">Location (optional)<input className="field mt-1 font-normal" maxLength={60} value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} /></label>
        <label className="block font-semibold">Cooking level (optional)
          <select className="field mt-1 font-normal" value={form.cookingLevel} onChange={(e) => setForm({ ...form, cookingLevel: e.target.value })}>
            <option value="">Not set</option>{COOKING_LEVELS.map((l) => <option key={l}>{l}</option>)}
          </select></label>
        <label className="block font-semibold sm:col-span-2">About me (optional)<textarea className="field mt-1 min-h-24 font-normal" maxLength={300} value={form.bio} onChange={(e) => setForm({ ...form, bio: e.target.value })} /></label>
        <p className="text-xs text-stone-500 sm:col-span-2">Only you can see these details. They are never shown to other cooks.</p>
        {error && <div className="sm:col-span-2"><ErrorNote>{error}</ErrorNote></div>}
        <div className="flex gap-2 sm:col-span-2">
          <button type="submit" className="btn-sm btn-red" disabled={busy}><Save size={14} aria-hidden="true" />{busy ? 'Saving…' : 'Save'}</button>
          <button type="button" className="btn-sm btn-outline" onClick={onClose}>Cancel</button>
        </div>
      </form>
    </Modal>
  );
}
