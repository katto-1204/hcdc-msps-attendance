import { Loader2 } from "lucide-react";

interface LoadingModalProps {
  isOpen: boolean;
  title: string;
  description?: string;
}

export function LoadingModal({ isOpen, title, description }: LoadingModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#123d30]/60 p-4 backdrop-blur-sm animate-rise-in">
      <div className="flex flex-col items-center max-w-sm w-full rounded-2xl border border-[#dbe5dd] bg-white p-8 text-center shadow-[0_24px_70px_rgba(18,61,48,0.35)]">
        <div className="relative mb-5 flex items-center justify-center">
          <div className="absolute h-16 w-16 rounded-full border-4 border-[#d8ebdd] animate-ping opacity-20" />
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[#edf4ee] text-[#174a3a] shadow-inner">
            <Loader2 className="h-7 w-7 animate-spin" />
          </div>
        </div>
        <h3 className="text-base font-bold text-[#19362b]">{title}</h3>
        {description && (
          <p className="mt-2 text-xs leading-relaxed text-[#718076]">
            {description}
          </p>
        )}
      </div>
    </div>
  );
}
