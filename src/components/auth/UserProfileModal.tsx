import React, { useState } from 'react';
import {
  X,
  User as UserIcon,
  Shield,
  KeyRound,
  CheckCircle,
  AlertCircle,
  Eye,
  EyeOff,
  Save,
} from 'lucide-react';
import { usePos } from '../../store/posStore';
import { userService } from '../../services/userService';

interface UserProfileModalProps {
  onClose: () => void;
}

export const UserProfileModal: React.FC<UserProfileModalProps> = ({ onClose }) => {
  const { currentUser, setCurrentUser } = usePos();

  const [fullName, setFullName] = useState<string>(currentUser?.full_name || currentUser?.name || '');
  const [username, setUsername] = useState<string>(currentUser?.username || '');
  const [changePassword, setChangePassword] = useState<boolean>(false);
  const [currentPin, setCurrentPin] = useState<string>('');
  const [newPin, setNewPin] = useState<string>('');
  const [confirmPin, setConfirmPin] = useState<string>('');

  const [showCurrentPin, setShowCurrentPin] = useState<boolean>(false);
  const [showNewPin, setShowNewPin] = useState<boolean>(false);
  const [showConfirmPin, setShowConfirmPin] = useState<boolean>(false);

  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string>('');
  const [successMessage, setSuccessMessage] = useState<string>('');

  if (!currentUser) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccessMessage('');

    const trimmedUsername = username.trim();
    if (!trimmedUsername || trimmedUsername.length < 3) {
      setError('Username must be at least 3 characters long.');
      return;
    }

    if (changePassword) {
      if (!currentPin) {
        setError('Please enter your current password / PIN.');
        return;
      }
      if (!newPin || newPin.trim().length < 4) {
        setError('New password / PIN must be at least 4 characters long.');
        return;
      }
      if (newPin !== confirmPin) {
        setError('The new password and confirmation password do not match.');
        return;
      }
    }

    setIsSubmitting(true);
    try {
      const result = await userService.updateUserProfile({
        userId: currentUser.id,
        username: trimmedUsername,
        fullName: fullName.trim(),
        currentPin: changePassword ? currentPin : undefined,
        newPin: changePassword ? newPin.trim() : undefined,
      });

      // Update global user state
      setCurrentUser(result.user);
      setSuccessMessage('Profile and credentials updated successfully!');

      // Reset password fields
      setCurrentPin('');
      setNewPin('');
      setConfirmPin('');
      setChangePassword(false);

      // Auto close after brief display
      setTimeout(() => {
        onClose();
      }, 1200);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to update profile.';
      if (msg.includes('INCORRECT_CURRENT_PASSWORD')) {
        setError('The current password / PIN you entered is incorrect.');
      } else if (msg.includes('USERNAME_ALREADY_TAKEN')) {
        setError(`The username '${trimmedUsername}' is already taken by another user.`);
      } else {
        setError(msg.replace(/^[A-Z_]+:\s*/, ''));
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const getRoleBadgeColor = (role: string) => {
    switch (role) {
      case 'admin':
        return 'bg-purple-100 text-purple-800 border-purple-200';
      case 'manager':
        return 'bg-amber-100 text-amber-800 border-amber-200';
      case 'inventory_manager':
        return 'bg-blue-100 text-blue-800 border-blue-200';
      case 'cashier':
      default:
        return 'bg-emerald-100 text-emerald-800 border-emerald-200';
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/75 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="relative w-full max-w-md bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden text-slate-800 flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/70 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-[#5c4be2]/10 text-[#5c4be2] flex items-center justify-center font-bold">
              <UserIcon className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-base text-slate-900 leading-tight">My Profile & Security</h3>
              <p className="text-xs text-slate-500 mt-0.5">Edit your username, name, or password</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-200 rounded-lg transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Form Body */}
        <form onSubmit={handleSubmit} className="p-4 sm:p-5 overflow-y-auto space-y-4 text-xs">
          {/* Alerts */}
          {error && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl flex items-start gap-2 text-rose-700">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <div className="flex-1 font-medium">{error}</div>
            </div>
          )}

          {successMessage && (
            <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl flex items-start gap-2 text-emerald-800">
              <CheckCircle className="w-4 h-4 shrink-0 mt-0.5 text-emerald-600" />
              <div className="flex-1 font-semibold">{successMessage}</div>
            </div>
          )}

          {/* Role & Staff Info Card */}
          <div className="p-3 bg-slate-50 rounded-xl border border-slate-200/80 flex items-center justify-between">
            <div>
              <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">Assigned Role</span>
              <span className="text-xs font-bold text-slate-800 capitalize mt-0.5 block">
                {currentUser.role.replace('_', ' ')}
              </span>
            </div>
            <span
              className={`px-2.5 py-1 rounded-full text-[10px] font-extrabold uppercase tracking-wider border ${getRoleBadgeColor(
                currentUser.role
              )}`}
            >
              <Shield className="w-3 h-3 inline-block mr-1 -mt-0.5" />
              {currentUser.role}
            </span>
          </div>

          {/* Full Name Input */}
          <div>
            <label className="block font-semibold text-slate-700 mb-1">Full Name</label>
            <input
              type="text"
              required
              value={fullName}
              onChange={e => setFullName(e.target.value)}
              placeholder="e.g. Alex Mukasa"
              className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:border-[#5c4be2] focus:ring-1 focus:ring-[#5c4be2]/20 transition"
            />
          </div>

          {/* Username Input */}
          <div>
            <label className="block font-semibold text-slate-700 mb-1">
              Username
              <span className="text-slate-400 font-normal ml-1">(Used for logging into the POS)</span>
            </label>
            <input
              type="text"
              required
              value={username}
              onChange={e => setUsername(e.target.value)}
              placeholder="e.g. cashier1"
              className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-mono text-slate-900 placeholder-slate-400 focus:outline-none focus:border-[#5c4be2] focus:ring-1 focus:ring-[#5c4be2]/20 transition"
            />
          </div>

          {/* Toggle Password Change Section */}
          <div className="pt-2 border-t border-slate-100">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-slate-800 flex items-center gap-1.5">
                <KeyRound className="w-3.5 h-3.5 text-[#5c4be2]" />
                <span>Change Password / PIN</span>
              </span>
              <button
                type="button"
                onClick={() => {
                  setChangePassword(!changePassword);
                  if (changePassword) {
                    setCurrentPin('');
                    setNewPin('');
                    setConfirmPin('');
                  }
                }}
                className="text-[#5c4be2] hover:underline font-semibold cursor-pointer"
              >
                {changePassword ? 'Cancel' : 'Change Password'}
              </button>
            </div>

            {changePassword && (
              <div className="mt-3 p-3 bg-slate-50/80 rounded-xl border border-slate-200/80 space-y-3 animate-in fade-in duration-150">
                {/* Current Password */}
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Current Password / PIN</label>
                  <div className="relative">
                    <input
                      type={showCurrentPin ? 'text' : 'password'}
                      required={changePassword}
                      value={currentPin}
                      onChange={e => setCurrentPin(e.target.value)}
                      placeholder="Enter current PIN"
                      className="w-full pl-3 pr-9 py-2 bg-white border border-slate-200 rounded-xl text-xs font-mono text-slate-900 placeholder-slate-400 focus:outline-none focus:border-[#5c4be2]"
                    />
                    <button
                      type="button"
                      onClick={() => setShowCurrentPin(!showCurrentPin)}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                    >
                      {showCurrentPin ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                {/* New Password */}
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">New Password / PIN</label>
                  <div className="relative">
                    <input
                      type={showNewPin ? 'text' : 'password'}
                      required={changePassword}
                      value={newPin}
                      onChange={e => setNewPin(e.target.value)}
                      placeholder="Enter new PIN (min 4 characters)"
                      className="w-full pl-3 pr-9 py-2 bg-white border border-slate-200 rounded-xl text-xs font-mono text-slate-900 placeholder-slate-400 focus:outline-none focus:border-[#5c4be2]"
                    />
                    <button
                      type="button"
                      onClick={() => setShowNewPin(!showNewPin)}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                    >
                      {showNewPin ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                {/* Confirm New Password */}
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Confirm New Password / PIN</label>
                  <div className="relative">
                    <input
                      type={showConfirmPin ? 'text' : 'password'}
                      required={changePassword}
                      value={confirmPin}
                      onChange={e => setConfirmPin(e.target.value)}
                      placeholder="Re-enter new PIN"
                      className="w-full pl-3 pr-9 py-2 bg-white border border-slate-200 rounded-xl text-xs font-mono text-slate-900 placeholder-slate-400 focus:outline-none focus:border-[#5c4be2]"
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirmPin(!showConfirmPin)}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                    >
                      {showConfirmPin ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Form Actions */}
          <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2 shrink-0">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100 transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-5 py-2 rounded-xl bg-[#5c4be2] hover:bg-[#503fe0] active:scale-95 disabled:opacity-50 text-white text-xs font-bold flex items-center gap-1.5 shadow-sm transition cursor-pointer"
            >
              <Save className="w-4 h-4" />
              <span>{isSubmitting ? 'Saving Changes…' : 'Save Changes'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
