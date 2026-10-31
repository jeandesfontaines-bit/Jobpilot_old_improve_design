import React from 'react';

interface StatCardProps {
  label: string;
  value: React.ReactNode;
  valueClassName?: string;
}

export const StatCard: React.FC<StatCardProps> = ({ label, value, valueClassName = 'text-zinc-900' }) => (
  <div className="p-5 rounded-xl border border-zinc-200/60 bg-zinc-50">
    <p className="text-sm text-zinc-500">{label}</p>
    <p className={`text-3xl font-bold mt-2 ${valueClassName}`}>{value}</p>
  </div>
);
