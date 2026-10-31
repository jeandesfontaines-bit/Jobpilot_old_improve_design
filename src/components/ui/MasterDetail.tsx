import React from 'react';

interface MasterDetailProps {
  list: React.ReactNode;
  detail: React.ReactNode;
  mobileDetail?: boolean;
}

export const MasterDetail: React.FC<MasterDetailProps> = ({ list, detail, mobileDetail = false }) => (
  <div className="flex-1 flex overflow-hidden min-h-0 bg-[#f8f9fb]">
    <div
      className={`${
        mobileDetail ? 'hidden sm:flex' : 'flex'
      } w-full sm:w-[420px] border-r border-zinc-200/80 bg-white flex-col shrink-0 h-full`}
    >
      {list}
    </div>

    <div
      className={`${
        mobileDetail ? 'flex' : 'hidden sm:flex'
      } flex-1 bg-white overflow-hidden h-full flex-col`}
    >
      {detail}
    </div>
  </div>
);
