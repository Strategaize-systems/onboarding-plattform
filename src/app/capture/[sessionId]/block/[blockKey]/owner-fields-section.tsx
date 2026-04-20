"use client";

import { Input } from "@/components/ui/input";
import { User } from "lucide-react";

interface OwnerField {
  key: string;
  label: Record<string, string> | string;
  type: "text" | "number";
  required: boolean;
}

interface OwnerFieldsSectionProps {
  ownerFields: OwnerField[];
  answers: Record<string, string>;
  locale: string;
  onFieldChange: (key: string, value: string) => void;
}

export function OwnerFieldsSection({
  ownerFields,
  answers,
  locale,
  onFieldChange,
}: OwnerFieldsSectionProps) {
  if (!ownerFields || ownerFields.length === 0) return null;

  function getLabel(field: OwnerField): string {
    if (typeof field.label === "string") return field.label;
    return field.label[locale] ?? field.label.de ?? field.label.en ?? field.key;
  }

  return (
    <div className="bg-white rounded-2xl border-2 border-slate-200 shadow-lg overflow-hidden mb-6">
      <div className="px-6 py-4 border-b border-slate-200 bg-slate-50/50">
        <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wide flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-brand-primary-dark to-brand-primary flex items-center justify-center shadow-md">
            <User className="h-4 w-4 text-white" />
          </div>
          Angaben zur Person
        </h3>
      </div>
      <div className="p-5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {ownerFields.map((field) => {
          const answerKey = `owner.${field.key}`;
          return (
            <div key={field.key}>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                {getLabel(field)}
                {field.required && <span className="text-red-500 ml-0.5">*</span>}
              </label>
              <Input
                type={field.type === "number" ? "number" : "text"}
                value={answers[answerKey] ?? ""}
                onChange={(e) => onFieldChange(answerKey, e.target.value)}
                placeholder={getLabel(field)}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
