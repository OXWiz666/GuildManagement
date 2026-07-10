"use client";

import { useRef, useState } from "react";
import SettingsCard from "./SettingsCard";
import Input from "@/components/ui/Input";
import Button from "@/components/ui/Button";
import { useAuth } from "@/lib/auth-context";
import { authApi } from "@/lib/api";
import { useToast } from "@/components/ui/Toast";
import { PAYMENT_METHOD_PRESETS } from "@guild/shared";

const MAX_FILE_BYTES = 2 * 1024 * 1024; // 2MB, matches the avatar upload limit
const MAX_METHODS = 6;

export default function PaymentMethodsSection() {
  const { user, refreshUser } = useAuth();
  const { addToast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [method, setMethod] = useState(PAYMENT_METHOD_PRESETS[0]);
  const [label, setLabel] = useState("");
  const [qrDataUrl, setQrDataUrl] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const methods = user?.paymentMethods || [];

  function handleFile(file: File | undefined) {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      addToast("error", "Please upload a valid image file (PNG, JPG, WEBP).");
      return;
    }
    if (file.size > MAX_FILE_BYTES) {
      addToast("error", "QR image must be less than 2MB.");
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      if (e.target?.result) setQrDataUrl(e.target.result as string);
    };
    reader.readAsDataURL(file);
  }

  async function addMethod() {
    if (!qrDataUrl) {
      addToast("error", "Upload a QR code image first");
      return;
    }
    setIsSaving(true);
    try {
      const res = await authApi.addPaymentMethod({
        method,
        label: label.trim() || undefined,
        qrDataUrl,
      });
      if (res.success) {
        addToast("success", `Added ${method}.`);
        setLabel("");
        setQrDataUrl("");
        if (fileInputRef.current) fileInputRef.current.value = "";
        await refreshUser();
      } else addToast("error", res.error?.message || "Failed to add payment method");
    } catch (err: any) {
      addToast("error", err?.message || "An error occurred");
    } finally {
      setIsSaving(false);
    }
  }

  async function removeMethod(id: string) {
    setBusyId(id);
    try {
      const res = await authApi.removePaymentMethod(id);
      if (res.success) {
        addToast("success", "Removed payment method.");
        await refreshUser();
      } else addToast("error", res.error?.message || "Failed to remove payment method");
    } catch (err: any) {
      addToast("error", err?.message || "An error occurred");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <SettingsCard
      eyebrow="Profile"
      title="Payment methods"
      description="Upload QR codes for GCash, Maya, or any payment gateway so guildmates know how to pay you."
    >
      <div className="grid grid-cols-1 sm:grid-cols-[auto_1fr] gap-3 items-end">
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-1.5">Method</label>
          <select
            value={method}
            onChange={(e) => setMethod(e.target.value)}
            className="w-full sm:w-44 rounded-xl bg-surface-100 border border-white/8 text-white text-sm px-4 py-3 transition-all duration-200 focus:outline-none focus:border-primary-500/50 focus:ring-2 focus:ring-primary-500/20 hover:border-white/12"
          >
            {PAYMENT_METHOD_PRESETS.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </div>
        <Input
          label="Account name / number (optional)"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="e.g. Juan D."
        />
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="hidden"
          onChange={(e) => handleFile(e.target.files?.[0])}
        />
        <Button
          variant="ghost"
          size="sm"
          onClick={() => fileInputRef.current?.click()}
          className="text-white/70"
        >
          {qrDataUrl ? "Change QR image" : "Upload QR image"}
        </Button>
        {qrDataUrl && (
          <img
            src={qrDataUrl}
            alt="QR preview"
            className="h-14 w-14 rounded-lg object-cover border border-white/10"
          />
        )}
        <Button
          variant="primary"
          size="sm"
          onClick={addMethod}
          isLoading={isSaving}
          disabled={methods.length >= MAX_METHODS}
        >
          Add payment method
        </Button>
      </div>
      {methods.length >= MAX_METHODS && (
        <p className="mt-2 text-[11px] text-white/35">
          You've reached the {MAX_METHODS}-method limit — remove one to add another.
        </p>
      )}

      <div className="mt-5 space-y-2">
        {methods.length === 0 ? (
          <p className="text-xs text-white/35 py-4 border border-dashed border-white/[0.06] rounded-xl text-center">
            No payment methods added yet.
          </p>
        ) : (
          methods.map((m) => (
            <div
              key={m.id}
              className="flex items-center justify-between gap-3 rounded-xl border border-white/[0.08] bg-white/[0.02] px-3 py-2.5"
            >
              <div className="flex items-center gap-3 min-w-0">
                <img
                  src={m.qrUrl}
                  alt={m.method}
                  className="h-11 w-11 rounded-lg object-cover border border-white/10 shrink-0"
                />
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-white truncate">{m.method}</p>
                  {m.label && <p className="text-[11px] text-white/45 truncate">{m.label}</p>}
                </div>
              </div>
              <Button
                variant="ghost"
                size="xs"
                onClick={() => removeMethod(m.id)}
                disabled={busyId === m.id}
                className="text-rose-300/70 shrink-0"
              >
                Remove
              </Button>
            </div>
          ))
        )}
      </div>
    </SettingsCard>
  );
}
